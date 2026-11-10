#!/usr/bin/env python3
"""Build a conservative Atlantic GIS archive from the captured NOAA inventory.
Run: PYTHONPATH=/path/to/pyshp-fiona-shapely python3 build.py
Fetch beforehand using fetch.py. No repository files are changed.
"""
import sys, pathlib, json, re, csv, io, zipfile, hashlib, gzip, math, importlib.util, collections, warnings
import shapefile, fiona
from shapely.geometry import shape, mapping
from shapely.validation import explain_validity, make_valid
R=pathlib.Path(__file__).resolve().parent
OLD=R
spec=importlib.util.spec_from_file_location('oldbuilder',R.parent/'build_storm_archive.py'); prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
warnings.filterwarnings('ignore', message='Possible issue encountered')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dumps(x):return json.dumps(x,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def gz(p,x):p.write_bytes(gzip.compress(dumps(x),mtime=0,compresslevel=9))
def hurdat():
 rows=iter(csv.reader((OLD/'atlantic.txt').open())); out={}
 for row in rows:
  if not row or not re.fullmatch(r'AL\d{6}',row[0].strip()):continue
  sid,name,n=row[0].strip(),row[1].strip(),int(row[2]);pts=[];status=[]
  for i in range(n):
   p=[x.strip() for x in next(rows)];lat=float(p[4][:-1])*(-1 if p[4][-1]=='S' else 1);lon=float(p[5][:-1])*(-1 if p[5][-1]=='W' else 1); wind=int(p[6]);pts.append({'time':f'{p[0][:4]}-{p[0][4:6]}-{p[0][6:]}T{p[1][:2]}:{p[1][2:]}Z','lat':lat,'lon':lon,'wind':None if wind==-999 else wind});status.append(p[3])
  out[sid]=(name,pts,sorted(set(status)))
 return out
def getreader(z,stem):
 return shapefile.Reader(shp=io.BytesIO(z.read(stem+'.shp')),shx=io.BytesIO(z.read(stem+'.shx')),dbf=io.BytesIO(z.read(stem+'.dbf')),encoding='latin1')
def pointtrack(z,sid):
 stems=[n[:-4] for n in z.namelist() if n.lower().endswith(('_pts.shp','_position.shp'))]
 if len(stems)!=1: raise ValueError('no unique point layer')
 rd=getreader(z,stems[0]);fields=[f[0] for f in rd.fields[1:]];out=[];names=[];statuses=[]
 for rec in rd.records():
  p=dict(zip(fields,rec)); basin=str(p.get('BASIN','')).upper();num=int(p['STORMNUM']);
  if basin!='AL' or num!=int(sid[2:4]):raise ValueError('point identity mismatch: '+basin+str(num))
  dt=str(p['DTG']);
  if not re.fullmatch(r'\d{10}',dt) or dt[:4]!=sid[4:]:raise ValueError('point date mismatch '+dt)
  out.append({'time':f'{dt[:4]}-{dt[4:6]}-{dt[6:8]}T{dt[8:10]}:00Z','lat':float(p['LAT']),'lon':float(p['LON']),'wind':int(p['INTENSITY']) if p['INTENSITY'] is not None and int(p['INTENSITY'])>=0 else None});names.append(str(p['STORMNAME']).strip());statuses.append(str(p['STORMTYPE']).strip())
 if not out or any(a['time']>b['time'] for a,b in zip(out,out[1:])):raise ValueError('empty or unsorted point layer')
 return next((x for x in reversed(names) if x),'UNNAMED'),out,sorted(set(statuses))
def polygonal(g):
 if g.geom_type in ('Polygon','MultiPolygon'):return g,[]
 if g.geom_type=='GeometryCollection':
  from shapely.ops import unary_union
  polys=[x for x in g.geoms if x.geom_type in ('Polygon','MultiPolygon')]; other=[x.geom_type for x in g.geoms if x.geom_type not in ('Polygon','MultiPolygon') and not x.is_empty]
  if polys:return unary_union(polys),other
 raise ValueError('repair yielded no polygons')
def convert(path,sid):
 with zipfile.ZipFile(path) as z:
  stems=[n[:-4] for n in z.namelist() if n.lower().endswith('_windswath.shp')]
  if not stems:return None,[], 'no windswath layer'
  if len(stems)!=1:raise ValueError('multiple windswath layers')
  stem=stems[0];rd=getreader(z,stem); fields=[f[0] for f in rd.fields[1:]]; raw=list(rd.iterShapeRecords())
  with fiona.Env(OGR_ORGANIZE_POLYGONS='DEFAULT'):
   with fiona.open('zip://'+str(path.resolve()),layer=stem) as source: independent=[shape(x['geometry']) for x in source]
  if len(independent)!=len(raw):raise ValueError('GDAL feature count mismatch')
  feats=[];audit=[]
  for i,(sr,gdal) in enumerate(zip(raw,independent)):
   props=dict(zip(fields,sr.record)); actual=str(props.get('STORMID','')).upper()
   if actual!=sid:raise ValueError('wind ID mismatch: '+actual+' != '+sid)
   if props.get('RADII') not in (34,50,64):raise ValueError('unknown threshold '+str(props.get('RADII')))
   # Existing validated containment-based converter; if invalid, compare independent raw readers after GEOS make_valid.
   err=None
   try: result=shape(prior.shape_geometry(sr.shape)); existing=True
   except Exception as e:err=str(e);existing=False;result=None
   source_valid=gdal.is_valid; details={'feature':i,'thresholdKt':props['RADII'],'gdal_valid':source_valid,'gdal_reason':explain_validity(gdal),'prior_error':err}
   if existing and source_valid:
    diff=gdal.symmetric_difference(result).area
    if diff>1e-8:raise ValueError('GDAL independent geometry disagreement '+str(diff))
    details.update({'method':'unmodified','reader_symmetric_difference_deg2':diff})
   else:
    # Both libraries read the original ZIP independently. Compare their own make_valid outcomes.
    pyraw=shape(sr.shape.__geo_interface__)
    a,othera=polygonal(make_valid(gdal));b,otherb=polygonal(make_valid(pyraw));
    if not a.is_valid or not b.is_valid or a.is_empty:raise ValueError('invalid repaired result')
    diff=a.symmetric_difference(b).area
    if diff>max(1e-8,a.area*1e-9):raise ValueError('independent repaired-reader disagreement '+str(diff))
    delta=abs(a.area-gdal.area);ratio=delta/max(abs(gdal.area),1e-12)
    if ratio>0.01:raise ValueError('repair net area change exceeds 1%: '+str(ratio))
    # No dateline crossing is permitted in repair path; avoids unverified wrapping.
    if a.bounds[2]-a.bounds[0]>180 or a.bounds[0]<-180 or a.bounds[2]>180:raise ValueError('repair crosses dateline or longitude bounds')
    result=a;details.update({'method':'make_valid','source_area_deg2':gdal.area,'repaired_area_deg2':a.area,'absolute_net_area_delta_deg2':delta,'relative_net_area_delta':ratio,'boundary_hausdorff_degrees':gdal.boundary.hausdorff_distance(a.boundary),'reader_repaired_symmetric_difference_deg2':diff,'discarded_nonpolygon_components_gdal':othera,'discarded_nonpolygon_components_pyshp':otherb})
   if result.is_empty or not result.is_valid:raise ValueError('invalid emitted geometry')
   feats.append({'type':'Feature','properties':props,'geometry':mapping(result)});audit.append(details)
  if not feats:return None,audit,'empty windswath layer'
  return {'type':'FeatureCollection','features':feats},audit,None

def main():
 sources=json.loads((R/'sources.json').read_text()); pinned_audit=json.loads((R/'audit.json').read_text());
 if digest(OLD/'atlantic.txt')!=pinned_audit['hurdat_sha256']:raise ValueError('HURDAT checksum mismatch')
 
 for sid,info in sources['archives'].items():
  p=R/'zips'/(sid+'.zip')
  if not info.get('sha256') or not p.exists() or digest(p)!=info['sha256']:raise ValueError('ZIP missing or checksum mismatch: '+sid)
 storms=hurdat(); output=R/'output';swdir=output/'swaths';swdir.mkdir(parents=True,exist_ok=True)
 for f in swdir.glob('*.bin'):f.unlink()
 track={};cat=[];audit=[]
 for sid,source in sorted(sources['archives'].items()):
  path=R/'zips'/(sid+'.zip');row={'id':sid,'url':source['url'],'sha256':source.get('sha256'),'classification':'unavailable'};pts=None
  if sid in storms:
   name,pts,status=storms[sid];track_source='HURDAT2 final'
   row.update({'name':name,'status_values':status,'track_source':track_source})
  try:
   if not path.exists():raise ValueError('archive unavailable: '+source.get('error','missing file'))
   if digest(path)!=source.get('sha256'):raise ValueError('ZIP checksum differs from fetch ledger')
   with zipfile.ZipFile(path) as z:
    # Always validate source point identity, even when using HURDAT.
    gisname,gispts,gisstatus=pointtrack(z,sid)
   if sid in storms:name,pts,status=storms[sid];track_source='HURDAT2 final';name=name if name not in ('UNNAMED','NOT NAMED') else gisname
   else:name,pts,status=gisname,gispts,gisstatus;track_source='NHC GIS points; preliminary unless independently confirmed final'
   row.update({'name':name,'gis_name':gisname,'status_values':status,'track_source':track_source})
   sw,details,reason=convert(path,sid);row['features']=details
   if sw:
    row['classification']='repaired' if any(x['method']=='make_valid' for x in details) else 'usable';gz(swdir/(sid+'.bin'),sw)
   else:row['reason']=reason
  except Exception as e:row['reason']=str(e)
  if pts and row['classification'] in ('usable','repaired'):
   track[sid]=pts; winds=[p['wind'] for p in pts if p['wind'] is not None]
   cat.append({'id':sid,'name':name,'year':int(sid[4:]),'basin':'AL','start':pts[0]['time'],'end':pts[-1]['time'],'peakWindKt':max(winds) if winds else None,'hasSwath':row['classification'] in ('usable','repaired'),'trackSource':track_source,'statusValues':status,'swathQuality':row['classification']})
  audit.append(row)
 expected={r['id']:r['classification'] for r in pinned_audit['rows']}
 if {r['id']:r['classification'] for r in audit} != expected:raise ValueError('snapshot classifications differ from pinned audit')
 cat.sort(key=lambda x:(-x['year'],x['id']));gz(output/'tracks.bin',track);(output/'catalog.json').write_bytes(dumps({'storms':cat,'throughYear':max((x['year'] for x in cat),default=None)})+b'\n')
 report={'scope':'All exact Atlantic *_best_track.zip links in captured NOAA index; not all NHC storms or standalone products','index_sha256':sources['index_sha256'],'hurdat_sha256':digest(OLD/'atlantic.txt'),'counts':dict(collections.Counter(x['classification'] for x in audit)),'index_count':len(sources['archives']),'catalog_count':len(cat),'rows':audit}
 (output/'audit.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n'); print(json.dumps({k:v for k,v in report.items() if k!='rows'},indent=2));print('failures',[(x['id'],x.get('reason')) for x in audit if x['classification']=='unavailable'])
if __name__=='__main__':main()

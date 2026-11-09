#!/usr/bin/env python3
"""Rebuild the display-only Florida Census extract from official source files.

python3 -m pip install pyshp==3.1.8
python3 scripts/build_tracts.py /path/to/cache
"""
import csv, gzip, io, json, pathlib, re, sys, urllib.request, zipfile
import shapefile
cache=pathlib.Path(sys.argv[1]); cache.mkdir(parents=True,exist_ok=True)
urls={'cb_2025_12_tract_500k.zip':'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_12_tract_500k.zip','acsdt5y2024-b25001.dat':'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25001.dat'}
for name,url in urls.items():
 path=cache/name
 if not path.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=180) as response, path.open('wb') as out:
   while block:=response.read(1024*1024):out.write(block)
with (cache/'acsdt5y2024-b25001.dat').open(newline='') as f:
 acs={r['GEO_ID'][9:]:r for r in csv.DictReader(f,delimiter='|') if r['GEO_ID'].startswith('1400000US12')}
z=zipfile.ZipFile(cache/'cb_2025_12_tract_500k.zip'); names=z.namelist()
def read(ext): return io.BytesIO(z.read(next(x for x in names if x.endswith(ext))))
r=shapefile.Reader(shp=read('.shp'),shx=read('.shx'),dbf=read('.dbf'))
features=[]; ids=set()
for sr in r.iterShapeRecords():
 geo=sr.record.as_dict()['GEOID']; assert re.fullmatch(r'12\d{9}',geo) and geo not in ids and geo in acs; ids.add(geo)
 row=acs[geo]; val=int(row['B25001_E001']); moe=int(row['B25001_M001']); assert val>=0
 features.append({'type':'Feature','id':geo,'properties':{'geoid':geo,'county_fips':geo[:5],'housing_units_estimate':val,'housing_units_moe_90':moe if moe>=0 else None},'geometry':sr.shape.__geo_interface__})
features.sort(key=lambda x:x['id']); assert len(ids)==5122 and sum(f['properties']['housing_units_estimate'] for f in features)==10256470
assert all(int(acs[x]['B25001_E001'])==0 for x in set(acs)-ids)
output=pathlib.Path(__file__).resolve().parents[1]/'public/data/fl-tracts.bin'
payload=json.dumps({'type':'FeatureCollection','features':features},separators=(',',':'),ensure_ascii=False).encode()
with output.open('wb') as f:
 with gzip.GzipFile(filename='',mode='wb',fileobj=f,mtime=0,compresslevel=9) as g:g.write(payload)
print(f'{len(features)} tracts; {len(payload)} uncompressed bytes; {output.stat().st_size} compressed bytes')

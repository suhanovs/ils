#!/usr/bin/env python3
import pathlib,json,gzip,hashlib,re,collections
from shapely.geometry import shape
r=pathlib.Path(__file__).resolve().parent
sources=json.loads((r/'sources.json').read_text());audit=json.loads((r/'output/audit.json').read_text());cat=json.loads((r/'output/catalog.json').read_text());tracks=json.loads(gzip.decompress((r/'output/tracks.bin').read_bytes()))
index=set(sources['archives'])
assert index==set(sources['archives'])=={x['id'] for x in audit['rows']}
assert len({x['id'] for x in cat['storms']})==len(cat['storms'])==len(tracks)
assert set(tracks)=={x['id'] for x in cat['storms']}
files={p.stem for p in (r/'output/swaths').glob('*.bin')};expected={x['id'] for x in audit['rows'] if x['classification'] in ('usable','repaired')};assert files==expected=={x['id'] for x in cat['storms'] if x['hasSwath']}
assert all(x['id'].startswith('AL') for x in cat['storms'])
for sid,info in sources['archives'].items():
 p=r/'zips'/f'{sid}.zip'
 if info.get('sha256'):assert hashlib.sha256(p.read_bytes()).hexdigest()==info['sha256']
for sid in files:
 fc=json.loads(gzip.decompress((r/'output/swaths'/f'{sid}.bin').read_bytes()));assert fc['features']
 for f in fc['features']:
  assert str(f['properties']['STORMID']).upper()==sid
  assert f['properties']['RADII'] in (34,50,64)
  g=shape(f['geometry']);assert g.is_valid and not g.is_empty
for sid,pts in tracks.items():
 assert pts and all(-90<=p['lat']<=90 and -180<=p['lon']<=180 for p in pts)
 assert all(a['time']<=b['time'] for a,b in zip(pts,pts[1:]))
for row in audit['rows']:
 if row['classification']=='repaired':
  for f in row['features']:
   if f['method']=='make_valid':assert f['reader_repaired_symmetric_difference_deg2']<=max(1e-8,f['repaired_area_deg2']*1e-9) and f['relative_net_area_delta']<=.01
assert next(x for x in audit['rows'] if x['id']=='AL162016')['classification']=='unavailable'
assert next(x for x in audit['rows'] if x['id']=='AL092017')['classification']=='repaired'
assert all('preliminary' in x['trackSource'] for x in cat['storms'] if x['year']==2026)
print('PASS',len(index),'index IDs;',len(cat['storms']),'catalog;',len(files),'swaths;',dict(collections.Counter(x['classification'] for x in audit['rows'])))

published=r.parent.parent/'public/data/storms'
assert json.loads((published/'catalog.json').read_text())==cat
assert json.loads(gzip.decompress((published/'tracks.bin').read_bytes()))==tracks
assert {p.stem for p in (published/'swaths').glob('*.bin')}==files
for sid in files:
 assert json.loads(gzip.decompress((published/'swaths'/f'{sid}.bin').read_bytes()))==json.loads(gzip.decompress((r/'output/swaths'/f'{sid}.bin').read_bytes()))
print('PASS published assets semantically match rebuilt snapshot')

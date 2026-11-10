#!/usr/bin/env python3
"""Download pinned NOAA inputs; never overwrite the source ledger."""
import hashlib, json, pathlib, time, urllib.request

root = pathlib.Path(__file__).resolve().parent
sources = json.loads((root / 'sources.json').read_text())
audit = json.loads((root / 'audit.json').read_text())

def fetch(url, target, expected):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'NOAA archive research'}), timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != expected:
            raise SystemExit(f'Checksum mismatch: {url}; snapshot may have changed')
        target.write_bytes(data)
        time.sleep(.2)
    if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Checksum mismatch: {target}')

fetch('https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-092326.txt', root / 'atlantic.txt', audit['hurdat_sha256'])
for sid, info in sorted(sources['archives'].items()):
    if not info.get('sha256'):
        raise SystemExit(f'No pinned checksum for {sid}')
    fetch(info['url'], root / 'zips' / f'{sid}.zip', info['sha256'])
print('Pinned inputs verified:', len(sources['archives']), 'ZIPs and HURDAT2')

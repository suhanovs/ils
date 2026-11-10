# NOAA historical hurricane archive

This snapshot contains all 1,582 storms in the pinned Atlantic and northeast/north-central Pacific HURDAT2 best-track files with at least one HU-status observation: 979 AL, 569 EP, 34 CP, 1851–2025. All storm phases in their tracks are included. It is not a complete inventory of 2026 events; no preliminary storms have been inferred or appended. Historical best tracks are estimates, not ground observations everywhere, forecasts, damage estimates, or a life-safety product.

## Sources and reproducibility

NOAA/National Hurricane Center HURDAT2: https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-092326.txt and https://www.nhc.noaa.gov/data/hurdat/hurdat2-nepac-1949-2025-092926.txt . Swaths: NOAA/NHC GIS best-track archives, https://www.nhc.noaa.gov/gis/best_track/ . `scripts/build_storm_archive.py` embeds the exact URLs and SHA-256 digests for both HURDAT files and all 299 matched, original NHC ZIPs; no generated GeoJSON is a source. NOAA's subsequent updates, changed files or an unavailable upstream will cause a checksum/download failure rather than silently change the snapshot. No third-party attribution requirement is implied by this description.

Rebuild from the `v2` directory, with Python 3. Use an empty external cache to fetch the pinned files or provide a cache with `atlantic.txt`, `pacific.txt` and `zips/ID.zip`:

```sh
python3 -m venv /path/to/storm-venv
/path/to/storm-venv/bin/pip install 'pyshp==3.1.8' 'shapely==2.2.0' 'fiona==1.10.1'
/path/to/storm-venv/bin/python scripts/build_storm_archive.py --cache /path/to/storm-source-cache
node --test test/storm-data.test.js
```

The validated run used Fiona 1.10.1/GDAL 3.9.2. Platform GEOS/GDAL variations could affect geometry validation and gzip implementations can affect compressed bytes; use the same stack to reproduce exact bytes. Script output lists every rejected ID and reason. It checks every source hash before use. The embedded manifest, not the current GIS index, fixes membership. Network fetch of 299 ZIPs is potentially slow and subject to NOAA rate limits; stop and retry if blocked. Do not delete the source cache until the archive has been preserved elsewhere.

## Contract and limitations

- `public/data/storms/catalog.json` is `{storms, throughYear}` sorted by descending year then ID. Each entry has `id`, `name`, `year`, `basin`, `start`, `end`, `peakWindKt`, and `hasSwath`.
- `tracks.bin` is gzip-compressed JSON mapping every ID to chronologically ordered `{time,lat,lon,wind}` observations. Times are UTC; wind is maximum sustained wind in knots, with unknown values `null`, not zero. The entire storm history is retained rather than only HU observations.
- `swaths/ID.bin` is gzip-compressed GeoJSON FeatureCollection from NHC's actual cumulative best-track windswath layer, retaining source properties including `RADII` thresholds 34, 50, and 64 knots. Swaths represent storm-lifetime extents, not time-specific winds. Do not treat them as measured damage or animate them as instantaneous footprints. `hasSwath:false` means unavailable or rejected, not zero wind. No swaths are reconstructed from radii.
- 299 source ZIPs match hurricane IDs. Two lack a windswath (AL041980 and AL111989); 297 contain one. Of those, 259 passed all gates; 38 were rejected, leaving 1,323 catalogue storms with unavailable swaths. Missing coverage includes virtually all older storms and some major storms, e.g. Harvey (AL092017); the archive is complete only for hurricane tracks in the pinned HURDAT2 snapshot, not for windswaths.

## Geometry gate

Read original SHP parts and DBF attributes, never pyshp's orientation-dependent `__geo_interface__`. Normalize/unwrap longitudes, derive shell/hole relationships by geometric containment and parity, validate rings and polygons with GEOS/Shapely, split at the antimeridian and verify area conservation. No simplification or geometry repair is performed. Fiona/GDAL independently reads each original shapefile with `OGR_ORGANIZE_POLYGONS=DEFAULT`; require equal feature counts, valid GDAL geometries and per-feature symmetric-difference area at most 1e-8 square degrees. Dateline representations can disagree in planar coordinates: reject such a swath rather than assume equivalence. The process rejects the entire storm on any ambiguity or invalidity. This is a conservative topology and comparison gate, not independent meteorological verification.

For Ian (AL092022), Katrina (AL122005), Irma (AL112017), Ida (AL082021), and Ivan (AL092004), independent GDAL feature counts matched and each corresponding feature had zero symmetric-difference area. All 259 included swaths passed the same comparison. Source issue groups: 35 invalid/self-intersecting ring layers; AL162016 has an inconsistent STORMID attribute; EP052023 and EP072014 disagree with the independently interpreted GDAL geometry. No source geometry was silently repaired. The latter two may be representational differences, including antimeridian handling; they remain unavailable until independently resolved.

Validation-run output: 27,702,822 bytes in 261 files, including the 259 swaths, catalogue and compressed track dictionary. Archive SHA-256 over sorted relative path bytes + NUL + file content for each file: `dbe9d1236e4bd725e5bc415742fa42e285c6e58800d8e053bd076d57f937c166`.

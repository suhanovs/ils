# Atlantic NHC storm swath snapshot

The public archive contains 311 Atlantic events with validated NHC GIS windswaths, from the captured November 10, 2026 NHC GIS best-track directory. It is complete only for the exact indexed ZIP inventory assessed in this snapshot, **not** all historical storms, all NHC products, or later releases. Some events are tropical or subtropical storms, not hurricanes. The snapshot includes 288 unmodified and 23 conservatively repaired swaths, including Harvey (AL092017). Of 334 distinct indexed IDs, 22 have no swath layer and Otto (AL162016) fails identity checks: its points and swath are labeled EP22 and its swath SHP matched the cached EP222016 SHP byte-for-byte. Otto is excluded rather than falsely attributed. Every excluded ID and reason is in `scripts/storm-snapshot/audit.json`.

The 335 exact Atlantic ZIP links included case variants of AL042025; the selected lowercase archive has a swath, the uppercase alternative does not. Their URLs and hashes are recorded in `sources.json`. Indexed standalone Atlantic swath KMZ IDs were already represented by the ZIP inventory; `_best_track_latest` duplicate variants were not separately evaluated. Previously cached ZIPs were hashed but not independently redownloaded, so this is a reproducible cache snapshot, not proof of the latest version at each URL.

## Provenance and limitations

The archive uses HURDAT2 Atlantic tracks where available and NHC GIS point records otherwise. Ten indexed 2026 events use GIS points, labeled preliminary in the UI; GIS-only tracks may be advisory, can change, and should not be represented as final best tracks. Each catalogue entry has `trackSource`, `statusValues` and `swathQuality` in addition to its existing fields. The HURDAT2 and GIS swath releases may differ. Swaths are cumulative source geometry at 34, 50 and 64 knots, not instantaneous winds, damage observations, or a life-safety product; unavailable data is not zero wind. No footprint is inferred from tracks.

`catalog.json` is sorted by descending year and ID; all entries have an AL ID and `hasSwath:true`. `tracks.bin` is gzip JSON keyed by ID; each `swaths/ID.bin` is gzip GeoJSON with source ID and threshold attributes. Status values are source codes, not a claim of hurricane status. Tracks retain the whole event. Source data is not bundled as ZIPs or raw HURDAT.

## Reproduce and verify

`scripts/storm-snapshot/sources.json` pins URLs and SHA-256 for all 334 chosen GIS ZIPs and the captured index hash; `audit.json` pins the HURDAT hash and includes individual feature and exclusion details. Network retrieval can be slow, blocked, or fail if NOAA changes a file; a hash mismatch stops the process, rather than silently updating the snapshot. The archive index itself is not bundled. The older `scripts/build_storm_archive.py` is retained as a geometry-function dependency and historical builder, not the builder for this snapshot.

From `v2`:

```sh
python3 -m venv .storm-venv
.storm-venv/bin/pip install 'pyshp==3.1.8' 'shapely==2.2.0' 'fiona==1.10.1'
.storm-venv/bin/python scripts/storm-snapshot/fetch.py
.storm-venv/bin/python scripts/storm-snapshot/build.py
.storm-venv/bin/python scripts/storm-snapshot/verify.py
node --test test/storm-data.test.js
```

The tested geometry stack used Fiona 1.10.1/GDAL 3.9.2 and Shapely 2.2.0. Downloaded inputs and regenerated output live in ignored `scripts/storm-snapshot/` paths; rebuild does not overwrite public assets or the pinned audit. Verification compares generated assets semantically to public files. Platform GEOS/GDAL differences may affect geometry validation and compressed bytes.

## Geometry gate

Pyshp and GDAL/Fiona independently read each original file. Valid source geometries use the existing ring-containment and antimeridian converter and must agree with GDAL within 1e-8 square degrees of symmetric-difference area. When conversion fails or GDAL finds invalid geometry, GEOS `make_valid` is applied independently to both reads; polygonal outputs must be nonempty, valid, agree within max(1e-8 square degrees, 1e-9 of repaired area), stay within longitude bounds without spanning over 180 degrees, and change net area by at most 1%. Multipart polygons and holes are retained; discarded non-polygon linework, original validity reason, area change, and boundary Hausdorff distance are recorded per feature. These planar metrics are topology QA, not physical-area estimates or proof of meteorological accuracy; net area alone cannot establish absence of spatial change.

Old production object-store keys should be retained during any eventual rollout to protect clients using cached prior assets. This local change does not deploy or delete remote objects.

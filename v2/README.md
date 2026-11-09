# Storm Atlas — phase 1

A self-contained historical map for Hurricane Ian (AL092022). This is a separate Vite application; it does not change the existing V1 app. No live storm data or future phases are implemented.

## Run and test

Requires Node.js 20+. From this directory:

```sh
npm ci
npm run dev
npm test
npx playwright install chromium   # first time only
npx playwright test
npm run build
```

The dev URL is printed by Vite and includes `/v2/`. Serve the contents of `dist/` at `/v2/`; the host must preserve the existing V1 routes and serve `/v2/index.html` for `/v2/`. Building does not deploy. OpenStreetMap basemap tiles and optional Google Fonts require a network connection; storm features are bundled locally. The NOAA archive link may occasionally be blocked by a network or browser security gateway.

## Data and interpretation

The checked-in GeoJSON is converted directly from the NOAA National Hurricane Center [Ian 2022 best-track GIS archive](https://www.nhc.noaa.gov/gis/archive_besttrack_results.php?id=al09&name=Hurricane+IAN&year=2022); the [source ZIP](https://www.nhc.noaa.gov/gis/best_track/al092022_best_track.zip) is `al092022_best_track.zip`, SHA-256 `46c592e1f83b337934837d8ed277ffe1d517449179b0fc559d3822a2db9a20e0`. The ZIP files are dated April 3, 2023. It contains 36 points, 14 line features, and six wind-swath polygon features (two at 34 kt, one at 50 kt, three at 64 kt). All geometries and attributes are retained, converted from the shapefile using pyshp's GeoJSON interface without simplification. Coordinates remain WGS 84. The swath covers September 22 18:00 UTC through October 1 06:00 UTC, 2022. Source GIS XML metadata accompanies the original ZIP.

The wind polygons are **cumulative for the whole storm**, regardless of which track point is selected. NOAA's supplied wind-swath metadata describes the areas potentially affected, based on the maximum possible extent of each wind threshold within storm quadrants; not every place inside experienced that wind speed. Best-track radii and track are estimates, not measurements at every location; the NOAA metadata recommends analysis at national or large regional scales (approximately 1:2,000,000), not parcel scale. The highlighted point is an available best-track observation, not a live position; the timeline does not animate the wind field. Speeds on the timeline are the point's `INTENSITY` in knots. Basemap © OpenStreetMap contributors, as attributed on the map.

To reproduce the conversion, download and extract the source ZIP, install `pyshp`, and run from this directory:

```sh
python scripts/convert.py /path/to/extracted-zip public/data
```

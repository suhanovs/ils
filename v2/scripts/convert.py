"""Convert the three original NOAA shapefiles to unsimplified GeoJSON."""
import json
import sys
from pathlib import Path

import shapefile

source, destination = map(Path, sys.argv[1:3])
destination.mkdir(parents=True, exist_ok=True)
for name in ("pts", "lin", "windswath"):
    reader = shapefile.Reader(str(source / f"AL092022_{name}.shp"))
    features = [{"type": "Feature", "geometry": record.shape.__geo_interface__,
                 "properties": record.record.as_dict()}
                for record in reader.iterShapeRecords()]
    with (destination / f"ian-{name}.geojson").open("w") as output:
        json.dump({"type": "FeatureCollection", "features": features}, output,
                  separators=(",", ":"))

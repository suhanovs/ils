# Data

Source files live in the S3 bucket **`about-ils`** and are pulled locally only for the
offline build step. The app itself does **not** fetch from S3 at runtime — instead the
build pipeline produces a small bundled JSON (`src/data/ilsData.json`, ~15 KiB) that ships
inside the static app.

## Files

### `emdat.csv` (S3: `s3://about-ils/emdat.csv`, ~19 MB, Latin-1)
Full EM-DAT export. The pipeline filters:

- `Country` == `United States of America`
- `Disaster Subtype` == `Tropical cyclone`
- loss quantum = `Insured Damage, Adjusted ('000 US$)` (thousands USD -> converted to USD millions)

Yields **53 events with insured-adjusted damage (1991–2024)**. Covered states
(FL, GA, NC, SC, LA, TX) are detected from the `Location` string.

> Not tracked in git (large). Pull with:
> `aws s3 cp s3://about-ils/emdat.csv data/emdat.csv`

### `rol.csv` (S3: `s3://about-ils/rol.csv`, ~1.5 KB)
Annual US property-cat market history, 1990–2026:

| col | meaning | units |
|-----|---------|-------|
| 0 | year | |
| 1 | US total TC damage (NOAA) | USD bn |
| 2 | US insured TC damage (EM-DAT) | USD bn |
| 3 | US insured all-peril damage (EM-DAT) | USD bn |
| 4 | US property-cat ROL index (1990=100) | index |
| 6 | ROL multiple @ 5% EL (junior) | x |
| 7 | ROL multiple @ 2% EL (mid) | x |
| 8 | ROL multiple @ 1% EL (remote) | x |

ROL multiples populated 2001–2024. Used to infer the loss -> ROL -> multiple cycle.

## Build the bundled JSON

```bash
python3 scripts/build_data.py
```

Writes `src/data/ilsData.json`. Cross-check: annual aggregates derived from `emdat.csv`
match the `US insured TC damage, EM-DAT` column in `rol.csv` (e.g. 2005 = 136 bn).

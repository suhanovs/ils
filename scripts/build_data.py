#!/usr/bin/env python3
"""
Build bundled data JSON for the ILS visualizer from raw EM-DAT + ROL CSVs.

Inputs (default ./data):
  - emdat.csv : EM-DAT export (Latin-1). We keep Country == 'United States of America'
                and Disaster Subtype == 'Tropical cyclone', using
                'Insured Damage, Adjusted (000 US$)' as the loss quantum (thousands USD).
  - rol.csv   : annual US property-cat ROL index and ROL multiples at 5%/2%/1% EL,
                plus annual EM-DAT insured TC losses (USD billions).

Output:
  - src/data/ilsData.json  (small, bundled into the app build)

The output is intentionally compact and self-describing so the TypeScript
engine can consume it directly without re-parsing CSVs in the browser.
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(ROOT, "data")
OUT_DIR = os.path.join(ROOT, "src", "data")
OUT_PATH = os.path.join(OUT_DIR, "ilsData.json")

# Covered states for the simulator (1 state == 1 cedent/insurer).
COVERED = {
    "FL": ["florida"],
    "GA": ["georgia"],
    "NC": ["north carolina"],
    "SC": ["south carolina"],
    "LA": ["louisiana"],
    "TX": ["texas"],
}


def col_index(header, predicate):
    for i, h in enumerate(header):
        if predicate(h):
            return i
    raise KeyError("column not found")


def detect_states(location: str):
    loc = location.lower()
    hit = []
    for code, names in COVERED.items():
        if any(n in loc for n in names):
            hit.append(code)
    return hit


def parse_emdat(path):
    with open(path, newline="", encoding="latin-1") as f:
        r = csv.reader(f)
        header = next(r)
        rows = list(r)

    c_country = col_index(header, lambda h: h.strip() == "Country")
    c_subtype = col_index(header, lambda h: h.strip() == "Disaster Subtype")
    c_year = col_index(header, lambda h: h.strip() == "Start Year")
    c_loc = col_index(header, lambda h: h.strip() == "Location")
    c_name = col_index(header, lambda h: h.strip() == "Event Name")
    c_insadj = col_index(
        header,
        lambda h: "insured damage" in h.lower().replace("\n", " ")
        and "adjusted" in h.lower().replace("\n", " "),
    )

    events = []
    for row in rows:
        if len(row) <= max(c_insadj, c_loc):
            continue
        if row[c_country].strip() != "United States of America":
            continue
        if row[c_subtype].strip().lower() != "tropical cyclone":
            continue
        raw = row[c_insadj].strip()
        if raw in ("", "-"):
            continue
        try:
            thousands = float(raw)
        except ValueError:
            continue
        if thousands <= 0:
            continue
        loss_musd = thousands / 1000.0  # thousands USD -> millions USD
        states = detect_states(row[c_loc].strip())
        events.append(
            {
                "year": int(row[c_year].strip()),
                "name": (row[c_name].strip() or None),
                "lossMusd": round(loss_musd, 3),
                "states": states,
                "location": row[c_loc].strip()[:240],
            }
        )

    events.sort(key=lambda e: (e["year"], -e["lossMusd"]))
    return events


def num(v):
    v = (v or "").strip()
    if v in ("", "-"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def parse_rol(path):
    with open(path, newline="", encoding="latin-1") as f:
        r = csv.reader(f)
        rows = list(r)
    # Header layout (by position):
    # 0 year, 1 NOAA total TC (bn), 2 EM-DAT insured TC (bn),
    # 3 EM-DAT insured all-peril (bn), 4 ROL index, 5 blank,
    # 6 multiple@5%EL(junior), 7 multiple@2%EL(mid), 8 multiple@1%EL(remote)
    out = []
    for row in rows[1:]:
        if not row or not row[0].strip().isdigit():
            continue
        out.append(
            {
                "year": int(row[0].strip()),
                "noaaTcBn": num(row[1]) if len(row) > 1 else None,
                "insuredTcBn": num(row[2]) if len(row) > 2 else None,
                "insuredAllPerilBn": num(row[3]) if len(row) > 3 else None,
                "rolIndex": num(row[4]) if len(row) > 4 else None,
                "multJunior5": num(row[6]) if len(row) > 6 else None,
                "multMid2": num(row[7]) if len(row) > 7 else None,
                "multRemote1": num(row[8]) if len(row) > 8 else None,
            }
        )
    return out


def empirical_summary(events):
    losses = sorted(e["lossMusd"] for e in events)
    n = len(losses)

    def pct(p):
        if n == 0:
            return None
        idx = min(n - 1, int(round(p / 100.0 * (n - 1))))
        return losses[idx]

    return {
        "count": n,
        "minMusd": losses[0] if n else None,
        "p25Musd": pct(25),
        "medianMusd": pct(50),
        "meanMusd": round(sum(losses) / n, 3) if n else None,
        "p75Musd": pct(75),
        "p90Musd": pct(90),
        "p99Musd": pct(99),
        "maxMusd": losses[-1] if n else None,
    }


def main():
    emdat = parse_emdat(os.path.join(DATA_DIR, "emdat.csv"))
    rol = parse_rol(os.path.join(DATA_DIR, "rol.csv"))

    # annual aggregate insured TC loss from events (USD billions) for cross-checks
    agg = {}
    for e in emdat:
        agg[e["year"]] = agg.get(e["year"], 0.0) + e["lossMusd"] / 1000.0
    annual = [
        {"year": y, "insuredTcBn": round(agg[y], 3)} for y in sorted(agg)
    ]

    bundle = {
        "meta": {
            "source": "EM-DAT (US tropical cyclone, insured-damage-adjusted) + ROL history",
            "units": {
                "lossMusd": "USD millions",
                "bn": "USD billions",
            },
            "coveredStates": list(COVERED.keys()),
            "emdatEventCount": len(emdat),
            "rolYears": [rol[0]["year"], rol[-1]["year"]] if rol else None,
        },
        "severity": empirical_summary(emdat),
        "events": emdat,
        "annualAggregate": annual,
        "rolHistory": rol,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(bundle, f, separators=(",", ":"), ensure_ascii=False)

    size = os.path.getsize(OUT_PATH)
    print(f"Wrote {OUT_PATH}")
    print(f"  events: {len(emdat)}  rolYears: {len(rol)}  size: {size/1024:.1f} KiB")
    print(
        "  severity (USD m): median %.0f  mean %.0f  max %.0f"
        % (
            bundle["severity"]["medianMusd"],
            bundle["severity"]["meanMusd"],
            bundle["severity"]["maxMusd"],
        )
    )
    # state coverage diagnostics
    no_state = [e for e in emdat if not e["states"]]
    print(f"  events touching >=1 covered state: {len(emdat)-len(no_state)} / {len(emdat)}")


if __name__ == "__main__":
    sys.exit(main())

# ILS Simulator

This README focuses on two things:

1. model/data assumptions and pricing/selection behavior
2. user manual for running scenarios in the app

## 1) Assumptions and Model Behavior

### Data assumptions

- Event source: EM-DAT tropical cyclone insured losses, filtered to US and mapped to covered states.
- Each sampled event keeps its covered-state footprint, then allocates loss across those states with randomized weights.
- State-level season loss is used for EL regime updates and state charts.
- Materiality filter: state damage below 10% of that state's `PML_100` does not trigger EL/ROL ratchet-up.

### Layering and deal assumptions

- Towers are built per state with three tiers: junior, mid, remote.
- Portfolio writes junior and mid only; remote is excluded from deployment.
- Trapping takes investor capital offline for the trap term; it does not remove the underlying layer from future eligibility.

### EL assumptions

- EL is state-dynamic, not directly user-entered in config.
- Junior EL regime:
  - FL: 30% to 50%, step 10%
  - LA: 20% to 40%, step 5%
  - TX/NC/SC/GA/AL/MS: 10% to 30%, step 5%
- Mid EL regime:
  - FL/LA: 8% to 15%, starts at 10%, step 2%
  - NC/SC/GA: 4% to 10%, starts at 6%, step 2%
  - TX/AL/MS: 2% to 8%, starts at 5%, step 2%
- Ratchet behavior:
  - hit season (material state damage): EL steps up by one step
  - quiet season: EL steps down by one step

### ROL and pricing assumptions

- Per layer: `ROL = EL * multiple`, then capped by tier guardrails.
- Guardrails:
  - junior ROL cap 60%
  - mid ROL cap 35%
  - remote ROL cap 20% (reference only)
- Multiples harden only when aggregate industry loss is worse than the previous season.
- In non-worsening years, multiples mean-revert toward base via decay.

### Selection behavior assumptions

- Selection is waterfall by economics for junior and mid (higher ROL first).
- Randomness is only used for tie-breaking when economics are equal.
- Hard constraint: first written layer is always a Florida junior layer when available.

### Capital/net worth assumptions

- `initialCapitalMusd` is interpreted as starting net worth.
- A target `deploymentFraction` of net worth is allocated to ILS each season.
- Unallocated wealth sits in a safe bucket, earns RFR, and is never exposed to cat loss.
- `deployAfterRuin` controls whether target deployment continues after ILS breach of ruin threshold.
- `keepIlsBalanced` controls harvesting from profitable ILS years to keep ILS share near target.

## 2) User Manual

### Running the app

- Open the deployed app and it auto-runs a default single simulation on load.
- Use mode buttons:
  - `Single Run` for one path with detailed panels
  - `Simulations` for Monte Carlo (configured run count)
- Click `Run` to rerun with current parameters.

### Header controls

- `No-trap`: comparison overlay with trapping disabled.
- `Log equity axis`: toggles equity chart Y-axis to log scale.
- Right-side links:
  - `Readme` (this file)
  - `Source` (repo)
  - `Data` (S3 data bucket)

### Key panels

- Equity chart:
  - Single run: main equity path and optional comparison overlay.
  - MC: fan chart plus all negative terminal-outcome paths in red, unsmoothed.
- Market cycle:
  - State dropdown controls both top and bottom charts in simulated mode.
  - Top: state loss bars + junior/mid ROL by season.
  - Bottom: state junior/mid EL by season.
- Layer Status Grid:
  - shows per-season deal states (`OK`, `IBNR`, `PART`, `LOSS`) and ROL.
- Season Log:
  - seasonal bridge: start equity, premium, interest, loss, trapped, released, end equity, event details.

### Practical calibration workflow

- Start with default 10 seasons and $1M net worth.
- Use deployment share first to adjust growth/volatility tradeoff.
- Use state PML and attachment settings to tune loss frequency.
- Use cycle sensitivity/norm/decay to tune hardening and mean reversion speed.

### Repo and deploy notes

- Type-check: `npx tsc -b --noEmit`
- Build: `npx vite build`
- Deploy: `aws s3 sync dist/ s3://about-ils-site/ --delete --cache-control "max-age=0"`

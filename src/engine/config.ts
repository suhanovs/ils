/**
 * SimConfig — every "random" or "temporal" parameter the user can configure.
 *
 * This is the single source of truth for all simulation parameters.
 * The UI binds to this type; the engine reads it as read-only.
 *
 * Separation of concerns: this file defines *what can be tuned*.
 * Nothing here contains simulation logic.
 */

import type { State } from './types'

// ── Frequency model ────────────────────────────────────────────────────────

export type FrequencyModel = 'poisson' | 'negbinom' | 'cox'

export interface FrequencyConfig {
  model: FrequencyModel
  /** Mean annual TC landfalls affecting covered region */
  meanAnnual: number
  /** Negative-binomial dispersion k (variance = mean + mean²/k). Higher k → Poisson-like */
  negbinomDispersion: number
  /** Cox (doubly-stochastic) state multipliers: [El Niño, Neutral, La Niña] */
  coxStateMultipliers: [number, number, number]
  /** Cox transition matrix rows = [from El Niño, from Neutral, from La Niña] */
  coxTransitionMatrix: [[number, number, number], [number, number, number], [number, number, number]]
}

// ── Severity / tower ──────────────────────────────────────────────────────

export interface SeverityConfig {
  /**
   * State-level total-market PML_100 in USD millions.
   * Normalises EM-DAT industry losses → per-cedent GU loss fraction.
   *
   * Calibration target: junior attachment (pml20 × juniorAttachRetention)
   * should be breached ~7–15% of years per state, i.e. a 1-in-7 to 1-in-15
   * annual exceedance probability — consistent with "1-in-10 or 1-in-15 PML"
   * junior attachment language.
   *
   * Rule of thumb: statePML100 ≈ (largest historical state event loss) /
   *                               (desired layer exhaustion fraction, ~1.0–1.5).
   * FL: Katrina FL-share ~$25–40B at 100% exhaustion → 120 000 $M.
   */
  statePML100Musd: Record<State, number>
  /**
   * Each cedent represents this fraction of their state's insured market.
   * cedentPML100 = statePML100 × marketShareFraction × exposureScale
   */
  marketShareFraction: number
  /** Cedent exposure scale range [min, max] — random uniform per cedent */
  exposureScaleRange: [number, number]
  /**
   * PML_20 as fraction of PML_100.
   * This is the EXHAUSTION point of the junior layer and the ATTACHMENT
   * of the mid layer.  PML_20 / PML_100 ≈ 0.28–0.35 from historical data.
   */
  pml20FracCentre: number
  pml20FracJitter: number
  /**
   * PML_50 as fraction of PML_100 — exhaustion of mid layer.
   */
  pml50FracCentre: number
  pml50FracJitter: number
  /**
   * Junior layer ATTACHES at (juniorAttachRetention × pml20Frac) of PML_100.
   * Setting to 0.60 → junior attaches at 60% of PML_20, roughly 1-in-10 level.
   * Setting to 0.70 → ~1-in-12.  Setting to 0.80 → ~1-in-20 (more conservative).
   */
  juniorAttachRetention: number
  juniorAttachJitter: number
}

// ── Pricing cycle ──────────────────────────────────────────────────────────

export interface PricingConfig {
  /** Initial ROL multiples (season 0 before any events) */
  initMultiple: { junior: number; mid: number; remote: number }
  /** Hard-market corridors [min, max] as MULTIPLES of EL */
  corridorJunior: [number, number]
  corridorMid:    [number, number]
  corridorRemote: [number, number]
  /**
   * After a season with aggregate industry TC loss L (USD bn):
   *   delta_multiple = cycleSensitivity × log(1 + L / cycleNormBn)
   * Higher sensitivity → market hardens more per dollar of loss.
   * Lower cycleNormBn → smaller events already trigger hardening.
   */
  cycleSensitivity: number
  cycleNormBn: number
  /** Geometric decay toward base multiple per quiet year */
  decayFactor: number
  /**
   * Baseline EL loss-on-line per tier.
   * Junior = 15%: layers at ~1-in-10 attachment with 50–70% expected fill on hit.
   *               At 2.5–3.5× multiple → ROL 37–52% → speculative, high-return.
   * Mid    = 6%:  layers at ~1-in-20 attachment → ROL 15–33% at 2.5–5.5× multiple.
   * Remote = 2%:  NOT written by portfolio (tier filter), kept for tower display.
   */
  elLolJunior: number
  elLolMid:    number
  elLolRemote: number
  /** Permanent EL drift per loss season (climate ratchet) */
  elDriftPerHit: number
}

// ── Portfolio construction ─────────────────────────────────────────────────

export interface PortfolioConfig {
  /** Number of segregated deals [min, max] */
  nDealsRange: [number, number]
  /** Maximum weight any single deal can take */
  maxDealWeight: number
  /**
   * Target fraction of deals that are junior (remainder = mid).
   * Remote layers are NEVER written.
   */
  juniorFraction: number
}

// ── Capital & cashflow ────────────────────────────────────────────────────

export interface CapitalConfig {
  /** Investor starting wealth, USD millions */
  initialCapitalMusd: number
  /**
   * Risk-free rate: earned on uninvested cash AND on full collateral in trust.
   * (Collateral is invested in T-bills at the risk-free rate; interest flows
   * to the investor unconditionally regardless of loss outcome.)
   */
  riskFreeRate: number
  /** Trapping period for partial-loss deals, in seasons (years) */
  trappingPeriodSeasons: number
}

// ── Recycling ──────────────────────────────────────────────────────────────

export type RecyclingMode = 'full' | 'partial'

export interface RecyclingConfig {
  mode: RecyclingMode
  /**
   * In 'partial' mode: fraction of available (non-trapped) wealth to redeploy.
   * Remainder earns risk-free rate as uninvested cash.
   */
  redeploymentFraction: number
}

// ── Simulation control ─────────────────────────────────────────────────────

export interface SimulationConfig {
  nSeasons: number
  /** Fixed RNG seed (0 = fresh random each run) */
  seed: number
  /** Investor equity falls below this fraction of initial → ruin */
  ruinThresholdFraction: number
  /** Number of Monte Carlo paths */
  nMCRuns: number
}

// ── Full config ────────────────────────────────────────────────────────────

export interface SimConfig {
  frequency:  FrequencyConfig
  severity:   SeverityConfig
  pricing:    PricingConfig
  portfolio:  PortfolioConfig
  capital:    CapitalConfig
  recycling:  RecyclingConfig
  simulation: SimulationConfig
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: SimConfig = {
  frequency: {
    model: 'cox',
    meanAnnual: 1.8,
    negbinomDispersion: 2.0,
    coxStateMultipliers: [0.6, 1.0, 1.5],
    coxTransitionMatrix: [
      [0.5, 0.3, 0.2],
      [0.3, 0.4, 0.3],
      [0.2, 0.3, 0.5],
    ],
  },
  severity: {
    // Calibrated so that ~15–20% of deal-seasons have loss activity.
    // This gives per-path Sharpe ≈ 1.4–1.7 (target).
    //
    // Rule: lower values → more EM-DAT events exceed attachment → higher loss frequency.
    // Tune UP to reduce loss frequency (conservative); DOWN to increase (aggressive).
    //
    // Anchor: FL statePML100 ≈ 65 000 makes Katrina ($99B × 45% FL weight = $44.5B)
    // exceed the remote exhaustion (~0.58 × 65 000 = $37.7B), and Andrew/Irma ($39B
    // × 70% = $27B) exceed the junior attachment (0.18 × 65 000 = $11.7B). This gives
    // ~4–5 FL events / 24 that breach junior attachment ≈ 17–21% per FL event,
    // or ~10–12% annual probability per FL junior deal → Sharpe ≈ 1.5 blended.
    statePML100Musd: {
      FL:  65000,
      TX:  55000,
      LA:  35000,
      NC:  20000,
      SC:  13000,
      GA:  16000,
      MS:  11000,
      AL:  11000,
    },
    marketShareFraction: 0.02,
    exposureScaleRange: [0.5, 2.0],
    pml20FracCentre: 0.30,
    pml20FracJitter: 0.04,
    pml50FracCentre: 0.58,
    pml50FracJitter: 0.04,
    // 0.60 → junior attaches at ~60% of pml20, roughly a 1-in-10 to 1-in-12 event.
    // Lower (e.g. 0.50) → more aggressive, more frequent losses.
    // Higher (e.g. 0.80) → more conservative, fewer losses.
    juniorAttachRetention: 0.60,
    juniorAttachJitter: 0.05,
  },
  pricing: {
    // Junior 1.25× × EL 15% = 18.75% ROL at soft-market entry.
    // After a bad season the cycle pushes toward 3.5× = 52.5% (hard market cap).
    initMultiple: { junior: 1.25, mid: 1.75, remote: 5.5 },
    corridorJunior: [1.5, 3.5],
    corridorMid:    [2.5, 5.5],
    corridorRemote: [3.5, 9.0],
    // Higher sensitivity + lower norm = responsive hardening on moderate losses.
    cycleSensitivity: 1.0,
    cycleNormBn: 25,
    // Faster softening: market normalises in ~4–5 quiet years.
    decayFactor: 0.75,
    elLolJunior: 0.15,   // 15% → ROL 22–52% depending on multiple
    elLolMid:    0.06,   // 6%  → ROL 15–33%
    elLolRemote: 0.02,   // 2%  (reference only; remote layers are not written)
    // Keep EL static by default; cycle effects come from multiples.
    elDriftPerHit: 0.0,
  },
  portfolio: {
    nDealsRange: [8, 14],
    maxDealWeight: 0.18,
    juniorFraction: 0.75,  // ~75% juniors, ~25% mid, 0% remote
  },
  capital: {
    initialCapitalMusd: 10,
    // Single rate: risk-free rate = collateral yield = interest on T-bill trust.
    riskFreeRate: 0.045,
    trappingPeriodSeasons: 3,
  },
  recycling: {
    mode: 'full',
    redeploymentFraction: 1.0,
  },
  simulation: {
    nSeasons: 20,
    seed: 0,   // 0 = random seed each run
    ruinThresholdFraction: 0.10,
    nMCRuns: 10000,
  },
}

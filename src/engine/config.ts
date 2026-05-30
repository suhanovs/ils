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
   * State-level "market PML_100" in USD millions.
   * Used to normalise EM-DAT industry losses → per-cedent fractional loss.
   * A cedent in state S sees fraction = (event_loss × state_weight) / statePML100[S]
   */
  statePML100Musd: Record<State, number>
  /**
   * Each simulated cedent represents this fraction of their state's market.
   * cedentPML100 = statePML100 × marketShareFraction × exposureScale
   */
  marketShareFraction: number
  /** Cedent exposure scale range [min, max] — random uniform per cedent */
  exposureScaleRange: [number, number]
  /** PML_20 as fraction of PML_100 (jitter applied around this centre) */
  pml20FracCentre: number
  pml20FracJitter: number
  /** PML_50 as fraction of PML_100 */
  pml50FracCentre: number
  pml50FracJitter: number
  /** Junior layer attaches at (attachRetention × PML_20) */
  juniorAttachRetention: number
  juniorAttachJitter: number
}

// ── Pricing cycle ──────────────────────────────────────────────────────────

export interface PricingConfig {
  /** Initial ROL multiples (season 0 before any events) */
  initMultiple: { junior: number; mid: number; remote: number }
  /** Hard-market corridors [min, max] per tier */
  corridorJunior: [number, number]
  corridorMid:    [number, number]
  corridorRemote: [number, number]
  /**
   * After a season with aggregate industry TC loss L (USD bn):
   *   delta_multiple = cycleSensitivity × log(1 + L / cycleNormBn)
   * Applied proportionally across tiers.
   */
  cycleSensitivity: number
  cycleNormBn: number
  /** Geometric decay toward base multiple per quiet year: multiple *= decayFactor */
  decayFactor: number
  /** Baseline EL loss-on-line per tier (soft-market anchor) */
  elLolJunior: number
  elLolMid:    number
  elLolRemote: number
  /**
   * EL permanent drift per hit season: elLol *= (1 + elDriftPerHit).
   * Models secular risk increase (climate proxy).
   */
  elDriftPerHit: number
}

// ── Portfolio construction ─────────────────────────────────────────────────

export interface PortfolioConfig {
  /** Number of segregated deals [min, max] */
  nDealsRange: [number, number]
  /** Maximum weight any single deal can take */
  maxDealWeight: number
  /**
   * Sticky layers: if true, deals from layers that saw ANY loss last season
   * are retained (re-written on same layer) before filling remaining slots.
   */
  stickyLayers: boolean
}

// ── Capital & cashflow ────────────────────────────────────────────────────

export interface CapitalConfig {
  /** Investor starting wealth, USD millions */
  initialCapitalMusd: number
  /** Annual interest rate on full collateral (paid to investor) */
  collateralYield: number
  /** Risk-free rate on uninvested cash */
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
  /** Fixed RNG seed (0 = random) */
  seed: number
  /** Investor equity falls below this → ruin (fraction of initial capital) */
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
    model: 'negbinom',
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
    statePML100Musd: {
      FL: 30000,
      TX: 40000,
      LA: 30000,
      NC: 12000,
      SC:  8000,
      GA: 10000,
    },
    marketShareFraction: 0.02,
    exposureScaleRange: [0.5, 2.0],
    pml20FracCentre: 0.30,
    pml20FracJitter: 0.05,
    pml50FracCentre: 0.58,
    pml50FracJitter: 0.05,
    juniorAttachRetention: 0.80,
    juniorAttachJitter: 0.05,
  },
  pricing: {
    initMultiple: { junior: 2.0, mid: 3.5, remote: 5.5 },
    corridorJunior: [1.5, 3.0],
    corridorMid:    [2.5, 5.5],
    corridorRemote: [3.5, 9.0],
    cycleSensitivity: 0.55,
    cycleNormBn: 50,
    decayFactor: 0.82,
    elLolJunior: 0.05,
    elLolMid:    0.02,
    elLolRemote: 0.01,
    elDriftPerHit: 0.002,
  },
  portfolio: {
    nDealsRange: [8, 14],
    maxDealWeight: 0.20,
    stickyLayers: true,
  },
  capital: {
    initialCapitalMusd: 10,
    collateralYield: 0.035,
    riskFreeRate: 0.045,
    trappingPeriodSeasons: 3,
  },
  recycling: {
    mode: 'full',
    redeploymentFraction: 1.0,
  },
  simulation: {
    nSeasons: 20,
    seed: 42,
    ruinThresholdFraction: 0.10,
    nMCRuns: 10000,
  },
}

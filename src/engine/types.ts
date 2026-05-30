/**
 * Core domain types for the ILS simulation.
 *
 * All dollar amounts are in USD millions unless noted.
 * Fractions (ROL, EL, QS, weights) are 0–1 decimals.
 *
 * Separation of concerns: this file defines *what things are*.
 * The engine modules define *how they behave*.
 */

// ── States & tiers ─────────────────────────────────────────────────────────

export type State = 'FL' | 'GA' | 'NC' | 'SC' | 'LA' | 'TX'
export const COVERED_STATES: State[] = ['FL', 'GA', 'NC', 'SC', 'LA', 'TX']

export type LayerTier = 'junior' | 'mid' | 'remote'

// ── Cedent (= one insurer = one state) ────────────────────────────────────

export interface Cedent {
  state: State
  /** Random exposure multiplier (0.5–2.0) — larger cedent → larger PML dollars */
  exposureScale: number
  /** 100-year PML in USD millions (cedentPML100 = statePML100 × mktShare × scale) */
  pml100Musd: number
  /** PML at each return period, as a *fraction* of pml100Musd */
  pml20Frac: number
  pml50Frac: number
  /** lognormal EP-curve parameters (fitted from PML anchor points) */
  epMu: number
  epSigma: number
}

// ── XOL Layer ──────────────────────────────────────────────────────────────

export interface Layer {
  id: string
  cedent: Cedent
  tier: LayerTier
  /** Attachment point as fraction of cedent PML_100 */
  attachFrac: number
  /** Limit as fraction of cedent PML_100 */
  limitFrac: number
  /** Attachment in USD millions */
  attachMusd: number
  /** Limit in USD millions */
  limitMusd: number
  /** Expected loss as fraction of layer limit (loss-on-line) */
  elLol: number
  /** Rate-on-line = premium / limit */
  rol: number
  /** ROL / elLol */
  multiple: number
}

// ── Deal (investor's slice of a layer) ────────────────────────────────────

export interface Deal {
  id: string
  layer: Layer
  /** Quota share fraction (informational; derived from investor capital / layer limit) */
  qs: number
  /** Investor's notional share of the layer limit (limitMusd × qs), USD millions */
  limitShare: number
  /** Premium received upfront (rol × limitShare), USD millions */
  premium: number
  /** Capital posted by investor ((1−rol) × limitShare), USD millions */
  investorCapital: number
  /** Weight in this season's portfolio (sums to 1 across all deals) */
  weight: number
}

// ── Loss event ─────────────────────────────────────────────────────────────

export interface HurricaneEvent {
  year: number
  name: string | null
  /** Total industry loss in USD millions (from EM-DAT) */
  industryLossMusd: number
  /** Covered states affected and their share of the event */
  stateSplits: { state: State; weight: number }[]
}

export interface LayerLossResult {
  dealId: string
  /** 0 = untouched, (0,1) = partial, 1 = total */
  lossFraction: number
  /** Dollar loss to investor for this deal, USD millions */
  lossMusd: number
}

// ── Season record ──────────────────────────────────────────────────────────

export interface DealRecord {
  deal: Deal
  lossFraction: number
  lossMusd: number
  /** Season in which this deal's collateral (if trapped) will be released */
  releaseSeasonIfTrapped: number
}

export interface SeasonRecord {
  season: number             // 1-indexed
  /** Investor net worth at end of this season, USD millions */
  equity: number
  events: HurricaneEvent[]
  deals: DealRecord[]
  /** Aggregate premium income this season */
  totalPremium: number
  /** Aggregate interest on collateral */
  totalInterest: number
  /** Total loss paid to cedents (investor share) */
  totalLoss: number
  /** Newly trapped collateral (partial-loss deals), USD millions */
  newlyTrapped: number
  /** Collateral released from prior-season traps */
  released: number
  /** Market ROL multiples at season end (after cycle adjustment) */
  marketMultiple: { junior: number; mid: number; remote: number }
  /** Global EL (loss-on-line) at season end (after drift) */
  globalEl: { junior: number; mid: number; remote: number }
  /** Industry aggregate TC loss this season, USD millions */
  seasonLossMusd: number
}

// ── Trapped collateral ─────────────────────────────────────────────────────

export interface TrappedPosition {
  dealId: string
  tier: LayerTier
  /** Remaining collateral in trap (limitShare − loss), USD millions */
  amountMusd: number
  /** Season at end of which this becomes available */
  releaseSeason: number
}

// ── Simulation outputs ─────────────────────────────────────────────────────

export interface PathResult {
  seasons: SeasonRecord[]
  ruined: boolean
  terminalEquity: number
  /** Annualised return (CAGR) over the full path */
  cagr: number
}

export interface MCResult {
  nRuns: number
  nRuined: number
  survivalRate: number
  /** Per-season percentile equity curves */
  equityP5:  number[]
  equityP25: number[]
  equityP50: number[]
  equityP75: number[]
  equityP95: number[]
  terminalMean: number
  terminalMedian: number
  terminalP5: number
  terminalP95: number
  cagrMean: number
  cagrP50: number
  sharpe: number
  /** Annual return histogram buckets */
  returnBuckets: { lo: number; hi: number; count: number }[]
}

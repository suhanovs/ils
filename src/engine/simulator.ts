/**
 * Simulation orchestrator — single-path runner and Monte Carlo aggregator.
 *
 * Separation of concerns: this module wires together all engine modules in
 * the correct temporal order, but contains NO financial or physical logic
 * itself (all that lives in the specialist modules).
 *
 * Season sequence each year:
 *   1. Release matured trapped positions → add to liquid equity.
 *   2. Decide deployment (recycling module).
 *   3. Build cedent EP curves + XOL towers (severity + tower modules).
 *   4. Construct portfolio (randomized layer selection; portfolio module).
 *   5. Record collateral posted, premium received.
 *   6. Draw TC event count (frequency module).
 *   7. Sample events, flow losses up towers (eventLoss module).
 *   8. Settle deals — total/partial/none (cashflow module).
 *   9. Advance pricing cycle — harden/soften multiples (pricingCycle module).
 *  10. Record season result (SeasonRecord).
 *  11. Check for ruin.
 */

import { createRng } from './prng'
import type { Rng } from './prng'
import { drawEventCount } from './frequency'
import type { CoxState } from './frequency'
import { buildCedent } from './severity'
import { buildTower } from './tower'
import { initPricingState, advancePricingState } from './pricingCycle'
import type { PricingState } from './pricingCycle'
import { buildEventPool, computeSeasonTowerLosses } from './eventLoss'
import { buildPortfolio } from './portfolio'
import { settleSeason, processTrappedPositions, computeLiquidReturn } from './cashflow'
import { decideDeployment } from './recycling'
import type { SimConfig } from './config'
import type {
  Cedent, Layer, SeasonRecord, TrappedPosition,
  PathResult, MCResult, HurricaneEvent, State,
} from './types'
import { COVERED_STATES } from './types'
import type { EMDATEvent } from '../data/types'

// ── Single-path runner ────────────────────────────────────────────────────

export function runPath(
  cfg:      SimConfig,
  emdatPool: EMDATEvent[],
  seed?:    number
): PathResult {
  const effectiveSeed = seed ?? (cfg.simulation.seed || Math.floor(Math.random() * 1e9))
  const rng:  Rng      = createRng(effectiveSeed)
  const pool  = buildEventPool(emdatPool)

  // Initial state
  // We track liquid wealth and trapped separately; equity = liquid + trapped.
  let liquidWealth:    number            = cfg.capital.initialCapitalMusd
  let trapped:         TrappedPosition[] = []
  let pricingState:    PricingState      = initPricingState(cfg.pricing)
  let coxState:        CoxState          = 1   // start Neutral
  let prevSeasonLossMusd                = 0
  let equity                             = liquidWealth  // for ruin check

  const ruinThreshold  = cfg.capital.initialCapitalMusd * cfg.simulation.ruinThresholdFraction
  const seasons:       SeasonRecord[] = []

  // Build fresh cedents once per path (they are re-used each season; only
  // towers are rebuilt as pricing changes).
  const cedents = new Map<State, Cedent>()
  for (const state of COVERED_STATES) {
    cedents.set(state, buildCedent(rng, state, cfg.severity))
  }

  for (let s = 1; s <= cfg.simulation.nSeasons; s++) {
    // ── 1. Release matured traps → add to liquid ─────────────────────────
    const { released, stillTrapped } = processTrappedPositions(trapped, s, cfg.capital)
    trapped       = stillTrapped
    liquidWealth += released   // matured collateral flows back to liquid

    // ── 2. Decide deployment from current liquid wealth ───────────────────
    const { availableCapital, cashKept } = decideDeployment(liquidWealth, trapped, cfg.recycling)

    // ── 3. Build towers for this season ───────────────────────────────────
    const marketState = {
      multiple: { ...pricingState.multiple },
      elLol: { ...pricingState.elLol },
      stateJuniorEl: { ...pricingState.stateJuniorEl },
      stateMidEl: { ...pricingState.stateMidEl },
    }
    const allLayers: Layer[] = []
    const towers = new Map<State, Layer[]>()

    for (const state of COVERED_STATES) {
      const cedent = cedents.get(state)!
      const tower  = buildTower(rng, cedent, marketState, cfg.severity, cfg.pricing, s)
      towers.set(state, tower)
      allLayers.push(...tower)
    }

    // ── 4. Build portfolio ─────────────────────────────────────────────────
    const deals = buildPortfolio(rng, allLayers, availableCapital, cfg)
    if (deals.length === 0) {
      // No capital to deploy — just hold cash
      liquidWealth = liquidWealth * (1 + cfg.capital.riskFreeRate)
      const trappedValue = trapped.reduce((a, p) => a + p.amountMusd, 0)
      equity = liquidWealth + trappedValue
      seasons.push(emptySeasonRecord(s, equity, pricingState))
      continue
    }

    // ── 5–7. Events ────────────────────────────────────────────────────────
    const { count: eventCount, nextCoxState } = drawEventCount(rng, cfg.frequency, coxState)
    coxState = nextCoxState

    const { events, layerLossFractions, maxGUFractionByState } = computeSeasonTowerLosses(
      rng, eventCount, pool, towers, cedents, cfg
    )

    // ── 7b. IBNR: identify deals to trap even without confirmed losses ─────
    //
    // Any deal whose cedent's state was hit by a GU loss exceeding
    // IBNR_TRIGGER × layer.attachFrac gets trapped for 36 months,
    // even if the attachment was NOT breached.  This models the
    // development / IBNR uncertainty window common in reinsurance.
    // The full trust is frozen; interest compounds; no loss is confirmed.
    // If nothing develops, investor gets limitShare × (1+RFR)^3 at release.
    const IBNR_TRIGGER = 0.60   // trap if GU reached ≥ 60% of attachment
    const ibnrDealIds = new Set<string>()
    for (const deal of deals) {
      // Skip deals that already have confirmed losses
      if ((layerLossFractions.get(deal.layer.id) ?? 0) > 0) continue
      const state = deal.layer.cedent.state as State
      const maxGU = maxGUFractionByState.get(state) ?? 0
      if (maxGU >= IBNR_TRIGGER * deal.layer.attachFrac) {
        ibnrDealIds.add(deal.id)
      }
    }

    // ── 8. Settle deals ────────────────────────────────────────────────────
    const settlement = settleSeason(deals, layerLossFractions, ibnrDealIds, s, cfg.capital)
    trapped.push(...settlement.newTrappedPositions)

    // ── 9. Compute equity = liquid + trapped ───────────────────────────────
    //   liquid  = cash kept (earns risk-free) + immediate returns + already-released traps
    //             Note: `released` was already added to liquidWealth in step 1,
    //             so here we only process the new season's cashflows.
    liquidWealth  = computeLiquidReturn(cashKept, settlement, 0, cfg.capital.riskFreeRate)
    const trappedValue = trapped.reduce((a, p) => a + p.amountMusd, 0)
    equity        = liquidWealth + trappedValue

    // ── 9b. Advance pricing cycle (AFTER recording the season's rates) ────
    // The multiple used THIS season is captured now; the updated multiple
    // is what cedents and investors will see NEXT season.
    const seasonLossMusd = events.reduce((sum, ev) => sum + ev.industryLossMusd, 0)
    // Snapshot rates BEFORE advancing — these are what was actually written
    const writtenMultiple = { ...pricingState.multiple }
    const writtenElLol    = { ...pricingState.elLol }
    const hitStates = new Set<State>()
    const stateLossBySeason = new Map<State, number>()
    for (const ev of events) {
      for (const split of ev.stateSplits) {
        if (split.weight <= 0) continue
        const prev = stateLossBySeason.get(split.state) ?? 0
        stateLossBySeason.set(split.state, prev + ev.industryLossMusd * split.weight)
      }
    }

    // Only material state damage should influence EL/ROL regime updates.
    // Rule: season state loss must reach at least 10% of that state's PML_100.
    for (const [state, lossMusd] of stateLossBySeason.entries()) {
      const pml100 = cfg.severity.statePML100Musd[state]
      if (pml100 > 0 && lossMusd / pml100 >= 0.10) {
        hitStates.add(state)
      }
    }

    advancePricingState(pricingState, seasonLossMusd, prevSeasonLossMusd, hitStates, cfg.pricing)
    prevSeasonLossMusd = seasonLossMusd

    // ── 10. Record ────────────────────────────────────────────────────────
    const record: SeasonRecord = {
      season:         s,
      equity:         Math.max(0, equity),
      events,
      deals:          settlement.dealRecords,
      totalPremium:   settlement.totalPremium,
      totalInterest:  settlement.totalInterest,
      confirmedLoss:  settlement.confirmedLoss,
      newlyTrapped:   settlement.newlyTrapped,
      released:       released,
      marketMultiple: writtenMultiple,   // rates WRITTEN this season
      globalEl:       writtenElLol,      // EL USED this season (pre-drift)
      stateJuniorEl:  { ...marketState.stateJuniorEl },
      stateMidEl:     { ...marketState.stateMidEl },
      seasonLossMusd,
    }
    seasons.push(record)

    // ── 11. Ruin check ────────────────────────────────────────────────────
    if (equity <= ruinThreshold) {
      // Fill remaining seasons as 0 equity (ruined)
      for (let r = s + 1; r <= cfg.simulation.nSeasons; r++) {
        seasons.push(emptySeasonRecord(r, 0, pricingState))
      }
      return { seasons, ruined: true, terminalEquity: 0, cagr: -1, seed: effectiveSeed }
    }
  }

  const terminalEquity = seasons[seasons.length - 1]?.equity ?? equity
  const n              = cfg.simulation.nSeasons
  const cagr           = Math.pow(terminalEquity / cfg.capital.initialCapitalMusd, 1 / n) - 1

  return { seasons, ruined: false, terminalEquity, cagr, seed: effectiveSeed }
}

// ── Monte Carlo aggregator ────────────────────────────────────────────────

export interface MCProgress {
  completed: number
  total: number
}

export function runMonteCarlo(
  cfg:       SimConfig,
  emdatPool: EMDATEvent[],
  onProgress?: (p: MCProgress) => void
): MCResult {
  const nRuns    = cfg.simulation.nMCRuns
  const nSeasons = cfg.simulation.nSeasons
  const baseSeed = cfg.simulation.seed || Math.floor(Math.random() * 1e9)
  const rfr      = cfg.capital.riskFreeRate

  // Per-season equity arrays for percentile computation
  const equityMatrix: number[][] = Array.from({ length: nSeasons }, () => [])
  const terminalEquities: number[] = []
  const cagrs:            number[] = []
  let nRuined = 0

  const perPathSharpes: number[] = []
  const allAnnualReturns: number[] = []

  // Track the 5 worst paths (lowest terminal equity) for the "ruin paths" chart
  const WORST_N = 5
  const worstPaths: { terminal: number; equity: number[]; seed: number }[] = []

  const REPORT_EVERY = Math.max(1, Math.floor(nRuns / 100))

  for (let run = 0; run < nRuns; run++) {
    const seed   = baseSeed + run * 1000003
    const result = runPath(cfg, emdatPool, seed)

    nRuined += result.ruined ? 1 : 0
    terminalEquities.push(result.terminalEquity)
    cagrs.push(result.cagr)

    for (let s = 0; s < nSeasons; s++) {
      equityMatrix[s].push(result.seasons[s]?.equity ?? 0)
    }

    // ── Track worst N paths ────────────────────────────────────────────
    const pathEquity = [cfg.capital.initialCapitalMusd, ...result.seasons.map(s => s.equity)]
    if (worstPaths.length < WORST_N) {
      worstPaths.push({ terminal: result.terminalEquity, equity: pathEquity, seed: result.seed })
      worstPaths.sort((a, b) => a.terminal - b.terminal)
    } else if (result.terminalEquity < worstPaths[WORST_N - 1].terminal) {
      worstPaths[WORST_N - 1] = { terminal: result.terminalEquity, equity: pathEquity, seed: result.seed }
      worstPaths.sort((a, b) => a.terminal - b.terminal)
    }

    // ── Per-path Sharpe ────────────────────────────────────────────────
    // Collect excess annual returns (total equity change minus RFR hurdle)
    const excessReturns: number[] = []
    let prevEq = cfg.capital.initialCapitalMusd
    for (const season of result.seasons) {
      if (prevEq > 1e-6) {
        const r = (season.equity - prevEq) / prevEq
        excessReturns.push(r - rfr)
      }
      prevEq = Math.max(season.equity, 1e-6)
      allAnnualReturns.push((season.equity - cfg.capital.initialCapitalMusd) /
                            cfg.capital.initialCapitalMusd) // for histogram
    }
    if (excessReturns.length >= 3) {
      const sh = sharpeRatio(excessReturns)
      // Ignore degenerate paths (zero variance = all no-loss, skews median up)
      if (isFinite(sh) && sh < 20) perPathSharpes.push(sh)
    }

    if (onProgress && (run + 1) % REPORT_EVERY === 0) {
      onProgress({ completed: run + 1, total: nRuns })
    }
  }

  // Sort for percentile extraction
  for (const arr of equityMatrix) arr.sort((a, b) => a - b)
  terminalEquities.sort((a, b) => a - b)
  perPathSharpes.sort((a, b) => a - b)

  return {
    nRuns,
    nRuined,
    survivalRate:   (nRuns - nRuined) / nRuns,
    equityP5:  equityMatrix.map((arr) => pct(arr, 5)),
    equityP25: equityMatrix.map((arr) => pct(arr, 25)),
    equityP50: equityMatrix.map((arr) => pct(arr, 50)),
    equityP75: equityMatrix.map((arr) => pct(arr, 75)),
    equityP95: equityMatrix.map((arr) => pct(arr, 95)),
    terminalMean:   mean(terminalEquities),
    terminalMedian: pct(terminalEquities, 50),
    terminalP5:     pct(terminalEquities, 5),
    terminalP95:    pct(terminalEquities, 95),
    cagrMean:       mean(cagrs.filter((c) => c > -1)),
    cagrP50:        pct([...cagrs].sort((a, b) => a - b), 50),
    // Median per-path Sharpe — represents the typical investor experience.
    // Higher than target? → Losses are too rare; lower statePML100Musd.
    // Lower than target?  → Losses too frequent or ROL too low.
    sharpe:         pct(perPathSharpes, 50),
    returnBuckets:  histogram(allAnnualReturns, 40),
    worstPaths:     worstPaths.map(p => ({ equity: p.equity, seed: p.seed })),
  }
}

// ── Statistical helpers ───────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function sharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0
  const mu  = mean(returns)
  const variance = returns.reduce((s, r) => s + (r - mu) ** 2, 0) / (returns.length - 1)
  const sigma = Math.sqrt(variance)
  return sigma > 0 ? mu / sigma : 0
}

function histogram(data: number[], nBuckets: number): { lo: number; hi: number; count: number }[] {
  if (data.length === 0) return []
  const lo  = Math.min(...data)
  const hi  = Math.max(...data)
  const w   = (hi - lo) / nBuckets || 0.01
  const buckets = Array.from({ length: nBuckets }, (_, i) => ({
    lo: lo + i * w, hi: lo + (i + 1) * w, count: 0
  }))
  for (const v of data) {
    const i = Math.min(nBuckets - 1, Math.floor((v - lo) / w))
    buckets[i].count++
  }
  return buckets
}

function emptySeasonRecord(season: number, equity: number, ps: PricingState): SeasonRecord {
  return {
    season, equity, events: [], deals: [],
    totalPremium: 0, totalInterest: 0, confirmedLoss: 0,
    newlyTrapped: 0, released: 0,
    marketMultiple: { ...ps.multiple }, globalEl: { ...ps.elLol },
    stateJuniorEl: { ...ps.stateJuniorEl },
    stateMidEl: { ...ps.stateMidEl },
    seasonLossMusd: 0,
  }
}

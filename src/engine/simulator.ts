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
 *   4. Construct portfolio — sticky layers first (portfolio module).
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
import { initPricingState, advancePricingState, clonePricingState } from './pricingCycle'
import type { PricingState } from './pricingCycle'
import { buildEventPool, computeSeasonTowerLosses } from './eventLoss'
import { buildPortfolio } from './portfolio'
import { settleSeason, processTrappedPositions, computeEquity } from './cashflow'
import { decideDeployment, computeLiquidEquity } from './recycling'
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
  let equity           = cfg.capital.initialCapitalMusd
  let trapped:         TrappedPosition[] = []
  let pricingState:    PricingState      = initPricingState(cfg.pricing)
  let coxState:        CoxState          = 1   // start Neutral
  let stickyLayerIds:  Set<string>       = new Set()

  const ruinThreshold  = cfg.capital.initialCapitalMusd * cfg.simulation.ruinThresholdFraction
  const seasons:       SeasonRecord[] = []

  // Build fresh cedents once per path (they are re-used each season; only
  // towers are rebuilt as pricing changes).
  const cedents = new Map<State, Cedent>()
  for (const state of COVERED_STATES) {
    cedents.set(state, buildCedent(rng, state, cfg.severity))
  }

  for (let s = 1; s <= cfg.simulation.nSeasons; s++) {
    // ── 1. Release matured traps ──────────────────────────────────────────
    const { released, stillTrapped } = processTrappedPositions(trapped, s, cfg.capital)
    trapped = stillTrapped

    // ── 2. Compute liquid equity and decide deployment ────────────────────
    const liquidEquity = computeLiquidEquity(equity + released, trapped)
    const { availableCapital, cashKept } = decideDeployment(liquidEquity, trapped, cfg.recycling)

    // ── 3. Build towers for this season ───────────────────────────────────
    const marketState = { multiple: { ...pricingState.multiple }, elLol: { ...pricingState.elLol } }
    const allLayers: Layer[] = []
    const towers = new Map<State, Layer[]>()

    for (const state of COVERED_STATES) {
      const cedent = cedents.get(state)!
      const tower  = buildTower(rng, cedent, marketState, cfg.severity, cfg.pricing, s)
      towers.set(state, tower)
      allLayers.push(...tower)
    }

    // ── 4. Build portfolio ─────────────────────────────────────────────────
    const deals = buildPortfolio(rng, allLayers, stickyLayerIds, availableCapital, cfg)
    if (deals.length === 0) {
      // No capital to deploy — just hold cash
      equity = equity + released + liquidEquity * cfg.capital.riskFreeRate
      seasons.push(emptySeasonRecord(s, equity, pricingState))
      continue
    }

    // ── 5–7. Events ────────────────────────────────────────────────────────
    const { count: eventCount, nextCoxState } = drawEventCount(rng, cfg.frequency, coxState)
    coxState = nextCoxState

    const { events, layerLossFractions } = computeSeasonTowerLosses(
      rng, eventCount, pool, towers, cedents, cfg
    )

    // ── 8. Settle deals ────────────────────────────────────────────────────
    const settlement = settleSeason(deals, layerLossFractions, s, cfg.capital)
    trapped.push(...settlement.newTrappedPositions)

    // ── 9. Compute equity ──────────────────────────────────────────────────
    equity = computeEquity(
      equity,
      availableCapital,
      cashKept,
      settlement,
      released,
      cfg.capital.riskFreeRate
    )

    // Track which layers were hit (for sticky logic next season)
    stickyLayerIds = new Set(
      settlement.dealRecords
        .filter((r) => r.lossFraction > 0)
        .map((r) => r.deal.layer.id)
    )

    // ── 9b. Advance pricing cycle ──────────────────────────────────────────
    const seasonLossMusd = events.reduce((sum, ev) => sum + ev.industryLossMusd, 0)
    advancePricingState(pricingState, seasonLossMusd, cfg.pricing)

    // ── 10. Record ────────────────────────────────────────────────────────
    const record: SeasonRecord = {
      season:         s,
      equity:         Math.max(0, equity),
      events,
      deals:          settlement.dealRecords,
      totalPremium:   settlement.totalPremium,
      totalInterest:  settlement.totalInterest,
      totalLoss:      settlement.totalLoss,
      newlyTrapped:   settlement.newlyTrapped,
      released,
      marketMultiple: { ...pricingState.multiple },
      globalEl:       { ...pricingState.elLol },
      seasonLossMusd,
    }
    seasons.push(record)

    // ── 11. Ruin check ────────────────────────────────────────────────────
    if (equity <= ruinThreshold) {
      // Fill remaining seasons as 0 equity (ruined)
      for (let r = s + 1; r <= cfg.simulation.nSeasons; r++) {
        seasons.push(emptySeasonRecord(r, 0, pricingState))
      }
      return { seasons, ruined: true, terminalEquity: 0, cagr: -1 }
    }
  }

  const terminalEquity = seasons[seasons.length - 1]?.equity ?? equity
  const n              = cfg.simulation.nSeasons
  const cagr           = Math.pow(terminalEquity / cfg.capital.initialCapitalMusd, 1 / n) - 1

  return { seasons, ruined: false, terminalEquity, cagr }
}

// ── Monte Carlo aggregator ────────────────────────────────────────────────

export interface MCProgress {
  completed: number
  total: number
}

export function runMonteCarlo(
  cfg:      SimConfig,
  emdatPool: EMDATEvent[],
  onProgress?: (p: MCProgress) => void
): MCResult {
  const nRuns   = cfg.simulation.nMCRuns
  const nSeasons = cfg.simulation.nSeasons
  const baseSeed = cfg.simulation.seed || 12345

  // Per-season equity arrays for percentile computation
  const equityMatrix: number[][] = Array.from({ length: nSeasons }, () => [])
  const terminalEquities: number[] = []
  const cagrs:            number[] = []
  let nRuined = 0

  // Annual returns for Sharpe
  const annualReturns: number[] = []

  const REPORT_EVERY = Math.max(1, Math.floor(nRuns / 100))

  for (let run = 0; run < nRuns; run++) {
    const seed   = baseSeed + run * 1000003 // deterministic, spread out
    const result = runPath(cfg, emdatPool, seed)

    nRuined += result.ruined ? 1 : 0
    terminalEquities.push(result.terminalEquity)
    cagrs.push(result.cagr)

    for (let s = 0; s < nSeasons; s++) {
      equityMatrix[s].push(result.seasons[s]?.equity ?? 0)
    }

    // Collect annual returns for Sharpe
    let prevEq = cfg.capital.initialCapitalMusd
    for (const season of result.seasons) {
      if (prevEq > 0) annualReturns.push((season.equity - prevEq) / prevEq)
      prevEq = season.equity
    }

    if (onProgress && (run + 1) % REPORT_EVERY === 0) {
      onProgress({ completed: run + 1, total: nRuns })
    }
  }

  // Sort each season's array for percentile extraction
  for (const arr of equityMatrix) arr.sort((a, b) => a - b)
  terminalEquities.sort((a, b) => a - b)

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
    sharpe:         sharpeRatio(annualReturns),
    returnBuckets:  histogram(annualReturns, 40),
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
    totalPremium: 0, totalInterest: 0, totalLoss: 0,
    newlyTrapped: 0, released: 0,
    marketMultiple: { ...ps.multiple }, globalEl: { ...ps.elLol },
    seasonLossMusd: 0,
  }
}

/**
 * Pricing cycle dynamics — the "cat cycle" in collateralized reinsurance.
 *
 * Separation of concerns: tracks and updates the market-wide ROL multiple
 * and EL after each season. Nothing here touches individual layers or deals.
 *
 * Market cycle mechanics:
 *
 *   ROL = premium / limit
 *   EL_lol = EL_dollar / limit  ("loss-on-line")
 *   Multiple = ROL / EL_lol
 *
 *   After a season with aggregate insured TC loss L_t (USD billions):
 *     if L_t > L_{t-1}, then harden on the increase only:
 *       Δ_multiple = cycleSensitivity × ln(1 + (L_t - L_{t-1}) / cycleNormBn)
 *       multiple_next = clamp(multiple_curr + Δ_multiple, corridor)
 *
 *   Quiet year:
 *     multiple_next = baseMultiple + (multiple_curr − baseMultiple) × decayFactor
 *     (geometric decay toward the soft-market base)
 *
 *   EL drift (permanent ratchet on every hit season):
 *     elLol_next = elLol_curr × (1 + elDriftPerHit)
 *   Models the secular upward drift in TC risk (climate proxy), ensuring
 *   that future layers are less likely to suffer if pricing keeps pace.
 *
 * Historical inference:
 *   The rol.csv data (1990–2026) shows real market multiple paths.
 *   The default cycleSensitivity = 0.55 and decayFactor = 0.82 are
 *   calibrated so the model broadly reproduces the 2004/05 hardening
 *   (multiples rose ~1.0 step), the 2006–2016 softening, and the
 *   2017 spike. Users can tune all parameters in the config panel.
 */

import type { PricingConfig } from './config'
import type { State } from './types'
import { COVERED_STATES } from './types'

export interface MarketMultiple {
  junior: number
  mid:    number
  remote: number
}

export interface PricingState {
  multiple: MarketMultiple
  elLol:    MarketMultiple  // global EL, drifts up on hits
  stateJuniorEl: Record<State, number>
  stateMidEl: Record<State, number>
}

/**
 * Initialize pricing state from config.
 */
export function initPricingState(cfg: PricingConfig): PricingState {
  const stateJuniorEl = {} as Record<State, number>
  const stateMidEl = {} as Record<State, number>
  for (const s of COVERED_STATES) {
    stateJuniorEl[s] = stateJuniorElBounds(s).low
    stateMidEl[s] = stateMidElBounds(s).start
  }
  const jrMean = COVERED_STATES.reduce((acc, s) => acc + stateJuniorEl[s], 0) / COVERED_STATES.length
  const midMean = COVERED_STATES.reduce((acc, s) => acc + stateMidEl[s], 0) / COVERED_STATES.length
  return {
    multiple: { ...cfg.initMultiple },
    elLol: {
      junior: jrMean,
      mid:    midMean,
      remote: 0.02,
    },
    stateJuniorEl,
    stateMidEl,
  }
}

/**
 * Advance pricing state after one season.
 *
 * @param state         Current state (mutated in place for performance)
 * @param seasonLossMusd Aggregate industry TC loss this season, USD millions
 * @param cfg           Pricing config
 * @returns             Updated state (same object, modified in place)
 */
export function advancePricingState(
  state:          PricingState,
  seasonLossMusd: number,
  prevSeasonLossMusd: number,
  hitStates: Set<State>,
  cfg:            PricingConfig
): PricingState {
  const lossGb = seasonLossMusd / 1000 // millions -> billions
  const prevGb = prevSeasonLossMusd / 1000
  const deltaGb = Math.max(0, lossGb - prevGb)

  if (deltaGb > 0) {
    // === Worsening season: harden multiples on incremental loss only ===
    const delta = cfg.cycleSensitivity * Math.log(1 + deltaGb / cfg.cycleNormBn)

    state.multiple.junior  = clamp(state.multiple.junior  + delta, cfg.corridorJunior)
    state.multiple.mid     = clamp(state.multiple.mid     + delta, cfg.corridorMid)
    state.multiple.remote  = clamp(state.multiple.remote  + delta, cfg.corridorRemote)

    // Optional EL permanent drift upward (disabled when elDriftPerHit=0)
    if (cfg.elDriftPerHit > 0) {
      state.elLol.junior *= (1 + cfg.elDriftPerHit)
      state.elLol.mid    *= (1 + cfg.elDriftPerHit)
      state.elLol.remote *= (1 + cfg.elDriftPerHit)
    }
  } else {
    // === Quiet season: soften multiples (geometric decay toward base) ===
    const base = cfg.initMultiple
    state.multiple.junior  = base.junior + (state.multiple.junior  - base.junior)  * cfg.decayFactor
    state.multiple.mid     = base.mid    + (state.multiple.mid     - base.mid)     * cfg.decayFactor
    state.multiple.remote  = base.remote + (state.multiple.remote  - base.remote) * cfg.decayFactor

    // Clamp to corridor floors
    state.multiple.junior  = Math.max(state.multiple.junior,  cfg.corridorJunior[0])
    state.multiple.mid     = Math.max(state.multiple.mid,     cfg.corridorMid[0])
    state.multiple.remote  = Math.max(state.multiple.remote,  cfg.corridorRemote[0])
  }

  // Per-state junior/mid EL regime update:
  // - If state had any event damage this season, reset to high bracket
  // - Else ratchet down toward low bracket
  for (const s of COVERED_STATES) {
    const bJ = stateJuniorElBounds(s)
    const bM = stateMidElBounds(s)
    if (hitStates.has(s)) {
      state.stateJuniorEl[s] = bJ.high
      state.stateMidEl[s] = bM.high
    } else {
      state.stateJuniorEl[s] = Math.max(bJ.low, state.stateJuniorEl[s] - bJ.stepDown)
      state.stateMidEl[s] = Math.max(bM.low, state.stateMidEl[s] - bM.stepDown)
    }
  }

  // Keep global EL views for legacy stats/panels (means across states)
  const sumJ = COVERED_STATES.reduce((acc, s) => acc + state.stateJuniorEl[s], 0)
  const sumM = COVERED_STATES.reduce((acc, s) => acc + state.stateMidEl[s], 0)
  state.elLol.junior = sumJ / COVERED_STATES.length
  state.elLol.mid = sumM / COVERED_STATES.length

  return state
}

/**
 * Deep-clone a PricingState (needed before forking paths in the MC).
 */
export function clonePricingState(s: PricingState): PricingState {
  return {
    multiple: { ...s.multiple },
    elLol:    { ...s.elLol },
    stateJuniorEl: { ...s.stateJuniorEl },
    stateMidEl: { ...s.stateMidEl },
  }
}

/**
 * Expected no-loss return on investor capital for a given tier.
 * return = (ROL + riskFreeRate) / (1 − ROL)
 */
export function expectedNoLossReturn(
  tier:            keyof MarketMultiple,
  state:           PricingState,
  riskFreeRate: number
): number {
  const rol = state.elLol[tier] * state.multiple[tier]
  return (rol + riskFreeRate) / Math.max(1 - rol, 0.01)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(val: number, corridor: [number, number]): number {
  return Math.min(corridor[1], Math.max(corridor[0], val))
}

function stateJuniorElBounds(state: State): { high: number; low: number; stepDown: number } {
  if (state === 'FL') return { high: 0.50, low: 0.30, stepDown: 0.10 }
  if (state === 'LA') return { high: 0.40, low: 0.20, stepDown: 0.05 }
  return { high: 0.30, low: 0.10, stepDown: 0.05 }
}

function stateMidElBounds(state: State): { high: number; start: number; low: number; stepDown: number } {
  if (state === 'FL' || state === 'LA') return { high: 0.15, start: 0.10, low: 0.08, stepDown: 0.02 }
  if (state === 'NC' || state === 'SC' || state === 'GA') return { high: 0.10, start: 0.06, low: 0.04, stepDown: 0.02 }
  return { high: 0.08, start: 0.05, low: 0.02, stepDown: 0.02 }
}

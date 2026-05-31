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

export interface MarketMultiple {
  junior: number
  mid:    number
  remote: number
}

export interface PricingState {
  multiple: MarketMultiple
  elLol:    MarketMultiple  // global EL, drifts up on hits
}

/**
 * Initialize pricing state from config.
 */
export function initPricingState(cfg: PricingConfig): PricingState {
  return {
    multiple: { ...cfg.initMultiple },
    elLol: {
      junior: cfg.elLolJunior,
      mid:    cfg.elLolMid,
      remote: cfg.elLolRemote,
    },
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

  return state
}

/**
 * Deep-clone a PricingState (needed before forking paths in the MC).
 */
export function clonePricingState(s: PricingState): PricingState {
  return {
    multiple: { ...s.multiple },
    elLol:    { ...s.elLol },
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

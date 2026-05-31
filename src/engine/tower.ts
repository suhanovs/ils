/**
 * XOL tower generation.
 *
 * Separation of concerns: builds a 3-layer excess-of-loss tower for one cedent.
 * Reads the cedent's EP curve (from severity.ts) and current pricing cycle
 * (from pricingCycle.ts) to produce fully-priced Layer objects.
 *
 * Tower structure (all fractions of cedent PML_100):
 *
 *   ┌─────────────────────────────┐ ← PML_100 (1.0)
 *   │   REMOTE layer              │   attach = pml50Frac, limit = 1 − pml50Frac
 *   ├─────────────────────────────┤ ← PML_50
 *   │   MID layer                 │   attach = pml20Frac, limit = pml50Frac − pml20Frac
 *   ├─────────────────────────────┤ ← PML_20
 *   │   JUNIOR layer              │   attach = retention × pml20Frac, limit = (1−retention) × pml20Frac
 *   ├─────────────────────────────┤ ← Cedent retention (bottom of junior layer)
 *   │   Cedent retains            │
 *   └─────────────────────────────┘ ← 0
 *
 * Each layer is priced with:
 *   elLol (loss-on-line) = computeLayerElLol(cedent, attachFrac, limitFrac)
 *                          but the model uses the GLOBAL elLol (which drifts over time)
 *                          as a pricing floor / anchor.
 *   multiple = current market multiple for the tier (from pricingCycle)
 *   ROL = elLol × multiple  (clamped to corridor)
 */

import { uniform } from './prng'
import type { Rng } from './prng'
import type { SeverityConfig, PricingConfig } from './config'
import type { Cedent, Layer, LayerTier, State } from './types'

/** Current market state passed in from the pricing cycle module */
export interface MarketState {
  multiple: { junior: number; mid: number; remote: number }
  elLol:    { junior: number; mid: number; remote: number }
  stateJuniorEl: Record<State, number>
  stateMidEl: Record<State, number>
}

/**
 * Build the full 3-layer XOL tower for one cedent given the current market state.
 *
 * @param rng          Seeded RNG (for attachment jitter)
 * @param cedent       Built by severity.buildCedent
 * @param market       Current market multiple & EL from pricingCycle
 * @param svCfg        Severity config (for jitter parameters)
 * @param prCfg        Pricing config (for ROL corridors)
 * @param seasonIndex  Used to build deterministic layer IDs
 */
export function buildTower(
  rng:         Rng,
  cedent:      Cedent,
  market:      MarketState,
  svCfg:       SeverityConfig,
  prCfg:       PricingConfig,
  seasonIndex: number
): Layer[] {
  const { pml20Frac, pml50Frac } = cedent

  // Junior layer: attach at (retention ± jitter) × pml20Frac
  const retentionFrac = Math.min(0.95,
    Math.max(0.50,
      svCfg.juniorAttachRetention + uniform(rng, -svCfg.juniorAttachJitter, svCfg.juniorAttachJitter)
    )
  )
  const jrAttachFrac = pml20Frac * retentionFrac
  const jrLimitFrac  = pml20Frac * (1 - retentionFrac)

  // Mid layer: pml20 → pml50
  const midAttachFrac = pml20Frac
  const midLimitFrac  = pml50Frac - pml20Frac

  // Remote layer: pml50 → pml100
  const remAttachFrac = pml50Frac
  const remLimitFrac  = 1.0 - pml50Frac

  const prefix = `${cedent.state}-S${seasonIndex}`

  return [
    makeLayer(`${prefix}-JR`, cedent, 'junior',  jrAttachFrac,  jrLimitFrac,  market, prCfg),
    makeLayer(`${prefix}-MD`, cedent, 'mid',     midAttachFrac, midLimitFrac, market, prCfg),
    makeLayer(`${prefix}-RM`, cedent, 'remote',  remAttachFrac, remLimitFrac, market, prCfg),
  ]
}

// ── Internal helpers ───────────────────────────────────────────────────────

function makeLayer(
  id:         string,
  cedent:     Cedent,
  tier:       LayerTier,
  attachFrac: number,
  limitFrac:  number,
  market:     MarketState,
  prCfg:      PricingConfig,
): Layer {
  const attachMusd = attachFrac * cedent.pml100Musd
  const limitMusd  = limitFrac  * cedent.pml100Musd

  // PRICING: use state-dynamic EL for junior/mid from pricingCycle.
  //
  // We deliberately do NOT compute EL from the fitted lognormal EP curve here.
  // The EP curve (fitted via fitLognormal) is useful for verifying return-period
  // attachment points and for plotting the exceedance curve in the UI, but it
  // produces unstable EL integrals when the tail is heavy (σ ≫ 1): E[X] can
  // exceed PML_100 by orders of magnitude, causing EL/limit → 100% and ROL blow-up.
  //
  // Remote is kept as a global reference only (remote layers are not written).
  const elLol = tier === 'junior'
    ? market.stateJuniorEl[cedent.state]
    : tier === 'mid'
      ? market.stateMidEl[cedent.state]
      : market.elLol[tier]

  // ROL corridor: [multMin, multMax] are MULTIPLES of EL (e.g. 1.5–3.0×).
  // ROL = elLol × multiple, clamped so the multiple stays within the corridor.
  const [multMin, multMax] = tierCorridor(tier, prCfg)
  const rawMultiple = market.multiple[tier]
  const multiple    = Math.min(multMax, Math.max(multMin, rawMultiple))
  const rol         = Math.min(rolCapForTier(tier), elLol * multiple)

  return {
    id,
    cedent,
    tier,
    attachFrac,
    limitFrac,
    attachMusd,
    limitMusd,
    elLol,
    rol,
    multiple,
  }
}

function tierCorridor(tier: LayerTier, prCfg: PricingConfig): [number, number] {
  switch (tier) {
    case 'junior': return prCfg.corridorJunior
    case 'mid':    return prCfg.corridorMid
    case 'remote': return prCfg.corridorRemote
  }
}

function rolCapForTier(tier: LayerTier): number {
  switch (tier) {
    case 'junior': return 0.60
    case 'mid':    return 0.35
    case 'remote': return 0.20
  }
}

/** Human-readable tower summary (for debugging / UI) */
export function towerSummary(layers: Layer[]): string {
  return layers.map(l =>
    `${l.tier.padEnd(6)} attach=${(l.attachFrac * 100).toFixed(1)}% ` +
    `limit=${(l.limitFrac * 100).toFixed(1)}% ` +
    `EL=${(l.elLol * 100).toFixed(2)}% ` +
    `ROL=${(l.rol * 100).toFixed(2)}% ` +
    `mult=${l.multiple.toFixed(2)}x`
  ).join('\n')
}

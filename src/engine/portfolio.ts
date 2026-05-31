/**
 * Portfolio construction — building the investor's book each season.
 *
 * Separation of concerns: selects which layers to write, how much of each,
 * and which deals are "sticky" from the prior season.
 *
 * Tier rules (per user specification):
 *   - Junior layers: primary target (~75% of deals, configurable).
 *   - Mid layers: allowed as a minority (~25%).
 *   - Remote layers: NEVER written.  The market rationale: remote layers have
 *     very high multiples but require large capital commitments and can trap
 *     collateral for 36 months on rare but catastrophic events.  Speculative
 *     junior economics are preferred because diversification handles frequency.
 *
 * Sticky layers:
 *   Layers that saw any loss last season are re-written first.  This ensures
 *   the investor stays exposed during tail-loss development (the layer may
 *   have further development in the 36-month trap window, and re-underwriting
 *   it at hardened pricing is the right ILS manager behaviour).
 *
 * Capital sizing:
 *   available_capital × deal_weight = investor_capital per deal.
 *   limitShare = investor_capital / (1 − ROL)    (trust = investor + premium)
 *   QS = limitShare / layer.limitMusd             (informational)
 */

import { uniformInt, dirichletWeights } from './prng'
import type { Rng } from './prng'
import type { SimConfig } from './config'
import type { Layer, Deal, LayerTier } from './types'

/**
 * Build this season's portfolio.
 *
 * @param rng              Seeded RNG
 * @param allLayers        All layers available this season (all tiers, all cedents)
 * @param stickyLayerIds   Layer IDs that must be re-written (hit last season)
 * @param availableCapital Total capital to deploy (USD millions)
 * @param cfg              SimConfig
 */
export function buildPortfolio(
  rng:              Rng,
  allLayers:        Layer[],
  stickyLayerIds:   Set<string>,
  availableCapital: number,
  cfg:              SimConfig
): Deal[] {
  if (availableCapital <= 0 || allLayers.length === 0) return []

  const { nDealsRange, maxDealWeight, juniorFraction, stickyLayers } = cfg.portfolio
  const N = uniformInt(rng, nDealsRange[0], nDealsRange[1])

  // ── Step 1: separate layers by tier, excluding remote ─────────────────
  const juniorPool: Layer[] = []
  const midPool:    Layer[] = []

  for (const l of allLayers) {
    if (l.tier === 'remote') continue   // never write remote
    if (l.tier === 'junior') juniorPool.push(l)
    else                      midPool.push(l)
  }

  shuffle(rng, juniorPool)
  shuffle(rng, midPool)

  // ── Step 2: collect sticky layers (keep regardless of tier) ───────────
  const stickyJunior: Layer[] = []
  const stickyMid:    Layer[] = []

  if (stickyLayers) {
    for (const l of juniorPool) if (stickyLayerIds.has(l.id)) stickyJunior.push(l)
    for (const l of midPool)    if (stickyLayerIds.has(l.id)) stickyMid.push(l)
  }

  // ── Step 3: target deal counts by tier ────────────────────────────────
  const nJuniorTarget = Math.max(1, Math.round(N * juniorFraction))
  const nMidTarget    = Math.max(0, N - nJuniorTarget)

  // Fill sticky first, then random
  const selectedJunior = fillTier(rng, juniorPool, stickyJunior, nJuniorTarget)
  const selectedMid    = fillTier(rng, midPool,    stickyMid,    nMidTarget)

  const selectedLayers = [...selectedJunior, ...selectedMid].slice(0, N)
  if (selectedLayers.length === 0) return []

  // ── Step 4: random weights ────────────────────────────────────────────
  const weights = dirichletWeights(rng, selectedLayers.length, maxDealWeight)

  // ── Step 5: build Deal objects ────────────────────────────────────────
  return selectedLayers.map((layer, i) => {
    const weight          = weights[i]
    const investorCapital = availableCapital * weight
    // limitShare > investorCapital because premium is also in the trust
    const limitShare      = investorCapital / Math.max(1 - layer.rol, 0.10)
    const premium         = layer.rol * limitShare
    const qs              = limitShare / Math.max(layer.limitMusd, 0.001)

    return {
      id:            `${layer.id}-${(rng() * 1e6 | 0)}`,
      layer,
      qs:            Math.min(qs, 1.0),
      limitShare,
      premium,
      investorCapital,
      weight,
    }
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fill a deal slot for a tier: sticky layers first, then random from pool.
 */
function fillTier(
  rng:     Rng,
  pool:    Layer[],
  sticky:  Layer[],
  target:  number
): Layer[] {
  if (target <= 0) return []
  const result: Layer[] = [...sticky.slice(0, target)]
  const used = new Set(result.map(l => l.id))
  for (const l of pool) {
    if (result.length >= target) break
    if (!used.has(l.id)) { result.push(l); used.add(l.id) }
  }
  return result
}

/** Fisher-Yates shuffle in place */
function shuffle<T>(rng: Rng, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/** Expose tier label for display */
export function tierLabel(tier: LayerTier): string {
  return tier === 'junior' ? 'JR' : tier === 'mid' ? 'MD' : 'RM'
}

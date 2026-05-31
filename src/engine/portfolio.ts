/**
 * Portfolio construction — building the investor's book each season.
 *
 * Separation of concerns: selects which layers to write, how much of each,
 * and how much is allocated to each selected deal.
 *
 * Tier rules (per user specification):
 *   - Junior layers: primary target (~75% of deals, configurable).
 *   - Mid layers: allowed as a minority (~25%).
 *   - Remote layers: NEVER written.  The market rationale: remote layers have
 *     very high multiples but require large capital commitments and can trap
 *     collateral for 36 months on rare but catastrophic events.  Speculative
 *     junior economics are preferred because diversification handles frequency.
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
 * @param availableCapital Total capital to deploy (USD millions)
 * @param cfg              SimConfig
 */
export function buildPortfolio(
  rng:              Rng,
  allLayers:        Layer[],
  availableCapital: number,
  cfg:              SimConfig
): Deal[] {
  if (availableCapital <= 0 || allLayers.length === 0) return []

  const { nDealsRange, maxDealWeight, juniorFraction } = cfg.portfolio
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

  // ── Step 2: target deal counts by tier ────────────────────────────────
  const nJuniorTarget = Math.max(1, Math.round(N * juniorFraction))
  const nMidTarget    = Math.max(0, N - nJuniorTarget)

  // Junior + mid: waterfall by economics first, random only as tie-break.
  // Economics proxy = higher ROL (equivalently higher expected carry at equal loss terms).
  juniorPool.sort((a, b) => compareByEconomics(a.rol, b.rol, rng))
  midPool.sort((a, b) => compareByEconomics(a.rol, b.rol, rng))

  const selectedJunior = pickTopTier(juniorPool, nJuniorTarget)
  const selectedMid    = pickTopTier(midPool, nMidTarget)

  const selectedLayers = [...selectedJunior, ...selectedMid].slice(0, N)
  if (selectedLayers.length === 0) return []

  // ── Step 3: random weights ────────────────────────────────────────────
  const weights = dirichletWeights(rng, selectedLayers.length, maxDealWeight)

  // ── Step 4: build Deal objects ────────────────────────────────────────
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
 * Pick up to target layers from a shuffled pool.
 */
function pickTopTier(pool: Layer[], target: number): Layer[] {
  if (target <= 0) return []
  return pool.slice(0, target)
}

function compareByEconomics(aRol: number, bRol: number, rng: Rng): number {
  const d = bRol - aRol
  if (Math.abs(d) > 1e-9) return d
  return rng() - 0.5
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

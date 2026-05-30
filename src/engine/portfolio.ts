/**
 * Portfolio construction — building the investor's book each season.
 *
 * Separation of concerns: selects which layers to write, how much of each,
 * and which deals are "sticky" from the prior season.
 *
 * Rules:
 *   - N deals, N ∈ [config.nDealsRange[0], config.nDealsRange[1]]
 *   - Sticky: layers that saw ANY loss last season are re-written first
 *     (same layer, same cedent — represents ongoing tail development).
 *   - Random selection fills remaining slots from the available layer pool.
 *   - Random Dirichlet weights (capped at maxDealWeight) sum to 1.
 *   - QS% is derived from investor capital per deal; it is informational
 *     (display only). The core accounting uses limitShare and ROL.
 *
 * Capital deployment:
 *   available = investor wealth × redeployment fraction (from recycling module)
 *   per-deal capital = available × deal weight
 *   limitShare = investor_capital / (1 − ROL)   [premium funds the ROL fraction]
 *   QS = limitShare / layer.limitMusd
 */

import { uniformInt, dirichletWeights } from './prng'
import type { Rng } from './prng'
import type { SimConfig } from './config'
import type { Layer, Deal } from './types'

/**
 * Build this season's portfolio.
 *
 * @param rng             Seeded RNG
 * @param allLayers       All available layers this season (from buildTower × cedents)
 * @param stickyLayerIds  Set of layer IDs that must be re-written (hit last season)
 * @param availableCapital Total capital available for deployment this season (USD m)
 * @param cfg             SimConfig (portfolio + capital sections)
 */
export function buildPortfolio(
  rng:             Rng,
  allLayers:       Layer[],
  stickyLayerIds:  Set<string>,
  availableCapital: number,
  cfg:             SimConfig
): Deal[] {
  const { nDealsRange, maxDealWeight } = cfg.portfolio

  // N = random number of deals
  const N = uniformInt(rng, nDealsRange[0], nDealsRange[1])

  // Step 1: collect sticky layers (previously hit, must re-write)
  const stickyLayers: Layer[] = []
  const freeLayers:   Layer[] = []

  for (const layer of allLayers) {
    if (stickyLayerIds.has(layer.id)) {
      stickyLayers.push(layer)
    } else {
      freeLayers.push(layer)
    }
  }

  // Shuffle free layers for random selection
  shuffle(rng, freeLayers)

  // Take up to N layers, sticky first then random
  const selectedLayers: Layer[] = [
    ...stickyLayers.slice(0, N),
    ...freeLayers.slice(0, Math.max(0, N - stickyLayers.length)),
  ].slice(0, N)

  if (selectedLayers.length === 0) return []

  // Step 2: random weights for capital allocation
  const weights = dirichletWeights(rng, selectedLayers.length, maxDealWeight)

  // Step 3: build Deal objects
  const deals: Deal[] = selectedLayers.map((layer, i) => {
    const weight         = weights[i]
    const investorCapital = availableCapital * weight
    // limitShare = investorCapital / (1 − ROL)
    const limitShare     = investorCapital / Math.max(1 - layer.rol, 0.05)
    const premium        = layer.rol * limitShare
    const qs             = limitShare / Math.max(layer.limitMusd, 0.001)

    return {
      id:            `deal-${layer.id}-${Math.floor(rng() * 1e6)}`,
      layer,
      qs:            Math.min(qs, 1.0),   // cap at 100%
      limitShare,
      premium,
      investorCapital,
      weight,
    }
  })

  return deals
}

/** Fisher-Yates shuffle (in place) */
function shuffle<T>(rng: Rng, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/**
 * Hurricane arrival frequency models.
 *
 * Separation of concerns: only produces an integer event count per season.
 * Three models are supported (selectable in config):
 *
 *  - poisson    : homogeneous Poisson process with fixed rate λ.
 *  - negbinom   : Poisson-Gamma mixture ("double Poisson"); captures
 *                 over-dispersed clustered active/quiet years.
 *                 Literature: Elsner & Bossak (2001), Jagger & Elsner (2006).
 *  - cox        : Doubly-stochastic (Cox) process; λ modulated by a latent
 *                 ENSO/AMO state machine (El Niño / Neutral / La Niña).
 *                 Literature: Jevrejeva et al., Sabbatelli & Mann (2007).
 */

import { poisson, negBinom, categorical } from './prng'
import type { Rng } from './prng'
import type { FrequencyConfig } from './config'

/** Current state index for the Cox model (0=ElNiño, 1=Neutral, 2=LaNiña) */
export type CoxState = 0 | 1 | 2

/**
 * Draw the number of TC events for one season.
 *
 * @param rng       Seeded RNG (consumed in place)
 * @param cfg       FrequencyConfig from SimConfig
 * @param coxState  Current ENSO/AMO state (only used by 'cox' model)
 * @returns { count, nextCoxState }
 */
export function drawEventCount(
  rng: Rng,
  cfg: FrequencyConfig,
  coxState: CoxState = 1
): { count: number; nextCoxState: CoxState } {
  let count: number
  let nextCoxState: CoxState = coxState

  switch (cfg.model) {
    case 'poisson':
      count = poisson(rng, cfg.meanAnnual)
      break

    case 'negbinom':
      count = negBinom(rng, cfg.meanAnnual, cfg.negbinomDispersion)
      break

    case 'cox': {
      // Transition to next ENSO state
      const row = cfg.coxTransitionMatrix[coxState]
      nextCoxState = categorical(rng, row) as CoxState
      // Rate is the base mean × state multiplier
      const lambda = cfg.meanAnnual * cfg.coxStateMultipliers[nextCoxState]
      count = poisson(rng, lambda)
      break
    }
  }

  return { count, nextCoxState }
}

/**
 * Long-run mean of the configured frequency model (analytical).
 * Useful for calibration displays.
 */
export function theoreticalMean(cfg: FrequencyConfig): number {
  switch (cfg.model) {
    case 'poisson':
    case 'negbinom':
      return cfg.meanAnnual
    case 'cox': {
      // Stationary distribution of the Markov chain × rate multipliers
      const pi = stationaryDistribution(cfg.coxTransitionMatrix)
      return cfg.meanAnnual * pi.reduce((s, p, i) => s + p * cfg.coxStateMultipliers[i], 0)
    }
  }
}

/**
 * Long-run variance of the configured frequency model (analytical).
 */
export function theoreticalVariance(cfg: FrequencyConfig): number {
  switch (cfg.model) {
    case 'poisson':
      return cfg.meanAnnual
    case 'negbinom':
      return cfg.meanAnnual + cfg.meanAnnual ** 2 / cfg.negbinomDispersion
    case 'cox': {
      const mu = theoreticalMean(cfg)
      return mu * (1 + mu) // simplified; ignores Markov mixing time
    }
  }
}

/** Compute stationary distribution of a row-stochastic Markov matrix via power iteration */
function stationaryDistribution(
  matrix: [[number, number, number], [number, number, number], [number, number, number]]
): [number, number, number] {
  let pi: [number, number, number] = [1 / 3, 1 / 3, 1 / 3]
  for (let iter = 0; iter < 1000; iter++) {
    const next: [number, number, number] = [0, 0, 0]
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) next[j] += pi[i] * matrix[i][j]
    }
    const maxDiff = Math.max(...next.map((v, i) => Math.abs(v - pi[i])))
    pi = next
    if (maxDiff < 1e-10) break
  }
  return pi
}

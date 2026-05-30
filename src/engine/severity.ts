/**
 * Cedent severity (EP) curve construction and EL calculation.
 *
 * Separation of concerns: answers the question "for a given cedent,
 * what is the loss distribution, and what EL does each layer carry?"
 *
 * Approach:
 *   1. Each cedent gets a random exposure scale → PML_100 in USD millions.
 *   2. PML at 3 return periods (1-in-20, 1-in-50, 1-in-100) are anchored
 *      with configurable jitter (as fractions of PML_100).
 *   3. A lognormal distribution is fitted to the PML_50 and PML_100 anchors
 *      (tail-fitting approach; PML_20 is also stored for layer construction).
 *   4. Layer EL (loss-on-line = EL / limit) is computed analytically from
 *      the fitted lognormal using the truncated-expectation formula.
 *
 * The "expected loss" in this module is the ANNUAL aggregate expected loss
 * for the layer (not the per-event loss), which is what "loss-on-line" means.
 */

import { uniform, normalCDF } from './prng'
import type { Rng } from './prng'
import type { SeverityConfig } from './config'
import type { Cedent, State } from './types'

// ── PML anchors ────────────────────────────────────────────────────────────

// Standard normal quantiles for our return-period probabilities
const Z_5PCT  = -1.6449 // Φ⁻¹(0.05) → 1-in-20
const Z_2PCT  = -2.0537 // Φ⁻¹(0.02) → 1-in-50
const Z_1PCT  = -2.3263 // Φ⁻¹(0.01) → 1-in-100

/**
 * Fit lognormal (μ, σ) from the two tail anchors (p50, p100).
 * P(X > pml) = p ↔ (μ − ln(pml)) / σ = Φ⁻¹(p)
 *
 *  σ = ln(pml100 / pml50) / (z_1pct − z_2pct)
 *  μ = ln(pml50) + z_2pct × σ   (note: z_2pct is negative)
 *
 * Wait — signs: we need (μ − ln(pml50))/σ = Z_2PCT and (μ − ln(pml100))/σ = Z_1PCT
 *  Subtract: (ln(pml100) − ln(pml50)) / σ = Z_2PCT − Z_1PCT
 *  → σ = ln(pml100/pml50) / (Z_2PCT − Z_1PCT)   [both negative, Z_2PCT > Z_1PCT]
 */
function fitLognormal(pml50: number, pml100: number): { mu: number; sigma: number } {
  const sigma = Math.log(pml100 / pml50) / (Z_2PCT - Z_1PCT)
  const mu    = Math.log(pml50) - Z_2PCT * sigma
  return { mu, sigma }
}

/**
 * E[min(X, c)] for X ~ LogNormal(μ, σ²).
 * Standard formula: E[X]·Φ(d₁) + c·(1−Φ(d₂))
 * where d₁ = (ln c − μ − σ²)/σ  and  d₂ = (ln c − μ)/σ
 */
function lnTruncExp(mu: number, sigma: number, c: number): number {
  if (c <= 0) return 0
  const EX = Math.exp(mu + 0.5 * sigma * sigma)
  const d1 = (Math.log(c) - mu - sigma * sigma) / sigma
  const d2 = (Math.log(c) - mu) / sigma
  return EX * normalCDF(d1) + c * (1 - normalCDF(d2))
}

/**
 * Annual expected loss of a layer [attach, attach+limit] for X ~ LogNormal(μ,σ²).
 * = E[min(X, attach+limit)] − E[min(X, attach)]
 */
function layerEL(mu: number, sigma: number, attach: number, limit: number): number {
  return lnTruncExp(mu, sigma, attach + limit) - lnTruncExp(mu, sigma, attach)
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a cedent (insurer) for a given state.
 * The exposure scale is random; PML fractions have configurable jitter.
 */
export function buildCedent(
  rng: Rng,
  state: State,
  cfg: SeverityConfig
): Cedent {
  const exposureScale = uniform(rng, cfg.exposureScaleRange[0], cfg.exposureScaleRange[1])
  const pml100Musd    = cfg.statePML100Musd[state] * cfg.marketShareFraction * exposureScale

  const pml20Frac = Math.max(0.15,
    cfg.pml20FracCentre + uniform(rng, -cfg.pml20FracJitter, cfg.pml20FracJitter)
  )
  const pml50Frac = Math.max(pml20Frac + 0.10,
    cfg.pml50FracCentre + uniform(rng, -cfg.pml50FracJitter, cfg.pml50FracJitter)
  )

  // Fit lognormal to PML_50 and PML_100 anchors
  const pml50Musd  = pml100Musd * pml50Frac
  const { mu, sigma } = fitLognormal(pml50Musd, pml100Musd)

  return {
    state,
    exposureScale,
    pml100Musd,
    pml20Frac,
    pml50Frac,
    epMu: mu,
    epSigma: sigma,
  }
}

/**
 * Return the EL/limit (loss-on-line) for a layer [attachFrac, attachFrac+limitFrac]
 * on a cedent, using its fitted lognormal EP curve.
 *
 * The EL is ANNUAL (integrates the exceedance curve over the layer band).
 * Loss-on-line = EL / limit  (a pure fraction 0–1).
 */
export function computeLayerElLol(cedent: Cedent, attachFrac: number, limitFrac: number): number {
  const { pml100Musd, epMu, epSigma } = cedent
  const attachMusd = attachFrac * pml100Musd
  const limitMusd  = limitFrac  * pml100Musd
  if (limitMusd <= 0) return 0
  const elMusd = layerEL(epMu, epSigma, attachMusd, limitMusd)
  return Math.min(elMusd / limitMusd, 0.99) // cap at 99% to avoid degenerate layers
}

/**
 * GU event loss for a cedent as a fraction of its PML_100.
 *
 * Called by the eventLoss module:
 *   gu_fraction = (event_loss_musd × state_weight) / state_pml100_musd
 *
 * We also scale by the cedent's exposureScale relative to the average (1.0),
 * so a larger cedent sees proportionally more (exposure-weighted) loss.
 * NOTE: because both layer limits and losses scale with pml100, the
 *       loss-fraction-of-layer is actually independent of exposureScale —
 *       which is the correct behaviour (same % of tower is hit regardless of size).
 */
export function eventLossFraction(
  eventMusd:   number,
  stateWeight: number,
  statePML100: number
): number {
  if (statePML100 <= 0) return 0
  return (eventMusd * stateWeight) / statePML100
}

// Re-export for convenience (other modules use the lnTruncExp logic)
export { fitLognormal, layerEL, lnTruncExp }

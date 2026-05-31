/**
 * Event severity sampling and loss flow up XOL towers.
 *
 * Separation of concerns: given a simulated hurricane, this module
 * (a) samples a historical event severity from EM-DAT,
 * (b) splits the loss across 2–3 affected covered states, and
 * (c) flows each cedent's GU loss through their XOL tower,
 *     producing a loss fraction per layer.
 *
 * Simplification (educational): GU loss to cedent == loss transmitted
 * to the cedent's layers. No facultative, no clash clause, no IBNER.
 *
 * State-weight semantics:
 *   For each event in the EM-DAT pool, the historical `states` field
 *   indicates which covered states were affected. In the simulation we
 *   draw random proportional weights across those states, preserving
 *   the historical geographic scope while adding per-run variation.
 *
 * Industry loss → cedent loss conversion:
 *   cedent_loss_fraction = (event_loss × state_weight) / statePML100[state]
 *   This expresses the cedent's GU loss as a fraction of their PML_100,
 *   which is exactly what the XOL tower attachment/limit fractions compare against.
 */

import { categorical, dirichletWeights } from './prng'
import type { Rng } from './prng'
import type { SimConfig } from './config'
import type { Cedent, HurricaneEvent, Layer, LayerLossResult, State } from './types'
import type { EMDATEvent } from '../data/types'
import { COVERED_STATES } from './types'

// ── Event pool (filtered EM-DAT events) ───────────────────────────────────

/** Pre-filter the EM-DAT pool to events touching at least 1 covered state */
export function buildEventPool(events: EMDATEvent[]): EMDATEvent[] {
  return events.filter(
    (e) => e.states.length > 0 && e.states.some((s) => COVERED_STATES.includes(s as State))
  )
}

// ── Sample one hurricane event ─────────────────────────────────────────────

/**
 * Sample one historical event from the pool (with replacement).
 * Returns a HurricaneEvent with random state-weight splits.
 */
export function sampleEvent(
  rng:  Rng,
  pool: EMDATEvent[],
  cfg:  SimConfig
): HurricaneEvent | null {
  if (pool.length === 0) return null

  // Draw event uniformly at random (with replacement)
  const idx   = Math.floor(rng() * pool.length)
  const emdat = pool[idx]

  // Only keep covered states
  const coveredStates = emdat.states.filter((s) =>
    COVERED_STATES.includes(s as State)
  ) as State[]

  if (coveredStates.length === 0) return null

  // Credibility constraint for state split:
  // If FL/TX/LA is involved, force that anchor state to take 2/3 of loss,
  // and spread the remaining 1/3 across other affected covered states.
  // Otherwise use random proportional split across states.
  const anchor = selectAnchorState(coveredStates)
  let stateSplits: { state: State; weight: number }[]

  if (anchor && coveredStates.length > 1) {
    const others = coveredStates.filter((s) => s !== anchor)
    const remWeights = dirichletWeights(rng, others.length, 0.9)
    stateSplits = [
      { state: anchor, weight: 2 / 3 },
      ...others.map((state, i) => ({ state, weight: (1 / 3) * remWeights[i] })),
    ]
  } else {
    const rawWeights = dirichletWeights(rng, coveredStates.length, 0.9)
    stateSplits = coveredStates.map((state, i) => ({
      state,
      weight: rawWeights[i],
    }))
  }

  return {
    year: emdat.year,
    name: emdat.name,
    industryLossMusd: emdat.lossMusd,
    stateSplits,
  }
}

// ── Loss flow up a single cedent's XOL tower ──────────────────────────────

/**
 * Compute each layer's loss fraction given the cedent's GU loss fraction.
 *
 * @param guFraction  Cedent GU loss as fraction of their PML_100 (0–∞, can exceed 1)
 * @param layers      The cedent's 3-layer tower (from tower.buildTower)
 * @returns           Per-layer loss fraction 0 = untouched, (0,1) = partial, 1 = total
 */
export function flowLossUpTower(
  guFraction: number,
  layers:     Layer[]
): { layer: Layer; lossFraction: number }[] {
  return layers.map((layer) => {
    const excess       = guFraction - layer.attachFrac
    if (excess <= 0) return { layer, lossFraction: 0 }
    const lossFraction = Math.min(excess / layer.limitFrac, 1.0)
    return { layer, lossFraction }
  })
}

// ── Aggregate: all events in a season across all towers ───────────────────

/**
 * For every event in a season, for every affected cedent, for every layer:
 * compute the loss fraction.
 *
 * Returns a flat map from layerId → lossFraction (max across events, because
 * a second event hitting a partially-impaired layer adds to the loss).
 */
export interface SeasonLossResult {
  events: HurricaneEvent[]
  /** layerId → cumulative loss fraction ∈ (0,1] for layers with actual losses */
  layerLossFractions: Map<string, number>
  /**
   * state → maximum GU loss fraction of PML_100 observed in any event this season.
   * Used by IBNR logic: layers in states that experienced significant GU loss
   * (even below their attachment) are trapped pending loss development.
   */
  maxGUFractionByState: Map<State, number>
}

export function computeSeasonTowerLosses(
  rng:        Rng,
  eventCount: number,
  pool:       EMDATEvent[],
  towers:     Map<State, Layer[]>,
  cedents:    Map<State, Cedent>,
  cfg:        SimConfig
): SeasonLossResult {
  const events: HurricaneEvent[]            = []
  const accumulated    = new Map<string, number>()  // layerId → loss fraction
  const maxGUByState   = new Map<State, number>()   // state  → max GU fraction

  for (let e = 0; e < eventCount; e++) {
    const event = sampleEvent(rng, pool, cfg)
    if (!event) continue
    events.push(event)

    for (const { state, weight } of event.stateSplits) {
      const layers = towers.get(state)
      const cedent = cedents.get(state)
      if (!layers || !cedent) continue

      const guFrac = (event.industryLossMusd * weight) /
                      cfg.severity.statePML100Musd[state]

      // Track max GU fraction per state (for IBNR logic)
      maxGUByState.set(state, Math.max(maxGUByState.get(state) ?? 0, guFrac))

      for (const { layer, lossFraction } of flowLossUpTower(guFrac, layers)) {
        if (lossFraction > 0) {
          const prev = accumulated.get(layer.id) ?? 0
          accumulated.set(layer.id, Math.min(prev + lossFraction, 1.0))
        }
      }
    }
  }

  return { events, layerLossFractions: accumulated, maxGUFractionByState: maxGUByState }
}

// ── Convenience: describe event impact ────────────────────────────────────

export function eventDescription(event: HurricaneEvent): string {
  const states   = event.stateSplits.map((s) => s.state).join('/')
  const lossStr  = event.industryLossMusd >= 1000
    ? `$${(event.industryLossMusd / 1000).toFixed(1)}B`
    : `$${event.industryLossMusd.toFixed(0)}M`
  const name     = event.name ? `${event.name} (${event.year})` : String(event.year)
  return `${name} — industry ${lossStr} → ${states}`
}

function selectAnchorState(states: State[]): State | null {
  if (states.includes('FL')) return 'FL'
  if (states.includes('TX')) return 'TX'
  if (states.includes('LA')) return 'LA'
  return null
}

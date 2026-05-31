/**
 * Collateral mechanics, cashflow accounting, and deal settlement.
 *
 * Separation of concerns: given deals and their loss fractions, this module
 * computes exactly what the investor receives (or loses) at season end,
 * and which collateral positions get trapped.
 *
 * Per-deal capital structure (confirmed by user):
 *
 *   Limit_share  = layer.limitMusd × QS  (investor's notional slice)
 *   Premium      = ROL × Limit_share       (paid by cedent into trust)
 *   Investor_cap = (1 − ROL) × Limit_share (investor funds the rest)
 *   Trust_total  = Limit_share             (= investor_cap + premium)
 *
 * Interest accrues on the FULL trust (= Limit_share) and is paid to
 * the investor regardless of loss outcome (earned on T-bills backing
 * the trust; spec: "interest is paid on the whole, to the investor").
 *   Interest = Limit_share × collateralYield   (unconditional)
 *
 * Principal settlement at season end:
 *   Total loss  (fraction = 1.0): trust pays Limit_share to cedent.
 *                                 Investor recovers zero principal.
 *   Partial loss (0 < f < 1)    : trust pays f × Limit_share to cedent.
 *                                 (1−f) × Limit_share is trapped for 36 months.
 *   No loss     (f = 0)         : Limit_share returned to investor.
 *
 * === EQUITY ACCOUNTING ===
 *
 * The investor's NET WORTH at season end is:
 *
 *   liquid   = cashKept × (1 + riskFreeRate)     — cash that wasn't deployed
 *            + interestOnAllDeals                 — yield on full collateral (unconditional)
 *            + returnedPrincipal                  — limitShare for no-loss deals
 *            + releasedFromPriorTraps             — matured trapped collateral
 *
 *   trapped  = sum of (1−f) × limitShare          — partial-loss deals, locked up 36 months
 *            (already in newTrappedPositions list)
 *
 *   total_equity = liquid + sum(trapped.amountMusd)
 *
 * Key insight: "totalLoss" (confirmed losses paid to cedents) is a DISPLAY-ONLY
 * figure. It does NOT enter the equity formula because:
 *   - For total-loss deals:   investorCapital already left the investor's account
 *                             when deployed; the deal simply returns $0 to principal.
 *   - For partial-loss deals: the loss is captured by the reduced trapped principal.
 * Double-counting occurs if you both (a) exclude the deal from returned principal AND
 * (b) subtract it again as a loss charge.
 */

import type { CapitalConfig } from './config'
import type { Deal, TrappedPosition, DealRecord } from './types'

// ── Season-end settlement ─────────────────────────────────────────────────

export interface SettlementResult {
  dealRecords:    DealRecord[]
  /** Total interest paid on all collateral (display + included in immediateReturn) */
  totalInterest:  number
  /** Total premium received from cedents (display only) */
  totalPremium:   number
  /** Dollar losses confirmed to cedents (display only — does NOT enter equity calc) */
  confirmedLoss:  number
  /** Cash returned to investor immediately: interest on all + principal of no-loss deals */
  immediateReturn: number
  /** Newly trapped collateral from partial-loss deals */
  newlyTrapped:   number
  newTrappedPositions: TrappedPosition[]
}

/**
 * Settle all deals at season end.
 *
 * @param deals         Portfolio of deals this season
 * @param lossFractions Map layerId → loss fraction ∈ [0, 1]
 * @param currentSeason 1-indexed season number
 * @param cfg           Capital config (yield, trapping period)
 */
export function settleSeason(
  deals:         Deal[],
  lossFractions: Map<string, number>,
  currentSeason: number,
  cfg:           CapitalConfig
): SettlementResult {
  const dealRecords: DealRecord[]              = []
  const newTrappedPositions: TrappedPosition[] = []
  let totalInterest  = 0
  let totalPremium   = 0
  let confirmedLoss  = 0
  let returnedPrincipal = 0
  let newlyTrapped   = 0

  for (const deal of deals) {
    const lossFraction = lossFractions.get(deal.layer.id) ?? 0
    const lossMusd     = lossFraction * deal.limitShare
    const interest     = deal.limitShare * cfg.collateralYield

    // Interest is paid unconditionally on the full collateral
    totalInterest += interest
    totalPremium  += deal.premium

    const record: DealRecord = {
      deal,
      lossFraction,
      lossMusd,
      releaseSeasonIfTrapped: currentSeason + cfg.trappingPeriodSeasons,
    }
    dealRecords.push(record)

    if (lossFraction >= 1.0) {
      // TOTAL LOSS: trust pays limitShare to cedent; investor recovers no principal.
      // Interest already counted above (paid regardless).
      confirmedLoss += deal.limitShare

    } else if (lossFraction > 0) {
      // PARTIAL LOSS: cedent claims f×limitShare; remainder is trapped 36 months.
      const lossTotal = lossFraction * deal.limitShare
      const remaining = deal.limitShare - lossTotal
      confirmedLoss += lossTotal
      newlyTrapped  += remaining
      newTrappedPositions.push({
        dealId:        deal.id,
        tier:          deal.layer.tier,
        amountMusd:    remaining,
        releaseSeason: currentSeason + cfg.trappingPeriodSeasons,
      })

    } else {
      // NO LOSS: limitShare returned in full.
      returnedPrincipal += deal.limitShare
    }
  }

  // immediateReturn = interest on ALL deals + principal of no-loss deals
  const immediateReturn = totalInterest + returnedPrincipal

  return {
    dealRecords,
    totalInterest,
    totalPremium,
    confirmedLoss,
    immediateReturn,
    newlyTrapped,
    newTrappedPositions,
  }
}

// ── Trapped position management ───────────────────────────────────────────

/**
 * Release any trapped positions that have matured; keep the rest.
 * Interest on trapped principal is NOT accrued here — it was paid
 * unconditionally at settlement time.  The principal is returned as-is.
 */
export function processTrappedPositions(
  trapped:       TrappedPosition[],
  currentSeason: number,
  _cfg:          CapitalConfig   // reserved for future per-season interest accrual
): { released: number; stillTrapped: TrappedPosition[] } {
  let released = 0
  const stillTrapped: TrappedPosition[] = []

  for (const pos of trapped) {
    if (pos.releaseSeason <= currentSeason) {
      released += pos.amountMusd
    } else {
      stillTrapped.push(pos)
    }
  }

  return { released, stillTrapped }
}

// ── Liquid equity calculation ──────────────────────────────────────────────

/**
 * Compute the investor's LIQUID equity at season end.
 *
 * liquid = cashKept × (1 + riskFreeRate)
 *        + settlement.immediateReturn   (interest on all + returned principal)
 *        + released                     (matured trapped collateral)
 *
 * IMPORTANT: this is LIQUID equity only.
 * Total net worth = liquid + sum(allTrappedPositions.amountMusd)
 * The simulator must add the trapped value to get the equity curve.
 */
export function computeLiquidReturn(
  cashKept:    number,
  settlement:  SettlementResult,
  released:    number,
  riskFreeRate: number
): number {
  return cashKept * (1 + riskFreeRate) + settlement.immediateReturn + released
}

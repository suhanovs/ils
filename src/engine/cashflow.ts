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
 * Interest accrues on the FULL trust (= Limit_share) and is paid to investor.
 *   Interest = Limit_share × collateralYield
 *
 * Settlement at season end:
 *   Total loss  (fraction = 1.0): cedent claims Limit_share.
 *                                 Investor loses investor_cap immediately.
 *                                 No trapping (nothing left).
 *   Partial loss (0 < f < 1)    : cedent claims f × Limit_share.
 *                                 Remaining (1−f) × Limit_share is trapped.
 *                                 Released after trappingPeriodSeasons with interest.
 *   No loss      (f = 0)        : Limit_share + interest returned to investor.
 *
 * Returns on investor capital in no-loss year:
 *   return = (premium + interest) / investor_cap = (ROL + yield) / (1 − ROL)
 */

import type { CapitalConfig } from './config'
import type { Deal, TrappedPosition, DealRecord } from './types'

// ── Season-end settlement ─────────────────────────────────────────────────

export interface SettlementResult {
  dealRecords:    DealRecord[]
  totalPremium:   number   // USD m received at start
  totalInterest:  number   // USD m interest on full collateral
  totalLoss:      number   // USD m paid to cedents (gone)
  newlyTrapped:   number   // USD m entering trapping
  immediateReturn: number  // USD m returned directly (no-loss + total-loss refund-of-none)
  newTrappedPositions: TrappedPosition[]
}

/**
 * Settle all deals in a season.
 *
 * @param deals         Portfolio of deals
 * @param lossFractions Map from layerId → loss fraction [0,1]
 * @param currentSeason 1-indexed season number
 * @param cfg           Capital config (yield, trapping period)
 */
export function settleSeason(
  deals:         Deal[],
  lossFractions: Map<string, number>,
  currentSeason: number,
  cfg:           CapitalConfig
): SettlementResult {
  const dealRecords: DealRecord[]        = []
  const newTrappedPositions: TrappedPosition[] = []
  let totalPremium  = 0
  let totalInterest = 0
  let totalLoss     = 0
  let newlyTrapped  = 0
  let immediateReturn = 0

  for (const deal of deals) {
    const lossFraction = lossFractions.get(deal.layer.id) ?? 0
    const lossMusd     = lossFraction * deal.limitShare
    const interest     = deal.limitShare * cfg.collateralYield

    totalPremium  += deal.premium
    totalInterest += interest

    const record: DealRecord = {
      deal,
      lossFraction,
      lossMusd,
      releaseSeasonIfTrapped: currentSeason + cfg.trappingPeriodSeasons,
    }
    dealRecords.push(record)

    if (lossFraction >= 1.0) {
      // TOTAL LOSS: investor loses investor_cap immediately
      // Premium was received upfront but flows into trust → used to pay cedent
      // Net: investor_cap is gone; premium and interest are also consumed
      totalLoss += deal.investorCapital + deal.premium + interest
      // (We still book interest earned + premium received but it's fully offset by loss)
    } else if (lossFraction > 0) {
      // PARTIAL LOSS: trap remaining collateral
      const lossTotal      = lossFraction * deal.limitShare
      const remaining      = deal.limitShare - lossTotal
      totalLoss           += lossTotal
      newlyTrapped        += remaining
      newTrappedPositions.push({
        dealId:        deal.id,
        tier:          deal.layer.tier,
        amountMusd:    remaining,
        releaseSeason: currentSeason + cfg.trappingPeriodSeasons,
      })
    } else {
      // NO LOSS: full return + interest
      immediateReturn += deal.limitShare + interest
    }
  }

  return {
    dealRecords,
    totalPremium,
    totalInterest,
    totalLoss,
    newlyTrapped,
    immediateReturn,
    newTrappedPositions,
  }
}

// ── Trapped position management ───────────────────────────────────────────

/**
 * Accrue interest on trapped positions and release any that have matured.
 *
 * Interest compounds annually on the trapped principal.
 * Releases flow back to investor liquid capital.
 */
export function processTrappedPositions(
  trapped:       TrappedPosition[],
  currentSeason: number,
  cfg:           CapitalConfig
): { released: number; stillTrapped: TrappedPosition[] } {
  let released = 0
  const stillTrapped: TrappedPosition[] = []

  for (const pos of trapped) {
    if (pos.releaseSeason <= currentSeason) {
      // Matured: release principal + 1 season of interest (interest already tracked above for current)
      released += pos.amountMusd
    } else {
      // Compound interest on trapped principal
      const grown = { ...pos, amountMusd: pos.amountMusd * (1 + cfg.collateralYield) }
      stillTrapped.push(grown)
    }
  }

  return { released, stillTrapped }
}

// ── Investor net-worth calculation ─────────────────────────────────────────

/**
 * Compute investor equity at end of season.
 *
 *   equity = liquid (uninvested cash earning risk-free)
 *          + sum(trapped_positions.amount)
 *
 * The "deployed" capital has already been converted to either:
 *   - immediateReturn (no-loss deals)
 *   - losses (gone)
 *   - trapped positions
 *
 * @param prevEquity     Equity at start of season (before deployment)
 * @param availableCapital Capital deployed this season
 * @param cashKept       Capital kept as cash (prevEquity − availableCapital)
 * @param settlement     Season settlement results
 * @param released       Amount released from prior-season traps
 * @param riskFreeRate   Rate earned on uninvested cash
 */
export function computeEquity(
  prevEquity:       number,
  availableCapital: number,
  cashKept:         number,
  settlement:       SettlementResult,
  released:         number,
  riskFreeRate:     number
): number {
  const cashReturn   = cashKept * (1 + riskFreeRate)
  const dealReturn   = settlement.immediateReturn  // no-loss collateral + interest
  const lossCharge   = -settlement.totalLoss
  // Note: trapped is already subtracted (it's in newTrappedPositions, not available)
  // released comes from prior seasons' trapped positions
  return cashReturn + dealReturn + lossCharge + released
}

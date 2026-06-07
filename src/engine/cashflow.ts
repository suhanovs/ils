/**
 * Collateral mechanics, cashflow accounting, and deal settlement.
 *
 * === CORRECT ILS COLLATERAL MECHANICS ===
 *
 * Trust structure at deal start:
 *   Trust = limitShare = investorCapital + premium
 *   investorCapital = (1 − ROL) × limitShare   ← what the investor posts
 *   premium         = ROL × limitShare          ← paid by cedent into trust
 *
 * Settlement at season end:
 *
 *   NO LOSS (f = 0):
 *     Investor receives:  limitShare × (1 + riskFreeRate)
 *     = returned principal + interest on full collateral
 *     This is the ONLY case where the investor gets cash this season.
 *
 *   PARTIAL LOSS (0 < f < 1):
 *     Cedent claims:  f × limitShare  (confirmed loss — gone)
 *     Remaining (1−f) × limitShare is TRAPPED for 36 months.
 *     Investor receives:  ZERO this season (both premium and residual collateral
 *                          are frozen pending loss development).
 *     During the trap period, the frozen balance earns riskFreeRate (compounding).
 *     At release: (1−f) × limitShare × (1 + riskFreeRate)^trappingPeriod returned.
 *
 *   TOTAL LOSS (f = 1):
 *     Cedent claims:  limitShare  (everything)
 *     Investor receives:  ZERO — investor_capital is permanently lost.
 *
 * === EQUITY TRACKING ===
 *
 *   liquidWealth  = cashKept × (1+RFR) + immediateReturn + released
 *   trappedValue  = Σ trapped_positions.amountMusd  (compounding annually)
 *   total_equity  = liquidWealth + trappedValue
 *
 *   On release (season = origSeason + trappingPeriod):
 *     released = (1−f) × limitShare × (1+RFR)^trappingPeriod
 *              (one final RFR step is applied at release time)
 *
 * === SHARPE AND RETURNS ===
 *
 *   Annual return  = (equity_end − equity_start) / equity_start
 *   No-loss year:  ≈ (ROL + RFR) / (1 − ROL)            e.g. 67% at 37.5% ROL
 *   Loss year:     equity_start − Σ(f × limitShare_lost)  can be ≪ no-loss
 *
 *   A portfolio with 15% EL, 37.5% ROL, and ~15% per-deal annual loss probability
 *   should produce per-path Sharpe ≈ 1.4–1.7.  Higher Sharpe indicates insufficient
 *   loss frequency; adjust statePML100Musd downward to calibrate.
 */

import type { CapitalConfig } from './config'
import type { Deal, TrappedPosition, DealRecord } from './types'

// ── Settlement result ─────────────────────────────────────────────────────

export interface SettlementResult {
  dealRecords:     DealRecord[]
  /** Total premium paid by cedents (display only; already inside trust) */
  totalPremium:    number
  /** Interest earned on no-loss collateral (part of immediateReturn) */
  totalInterest:   number
  /** Confirmed losses paid to cedents (display; does not re-enter equity calc) */
  confirmedLoss:   number
  /**
   * Cash actually returned to investor this season:
   *   = Σ( limitShare × (1+RFR) ) for NO-LOSS deals only.
   * Zero from partial-loss and total-loss deals.
   */
  immediateReturn: number
  /** Nominal trapped amount (display; net of loss, before compounding) */
  newlyTrapped:    number
  newTrappedPositions: TrappedPosition[]
}

/**
 * Settle all deals at season end.
 *
 */
export function settleSeason(
  deals:         Deal[],
  lossFractions: Map<string, number>,
  currentSeason: number,
  cfg:           CapitalConfig
): SettlementResult {
  const dealRecords:           DealRecord[]              = []
  const newTrappedPositions:   TrappedPosition[]         = []
  let totalPremium    = 0
  let totalInterest   = 0
  let confirmedLoss   = 0
  let immediateReturn = 0
  let newlyTrapped    = 0

  for (const deal of deals) {
    const lossFraction = lossFractions.get(deal.layer.id) ?? 0
    const lossMusd     = lossFraction * deal.limitShare
    const releaseSeason = currentSeason + cfg.trappingPeriodSeasons

    totalPremium += deal.premium

    if (lossFraction >= 1.0) {
      // ── TOTAL LOSS ─────────────────────────────────────────────────────
      confirmedLoss += deal.limitShare
      dealRecords.push({ deal, lossFraction, lossMusd, status: 'total', releaseSeasonIfTrapped: releaseSeason })

    } else if (lossFraction > 0) {
      // ── PARTIAL LOSS ───────────────────────────────────────────────────
      // Surviving portion earns interest while trapped (item 10 confirmed).
      confirmedLoss  += lossMusd
      const remaining = (1 - lossFraction) * deal.limitShare
      newlyTrapped   += remaining
      newTrappedPositions.push({ dealId: deal.id, tier: deal.layer.tier, amountMusd: remaining, releaseSeason })
      dealRecords.push({ deal, lossFraction, lossMusd, status: 'partial', releaseSeasonIfTrapped: releaseSeason })

    } else {
      // ── CLEAN — no event activity ─────────────────────────────────────
      const interest   = deal.limitShare * cfg.riskFreeRate
      totalInterest   += interest
      immediateReturn += deal.limitShare + interest
      dealRecords.push({ deal, lossFraction: 0, lossMusd: 0, status: 'clean', releaseSeasonIfTrapped: releaseSeason })
    }
  }

  return {
    dealRecords,
    totalPremium,
    totalInterest,
    confirmedLoss,
    immediateReturn,
    newlyTrapped,
    newTrappedPositions,
  }
}

// ── Trapped position lifecycle ────────────────────────────────────────────

/**
 * Advance all trapped positions by one season:
 *   - Not yet mature → compound principal by riskFreeRate for another year.
 *   - Mature → apply one final year of riskFreeRate and release to liquid.
 *
 * Over a trappingPeriodSeasons = 3 trap, the released amount is:
 *   (1−f) × limitShare × (1 + riskFreeRate)^3
 * (one compounding step per year, final step applied at release).
 */
export function processTrappedPositions(
  trapped:       TrappedPosition[],
  currentSeason: number,
  cfg:           CapitalConfig
): { released: number; stillTrapped: TrappedPosition[]; trappedInterest: number; releasedInterest: number } {
  let released = 0
  let trappedInterest = 0
  let releasedInterest = 0
  const stillTrapped: TrappedPosition[] = []

  for (const pos of trapped) {
    if (pos.releaseSeason <= currentSeason) {
      // Mature: apply final year of interest, then release
      const interest = pos.amountMusd * cfg.riskFreeRate
      releasedInterest += interest
      released += pos.amountMusd + interest
    } else {
      // Not yet mature: compound for another year
      const interest = pos.amountMusd * cfg.riskFreeRate
      trappedInterest += interest
      stillTrapped.push({
        ...pos,
        amountMusd: pos.amountMusd + interest,
      })
    }
  }

  return { released, stillTrapped, trappedInterest, releasedInterest }
}

// ── Liquid equity calculation ──────────────────────────────────────────────

/**
 * Compute investor LIQUID equity at season end.
 *
 *   liquid = cashKept × (1 + riskFreeRate)
 *           + settlement.immediateReturn   (no-loss deals only)
 *           + released                     (matured trapped positions)
 *
 * total_equity = liquid + Σ trapped_positions.amountMusd
 *
 * NOTE: `released` from processTrappedPositions is already added to
 * liquidWealth in the simulator BEFORE this function is called (step 1).
 * Pass released=0 here; it is recorded on the SeasonRecord for display.
 */
export function computeLiquidReturn(
  cashKept:     number,
  settlement:   SettlementResult,
  released:     number,
  riskFreeRate: number
): number {
  return cashKept * (1 + riskFreeRate) + settlement.immediateReturn + released
}

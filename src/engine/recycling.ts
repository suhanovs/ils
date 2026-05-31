/**
 * Capital recycling and redeployment policy between seasons.
 *
 * Separation of concerns: decides how much of the investor's available
 * (non-trapped) capital is redeployed into the next season's book.
 *
 * Two modes:
 *
 *   'full'    — redeploy all liquid capital. Maximum compounding.
 *               Demonstrates leverage of the ILS return profile.
 *
 *   'partial' — redeploy only (redeploymentFraction) of liquid capital.
 *               Remainder held as uninvested cash earning riskFreeRate.
 *               Demonstrates conservative allocation / diversification.
 *
 * Trapped collateral is NEVER recycled early — it remains locked until
 * its 36-month development period expires, regardless of mode.
 *
 * Redeployable pool is defined as:
 *   liquid = equity − sum(trapped)
 *   redeployable = liquid × redeploymentFraction   (1.0 for 'full')
 *   cash_kept    = liquid × (1 − redeploymentFraction)
 *
 * The equity here is the mark-to-market value at the start of the new season
 * (after prior-season settlement, but before this season's deployment).
 */

import type { RecyclingConfig } from './config'
import type { TrappedPosition } from './types'

export interface DeploymentDecision {
  /** Capital to put into deals this season, USD millions */
  availableCapital: number
  /** Capital held as cash (earns risk-free rate), USD millions */
  cashKept: number
}

/**
 * Determine how much capital to deploy in the upcoming season.
 *
 * @param liquidEquity  Investor's liquid (non-trapped) wealth, USD millions
 * @param trapped       Current trapped positions (for information / audit only)
 * @param cfg           Recycling config
 */
export function decideDeployment(
  liquidWealth: number,
  _trapped:     TrappedPosition[],
  cfg:          RecyclingConfig
): DeploymentDecision {
  const liquidEquity = liquidWealth  // alias for clarity
  if (liquidEquity <= 0) {
    return { availableCapital: 0, cashKept: 0 }
  }

  const fraction = cfg.mode === 'full' ? 1.0 : cfg.redeploymentFraction
  const availableCapital = Math.max(0, liquidEquity * fraction)
  const cashKept         = liquidEquity - availableCapital

  return { availableCapital, cashKept }
}

/**
 * Compute the investor's liquid wealth given total equity and trapped positions.
 * liquid = total_equity − sum(trapped_amounts)
 */
export function computeLiquidEquity(
  totalEquity: number,
  trapped:     TrappedPosition[]
): number {
  const trappedTotal = trapped.reduce((s, p) => s + p.amountMusd, 0)
  return Math.max(0, totalEquity - trappedTotal)
}

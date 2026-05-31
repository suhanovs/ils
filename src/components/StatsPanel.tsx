/**
 * StatsPanel — summary statistics beneath the equity curve.
 * Adapts to single-run or MC mode.
 */

import type { PathResult, MCResult } from '../engine/types'
import type { SimConfig } from '../engine/config'

interface Props {
  singleResult: PathResult | null
  mcResult:     MCResult   | null
  mode:         'single' | 'mc'
  config:       SimConfig
}

const fmt = (v: number, decimals = 2) => v.toFixed(decimals)
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const dollar = (v: number) => `$${fmt(v)}M`
const sign = (v: number) => (v >= 0 ? '+' : '')

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="stat-card">
      <span className="label">{label}</span>
      <span className={`value text-base font-bold ${color ?? 'text-slate-100'}`}>{value}</span>
    </div>
  )
}

function SingleStats({ result, config }: { result: PathResult; config: SimConfig }) {
  const initial  = config.capital.initialCapitalMusd
  const terminal = result.terminalEquity
  const totalRet = (terminal - initial) / initial
  const n        = config.simulation.nSeasons

  const totalPremium  = result.seasons.reduce((s, r) => s + r.totalPremium, 0)
  const totalLoss     = result.seasons.reduce((s, r) => s + r.confirmedLoss, 0)
  const totalInterest = result.seasons.reduce((s, r) => s + r.totalInterest, 0)
  const nLossSeasons  = result.seasons.filter((r) => r.confirmedLoss > 0).length

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
      <Stat label="Terminal equity" value={dollar(terminal)}
        color={terminal > initial ? 'green' : 'red'} />
      <Stat label="Total return" value={`${sign(totalRet)}${pct(totalRet)}`}
        color={totalRet >= 0 ? 'green' : 'red'} />
      <Stat label="CAGR" value={`${sign(result.cagr)}${pct(result.cagr)}`}
        color={result.cagr >= 0 ? 'green' : 'red'} />
      <Stat label="Seasons" value={`${n}`} />
      <Stat label="Loss seasons" value={`${nLossSeasons}`} color={nLossSeasons > 0 ? 'amber' : 'green'} />
      <Stat label="Premiums earned" value={dollar(totalPremium)} color="blue" />
      <Stat label="Interest earned" value={dollar(totalInterest)} color="blue" />
      <Stat label="Losses paid" value={dollar(totalLoss)} color={totalLoss > 0 ? 'red' : 'green'} />
    </div>
  )
}

function MCStats({ result, config }: { result: MCResult; config: SimConfig }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
      <Stat label="Survival rate" value={pct(result.survivalRate)}
        color={result.survivalRate > 0.9 ? 'green' : result.survivalRate > 0.7 ? 'amber' : 'red'} />
      <Stat label="Paths run" value={result.nRuns.toLocaleString()} />
      <Stat label="Ruined" value={result.nRuined.toLocaleString()} color={result.nRuined > 0 ? 'red' : 'green'} />
      <Stat label="Median terminal" value={dollar(result.terminalMedian)} color="blue" />
      <Stat label="Mean CAGR" value={`${sign(result.cagrMean)}${pct(result.cagrMean)}`}
        color={result.cagrMean >= 0 ? 'green' : 'red'} />
      <Stat label="Median CAGR" value={`${sign(result.cagrP50)}${pct(result.cagrP50)}`}
        color={result.cagrP50 >= 0 ? 'green' : 'red'} />
      <Stat label="Sharpe ratio" value={fmt(result.sharpe)}
        color={result.sharpe > 1 ? 'green' : result.sharpe > 0.5 ? 'amber' : 'red'} />
      <Stat label="P5 terminal" value={dollar(result.terminalP5)} color="amber" />
    </div>
  )
}

export function StatsPanel({ singleResult, mcResult, mode, config }: Props) {
  if (mode === 'single' && singleResult) {
    return (
      <div className="mt-3">
        <SingleStats result={singleResult} config={config} />
      </div>
    )
  }
  if (mode === 'mc' && mcResult) {
    return (
      <div className="mt-3">
        <MCStats result={mcResult} config={config} />
      </div>
    )
  }
  return (
    <div className="mt-3 text-slate-500 text-xs text-center py-4">
      Run a simulation to see statistics.
    </div>
  )
}

/**
 * StatsPanel — key metrics displayed in a compact vertical column.
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

const fmtM   = (v: number) => `$${v.toFixed(2)}M`
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`
const fmtN   = (v: number) => v.toFixed(2)
const sign   = (v: number) => (v >= 0 ? '+' : '')

function Stat({
  label, value, color, sub,
}: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 border-b border-slate-700/50 last:border-0">
      <span className="text-xs text-slate-400 leading-tight flex-shrink-0">{label}</span>
      <span className={`text-xs font-bold font-mono text-right ${color ?? 'text-slate-100'}`}>
        {value}
        {sub && <span className="text-slate-500 font-normal ml-1">{sub}</span>}
      </span>
    </div>
  )
}

function SingleStats({ result, config }: { result: PathResult; config: SimConfig }) {
  const initial  = config.capital.initialCapitalMusd
  const terminal = result.terminalEquity
  const totalRet = (terminal - initial) / initial
  const nLoss    = result.seasons.filter(r => r.confirmedLoss > 0).length
  const nIbnr    = result.seasons.filter(r => r.deals.some(d => d.status === 'ibnr')).length
  const premium  = result.seasons.reduce((s, r) => s + r.totalPremium, 0)
  const losses   = result.seasons.reduce((s, r) => s + r.confirmedLoss, 0)
  const interest = result.seasons.reduce((s, r) => s + r.totalInterest, 0)

  return (
    <div className="px-1">
      <Stat label="Terminal equity" value={fmtM(terminal)}
        color={terminal > initial ? 'text-emerald-400' : 'text-red-400'} />
      <Stat label="Total return" value={`${sign(totalRet)}${fmtPct(totalRet)}`}
        color={totalRet >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      <Stat label="CAGR" value={`${sign(result.cagr)}${fmtPct(result.cagr)}`}
        color={result.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      <Stat label="Seasons" value={`${config.simulation.nSeasons}`} />
      <Stat label="Loss seasons" value={`${nLoss}`}
        color={nLoss > 0 ? 'text-red-400' : 'text-emerald-400'} />
      <Stat label="IBNR seasons" value={`${nIbnr}`}
        color={nIbnr > 0 ? 'text-amber-400' : 'text-emerald-400'} />
      <Stat label="Premiums earned" value={fmtM(premium)} color="text-blue-400" />
      <Stat label="Interest earned"  value={fmtM(interest)} color="text-blue-300" />
      <Stat label="Confirmed losses" value={fmtM(losses)}
        color={losses > 0 ? 'text-red-400' : 'text-emerald-400'} />
    </div>
  )
}

function MCStats({ result, config }: { result: MCResult; config: SimConfig }) {
  return (
    <div className="px-1">
      <Stat label="Survival rate" value={fmtPct(result.survivalRate)}
        color={result.survivalRate > 0.9 ? 'text-emerald-400' : result.survivalRate > 0.7 ? 'text-amber-400' : 'text-red-400'} />
      <Stat label="Paths run"      value={result.nRuns.toLocaleString()} />
      <Stat label="Ruined paths"   value={result.nRuined.toLocaleString()}
        color={result.nRuined > 0 ? 'text-red-400' : 'text-emerald-400'} />
      <Stat label="Median terminal" value={fmtM(result.terminalMedian)} color="text-blue-400" />
      <Stat label="P5 terminal"    value={fmtM(result.terminalP5)} color="text-amber-400" />
      <Stat label="P95 terminal"   value={fmtM(result.terminalP95)} color="text-purple-400" />
      <Stat label="Mean CAGR"      value={`${sign(result.cagrMean)}${fmtPct(result.cagrMean)}`}
        color={result.cagrMean >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      <Stat label="Median CAGR"    value={`${sign(result.cagrP50)}${fmtPct(result.cagrP50)}`}
        color={result.cagrP50 >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      <Stat label="Sharpe (median)" value={fmtN(result.sharpe)}
        color={result.sharpe > 1.3 ? 'text-emerald-400' : result.sharpe > 0.8 ? 'text-amber-400' : 'text-red-400'}
        sub="per-path" />
      <Stat label="Initial capital" value={fmtM(config.capital.initialCapitalMusd)} />
    </div>
  )
}

export function StatsPanel({ singleResult, mcResult, mode, config }: Props) {
  if (mode === 'single' && singleResult) {
    return <SingleStats result={singleResult} config={config} />
  }
  if (mode === 'mc' && mcResult) {
    return <MCStats result={mcResult} config={config} />
  }
  return (
    <div className="text-slate-600 text-xs px-2 py-3">
      Run a simulation to see statistics.
    </div>
  )
}

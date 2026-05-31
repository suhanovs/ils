/**
 * SeasonLog — per-season financial summary.
 *
 * Columns:
 *   Ssn  |  Start$  |  Prem  |  Int  |  Loss  |  Trap  |  Rel  |  End$  |  Events
 *
 * Events column shows each hurricane's name/year and the percentage of the
 * total industry loss routed to each affected covered state.
 *
 * Start equity = end equity of the previous season (or initial capital for S1).
 * Market multiples are no longer shown here — they live in the Market Cycle chart.
 */

import type { PathResult } from '../engine/types'

interface Props {
  result:         PathResult
  initialCapital: number
}

const m   = (v: number) => `$${v.toFixed(2)}M`
const ms  = (v: number) => v.toFixed(2)   // compact: no $ suffix in narrow cells

function Cell({ v, color, title }: { v: string; color?: string; title?: string }) {
  return (
    <td className={`px-1.5 py-0.5 font-mono whitespace-nowrap ${color ?? 'text-slate-300'}`} title={title}>
      {v}
    </td>
  )
}

export function SeasonLog({ result, initialCapital }: Props) {
  return (
    <div className="overflow-x-auto overflow-y-auto h-full text-xs">
      <table className="border-collapse w-max min-w-full">
        <thead className="sticky top-0 bg-slate-800 z-10">
          <tr className="text-slate-400 text-left">
            <th className="px-1.5 py-1 font-normal sticky left-0 bg-slate-800 border-r border-slate-700">Ssn</th>
            <th className="px-1.5 py-1 font-normal">Start $M</th>
            <th className="px-1.5 py-1 font-normal">Prem</th>
            <th className="px-1.5 py-1 font-normal">Int</th>
            <th className="px-1.5 py-1 font-normal">Loss</th>
            <th className="px-1.5 py-1 font-normal">Trap</th>
            <th className="px-1.5 py-1 font-normal">Rel</th>
            <th className="px-1.5 py-1 font-normal">End $M</th>
            <th className="px-1.5 py-1 font-normal min-w-[180px]">Events</th>
          </tr>
        </thead>
        <tbody>
          {result.seasons.map((s, i) => {
            const startEquity = i === 0 ? initialCapital : result.seasons[i - 1].equity
            const hasLoss     = s.confirmedLoss > 0
            const hasTrap     = s.newlyTrapped  > 0
            const hasRel      = s.released      > 0
            const equityUp    = s.equity > startEquity
            const isIbnr      = s.deals.some(d => d.status === 'ibnr')

            // Format each event as "Name (yr) FL:45% TX:35% MS:20%"
            const eventStrings = s.events.map(ev => {
              const name = ev.name ? `${ev.name}` : `TC-${ev.year}`
              const states = ev.stateSplits
                .filter(sp => sp.weight > 0.02)  // skip <2% contributions
                .sort((a, b) => b.weight - a.weight)
                .map(sp => `${sp.state}:${(sp.weight * 100).toFixed(0)}%`)
                .join(' ')
              return `${name} ${states}`
            })

            return (
              <tr
                key={s.season}
                className={`border-t border-slate-700/40 ${
                  hasLoss ? 'bg-red-950/25' : isIbnr ? 'bg-amber-950/20' : ''
                }`}
              >
                {/* Season # */}
                <td className="px-1.5 py-0.5 text-slate-400 sticky left-0 bg-slate-800 border-r border-slate-700 font-mono">
                  {s.season}
                </td>

                {/* Start equity */}
                <Cell v={ms(startEquity)} color="text-slate-400" />

                {/* Premium */}
                <Cell v={ms(s.totalPremium)} color="text-emerald-400"
                  title={`Premium income this season`} />

                {/* Interest */}
                <Cell v={s.totalInterest > 0 ? ms(s.totalInterest) : '—'}
                  color="text-blue-400" title="Interest on no-loss collateral" />

                {/* Confirmed loss */}
                <Cell
                  v={hasLoss ? ms(s.confirmedLoss) : '—'}
                  color={hasLoss ? 'text-red-400 font-bold' : 'text-slate-600'}
                  title="Confirmed losses paid to cedents"
                />

                {/* Newly trapped */}
                <Cell
                  v={hasTrap ? ms(s.newlyTrapped) : '—'}
                  color={hasTrap ? 'text-amber-400' : 'text-slate-600'}
                  title="Collateral frozen (IBNR + partial losses)"
                />

                {/* Released from prior traps */}
                <Cell
                  v={hasRel ? ms(s.released) : '—'}
                  color={hasRel ? 'text-emerald-300' : 'text-slate-600'}
                  title="Released from 36-month development traps"
                />

                {/* End equity */}
                <Cell
                  v={ms(s.equity)}
                  color={equityUp ? 'text-slate-100 font-bold' : 'text-red-300 font-bold'}
                  title="Equity at end of season (liquid + trapped)"
                />

                {/* Events */}
                <td className="px-1.5 py-0.5 font-mono min-w-[180px]">
                  {eventStrings.length > 0 ? (
                    <span className="text-red-300">
                      {eventStrings.join('  ·  ')}
                    </span>
                  ) : (
                    <span className="text-slate-600 italic">quiet</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

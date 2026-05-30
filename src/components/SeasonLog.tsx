/**
 * SeasonLog — scrollable table of per-season results from a single run.
 */

import type { PathResult } from '../engine/types'

interface Props { result: PathResult }

const m = (v: number) => `$${v.toFixed(2)}M`
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

export function SeasonLog({ result }: Props) {
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-64 text-xs">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-slate-800">
          <tr className="text-slate-400 text-left">
            <th className="px-2 py-1">Ssn</th>
            <th className="px-2 py-1">Equity</th>
            <th className="px-2 py-1">Premium</th>
            <th className="px-2 py-1">Interest</th>
            <th className="px-2 py-1">Loss</th>
            <th className="px-2 py-1">Trapped</th>
            <th className="px-2 py-1">Released</th>
            <th className="px-2 py-1">Events</th>
            <th className="px-2 py-1">Jr×</th>
            <th className="px-2 py-1">Mid×</th>
            <th className="px-2 py-1">Rem×</th>
          </tr>
        </thead>
        <tbody>
          {result.seasons.map((s) => {
            const hasLoss = s.totalLoss > 0
            return (
              <tr key={s.season}
                className={`border-t border-slate-700 ${hasLoss ? 'bg-red-950/30' : ''}`}>
                <td className="px-2 py-0.5 text-slate-400">{s.season}</td>
                <td className="px-2 py-0.5 font-bold text-slate-100">{m(s.equity)}</td>
                <td className="px-2 py-0.5 text-emerald-400">{m(s.totalPremium)}</td>
                <td className="px-2 py-0.5 text-blue-400">{m(s.totalInterest)}</td>
                <td className={`px-2 py-0.5 ${s.totalLoss > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                  {s.totalLoss > 0 ? m(s.totalLoss) : '—'}
                </td>
                <td className={`px-2 py-0.5 ${s.newlyTrapped > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                  {s.newlyTrapped > 0 ? m(s.newlyTrapped) : '—'}
                </td>
                <td className={`px-2 py-0.5 ${s.released > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {s.released > 0 ? m(s.released) : '—'}
                </td>
                <td className="px-2 py-0.5">
                  {s.events.length > 0
                    ? <span className="text-red-400">{s.events.map((e) => e.name ?? String(e.year)).join(', ')}</span>
                    : <span className="text-slate-600">quiet</span>
                  }
                </td>
                <td className="px-2 py-0.5 text-yellow-400">{s.marketMultiple.junior.toFixed(2)}×</td>
                <td className="px-2 py-0.5 text-blue-400">{s.marketMultiple.mid.toFixed(2)}×</td>
                <td className="px-2 py-0.5 text-purple-400">{s.marketMultiple.remote.toFixed(2)}×</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

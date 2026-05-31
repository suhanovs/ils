/**
 * LayerGrid — per-season deal status heatmap.
 *
 * Rows    = state × tier combinations written at least once
 * Columns = seasons 1…N
 *
 * Each cell shows: status pill + the ROL% written that season.
 *   Green   OK    — clean, collateral returned
 *   Amber   IBNR  — state hit, no claim yet, full trust trapped 36mo
 *   Orange  PART  — layer breached, remaining collateral trapped
 *   Red     LOSS  — layer exhausted, investor capital lost
 */

import type { PathResult, DealStatus } from '../engine/types'
import { COVERED_STATES } from '../engine/types'

interface Props { result: PathResult }

const TIERS = ['junior', 'mid'] as const
type Tier = typeof TIERS[number]

interface CellData {
  status: DealStatus
  rol:    number   // ROL written for this deal (0–1)
}

// Status → tailwind classes for the pill background + text
const STATUS_BG: Record<DealStatus, string> = {
  clean:   'bg-emerald-800/80 text-emerald-200',
  ibnr:    'bg-amber-700/80   text-amber-100',
  partial: 'bg-orange-700/80  text-orange-100',
  total:   'bg-red-800/80     text-red-200',
}
const STATUS_LABEL: Record<DealStatus, string> = {
  clean:   'OK',
  ibnr:    'IBNR',
  partial: 'PART',
  total:   'LOSS',
}

function statusSeverity(s: DealStatus): number {
  return { clean: 0, ibnr: 1, partial: 2, total: 3 }[s]
}

export function LayerGrid({ result }: Props) {
  const nSeasons = result.seasons.length

  // season index → (state-tier key → CellData)
  const seasonMaps: Map<string, CellData>[] = result.seasons.map(season => {
    const m = new Map<string, CellData>()
    for (const dr of season.deals) {
      const key = `${dr.deal.layer.cedent.state}-${dr.deal.layer.tier}`
      const prev = m.get(key)
      if (!prev || statusSeverity(dr.status) > statusSeverity(prev.status)) {
        m.set(key, { status: dr.status, rol: dr.deal.layer.rol })
      }
    }
    return m
  })

  // Only show positions written at least once
  const rows: { state: string; tier: Tier; key: string }[] = []
  for (const state of COVERED_STATES) {
    for (const tier of TIERS) {
      const key = `${state}-${tier}`
      if (result.seasons.some((_, i) => seasonMaps[i].has(key))) {
        rows.push({ state, tier, key })
      }
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="overflow-auto h-full text-xs">
      <table className="border-collapse w-max min-w-full">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-800 z-10 px-2 py-1 text-left text-slate-400 font-normal whitespace-nowrap border-r border-slate-700 w-20">
              Layer
            </th>
            {Array.from({ length: nSeasons }, (_, i) => (
              <th key={i + 1} className="px-1 py-1 text-left text-slate-500 font-normal min-w-[4.5rem]">
                S{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ state, tier, key }) => (
            <tr key={key} className="border-t border-slate-700/40">
              {/* Row header */}
              <td className="sticky left-0 bg-slate-800 z-10 px-2 py-0.5 whitespace-nowrap border-r border-slate-700">
                <span className="text-slate-300 font-mono">{state}</span>
                <span className={`ml-1 ${tier === 'junior' ? 'text-amber-400' : 'text-blue-400'}`}>
                  {tier === 'junior' ? 'JR' : 'MD'}
                </span>
              </td>
              {/* Season cells */}
              {Array.from({ length: nSeasons }, (_, i) => {
                const cell = seasonMaps[i].get(key)
                return (
                  <td key={i} className="px-1 py-0.5 text-left">
                    {cell ? (
                      <span
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono leading-4 whitespace-nowrap ${STATUS_BG[cell.status]}`}
                        title={`${key} S${i + 1}: ${cell.status} @ ROL ${(cell.rol * 100).toFixed(1)}%`}
                      >
                        <span>{STATUS_LABEL[cell.status]}</span>
                        <span className="opacity-70">{(cell.rol * 100).toFixed(0)}%</span>
                      </span>
                    ) : (
                      <span className="text-slate-700 pl-1">·</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex gap-3 mt-2 px-2 text-xs text-slate-500 flex-wrap">
        {(Object.entries(STATUS_BG) as [DealStatus, string][]).map(([s, cls]) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${cls.split(' ')[0]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="text-slate-600">— pill shows ROL%</span>
      </div>
    </div>
  )
}

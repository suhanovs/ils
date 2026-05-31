/**
 * LayerGrid — per-season deal status heatmap.
 *
 * Rows    = state × tier combinations (8 states × 2 tiers = up to 16 positions)
 * Columns = seasons 1…N
 *
 * Cell colours:
 *   Dark (empty) — layer not written this season
 *   Green        — clean: no event in state, collateral returned
 *   Amber/Yellow — IBNR: state was hit, layer not breached but trapped 36 months
 *   Orange       — partial: layer breached, remaining collateral trapped
 *   Red          — total: layer exhausted, investor capital lost
 */

import type { PathResult } from '../engine/types'
import type { DealStatus } from '../engine/types'
import { COVERED_STATES } from '../engine/types'

interface Props {
  result: PathResult
}

const TIERS = ['junior', 'mid'] as const
type Tier = typeof TIERS[number]

const TIER_LABEL: Record<Tier, string> = { junior: 'JR', mid: 'MD' }

const STATUS_CLASS: Record<DealStatus, string> = {
  clean:   'bg-emerald-800 text-emerald-200',
  ibnr:    'bg-amber-700 text-amber-100',
  partial: 'bg-orange-700 text-orange-100',
  total:   'bg-red-800 text-red-200',
}
const STATUS_LABEL: Record<DealStatus, string> = {
  clean:   'OK',
  ibnr:    'IBNR',
  partial: 'PART',
  total:   'LOSS',
}

export function LayerGrid({ result }: Props) {
  const nSeasons = result.seasons.length

  // Build lookup: season → (state-tier key → status)
  type StatusMap = Map<string, DealStatus>
  const seasonMaps: StatusMap[] = result.seasons.map(season => {
    const m = new Map<string, DealStatus>()
    for (const dr of season.deals) {
      const key = `${dr.deal.layer.cedent.state}-${dr.deal.layer.tier}`
      // Keep the worst status if same position appears twice (shouldn't, but just in case)
      const prev = m.get(key)
      if (!prev || statusSeverity(dr.status) > statusSeverity(prev)) {
        m.set(key, dr.status)
      }
    }
    return m
  })

  const rows: { state: string; tier: Tier; key: string }[] = []
  for (const state of COVERED_STATES) {
    for (const tier of TIERS) {
      // Only show positions that were written at least once
      const key = `${state}-${tier}`
      if (result.seasons.some((_, i) => seasonMaps[i].has(key))) {
        rows.push({ state, tier, key })
      }
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="overflow-auto text-xs h-full">
      <table className="border-collapse w-max min-w-full">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-800 z-10 px-2 py-1 text-left text-slate-400 font-normal whitespace-nowrap border-r border-slate-700">
              Layer
            </th>
            {Array.from({ length: nSeasons }, (_, i) => (
              <th key={i + 1} className="px-1 py-1 text-center text-slate-500 font-normal w-10 min-w-[2.5rem]">
                S{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ state, tier, key }) => (
            <tr key={key} className="border-t border-slate-700/40">
              <td className="sticky left-0 bg-slate-800 z-10 px-2 py-0.5 whitespace-nowrap border-r border-slate-700">
                <span className="text-slate-300 font-mono">
                  {state}
                </span>
                <span className={`ml-1 text-xs ${tier === 'junior' ? 'text-amber-400' : 'text-blue-400'}`}>
                  {TIER_LABEL[tier]}
                </span>
              </td>
              {Array.from({ length: nSeasons }, (_, i) => {
                const status = seasonMaps[i].get(key)
                return (
                  <td key={i} className="px-0.5 py-0.5 text-center">
                    {status ? (
                      <span
                        className={`inline-block w-9 rounded text-center text-xs leading-4 py-0.5 font-mono ${STATUS_CLASS[status]}`}
                        title={`${key} S${i + 1}: ${status}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    ) : (
                      <span className="inline-block w-9 text-slate-700 text-center">·</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-3 mt-2 px-2 text-xs text-slate-500">
        {(Object.entries(STATUS_CLASS) as [DealStatus, string][]).map(([s, cls]) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${cls.split(' ')[0]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  )
}

function statusSeverity(s: DealStatus): number {
  return { clean: 0, ibnr: 1, partial: 2, total: 3 }[s]
}

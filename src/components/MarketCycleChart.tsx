/**
 * MarketCycleChart — two stacked charts:
 *
 *  TOP    — Selected-state pricing over time in simulated mode.
 *            Shows junior/mid ROL for the selected state + state loss bars.
 *            In historical mode: market multiples + TC loss bars.
 *
 *  BOTTOM — State-specific junior EL (loss-on-line) over time.
 *            In simulated mode: per-state junior EL from SeasonRecord.stateJuniorEl.
 *            In historical mode: static reference lines (5% / 2% / 1%).
 *            EL is identical for all cedents (global drift); this is effectively
 *            the "industry" EL assumption the model uses.
 */

import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { PathResult, State } from '../engine/types'
import type { ROLRecord } from '../data/types'
import { COVERED_STATES } from '../engine/types'

interface Props {
  singleResult: PathResult | null
  rolHistory:   ROLRecord[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function commonOpt(): any {
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: { trigger: 'axis' },
    legend: { top: 2, right: 0, textStyle: { color: '#94a3b8', fontSize: 9 }, itemWidth: 12, itemHeight: 7 },
    grid: { left: 46, right: 10, top: 26, bottom: 28 },
  }
}

export function MarketCycleChart({ singleResult, rolHistory }: Props) {
  const [selectedState, setSelectedState] = useState<State>('FL')
  const topRef = useRef<HTMLDivElement>(null)
  const botRef = useRef<HTMLDivElement>(null)
  const topChart = useRef<echarts.ECharts | null>(null)
  const botChart = useRef<echarts.ECharts | null>(null)

  // Init both charts
  useEffect(() => {
    if (topRef.current) {
      topChart.current = echarts.init(topRef.current, 'dark')
      const obs = new ResizeObserver(() => topChart.current?.resize())
      obs.observe(topRef.current)
    }
    if (botRef.current) {
      botChart.current = echarts.init(botRef.current, 'dark')
      const obs = new ResizeObserver(() => botChart.current?.resize())
      obs.observe(botRef.current)
    }
    return () => {
      topChart.current?.dispose()
      botChart.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const tc = topChart.current
    const bc = botChart.current
    if (!tc || !bc) return

    if (singleResult && singleResult.seasons.length > 0) {
      const seasons = singleResult.seasons.map(s => `S${s.season}`)
      const stateLosses = singleResult.seasons.map((s) => {
        let loss = 0
        for (const ev of s.events) {
          for (const split of ev.stateSplits) {
            if (split.state === selectedState) loss += ev.industryLossMusd * split.weight
          }
        }
        return +(loss / 1000).toFixed(2)
      })

      const stateJuniorRol = singleResult.seasons.map((s) => {
        const raw = (s.stateJuniorEl[selectedState] ?? 0) * s.marketMultiple.junior
        return +Math.min(0.60, raw).toFixed(4)
      })

      const stateMidRol = singleResult.seasons.map((s) => {
        const raw = (s.stateMidEl[selectedState] ?? 0) * s.marketMultiple.mid
        return +Math.min(0.35, raw).toFixed(4)
      })

      // ── TOP: selected-state ROL + state loss ────────────────────────
      tc.setOption({
        ...commonOpt(),
        title: {
          text: `${selectedState} pricing`,
          textStyle: { color: '#64748b', fontSize: 10 },
          top: 4,
          left: 6,
        },
        xAxis: { type: 'category', data: seasons, axisLabel: { color: '#94a3b8', fontSize: 9 } },
        yAxis: [
          { type: 'value', name: 'ROL %', nameTextStyle: { color: '#94a3b8', fontSize: 9 },
            axisLabel: { color: '#94a3b8', fontSize: 9, formatter: (v: number) => `${(v * 100).toFixed(0)}%` }, splitLine: { lineStyle: { color: '#1e293b' } } },
          { type: 'value', name: '$Bn', nameTextStyle: { color: '#94a3b8', fontSize: 9 },
            axisLabel: { color: '#94a3b8', fontSize: 9 }, splitLine: { show: false } },
        ],
        series: [
          { name: `${selectedState} Loss $Bn`, type: 'bar', yAxisIndex: 1, data: stateLosses,
            color: '#f87171', itemStyle: { color: '#f87171', opacity: 0.5 }, barMaxWidth: 14 },
          { name: `${selectedState} Jr ROL`, type: 'line',
            data: stateJuniorRol,
            color: '#fbbf24',
            lineStyle: { color: '#fbbf24', width: 2 }, symbol: 'none', smooth: true },
          { name: `${selectedState} Mid ROL`, type: 'line',
            data: stateMidRol,
            color: '#60a5fa',
            lineStyle: { color: '#60a5fa', width: 2 }, symbol: 'none', smooth: true },
        ],
      }, true)

      // ── BOTTOM: selected-state EL regimes (junior + mid) ────────────
      bc.setOption({
        ...commonOpt(),
        title: {
          text: `${selectedState} EL regime`,
          textStyle: { color: '#64748b', fontSize: 10 },
          top: 4,
          left: 6,
        },
        xAxis: { type: 'category', data: seasons, axisLabel: { color: '#94a3b8', fontSize: 9 } },
        yAxis: {
          type: 'value', name: 'EL / limit', nameTextStyle: { color: '#94a3b8', fontSize: 9 },
          axisLabel: {
            color: '#94a3b8', fontSize: 9,
            formatter: (v: number) => `${(v * 100).toFixed(1)}%`,
          },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
          {
            name: `${selectedState} Jr EL`,
            type: 'line',
            data: singleResult.seasons.map(s => +(s.stateJuniorEl[selectedState] ?? 0).toFixed(4)),
            color: '#f59e0b',
            lineStyle: { color: '#f59e0b', width: 2 },
            symbol: 'none',
            smooth: false,
          },
          {
            name: `${selectedState} Mid EL`,
            type: 'line',
            data: singleResult.seasons.map(s => +(s.stateMidEl[selectedState] ?? 0).toFixed(4)),
            color: '#60a5fa',
            lineStyle: { color: '#60a5fa', width: 2 },
            symbol: 'none',
            smooth: false,
          },
        ],
      }, true)

    } else {
      // ── HISTORICAL mode ──────────────────────────────────────────────
      const valid  = rolHistory.filter(r => r.multJunior5 != null)
      const years  = valid.map(r => String(r.year))

      tc.setOption({
        ...commonOpt(),
        xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: 9 } },
        yAxis: [
          { type: 'value', name: 'Multiple ×', nameTextStyle: { color: '#94a3b8', fontSize: 9 },
            axisLabel: { color: '#94a3b8', fontSize: 9 }, splitLine: { lineStyle: { color: '#1e293b' } } },
          { type: 'value', name: 'TC $Bn', nameTextStyle: { color: '#94a3b8', fontSize: 9 },
            axisLabel: { color: '#94a3b8', fontSize: 9 }, splitLine: { show: false } },
        ],
        series: [
          { name: 'TC $Bn', type: 'bar', yAxisIndex: 1,
            data: valid.map(r => r.insuredTcBn ?? 0),
            color: '#f87171', itemStyle: { color: '#f87171', opacity: 0.55 }, barMaxWidth: 14 },
          { name: '5% EL ×', type: 'line',
            data: valid.map(r => r.multJunior5 ?? null),
            color: '#fbbf24',
            lineStyle: { color: '#fbbf24', width: 2 }, symbol: 'none', smooth: true },
          { name: '2% EL ×', type: 'line',
            data: valid.map(r => r.multMid2 ?? null),
            color: '#60a5fa',
            lineStyle: { color: '#60a5fa', width: 2 }, symbol: 'none', smooth: true },
          { name: '1% EL ×', type: 'line',
            data: valid.map(r => r.multRemote1 ?? null),
            color: '#a78bfa',
            lineStyle: { color: '#a78bfa', width: 2 }, symbol: 'none', smooth: true },
        ],
      }, true)

      // Historical EL: static reference lines at assumed baselines
      bc.setOption({
        ...commonOpt(),
        title: { text: 'EL baseline (industry reference)', textStyle: { color: '#475569', fontSize: 9 }, top: 4, left: 4 },
        xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: 9 } },
        yAxis: {
          type: 'value', name: 'EL / limit', nameTextStyle: { color: '#94a3b8', fontSize: 9 },
          max: 0.12,
          axisLabel: {
            color: '#94a3b8', fontSize: 9,
            formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
          },
          splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
          { name: 'Junior 5%', type: 'line',
            data: years.map(() => 0.05),
            color: '#fbbf24',
            lineStyle: { color: '#fbbf24', width: 1.5, type: 'dashed' }, symbol: 'none' },
          { name: 'Mid 2%', type: 'line',
            data: years.map(() => 0.02),
            color: '#60a5fa',
            lineStyle: { color: '#60a5fa', width: 1.5, type: 'dashed' }, symbol: 'none' },
          { name: 'Remote 1%', type: 'line',
            data: years.map(() => 0.01),
            color: '#a78bfa',
            lineStyle: { color: '#a78bfa', width: 1.5, type: 'dashed' }, symbol: 'none' },
        ],
      }, true)
    }
  }, [singleResult, rolHistory, selectedState])

  return (
    <div className="flex flex-col h-full gap-1">
      {singleResult && (
        <div className="flex items-center gap-2 px-1 py-0.5 text-[10px] text-slate-400">
          <span>State view</span>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value as State)}
            className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200"
          >
            {COVERED_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex-1 min-h-0" ref={topRef} />
      <div className="flex-1 min-h-0" ref={botRef} />
    </div>
  )
}

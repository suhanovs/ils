/**
 * EquityCurve — the central hero chart.
 *
 * Single-run mode: one equity line with event markers and ruin threshold.
 * MC mode: percentile fan (P5/P25/P50/P75/P95) with ruin threshold.
 */

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { PathResult, MCResult } from '../engine/types'
import type { SimConfig } from '../engine/config'

interface Props {
  singleResult: PathResult | null
  mcResult:     MCResult   | null
  mode:         'single' | 'mc'
  config:       SimConfig
}

export function EquityCurve({ singleResult, mcResult, mode, config }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<echarts.ECharts | null>(null)

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current = echarts.init(containerRef.current, 'dark')
    const obs = new ResizeObserver(() => chartRef.current?.resize())
    obs.observe(containerRef.current)
    return () => { obs.disconnect(); chartRef.current?.dispose() }
  }, [])

  // Update chart when data changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const initial = config.capital.initialCapitalMusd
    const ruin    = initial * config.simulation.ruinThresholdFraction
    const nS      = config.simulation.nSeasons
    const seasons = Array.from({ length: nS + 1 }, (_, i) => i)   // 0 = start

    const baseOption: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 60, right: 20, top: 30, bottom: 50 },
      tooltip: {
        trigger: 'axis',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const s = params[0].axisValueLabel ?? params[0].axisValue ?? ''
          const lines = [`<b>Season ${s}</b>`]
          for (const p of params) {
            if (p.value == null) continue
            const v = Array.isArray(p.value) ? p.value[1] : p.value
            if (v == null) continue
            lines.push(`${p.marker}${p.seriesName}: <b>$${Number(v).toFixed(2)}M</b>`)
          }
          return lines.join('<br/>')
        },
      },
      xAxis: {
        type: 'category',
        data: seasons,
        name: 'Season',
        nameLocation: 'middle',
        nameGap: 30,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value',
        name: 'Equity ($M)',
        nameLocation: 'middle',
        nameGap: 48,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', formatter: (v: number) => `$${v.toFixed(0)}M` },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      series: [],
    }

    if (mode === 'single' && singleResult) {
      const equityData = [initial, ...singleResult.seasons.map((s) => s.equity)]
      const eventSeasons = singleResult.seasons
        .filter((s) => s.events.length > 0)
        .map((s) => s.season)

      const markPoints = eventSeasons.map((s) => ({
        name: `event-${s}`,
        coord: [s, singleResult.seasons[s - 1].equity],
        symbol: 'pin',
        symbolSize: 20,
        itemStyle: { color: '#f87171' },
        label: { show: false },
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      baseOption.series = [
        { type: 'line', name: 'Ruin threshold', data: seasons.map(() => ruin),
          lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, symbol: 'none', z: 0 },
        { type: 'line', name: 'Initial capital', data: seasons.map(() => initial),
          lineStyle: { color: '#475569', type: 'dotted', width: 1 }, symbol: 'none', z: 0 },
        { type: 'line', name: 'Equity', data: equityData,
          lineStyle: { color: '#38bdf8', width: 2.5 },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1,
            [{ offset: 0, color: 'rgba(56,189,248,0.25)' }, { offset: 1, color: 'rgba(56,189,248,0.02)' }]) },
          symbol: 'circle', symbolSize: 4,
          itemStyle: { color: '#38bdf8' },
          markPoint: { data: markPoints as any },
          z: 3 },
      ] as any

    } else if (mode === 'mc' && mcResult) {
      const toSeries = (data: number[], name: string, color: string, opacity: number) => ({
        type: 'line' as const,
        name,
        data: [initial, ...data],
        lineStyle: { color, width: opacity > 0.5 ? 2 : 1, opacity },
        areaStyle: opacity < 0.5 ? undefined : {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: `${color}22` },
            { offset: 1, color: `${color}05` },
          ]),
        },
        symbol: 'none',
        smooth: true,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      baseOption.series = [
        { type: 'line', name: 'Ruin threshold', data: seasons.map(() => ruin),
          lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, symbol: 'none', z: 0 },
        toSeries(mcResult.equityP5,  'P5',  '#f87171', 0.4),
        toSeries(mcResult.equityP25, 'P25', '#60a5fa', 0.5),
        toSeries(mcResult.equityP50, 'Median', '#34d399', 0.9),
        toSeries(mcResult.equityP75, 'P75', '#60a5fa', 0.5),
        toSeries(mcResult.equityP95, 'P95', '#a78bfa', 0.4),
      ] as any
    } else {
      // Empty state — just show the initial point and ruin line
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      baseOption.series = [
        { type: 'line', name: 'Ruin threshold', data: seasons.map(() => ruin),
          lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, symbol: 'none' },
        { type: 'line', name: 'Equity', data: [initial, ...Array(nS).fill(null)],
          lineStyle: { color: '#38bdf8', width: 2 }, symbol: 'circle' },
      ] as any
    }

    chart.setOption(baseOption, true)
  }, [singleResult, mcResult, mode, config])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[340px]" />
  )
}

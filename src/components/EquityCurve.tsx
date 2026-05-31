import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { PathResult, MCResult } from '../engine/types'
import type { SimConfig } from '../engine/config'

interface Props {
  singleResult:   PathResult | null
  noTrapResult:   PathResult | null
  noStickyResult: PathResult | null
  mcResult:       MCResult   | null
  mode:           'single' | 'mc'
  config:         SimConfig
}

export function EquityCurve({ singleResult, noTrapResult, noStickyResult, mcResult, mode, config }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    chartRef.current = echarts.init(containerRef.current, 'dark')
    const obs = new ResizeObserver(() => chartRef.current?.resize())
    obs.observe(containerRef.current)
    return () => { obs.disconnect(); chartRef.current?.dispose() }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const initial = config.capital.initialCapitalMusd
    const ruin    = initial * config.simulation.ruinThresholdFraction
    const nS      = config.simulation.nSeasons
    const seasons = Array.from({ length: nS + 1 }, (_, i) => i)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseOption: any = {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 60, right: 20, top: 30, bottom: 50 },
      tooltip: {
        trigger: 'axis',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const lines = [`<b>Season ${params[0].axisValueLabel ?? params[0].axisValue}</b>`]
          for (const p of params) {
            const v = Array.isArray(p.value) ? p.value[1] : p.value
            if (v == null) continue
            lines.push(`${p.marker}${p.seriesName}: <b>$${Number(v).toFixed(2)}M</b>`)
          }
          return lines.join('<br/>')
        },
      },
      xAxis: {
        type: 'category', data: seasons, name: 'Season',
        nameLocation: 'middle', nameGap: 30,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value', name: 'Equity ($M)', nameLocation: 'middle', nameGap: 50,
        axisLine: { lineStyle: { color: '#475569' } },
        axisLabel: { color: '#94a3b8', formatter: (v: number) => `$${v.toFixed(0)}M` },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
    }

    const ruinSeries = {
      type: 'line', name: 'Ruin', data: seasons.map(() => ruin),
      lineStyle: { color: '#dc2626', type: 'dashed', width: 1 },
      symbol: 'none', z: 0,
    }
    const initialSeries = {
      type: 'line', name: 'Initial', data: seasons.map(() => initial),
      lineStyle: { color: '#334155', type: 'dotted', width: 1 },
      symbol: 'none', z: 0,
    }

    if (mode === 'single' && singleResult) {
      const equityData = [initial, ...singleResult.seasons.map(s => s.equity)]
      const eventSeasons = singleResult.seasons.filter(s => s.events.length > 0).map(s => s.season)
      const marks = eventSeasons.map(s => ({
        name: `ev-${s}`, coord: [s, singleResult.seasons[s - 1].equity],
        symbol: 'pin', symbolSize: 18,
        itemStyle: { color: '#f87171' }, label: { show: false },
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [ruinSeries, initialSeries]

      // Comparison overlays (same seed, different config)
      if (noTrapResult) {
        series.push({
          type: 'line', name: 'No-trap',
          data: [initial, ...noTrapResult.seasons.map(s => s.equity)],
          lineStyle: { color: '#a3e635', type: 'dashed', width: 1.5 },
          symbol: 'none', smooth: false,
        })
      }
      if (noStickyResult) {
        series.push({
          type: 'line', name: 'No-sticky',
          data: [initial, ...noStickyResult.seasons.map(s => s.equity)],
          lineStyle: { color: '#c084fc', type: 'dotted', width: 1.5 },
          symbol: 'none', smooth: false,
        })
      }

      // Main equity line on top
      series.push({
        type: 'line', name: 'Equity',
        data: equityData,
        lineStyle: { color: '#38bdf8', width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56,189,248,0.2)' },
            { offset: 1, color: 'rgba(56,189,248,0.02)' },
          ]),
        },
        symbol: 'circle', symbolSize: 4, itemStyle: { color: '#38bdf8' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        markPoint: { data: marks as any },
        z: 3,
      })

      baseOption.series = series

    } else if (mode === 'mc' && mcResult) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [ruinSeries]

      // 5 worst paths (will likely be ruinous)
      const worstColors = ['#ef4444', '#f97316', '#fb923c', '#fbbf24', '#facc15']
      for (let i = 0; i < mcResult.worstPaths.length; i++) {
        const wp = mcResult.worstPaths[i]
        series.push({
          type: 'line',
          name: `Worst ${i + 1}`,
          data: wp.equity,
          lineStyle: { color: worstColors[i] ?? '#ef4444', width: 1.2, type: 'dashed', opacity: 0.7 },
          symbol: 'none', smooth: true,
        })
      }

      // Fan chart: P5/P25/Median/P75/P95
      const fan = [
        { data: mcResult.equityP5,  name: 'P5',     color: '#f87171', opacity: 0.35 },
        { data: mcResult.equityP25, name: 'P25',    color: '#60a5fa', opacity: 0.50 },
        { data: mcResult.equityP50, name: 'Median', color: '#34d399', opacity: 0.95 },
        { data: mcResult.equityP75, name: 'P75',    color: '#60a5fa', opacity: 0.50 },
        { data: mcResult.equityP95, name: 'P95',    color: '#a78bfa', opacity: 0.35 },
      ]
      for (const f of fan) {
        series.push({
          type: 'line', name: f.name,
          data: [initial, ...f.data],
          lineStyle: { color: f.color, width: f.opacity > 0.7 ? 2 : 1, opacity: f.opacity },
          symbol: 'none', smooth: true,
        })
      }

      baseOption.series = series

    } else {
      baseOption.series = [
        ruinSeries,
        {
          type: 'line', name: 'Equity',
          data: [initial, ...Array(nS).fill(null)],
          lineStyle: { color: '#38bdf8', width: 2 }, symbol: 'circle',
        },
      ]
    }

    chart.setOption(baseOption, true)
  }, [singleResult, noTrapResult, noStickyResult, mcResult, mode, config])

  return <div ref={containerRef} className="w-full h-full min-h-[340px]" />
}

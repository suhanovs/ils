/**
 * MarketCycleChart — dual-axis chart showing ROL multiples and industry losses
 * across the simulated seasons (single-run) or the historical EM-DAT / rol.csv data.
 */

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { PathResult } from '../engine/types'
import type { ROLRecord } from '../data/types'

interface Props {
  singleResult: PathResult | null
  rolHistory:   ROLRecord[]
}

export function MarketCycleChart({ singleResult, rolHistory }: Props) {
  const ref   = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current, 'dark')
    const obs = new ResizeObserver(() => chart.current?.resize())
    obs.observe(ref.current)
    return () => { obs.disconnect(); chart.current?.dispose() }
  }, [])

  useEffect(() => {
    const c = chart.current
    if (!c) return

    if (singleResult && singleResult.seasons.length > 0) {
      // Show simulated season data
      const seasons = singleResult.seasons.map((s) => `S${s.season}`)
      const juniors = singleResult.seasons.map((s) => +s.marketMultiple.junior.toFixed(2))
      const mids    = singleResult.seasons.map((s) => +s.marketMultiple.mid.toFixed(2))
      const remotes = singleResult.seasons.map((s) => +s.marketMultiple.remote.toFixed(2))
      const losses  = singleResult.seasons.map((s) => +(s.seasonLossMusd / 1000).toFixed(2)) // USD bn

      c.setOption({
        backgroundColor: 'transparent',
        animation: false,
        legend: { textStyle: { color: '#94a3b8' }, top: 0 },
        grid: { left: 50, right: 60, top: 40, bottom: 40 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: seasons, axisLabel: { color: '#94a3b8', fontSize: 10 } },
        yAxis: [
          { type: 'value', name: 'Multiple', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
          { type: 'value', name: 'Loss ($Bn)', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { show: false } },
        ],
        series: [
          { name: 'Loss ($Bn)', type: 'bar', yAxisIndex: 1, data: losses,
            itemStyle: { color: '#f87171', opacity: 0.6 }, barMaxWidth: 14 },
          { name: 'Junior mult', type: 'line', data: juniors, smooth: true,
            lineStyle: { color: '#fbbf24' }, symbol: 'none' },
          { name: 'Mid mult', type: 'line', data: mids, smooth: true,
            lineStyle: { color: '#60a5fa' }, symbol: 'none' },
          { name: 'Remote mult', type: 'line', data: remotes, smooth: true,
            lineStyle: { color: '#a78bfa' }, symbol: 'none' },
        ],
      }, true)
    } else {
      // Show historical ROL record
      const valid  = rolHistory.filter((r) => r.multJunior5 != null)
      const years  = valid.map((r) => String(r.year))
      const junior = valid.map((r) => r.multJunior5 ?? 0)
      const mid    = valid.map((r) => r.multMid2 ?? 0)
      const remote = valid.map((r) => r.multRemote1 ?? 0)
      const losses = valid.map((r) => r.insuredTcBn ?? 0)

      c.setOption({
        backgroundColor: 'transparent',
        animation: false,
        legend: { textStyle: { color: '#94a3b8' }, top: 0 },
        grid: { left: 50, right: 60, top: 40, bottom: 40 },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: 10 } },
        yAxis: [
          { type: 'value', name: 'Multiple', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
          { type: 'value', name: 'TC Loss ($Bn)', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { show: false } },
        ],
        series: [
          { name: 'TC Loss ($Bn)', type: 'bar', yAxisIndex: 1, data: losses,
            itemStyle: { color: '#f87171', opacity: 0.7 }, barMaxWidth: 14 },
          { name: '5% EL mult', type: 'line', data: junior, smooth: true,
            lineStyle: { color: '#fbbf24', width: 2 }, symbol: 'none' },
          { name: '2% EL mult', type: 'line', data: mid, smooth: true,
            lineStyle: { color: '#60a5fa', width: 2 }, symbol: 'none' },
          { name: '1% EL mult', type: 'line', data: remote, smooth: true,
            lineStyle: { color: '#a78bfa', width: 2 }, symbol: 'none' },
        ],
      }, true)
    }
  }, [singleResult, rolHistory])

  return <div ref={ref} className="w-full h-full min-h-[200px]" />
}

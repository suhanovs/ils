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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commonOpt: any = {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0, right: 0,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        itemWidth: 14, itemHeight: 8,
      },
      grid: { left: 50, right: 60, top: 36, bottom: 36 },
    }

    if (singleResult && singleResult.seasons.length > 0) {
      const seasons = singleResult.seasons.map(s => `S${s.season}`)
      c.setOption({
        ...commonOpt,
        xAxis: { type: 'category', data: seasons, axisLabel: { color: '#94a3b8', fontSize: 10 } },
        yAxis: [
          { type: 'value', name: 'Multiple', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
          { type: 'value', name: 'Loss $Bn', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { show: false } },
        ],
        series: [
          {
            name: 'Loss $Bn', type: 'bar', yAxisIndex: 1,
            data: singleResult.seasons.map(s => +(s.seasonLossMusd / 1000).toFixed(2)),
            itemStyle: { color: '#f87171', opacity: 0.55 }, barMaxWidth: 16,
          },
          {
            name: 'Junior ×', type: 'line',
            data: singleResult.seasons.map(s => +s.marketMultiple.junior.toFixed(2)),
            lineStyle: { color: '#fbbf24', width: 2 }, symbol: 'none', smooth: true,
          },
          {
            name: 'Mid ×', type: 'line',
            data: singleResult.seasons.map(s => +s.marketMultiple.mid.toFixed(2)),
            lineStyle: { color: '#60a5fa', width: 2 }, symbol: 'none', smooth: true,
          },
        ],
      }, true)
    } else {
      // Historical data
      const valid   = rolHistory.filter(r => r.multJunior5 != null)
      const years   = valid.map(r => String(r.year))
      c.setOption({
        ...commonOpt,
        xAxis: { type: 'category', data: years, axisLabel: { color: '#94a3b8', fontSize: 10 } },
        yAxis: [
          { type: 'value', name: 'Multiple', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
          { type: 'value', name: 'TC $Bn', nameTextStyle: { color: '#94a3b8' },
            axisLabel: { color: '#94a3b8' }, splitLine: { show: false } },
        ],
        series: [
          {
            name: 'TC $Bn', type: 'bar', yAxisIndex: 1,
            data: valid.map(r => r.insuredTcBn ?? 0),
            itemStyle: { color: '#f87171', opacity: 0.65 }, barMaxWidth: 16,
          },
          {
            name: '5% EL ×', type: 'line',
            data: valid.map(r => r.multJunior5 ?? null),
            lineStyle: { color: '#fbbf24', width: 2 }, symbol: 'none', smooth: true,
          },
          {
            name: '2% EL ×', type: 'line',
            data: valid.map(r => r.multMid2 ?? null),
            lineStyle: { color: '#60a5fa', width: 2 }, symbol: 'none', smooth: true,
          },
          {
            name: '1% EL ×', type: 'line',
            data: valid.map(r => r.multRemote1 ?? null),
            lineStyle: { color: '#a78bfa', width: 2 }, symbol: 'none', smooth: true,
          },
        ],
      }, true)
    }
  }, [singleResult, rolHistory])

  return <div ref={ref} className="w-full h-full min-h-[180px]" />
}

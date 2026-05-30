/**
 * App — root layout.
 *
 * Layout:
 *   ┌─ header ───────────────────────────────────────────────────────────┐
 *   │  Title  │ [Single] [10k MC]  │ [▶ Run] │ progress                 │
 *   ├─ left col (config) ─────┬─ right col (charts) ────────────────────┤
 *   │  ConfigPanel            │  Equity curve (hero, flex-1)            │
 *   │                         │  StatsPanel                              │
 *   │                         ├─ Market cycle ─── Season log ───────────┤
 *   └─────────────────────────┴──────────────────────────────────────────┘
 */

import { useState, useCallback, useMemo } from 'react'
import { DEFAULT_CONFIG } from './engine/config'
import type { SimConfig } from './engine/config'
import { useSimulation } from './hooks/useSimulation'
import { EquityCurve } from './components/EquityCurve'
import { StatsPanel } from './components/StatsPanel'
import { MarketCycleChart } from './components/MarketCycleChart'
import { SeasonLog } from './components/SeasonLog'
import { ConfigPanel } from './components/ConfigPanel'
import ilsData from './data/ilsData.json'
import type { ILSDataBundle } from './data/types'

const bundle = ilsData as ILSDataBundle

export default function App() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT_CONFIG)
  const emdatPool = useMemo(() => bundle.events, [])
  const { state, runSingle, runMC, setMode } = useSimulation(emdatPool)

  const handleConfigChange = useCallback((patch: Partial<SimConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
  }, [])

  const handleRunSingle = () => {
    setMode('single')
    runSingle(config)
  }

  const handleRunMC = () => {
    setMode('mc')
    runMC(config)
  }

  const progressBar = state.running ? (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-150"
          style={{ width: `${state.progress}%` }}
        />
      </div>
      <span>{state.progress}%</span>
    </div>
  ) : null

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-blue-400 tracking-wide uppercase">
            ILS Investor 101
          </h1>
          <p className="text-xs text-slate-500">Collateralized Reinsurance Visualizer</p>
        </div>

        <div className="flex items-center gap-1 ml-4">
          <button
            className={`btn text-xs px-3 py-1 ${state.mode === 'single' ? 'bg-blue-700 text-white' : 'btn-secondary'}`}
            onClick={() => setMode('single')}>
            Single Run
          </button>
          <button
            className={`btn text-xs px-3 py-1 ${state.mode === 'mc' ? 'bg-purple-700 text-white' : 'btn-secondary'}`}
            onClick={() => setMode('mc')}>
            {config.simulation.nMCRuns.toLocaleString()} Simulations
          </button>
        </div>

        <button
          className="btn-primary text-xs px-4 py-1.5 ml-2"
          disabled={state.running}
          onClick={state.mode === 'single' ? handleRunSingle : handleRunMC}>
          {state.running ? 'Running…' : '▶  Run'}
        </button>

        {progressBar}

        {state.error && (
          <span className="text-red-400 text-xs ml-2 truncate max-w-xs">{state.error}</span>
        )}

        <div className="ml-auto text-xs text-slate-600 hidden lg:block">
          EM-DAT {bundle.meta.rolYears[0]}–{bundle.meta.rolYears[1]} ·
          {bundle.meta.emdatEventCount} US TC events ·
          {bundle.meta.coveredStates.join('/')}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Config panel ── */}
        <aside className="w-64 flex-shrink-0 border-r border-slate-700 overflow-hidden flex flex-col">
          <div className="px-3 py-2 text-xs text-slate-500 uppercase tracking-widest border-b border-slate-700 flex-shrink-0">
            Parameters
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1">
            <ConfigPanel config={config} onChange={handleConfigChange} disabled={state.running} />
          </div>
        </aside>

        {/* ── Right: Charts ── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Hero: equity curve */}
          <div className="flex-1 panel m-2 mb-1 p-2 min-h-0 flex flex-col">
            <div className="flex-shrink-0 flex items-center gap-2 mb-1">
              <span className="label">
                {state.mode === 'single' ? 'Investor Equity Path' : 'Monte Carlo Fan (P5/P25/Median/P75/P95)'}
              </span>
              <span className="text-xs text-slate-500">
                Initial ${config.capital.initialCapitalMusd.toFixed(1)}M ·
                {config.simulation.nSeasons} seasons
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <EquityCurve
                singleResult={state.singleResult}
                mcResult={state.mcResult}
                mode={state.mode}
                config={config}
              />
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex-shrink-0 mx-2">
            <StatsPanel
              singleResult={state.singleResult}
              mcResult={state.mcResult}
              mode={state.mode}
              config={config}
            />
          </div>

          {/* Bottom: market cycle + season log */}
          <div className="flex-shrink-0 flex gap-2 m-2 mt-1" style={{ height: '220px' }}>
            <div className="panel flex-1 p-2 flex flex-col min-w-0">
              <span className="label mb-1 flex-shrink-0">
                {state.singleResult ? 'Simulated Market Cycle' : 'Historical Market Cycle (ROL data)'}
              </span>
              <div className="flex-1 min-h-0">
                <MarketCycleChart
                  singleResult={state.singleResult}
                  rolHistory={bundle.rolHistory}
                />
              </div>
            </div>

            {state.singleResult && (
              <div className="panel flex-1 p-2 flex flex-col min-w-0">
                <span className="label mb-1 flex-shrink-0">Season Log</span>
                <div className="flex-1 min-h-0 overflow-auto">
                  <SeasonLog result={state.singleResult} />
                </div>
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  )
}

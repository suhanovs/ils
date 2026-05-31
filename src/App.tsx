import { useState, useCallback, useMemo } from 'react'
import { DEFAULT_CONFIG } from './engine/config'
import type { SimConfig } from './engine/config'
import { useSimulation } from './hooks/useSimulation'
import { EquityCurve }       from './components/EquityCurve'
import { StatsPanel }        from './components/StatsPanel'
import { MarketCycleChart }  from './components/MarketCycleChart'
import { SeasonLog }         from './components/SeasonLog'
import { LayerGrid }         from './components/LayerGrid'
import { ConfigPanel }       from './components/ConfigPanel'
import ilsData from './data/ilsData.json'
import type { ILSDataBundle } from './data/types'

const bundle = ilsData as ILSDataBundle

// Heights for the two full-width bottom panels (single-run mode)
const GRID_H  = 210   // px — Layer Status Grid
const LOG_H   = 180   // px — Season Log

export default function App() {
  const [config, setConfig]               = useState<SimConfig>(DEFAULT_CONFIG)
  const [compareNoTrap,   setNoTrap]      = useState(false)
  const [compareNoSticky, setNoSticky]    = useState(false)

  const emdatPool = useMemo(() => bundle.events, [])
  const { state, runSingle, runMC, setMode } = useSimulation(emdatPool)

  const handleConfigChange = useCallback((patch: Partial<SimConfig>) => {
    setConfig(c => ({ ...c, ...patch }))
  }, [])

  const handleRunSingle = () => { setMode('single'); runSingle(config, compareNoTrap, compareNoSticky) }
  const handleRunMC     = () => { setMode('mc');     runMC(config) }

  const isSingle   = state.mode === 'single'
  const hasResult  = isSingle ? !!state.singleResult : !!state.mcResult

  // How many px the two bottom panels take (only in single-run mode when result exists)
  const bottomH = (isSingle && hasResult) ? GRID_H + LOG_H + 8 : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex-shrink-0">
          <h1 className="text-sm font-bold text-blue-400 tracking-wide uppercase">ILS Investor 101</h1>
          <p className="text-xs text-slate-500">Collateralized Reinsurance</p>
        </div>

        <div className="flex items-center gap-1 ml-3">
          <button className={`btn text-xs px-3 py-1 ${isSingle ? 'bg-blue-700 text-white' : 'btn-secondary'}`}
            onClick={() => setMode('single')}>Single Run</button>
          <button className={`btn text-xs px-3 py-1 ${!isSingle ? 'bg-purple-700 text-white' : 'btn-secondary'}`}
            onClick={() => setMode('mc')}>{config.simulation.nMCRuns.toLocaleString()} Simulations</button>
        </div>

        <button className="btn-primary text-xs px-4 py-1.5" disabled={state.running}
          onClick={isSingle ? handleRunSingle : handleRunMC}>
          {state.running ? 'Running…' : '▶  Run'}
        </button>

        {state.running && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-28 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${state.progress}%` }} />
            </div>
            <span>{state.progress}%</span>
          </div>
        )}

        {/* Comparison overlays (single-run only) */}
        {isSingle && (
          <div className="flex items-center gap-3 ml-1 text-xs">
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" className="w-3 h-3 accent-lime-500"
                checked={compareNoTrap} onChange={e => setNoTrap(e.target.checked)} />
              <span className="text-lime-400">No-trap</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" className="w-3 h-3 accent-purple-500"
                checked={compareNoSticky} onChange={e => setNoSticky(e.target.checked)} />
              <span className="text-purple-400">No-sticky</span>
            </label>
          </div>
        )}

        {state.error && <span className="text-red-400 text-xs ml-2 truncate max-w-xs">{state.error}</span>}

        <div className="ml-auto text-xs text-slate-600 hidden lg:block">
          {bundle.meta.coveredStates.join('/')} · EM-DAT {bundle.meta.rolYears[0]}–{bundle.meta.rolYears[1]}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Config sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-slate-700 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 text-xs text-slate-500 uppercase tracking-widest border-b border-slate-700 flex-shrink-0">
            Parameters
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-1">
            <ConfigPanel config={config} onChange={handleConfigChange} disabled={state.running} />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Upper row: equity chart (70%) + right panel (30%) ────── */}
          <div
            className="flex gap-2 px-2 pt-2 flex-shrink-0"
            style={{ height: `calc(100% - ${bottomH}px)`, minHeight: 280 }}
          >
            {/* Equity curve */}
            <div className="panel flex-1 p-2 min-w-0 flex flex-col min-h-0">
              <div className="flex-shrink-0 flex items-center gap-2 mb-1">
                <span className="label text-xs">
                  {!isSingle
                    ? 'Monte Carlo Fan (P5 / P25 / Median / P75 / P95)  +  5 Worst Paths'
                    : 'Investor Equity Path'}
                </span>
                {isSingle && (
                  <span className="text-xs flex gap-2">
                    {compareNoTrap   && <span className="text-lime-400">── no-trap</span>}
                    {compareNoSticky && <span className="text-purple-400">·· no-sticky</span>}
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <EquityCurve
                  singleResult={state.singleResult}
                  noTrapResult={compareNoTrap   ? state.noTrapResult   : null}
                  noStickyResult={compareNoSticky ? state.noStickyResult : null}
                  mcResult={state.mcResult}
                  mode={state.mode}
                  config={config}
                />
              </div>
            </div>

            {/* Right panel: stats + market cycle */}
            <div className="flex flex-col gap-2 flex-shrink-0 min-h-0" style={{ width: '28%' }}>

              {/* Stats */}
              <div className="panel p-2 overflow-y-auto flex-shrink-0">
                <div className="label text-xs mb-1">
                  {isSingle ? 'Run Statistics' : 'Monte Carlo Statistics'}
                </div>
                <StatsPanel
                  singleResult={state.singleResult}
                  mcResult={state.mcResult}
                  mode={state.mode}
                  config={config}
                />
              </div>

              {/* Market cycle — single-run only */}
              {isSingle && (
                <div className="panel p-2 flex flex-col flex-1 min-h-0">
                  <span className="label text-xs mb-1 flex-shrink-0">
                    {state.singleResult ? 'Simulated Cycle' : 'Historical ROL'}
                  </span>
                  <div className="flex-1 min-h-0">
                    <MarketCycleChart
                      singleResult={state.singleResult}
                      rolHistory={bundle.rolHistory}
                    />
                  </div>
                </div>
              )}

              {/* MC mode: hint about worst paths */}
              {!isSingle && state.mcResult && (
                <div className="panel p-2 text-xs text-slate-500">
                  5 worst paths (red/orange dashed) shown on equity chart.
                  Lower <b className="text-slate-400">State PML100</b> to increase loss frequency.
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom panels: full width, only in single-run mode ──── */}
          {isSingle && hasResult && state.singleResult && (
            <>
              {/* Layer Status Grid */}
              <div className="panel mx-2 mt-2 p-2 flex flex-col flex-shrink-0"
                   style={{ height: GRID_H }}>
                <div className="flex items-baseline gap-2 mb-1 flex-shrink-0">
                  <span className="label text-xs">Layer Status Grid</span>
                  <span className="text-slate-600 text-xs">
                    OK = clean  ·  IBNR = state hit, no claim yet  ·  PART = partial  ·  LOSS = total
                  </span>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <LayerGrid result={state.singleResult} />
                </div>
              </div>

              {/* Season Log */}
              <div className="panel mx-2 mt-2 mb-2 p-2 flex flex-col flex-shrink-0"
                   style={{ height: LOG_H }}>
                <span className="label text-xs mb-1 flex-shrink-0">Season Log</span>
                <div className="flex-1 min-h-0 overflow-auto">
                  <SeasonLog result={state.singleResult} />
                </div>
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  )
}

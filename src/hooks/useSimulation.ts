/**
 * React hook: manages simulation state and worker lifecycle.
 * Provides a clean API to the UI layer.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type { SimConfig } from '../engine/config'
import type { PathResult, MCResult } from '../engine/types'
import type { EMDATEvent } from '../data/types'

export type SimMode = 'single' | 'mc'

export interface SimState {
  mode:       SimMode
  running:    boolean
  progress:   number           // 0–100
  singleResult: PathResult | null
  mcResult:     MCResult   | null
  error:        string     | null
}

export function useSimulation(emdatPool: EMDATEvent[]) {
  const [state, setState] = useState<SimState>({
    mode: 'single',
    running: false,
    progress: 0,
    singleResult: null,
    mcResult: null,
    error: null,
  })
  const workerRef = useRef<Worker | null>(null)

  // Initialise worker
  useEffect(() => {
    const w = new Worker(
      new URL('../worker/simulation.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = w

    w.onmessage = (e: MessageEvent) => {
      const { type } = e.data
      if (type === 'singleResult') {
        setState((s) => ({ ...s, running: false, progress: 100, singleResult: e.data.result }))
      } else if (type === 'mcProgress') {
        const pct = Math.round((e.data.completed / e.data.total) * 100)
        setState((s) => ({ ...s, progress: pct }))
      } else if (type === 'mcResult') {
        setState((s) => ({ ...s, running: false, progress: 100, mcResult: e.data.result }))
      } else if (type === 'error') {
        setState((s) => ({ ...s, running: false, error: e.data.message }))
      }
    }

    w.onerror = (err) => {
      setState((s) => ({ ...s, running: false, error: err.message }))
    }

    return () => w.terminate()
  }, [])

  const runSingle = useCallback((cfg: SimConfig, seed?: number) => {
    setState((s) => ({ ...s, mode: 'single', running: true, progress: 0, error: null }))
    workerRef.current?.postMessage({ type: 'runSingle', config: cfg, emdatPool, seed })
  }, [emdatPool])

  const runMC = useCallback((cfg: SimConfig) => {
    setState((s) => ({ ...s, mode: 'mc', running: true, progress: 0, error: null }))
    workerRef.current?.postMessage({ type: 'runMC', config: cfg, emdatPool })
  }, [emdatPool])

  const setMode = useCallback((mode: SimMode) => {
    setState((s) => ({ ...s, mode }))
  }, [])

  return { state, runSingle, runMC, setMode }
}

/**
 * Web Worker for off-main-thread simulation.
 *
 * Messages in:
 *   { type: 'runSingle', config, emdatPool, seed? }
 *   { type: 'runMC',     config, emdatPool }
 *
 * Messages out:
 *   { type: 'singleResult', result: PathResult }
 *   { type: 'mcProgress',   completed, total }
 *   { type: 'mcResult',     result: MCResult }
 *   { type: 'error',        message: string }
 */

import { runPath, runMonteCarlo } from '../engine/simulator'
import type { SimConfig } from '../engine/config'
import type { EMDATEvent } from '../data/types'

self.onmessage = (e: MessageEvent) => {
  const { type, config, emdatPool, seed } = e.data as {
    type: string
    config: SimConfig
    emdatPool: EMDATEvent[]
    seed?: number
  }

  try {
    if (type === 'runSingle') {
      const result = runPath(config, emdatPool, seed)
      self.postMessage({ type: 'singleResult', result })

    } else if (type === 'runMC') {
      const result = runMonteCarlo(config, emdatPool, ({ completed, total }) => {
        self.postMessage({ type: 'mcProgress', completed, total })
      })
      self.postMessage({ type: 'mcResult', result })
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  }
}

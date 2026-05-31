/**
 * Web Worker for off-main-thread simulation.
 *
 * Messages in:
 *   { type: 'runSingle',      config, emdatPool, seed? }
 *   { type: 'runComparisons', config, emdatPool, seed,
 *           compareNoTrap: boolean }
 *   { type: 'runMC',          config, emdatPool }
 *
 * Messages out:
 *   { type: 'singleResult',      result: PathResult }
 *   { type: 'comparisonResult',  main, noTrap? }
 *   { type: 'mcProgress',        completed, total }
 *   { type: 'mcResult',          result: MCResult }
 *   { type: 'error',             message: string }
 */

import { runPath, runMonteCarlo } from '../engine/simulator'
import type { SimConfig } from '../engine/config'
import type { EMDATEvent } from '../data/types'

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as {
    type:             string
    config:           SimConfig
    emdatPool:        EMDATEvent[]
    seed?:            number
    compareNoTrap?:   boolean
  }

  try {
    if (msg.type === 'runSingle') {
      const result = runPath(msg.config, msg.emdatPool, msg.seed)
      self.postMessage({ type: 'singleResult', result })

    } else if (msg.type === 'runComparisons') {
      // Main run
      const main = runPath(msg.config, msg.emdatPool, msg.seed)
      const usedSeed = main.seed

      // Optional: same seed, trapping disabled (trappingPeriodSeasons=0)
      const noTrap = msg.compareNoTrap
        ? runPath(
            { ...msg.config, capital: { ...msg.config.capital, trappingPeriodSeasons: 0 } },
            msg.emdatPool,
            usedSeed
          )
        : null

      self.postMessage({ type: 'comparisonResult', main, noTrap })

    } else if (msg.type === 'runMC') {
      const result = runMonteCarlo(msg.config, msg.emdatPool, ({ completed, total }) => {
        self.postMessage({ type: 'mcProgress', completed, total })
      })
      self.postMessage({ type: 'mcResult', result })
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  }
}

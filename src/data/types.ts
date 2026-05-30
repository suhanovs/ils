/**
 * Shape of the bundled ilsData.json produced by scripts/build_data.py.
 * The app imports this at build time — no runtime S3 fetch needed.
 */

export interface EMDATEvent {
  year: number
  name: string | null
  /** Insured damage, adjusted, in USD millions */
  lossMusd: number
  /** Covered states mentioned in the Location field (FL/GA/NC/SC/LA/TX) */
  states: string[]
  location: string
}

export interface ROLRecord {
  year: number
  /** NOAA total TC damage USD billions */
  noaaTcBn: number | null
  /** EM-DAT insured TC damage USD billions */
  insuredTcBn: number | null
  /** EM-DAT insured all-peril damage USD billions */
  insuredAllPerilBn: number | null
  /** US property cat ROL index (1990 = 100) */
  rolIndex: number | null
  /** ROL multiple at 5% EL (junior layers) */
  multJunior5: number | null
  /** ROL multiple at 2% EL (mid layers) */
  multMid2: number | null
  /** ROL multiple at 1% EL (remote layer) */
  multRemote1: number | null
}

export interface SeveritySummary {
  count: number
  minMusd: number
  p25Musd: number
  medianMusd: number
  meanMusd: number
  p75Musd: number
  p90Musd: number
  p99Musd: number
  maxMusd: number
}

export interface ILSDataBundle {
  meta: {
    source: string
    units: { lossMusd: string; bn: string }
    coveredStates: string[]
    emdatEventCount: number
    rolYears: [number, number]
  }
  severity: SeveritySummary
  events: EMDATEvent[]
  annualAggregate: { year: number; insuredTcBn: number }[]
  rolHistory: ROLRecord[]
}

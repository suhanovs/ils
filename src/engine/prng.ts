/**
 * Seedable pseudo-random number generator (mulberry32) and distribution samplers.
 *
 * Separation of concerns: pure math / randomness — no domain knowledge here.
 * Every stochastic decision in the engine passes through a Rng instance
 * obtained from createRng(seed), guaranteeing reproducibility.
 */

export type Rng = () => number

/**
 * Create a seeded uniform(0,1) generator using mulberry32.
 * Given the same seed the stream is byte-identical across runs.
 */
export function createRng(seed: number): Rng {
  let s = (seed >>> 0) || 1 // ensure non-zero
  return function () {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform integer in [lo, hi] inclusive */
export function uniformInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** Uniform float in [lo, hi) */
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

/**
 * Standard normal via Box-Muller transform.
 * Consumes 2 uniform samples; returns 1 normal variate.
 */
export function stdNormal(rng: Rng): number {
  const u1 = Math.max(rng(), 1e-15) // guard against log(0)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export function normal(rng: Rng, mu: number, sigma: number): number {
  return mu + sigma * stdNormal(rng)
}

export function lognormal(rng: Rng, mu: number, sigma: number): number {
  return Math.exp(normal(rng, mu, sigma))
}

/**
 * Gamma distribution via Marsaglia-Tsang's method (shape k > 0).
 * theta = scale (mean = k × theta).
 */
export function gamma(rng: Rng, k: number, theta: number): number {
  if (k < 1) {
    // Boost: Gamma(k) = Gamma(k+1) × U^(1/k)
    return gamma(rng, k + 1, theta) * Math.pow(rng(), 1 / k)
  }
  const d = k - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number, v: number
    do {
      x = stdNormal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v * theta
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta
  }
}

/**
 * Poisson distribution (Knuth for small λ, normal approximation for large λ).
 */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0
  if (lambda < 30) {
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= rng()
    } while (p > L)
    return k - 1
  }
  // Normal approximation for large λ
  return Math.max(0, Math.round(normal(rng, lambda, Math.sqrt(lambda))))
}

/**
 * Negative Binomial via Poisson-Gamma mixture.
 * Variance = mean + mean² / dispersion.
 * As dispersion → ∞, approaches Poisson(mean).
 */
export function negBinom(rng: Rng, mean: number, dispersion: number): number {
  const lambda = gamma(rng, dispersion, mean / dispersion)
  return poisson(rng, lambda)
}

/**
 * Draw an integer in [0, weights.length) with probability proportional to weights.
 */
export function categorical(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

/**
 * Sample k indices from [0, n) without replacement (Fisher-Yates partial shuffle).
 */
export function sampleIndices(rng: Rng, n: number, k: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, k)
}

/**
 * Pick one element uniformly at random.
 */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/**
 * Generate N random weights summing to 1 using stick-breaking (symmetric Dirichlet),
 * then cap each weight at maxWeight and re-normalise.
 */
export function dirichletWeights(
  rng: Rng,
  n: number,
  maxWeight: number = 1
): number[] {
  // Use Gamma(1,1) draws → normalise → symmetric Dirichlet(1,…,1) = uniform on simplex
  let raw = Array.from({ length: n }, () => gamma(rng, 1, 1))
  // Re-sample until no single weight exceeds maxWeight after normalisation
  for (let attempt = 0; attempt < 50; attempt++) {
    const total = raw.reduce((a, b) => a + b, 0)
    const w = raw.map((x) => x / total)
    if (w.every((x) => x <= maxWeight)) return w
    // Dampen dominant weights and retry
    raw = raw.map((x) => Math.min(x, (maxWeight * total) * 0.99))
  }
  // Fallback: uniform
  return Array(n).fill(1 / n)
}

// ── Normal CDF (used by severity module for lognormal EL integrals) ────────

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26, max error 1.5e-7).
 */
export function erf(x: number): number {
  const p = 0.3275911
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429]
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + p * ax)
  let poly = 0
  for (let i = 4; i >= 0; i--) poly = poly * t + a[i]
  return sign * (1 - poly * t * Math.exp(-ax * ax))
}

/** Standard normal CDF Φ(x) */
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

/** Standard normal quantile Φ⁻¹(p) via rational approximation */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  // Beasley-Springer-Moro approximation
  const a = [2.515517, 0.802853, 0.010328]
  const b = [1.432788, 0.189269, 0.001308]
  const t = p < 0.5
    ? Math.sqrt(-2 * Math.log(p))
    : Math.sqrt(-2 * Math.log(1 - p))
  const num = a[0] + a[1] * t + a[2] * t * t
  const den = 1 + b[0] * t + b[1] * t * t + b[2] * t * t * t
  const z = t - num / den
  return p < 0.5 ? -z : z
}

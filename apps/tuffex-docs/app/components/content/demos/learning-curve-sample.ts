// Training curves for the TxLearningCurve demos and gallery cell. Every value
// comes from a seeded generator, so each render and each reset draws the same runs.

/** Uniform numbers in [0, 1) from a 32-bit seed (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A standard normal draw (Box–Muller). */
function normal(random: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
}

export interface ReturnCurve {
  /** Return the trained policy settles at. */
  ceiling: number
  /** Steps to cover about 63% of the climb. */
  tau: number
  /** Last step logged. */
  steps: number
  /** Steps between two logged episodes. */
  every: number
}

/** One seed's episode returns: a saturating climb under heavy episode-to-episode noise. */
export function episodeReturns(curve: ReturnCurve, seed: number): Array<[number, number]> {
  const random = seeded(seed)
  // Seeds of one run differ in how high and how fast they learn.
  const ceiling = curve.ceiling * (1 + 0.08 * normal(random))
  const tau = curve.tau * (1 + 0.15 * normal(random))
  const points: Array<[number, number]> = []
  for (let step = 0; step <= curve.steps; step += curve.every) {
    const mean = ceiling * (1 - Math.exp(-step / tau))
    points.push([step, Math.round(mean + (mean * 0.14 + 60) * normal(random))])
  }
  return points
}

/** Several seeds of one run. */
export function seedsOf(curve: ReturnCurve, seed: number, count = 3): Array<Array<[number, number]>> {
  return Array.from({ length: count }, (_, index) => episodeReturns(curve, seed * 101 + index))
}

export interface LossCurve {
  /** Loss the run flattens out at. */
  floor: number
  /** How far the loss starts above its floor. */
  height: number
  /** Steps until the decay sets in. */
  onset: number
  steps: number
  every: number
}

/** A training loss decaying as a power law, with multiplicative noise. */
export function trainingLoss(curve: LossCurve, seed: number): Array<[number, number]> {
  const random = seeded(seed)
  const points: Array<[number, number]> = []
  for (let step = 0; step <= curve.steps; step += curve.every) {
    const mean = curve.floor + curve.height * (1 + step / curve.onset) ** -0.6
    points.push([step, mean * (1 + 0.05 * normal(random))])
  }
  return points
}

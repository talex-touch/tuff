/** Picks dimension values by weighted deficit (unseen values jump the queue, seeded jitter avoids lockstep); a tuple already in the class is redrawn. */
import type { ScenarioClass } from '../types'
import { CLASS_DIMENSIONS, FORBIDDEN, valueIds, weightOf, type DimensionName } from './dimensions'
import type { Rng } from './prng'

export type Dims = Record<string, string>

const ORDER: DimensionName[] = [
  'rule',
  'fileType',
  'format',
  'size',
  'writeMode',
  'placement',
  'nameStyle',
  'change',
  'query'
]
const GLOBAL_UNSEEN_BONUS = 1000
const CLASS_UNSEEN_BONUS = 50
const NEW_PAIR_BONUS = 0.3
const ATTEMPTS = 24

export interface PickerHooks {
  /** Eligibility that depends on the real name (a query transform on this style, rename-case on letters). */
  allows: (cls: ScenarioClass, chosen: Dims, dim: string, value: string) => boolean
}

export class Picker {
  private readonly inClass = new Map<string, number>()
  private readonly inPlan = new Map<string, number>()
  private readonly pairs = new Set<string>()
  private readonly used = new Set<string>()
  private readonly picks = new Map<ScenarioClass, number>()
  private readonly totals = new Map<string, number>()

  constructor(
    private readonly rng: Rng,
    private readonly hooks: PickerHooks
  ) {}

  /** `fixed` dimensions are taken as given (search-created inherits them from its create-image). */
  pick(cls: ScenarioClass, fixed: Dims = {}): Dims | null {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const dims = this.draw(cls, fixed, 0.8 + attempt * 0.35)
      if (!dims) continue
      const key = this.keyOf(cls, dims)
      if (this.used.has(key)) continue
      this.used.add(key)
      this.record(cls, dims)
      return dims
    }
    return null
  }

  /** How badly the class still needs this combination of values; used to choose a create-image to pair. */
  need(cls: ScenarioClass, dims: Dims): number {
    let total = 0
    for (const dim of this.orderOf(cls)) {
      const value = dims[dim]
      if (value === undefined) continue
      total += this.deficit(cls, dim, value) + (this.countInPlan(dim, value) === 0 ? 5 : 0)
    }
    return total
  }

  has(cls: ScenarioClass, dims: Dims): boolean {
    return this.used.has(this.keyOf(cls, dims))
  }

  /** Whether any scenario of any class already holds this value. */
  seenInPlan(dim: string, value: string): boolean {
    return this.countInPlan(dim, value) > 0
  }

  private orderOf(cls: ScenarioClass): DimensionName[] {
    return ORDER.filter((dim) => CLASS_DIMENSIONS[cls].includes(dim))
  }

  private keyOf(cls: ScenarioClass, dims: Dims): string {
    return `${cls}|${this.orderOf(cls)
      .map((dim) => dims[dim])
      .join('|')}`
  }

  private countInClass(cls: ScenarioClass, dim: string, value: string): number {
    return this.inClass.get(`${cls}|${dim}|${value}`) ?? 0
  }

  private countInPlan(dim: string, value: string): number {
    return this.inPlan.get(`${dim}|${value}`) ?? 0
  }

  private totalWeight(cls: ScenarioClass, dim: Exclude<DimensionName, 'app'>): number {
    const key = `${cls}|${dim}`
    let total = this.totals.get(key)
    if (total === undefined) {
      total = valueIds(dim).reduce((sum, id) => sum + weightOf(cls, dim, id), 0)
      this.totals.set(key, total)
    }
    return total
  }

  private deficit(cls: ScenarioClass, dim: DimensionName, value: string): number {
    const real = dim as Exclude<DimensionName, 'app'>
    const share = weightOf(cls, real, value) / this.totalWeight(cls, real)
    return ((this.picks.get(cls) ?? 0) + 1) * share - this.countInClass(cls, dim, value)
  }

  private blocked(cls: ScenarioClass, chosen: Dims, dim: DimensionName, value: string): boolean {
    for (const row of FORBIDDEN) {
      if (!row[dim]?.includes(value)) continue
      const others = (Object.keys(row) as DimensionName[]).filter((name) => name !== dim)
      if (!others.every((name) => CLASS_DIMENSIONS[cls].includes(name))) continue
      if (
        others.every(
          (name) => chosen[name] !== undefined && row[name]?.includes(chosen[name] as string)
        )
      )
        return true
    }
    return false
  }

  private draw(cls: ScenarioClass, fixed: Dims, jitter: number): Dims | null {
    const dims: Dims = {}
    let previous: DimensionName | undefined
    for (const dim of this.orderOf(cls)) {
      if (fixed[dim] !== undefined) {
        dims[dim] = fixed[dim] as string
        previous = dim
        continue
      }
      const options = valueIds(dim as Exclude<DimensionName, 'app'>).filter(
        (value) =>
          weightOf(cls, dim as Exclude<DimensionName, 'app'>, value) > 0 &&
          !this.blocked(cls, dims, dim, value) &&
          this.hooks.allows(cls, dims, dim, value)
      )
      if (options.length === 0) return null
      let best = options[0] as string
      let bestScore = -Infinity
      for (const value of options) {
        let score = this.deficit(cls, dim, value) + this.rng.next() * jitter
        if (this.countInPlan(dim, value) === 0) score += GLOBAL_UNSEEN_BONUS
        else if (this.countInClass(cls, dim, value) === 0) score += CLASS_UNSEEN_BONUS
        if (
          previous &&
          !this.pairs.has(this.pairKey(cls, previous, dims[previous] as string, dim, value))
        )
          score += NEW_PAIR_BONUS
        if (score > bestScore) {
          bestScore = score
          best = value
        }
      }
      dims[dim] = best
      previous = dim
    }
    return dims
  }

  private pairKey(
    cls: ScenarioClass,
    a: string,
    valueA: string,
    b: string,
    valueB: string
  ): string {
    return `${cls}|${a}=${valueA}|${b}=${valueB}`
  }

  /** Counts a scenario the picker did not choose itself (search-app picks its own pairs). */
  record(cls: ScenarioClass, dims: Dims): void {
    const order = this.orderOf(cls)
    order.forEach((dim, index) => {
      const value = dims[dim] as string
      this.inClass.set(`${cls}|${dim}|${value}`, this.countInClass(cls, dim, value) + 1)
      this.inPlan.set(`${dim}|${value}`, this.countInPlan(dim, value) + 1)
      if (index > 0) {
        const before = order[index - 1] as DimensionName
        this.pairs.add(this.pairKey(cls, before, dims[before] as string, dim, value))
      }
    })
    this.picks.set(cls, (this.picks.get(cls) ?? 0) + 1)
  }
}

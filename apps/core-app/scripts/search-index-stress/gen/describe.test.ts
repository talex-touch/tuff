import { describe, expect, it } from 'vitest'
import type { FsStep, Scenario, ScenarioClass, ScenarioPlan } from '../types'
import { appPairCapacity, distinctApps } from './build-app'
import { describePlan } from './describe'
import {
  CLASS_DIMENSIONS,
  DIMENSIONS,
  MAX_SCENARIO_WRITE_BYTES,
  valueIds,
  weightOf,
  type DimensionName
} from './dimensions'
import { CLASSES, classQuota } from './plan'
import { APPS, cloneOf, flatSteps, mediumPlan, smokePlan } from './test-fixtures'
import { validatePlan } from './validate'

const first = (plan: ScenarioPlan, cls: ScenarioClass): [Scenario, Scenario] => {
  const rows = plan.scenarios.filter((scenario) => scenario.class === cls)
  return [rows[0] as Scenario, rows[1] as Scenario]
}
const allowed = (cls: ScenarioClass, dim: Exclude<DimensionName, 'app'>): string[] =>
  valueIds(dim).filter((id) => weightOf(cls, dim, id) > 0)
const sum = (values: Iterable<number>): number =>
  [...values].reduce((total, value) => total + value, 0)

describe('distinctness proof', () => {
  const plan = smokePlan()
  const description = describePlan(plan)

  it('counts unique ids and unique (class, dims) tuples over the whole plan', () => {
    expect(description.total).toBe(200)
    expect(description.distinct.scenarios).toBe(200)
    expect(description.distinct.ids).toBe(200)
    expect(description.distinct.tuples).toBe(200)
  })

  it('splits that per class, with the requested number and the most the class could express', () => {
    const quota = classQuota(plan.options)
    expect(sum(CLASSES.map((cls) => description.distinct.perClass[cls].scenarios))).toBe(200)
    for (const cls of CLASSES) {
      const row = description.distinct.perClass[cls]
      expect(row.tuples, cls).toBe(row.scenarios)
      expect(row.requested, cls).toBe(quota[cls])
      expect(row.capacity, cls).toBeGreaterThanOrEqual(row.scenarios)
      expect(Number.isInteger(row.capacity), cls).toBe(true)
    }
  })

  it('the capacity of search-app is exact: installed apps x the query transforms that apply to them', () => {
    expect(description.distinct.perClass['search-app'].capacity).toBe(appPairCapacity(APPS))
  })

  it('the capacity of the other classes is the product of the values they allow', () => {
    for (const cls of CLASSES.filter(
      (value) => value !== 'search-app' && value !== 'search-created'
    )) {
      const dims = CLASS_DIMENSIONS[cls] as readonly Exclude<DimensionName, 'app'>[]
      expect(description.distinct.perClass[cls].capacity, cls).toBe(
        dims.reduce((product, dim) => product * allowed(cls, dim).length, 1)
      )
    }
    const survivors = plan.scenarios.filter(
      (row) => row.class === 'create-image' && row.dims.writeMode !== 'create-then-delete'
    ).length
    expect(description.distinct.perClass['search-created'].capacity).toBeLessThanOrEqual(
      survivors * allowed('search-created', 'query').length
    )
  })

  it('notices repeated ids and repeated tuples, separately', () => {
    const sameId = cloneOf(plan)
    const [a, b] = first(sameId, 'search-file')
    b.id = a.id
    const byId = describePlan(sameId)
    expect([byId.distinct.ids, byId.distinct.tuples]).toEqual([199, 200])

    const sameTuple = cloneOf(plan)
    const [c, d] = first(sameTuple, 'create-image')
    d.dims = { ...c.dims }
    const byTuple = describePlan(sameTuple)
    expect([byTuple.distinct.ids, byTuple.distinct.tuples]).toEqual([200, 199])
    expect(byTuple.distinct.perClass['create-image'].tuples).toBe(
      byTuple.distinct.perClass['create-image'].scenarios - 1
    )
    expect(
      validatePlan(sameTuple).some((problem) =>
        /only 199 distinct \(class, dims\) tuples/.test(problem)
      )
    ).toBe(true)
  })

  it('tuples of different classes never collide, even with equal dimension values', () => {
    const copy = cloneOf(plan)
    const [a] = first(copy, 'search-image')
    const [b] = first(copy, 'change-image')
    b.dims = { ...a.dims }
    expect(describePlan(copy).distinct.tuples).toBe(200)
  })
})

describe('dimension x value coverage', () => {
  const plan = mediumPlan()
  const description = describePlan(plan)
  const sizes = Object.fromEntries(
    CLASSES.map((cls) => [cls, plan.scenarios.filter((row) => row.class === cls).length])
  ) as Record<ScenarioClass, number>

  it('lists, per class, every allowed value of every dimension and counts the scenarios using it', () => {
    for (const cls of CLASSES) {
      for (const dim of CLASS_DIMENSIONS[cls]) {
        const table = description.classValues[cls][dim] as Record<string, number>
        expect(sum(Object.values(table)), `${cls}.${dim}`).toBe(sizes[cls])
        if (dim === 'app') continue
        expect(Object.keys(table).sort(), `${cls}.${dim}`).toEqual(allowed(cls, dim).sort())
      }
    }
  })

  it('app counts only name installed apps and add up to the search-app scenarios', () => {
    const known = new Set(distinctApps(APPS))
    const table = description.classValues['search-app'].app as Record<string, number>
    for (const app of Object.keys(table)) expect(known.has(app), app).toBe(true)
    expect(Math.max(...Object.values(table))).toBeLessThanOrEqual(
      appPairCapacity(['Visual Studio Code'])
    )
  })

  it('overall counts equal the per-class counts, and every declared value is listed even when unused', () => {
    for (const [dim, rows] of Object.entries(DIMENSIONS)) {
      const table = description.dimensions[dim] as Record<
        string,
        { total: number; byClass: Record<string, number> }
      >
      expect(Object.keys(table).sort(), dim).toEqual(rows.map(([id]) => id).sort())
      for (const [value, entry] of Object.entries(table)) {
        expect(entry.total, `${dim}=${value}`).toBe(sum(Object.values(entry.byClass)))
        for (const cls of Object.keys(entry.byClass) as ScenarioClass[]) {
          expect(description.classValues[cls][dim]?.[value], `${cls} ${dim}=${value}`).toBe(
            entry.byClass[cls]
          )
        }
      }
    }
  })

  it('class coverage says how many allowed values appear and names the missing ones', () => {
    for (const cls of CLASSES) {
      for (const dim of CLASS_DIMENSIONS[cls].filter(
        (value): value is Exclude<DimensionName, 'app'> => value !== 'app'
      )) {
        const row = description.classCoverage[cls]?.[dim] as {
          allowed: number
          seen: number
          missing: string[]
        }
        expect(row.allowed).toBe(allowed(cls, dim).length)
        expect(row.seen + row.missing.length).toBe(row.allowed)
        for (const value of row.missing)
          expect(description.classValues[cls][dim]?.[value], `${cls}.${dim}=${value}`).toBe(0)
      }
    }
  })

  it('uncovered lists exactly the declared values that some class allows and nobody used', () => {
    for (const [dim, ids] of Object.entries(description.uncovered)) {
      for (const id of ids) expect(description.dimensions[dim]?.[id]?.total, `${dim}=${id}`).toBe(0)
    }
    for (const [dim, rows] of Object.entries(DIMENSIONS)) {
      const unused = rows
        .map(([id]) => id)
        .filter((id) => description.dimensions[dim]?.[id]?.total === 0)
      const wanted = unused.filter((id) =>
        CLASSES.some(
          (cls) =>
            CLASS_DIMENSIONS[cls].includes(dim as DimensionName) &&
            weightOf(cls, dim as Exclude<DimensionName, 'app'>, id) > 0
        )
      )
      expect(description.uncovered[dim] ?? [], dim).toEqual(wanted)
    }
  })
})

describe('checks, corpus and writes', () => {
  const plan = mediumPlan()
  const description = describePlan(plan)

  it('counts checks by expectation and tier', () => {
    const tally = { present: { hard: 0, soft: 0 }, absent: { hard: 0, soft: 0 } }
    for (const check of plan.scenarios.flatMap((row) => row.checks))
      tally[check.expect][check.tier] += 1
    expect(description.checks).toEqual(tally)
    expect(tally.present.hard).toBeGreaterThan(0)
    expect(tally.present.soft).toBeGreaterThan(0)
    expect(tally.absent.hard).toBeGreaterThan(0)
    expect(tally.absent.soft).toBeGreaterThan(0)
  })

  it('sums the corpus', () => {
    expect(description.corpus).toEqual({
      directories: plan.corpus.directories.length,
      files: plan.corpus.files.length,
      bytes: sum(plan.corpus.files.map((file) => file.payload.bytes))
    })
  })

  it('measures what each scenario writes while it runs', () => {
    const lower = (steps: FsStep[]): number =>
      sum(
        flatSteps(steps).map((step) =>
          step.op === 'write' || step.op === 'write-atomic' ? step.payload.bytes : 0
        )
      )
    const perScenario = plan.scenarios.map((row) => lower(row.steps))
    expect(description.writes.totalBytes).toBeGreaterThanOrEqual(sum(perScenario))
    expect(description.writes.maxScenarioBytes).toBeGreaterThanOrEqual(Math.max(...perScenario))
    expect(description.writes.maxScenarioBytes).toBeLessThanOrEqual(MAX_SCENARIO_WRITE_BYTES)
  })

  it('states the shortfall as requested minus actual and where it went', () => {
    expect(description.shortfall).toEqual({ total: 0, short: {}, reflowedInto: {} })
    for (const cls of CLASSES)
      expect(description.classes[cls].requested).toBe(classQuota(plan.options)[cls])
  })
})

describe('describePlan as data', () => {
  it('is deterministic, pure and plain JSON', () => {
    const plan = smokePlan()
    const before = JSON.stringify(plan)
    const once = describePlan(plan)
    expect(JSON.stringify(plan)).toBe(before)
    expect(JSON.stringify(describePlan(plan))).toBe(JSON.stringify(once))
    expect(JSON.parse(JSON.stringify(once))).toEqual(once)
  })

  it('describes an empty plan without throwing', () => {
    const description = describePlan({
      seed: 1,
      count: 0,
      options: { seed: 1, count: 0, apps: [] },
      corpus: { directories: [], files: [] },
      scenarios: []
    })
    expect(description.total).toBe(0)
    expect(description.distinct).toMatchObject({ scenarios: 0, ids: 0, tuples: 0 })
    expect(description.shortfall.total).toBe(0)
    expect(description.distinct.perClass['search-app'].capacity).toBe(0)
  })
})

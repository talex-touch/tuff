import type { ScenarioClass, ScenarioPlan } from '../types'
import { appPairCapacity } from './build-app'
import { CLASS_DIMENSIONS, DIMENSIONS, valueIds, weightOf, type DimensionName } from './dimensions'
import { CLASSES, classQuota, tupleKey } from './plan'
import { replaySteps, corpusView, type Ledger } from './validate-steps'

export interface ValueCount {
  total: number
  byClass: Partial<Record<ScenarioClass, number>>
}

export interface ClassDistinct {
  scenarios: number
  /** Distinct dimension-value tuples; equal to `scenarios` in a valid plan. */
  tuples: number
  requested: number
  /** Most distinct tuples the class can express here: exact for search-app (installed apps x transforms), a product bound otherwise. */
  capacity: number
}

export interface PlanDescription {
  seed: number
  count: number
  total: number
  classes: Record<ScenarioClass, { requested: number; actual: number }>
  /** Classes that got fewer scenarios than asked (the app pool ran dry) and the classes that absorbed them. */
  shortfall: {
    total: number
    short: Partial<Record<ScenarioClass, number>>
    reflowedInto: Partial<Record<ScenarioClass, number>>
  }
  /** Unique ids and unique (class, dims) tuples; both must equal `total` for the plan to count as 10,000 different situations. */
  distinct: {
    scenarios: number
    ids: number
    tuples: number
    perClass: Record<ScenarioClass, ClassDistinct>
  }
  /** class -> dimension -> value -> scenarios, every value the class allows listed (0 when unseen). */
  classValues: Record<ScenarioClass, Record<string, Record<string, number>>>
  /** dimension -> value -> how often it occurs, overall and per class. Every declared value is listed, seen or not. */
  dimensions: Record<string, Record<string, ValueCount>>
  /** Declared values that some class allows but no scenario uses: [] means the plan covers everything it can. */
  uncovered: Record<string, string[]>
  /** Per class and dimension: values the class allows, how many appear, and which are missing (small plans cannot fit them all). */
  classCoverage: Record<
    string,
    Record<string, { allowed: number; seen: number; missing: string[] }>
  >
  checks: { present: { hard: number; soft: number }; absent: { hard: number; soft: number } }
  corpus: { directories: number; files: number; bytes: number }
  writes: { totalBytes: number; maxScenarioBytes: number }
}

function emptyCount(): ValueCount {
  return { total: 0, byClass: {} }
}

const allowedValues = (cls: ScenarioClass, dim: Exclude<DimensionName, 'app'>): string[] =>
  valueIds(dim).filter((id) => weightOf(cls, dim, id) > 0)

/** Counts of everything the plan contains, as plain JSON. */
export function describePlan(plan: ScenarioPlan): PlanDescription {
  const quota = classQuota(plan.options)
  const actual = Object.fromEntries(CLASSES.map((cls) => [cls, 0])) as Record<ScenarioClass, number>
  const dimensions: PlanDescription['dimensions'] = {}
  for (const [dim, rows] of Object.entries(DIMENSIONS)) {
    dimensions[dim] = Object.fromEntries(rows.map(([id]) => [id, emptyCount()]))
  }
  dimensions.app = {}
  const checks = { present: { hard: 0, soft: 0 }, absent: { hard: 0, soft: 0 } }
  const view = corpusView(plan.corpus)
  const ledger: Ledger = { owners: new Map(), existing: new Set() }
  let totalBytes = 0
  let maxScenarioBytes = 0
  const ids = new Set<string>()
  const tuples = new Set<string>()
  const classTuples = Object.fromEntries(CLASSES.map((cls) => [cls, new Set<string>()])) as Record<
    ScenarioClass,
    Set<string>
  >
  const classValues = {} as PlanDescription['classValues']
  for (const cls of CLASSES) {
    classValues[cls] = {}
    for (const dim of CLASS_DIMENSIONS[cls]) {
      classValues[cls][dim] =
        dim === 'app' ? {} : Object.fromEntries(allowedValues(cls, dim).map((id) => [id, 0]))
    }
  }

  for (const scenario of plan.scenarios) {
    actual[scenario.class] += 1
    ids.add(scenario.id)
    const tuple = tupleKey(scenario.class, scenario.dims)
    tuples.add(tuple)
    classTuples[scenario.class]?.add(tuple)
    for (const [dim, value] of Object.entries(scenario.dims)) {
      const table = ((classValues[scenario.class] ??= {})[dim] ??= {})
      table[String(value)] = (table[String(value)] ?? 0) + 1
    }
    for (const [dim, value] of Object.entries(scenario.dims)) {
      const table = (dimensions[dim] ??= {})
      const entry = (table[String(value)] ??= emptyCount())
      entry.total += 1
      entry.byClass[scenario.class] = (entry.byClass[scenario.class] ?? 0) + 1
    }
    for (const check of scenario.checks) checks[check.expect][check.tier] += 1
    const written = replaySteps(scenario, view, ledger, { push: () => undefined }).written
    totalBytes += written
    maxScenarioBytes = Math.max(maxScenarioBytes, written)
  }

  const short: PlanDescription['shortfall']['short'] = {}
  const reflowedInto: PlanDescription['shortfall']['reflowedInto'] = {}
  let shortTotal = 0
  for (const cls of CLASSES) {
    if (actual[cls] < quota[cls]) {
      short[cls] = quota[cls] - actual[cls]
      shortTotal += quota[cls] - actual[cls]
    } else if (actual[cls] > quota[cls]) reflowedInto[cls] = actual[cls] - quota[cls]
  }

  const uncovered: PlanDescription['uncovered'] = {}
  const classCoverage: PlanDescription['classCoverage'] = {}
  for (const cls of CLASSES) {
    classCoverage[cls] = {}
    for (const dim of CLASS_DIMENSIONS[cls]) {
      if (dim === 'app') continue
      const allowed = DIMENSIONS[dim as Exclude<DimensionName, 'app'>]
        .map(([id]) => id)
        .filter((id) => weightOf(cls, dim as Exclude<DimensionName, 'app'>, id) > 0)
      const missing = allowed.filter((id) => !(dimensions[dim]?.[id]?.byClass[cls] ?? 0))
      classCoverage[cls][dim] = {
        allowed: allowed.length,
        seen: allowed.length - missing.length,
        missing
      }
    }
  }
  for (const [dim, rows] of Object.entries(DIMENSIONS)) {
    const missing = rows
      .map(([id]) => id)
      .filter(
        (id) =>
          dimensions[dim]?.[id]?.total === 0 &&
          CLASSES.some(
            (cls) =>
              CLASS_DIMENSIONS[cls].includes(dim as DimensionName) &&
              weightOf(cls, dim as Exclude<DimensionName, 'app'>, id) > 0
          )
      )
    if (missing.length > 0) uncovered[dim] = missing
  }

  const survivors = plan.scenarios.filter(
    (scenario) =>
      scenario.class === 'create-image' && scenario.dims.writeMode !== 'create-then-delete'
  ).length
  const perClass = {} as Record<ScenarioClass, ClassDistinct>
  for (const cls of CLASSES) {
    let capacity: number
    if (cls === 'search-app') capacity = appPairCapacity(plan.options.apps)
    else {
      const dims = CLASS_DIMENSIONS[cls].filter(
        (dim): dim is Exclude<DimensionName, 'app'> => dim !== 'app'
      )
      capacity = dims.reduce((product, dim) => product * allowedValues(cls, dim).length, 1)
      if (cls === 'search-created')
        capacity = Math.min(capacity, survivors * allowedValues(cls, 'query').length)
    }
    perClass[cls] = {
      scenarios: actual[cls],
      tuples: classTuples[cls].size,
      requested: quota[cls],
      capacity
    }
  }

  return {
    seed: plan.seed,
    count: plan.count,
    total: plan.scenarios.length,
    distinct: { scenarios: plan.scenarios.length, ids: ids.size, tuples: tuples.size, perClass },
    classValues,
    classes: Object.fromEntries(
      CLASSES.map((cls) => [cls, { requested: quota[cls], actual: actual[cls] }])
    ) as PlanDescription['classes'],
    shortfall: { total: shortTotal, short, reflowedInto },
    dimensions,
    uncovered,
    classCoverage,
    checks,
    corpus: {
      directories: plan.corpus.directories.length,
      files: plan.corpus.files.length,
      bytes: plan.corpus.files.reduce((sum, file) => sum + file.payload.bytes, 0)
    },
    writes: { totalBytes, maxScenarioBytes }
  }
}

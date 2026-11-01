import { describe, expect, it } from 'vitest'
import type { GenerateOptions, Scenario, ScenarioClass } from '../types'
import {
  COPY_LARGE_FORMATS,
  COPY_SOURCE_FORMATS,
  COPY_SOURCE_SIZES,
  copySourcePath
} from './corpus'
import { describePlan } from './describe'
import {
  DEFAULT_MIX,
  CLASSES,
  PROFILE_COUNTS,
  classQuota,
  generatePlan,
  scenarioId,
  tupleKey
} from './plan'
import { ADMITTED_EXTENSIONS, SIZE_BYTES, valueIds } from './dimensions'
import { CROWDED_DIRECTORIES } from './placement'
import { excludedUnconditionally, pathProblem } from './policy'
import { APPS, SEED, flatSteps, optionsFor, smokePlan } from './test-fixtures'
import { validatePlan } from './validate'

const json = (options: GenerateOptions): string => JSON.stringify(generatePlan(options))
const dirName = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const ofClass = (rows: Scenario[], cls: ScenarioClass): Scenario[] =>
  rows.filter((scenario) => scenario.class === cls)

describe('determinism', () => {
  const VARIANTS: Array<[string, GenerateOptions]> = [
    ['fixture apps', optionsFor(200)],
    ['no apps, odd count', { seed: 1, count: 57, apps: [] }],
    [
      'negative seed with a mix',
      {
        seed: -7,
        count: 90,
        apps: APPS.slice(0, 12),
        mix: { 'create-image': 5, 'ignore-image': 40 }
      }
    ]
  ]

  it.each(VARIANTS)('%s: equal options give byte-identical plan JSON', (_name, options) => {
    expect(json(options)).toBe(json(options))
  })

  it('generating other plans in between changes nothing (no state survives a call)', () => {
    const first = json(optionsFor(150))
    generatePlan(optionsFor(60, { seed: SEED + 99 }))
    generatePlan({ seed: 4, count: 40, apps: [] })
    expect(json(optionsFor(150))).toBe(first)
  })

  it('the smoke profile is the 200-scenario plan of the default options', () => {
    expect(PROFILE_COUNTS).toEqual({ smoke: 200, full: 10_000 })
    expect(JSON.stringify(smokePlan())).toBe(json(optionsFor(PROFILE_COUNTS.smoke)))
  })

  it('a different seed gives a different plan: nothing but app lookups is shared', () => {
    const a = generatePlan(optionsFor(200))
    const b = generatePlan(optionsFor(200, { seed: SEED + 1 }))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
    const idsOf = (rows: Scenario[]): Set<string> =>
      new Set(rows.filter((row) => row.class !== 'search-app').map((row) => row.id))
    const shared = [...idsOf(a.scenarios)].filter((id) => idsOf(b.scenarios).has(id))
    expect(shared).toEqual([])
    expect(JSON.stringify(a.corpus)).not.toBe(JSON.stringify(b.corpus))
    expect(a.scenarios.map((row) => row.class)).not.toEqual(b.scenarios.map((row) => row.class))
  })

  it('the installed apps change only the app part of the plan', () => {
    const few = generatePlan(optionsFor(200, { apps: APPS.slice(0, 10) }))
    const all = smokePlan()
    const apps = new Set(
      few.scenarios.filter((row) => row.class === 'search-app').map((row) => String(row.dims.app))
    )
    expect([...apps].every((app) => APPS.slice(0, 10).includes(app))).toBe(true)
    expect(JSON.stringify(few.scenarios.filter((row) => row.class === 'search-app'))).not.toBe(
      JSON.stringify(all.scenarios.filter((row) => row.class === 'search-app'))
    )
    expect(validatePlan(few)).toEqual([])
  })

  it('options and plan survive JSON unchanged, so the runner can read plan.json', () => {
    const plan = smokePlan()
    const parsed = JSON.parse(JSON.stringify(plan))
    expect(parsed).toEqual(plan)
    expect(validatePlan(parsed)).toEqual([])
    expect(plan.seed).toBe(SEED)
    expect(plan.count).toBe(200)
    expect(plan.options.apps).toEqual(APPS)
  })

  it('ids are the digest of class, dims, steps and checks', () => {
    for (const scenario of smokePlan().scenarios) {
      expect(scenario.id).toBe(
        scenarioId(scenario.class, scenario.dims, scenario.steps, scenario.checks)
      )
      expect(scenario.id).toMatch(/^[a-z-]+-[0-9a-f]{12}$/)
      expect(scenario.id.startsWith(`${scenario.class}-`)).toBe(true)
    }
    expect(tupleKey('a', { y: '2', x: '1' })).toBe(tupleKey('a', { x: '1', y: '2' }))
    expect(tupleKey('a', { x: '1' })).not.toBe(tupleKey('b', { x: '1' }))
  })
})

describe('counts and class quotas', () => {
  it.each([0, 1, 2, 3, 7, 20, 21, 50, 199, 200, 201])(
    'count %i gives exactly that many valid scenarios',
    (count) => {
      const plan = generatePlan(optionsFor(count))
      expect(plan.count).toBe(count)
      expect(plan.scenarios).toHaveLength(count)
      expect(plan.scenarios.map((row) => row.index)).toEqual(
        Array.from({ length: count }, (_, index) => index)
      )
      expect(validatePlan(plan)).toEqual([])
    }
  )

  it('the default mix is 10/20/15/30/12/5/8 percent', () => {
    expect(DEFAULT_MIX).toEqual({
      'search-app': 10,
      'search-file': 20,
      'search-image': 15,
      'create-image': 30,
      'change-image': 12,
      'ignore-image': 5,
      'search-created': 8
    })
    expect(Object.values(DEFAULT_MIX).reduce((sum, weight) => sum + weight, 0)).toBe(100)
    expect(classQuota(optionsFor(200))).toEqual({
      'search-app': 20,
      'search-file': 40,
      'search-image': 30,
      'create-image': 60,
      'change-image': 24,
      'ignore-image': 10,
      'search-created': 16
    })
    expect(classQuota(optionsFor(10_000))).toEqual({
      'search-app': 1000,
      'search-file': 2000,
      'search-image': 1500,
      'create-image': 3000,
      'change-image': 1200,
      'ignore-image': 500,
      'search-created': 800
    })
  })

  it('quotas always add up to the count and stay within one scenario of the exact share', () => {
    for (let count = 0; count <= 130; count += 1) {
      const quota = classQuota(optionsFor(count))
      expect(
        Object.values(quota).reduce((sum, value) => sum + value, 0),
        `count ${count}`
      ).toBe(count)
      for (const cls of CLASSES)
        expect(
          Math.abs(quota[cls] - (count * DEFAULT_MIX[cls]) / 100),
          `${cls} at ${count}`
        ).toBeLessThan(1)
    }
  })

  it('a mix overrides the defaults per class, and a weight that is not a positive number means zero', () => {
    expect(classQuota(optionsFor(100, { mix: { 'create-image': 0 } }))['create-image']).toBe(0)
    const bad = classQuota(
      optionsFor(100, {
        mix: {
          'search-app': -5,
          'search-file': Number.NaN,
          'search-image': Number.NEGATIVE_INFINITY
        }
      })
    )
    expect([bad['search-app'], bad['search-file'], bad['search-image']]).toEqual([0, 0, 0])
    const plan = generatePlan(optionsFor(100, { mix: { 'create-image': 0, 'search-created': 0 } }))
    expect(plan.scenarios).toHaveLength(100)
    expect(
      plan.scenarios.some((row) => row.class === 'create-image' || row.class === 'search-created')
    ).toBe(false)
  })

  it('an all-zero mix still delivers the count, spread over the classes that can be built alone', () => {
    const plan = generatePlan(
      optionsFor(100, { mix: Object.fromEntries(CLASSES.map((cls) => [cls, 0])) })
    )
    const description = describePlan(plan)
    expect(plan.scenarios).toHaveLength(100)
    expect(
      description.classes['search-app'].actual + description.classes['search-created'].actual
    ).toBe(0)
    for (const cls of [
      'search-file',
      'search-image',
      'create-image',
      'change-image',
      'ignore-image'
    ] as const)
      expect(description.classes[cls].actual).toBe(20)
    expect(validatePlan(plan)).toEqual([])
  })

  it('a plan too short for the 20-scenario gap has no search-created and reflows its share', () => {
    const description = describePlan(generatePlan(optionsFor(21)))
    expect(description.classes['search-created']).toEqual({ requested: 2, actual: 0 })
    expect(description.shortfall.short).toEqual({ 'search-created': 2 })
    expect(
      Object.values(description.shortfall.reflowedInto).reduce((sum, value) => sum + value, 0)
    ).toBe(2)
  })

  it('rejects a seed or count that is not an integer', () => {
    for (const seed of [1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => generatePlan(optionsFor(10, { seed }))).toThrow(RangeError)
    for (const count of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => generatePlan(optionsFor(count))).toThrow(RangeError)
  })
})

describe('run order', () => {
  it('interleaves the classes instead of running them in blocks', () => {
    const classes = smokePlan().scenarios.map((row) => row.class)
    let changes = 0
    let run = 1
    let longest = 1
    for (let index = 1; index < classes.length; index += 1) {
      if (classes[index] === classes[index - 1]) {
        run += 1
        longest = Math.max(longest, run)
      } else {
        changes += 1
        run = 1
      }
    }
    expect(changes).toBeGreaterThan(120)
    expect(longest).toBeLessThan(12)
    for (const cls of CLASSES) {
      const at = classes.flatMap((value, index) => (value === cls ? [index] : []))
      expect(at[at.length - 1]! - at[0]!, cls).toBeGreaterThan(60)
    }
  })

  it('numbers scenarios by their position', () => {
    smokePlan().scenarios.forEach((row, index) => expect(row.index).toBe(index))
  })
})

describe('the smoke profile', () => {
  const plan = smokePlan()
  const description = describePlan(plan)

  it('contains every class at its quota and nothing twice', () => {
    for (const cls of CLASSES)
      expect(description.classes[cls], cls).toEqual({
        requested: classQuota(plan.options)[cls],
        actual: classQuota(plan.options)[cls]
      })
    expect(description.distinct.ids).toBe(200)
    expect(description.distinct.tuples).toBe(200)
    for (const cls of CLASSES)
      expect(description.distinct.perClass[cls].tuples).toBe(
        description.distinct.perClass[cls].scenarios
      )
  })

  it('uses every declared dimension value except the ignore rules that 10 scenarios cannot reach', () => {
    expect(Object.keys(description.uncovered)).toEqual(['rule'])
    const rules = new Set(ofClass(plan.scenarios, 'ignore-image').map((row) => row.dims.rule))
    expect(rules.size).toBe(10)
    expect(description.uncovered.rule).toHaveLength(valueIds('rule').length - rules.size)
  })
})

describe('the corpus every run starts from', () => {
  const plan = smokePlan()
  const { directories, files } = plan.corpus

  it('lists directories parents first, without duplicates or unsafe paths', () => {
    const seen = new Set<string>()
    const folded = new Set<string>()
    for (const dir of directories) {
      expect(pathProblem(dir), dir).toBeNull()
      if (dir.includes('/')) expect(seen.has(dirName(dir)), `parent of ${dir}`).toBe(true)
      expect(seen.has(dir), dir).toBe(false)
      seen.add(dir)
      expect(folded.has(dir.normalize('NFC').toLowerCase()), dir).toBe(false)
      folded.add(dir.normalize('NFC').toLowerCase())
    }
    for (const dir of ['fresh', 'copy-sources', '.stage', 'ignored', ...CROWDED_DIRECTORIES])
      expect(seen.has(dir), dir).toBe(true)
  })

  it('lists files inside listed directories, once each, with indexable names except the .bak sources', () => {
    const dirs = new Set(directories)
    const folded = new Set<string>()
    for (const file of files) {
      expect(pathProblem(file.path), file.path).toBeNull()
      if (file.path.includes('/')) expect(dirs.has(dirName(file.path)), file.path).toBe(true)
      expect(dirs.has(file.path), file.path).toBe(false)
      const key = file.path.normalize('NFC').toLowerCase()
      expect(folded.has(key), file.path).toBe(false)
      folded.add(key)
      if (excludedUnconditionally(file.path, ADMITTED_EXTENSIONS))
        expect(file.path, 'only restore sources may be excluded').toMatch(/\.bak$/)
      if (file.payload.kind === 'text' && file.payload.bytes > 0)
        expect(file.text?.length, file.path).toBeGreaterThan(0)
    }
  })

  it('holds a copy source for each format and size, including the empty one', () => {
    const byPath = new Map(files.map((file) => [file.path, file]))
    for (const format of COPY_SOURCE_FORMATS) {
      for (const size of COPY_SOURCE_SIZES) {
        const file = byPath.get(copySourcePath(format, size))
        if (size === 'large' && !COPY_LARGE_FORMATS.has(format))
          expect(file, `${format}/${size}`).toBeUndefined()
        else expect(file?.payload.bytes, `${format}/${size}`).toBe(SIZE_BYTES[size])
      }
    }
    expect(byPath.get('copy-sources/src-zero-byte.png')?.payload.bytes).toBe(0)
  })

  it('every copy step names a seeded source', () => {
    const known = new Set(files.map((file) => file.path))
    const copies = plan.scenarios
      .flatMap((row) => flatSteps(row.steps))
      .filter((step) => step.op === 'copy')
    expect(copies.length).toBeGreaterThan(3)
    for (const step of copies) {
      expect(known.has(step.from), step.from).toBe(true)
      expect(known.has(step.to), step.to).toBe(false)
    }
  })

  it('each crowded directory already holds well over 100 unrelated files', () => {
    for (const dir of CROWDED_DIRECTORIES)
      expect(files.filter((file) => dirName(file.path) === dir).length, dir).toBeGreaterThanOrEqual(
        120
      )
  })
})

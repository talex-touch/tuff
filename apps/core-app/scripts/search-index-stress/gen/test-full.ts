import { beforeAll, describe, expect, it } from 'vitest'
import type { GenerateOptions, PayloadSpec, Scenario, ScenarioClass, ScenarioPlan } from '../types'
import { appPairCapacity } from './build-app'
import { describePlan, type PlanDescription } from './describe'
import { MAX_CORPUS_BYTES, MAX_CORPUS_FILES, MAX_SCENARIO_WRITE_BYTES } from './dimensions'
import { CLASSES, MIN_CREATED_GAP, classQuota, generatePlan } from './plan'
import { flatSteps } from './test-fixtures'
import { validatePlan } from './validate'

const MIB = 1024 * 1024

export interface FullExpectations {
  name: string
  options: GenerateOptions
  /** Declared values nobody can use with these options (apps give acronyms their only home). */
  uncovered: Record<string, string[]>
}

function payloadsOf(plan: ScenarioPlan): PayloadSpec[] {
  const out = plan.corpus.files.map((file) => file.payload)
  for (const scenario of plan.scenarios) {
    for (const step of flatSteps(scenario.steps))
      if (step.op === 'write' || step.op === 'write-atomic') out.push(step.payload)
  }
  return out
}

/** Registers the 10,000-scenario checks for one set of options; each test file holds one, so vitest runs them on separate workers. */
export function runFullSuite({ name, options, uncovered }: FullExpectations): void {
  describe(`${name}: ${options.count} scenarios`, () => {
    let plan!: ScenarioPlan
    let description!: PlanDescription
    let seconds = 0

    beforeAll(() => {
      const started = performance.now()
      plan = generatePlan(options)
      seconds = (performance.now() - started) / 1000
      description = describePlan(plan)
    }, 120_000)

    it('generates in under 10 seconds', () => {
      expect(plan.scenarios).toHaveLength(options.count)
      expect(seconds).toBeLessThan(10)
    })

    it('passes the validator', () => {
      expect(validatePlan(plan)).toEqual([])
    })

    it('holds that many different situations: unique ids and unique (class, dims) tuples, class by class', () => {
      expect(description.distinct.scenarios).toBe(options.count)
      expect(description.distinct.ids).toBe(options.count)
      expect(description.distinct.tuples).toBe(options.count)
      for (const cls of CLASSES) {
        const row = description.distinct.perClass[cls]
        expect(row.tuples, cls).toBe(row.scenarios)
        expect(row.capacity, cls).toBeGreaterThanOrEqual(row.scenarios)
      }
    })

    it('gives search-app what the installed apps can express and moves the rest to other classes', () => {
      const quota = classQuota(options)['search-app']
      const capacity = appPairCapacity(options.apps)
      const actual = description.classes['search-app'].actual
      expect(actual).toBe(Math.min(quota, capacity))
      expect(description.distinct.perClass['search-app'].capacity).toBe(capacity)
      expect(description.shortfall.total).toBe(quota - actual)
      expect(description.shortfall.short).toEqual(
        quota > actual ? { 'search-app': quota - actual } : {}
      )
      const moved = Object.entries(description.shortfall.reflowedInto)
      expect(moved.reduce((sum, [, count]) => sum + count, 0)).toBe(quota - actual)
      for (const [cls] of moved) expect(['search-app', 'search-created']).not.toContain(cls)
    })

    it('meets the quota of every other class', () => {
      for (const cls of CLASSES.filter((value) => value !== 'search-app')) {
        expect(description.classes[cls].actual, cls).toBeGreaterThanOrEqual(
          description.classes[cls].requested
        )
      }
      expect(CLASSES.reduce((sum, cls) => sum + description.classes[cls].actual, 0)).toBe(
        options.count
      )
    })

    it('keeps the seeded corpus within 64 MiB and 8000 files', () => {
      expect(description.corpus.bytes).toBeLessThanOrEqual(MAX_CORPUS_BYTES)
      expect(description.corpus.bytes).toBeLessThanOrEqual(64 * MIB)
      expect(description.corpus.files).toBeLessThanOrEqual(MAX_CORPUS_FILES)
    })

    it('keeps the plan JSON under 25 MB', () => {
      expect(Buffer.byteLength(JSON.stringify(plan))).toBeLessThan(25_000_000)
    })

    it('never lets one scenario write more than 4 MiB, nor a run write a gigabyte', () => {
      expect(description.writes.maxScenarioBytes).toBeLessThanOrEqual(MAX_SCENARIO_WRITE_BYTES)
      expect(description.writes.totalBytes).toBeLessThan(1024 * MIB)
    })

    it('still carries the heavy cases: 20+ PNG and JPEG images of 2-8 MiB and 5+ strips 10,000 pixels wide', () => {
      const payloads = payloadsOf(plan)
      const heavy = payloads.filter(
        (payload) =>
          (payload.kind === 'png' || payload.kind === 'jpg') &&
          payload.bytes >= 2 * MIB &&
          payload.bytes <= 8 * MIB
      )
      expect(heavy.length).toBeGreaterThanOrEqual(20)
      expect(heavy.filter((payload) => payload.kind === 'png').length).toBeGreaterThanOrEqual(5)
      expect(heavy.filter((payload) => payload.kind === 'jpg').length).toBeGreaterThanOrEqual(5)
      expect(
        payloads.filter((payload) => (payload.width ?? 0) >= 10_000).length
      ).toBeGreaterThanOrEqual(5)
    })

    it('reaches every declared dimension value that the options allow', () => {
      expect(description.uncovered).toEqual(uncovered)
    })

    it('pairs every search-created scenario with its own create-image, at least 20 scenarios earlier', () => {
      const byId = new Map<string, Scenario>(
        plan.scenarios.map((scenario) => [scenario.id, scenario])
      )
      const partners = new Set<string>()
      const problems: string[] = []
      for (const scenario of plan.scenarios) {
        const refs = scenario.requires ?? []
        if (scenario.class !== 'search-created') {
          if (refs.length > 0) problems.push(`${scenario.id} requires something`)
          continue
        }
        const partner = byId.get(refs[0] as string)
        const klass: ScenarioClass | undefined = partner?.class
        if (refs.length !== 1 || klass !== 'create-image' || !partner)
          problems.push(`${scenario.id}: bad partner`)
        else if (scenario.index - partner.index < MIN_CREATED_GAP)
          problems.push(`${scenario.id}: gap ${scenario.index - partner.index}`)
        else if (partners.has(partner.id)) problems.push(`${scenario.id}: partner used twice`)
        else partners.add(partner.id)
      }
      expect(problems).toEqual([])
      expect(partners.size).toBe(description.classes['search-created'].actual)
    })
  })
}

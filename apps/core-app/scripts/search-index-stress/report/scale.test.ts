import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ReportInputs } from '../eval-types'
import { FAILURE_ROW_CAPS } from './failures'
import { thousands } from './format'
import { buildReport, writeReport, type BuiltReport } from './index'
import { numbersIn } from './testing/json'
import { syntheticRun } from './testing/synthetic'

const SCENARIOS = 10_000
const BUDGET_MS = 2_000
const PLACEHOLDER = /undefined|NaN|\[object Object\]|Infinity/

interface Timed {
  inputs: ReportInputs
  report: BuiltReport
  ms: number
}

function timed(inputs: ReportInputs): Timed {
  const started = performance.now()
  const report = buildReport(inputs)
  return { inputs, report, ms: performance.now() - started }
}

/** The same run in which every search-file check gives a wrong answer. */
function everyFileSearchFails(inputs: ReportInputs): ReportInputs {
  return {
    ...inputs,
    results: inputs.results.map((result) =>
      result.class === 'search-file'
        ? {
            ...result,
            tier: 'hard',
            outcome: 'fail',
            latencyMs: null,
            sinceStepsMs: null,
            rank: null,
            detail: 'target not found within 5000 ms'
          }
        : result
    )
  }
}

describe('a run of 10,000 different scenarios', () => {
  let normal: Timed
  let disaster: Timed

  beforeAll(() => {
    const inputs = syntheticRun({ scenarios: SCENARIOS, seed: 1030 })
    normal = timed(inputs)
    disaster = timed(everyFileSearchFails(inputs))
  })

  it('is shaped like a real run: seven classes, about 1.4 checks per scenario, a few hundred misses', () => {
    const { inputs } = normal
    expect(inputs.meta.scenarioCount).toBe(SCENARIOS)
    expect(Object.keys(inputs.dims)).toHaveLength(SCENARIOS)
    expect(inputs.results.length).toBeGreaterThan(13_000)
    expect(inputs.results.length).toBeLessThan(15_000)
    expect(new Set(inputs.results.map((r) => r.class)).size).toBe(7)
    const notPassing = inputs.results.filter((r) => r.outcome !== 'pass').length
    expect(notPassing).toBeGreaterThan(100)
    expect(notPassing).toBeLessThan(1_000)
  })

  it('builds the report well inside the time budget, with or without failures to list', () => {
    expect(normal.ms).toBeLessThan(BUDGET_MS)
    expect(disaster.ms).toBeLessThan(BUDGET_MS)
  })

  it('keeps the Markdown short enough to read', () => {
    for (const { report } of [normal, disaster]) {
      const lines = report.markdown.split('\n')
      expect(lines.length).toBeLessThan(800)
      expect(report.markdown.length).toBeLessThan(100_000)
      expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(1_500)
    }
  })

  it('keeps report.json small and every number in it finite', () => {
    for (const { report } of [normal, disaster]) {
      expect(JSON.stringify(report.json).length).toBeLessThan(1_000_000)
      expect(numbersIn(report.json).filter(([, value]) => !Number.isFinite(value))).toEqual([])
      expect(JSON.parse(JSON.stringify(report.json))).toEqual(report.json)
    }
  })

  it('never prints a placeholder of a bug', () => {
    expect(normal.report.markdown).not.toMatch(PLACEHOLDER)
    expect(disaster.report.markdown).not.toMatch(PLACEHOLDER)
  })

  it('says which of the long lists it cut and how many entries went with them', () => {
    const { json, markdown } = normal.report
    const { hardUndecided, softFailed } = json.failures
    expect(hardUndecided.total).toBeGreaterThan(10)
    expect(softFailed.total).toBeGreaterThan(FAILURE_ROW_CAPS.softFailed)
    expect(markdown).toContain(
      `Showing 10 of ${thousands(hardUndecided.total)}; all ${thousands(hardUndecided.total)} are in report.json.`
    )
    expect(markdown).toContain(
      `Showing 10 of ${thousands(softFailed.total)}; report.json keeps the first ${FAILURE_ROW_CAPS.softFailed}.`
    )
    expect(softFailed.rows).toHaveLength(FAILURE_ROW_CAPS.softFailed)
    expect(softFailed.omitted).toBe(softFailed.total - FAILURE_ROW_CAPS.softFailed)

    const { breaches } = json.monitor
    const shownBreaches = markdown
      .slice(markdown.indexOf('### Breaches'), markdown.indexOf('### App-reported lag'))
      .split('\n')
      .filter((line) => /^\| \+\d/.test(line)).length
    expect(breaches.total).toBe(120)
    expect(shownBreaches).toBeGreaterThan(0)
    expect(shownBreaches).toBeLessThan(breaches.total)
    expect(markdown).toContain(
      `${thousands(breaches.total - shownBreaches)} more episodes; all are in report.json.`
    )
    expect(markdown).toContain(
      `The 15 slowest of ${thousands(json.slowest.ranked.bySinceSteps)} found checks`
    )
    expect(markdown).toContain(
      `The 15 slowest of ${thousands(json.slowest.ranked.byAnswer)} answered present checks`
    )
    expect(json.slowest.bySinceSteps).toHaveLength(15)
    expect(json.slowest.byAnswer).toHaveLength(15)
  })

  it('names the dimension that has too many values to tabulate', () => {
    const files = normal.report.json.comparison.find((entry) => entry.class === 'search-file')
    const dir = files?.dimensions.find((entry) => entry.dim === 'dir')
    expect(dir?.skipped).toBe('more than 100 distinct values')
    expect(dir?.rows).toEqual([])
    expect(normal.report.markdown).toContain('more than 100 distinct values')
  })

  it('finds the slow cases that were planted in the data', () => {
    const { comparison } = normal.report.json
    const dimension = (cls: string, dim: string) =>
      comparison.find((entry) => entry.class === cls)?.dimensions.find((entry) => entry.dim === dim)
    for (const cls of ['search-file', 'search-image', 'search-created', 'change-image']) {
      const format = dimension(cls, 'format')
      expect(format?.rows[0].value, cls).toBe('heic')
      expect(
        format?.rows[0].flags.some((flag) => flag.metric === 'answerMs'),
        cls
      ).toBe(true)
      expect(format?.flagged, cls).toBe(1)
    }
    const placement = dimension('search-image', 'placement')
    expect(placement?.rows[0].value).toBe('deep')
    expect(placement?.rows[0].flags[0].ratio).toBeGreaterThan(2)
    expect(dimension('search-image', 'query')?.flagged).toBe(0)
    expect(normal.report.markdown).toContain('#### search-image by format')
  })

  it('gives the same text and the same data every time', () => {
    const again = buildReport(normal.inputs)
    expect(again.markdown).toBe(normal.report.markdown)
    expect(again.json).toEqual(normal.report.json)
  })

  it('fails on the hard misses and names a bounded number of them', () => {
    const { report } = normal
    expect(report.verdict).toBe('fail')
    const g1 = report.gates.find((entry) => entry.id === 'G1')
    expect(g1?.status).toBe('fail')
    expect(g1?.detail.match(/[a-z]+-[a-z]+-[0-9a-f]{12}/g)?.length).toBe(
      Math.min(20, report.json.failures.hardFailed.scenarios)
    )
  })

  describe('when every search-file check fails', () => {
    it('keeps the first rows in report.json, lists twenty in the text and says so', () => {
      const { json, markdown } = disaster.report
      const { hardFailed } = json.failures
      expect(hardFailed.total).toBeGreaterThan(2_000)
      expect(hardFailed.rows).toHaveLength(FAILURE_ROW_CAPS.hardFailed)
      expect(hardFailed.omitted).toBe(hardFailed.total - FAILURE_ROW_CAPS.hardFailed)
      expect(markdown).toContain(
        `Showing 20 of ${thousands(hardFailed.total)}; report.json keeps the first ${FAILURE_ROW_CAPS.hardFailed}.`
      )
      expect(markdown).toContain(
        `${thousands(hardFailed.total)} hard checks failed in ${thousands(hardFailed.scenarios)} scenarios.`
      )
    })

    it('still names no more than twenty scenarios in the gate and counts the rest', () => {
      const g1 = disaster.report.gates.find((entry) => entry.id === 'G1')
      expect(g1?.status).toBe('fail')
      expect(g1?.detail).toMatch(/\(\+[\d,]+ more\)/)
      expect(g1?.detail.length).toBeLessThan(1_200)
    })
  })

  describe('writing it down', () => {
    let dir: string

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'stress-scale-'))
    })

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true })
    })

    it('puts both files in the directory, complete, and nothing else', async () => {
      const files = await writeReport(dir, normal.report)
      expect(await readFile(files.markdownFile, 'utf8')).toBe(normal.report.markdown)
      expect(JSON.parse(await readFile(files.jsonFile, 'utf8'))).toEqual(normal.report.json)
      expect((await readdir(dir)).sort()).toEqual(['report.json', 'report.md'])
    })
  })
})

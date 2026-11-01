import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReportInputs } from '../eval-types'
import { buildReport, writeReport } from './index'
import {
  breach,
  errored,
  found,
  framelessPhase,
  greenInputs,
  missed,
  sid,
  withMonitor,
  withResults,
  withScenarios
} from './testing/builders'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

describe('buildReport', () => {
  it('passes a clean run and returns the same facts as data and as text', () => {
    const report = buildReport(greenInputs())
    expect(report.verdict).toBe('pass')
    expect(report.json.verdict).toBe('pass')
    expect(report.json.gates).toBe(report.gates)
    expect(report.markdown).toContain('**Verdict: PASS**')
    expect(report.markdown).not.toContain('Not passing')
  })

  it('puts the limits the monitor ran with into report.json, the share of frames over 20 ms included', () => {
    const inputs = greenInputs()
    expect(buildReport(inputs).json.monitor.thresholds).toEqual(inputs.monitor.thresholds)
    expect(buildReport(inputs).json.monitor.thresholds.frameOver20msRatio).toEqual({
      warn: 0.02,
      fail: 0.05
    })
    const strict = withMonitor(inputs, {
      thresholds: { ...inputs.monitor.thresholds, frameOver20msRatio: { warn: 0.04, fail: 0.1 } }
    })
    expect(buildReport(strict).json.monitor.thresholds.frameOver20msRatio).toEqual({
      warn: 0.04,
      fail: 0.1
    })
  })

  it('fails on a hard miss and names the scenario in the gate, the data and the text', () => {
    const inputs = withResults(greenInputs(), 'search-file', [
      missed('search-file', 1),
      found('search-file', 2),
      found('search-file', 3)
    ])
    const report = buildReport(inputs)
    expect(report.verdict).toBe('fail')
    expect(report.gates[0]).toMatchObject({ id: 'G1', status: 'fail' })
    expect(report.json.failures.hardFailed.rows.map((row) => row.scenarioId)).toEqual([
      sid('search-file', 1)
    ])
    expect(report.markdown).toContain('**Verdict: FAIL**')
    expect(report.markdown).toContain(sid('search-file', 1))
  })

  it('fails on a gate that is only unknown: what was not proven did not pass', () => {
    const report = buildReport(withMonitor(greenInputs(), { phases: [framelessPhase()] }))
    expect(report.gates.some((entry) => entry.status === 'fail')).toBe(false)
    expect(report.gates.find((entry) => entry.status === 'unknown')?.id).toBe('G7')
    expect(report.verdict).toBe('fail')
    expect(report.markdown).toContain('Not passing: G7 Frame delivery (unknown).')
  })

  it('reports an aborted run: scenarios never started, an undecided check and no database check', () => {
    const notRun = Array.from({ length: 40 }, (_, n) => sid('create-image', 500 + n))
    const aborted: ReportInputs = {
      ...withResults(greenInputs(), 'create-image', [
        found('create-image', 0),
        errored('create-image', 1)
      ]),
      notRun,
      db: { checked: false, results: [] }
    }
    const report = buildReport(aborted)
    const status = Object.fromEntries(report.gates.map((entry) => [entry.id, entry.status]))
    expect(status).toMatchObject({ G1: 'unknown', G2: 'fail', G8: 'unknown' })
    expect(report.verdict).toBe('fail')
    expect(report.gates.find((entry) => entry.id === 'G2')?.detail).toContain('40 not run')
    expect(report.json.coverage.notRun).toMatchObject({ total: 40 })
    expect(report.json.coverage.notRun.ids).toHaveLength(20)
    expect(report.markdown).toContain('Scenarios never started: 40')
    expect(report.markdown).toContain('quick_check did not run, so the databases are unverified.')
  })

  it('does not change its inputs and gives the same answer every time', () => {
    const inputs = deepFreeze(
      withMonitor(
        withResults(greenInputs(), 'search-file', [
          missed('search-file', 1),
          found('search-file', 2)
        ]),
        {
          breaches: [breach({ at: 3 }), breach({ at: 1, severity: 'warn' })],
          appReportedLag: [{ at: 5, lagMs: 300, contexts: ['a', 'b'] }]
        }
      )
    )
    const first = buildReport(inputs)
    const second = buildReport(inputs)
    expect(second.markdown).toBe(first.markdown)
    expect(second.json).toEqual(first.json)
  })

  it('judges against limits passed with the inputs and says which ones', () => {
    const report = buildReport({ ...greenInputs(), limits: { indexP95WarnMs: 1_000 } })
    expect(report.gates.find((entry) => entry.id === 'G3')?.status).toBe('warn')
    expect(report.json.limits.indexP95WarnMs).toBe(1_000)
    expect(report.markdown).toContain('p95 <= 1 s warns')
  })

  it('refuses a limit that cannot be right', () => {
    expect(() => buildReport({ ...greenInputs(), limits: { blindShareFail: 2 } })).toThrow(
      'invalid report limit blindShareFail: 2'
    )
    expect(() => buildReport({ ...greenInputs(), limits: { outlierFactor: 1 } })).toThrow(
      'invalid report limit outlierFactor: 1'
    )
  })

  it('handles a run with no results at all', () => {
    const report = buildReport({ ...greenInputs(), results: [], planned: {}, dims: {}, notRun: [] })
    expect(report.verdict).toBe('fail')
    expect(report.markdown).toContain('No create-image check was decided.')
    expect(report.markdown).toContain('No hard check gave a wrong answer.')
  })

  it('handles a bigger run without losing the failures it cut from the text', () => {
    const inputs = withScenarios(greenInputs(), 'search-file', 300, (n) =>
      n % 2 === 0 ? missed('search-file', n) : found('search-file', n)
    )
    const report = buildReport(inputs)
    expect(report.json.failures.hardFailed).toMatchObject({ total: 150, omitted: 0 })
    expect(report.markdown).toContain('Showing 20 of 150; all 150 are in report.json.')
  })
})

describe('writeReport', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stress-report-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes report.json and report.md and returns where they are', async () => {
    const report = buildReport(greenInputs())
    const files = await writeReport(join(dir, 'out'), report)
    expect(files).toEqual({
      jsonFile: join(dir, 'out', 'report.json'),
      markdownFile: join(dir, 'out', 'report.md')
    })
    expect(await readFile(files.markdownFile, 'utf8')).toBe(report.markdown)
    const text = await readFile(files.jsonFile, 'utf8')
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "schemaVersion": 1,')
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(report.json)))
  })

  it('creates the directory, nested if need be', async () => {
    await writeReport(join(dir, 'a', 'b', 'c'), buildReport(greenInputs()))
    expect(await readdir(join(dir, 'a', 'b', 'c'))).toEqual(['report.json', 'report.md'])
  })

  it('overwrites the files of an earlier run and leaves no temporary file behind', async () => {
    await writeReport(dir, buildReport(greenInputs()))
    const bad = buildReport(withResults(greenInputs(), 'search-file', [missed('search-file', 1)]))
    await writeReport(dir, bad)
    expect(await readFile(join(dir, 'report.md'), 'utf8')).toBe(bad.markdown)
    expect(JSON.parse(await readFile(join(dir, 'report.json'), 'utf8')).verdict).toBe('fail')
    expect((await readdir(dir)).sort()).toEqual(['report.json', 'report.md'])
  })

  it('leaves no temporary file behind when the target cannot be replaced, and says why', async () => {
    await mkdir(join(dir, 'report.md', 'occupied'), { recursive: true })
    await expect(writeReport(dir, buildReport(greenInputs()))).rejects.toThrow()
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('does not touch other files in the directory', async () => {
    await writeFile(join(dir, 'timeline.ndjson'), 'keep\n')
    await writeReport(dir, buildReport(greenInputs()))
    expect(await readFile(join(dir, 'timeline.ndjson'), 'utf8')).toBe('keep\n')
  })
})

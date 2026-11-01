import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DbIntegrity } from '../eval-types'
import type { CheckResult, Scenario, ScenarioPlan } from '../types'
import { buildReport, DEFAULT_THRESHOLDS } from './deps'
import { buildLayout, segmentPaths } from './layout'
import {
  buildReportInputs,
  countPlanned,
  dimsOf,
  emptyMonitorSummary,
  loadRunForReport,
  scenariosNotRun
} from './report-inputs'
import { openResultsStore } from './results-store'
import type { StoredMeta } from './run-meta'
import { writeMeta } from './run-meta'

function scenario(index: number, cls: Scenario['class'], dims: Scenario['dims'] = {}): Scenario {
  return {
    id: `${cls}-${String(index).padStart(12, '0')}`,
    index,
    class: cls,
    dims,
    steps: [],
    checks: [
      {
        query: 'q',
        target: { kind: 'app', name: 'Notes' },
        expect: 'present',
        topK: 5,
        tier: 'hard',
        deadlineMs: 1_000
      }
    ]
  }
}

const plan: ScenarioPlan = {
  seed: 7,
  count: 4,
  options: { seed: 7, count: 4, apps: ['Notes'] },
  corpus: { directories: [], files: [] },
  scenarios: [
    scenario(0, 'search-app', { app: 'Notes' }),
    scenario(1, 'search-app', { app: 'Safari' }),
    scenario(2, 'create-image', { mode: 'write' }),
    scenario(3, 'search-file')
  ]
}

function check(
  scenarioId: string,
  cls: CheckResult['class'],
  overrides: Partial<CheckResult> = {}
): CheckResult {
  return {
    scenarioId,
    checkIndex: 0,
    class: cls,
    tier: 'hard',
    outcome: 'pass',
    latencyMs: 40,
    sinceStepsMs: null,
    polls: 1,
    rank: 1,
    resultCount: 3,
    answerMs: 35,
    expect: 'present',
    phase: 'steady',
    ...overrides
  }
}

describe('plan summaries', () => {
  it('counts scenarios per class and keeps their dims by id', () => {
    expect(countPlanned(plan)).toEqual({ 'search-app': 2, 'create-image': 1, 'search-file': 1 })
    expect(dimsOf(plan)[plan.scenarios[2].id]).toEqual({ mode: 'write' })
  })

  it('lists the scenarios that left neither a result nor a finished record', () => {
    const [a, b, c, d] = plan.scenarios
    const loaded = { checks: [check(a.id, 'search-app')], completed: new Set([b.id]) }
    expect(scenariosNotRun(plan, loaded)).toEqual([c.id, d.id])
    expect(scenariosNotRun(plan, { checks: [], completed: new Set() })).toHaveLength(4)
  })
})

describe('emptyMonitorSummary', () => {
  it('merges threshold overrides into the defaults and carries the note', () => {
    const summary = emptyMonitorSummary(10, { rssMb: { warn: 1, fail: 2 } }, 'no samples')
    expect(summary.thresholds.rssMb).toEqual({ warn: 1, fail: 2 })
    expect(summary.thresholds.cpuPct).toEqual(DEFAULT_THRESHOLDS.cpuPct)
    expect(summary).toMatchObject({
      startedAt: 10,
      endedAt: 10,
      phases: [],
      breaches: [],
      notes: ['no samples']
    })
  })
})

describe('loadRunForReport', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stress-report-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const storedMeta = (): StoredMeta => ({
    version: 1,
    runId: 'report-run-1',
    profile: 'smoke',
    seed: 7,
    count: 4,
    argv: ['run'],
    startedAt: 1_000,
    endedAt: 61_000,
    status: 'finished',
    abortReason: null,
    options: {
      embedding: 'off',
      ui: 'hidden',
      qps: 4,
      nice: 10,
      concurrency: 6,
      burstConcurrency: 12,
      searchTimeoutMs: 8_000,
      seedTimeoutSec: 600
    },
    corpus: { root: path.join(dir, 'corpus'), owned: false },
    host: { os: 'darwin', cpus: 14, memGb: 48 },
    apps: { found: 40, used: 2 },
    switches: {},
    segments: []
  })

  it('reads the files a run leaves behind and feeds the real report builder', async () => {
    const layout = buildLayout({
      runId: 'report-run-1',
      runDir: path.join(dir, 'run'),
      corpusRoot: path.join(dir, 'corpus')
    })
    await mkdir(layout.runDir, { recursive: true })
    await writeFile(layout.planFile, JSON.stringify(plan))
    await writeMeta(layout.metaFile, storedMeta())
    const store = openResultsStore(layout.resultsFile)
    store.appendCheck(check(plan.scenarios[0].id, 'search-app'))
    store.appendScenarioDone({
      scenarioId: plan.scenarios[0].id,
      stepsOk: true,
      stepsMs: 0,
      totalMs: 50
    })
    store.close()

    const { stored, inputs } = await loadRunForReport(layout)

    expect(stored.runId).toBe('report-run-1')
    expect(inputs.meta).toMatchObject({
      runId: 'report-run-1',
      scenarioCount: 4,
      endedAt: 61_000,
      profile: 'smoke'
    })
    expect(inputs.results).toHaveLength(1)
    expect(inputs.planned).toEqual({ 'search-app': 2, 'create-image': 1, 'search-file': 1 })
    expect(inputs.notRun).toEqual(plan.scenarios.slice(1).map((entry) => entry.id))
    expect(inputs.db).toEqual({ checked: false, results: [] })
    expect(inputs.monitor.notes?.[0]).toContain('no monitor summary')

    const report = buildReport(inputs)
    expect(report.verdict).toBe('fail')
    expect(report.markdown).toContain('report-run-1')
  })

  it('uses the monitor summary and the integrity result when they exist', async () => {
    const layout = buildLayout({
      runId: 'report-run-1',
      runDir: path.join(dir, 'run'),
      corpusRoot: path.join(dir, 'corpus')
    })
    await mkdir(layout.runDir, { recursive: true })
    const db: DbIntegrity = { checked: true, results: [{ file: 'a.db', ok: true }] }
    await writeFile(layout.planFile, JSON.stringify(plan))
    await writeMeta(layout.metaFile, storedMeta())
    await writeFile(layout.dbFile, JSON.stringify(db))
    await writeFile(
      layout.monitorSummaryFile,
      JSON.stringify(emptyMonitorSummary(5, undefined, 'from the monitor'))
    )

    const { inputs } = await loadRunForReport(layout)

    expect(inputs.db).toEqual(db)
    expect(inputs.monitor.notes).toEqual(['from the monitor'])
    expect(
      buildReportInputs({
        meta: inputs.meta,
        plan,
        results: { checks: [], completed: new Set(), done: new Map(), events: [], corruptLines: 0 },
        monitor: inputs.monitor,
        db
      }).notRun
    ).toHaveLength(4)
  })

  it('reads the monitor summary of the last app start of a resumed run', async () => {
    const layout = buildLayout({
      runId: 'report-run-1',
      runDir: path.join(dir, 'run'),
      corpusRoot: path.join(dir, 'corpus')
    })
    await mkdir(layout.runDir, { recursive: true })
    const meta = storedMeta()
    meta.segments = [1, 2].map((index) => ({
      index,
      profileDir: `p${index}`,
      startedAt: index,
      endedAt: index + 1,
      cleanShutdown: true,
      appPid: index,
      leftPids: [],
      abortReason: null
    }))
    await writeFile(layout.planFile, JSON.stringify(plan))
    await writeMeta(layout.metaFile, meta)
    await writeFile(
      layout.monitorSummaryFile,
      JSON.stringify(emptyMonitorSummary(1, undefined, 'first start'))
    )
    await writeFile(
      segmentPaths(layout, 2).monitorSummaryFile,
      JSON.stringify(emptyMonitorSummary(2, undefined, 'second start'))
    )

    const { inputs } = await loadRunForReport(layout)

    expect(inputs.monitor.notes).toEqual(['second start'])
    expect(inputs.meta.switches).toMatchObject({ segments: 2 })
  })

  it('says which file is missing', async () => {
    const layout = buildLayout({
      runId: 'report-run-1',
      runDir: path.join(dir, 'run'),
      corpusRoot: path.join(dir, 'corpus')
    })
    await mkdir(layout.runDir, { recursive: true })
    await expect(loadRunForReport(layout)).rejects.toThrow(/meta\.json is missing/)
    await writeMeta(layout.metaFile, storedMeta())
    await expect(loadRunForReport(layout)).rejects.toThrow(/plan\.json is missing/)
  })
})

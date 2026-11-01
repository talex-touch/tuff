import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CheckResult } from '../types'
import { loadResults, openResultsStore } from './results-store'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync('/private/tmp/stress-results-')
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const check = (
  scenarioId: string,
  checkIndex: number,
  outcome: CheckResult['outcome'] = 'pass'
): CheckResult => ({
  scenarioId,
  checkIndex,
  class: 'search-file',
  tier: 'hard',
  outcome,
  latencyMs: 10,
  sinceStepsMs: 10,
  polls: 1,
  rank: 1,
  resultCount: 3,
  answerMs: 4
})

describe('results store', () => {
  it('appends records and loads them back, marking only finished scenarios as completed', () => {
    const file = path.join(dir, 'nested', 'results.ndjson')
    const store = openResultsStore(file, () => 111)
    store.appendEvent('phase', 'steady')
    store.appendCheck(check('s1', 0))
    store.appendCheck(check('s1', 1, 'fail'))
    store.appendScenarioDone({ scenarioId: 's1', stepsOk: true, stepsMs: 5, totalMs: 40 })
    store.appendCheck(check('s2', 0))
    store.close()

    const loaded = loadResults(file)
    expect(loaded.checks.map((c) => `${c.scenarioId}#${c.checkIndex}:${c.outcome}`)).toEqual([
      's1#0:pass',
      's1#1:fail',
      's2#0:pass'
    ])
    expect([...loaded.completed]).toEqual(['s1'])
    expect(loaded.done.get('s1')?.totalMs).toBe(40)
    expect(loaded.events).toEqual([
      { kind: 'run-event', at: 111, event: 'phase', detail: 'steady' }
    ])
    expect(loaded.corruptLines).toBe(0)
  })

  it('lets a later record for the same check replace the earlier one (a re-run on resume)', () => {
    const file = path.join(dir, 'r.ndjson')
    const store = openResultsStore(file)
    store.appendCheck(check('s1', 0, 'error'))
    store.appendCheck(check('s1', 0, 'pass'))
    store.close()
    const loaded = loadResults(file)
    expect(loaded.checks).toHaveLength(1)
    expect(loaded.checks[0].outcome).toBe('pass')
  })

  it('survives a half-written last line and starts the next record on a fresh line', () => {
    const file = path.join(dir, 'r.ndjson')
    const first = openResultsStore(file)
    first.appendCheck(check('s1', 0))
    first.close()
    fs.appendFileSync(file, '{"kind":"check","scenarioId":"s2","chec')

    const crashed = loadResults(file)
    expect(crashed.checks).toHaveLength(1)
    expect(crashed.corruptLines).toBe(1)

    const second = openResultsStore(file)
    second.appendCheck(check('s3', 0))
    second.close()
    const resumed = loadResults(file)
    expect(resumed.checks.map((c) => c.scenarioId)).toEqual(['s1', 's3'])
  })

  it('returns an empty result for a missing file and ignores writes after close', () => {
    expect(loadResults(path.join(dir, 'missing.ndjson')).checks).toEqual([])
    const file = path.join(dir, 'r.ndjson')
    const store = openResultsStore(file)
    store.close()
    store.appendCheck(check('late', 0))
    store.close()
    expect(loadResults(file).checks).toEqual([])
    expect(os.platform()).toBe('darwin')
  })
})

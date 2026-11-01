import { describe, expect, it } from 'vitest'
import { FAILURE_ROW_CAPS, collectFailures, scenarioIds, type FailureRow } from './failures'
import { prepare } from './results'
import { absentBad, absentOk, errored, found, missed, sid, skippedCheck } from './testing/builders'

const collect = (...args: Parameters<typeof prepare>) => collectFailures(prepare(...args))

describe('collectFailures', () => {
  it('sorts checks into hard misses, hard undecided and soft misses, and leaves passes out', () => {
    const results = [
      found('search-file', 1),
      missed('search-file', 2),
      absentBad('ignore-image', 3),
      errored('create-image', 4),
      skippedCheck('create-image', 5),
      missed('search-image', 6, { tier: 'soft' }),
      errored('search-image', 7, { tier: 'soft' }),
      absentOk('ignore-image', 8)
    ]
    const failures = collect(results, {})
    expect(failures.hardFailed.rows.map((row) => row.scenarioId)).toEqual([
      sid('search-file', 2),
      sid('ignore-image', 3)
    ])
    expect(failures.hardUndecided.rows.map((row) => [row.scenarioId, row.outcome])).toEqual([
      [sid('create-image', 4), 'error'],
      [sid('create-image', 5), 'skipped']
    ])
    expect(failures.softFailed.rows.map((row) => row.scenarioId)).toEqual([sid('search-image', 6)])
    expect(failures.hardFailed).toMatchObject({ total: 2, scenarios: 2, omitted: 0 })
  })

  it('counts distinct scenarios apart from checks', () => {
    const results = [
      missed('search-file', 1),
      missed('search-file', 1, { checkIndex: 1 }),
      missed('search-file', 2)
    ]
    expect(collect(results, {}).hardFailed).toMatchObject({ total: 3, scenarios: 2 })
  })

  it('carries the scenario dimensions, the detail and the check index of each row', () => {
    const results = [missed('create-image', 1, { checkIndex: 2, detail: 'never searchable' })]
    const [row] = collect(results, { [sid('create-image', 1)]: { format: 'heic', size: 3 } })
      .hardFailed.rows
    expect(row).toEqual<FailureRow>({
      scenarioId: sid('create-image', 1),
      checkIndex: 2,
      class: 'create-image',
      tier: 'hard',
      outcome: 'fail',
      detail: 'never searchable',
      dims: { format: 'heic', size: 3 }
    })
  })

  it('leaves the detail key out when there is none and truncates a long one', () => {
    const results = [
      missed('search-file', 1, { detail: undefined }),
      missed('search-file', 2, { detail: 'x'.repeat(1_000) })
    ]
    const [plain, long] = collect(results, {}).hardFailed.rows
    expect('detail' in plain).toBe(false)
    expect(plain.dims).toEqual({})
    expect(long.detail?.length).toBe(240)
    expect(long.detail?.endsWith('…')).toBe(true)
  })

  it('keeps only the first rows of an over-long list and says how many were left out', () => {
    const results = Array.from({ length: 250 }, (_, n) => missed('search-file', n))
    const { hardFailed } = collect(results, {})
    expect(hardFailed.rows).toHaveLength(FAILURE_ROW_CAPS.hardFailed)
    expect(hardFailed).toMatchObject({ total: 250, scenarios: 250, omitted: 50 })
    expect(hardFailed.rows[0].scenarioId).toBe(sid('search-file', 0))
    expect(hardFailed.rows[199].scenarioId).toBe(sid('search-file', 199))
  })

  it('caps the undecided and the soft lists at their own sizes', () => {
    const results = [
      ...Array.from({ length: 130 }, (_, n) => errored('create-image', n)),
      ...Array.from({ length: 70 }, (_, n) => missed('search-image', n, { tier: 'soft' }))
    ]
    const failures = collect(results, {})
    expect(FAILURE_ROW_CAPS).toEqual({ hardFailed: 200, hardUndecided: 100, softFailed: 50 })
    expect(failures.hardUndecided).toMatchObject({ total: 130, omitted: 30 })
    expect(failures.hardUndecided.rows).toHaveLength(100)
    expect(failures.softFailed).toMatchObject({ total: 70, omitted: 20 })
    expect(failures.softFailed.rows).toHaveLength(50)
  })

  it('is empty for a clean run', () => {
    const failures = collect([found('search-file', 1), absentOk('ignore-image', 2)], {})
    for (const list of [failures.hardFailed, failures.hardUndecided, failures.softFailed]) {
      expect(list).toEqual({ total: 0, scenarios: 0, rows: [], omitted: 0 })
    }
  })

  it('judges the last result of a repeated check', () => {
    const failures = collect([missed('search-file', 1), found('search-file', 1)], {})
    expect(failures.hardFailed.total).toBe(0)
  })
})

describe('scenarioIds', () => {
  const rows = ['a', 'b', 'a', 'c', 'd'].map((scenarioId) => ({ scenarioId }) as FailureRow)

  it('lists distinct ids, first seen first, up to the maximum', () => {
    expect(scenarioIds(rows, 10)).toEqual(['a', 'b', 'c', 'd'])
    expect(scenarioIds(rows, 3)).toEqual(['a', 'b', 'c'])
    expect(scenarioIds(rows, 0)).toEqual([])
    expect(scenarioIds([], 5)).toEqual([])
  })
})

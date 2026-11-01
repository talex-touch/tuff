import { describe, expect, it } from 'vitest'
import { buildClassReports } from './classes'
import { foundSummary } from './found'
import { prepare } from './results'
import { absentBad, absentOk, errored, found, missed } from './testing/builders'
import type { CheckResult } from '../types'

const summary = (results: CheckResult[]) =>
  foundSummary(buildClassReports(prepare(results, {}), {}, []))

describe('foundSummary', () => {
  it('counts what was looked for and what was found, per kind of thing', () => {
    const rows = summary([
      found('search-app', 1),
      found('search-app', 2),
      missed('search-app', 3),
      found('search-file', 1),
      found('search-image', 1),
      missed('search-image', 2),
      missed('search-image', 3)
    ])
    expect(rows.map((row) => [row.what, row.present, row.found])).toEqual([
      ['Apps', 3, 2],
      ['Files', 1, 1],
      ['Images already on disk', 3, 1]
    ])
  })

  it('pools created and searched-after-creation images, and keeps changed and ignored ones apart', () => {
    const rows = summary([
      found('create-image', 1),
      missed('create-image', 2),
      found('search-created', 1),
      found('change-image', 1),
      absentOk('change-image', 2),
      absentOk('ignore-image', 1),
      absentOk('ignore-image', 2),
      absentBad('ignore-image', 3)
    ])
    expect(rows.find((row) => row.what === 'Images added during the run')).toMatchObject({
      classes: ['create-image', 'search-created'],
      present: 3,
      found: 2,
      absent: 0,
      heldOut: 0
    })
    expect(rows.find((row) => row.what === 'Images renamed, overwritten or deleted')).toMatchObject(
      { present: 1, found: 1, absent: 1, heldOut: 1 }
    )
    expect(rows.find((row) => row.what === 'Images that must not be indexed')).toMatchObject({
      present: 0,
      absent: 3,
      heldOut: 2
    })
  })

  it('counts soft checks as well as hard ones, and leaves errors and skipped checks out', () => {
    const [apps] = summary([
      found('search-app', 1),
      missed('search-app', 2, { tier: 'soft' }),
      errored('search-app', 3)
    ])
    expect(apps).toMatchObject({ present: 2, found: 1 })
  })

  it('omits a kind of thing with no decided check, and keeps the fixed order', () => {
    expect(summary([errored('search-file', 1)])).toEqual([])
    expect(summary([])).toEqual([])
    const rows = summary([
      absentOk('ignore-image', 1),
      found('search-app', 1),
      found('create-image', 1)
    ])
    expect(rows.map((row) => row.what)).toEqual([
      'Apps',
      'Images added during the run',
      'Images that must not be indexed'
    ])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createClientListFetcher } from './admin-client-list'

interface Row { id: number, kind: string }
interface Filters extends Record<string, string> { kind: string }

const ROWS: Row[] = Array.from({ length: 45 }, (_, index) => ({ id: index + 1, kind: index % 3 === 0 ? 'a' : 'b' }))

function byKind(row: Row, filters: Filters) {
  return filters.kind === 'all' || row.kind === filters.kind
}

describe('createClientListFetcher', () => {
  it('loads once and pages through the copy afterwards', async () => {
    const loadAll = vi.fn(async () => ROWS)
    const fetchRows = createClientListFetcher<Row, Filters>(loadAll, byKind)

    const first = await fetchRows({ page: 1, limit: 20, filters: { kind: 'all' } })
    expect(first.total).toBe(45)
    expect(first.rows.map(row => row.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))

    const last = await fetchRows({ page: 3, limit: 20, filters: { kind: 'all' } })
    expect(last.rows.map(row => row.id)).toEqual([41, 42, 43, 44, 45])

    // A page change and a filter change are slices of the copy, not requests.
    const filtered = await fetchRows({ page: 1, limit: 20, filters: { kind: 'a' } })
    expect(filtered.total).toBe(15)
    expect(filtered.rows.every(row => row.kind === 'a')).toBe(true)
    expect(loadAll).toHaveBeenCalledTimes(1)
  })

  it('reports the filtered count as the total, so the pager follows the filters', async () => {
    const fetchRows = createClientListFetcher<Row, Filters>(async () => ROWS, byKind)
    const page = await fetchRows({ page: 2, limit: 10, filters: { kind: 'a' } })
    expect(page.total).toBe(15)
    expect(page.rows).toHaveLength(5)
  })

  it('answers a page past the end with no rows and the real total', async () => {
    // useAdminList sees the total and moves back to the last page that exists.
    const fetchRows = createClientListFetcher<Row, Filters>(async () => ROWS, byKind)
    const page = await fetchRows({ page: 9, limit: 20, filters: { kind: 'all' } })
    expect(page).toEqual({ rows: [], total: 45 })
  })

  it('loads again after invalidate()', async () => {
    let version = 0
    const loadAll = vi.fn(async () => {
      version += 1
      return ROWS.slice(0, version * 10)
    })
    const fetchRows = createClientListFetcher<Row, Filters>(loadAll, byKind)

    expect((await fetchRows({ page: 1, limit: 50, filters: { kind: 'all' } })).total).toBe(10)
    expect((await fetchRows({ page: 1, limit: 50, filters: { kind: 'all' } })).total).toBe(10)

    fetchRows.invalidate()
    expect((await fetchRows({ page: 1, limit: 50, filters: { kind: 'all' } })).total).toBe(20)
    expect(loadAll).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed load, so the retry asks again', async () => {
    const loadAll = vi.fn()
      .mockRejectedValueOnce(new Error('[GET] "/api/dashboard/updates": 500'))
      .mockResolvedValueOnce(ROWS)
    const fetchRows = createClientListFetcher<Row, Filters>(loadAll, byKind)

    await expect(fetchRows({ page: 1, limit: 20, filters: { kind: 'all' } })).rejects.toThrow()
    expect((await fetchRows({ page: 1, limit: 20, filters: { kind: 'all' } })).total).toBe(45)
    expect(loadAll).toHaveBeenCalledTimes(2)
  })

  it('shares one load between calls that arrive while it is running', async () => {
    let resolve: ((rows: Row[]) => void) | undefined
    const loadAll = vi.fn(() => new Promise<Row[]>((done) => {
      resolve = done
    }))
    const fetchRows = createClientListFetcher<Row, Filters>(loadAll, byKind)

    const first = fetchRows({ page: 1, limit: 20, filters: { kind: 'all' } })
    const second = fetchRows({ page: 1, limit: 20, filters: { kind: 'a' } })
    // `loadAll` starts on the next microtask.
    await Promise.resolve()
    expect(loadAll).toHaveBeenCalledTimes(1)
    resolve!(ROWS)

    expect((await first).total).toBe(45)
    expect((await second).total).toBe(15)
    expect(loadAll).toHaveBeenCalledTimes(1)
  })

  it('treats a load that is not a list as no rows', async () => {
    const fetchRows = createClientListFetcher<Row, Filters>(async () => null as unknown as Row[], byKind)
    expect(await fetchRows({ page: 1, limit: 20, filters: { kind: 'all' } })).toEqual({ rows: [], total: 0 })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createClipboardRecommendationSource } from './clipboard-recommendation-source'

type Row = {
  id: number
  type: string
  content: string
  sourceApp?: string | null
  thumbnail?: string | null
  metadata?: string | null
}

/**
 * Minimal drizzle chain stub: `db.select().from(t).where(c).get()`.
 * `rows` is keyed by clipboard id; a miss returns undefined, like the real `.get()`.
 */
function fakeDb(rows: Record<number, Row>): {
  handle: unknown
  whereCalls: number
} {
  const state = { whereCalls: 0 }
  let requestedId = -1

  const handle = {
    select: () => ({
      from: () => ({
        where: (condition: { id: number }) => {
          state.whereCalls += 1
          requestedId = condition.id
          return { get: async () => rows[requestedId] }
        }
      })
    })
  }

  return {
    handle,
    get whereCalls() {
      return state.whereCalls
    }
  } as never
}

// `eq(column, value)` is stubbed to surface the id so the fake `where` can resolve a row.
vi.mock('drizzle-orm', () => ({
  eq: (_column: unknown, value: number) => ({ id: value })
}))

vi.mock('../../../../db/schema', () => ({
  clipboardHistory: { id: 'id' }
}))

function makeDbUtils(
  aux: Record<number, Row>,
  core: Record<number, Row> = aux
): {
  getAuxDb: () => unknown
  getDb: () => unknown
} {
  const auxHandle = fakeDb(aux).handle
  const coreHandle = aux === core ? auxHandle : fakeDb(core).handle
  return { getAuxDb: () => auxHandle, getDb: () => coreHandle }
}

describe('clipboard recommendation source', () => {
  it('declares the canonical id and the legacy alias', () => {
    const source = createClipboardRecommendationSource(makeDbUtils({}) as never)
    expect(source.sourceId).toBe('clipboard-history')
    expect(source.aliases).toContain('clipboard')
  })

  it('returns [] without touching the db for an empty id list', async () => {
    const getAuxDb = vi.fn()
    const source = createClipboardRecommendationSource({ getAuxDb, getDb: vi.fn() } as never)

    await expect(source.rebuild([])).resolves.toEqual([])
    expect(getAuxDb).not.toHaveBeenCalled()
  })

  it('renders a text record with a truncated title and a panel preview', async () => {
    const long = 'x'.repeat(150)
    const source = createClipboardRecommendationSource(
      makeDbUtils({ 1: { id: 1, type: 'text', content: long, sourceApp: 'Notes' } }) as never
    )

    const [item] = await source.rebuild(['1'])

    expect(item.id).toBe('clipboard-1')
    expect(item.kind).toBe('document')
    expect(item.render.basic?.title).toBe(`${'x'.repeat(97)}...`)
    expect(item.render.basic?.subtitle).toBe('Text from Notes')
    expect(item.render.preview).toEqual({ type: 'panel', content: long })
  })

  it('keeps a short text title intact', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({ 1: { id: 1, type: 'text', content: 'hello', sourceApp: null } }) as never
    )

    const [item] = await source.rebuild(['1'])

    expect(item.render.basic?.title).toBe('hello')
    expect(item.render.basic?.subtitle).toBe('Text from Unknown')
  })

  it('names a single-file record after its basename and counts multiples', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({
        1: { id: 1, type: 'files', content: JSON.stringify(['/tmp/a/report.pdf']) },
        2: { id: 2, type: 'files', content: JSON.stringify(['/a', '/b', '/c']) },
        3: { id: 3, type: 'files', content: 'not json' }
      }) as never
    )

    const items = await source.rebuild(['1', '2', '3'])

    expect(items.map((item) => item.render.basic?.title)).toEqual([
      'report.pdf',
      '3 files',
      'Files from clipboard'
    ])
    expect(items.every((item) => item.kind === 'file')).toBe(true)
  })

  it('appends an OCR excerpt to the existing subtitle', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({
        1: {
          id: 1,
          type: 'text',
          content: 'body',
          sourceApp: 'Preview',
          metadata: JSON.stringify({ ocr_excerpt: '  invoice total  ' })
        }
      }) as never
    )

    const [item] = await source.rebuild(['1'])

    expect(item.render.basic?.subtitle).toBe('Text from Preview · invoice total')
  })

  it('ignores unparseable metadata rather than failing the item', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({
        1: { id: 1, type: 'text', content: 'body', sourceApp: 'A', metadata: '{broken' }
      }) as never
    )

    const [item] = await source.rebuild(['1'])

    expect(item.render.basic?.subtitle).toBe('Text from A')
  })

  it('falls back to the core db when the row is missing from aux', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({}, { 7: { id: 7, type: 'text', content: 'from core' } }) as never
    )

    const [item] = await source.rebuild(['7'])

    expect(item?.render.basic?.title).toBe('from core')
  })

  it('skips non-numeric ids and rows that no longer exist', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({ 1: { id: 1, type: 'text', content: 'kept' } }) as never
    )

    const items = await source.rebuild(['not-a-number', '999', '1'])

    expect(items.map((item) => item.id)).toEqual(['clipboard-1'])
  })

  it('degrades to [] when the db handle throws', async () => {
    const source = createClipboardRecommendationSource({
      getAuxDb: () => {
        throw new Error('db unavailable')
      },
      getDb: () => {
        throw new Error('db unavailable')
      }
    } as never)

    await expect(source.rebuild(['1'])).resolves.toEqual([])
  })

  it('exposes paste and copy actions', async () => {
    const source = createClipboardRecommendationSource(
      makeDbUtils({ 1: { id: 1, type: 'text', content: 'x' } }) as never
    )

    const [item] = await source.rebuild(['1'])

    expect((item.actions ?? []).map((action) => action.id)).toEqual(['paste', 'copy'])
  })
})

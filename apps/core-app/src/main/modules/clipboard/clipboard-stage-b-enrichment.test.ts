import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAppSemanticAliases } from '../box-tool/addon/apps/app-semantic-catalog'
import {
  ClipboardStageBEnrichment,
  buildActiveAppSourcePatch,
  type ClipboardStageBJob
} from './clipboard-stage-b-enrichment'

vi.mock('../../db/schema', () => ({
  clipboardHistory: {
    id: 'id'
  }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq-clause')
}))

function createJob(overrides: Partial<ClipboardStageBJob> = {}): ClipboardStageBJob {
  return {
    generation: 1,
    clipboardId: 7,
    item: { id: 7, type: 'text', content: 'hello', metadata: '{"existing":true}' },
    formats: ['text/plain'],
    ...overrides
  }
}

function createDb() {
  let persistedMetadata: string | undefined
  const where = vi.fn(async () => undefined)
  const set = vi.fn((values: { metadata?: string }) => {
    persistedMetadata = values.metadata
    return { where }
  })
  const update = vi.fn(() => ({ set }))
  return { update, set, where, getPersistedMetadata: () => persistedMetadata }
}

describe('clipboard-stage-b-enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('projects source application aliases from the semantic catalog', () => {
    const apps = [
      {
        bundleId: 'com.tencent.xin',
        displayName: '微信',
        executablePath: '/Applications/WeChat.app'
      },
      {
        bundleId: 'com.bytedance.feishu',
        displayName: '飞书',
        executablePath: '/Applications/Feishu.app'
      }
    ]

    for (const app of apps) {
      const sourceSearchTerms = resolveAppSemanticAliases({
        name: app.displayName,
        displayName: app.displayName,
        bundleId: app.bundleId,
        path: app.executablePath
      })

      const patch = buildActiveAppSourcePatch(
        { ...app, identifier: null, processId: 42, icon: null },
        'fallback'
      )

      expect(patch.patch.source_search_terms).toEqual(sourceSearchTerms)
      expect(patch.entries).toContainEqual({
        key: 'source_search_terms',
        value: sourceSearchTerms
      })
    }
  })

  it('enqueues OCR and patches source metadata when generation is current', async () => {
    const db = createDb()
    const sourceSearchTerms = resolveAppSemanticAliases({
      name: '微信',
      displayName: '微信',
      bundleId: 'com.tencent.xin',
      path: '/Applications/WeChat.app'
    })
    const enqueueOcr = vi.fn(async () => undefined)
    const patchCachedMeta = vi.fn()
    const updateCachedSource = vi.fn()
    const persistMetaEntriesSafely = vi.fn()
    const withDbWrite = vi.fn(async (_label, operation) => await operation(db))
    const enrichment = new ClipboardStageBEnrichment({
      getDatabase: () => db as never,
      getCachedItemById: () => createJob().item,
      getActiveAppSnapshot: () => ({
        bundleId: 'com.tencent.xin',
        identifier: null,
        displayName: '微信',
        processId: 10,
        executablePath: '/Applications/WeChat.app',
        icon: null
      }),
      getAppLanguageHint: () => 'zh-CN',
      getLatestGeneration: () => 1,
      enqueueOcr,
      patchCachedMeta,
      updateCachedSource,
      metaPersistence: { withDbWrite, persistMetaEntriesSafely } as never,
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await enrichment.process(createJob())

    expect(enqueueOcr).toHaveBeenCalledWith({
      clipboardId: 7,
      item: createJob().item,
      formats: ['text/plain'],
      languageHint: 'zh-CN'
    })
    expect(withDbWrite).toHaveBeenCalledWith('clipboard.stage-b.source', expect.any(Function), {
      dropPolicy: 'drop',
      maxQueueWaitMs: 10_000
    })
    expect(updateCachedSource).toHaveBeenCalledWith(7, 'com.tencent.xin')
    expect(patchCachedMeta).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        source_displayName: '微信',
        source_search_terms: sourceSearchTerms
      })
    )
    expect(JSON.parse(db.getPersistedMetadata() ?? '{}')).toMatchObject({
      source: expect.objectContaining({ displayName: '微信' }),
      source_search_terms: sourceSearchTerms
    })
    expect(persistMetaEntriesSafely).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        source_displayName: '微信',
        source_search_terms: sourceSearchTerms
      }),
      expect.arrayContaining([{ key: 'source_search_terms', value: sourceSearchTerms }]),
      { dropPolicy: 'drop', maxQueueWaitMs: 10_000 }
    )
  })

  it('skips stale generation jobs before side effects', async () => {
    const enqueueOcr = vi.fn()
    const enrichment = new ClipboardStageBEnrichment({
      getDatabase: () => undefined,
      getCachedItemById: () => undefined,
      getActiveAppSnapshot: () => null,
      getAppLanguageHint: () => undefined,
      getLatestGeneration: () => 2,
      enqueueOcr,
      patchCachedMeta: vi.fn(),
      updateCachedSource: vi.fn(),
      metaPersistence: { withDbWrite: vi.fn(), persistMetaEntriesSafely: vi.fn() } as never,
      logWarn: vi.fn(),
      logDebug: vi.fn()
    })

    await enrichment.process(createJob({ generation: 1 }))

    expect(enqueueOcr).not.toHaveBeenCalled()
  })
})

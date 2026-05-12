import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  const where = vi.fn(async () => undefined)
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { update, set, where }
}

describe('clipboard-stage-b-enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds source patch from active app metadata', () => {
    expect(
      buildActiveAppSourcePatch(
        {
          bundleId: 'com.demo.app',
          identifier: 'demo',
          displayName: 'Demo',
          processId: 42,
          executablePath: '/Applications/Demo.app',
          icon: null
        },
        'fallback'
      )
    ).toEqual({
      sourceApp: 'com.demo.app',
      patch: {
        source: {
          bundleId: 'com.demo.app',
          displayName: 'Demo',
          processId: 42,
          executablePath: '/Applications/Demo.app',
          icon: null
        },
        source_bundleId: 'com.demo.app',
        source_displayName: 'Demo',
        source_processId: 42,
        source_executablePath: '/Applications/Demo.app'
      },
      entries: expect.arrayContaining([
        { key: 'source_bundleId', value: 'com.demo.app' },
        { key: 'source_processId', value: 42 }
      ])
    })
  })

  it('enqueues OCR and patches source metadata when generation is current', async () => {
    const db = createDb()
    const enqueueOcr = vi.fn(async () => undefined)
    const patchCachedMeta = vi.fn()
    const updateCachedSource = vi.fn()
    const persistMetaEntriesSafely = vi.fn()
    const withDbWrite = vi.fn(async (_label, operation) => await operation())
    const enrichment = new ClipboardStageBEnrichment({
      getDatabase: () => db as never,
      getCachedItemById: () => createJob().item,
      getActiveAppSnapshot: () => ({
        bundleId: null,
        identifier: null,
        displayName: 'Notes',
        processId: 10,
        executablePath: '/Applications/Notes.app',
        icon: null
      }),
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
      formats: ['text/plain']
    })
    expect(withDbWrite).toHaveBeenCalledWith('clipboard.stage-b.source', expect.any(Function), {
      dropPolicy: 'drop',
      maxQueueWaitMs: 10_000
    })
    expect(updateCachedSource).toHaveBeenCalledWith(7, 'Notes')
    expect(patchCachedMeta).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ source_displayName: 'Notes' })
    )
    expect(persistMetaEntriesSafely).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ source_displayName: 'Notes' }),
      expect.any(Array),
      { dropPolicy: 'drop', maxQueueWaitMs: 10_000 }
    )
  })

  it('skips stale generation jobs before side effects', async () => {
    const enqueueOcr = vi.fn()
    const enrichment = new ClipboardStageBEnrichment({
      getDatabase: () => undefined,
      getCachedItemById: () => undefined,
      getActiveAppSnapshot: () => null,
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

import type { IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import {
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  isIndexedSourceAdmissionReady,
  isIndexedSourceLifecycleReady
} from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import {
  buildQuicklinksIndexedSource,
  buildQuicklinksIndexedSourceDescriptor,
  mapQuicklinkToIndexedSourceRecord
} from './quicklinks-indexed-source'

describe('quicklinksIndexedSource', () => {
  const quicklink = {
    id: 'docs',
    title: 'Open Docs',
    url: 'https://docs.example.com',
    subtitle: 'Developer docs',
    keywords: ['docs', 'developer'],
    tags: ['official'],
    updatedAt: 1700000000000,
    metadata: {
      pluginName: 'touch-dev-toolbox'
    }
  }

  it('describes Quicklinks as a low-privacy official indexed source', () => {
    const descriptor = buildQuicklinksIndexedSourceDescriptor()

    expect(descriptor).toMatchObject({
      id: 'quicklinks',
      kind: 'quicklink',
      storage: 'sqlite-index',
      privacy: 'low',
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        reset: true,
        clear: true,
        open: true
      },
      admission: {
        owner: 'official-plugin',
        permissionScopes: ['none'],
        defaultState: 'enabled',
        clearable: true,
        rebuildable: true
      }
    })
    expect(isIndexedSourceAdmissionReady(descriptor)).toBe(true)
  })

  it('maps quicklink items into indexed source records', () => {
    expect(mapQuicklinkToIndexedSourceRecord('quicklinks', quicklink)).toEqual(
      expect.objectContaining({
        sourceId: 'quicklinks',
        recordId: 'docs',
        stableKey: 'docs',
        kind: 'quicklink',
        title: 'Open Docs',
        subtitle: 'Developer docs',
        uri: 'https://docs.example.com',
        keywords: ['docs', 'developer'],
        tags: ['official'],
        mtime: 1700000000000,
        metadata: expect.objectContaining({
          pluginName: 'touch-dev-toolbox',
          url: 'https://docs.example.com'
        })
      })
    )
  })

  it('keeps the lifecycle contract ready even before persistent plugin storage lands', () => {
    const source = buildQuicklinksIndexedSource()

    expect(isIndexedSourceLifecycleReady(source)).toBe(true)
  })

  it('reports empty runtime-feed diagnostics without faking indexed content', async () => {
    const source = buildQuicklinksIndexedSource()

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'degraded',
      permissionState: 'not-required',
      itemCount: 0,
      watchState: 'active',
      reconcileState: 'idle',
      reason: 'quicklinks-empty'
    })
    await expect(source.getRoots()).resolves.toEqual([])
    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'quicklinks:official-plugin-feed',
        status: 'degraded',
        itemCount: 0,
        reason: 'quicklinks-empty'
      })
    ])
  })

  it('reports disabled diagnostics when provider config disables the source', async () => {
    const source = buildQuicklinksIndexedSource({ enabled: false, items: [quicklink] })
    const batches: IndexedSourceRecordBatch[] = []

    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'disabled',
      permissionState: 'not-required',
      itemCount: 0,
      watchState: 'not-supported',
      reconcileState: 'idle',
      reason: 'quicklinks-provider-disabled'
    })
    await expect(source.getRoots()).resolves.toEqual([])
    await expect(source.getEvidence?.()).resolves.toEqual([
      expect.objectContaining({
        id: 'quicklinks:official-plugin-feed',
        status: 'disabled',
        itemCount: 0,
        reason: 'quicklinks-provider-disabled'
      })
    ])

    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.Startup
    })) {
      batches.push(batch)
    }

    expect(batches).toEqual([])
    await expect(
      source.reconcile?.({
        sourceId: source.descriptor.id,
        reason: IndexedSourceReconcileReasons.ExternalRefresh
      })
    ).resolves.toMatchObject({
      sourceId: 'quicklinks',
      changed: 0,
      skipped: 1,
      reason: 'quicklinks-provider-disabled'
    })
  })

  it('returns runtime record batches from injected quicklink snapshots', async () => {
    const source = buildQuicklinksIndexedSource({ items: [quicklink] })
    const batches: IndexedSourceRecordBatch[] = []

    for await (const batch of source.scan({
      sourceId: source.descriptor.id,
      reason: IndexedSourceScanReasons.Startup
    })) {
      batches.push(batch)
    }

    expect(batches).toEqual([
      expect.objectContaining({
        sourceId: 'quicklinks',
        done: true,
        records: [
          expect.objectContaining({
            stableKey: 'docs',
            kind: 'quicklink',
            title: 'Open Docs',
            uri: 'https://docs.example.com'
          })
        ]
      })
    ])
    await expect(source.getHealth()).resolves.toMatchObject({
      status: 'ready',
      itemCount: 1
    })
  })

  it('emits reconcile and watch deltas through the runtime emitter shape', async () => {
    const source = buildQuicklinksIndexedSource({ items: [quicklink] })

    await expect(
      source.reconcile?.({
        sourceId: source.descriptor.id,
        reason: IndexedSourceReconcileReasons.ExternalRefresh
      })
    ).resolves.toMatchObject({
      sourceId: 'quicklinks',
      changed: 1,
      skipped: 0,
      errors: 0,
      deltas: [
        expect.objectContaining({
          sourceId: 'quicklinks',
          action: 'change',
          path: 'https://docs.example.com',
          record: expect.objectContaining({
            stableKey: 'docs',
            kind: 'quicklink'
          })
        })
      ]
    })

    await expect(
      source.handleWatchEvent?.({
        sourceId: source.descriptor.id,
        action: 'change',
        path: 'quicklinks://refresh',
        occurredAt: Date.now()
      })
    ).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'quicklinks',
        action: 'change',
        reason: 'quicklinks-watch-refresh',
        path: 'https://docs.example.com'
      })
    ])
  })

  it('uses injected clear and open handlers at the runtime boundary', async () => {
    const clear = vi.fn(async () => {})
    const openUrl = vi.fn(async () => ({ status: 'started' as const }))
    const source = buildQuicklinksIndexedSource({ items: [quicklink], clear, openUrl })
    const record = mapQuicklinkToIndexedSourceRecord(source.descriptor.id, quicklink)

    await expect(source.clearIndex?.()).resolves.toBeUndefined()
    await expect(
      source.open?.(record, {
        id: 'default'
      })
    ).resolves.toEqual({ status: 'started' })
    await expect(
      source.resetIndex?.({
        sourceId: source.descriptor.id,
        reason: IndexedSourceResetReasons.UserClear
      })
    ).resolves.toMatchObject({
      sourceId: 'quicklinks',
      reason: IndexedSourceResetReasons.UserClear,
      clearedSearchIndex: false,
      clearedScanProgress: false
    })

    expect(clear).toHaveBeenCalledTimes(1)
    expect(openUrl).toHaveBeenCalledWith('https://docs.example.com', record, { id: 'default' })
  })
})

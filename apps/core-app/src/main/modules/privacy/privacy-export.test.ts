import type { PrivacyDataCategory } from '@talex-touch/utils/transport/events/types'
import type { PrivacyDataOwnerCandidate } from './data-owner'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPrivacyDataOwnerRegistry,
  definePrivacyDataOwner,
  privacyOwnerCompletedDelete
} from './data-owner'
import { privacyInspectionResult, privacyPreviewResult } from './owner-utils'
import { createPrivacyCategoryExporter } from './privacy-export'
import { DEFAULT_PRIVACY_RETENTION_POLICY } from './retention-policy'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function exportOwner(
  category: PrivacyDataCategory,
  records: readonly Record<string, unknown>[],
  options: { fail?: boolean } = {}
): PrivacyDataOwnerCandidate {
  return {
    categories: [category],
    inspect: async (request) =>
      privacyInspectionResult(category, request.policy.retentionMs, records.length, 0),
    previewDelete: async () => privacyPreviewResult(category),
    delete: async () => privacyOwnerCompletedDelete(category),
    export: async (_request, writer, signal) => {
      let exportedByteCount = 0
      let exportedItemCount = 0
      for (const record of records) {
        if (signal.aborted) break
        const written = await writer.write(record)
        exportedByteCount += written.byteCount
        exportedItemCount += 1
      }
      if (options.fail) {
        return {
          ok: false,
          code: 'PRIVACY_OWNER_DATABASE_FAILED',
          retryable: true,
          category,
          exportedItemCount,
          exportedByteCount,
          partial: exportedItemCount > 0,
          cancelled: false
        }
      }
      return {
        ok: true,
        code: 'PRIVACY_OWNER_COMPLETED',
        retryable: false,
        category,
        exportedItemCount,
        exportedByteCount,
        partial: false,
        cancelled: false
      }
    },
    applyRetention: async () => [privacyOwnerCompletedDelete(category)]
  }
}

async function fixturePath(
  name = 'privacy-export.json'
): Promise<{ root: string; target: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-export-test-'))
  roots.push(root)
  return { root, target: path.join(root, name) }
}

describe('ordinary privacy category export', () => {
  it('returns cancellation without creating a path or temporary file', async () => {
    const { root } = await fixturePath()
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: true })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_cancel'
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry,
        signal: new AbortController().signal
      })
    ).resolves.toEqual({
      format: 'talex.touch.privacy-export/v1',
      categories: ['clipboard-history'],
      cancelled: true,
      itemCount: 0,
      byteCount: 0,
      reportId: 'report_export_cancel'
    })
    expect(await fs.readdir(root)).toEqual([])
  })

  it('stops waiting for the save dialog when the export is cancelled', async () => {
    const { root } = await fixturePath('cancel-dialog.json')
    const controller = new AbortController()
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(() => new Promise<never>(() => undefined)),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_cancel_dialog'
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])

    const running = exporter.exportCategories({
      categories: ['clipboard-history'],
      policy: DEFAULT_PRIVACY_RETENTION_POLICY,
      ownerRegistry: registry,
      signal: controller.signal
    })
    controller.abort()

    await expect(running).rejects.toThrow('PRIVACY_EXPORT_CANCELLED')
    expect(await fs.readdir(root)).toEqual([])
  })

  it('streams bounded records with backpressure and durably finalizes an approved overwrite', async () => {
    const { root, target } = await fixturePath()
    await fs.writeFile(target, 'approved overwrite target')
    const order: string[] = []
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_success',
      createStream: (filePath, options) => {
        expect(options).toEqual({ flags: 'wx', mode: 0o600 })
        return createWriteStream(filePath, { ...options, highWaterMark: 1 })
      },
      syncFile: async (filePath) => {
        order.push('sync')
        const handle = await fs.open(filePath, 'r')
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
      },
      renameFile: async (from, to) => {
        order.push('rename')
        await fs.rename(from, to)
      },
      syncDirectory: async (directory) => {
        order.push('dir-sync')
        const handle = await fs.open(directory, 'r')
        await handle.sync()
        await handle.close()
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(
        exportOwner('clipboard-history', [
          { kind: 'clipboard-record', id: 1, type: 'text', createdAt: 1, favorite: true },
          { kind: 'clipboard-record', id: 2, type: 'image', createdAt: 2, favorite: false }
        ])
      )
    ])

    const result = await exporter.exportCategories({
      categories: ['clipboard-history'],
      policy: DEFAULT_PRIVACY_RETENTION_POLICY,
      ownerRegistry: registry,
      signal: new AbortController().signal
    })
    const document = JSON.parse(await fs.readFile(target, 'utf8')) as {
      format: string
      policyVersion: number
      categories: Array<{ category: string; records: unknown[] }>
    }
    expect(result).toMatchObject({
      cancelled: false,
      itemCount: 2,
      reportId: 'report_export_success'
    })
    expect(result).not.toHaveProperty('path')
    expect(document).toMatchObject({
      format: 'talex.touch.privacy-export/v1',
      policyVersion: 1,
      categories: [
        {
          category: 'clipboard-history',
          records: [
            { kind: 'clipboard-record', id: 1, type: 'text', createdAt: 1, favorite: true },
            { kind: 'clipboard-record', id: 2, type: 'image', createdAt: 2, favorite: false }
          ]
        }
      ]
    })
    expect(order).toEqual(['sync', 'rename', 'dir-sync', 'dir-sync'])
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('writes plugin ordinary records in v1 without Secret selectors or native paths', async () => {
    const { target } = await fixturePath('plugin-data.json')
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_plugin_export'
    })
    const records = [
      { kind: 'plugin-kv', pluginId: 'touch-fixture', key: 'setting', value: { enabled: true } },
      {
        kind: 'plugin-file-chunk',
        pluginId: 'touch-fixture',
        area: 'config',
        name: 'settings.json',
        chunkIndex: 0,
        encoding: 'base64url',
        bytes: 'b3JkaW5hcnk'
      }
    ]
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('plugin-data', records))
    ])

    const result = await exporter.exportCategories({
      categories: ['plugin-data'],
      policy: DEFAULT_PRIVACY_RETENTION_POLICY,
      ownerRegistry: registry
    })
    const serialized = await fs.readFile(target, 'utf8')
    const document = JSON.parse(serialized) as {
      format: string
      categories: Array<{ category: string; records: unknown[] }>
    }

    expect(result).toMatchObject({
      format: 'talex.touch.privacy-export/v1',
      categories: ['plugin-data'],
      itemCount: 2,
      cancelled: false
    })
    expect(document).toMatchObject({
      format: 'talex.touch.privacy-export/v1',
      categories: [{ category: 'plugin-data', records }]
    })
    expect(result).not.toHaveProperty('path')
    expect(serialized).not.toMatch(/(?:secretPrefix|secretKey|nativePath|private\/|endpoint|sql)/i)
  })

  it('cancels after temp fsync without committing the approved target', async () => {
    const { root, target } = await fixturePath('cancel-before-commit.json')
    const controller = new AbortController()
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_cancel_before_commit',
      syncFile: async (filePath) => {
        const handle = await fs.open(filePath, 'r')
        await handle.sync()
        await handle.close()
        controller.abort()
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry,
        signal: controller.signal
      })
    ).rejects.toThrow('PRIVACY_EXPORT_CANCELLED')
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('uses an atomic no-clobber commit when the approved target did not exist', async () => {
    const { root, target } = await fixturePath('no-clobber.json')
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_no_clobber',
      linkFile: async (from, to) => {
        await fs.writeFile(to, 'concurrent target')
        await fs.link(from, to)
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry
      })
    ).rejects.toMatchObject({ code: 'EEXIST' })
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('concurrent target')
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('does not clobber a replacement created while an approved existing target is archived', async () => {
    const { root, target } = await fixturePath('existing-target-race.json')
    await fs.writeFile(target, 'approved original target')
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_existing_target_race',
      linkFile: async (from, to) => {
        await fs.writeFile(to, 'concurrent replacement')
        await fs.link(from, to)
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry
      })
    ).rejects.toThrow('PRIVACY_EXPORT_TEMP_CLEANUP_FAILED')
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('concurrent replacement')
    const recoveryFiles = (await fs.readdir(root)).filter((name) => name.endsWith('.recovery'))
    expect(recoveryFiles).toHaveLength(1)
    await expect(fs.readFile(path.join(root, recoveryFiles[0]!), 'utf8')).resolves.toBe(
      'approved original target'
    )
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('rolls back a linked target and syncs the cleanup when directory sync initially fails', async () => {
    const { root, target } = await fixturePath('link-sync-failure.json')
    let syncCalls = 0
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_link_sync_failure',
      syncDirectory: async (directory) => {
        syncCalls += 1
        if (syncCalls === 1) throw new Error('CANARY_DIRECTORY_SYNC_FAILURE')
        const handle = await fs.open(directory, 'r')
        await handle.sync()
        await handle.close()
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry
      })
    ).rejects.toThrow('CANARY_DIRECTORY_SYNC_FAILURE')
    await expect(fs.lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    expect(syncCalls).toBe(2)
  })

  it('removes temporary output on owner failure or cancellation', async () => {
    const { root, target } = await fixturePath()
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_failure'
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(
        exportOwner('clipboard-history', [{ kind: 'clipboard-record', id: 1 }], {
          fail: true
        })
      )
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry,
        signal: new AbortController().signal
      })
    ).rejects.toThrow('PRIVACY_EXPORT_OWNER_FAILED')
    expect(await fs.readdir(root)).toEqual([])
  })

  it('enforces record, category and total limits before finalization', async () => {
    const { root, target } = await fixturePath()
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_limits',
      limits: {
        maxRecordBytes: 32,
        maxCategoryBytes: 64,
        maxCategoryRecords: 2,
        maxTotalBytes: 128,
        maxTotalRecords: 2
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(
        exportOwner('clipboard-history', [{ kind: 'clipboard-record', type: 'x'.repeat(80) }])
      )
    ])

    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry,
        signal: new AbortController().signal
      })
    ).rejects.toThrow('PRIVACY_EXPORT_LIMIT_EXCEEDED')
    expect(await fs.readdir(root)).toEqual([])
  })

  it('fails closed on target replacement and symlink targets before final rename', async () => {
    const race = await fixturePath('race.json')
    const raceExporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: race.target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_target_race',
      syncFile: async (temporary) => {
        const handle = await fs.open(temporary, 'r')
        await handle.sync()
        await handle.close()
        await fs.writeFile(race.target, 'replacement')
      }
    })
    const registry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])
    await expect(
      raceExporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry
      })
    ).rejects.toThrow('PRIVACY_EXPORT_TARGET_CHANGED')
    await expect(fs.readFile(race.target, 'utf8')).resolves.toBe('replacement')
    expect((await fs.readdir(race.root)).filter((name) => name.endsWith('.tmp'))).toEqual([])

    const symlink = await fixturePath('symlink.json')
    const outside = path.join(symlink.root, 'outside.json')
    await fs.writeFile(outside, 'outside')
    await fs.symlink(outside, symlink.target)
    const symlinkExporter = createPrivacyCategoryExporter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: symlink.target })),
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_symlink'
    })
    await expect(
      symlinkExporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: registry
      })
    ).rejects.toThrow('PRIVACY_EXPORT_TARGET_INVALID')
    await expect(fs.readFile(outside, 'utf8')).resolves.toBe('outside')
  })

  it('rejects malformed requests and accessor-backed owner results before finalization', async () => {
    const { root, target } = await fixturePath('malformed.json')
    const showSaveDialog = vi.fn(async () => ({ canceled: false, filePath: target }))
    const exporter = createPrivacyCategoryExporter({
      showSaveDialog,
      now: () => 1_700_000_000_000,
      createReportId: () => 'report_export_malformed'
    })
    const validRegistry = createPrivacyDataOwnerRegistry([
      definePrivacyDataOwner(exportOwner('clipboard-history', []))
    ])
    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history', 'clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: validRegistry
      } as never)
    ).rejects.toThrow('PRIVACY_EXPORT_REQUEST_INVALID')
    expect(showSaveDialog).not.toHaveBeenCalled()

    const getter = vi.fn(() => new Error('CANARY_NATIVE_OWNER_ERROR'))
    const hostile = exportOwner('clipboard-history', [])
    hostile.export = vi.fn(async () => {
      const result = {
        ok: true,
        code: 'PRIVACY_OWNER_COMPLETED',
        retryable: false,
        category: 'clipboard-history',
        exportedItemCount: 0,
        exportedByteCount: 0,
        partial: false,
        cancelled: false
      }
      Object.defineProperty(result, 'error', { enumerable: true, get: getter })
      return result as never
    })
    const hostileRegistry = createPrivacyDataOwnerRegistry([definePrivacyDataOwner(hostile)])
    await expect(
      exporter.exportCategories({
        categories: ['clipboard-history'],
        policy: DEFAULT_PRIVACY_RETENTION_POLICY,
        ownerRegistry: hostileRegistry
      })
    ).rejects.toThrow('PRIVACY_OWNER_INVALID')
    expect(getter).not.toHaveBeenCalled()
    expect(await fs.readdir(root)).toEqual([])
  })

  it('rejects accessor-backed and sparse nested arrays without invoking user code', async () => {
    const getter = vi.fn(() => vi.fn())
    const hostileArray = Object.defineProperty(['safe'], 'map', {
      enumerable: true,
      get: getter
    })
    const sparseArray = Array.from({ length: 2 })
    sparseArray[1] = 'value'

    for (const [index, tags] of [hostileArray, sparseArray].entries()) {
      const { root, target } = await fixturePath(`hostile-array-${index}.json`)
      const exporter = createPrivacyCategoryExporter({
        showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
        now: () => 1_700_000_000_000,
        createReportId: () => `report_hostile_array_${index}`
      })
      const registry = createPrivacyDataOwnerRegistry([
        definePrivacyDataOwner(
          exportOwner('clipboard-history', [
            {
              kind: 'clipboard-record',
              content: tags
            }
          ])
        )
      ])
      await expect(
        exporter.exportCategories({
          categories: ['clipboard-history'],
          policy: DEFAULT_PRIVACY_RETENTION_POLICY,
          ownerRegistry: registry
        })
      ).rejects.toThrow('PRIVACY_EXPORT_RECORD_INVALID')
      expect(await fs.readdir(root)).toEqual([])
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects Secret, native path, SQL, endpoint and native error fields from owner records', async () => {
    const forbiddenRecords = [
      { kind: 'row', secret: 'synthetic-secret-canary' },
      { kind: 'row', path: '/Users/private/profile.db' },
      { kind: 'row', sql: 'SELECT * FROM secrets' },
      { kind: 'row', endpoint: 'https://provider.invalid/v1?token=canary' },
      { kind: 'row', error: 'native stack canary' },
      { kind: 'row', image: 'synthetic-image-canary' },
      { kind: 'row', query: 'synthetic-query-canary' },
      { kind: 'row', prompt: 'synthetic-prompt-canary' },
      { kind: 'row', content: 'synthetic-content-canary' },
      { kind: 'row', vector: [0.1, 0.2] },
      { kind: 'clipboard-record', type: '/Users/private/profile.db' },
      { kind: 'clipboard-record', type: 'https://provider.invalid/v1?token=canary' },
      { kind: 'clipboard-record', type: 'SELECT secret FROM native_table' },
      { kind: 'clipboard-record', type: 'native stack canary' },
      { kind: 'clipboard-record', type: 'synthetic-secret-canary' }
    ]

    for (const [index, record] of forbiddenRecords.entries()) {
      const { root, target } = await fixturePath(`forbidden-${index}.json`)
      const exporter = createPrivacyCategoryExporter({
        showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
        now: () => 1_700_000_000_000,
        createReportId: () => `report_export_forbidden_${index}`
      })
      const registry = createPrivacyDataOwnerRegistry([
        definePrivacyDataOwner(exportOwner('clipboard-history', [record]))
      ])
      await expect(
        exporter.exportCategories({
          categories: ['clipboard-history'],
          policy: DEFAULT_PRIVACY_RETENTION_POLICY,
          ownerRegistry: registry,
          signal: new AbortController().signal
        })
      ).rejects.toThrow('PRIVACY_EXPORT_RECORD_INVALID')
      expect(await fs.readdir(root)).toEqual([])
    }
  })
})

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPluginOrdinaryDataOwner,
  type PluginOrdinaryDataExportRequest
} from './plugin-ordinary-data-export'

const roots: string[] = []

async function createFixture(): Promise<PluginOrdinaryDataExportRequest> {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-plugin-export-'))
  roots.push(rootPath)
  const dataRoot = path.join(rootPath, 'data')
  await Promise.all([
    mkdir(path.join(dataRoot, 'config'), { recursive: true }),
    mkdir(path.join(dataRoot, 'logs'), { recursive: true }),
    mkdir(path.join(dataRoot, 'cache'), { recursive: true }),
    mkdir(path.join(dataRoot, 'temp'), { recursive: true })
  ])
  await Promise.all([
    writeFile(path.join(dataRoot, 'ordinary.txt'), 'ordinary-data', 'utf8'),
    writeFile(path.join(dataRoot, 'config', 'settings.json'), '{"enabled":true}', 'utf8'),
    writeFile(path.join(dataRoot, 'logs', 'plugin.log'), 'secret-canary-in-log', 'utf8'),
    writeFile(path.join(dataRoot, 'plugin-sdk.sqlite'), 'secret-canary-in-sqlite', 'utf8'),
    writeFile(path.join(dataRoot, 'plugin-sdk.sqlite-wal'), 'secret-canary-in-wal', 'utf8'),
    writeFile(path.join(dataRoot, 'diagnostic.log'), 'secret-canary-in-root-log', 'utf8'),
    writeFile(path.join(dataRoot, 'cache', 'cache.bin'), 'excluded-cache', 'utf8'),
    writeFile(path.join(dataRoot, 'temp', 'temp.bin'), 'excluded-temp', 'utf8')
  ])
  return Object.freeze({
    pluginId: 'touch-fixture',
    rows: Object.freeze([{ key: 'ordinary.setting', value: '{"value":42}' }]),
    roots: Object.freeze([
      Object.freeze({
        area: 'data' as const,
        rootPath: dataRoot,
        ownerRootPath: dataRoot,
        excludedNames: Object.freeze(['config'])
      }),
      Object.freeze({
        area: 'config' as const,
        rootPath: path.join(dataRoot, 'config'),
        ownerRootPath: dataRoot
      })
    ])
  })
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true }))
  )
})

describe('plugin ordinary data export owner', () => {
  it('streams plugin KV and ordinary files while excluding logs, SQLite, cache, and temp', async () => {
    const request = await createFixture()
    const records: Array<Readonly<Record<string, unknown>>> = []
    const owner = createPluginOrdinaryDataOwner(request)

    const result = await owner.export(
      { category: 'plugin-data', nowMs: Date.now() },
      {
        write: async (record) => {
          records.push(record)
          return { byteCount: Buffer.byteLength(JSON.stringify(record), 'utf8') }
        }
      },
      new AbortController().signal
    )

    expect(result).toMatchObject({
      ok: true,
      code: 'PRIVACY_OWNER_COMPLETED',
      category: 'plugin-data',
      exportedItemCount: 3,
      partial: false,
      cancelled: false
    })
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'plugin-kv',
          pluginId: 'touch-fixture',
          key: 'ordinary.setting',
          value: { value: 42 }
        }),
        expect.objectContaining({ kind: 'plugin-file-chunk', area: 'data', name: 'ordinary.txt' }),
        expect.objectContaining({
          kind: 'plugin-file-chunk',
          area: 'config',
          name: 'settings.json'
        })
      ])
    )
    const serialized = JSON.stringify(records)
    const exportedNames = records.flatMap((record) =>
      typeof record.name === 'string' ? [record.name] : []
    )
    expect(exportedNames).not.toContain('cache.bin')
    expect(exportedNames).not.toContain('temp.bin')
    expect(exportedNames).not.toContain('plugin.log')
    expect(exportedNames).not.toContain('diagnostic.log')
    expect(exportedNames).not.toContain('plugin-sdk.sqlite')
    expect(exportedNames).not.toContain('plugin-sdk.sqlite-wal')
    expect(serialized).not.toContain('secret-canary')
    expect(serialized).not.toContain(request.roots[0].rootPath)
    expect(serialized).not.toMatch(/(?:secretPrefix|secretKey|nativePath|endpoint|sql)/i)
  })

  it('rejects a symlinked export root instead of following it', async () => {
    const request = await createFixture()
    const linkedRoot = path.join(path.dirname(request.roots[0].rootPath), 'linked-data')
    await symlink(request.roots[0].rootPath, linkedRoot, 'dir')
    const owner = createPluginOrdinaryDataOwner({
      ...request,
      roots: Object.freeze([Object.freeze({ area: 'data' as const, rootPath: linkedRoot })])
    })

    await expect(
      owner.export(
        { category: 'plugin-data', nowMs: Date.now() },
        { write: async () => ({ byteCount: 0 }) },
        new AbortController().signal
      )
    ).rejects.toThrow('PLUGIN_EXPORT_ROOT_INVALID')
  })

  it('stops without projecting writer-native failure details into an owner result', async () => {
    const request = await createFixture()
    const owner = createPluginOrdinaryDataOwner(request)

    await expect(
      owner.export(
        { category: 'plugin-data', nowMs: Date.now() },
        {
          write: async () => {
            throw new Error('synthetic writer path /private/export with Secret payload')
          }
        },
        new AbortController().signal
      )
    ).rejects.toThrow()
  })
})

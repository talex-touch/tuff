import { Buffer } from 'node:buffer'
import { constants } from 'node:fs'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TempFileService } from './temp-file.service'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

const NOW_MS = Date.UTC(2026, 6, 30, 12)
const RETENTION_MS = 24 * 60 * 60 * 1000
const CUTOFF_MS = NOW_MS - RETENTION_MS
const NAMESPACE = 'native/screenshots'
const roots: string[] = []

async function createService(): Promise<{ service: TempFileService; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'tuff-temp-retention-'))
  roots.push(root)
  return { service: new TempFileService({ baseDir: root }), root }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('tempFileService retention RED 2A', () => {
  it('uses strict < cutoff for registered namespace cleanup', async () => {
    const { service, root } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    const before = await service.createFile({ namespace: NAMESPACE, text: 'CANARY_BEFORE' })
    const equal = await service.createFile({ namespace: NAMESPACE, text: 'CANARY_EQUAL' })
    const after = await service.createFile({ namespace: NAMESPACE, text: 'CANARY_AFTER' })
    await utimes(before.path, new Date(CUTOFF_MS - 1_000), new Date(CUTOFF_MS - 1_000))
    await utimes(equal.path, new Date(CUTOFF_MS), new Date(CUTOFF_MS))
    await utimes(after.path, new Date(CUTOFF_MS + 1_000), new Date(CUTOFF_MS + 1_000))

    const result = await service.cleanupNamespace(NAMESPACE, {
      cutoffMs: CUTOFF_MS,
      maxRows: 10
    })
    expect(result).toEqual({
      deletedItemCount: 1,
      deletedByteCount: Buffer.byteLength('CANARY_BEFORE'),
      failedItemCount: 0,
      bounded: false,
      cancelled: false
    })
    expect(await exists(before.path)).toBe(false)
    expect(await exists(equal.path)).toBe(true)
    expect(await exists(after.path)).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/CANARY_|native\/screenshots/i)
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('does not follow symbolic links outside a registered namespace', async () => {
    const { service, root } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    const keeper = await service.createFile({ namespace: NAMESPACE, text: 'KEEPER' })
    await utimes(keeper.path, new Date(CUTOFF_MS + 1), new Date(CUTOFF_MS + 1))
    const outside = join(root, 'CANARY_OUTSIDE')
    await writeFile(outside, 'CANARY_OUTSIDE_CONTENT')
    await utimes(outside, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
    const link = join(service.resolveNamespaceDir(NAMESPACE), 'CANARY_LINK')
    await symlink(outside, link)

    const preview = await service.inspectNamespace(NAMESPACE, { cutoffMs: CUTOFF_MS })
    const result = await service.cleanupNamespace(NAMESPACE, { cutoffMs: CUTOFF_MS })

    expect(preview).toMatchObject({ itemCount: 0, failedItemCount: 0 })
    expect(result).toMatchObject({ deletedItemCount: 0, failedItemCount: 0 })
    expect(await exists(outside)).toBe(true)
    expect(await exists(link)).toBe(true)
  })

  it('rejects a registered namespace directory replaced by a symbolic link', async () => {
    const { service, root } = await createService()
    const outside = await mkdtemp(join(tmpdir(), 'tuff-temp-outside-'))
    roots.push(outside)
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    await mkdir(join(root, 'native'), { recursive: true })
    await symlink(outside, join(root, NAMESPACE), 'dir')

    await expect(service.inspectNamespace(NAMESPACE)).rejects.toThrow('TEMP_NAMESPACE_PATH_INVALID')
    await expect(service.createFile({ namespace: NAMESPACE, text: 'CANARY' })).rejects.toThrow(
      'TEMP_NAMESPACE_PATH_INVALID'
    )
  })

  it('normalizes hostile row limits and rejects non-finite cutoffs', async () => {
    const { service } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    await service.createFile({ namespace: NAMESPACE, text: 'bounded' })

    await expect(
      service.inspectNamespace(NAMESPACE, { maxRows: Number.NaN })
    ).resolves.toMatchObject({ itemCount: 1, bounded: false })
    await expect(
      service.cleanupNamespace(NAMESPACE, { cutoffMs: Number.POSITIVE_INFINITY })
    ).rejects.toThrow('TEMP_CUTOFF_INVALID')
  })

  it('rejects unregistered namespace creation before filesystem work', async () => {
    const { service, root } = await createService()
    await expect(
      service.createFile({ namespace: 'unregistered/private', text: 'CANARY_UNREGISTERED' })
    ).rejects.toThrow('TEMP_NAMESPACE_NOT_REGISTERED')
    expect(await exists(join(root, 'unregistered'))).toBe(false)
  })

  it('rejects hostile extensions before creating a namespace directory', async () => {
    const { service, root } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })

    await expect(
      service.createFile({
        namespace: NAMESPACE,
        ext: '../../../../CANARY_ESCAPE',
        text: 'CANARY_OUTSIDE_NAMESPACE'
      })
    ).rejects.toThrow('TEMP_FILE_EXTENSION_INVALID')

    expect(await exists(join(root, 'native'))).toBe(false)
    expect(await exists(join(root, 'CANARY_ESCAPE'))).toBe(false)
  })

  it('preserves a file replaced after retention collection', async () => {
    const { service } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    const candidate = await service.createFile({ namespace: NAMESPACE, text: 'original' })
    await utimes(candidate.path, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))

    const harness = service as unknown as {
      resolveNamespaceDirectory: (namespace: string, create: boolean) => Promise<string | null>
    }
    const resolveNamespaceDirectory = harness.resolveNamespaceDirectory.bind(service)
    let readCount = 0
    harness.resolveNamespaceDirectory = async (namespace, create) => {
      const resolved = await resolveNamespaceDirectory(namespace, create)
      if (!create && ++readCount === 2) {
        await rm(candidate.path)
        await writeFile(candidate.path, 'replacement-must-survive')
        await utimes(candidate.path, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
      }
      return resolved
    }

    const result = await service.cleanupNamespace(NAMESPACE, { cutoffMs: CUTOFF_MS })

    expect(result).toMatchObject({ deletedItemCount: 0, failedItemCount: 1 })
    await expect(readFile(candidate.path, 'utf8')).resolves.toBe('replacement-must-survive')
  })

  it('stops cleanup when the namespace root identity changes after collection', async () => {
    const { service, root } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    const candidate = await service.createFile({ namespace: NAMESPACE, text: 'original' })
    await utimes(candidate.path, new Date(CUTOFF_MS - 1), new Date(CUTOFF_MS - 1))
    const namespaceRoot = service.resolveNamespaceDir(NAMESPACE)
    const parkedRoot = join(root, 'parked-original-namespace')

    const harness = service as unknown as {
      resolveNamespaceDirectory: (namespace: string, create: boolean) => Promise<string | null>
    }
    const resolveNamespaceDirectory = harness.resolveNamespaceDirectory.bind(service)
    let readCount = 0
    harness.resolveNamespaceDirectory = async (namespace, create) => {
      const resolved = await resolveNamespaceDirectory(namespace, create)
      if (!create && ++readCount === 2) {
        await rename(namespaceRoot, parkedRoot)
        await mkdir(namespaceRoot, { recursive: true })
        await writeFile(join(namespaceRoot, 'replacement-must-survive'), 'replacement')
      }
      return resolved
    }

    const result = await service.cleanupNamespace(NAMESPACE, { cutoffMs: CUTOFF_MS })

    expect(result).toMatchObject({ deletedItemCount: 0, failedItemCount: 1 })
    await expect(readFile(join(parkedRoot, basename(candidate.path)), 'utf8')).resolves.toBe(
      'original'
    )
    await expect(readFile(join(namespaceRoot, 'replacement-must-survive'), 'utf8')).resolves.toBe(
      'replacement'
    )
  })

  it('rejects unregistered namespace cleanup and traversal before filesystem work', async () => {
    const { service, root } = await createService()
    await expect(
      service.cleanupNamespace('unregistered/private', { cutoffMs: CUTOFF_MS })
    ).rejects.toThrow('TEMP_NAMESPACE_NOT_REGISTERED')
    expect(await exists(join(root, 'unregistered'))).toBe(false)
    expect(() =>
      service.registerNamespace({ namespace: '../escape', retentionMs: RETENTION_MS })
    ).toThrow('TEMP_NAMESPACE_INVALID')
    expect(() =>
      service.registerNamespace({ namespace: '/absolute', retentionMs: RETENTION_MS })
    ).toThrow('TEMP_NAMESPACE_INVALID')
  })

  it('bounds each page, observes cancellation, and remains idempotent across retries', async () => {
    const { service } = await createService()
    service.registerNamespace({ namespace: NAMESPACE, retentionMs: RETENTION_MS })
    const files = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        service.createFile({ namespace: NAMESPACE, text: `file-${index}` })
      )
    )
    await Promise.all(
      files.map((file, index) =>
        utimes(
          file.path,
          new Date(CUTOFF_MS - 10_000 - index),
          new Date(CUTOFF_MS - 10_000 - index)
        )
      )
    )

    const first = await service.cleanupNamespace(NAMESPACE, {
      cutoffMs: CUTOFF_MS,
      maxRows: 1
    })
    expect(first).toMatchObject({
      deletedItemCount: 1,
      failedItemCount: 0,
      bounded: true,
      cancelled: false
    })

    const controller = new AbortController()
    controller.abort()
    const cancelled = await service.cleanupNamespace(NAMESPACE, {
      cutoffMs: CUTOFF_MS,
      maxRows: 10,
      signal: controller.signal
    })
    expect(cancelled).toMatchObject({ deletedItemCount: 0, cancelled: true })
    const remainingAfterCancel = await Promise.all(files.map((file) => exists(file.path)))
    expect(remainingAfterCancel.filter(Boolean)).toHaveLength(2)

    const resumed = await service.cleanupNamespace(NAMESPACE, {
      cutoffMs: CUTOFF_MS,
      maxRows: 10
    })
    expect(resumed).toMatchObject({ deletedItemCount: 2, failedItemCount: 0 })
    const idempotent = await service.cleanupNamespace(NAMESPACE, {
      cutoffMs: CUTOFF_MS,
      maxRows: 10
    })
    expect(idempotent).toMatchObject({ deletedItemCount: 0, failedItemCount: 0 })
  })
})

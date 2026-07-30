import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMainPrivacySecretFileAdapter,
  createPrivacySecretService,
  type PrivacySecretRestoreFileReference
} from './privacy-secret-service'
import { PORTABLE_SECRET_CATALOG_V1 } from './portable-secret-catalog'

const PASSWORD = 'correct horse battery staple'
const roots: string[] = []
const STORE_REVISION = 'c'.repeat(64)
const SKIP_FINGERPRINT = 'd'.repeat(64)
const OVERWRITE_FINGERPRINT = 'e'.repeat(64)
const RESTORE_FILE: PrivacySecretRestoreFileReference = Object.freeze({
  filePath: '/fixture/backup.json',
  snapshot: Object.freeze({ dev: 1, ino: 2, size: 18, mtimeMs: 3, ctimeMs: 4 }),
  digest: 'f'.repeat(64)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('privacy Secret backup service', () => {
  it('collects only catalogued values and writes an encrypted envelope without retaining plaintext', async () => {
    const catalog = PORTABLE_SECRET_CATALOG_V1.slice(0, 2)
    const secretCanary = 'SYNTHETIC_PORTABLE_SECRET_CANARY'
    const createBackup = vi.fn(async (entries: unknown, password: unknown) => {
      expect(entries).toEqual([
        expect.objectContaining({
          ownerKind: catalog[0]!.ownerKind,
          ownerId: catalog[0]!.ownerId,
          key: catalog[0]!.key,
          purpose: catalog[0]!.purpose,
          value: secretCanary
        })
      ])
      expect(JSON.stringify(entries)).not.toContain('secureStoreKey')
      expect(password).toBe(PASSWORD)
      return '{"format":"talex.touch.secret-backup"}'
    })
    const files = {
      writeBackup: vi.fn(async () => ({ cancelled: false })),
      readBackup: vi.fn()
    }
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files,
      catalog,
      readSecret: vi.fn(async (_root, key) =>
        key === catalog[0]!.secureStoreKey ? secretCanary : null
      ),
      createBackup: createBackup as never
    })

    await expect(service.backupPreview()).resolves.toEqual({
      ok: true,
      data: { portableEntryCount: 1, available: true }
    })
    await expect(service.backupWrite(PASSWORD)).resolves.toEqual({
      ok: true,
      data: { format: 'talex.touch.secret-backup', version: 1, cancelled: false }
    })
    expect(files.writeBackup).toHaveBeenCalledWith(
      '{"format":"talex.touch.secret-backup"}',
      expect.any(AbortSignal)
    )
    expect(JSON.stringify(service)).not.toContain(PASSWORD)
    expect(JSON.stringify(service)).not.toContain(secretCanary)
  })

  it('keeps one expiring restore plan and binds apply to its conflict policy fingerprint', async () => {
    let now = 1_000
    const ids = [
      'restore_11111111111111111111111111111111',
      'restore_22222222222222222222222222222222'
    ]
    const files = {
      writeBackup: vi.fn(),
      readBackup: vi.fn(async () => ({
        cancelled: false as const,
        envelope: Buffer.from('encrypted-envelope'),
        file: RESTORE_FILE
      }))
    }
    const applyRestore = vi.fn(async () => ({ imported: 2, overwritten: 1, skipped: 0 }))
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files,
      now: () => now,
      restorePlanTtlMs: 5_000,
      createRestoreId: () => ids.shift()!,
      previewRestore: vi.fn(async () => ({
        total: 2,
        conflicts: 1,
        newEntries: 1,
        storeRevision: STORE_REVISION,
        planFingerprints: {
          skip: SKIP_FINGERPRINT,
          overwrite: OVERWRITE_FINGERPRINT
        }
      })) as never,
      applyRestore: applyRestore as never
    })

    const first = await service.restorePreview(PASSWORD)
    const second = await service.restorePreview(PASSWORD)
    expect(first).toMatchObject({
      ok: true,
      data: { restoreId: 'restore_11111111111111111111111111111111' }
    })
    expect(second).toMatchObject({
      ok: true,
      data: { restoreId: 'restore_22222222222222222222222222222222' }
    })

    await expect(
      service.restoreApply('restore_11111111111111111111111111111111', PASSWORD, 'skip')
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID',
      retryable: false
    })
    expect(applyRestore).not.toHaveBeenCalled()

    now = 10_000
    await expect(
      service.restoreApply('restore_22222222222222222222222222222222', PASSWORD, 'overwrite')
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    })
  })

  it('consumes a valid plan once, reopens and reauthenticates the bound file, then wipes buffers', async () => {
    const envelopes: Buffer[] = []
    const files = {
      writeBackup: vi.fn(),
      readBackup: vi.fn(
        async (_signal: AbortSignal, _expectedFile?: PrivacySecretRestoreFileReference) => {
          const envelope = Buffer.from('encrypted-envelope')
          envelopes.push(envelope)
          return { cancelled: false as const, envelope, file: RESTORE_FILE }
        }
      )
    }
    const previewRestore = vi.fn(async () => ({
      total: 2,
      conflicts: 1,
      newEntries: 1,
      storeRevision: STORE_REVISION,
      planFingerprints: {
        skip: SKIP_FINGERPRINT,
        overwrite: OVERWRITE_FINGERPRINT
      }
    }))
    const applyRestore = vi.fn(async () => ({ imported: 2, overwritten: 1, skipped: 0 }))
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files,
      now: () => 1_000,
      createRestoreId: () => 'restore_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      previewRestore: previewRestore as never,
      applyRestore: applyRestore as never
    })

    await service.restorePreview(PASSWORD)
    expect(envelopes[0]?.every((byte) => byte === 0)).toBe(true)
    await expect(
      service.restoreApply('restore_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', PASSWORD, 'overwrite')
    ).resolves.toEqual({
      ok: true,
      data: { importedCount: 2, overwrittenCount: 1, skippedCount: 0 }
    })
    expect(applyRestore).toHaveBeenCalledWith(
      '/fixture/root',
      expect.any(Uint8Array),
      PASSWORD,
      'overwrite',
      OVERWRITE_FINGERPRINT
    )
    expect(files.readBackup).toHaveBeenCalledTimes(2)
    expect(files.readBackup.mock.calls[1]?.[1]).toEqual(RESTORE_FILE)
    expect(previewRestore).toHaveBeenCalledTimes(2)
    expect(envelopes).toHaveLength(2)
    expect(envelopes.every((envelope) => envelope.every((byte) => byte === 0))).toBe(true)
    await expect(
      service.restoreApply('restore_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', PASSWORD, 'overwrite')
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    })
  })

  it('does not enter the secure-store commit after cancellation during restore revalidation', async () => {
    const revalidation = deferred<{
      total: number
      conflicts: number
      newEntries: number
      storeRevision: string
      planFingerprints: { skip: string; overwrite: string }
    }>()
    const previewRestore = vi
      .fn()
      .mockResolvedValueOnce({
        total: 1,
        conflicts: 0,
        newEntries: 1,
        storeRevision: STORE_REVISION,
        planFingerprints: {
          skip: SKIP_FINGERPRINT,
          overwrite: OVERWRITE_FINGERPRINT
        }
      })
      .mockReturnValueOnce(revalidation.promise)
    const applyRestore = vi.fn()
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files: {
        writeBackup: vi.fn(),
        readBackup: vi.fn(async () => ({
          cancelled: false as const,
          envelope: Buffer.from('encrypted-envelope'),
          file: RESTORE_FILE
        }))
      },
      now: () => 1_000,
      createRestoreId: () => 'restore_12121212121212121212121212121212',
      previewRestore: previewRestore as never,
      applyRestore: applyRestore as never
    })

    await expect(service.restorePreview(PASSWORD)).resolves.toMatchObject({ ok: true })
    const controller = new AbortController()
    const applying = service.restoreApply(
      'restore_12121212121212121212121212121212',
      PASSWORD,
      'skip',
      controller.signal
    )
    await vi.waitFor(() => expect(previewRestore).toHaveBeenCalledTimes(2))
    controller.abort()
    revalidation.resolve({
      total: 1,
      conflicts: 0,
      newEntries: 1,
      storeRevision: STORE_REVISION,
      planFingerprints: {
        skip: SKIP_FINGERPRINT,
        overwrite: OVERWRITE_FINGERPRINT
      }
    })

    await expect(applying).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_OPERATION_CANCELLED',
      retryable: false,
      cancelled: true
    })
    expect(applyRestore).not.toHaveBeenCalled()
  })

  it('rejects a restore when the secure-store revision changed after preview', async () => {
    const applyRestore = vi.fn()
    const previewRestore = vi
      .fn()
      .mockResolvedValueOnce({
        total: 1,
        conflicts: 0,
        newEntries: 1,
        storeRevision: STORE_REVISION,
        planFingerprints: {
          skip: SKIP_FINGERPRINT,
          overwrite: OVERWRITE_FINGERPRINT
        }
      })
      .mockResolvedValueOnce({
        total: 1,
        conflicts: 0,
        newEntries: 1,
        storeRevision: 'a'.repeat(64),
        planFingerprints: {
          skip: 'b'.repeat(64),
          overwrite: 'c'.repeat(64)
        }
      })
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files: {
        writeBackup: vi.fn(),
        readBackup: vi.fn(async () => ({
          cancelled: false as const,
          envelope: Buffer.from('encrypted-envelope'),
          file: RESTORE_FILE
        }))
      },
      now: () => 1_000,
      createRestoreId: () => 'restore_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      previewRestore: previewRestore as never,
      applyRestore: applyRestore as never
    })

    await expect(service.restorePreview(PASSWORD)).resolves.toMatchObject({ ok: true })
    await expect(
      service.restoreApply('restore_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', PASSWORD, 'skip')
    ).resolves.toEqual({
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID',
      retryable: false
    })
    expect(applyRestore).not.toHaveBeenCalled()
    await expect(
      service.restoreApply('restore_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', PASSWORD, 'skip')
    ).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    })
  })

  it('actively expires restore metadata without waiting for another Secret operation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const files = {
      writeBackup: vi.fn(),
      readBackup: vi.fn(async () => ({
        cancelled: false as const,
        envelope: Buffer.from('encrypted-envelope'),
        file: RESTORE_FILE
      }))
    }
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files,
      restorePlanTtlMs: 1_000,
      createRestoreId: () => 'restore_cccccccccccccccccccccccccccccccc',
      previewRestore: vi.fn(async () => ({
        total: 1,
        conflicts: 0,
        newEntries: 1,
        storeRevision: STORE_REVISION,
        planFingerprints: {
          skip: SKIP_FINGERPRINT,
          overwrite: OVERWRITE_FINGERPRINT
        }
      })) as never
    })

    try {
      await expect(service.restorePreview(PASSWORD)).resolves.toMatchObject({ ok: true })
      await vi.advanceTimersByTimeAsync(1_001)
      await expect(
        service.restoreApply('restore_cccccccccccccccccccccccccccccccc', PASSWORD, 'skip')
      ).resolves.toEqual({
        ok: false,
        code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID',
        retryable: false
      })
      expect(files.readBackup).toHaveBeenCalledTimes(1)
    } finally {
      await service.destroy()
      vi.useRealTimers()
    }
  })

  it('propagates cancellation and destroy aborts a pending Secret file operation', async () => {
    let observedSignal: AbortSignal | undefined
    const service = createPrivacySecretService({
      rootPath: '/fixture/root',
      files: {
        writeBackup: vi.fn(),
        readBackup: vi.fn(async (signal) => {
          observedSignal = signal
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('PRIVACY_OPERATION_CANCELLED')),
              { once: true }
            )
          })
          return { cancelled: true as const }
        })
      }
    })

    const running = service.restorePreview(PASSWORD)
    await vi.waitFor(() => expect(observedSignal).toBeInstanceOf(AbortSignal))
    const destroying = service.destroy()

    await expect(running).resolves.toMatchObject({
      ok: false,
      code: 'PRIVACY_OPERATION_CANCELLED',
      cancelled: true
    })
    await destroying
    expect(observedSignal?.aborted).toBe(true)
  })
})

describe('main-owned Secret file adapter', () => {
  it('writes with an exclusive temporary file, syncs, renames, and returns no path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-secret-file-'))
    roots.push(root)
    const target = path.join(root, 'backup.json')
    const adapter = createMainPrivacySecretFileAdapter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      showOpenDialog: vi.fn()
    })

    await expect(
      adapter.writeBackup('{"format":"talex.touch.secret-backup"}', new AbortController().signal)
    ).resolves.toEqual({ cancelled: false })
    await expect(fs.readFile(target, 'utf8')).resolves.toContain('talex.touch.secret-backup')
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('stops waiting for a main-process file dialog when the operation is cancelled', async () => {
    const controller = new AbortController()
    const adapter = createMainPrivacySecretFileAdapter({
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn(() => new Promise<never>(() => undefined))
    })

    const reading = adapter.readBackup(controller.signal)
    controller.abort()

    await expect(reading).rejects.toThrow('PRIVACY_OPERATION_CANCELLED')
  })

  it('reopens the exact selected file without another dialog and rejects changed bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-secret-reopen-'))
    roots.push(root)
    const target = path.join(root, 'backup.json')
    await fs.writeFile(target, '{"format":"first"}')
    const showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [target] }))
    const adapter = createMainPrivacySecretFileAdapter({
      showSaveDialog: vi.fn(),
      showOpenDialog
    })

    const selected = await adapter.readBackup(new AbortController().signal)
    expect(selected.cancelled).toBe(false)
    if (selected.cancelled) throw new Error('unexpected cancellation')
    selected.envelope.fill(0)
    await fs.writeFile(target, '{"format":"other"}')

    await expect(adapter.readBackup(new AbortController().signal, selected.file)).rejects.toThrow(
      'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    )
    expect(showOpenDialog).toHaveBeenCalledTimes(1)
  })

  it('does not clobber a replacement created while an approved Secret target is archived', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-secret-existing-race-'))
    roots.push(root)
    const target = path.join(root, 'backup.json')
    await fs.writeFile(target, 'approved original target')
    const adapter = createMainPrivacySecretFileAdapter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: target })),
      showOpenDialog: vi.fn()
    })
    const originalLstat = fs.lstat.bind(fs)
    let injected = false
    const lstat = vi.spyOn(fs, 'lstat').mockImplementation(async (candidate) => {
      const stat = await originalLstat(candidate)
      if (!injected && String(candidate).endsWith('.recovery')) {
        injected = true
        await fs.writeFile(target, 'concurrent replacement')
      }
      return stat
    })

    try {
      await expect(
        adapter.writeBackup('{"format":"talex.touch.secret-backup"}', new AbortController().signal)
      ).rejects.toThrow('PRIVACY_SECRET_FILE_RECOVERY_FAILED')
      await expect(fs.readFile(target, 'utf8')).resolves.toBe('concurrent replacement')
      const recoveryFiles = (await fs.readdir(root)).filter((name) => name.endsWith('.recovery'))
      expect(recoveryFiles).toHaveLength(1)
      await expect(fs.readFile(path.join(root, recoveryFiles[0]!), 'utf8')).resolves.toBe(
        'approved original target'
      )
      expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    } finally {
      lstat.mockRestore()
    }
  })

  it('rejects symlink read/write targets before secret bytes cross the file boundary', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-secret-symlink-'))
    roots.push(root)
    const outside = path.join(root, 'outside.json')
    const link = path.join(root, 'backup.json')
    await fs.writeFile(outside, '{"outside":true}')
    await fs.symlink(outside, link)
    const adapter = createMainPrivacySecretFileAdapter({
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: link })),
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [link] }))
    })

    await expect(
      adapter.writeBackup('{"format":"talex.touch.secret-backup"}', new AbortController().signal)
    ).rejects.toThrow('PRIVACY_SECRET_FILE_INVALID')
    await expect(adapter.readBackup(new AbortController().signal)).rejects.toThrow(
      'PRIVACY_SECRET_FILE_INVALID'
    )
    await expect(fs.readFile(outside, 'utf8')).resolves.toBe('{"outside":true}')
  })

  it('rejects a same-inode symlink swap between restore lstat and descriptor open', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-secret-symlink-race-'))
    roots.push(root)
    const target = path.join(root, 'backup.json')
    const moved = path.join(root, 'moved-backup.json')
    const contents = '{"format":"talex.touch.secret-backup"}'
    await fs.writeFile(target, contents)
    const adapter = createMainPrivacySecretFileAdapter({
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [target] }))
    })
    const originalLstat = fs.lstat.bind(fs)
    let swapped = false
    const lstat = vi.spyOn(fs, 'lstat').mockImplementation(async (candidate) => {
      const stat = await originalLstat(candidate)
      if (!swapped && String(candidate) === target) {
        swapped = true
        await fs.rename(target, moved)
        await fs.symlink(moved, target)
      }
      return stat
    })

    try {
      await expect(adapter.readBackup(new AbortController().signal)).rejects.toThrow()
      expect(swapped).toBe(true)
      await expect(fs.readFile(moved, 'utf8')).resolves.toBe(contents)
    } finally {
      lstat.mockRestore()
    }
  })
})

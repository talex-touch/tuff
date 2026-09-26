import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FILE_ICON_MAX_BYTES } from '../../../../../service/file-icon-artifact'
import {
  FileProviderIconMigrationService,
  type FileProviderIconMigrationServiceDeps
} from './file-provider-icon-migration-service'

/**
 * Durable-safety contract for the bounded legacy file-icon conversion.
 *
 * Assertions target the two artifacts a real consumer depends on: the bytes on disk and the value
 * left in the database row. A conversion that corrupts either is the failure these tests exist to
 * catch, so no test forwards through a mock without checking both.
 */

const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGNgYPj/n5H5/38Gdsb//zlY/v8HAEBuCBGhphy2AAAAAElFTkSuQmCC',
  'base64'
)
const DATA_URL_PREFIX = 'data:image/png;base64,'

function iconDataUrl(bytes: Buffer): string {
  return `${DATA_URL_PREFIX}${bytes.toString('base64')}`
}

/**
 * Hand-written stand-in for the three bounded DB ports. It models the real predicate (only rows
 * whose icon is still a PNG data URL), the SQL-side length bound, the compare-and-update, and lets
 * a test interleave a concurrent write or a failing write at the exact boundary under test.
 */
class FakeLegacyIconStore {
  readonly rows = new Map<number, string | null>()
  readonly pageCalls: Array<{ afterId: number; limit: number }> = []
  /** Ids whose payload was actually returned to the service (i.e. materialized). */
  readonly materialized: number[] = []
  readonly valueReads: Array<{ fileId: number; maxLength: number }> = []
  readonly casLosses: number[] = []
  readonly replaceFailures = new Set<number>()
  onValueRead?: (fileId: number) => void | Promise<void>
  onBeforeReplace?: (fileId: number) => void | Promise<void>

  seed(fileId: number, value: string | null): void {
    this.rows.set(fileId, value)
  }

  async getLegacyFileIconPage(
    afterId: number,
    limit: number
  ): Promise<Array<{ fileId: number; valueLength: number }>> {
    this.pageCalls.push({ afterId, limit })
    return [...this.rows.entries()]
      .filter(
        ([fileId, value]) =>
          fileId > afterId && typeof value === 'string' && value.startsWith(DATA_URL_PREFIX)
      )
      .sort(([left], [right]) => left - right)
      .slice(0, limit)
      .map(([fileId, value]) => ({ fileId, valueLength: value!.length }))
  }

  async getLegacyFileIconValue(fileId: number, maxLength: number): Promise<string | null> {
    this.valueReads.push({ fileId, maxLength })
    await this.onValueRead?.(fileId)
    const value = this.rows.get(fileId)
    if (typeof value !== 'string' || value.length > maxLength) return null
    this.materialized.push(fileId)
    return value
  }

  async replaceFileIconValue(
    fileId: number,
    previousValue: string,
    iconPath: string
  ): Promise<boolean> {
    if (this.replaceFailures.has(fileId)) throw new Error('db write failed')
    await this.onBeforeReplace?.(fileId)
    if (this.rows.get(fileId) !== previousValue) {
      this.casLosses.push(fileId)
      return false
    }
    this.rows.set(fileId, iconPath)
    return true
  }
}

interface Harness {
  service: FileProviderIconMigrationService
  store: FakeLegacyIconStore
  cacheDirectory: string
  setStopping: (value: boolean) => void
}

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createHarness(options: { cacheDirectory?: string } = {}): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'icon-migration-'))
  tempRoots.push(root)
  const store = new FakeLegacyIconStore()
  let stopping = false
  const deps: FileProviderIconMigrationServiceDeps = {
    getDbUtils: () => store,
    getCacheDirectory: () => options.cacheDirectory ?? path.join(root, 'file-icons'),
    withDbWrite: async <T>(_label: string, operation: () => Promise<T>): Promise<T> =>
      await operation(),
    isStopping: () => stopping,
    waitForIdle: async () => undefined,
    yieldToEventLoop: async () => undefined,
    logInfo: vi.fn(),
    logWarn: vi.fn()
  }
  return {
    service: new FileProviderIconMigrationService(deps),
    store,
    cacheDirectory: options.cacheDirectory ?? path.join(root, 'file-icons'),
    setStopping: (value: boolean) => {
      stopping = value
    }
  }
}

describe('FileProviderIconMigrationService durable conversion', () => {
  it('converts a legacy PNG data URL into the artifact bytes and stores only its absolute path', async () => {
    const harness = await createHarness()
    const legacyValue = iconDataUrl(PNG_2X2)
    harness.store.seed(1, legacyValue)

    const result = await harness.service.run()

    const storedPath = harness.store.rows.get(1)!
    expect(path.isAbsolute(storedPath)).toBe(true)
    expect(path.dirname(storedPath)).toBe(harness.cacheDirectory)
    expect(await readFile(storedPath)).toEqual(PNG_2X2)
    expect(result.converted).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.stopped).toBe(false)
    // The converted row is no longer a migration candidate, so a later run cannot re-read it.
    expect(await harness.store.getLegacyFileIconPage(0, 32)).toEqual([])
  })

  it('leaves a malformed or non-PNG value untouched and reports the failure', async () => {
    const harness = await createHarness()
    const notAnImage = iconDataUrl(Buffer.from('this is not a png payload'))
    const brokenBase64 = `${DATA_URL_PREFIX}@@@not-base64@@@`
    harness.store.seed(1, notAnImage)
    harness.store.seed(2, brokenBase64)

    const result = await harness.service.run()

    expect(harness.store.rows.get(1)).toBe(notAnImage)
    expect(harness.store.rows.get(2)).toBe(brokenBase64)
    expect(result.converted).toBe(0)
    expect(result.failed).toBe(2)
    expect(await readdir(harness.cacheDirectory).catch(() => [])).toEqual([])
  })

  it('never materializes a legacy payload beyond the artifact byte budget', async () => {
    const harness = await createHarness()
    const oversized = `${DATA_URL_PREFIX}${'A'.repeat(4 * Math.ceil(FILE_ICON_MAX_BYTES / 3) + 10)}`
    harness.store.seed(1, iconDataUrl(PNG_2X2))
    harness.store.seed(2, oversized)

    const result = await harness.service.run()

    // The oversize row was never handed to the converter and never decoded.
    expect(harness.store.materialized).not.toContain(2)
    expect(harness.store.rows.get(2)).toBe(oversized)
    expect(result.converted).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(1)
    // Exactly the one in-budget artifact exists; the oversize bytes never produced a file.
    expect(await readdir(harness.cacheDirectory)).toHaveLength(1)
  })

  it('keeps the original value and retries from scratch when the artifact cannot be written', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'icon-migration-blocked-'))
    tempRoots.push(root)
    const blocker = path.join(root, 'not-a-directory')
    await writeFile(blocker, 'x')
    const harness = await createHarness({ cacheDirectory: path.join(blocker, 'file-icons') })
    const legacyValue = iconDataUrl(PNG_2X2)
    harness.store.seed(1, legacyValue)

    const failed = await harness.service.run()

    expect(harness.store.rows.get(1)).toBe(legacyValue)
    expect(failed.converted).toBe(0)
    expect(failed.failed).toBe(1)

    // A later run in a healthy environment converts the same row: nothing was lost or marked.
    const healthy = await createHarness()
    healthy.store.seed(1, legacyValue)
    const retried = await healthy.service.run()

    expect(retried.converted).toBe(1)
    expect(await readFile(healthy.store.rows.get(1)!)).toEqual(PNG_2X2)
  })

  it('keeps the original and converges on the already-written artifact when the CAS write is interrupted', async () => {
    const harness = await createHarness()
    const legacyValue = iconDataUrl(PNG_2X2)
    harness.store.seed(1, legacyValue)
    harness.store.replaceFailures.add(1)

    const interrupted = await harness.service.run()

    expect(harness.store.rows.get(1)).toBe(legacyValue)
    expect(interrupted.converted).toBe(0)
    expect(interrupted.failed).toBe(1)
    // The artifact stayed on disk, unreferenced: the retry must reuse it, not duplicate or corrupt it.
    const artifactFiles = await readdir(harness.cacheDirectory)
    expect(artifactFiles).toHaveLength(1)

    harness.store.replaceFailures.delete(1)
    const retried = await harness.service.run()

    const storedPath = harness.store.rows.get(1)!
    expect(path.basename(storedPath)).toBe(artifactFiles[0])
    expect(await readFile(storedPath)).toEqual(PNG_2X2)
    expect(retried.converted).toBe(1)
    expect(retried.failed).toBe(0)
    expect(await readdir(harness.cacheDirectory)).toHaveLength(1)
  })

  it('preserves a concurrent lazy write that lands after the value was read', async () => {
    const harness = await createHarness()
    const legacyValue = iconDataUrl(PNG_2X2)
    const concurrentPath = '/cache/file-icons/lazy-write.png'
    harness.store.seed(1, legacyValue)
    harness.store.onBeforeReplace = () => {
      harness.store.rows.set(1, concurrentPath)
    }

    const result = await harness.service.run()

    expect(harness.store.rows.get(1)).toBe(concurrentPath)
    expect(harness.store.casLosses).toEqual([1])
    expect(result.converted).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('aborts before any write when shutdown begins after the value was read, and converges on retry', async () => {
    const harness = await createHarness()
    const legacyValue = iconDataUrl(PNG_2X2)
    harness.store.seed(1, legacyValue)
    harness.store.onValueRead = () => {
      harness.setStopping(true)
    }

    const stopped = await harness.service.run()

    expect(stopped.stopped).toBe(true)
    expect(stopped.converted).toBe(0)
    expect(harness.store.rows.get(1)).toBe(legacyValue)

    harness.setStopping(false)
    harness.store.onValueRead = undefined
    const retried = await harness.service.run()

    expect(retried.stopped).toBe(false)
    expect(retried.converted).toBe(1)
    expect(await readFile(harness.store.rows.get(1)!)).toEqual(PNG_2X2)
  })

  it('runs single-flight so concurrent calls cannot scan the same rows twice', async () => {
    const harness = await createHarness()
    harness.store.seed(1, iconDataUrl(PNG_2X2))
    let releaseGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    let gateReached = false
    harness.store.onBeforeReplace = async () => {
      gateReached = true
      await gate
    }

    const first = harness.service.run()
    await vi.waitFor(() => expect(gateReached).toBe(true))
    const second = harness.service.run()

    releaseGate()
    const [firstResult, secondResult] = await Promise.all([first, second])

    // One pass = the initial page plus the terminal empty page. A second concurrent scan would
    // have re-materialized the row and doubled the page count.
    expect(harness.store.pageCalls).toHaveLength(2)
    expect(harness.store.materialized).toEqual([1])
    expect(secondResult).toEqual(firstResult)
  })
})

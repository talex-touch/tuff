import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Everything/native search path caches generated icon *paths* for results it has already shown.
 * The two contracts that matter are boundedness (one path per result, at most 256 of them, at most
 * 64 extractions in flight) and invalidation: a result whose known mtime/size changed, or whose
 * generated file is gone, must not keep serving a stale path.
 */
const harness = vi.hoisted(() => ({
  getFileIconPath: vi.fn()
}))

vi.mock('../../../../service/icon-service', () => ({
  iconService: harness
}))

import { EverythingIconCache } from './everything-icon-cache'

const SOURCE_PATH = '/docs/report.pdf'

let tempRoot = ''
let iconPath = ''

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'everything-icon-cache-'))
  iconPath = path.join(tempRoot, 'cached.png')
  await fs.writeFile(iconPath, 'png-bytes')
  harness.getFileIconPath.mockReset()
  harness.getFileIconPath.mockResolvedValue(iconPath)
})

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('EverythingIconCache path caching', () => {
  it('caches the produced path and reuses it without extracting again', async () => {
    const cache = new EverythingIconCache()

    await expect(cache.ensure(SOURCE_PATH)).resolves.toBe(iconPath)
    expect(cache.get(SOURCE_PATH)).toBe(iconPath)

    await expect(cache.ensure(SOURCE_PATH)).resolves.toBe(iconPath)
    expect(harness.getFileIconPath).toHaveBeenCalledOnce()
  })

  it('shares one extraction between concurrent requests for the same result', async () => {
    const resolvers: Array<(value: string | null) => void> = []
    harness.getFileIconPath.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const cache = new EverythingIconCache()

    const first = cache.ensure(SOURCE_PATH)
    const second = cache.ensure(SOURCE_PATH)
    await vi.waitFor(() => expect(harness.getFileIconPath).toHaveBeenCalledOnce())

    resolvers[0](iconPath)

    await expect(first).resolves.toBe(iconPath)
    await expect(second).resolves.toBe(iconPath)
    expect(harness.getFileIconPath).toHaveBeenCalledOnce()
  })

  it('treats a deleted icon file as a miss and produces it again', async () => {
    const cache = new EverythingIconCache()

    await cache.ensure(SOURCE_PATH)
    await fs.rm(iconPath)

    expect(cache.get(SOURCE_PATH)).toBeNull()
    await cache.ensure(SOURCE_PATH)
    expect(harness.getFileIconPath).toHaveBeenCalledTimes(2)
  })

  it('drops a cached icon when the known source version changed', async () => {
    const cache = new EverythingIconCache()
    const version = { mtimeMs: 1_700_000_000_000, size: 42 }

    await cache.ensure(SOURCE_PATH, version)
    expect(cache.get(SOURCE_PATH, version)).toBe(iconPath)

    // An mtime move invalidates even when the size is unchanged.
    expect(cache.get(SOURCE_PATH, { mtimeMs: version.mtimeMs + 1, size: 42 })).toBeNull()

    // And a size change invalidates an entry that was cached again with the original version.
    await cache.ensure(SOURCE_PATH, version)
    expect(cache.get(SOURCE_PATH, { mtimeMs: version.mtimeMs, size: 43 })).toBeNull()

    expect(harness.getFileIconPath).toHaveBeenCalledTimes(2)
  })

  it('does not accept an unversioned entry for a caller that knows the version', async () => {
    const cache = new EverythingIconCache()

    await cache.ensure(SOURCE_PATH)
    expect(cache.get(SOURCE_PATH)).toBe(iconPath)
    expect(cache.get(SOURCE_PATH, { mtimeMs: 1_700_000_000_000, size: null })).toBeNull()
  })
})

describe('EverythingIconCache bounds and fencing', () => {
  it('bounds concurrent extractions and refuses work over the bound', async () => {
    const resolvers: Array<(value: string | null) => void> = []
    harness.getFileIconPath.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const cache = new EverythingIconCache()

    const requests = Array.from({ length: 65 }, (_, index) =>
      cache.ensure(`/docs/file-${index}.txt`)
    )
    await vi.waitFor(() => expect(harness.getFileIconPath).toHaveBeenCalledTimes(64), {
      timeout: 5_000
    })

    await expect(requests[64]).resolves.toBeNull()

    for (const resolve of resolvers) {
      resolve(iconPath)
    }
    const produced = await Promise.all(requests.slice(0, 64))
    expect(produced.every((cachedPath) => cachedPath === iconPath)).toBe(true)
    expect(harness.getFileIconPath).toHaveBeenCalledTimes(64)
  })

  it('keeps its retained paths bounded', async () => {
    const cache = new EverythingIconCache()
    const resultPaths = Array.from({ length: 257 }, (_, index) => `/docs/file-${index}.txt`)

    for (const resultPath of resultPaths) {
      await cache.ensure(resultPath)
    }

    expect(cache.get(resultPaths[0])).toBeNull()
    expect(cache.get(resultPaths[256])).toBe(iconPath)
  })

  it('does not re-cache an extraction that completes after clear', async () => {
    let resolveIcon: (value: string | null) => void = () => {}
    harness.getFileIconPath.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveIcon = resolve
        })
    )
    const cache = new EverythingIconCache()

    const pending = cache.ensure(SOURCE_PATH)
    await vi.waitFor(() => expect(harness.getFileIconPath).toHaveBeenCalledOnce())

    cache.clear()
    resolveIcon(iconPath)

    await expect(pending).resolves.toBeNull()
    expect(cache.get(SOURCE_PATH)).toBeNull()
  })
})

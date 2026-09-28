import type { NativeFileEvents } from './macos-file-watcher'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MacOSFileWatcher } from './macos-file-watcher'

const flags = {
  created: 0x100,
  deleted: 0x200,
  modified: 0x1000,
  moved: 0x800,
  file: 0x10000,
  directory: 0x20000,
  symlink: 0x40000
}

function createNative() {
  const callbacks = new Map<string, (filePath: string, flags: number) => void>()
  const stop = vi.fn(async () => {})
  const native: NativeFileEvents = {
    constants: { MustScanSubDirs: 1, UserDropped: 2, KernelDropped: 4, RootChanged: 32 },
    watch: vi.fn((root, callback) => {
      callbacks.set(root, callback)
      return stop
    }),
    getInfo: (_filePath, eventFlags) => ({
      event:
        eventFlags & flags.deleted
          ? 'deleted'
          : eventFlags & flags.moved
            ? 'moved'
            : eventFlags & flags.created
              ? 'created'
              : 'modified',
      type:
        eventFlags & flags.directory ? 'directory' : eventFlags & flags.symlink ? 'symlink' : 'file'
    })
  }
  return {
    native,
    stop,
    send: (root: string, filePath: string, eventFlags: number) => {
      const callback = callbacks.get(root)
      if (!callback) throw new Error('No native stream for fixture root')
      callback(filePath, eventFlags)
    }
  }
}

const watchers: MacOSFileWatcher[] = []
const fixtures: string[] = []

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-native-watch-'))
  fixtures.push(root)
  return fs.realpath(root)
}

function watch(
  native?: NativeFileEvents,
  options: Partial<ConstructorParameters<typeof MacOSFileWatcher>[0]> = {}
) {
  const watcher = new MacOSFileWatcher({
    depth: 24,
    ignored: () => false,
    stabilityThresholdMs: 10,
    pollIntervalMs: 5,
    native,
    ...options
  })
  watchers.push(watcher)
  return watcher
}

afterEach(async () => {
  await Promise.all(watchers.splice(0).map((watcher) => watcher.close()))
  vi.restoreAllMocks()
  await Promise.all(fixtures.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('MacOSFileWatcher', () => {
  it('reports optional native load failure without falling back to traversal', async () => {
    const root = await fixture()
    const originalPlatform = process.platform
    const unavailable = new Error('Native binary is not packaged')
    vi.doMock('fsevents', () => {
      throw unavailable
    })
    try {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      const watcher = watch()
      const errors = vi.fn()
      const reads = vi.spyOn(fs, 'readdir')
      watcher.on('error', errors)
      await expect(watcher.add(root)).rejects.toMatchObject({
        message: 'The optional fsevents native backend is unavailable',
        cause: unavailable
      })
      expect(errors).toHaveBeenCalledOnce()
      expect(reads).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('fsevents')
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it.runIf(process.platform === 'darwin')(
    'watches an explicit symlink root but does not discover or mirror existing child symlinks',
    async () => {
      const parent = await fixture()
      const root = path.join(parent, 'root')
      const alias = path.join(parent, 'explicit-root')
      const external = path.join(parent, 'external')
      await fs.mkdir(path.join(root, 'real'), { recursive: true })
      await fs.mkdir(external)
      await fs.symlink(root, alias)
      await fs.symlink(external, path.join(root, 'external-link'))
      await fs.symlink(path.join(root, 'real'), path.join(root, 'internal-link'))
      const watcher = watch()
      const control = watch()
      const added = vi.fn()
      const externalAdded = vi.fn()
      watcher.on('add', added)
      control.on('add', externalAdded)
      await watcher.add(alias)
      await control.add(external)
      const outsideFile = path.join(external, 'outside.txt')
      const insideFile = path.join(root, 'real', 'inside.txt')
      await fs.writeFile(outsideFile, 'external target')
      await fs.writeFile(insideFile, 'internal target')
      await vi.waitFor(
        () => {
          expect(externalAdded).toHaveBeenCalledWith(outsideFile)
          expect(added).toHaveBeenCalledWith(path.join(alias, 'real', 'inside.txt'))
        },
        { timeout: 3000 }
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(added).not.toHaveBeenCalledWith(path.join(alias, 'external-link', 'outside.txt'))
      expect(added).not.toHaveBeenCalledWith(path.join(alias, 'internal-link', 'inside.txt'))
    }
  )

  it('retries a root that did not exist at registration', async () => {
    const parent = await fixture()
    const root = path.join(parent, 'not-yet-created')
    const backend = createNative()
    const watcher = watch(backend.native)
    const errors = vi.fn()
    watcher.on('error', errors)
    await expect(watcher.add(root)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(backend.native.watch).not.toHaveBeenCalled()
    await fs.mkdir(root)
    await watcher.add(root)
    expect(backend.native.watch).toHaveBeenCalledOnce()
    expect(errors).toHaveBeenCalledOnce()
  })

  it('stops streams created synchronously while registration is closing', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native)
    let closing: Promise<void> | undefined
    vi.mocked(backend.native.watch).mockImplementationOnce(() => {
      closing = watcher.close()
      return backend.stop
    })
    await watcher.add(root)
    await closing
    expect(backend.stop).toHaveBeenCalledOnce()
  })

  it('awaits all streams even if one native stop rejects and propagates the failure', async () => {
    const root = await fixture()
    const second = await fixture()
    const backend = createNative()
    const gate = Promise.withResolvers<void>()
    backend.stop
      .mockRejectedValueOnce(new Error('Native stop failed'))
      .mockImplementationOnce(() => gate.promise)
    const watcher = watch(backend.native)
    await Promise.all([watcher.add(root), watcher.add(second)])
    const closing = watcher.close()
    const rejected = expect(closing).rejects.toThrow('Failed to stop native file events')
    try {
      await vi.waitFor(() => expect(backend.stop).toHaveBeenCalledTimes(2))
    } finally {
      gate.resolve()
      watchers.splice(watchers.indexOf(watcher), 1)
    }
    await rejected
    await expect(watcher.close()).rejects.toThrow('Failed to stop native file events')
    expect(backend.stop).toHaveBeenCalledTimes(2)
  })

  it('surfaces native decoding errors and metadata permission failures without a crawl or dead queue', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native)
    const errors = vi.fn()
    const added = vi.fn()
    watcher.on('error', errors).on('add', added)
    await watcher.add(root)
    const failure = new Error('Native event decoding failed')
    vi.spyOn(backend.native, 'getInfo').mockImplementationOnce(() => {
      throw failure
    })
    expect(() => backend.send(root, path.join(root, 'decoding.txt'), flags.file)).not.toThrow()
    expect(errors).toHaveBeenCalledExactlyOnceWith(failure)
    const filePath = path.join(root, 'permission.txt')
    await fs.writeFile(filePath, 'content')
    const denied = Object.assign(new Error('Access denied'), { code: 'EACCES', path: filePath })
    vi.spyOn(fs, 'lstat').mockRejectedValueOnce(denied)
    backend.send(root, filePath, flags.created | flags.file)
    await vi.waitFor(() => expect(errors).toHaveBeenLastCalledWith(denied))
    expect(added).not.toHaveBeenCalled()
    backend.send(root, filePath, flags.created | flags.file)
    await vi.waitFor(() => expect(added).toHaveBeenCalledExactlyOnceWith(filePath))
  })

  it('does not load native code outside macOS and reports the unavailable capability', async () => {
    const root = await fixture()
    const originalPlatform = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      const watcher = watch()
      const errors = vi.fn()
      watcher.on('error', errors)
      await expect(watcher.add(root)).rejects.toThrow('require macOS')
      expect(errors).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it.runIf(process.platform === 'darwin')(
    'loads the actual native backend lazily and delivers filesystem changes through a /var alias',
    async () => {
      const canonicalRoot = await fixture()
      const logicalRoot = fixtures[fixtures.length - 1]
      const watcher = watch()
      const events: Array<[string, string]> = []
      const invalidations: Array<{ path: string; rootPath: string; reason: string }> = []
      const errors: Error[] = []
      for (const event of ['add', 'change', 'unlink'])
        watcher.on(event, (filePath) => events.push([event, filePath]))
      watcher
        .on('invalidate', (event) => invalidations.push(event))
        .on('error', (error) => errors.push(error))
      await watcher.add(logicalRoot)
      const original = path.join(logicalRoot, 'native-original.txt')
      const renamed = path.join(logicalRoot, 'native-renamed.txt')
      await fs.writeFile(original, 'first')
      await vi.waitFor(() => expect(events).toContainEqual(['add', original]), { timeout: 3000 })
      await fs.writeFile(original, 'modified content')
      await vi.waitFor(() => expect(events).toContainEqual(['change', original]), { timeout: 3000 })
      await fs.rename(original, renamed)
      await vi.waitFor(
        () => {
          expect(events).toContainEqual(['unlink', original])
          expect(events).toContainEqual(['add', renamed])
        },
        { timeout: 3000 }
      )
      await fs.unlink(renamed)
      await vi.waitFor(() => expect(events).toContainEqual(['unlink', renamed]), { timeout: 3000 })
      const directory = path.join(logicalRoot, 'populated')
      await fs.mkdir(directory)
      await fs.writeFile(path.join(directory, 'nested.txt'), 'nested')
      await vi.waitFor(
        () =>
          expect(invalidations).toContainEqual({
            path: directory,
            rootPath: logicalRoot,
            reason: 'directory-change'
          }),
        { timeout: 3000 }
      )
      invalidations.length = 0
      await fs.rename(directory, `${directory}-moved`)
      await vi.waitFor(
        () => {
          expect(invalidations).toContainEqual({
            path: directory,
            rootPath: logicalRoot,
            reason: 'directory-change'
          })
          expect(invalidations).toContainEqual({
            path: `${directory}-moved`,
            rootPath: logicalRoot,
            reason: 'directory-change'
          })
        },
        { timeout: 3000 }
      )
      invalidations.length = 0
      await fs.rm(`${directory}-moved`, { recursive: true })
      await vi.waitFor(
        () =>
          expect(invalidations).toContainEqual({
            path: `${directory}-moved`,
            rootPath: logicalRoot,
            reason: 'directory-change'
          }),
        { timeout: 3000 }
      )
      expect(errors).toEqual([])
      if (logicalRoot.startsWith('/var/'))
        expect(canonicalRoot.startsWith('/private/var/')).toBe(true)
      await watcher.close()
      const eventCount = events.length
      await fs.writeFile(original, 'after close')
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(events).toHaveLength(eventCount)
    },
    20000
  )

  it('deduplicates concurrent registration and awaits every native stop exactly once', async () => {
    const root = await fixture()
    const second = await fixture()
    const backend = createNative()
    const stopGate = Promise.withResolvers<void>()
    backend.stop.mockImplementation(() => stopGate.promise)
    const watcher = watch(backend.native)
    let closed = false
    let firstClose: Promise<void> | undefined
    let secondClose: Promise<void> | undefined
    try {
      await Promise.all([watcher.add(root), watcher.add(root), watcher.add(second)])
      expect(backend.native.watch).toHaveBeenCalledTimes(2)
      firstClose = watcher.close().then(() => {
        closed = true
      })
      secondClose = watcher.close()
      await vi.waitFor(() => expect(backend.stop).toHaveBeenCalledTimes(2))
      expect(closed).toBe(false)
    } finally {
      stopGate.resolve()
    }
    await Promise.all([firstClose, secondClose])
    expect(closed).toBe(true)
    await expect(watcher.add(root)).rejects.toThrow(/closed/i)
  })

  it('does not open a native stream when close races root resolution', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native)
    const resolution = Promise.withResolvers<string>()
    vi.spyOn(fs, 'realpath').mockImplementationOnce(() => resolution.promise)
    const adding = watcher.add(root)
    const closing = watcher.close()
    resolution.resolve(root)
    await Promise.all([adding, closing])
    expect(backend.native.watch).not.toHaveBeenCalled()
  })

  it('cancels unsettled work, waits for active metadata and suppresses late native callbacks', async () => {
    const root = await fixture()
    const filePath = path.join(root, 'in-flight.txt')
    await fs.writeFile(filePath, 'unfinished')
    const backend = createNative()
    const watcher = watch(backend.native)
    const added = vi.fn()
    watcher.on('add', added)
    await watcher.add(root)
    const originalLstat = fs.lstat
    const gate = Promise.withResolvers<void>()
    const metadata = vi.spyOn(fs, 'lstat').mockImplementation(async (target) => {
      await gate.promise
      return originalLstat(target)
    })
    backend.send(root, filePath, flags.created | flags.file)
    await vi.waitFor(() => expect(metadata).toHaveBeenCalledTimes(1))
    let closed = false
    const closing = watcher.close().then(() => {
      closed = true
    })
    backend.send(root, filePath, flags.created | flags.file)
    await Promise.resolve()
    expect(closed).toBe(false)
    gate.resolve()
    await closing
    expect(added).not.toHaveBeenCalled()
    expect(metadata).toHaveBeenCalledTimes(1)
  })

  it('reports failed registration without retaining a dead root and allows an explicit retry', async () => {
    const root = await fixture()
    const backend = createNative()
    const failure = Object.assign(new Error('Native registration denied'), { code: 'EACCES' })
    vi.mocked(backend.native.watch).mockImplementationOnce(() => {
      throw failure
    })
    const watcher = watch(backend.native)
    const errors = vi.fn()
    watcher.on('error', errors)
    await expect(watcher.add(root)).rejects.toBe(failure)
    expect(errors).toHaveBeenCalledExactlyOnceWith(failure)
    expect(await watcher.add(root)).toBe(watcher)
    expect(backend.native.watch).toHaveBeenCalledTimes(2)
  })

  it('collapses overflowing bursts into one root invalidation and resumes event delivery', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native)
    const invalidate = vi.fn()
    const added = vi.fn()
    watcher.on('invalidate', invalidate).on('add', added)
    await watcher.add(root)
    const metadata = vi.spyOn(fs, 'lstat')
    for (let index = 0; index < 10000; index += 1)
      backend.send(root, path.join(root, `burst-${index}.txt`), flags.created | flags.file)
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledExactlyOnceWith({
        path: root,
        rootPath: root,
        reason: 'overflow'
      })
    )
    expect(metadata.mock.calls.length).toBeLessThanOrEqual(1024)
    const fresh = path.join(root, 'after-overflow.txt')
    await fs.writeFile(fresh, 'fresh')
    backend.send(root, fresh, flags.created | flags.file)
    await vi.waitFor(() => expect(added).toHaveBeenCalledExactlyOnceWith(fresh))
  })

  it('limits metadata concurrency to four and performs no idle checks', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native)
    const added = vi.fn()
    watcher.on('add', added)
    const files = Array.from({ length: 12 }, (_, index) => path.join(root, `parallel-${index}.txt`))
    await Promise.all(files.map((filePath) => fs.writeFile(filePath, 'real data')))
    await watcher.add(root)
    const originalLstat = fs.lstat
    const gate = Promise.withResolvers<void>()
    let inFlight = 0
    let maximum = 0
    const metadata = vi.spyOn(fs, 'lstat').mockImplementation(async (filePath) => {
      inFlight += 1
      maximum = Math.max(maximum, inFlight)
      await gate.promise
      try {
        return await originalLstat(filePath)
      } finally {
        inFlight -= 1
      }
    })
    try {
      for (const filePath of files) backend.send(root, filePath, flags.created | flags.file)
      await vi.waitFor(() => expect(inFlight).toBe(4))
      expect(maximum).toBe(4)
    } finally {
      gate.resolve()
    }
    await vi.waitFor(() => expect(added).toHaveBeenCalledTimes(12))
    const settledCalls = metadata.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(metadata).toHaveBeenCalledTimes(settledCalls)
    expect(maximum).toBe(4)
  })

  it('invalidates removed or moved directories from native type flags and recovers event loss at the root', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native)
    const invalidate = vi.fn()
    const unlink = vi.fn()
    watcher.on('invalidate', invalidate).on('unlink', unlink)
    await watcher.add(root)
    const directory = path.join(root, 'removed-directory')
    backend.send(root, directory, flags.deleted | flags.directory)
    expect(invalidate).toHaveBeenLastCalledWith({
      path: directory,
      rootPath: root,
      reason: 'directory-change'
    })
    backend.send(root, directory, flags.moved | flags.directory)
    expect(invalidate).toHaveBeenLastCalledWith({
      path: directory,
      rootPath: root,
      reason: 'directory-change'
    })
    for (const eventFlags of Object.values(backend.native.constants)) {
      backend.send(root, path.join(root, 'missing', 'deep', 'event'), eventFlags)
      expect(invalidate).toHaveBeenLastCalledWith({
        path: root,
        rootPath: root,
        reason: 'event-loss'
      })
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(unlink).not.toHaveBeenCalled()
  })

  it('invalidates symlink changes without following external targets or emitting external file events', async () => {
    const root = await fixture()
    const outside = await fixture()
    const link = path.join(root, 'external')
    await fs.writeFile(path.join(outside, 'secret.txt'), 'not in the configured scope')
    await fs.symlink(outside, link)
    const backend = createNative()
    const watcher = watch(backend.native)
    const added = vi.fn()
    const invalidate = vi.fn()
    watcher.on('add', added).on('invalidate', invalidate)
    await watcher.add(root)
    backend.send(root, link, flags.created | flags.symlink)
    expect(invalidate).toHaveBeenCalledWith({
      path: link,
      rootPath: root,
      reason: 'symlink-change'
    })
    backend.send(root, path.join(link, 'secret.txt'), flags.created | flags.file)
    backend.send(root, path.join(outside, 'secret.txt'), flags.created | flags.file)
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2))
    expect(added).not.toHaveBeenCalled()
  })

  it('maps canonical roots to logical aliases and filters excluded ancestors and depth before stat', async () => {
    const parent = await fixture()
    const root = path.join(parent, 'real')
    const alias = path.join(parent, 'alias')
    await fs.mkdir(path.join(root, 'sub', 'deep'), { recursive: true })
    await fs.mkdir(path.join(root, 'skip'))
    await fs.symlink(root, alias)
    const backend = createNative()
    const watcher = watch(backend.native, {
      depth: 1,
      ignored: (filePath) => path.basename(filePath) === 'skip'
    })
    const added = vi.fn()
    watcher.on('add', added)
    await watcher.add(alias)
    const metadata = vi.spyOn(fs, 'lstat')
    backend.send(root, path.join(root, 'skip', 'private.txt'), flags.created | flags.file)
    backend.send(root, path.join(root, 'sub', 'deep', 'hidden.txt'), flags.created | flags.file)
    backend.send(root, path.join(parent, 'real-sibling', 'outside.txt'), flags.created | flags.file)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(metadata).not.toHaveBeenCalled()
    const admitted = path.join(root, 'sub', 'admitted.txt')
    await fs.writeFile(admitted, 'visible')
    backend.send(root, admitted, flags.created | flags.file)
    await vi.waitFor(() =>
      expect(added).toHaveBeenCalledExactlyOnceWith(path.join(alias, 'sub', 'admitted.txt'))
    )
  })

  it('settles writes and resolves real changes, moves, atomic replacement and deletion', async () => {
    const root = await fixture()
    const backend = createNative()
    const watcher = watch(backend.native, { stabilityThresholdMs: 70 })
    const events: Array<[string, string]> = []
    for (const event of ['add', 'change', 'unlink'])
      watcher.on(event, (filePath) => events.push([event, filePath]))
    await watcher.add(root)
    const original = path.join(root, 'original.txt')
    const renamed = path.join(root, 'renamed.txt')
    await fs.writeFile(original, 'first')
    backend.send(root, original, flags.created | flags.file)
    await new Promise((resolve) => setTimeout(resolve, 25))
    await fs.appendFile(original, '-second')
    backend.send(root, original, flags.modified | flags.file)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(events).toEqual([])
    await vi.waitFor(() => expect(events).toEqual([['add', original]]))
    await fs.writeFile(original, 'changed')
    backend.send(root, original, flags.modified | flags.file)
    await vi.waitFor(() => expect(events).toContainEqual(['change', original]))
    await fs.rename(original, renamed)
    backend.send(root, original, flags.moved | flags.file)
    backend.send(root, renamed, flags.moved | flags.file)
    await vi.waitFor(() => {
      expect(events).toContainEqual(['unlink', original])
      expect(events).toContainEqual(['add', renamed])
    })
    events.length = 0
    const replacement = path.join(root, 'replacement.txt')
    await fs.writeFile(replacement, 'replacement')
    await fs.rename(replacement, renamed)
    backend.send(root, renamed, flags.deleted | flags.file)
    await vi.waitFor(() => expect(events).toEqual([['change', renamed]]))
    await fs.unlink(renamed)
    backend.send(root, renamed, flags.deleted | flags.file)
    await vi.waitFor(() => expect(events).toContainEqual(['unlink', renamed]))
  })

  it('registers without traversing existing files and delivers a subsequent creation', async () => {
    const root = await fixture()
    await Promise.all(
      Array.from({ length: 256 }, (_, index) =>
        fs.writeFile(path.join(root, `existing-${index}.txt`), 'old')
      )
    )
    const reads = [vi.spyOn(fs, 'readdir'), vi.spyOn(fs, 'stat'), vi.spyOn(fs, 'lstat')]
    const backend = createNative()
    const watcher = watch(backend.native)
    const added = vi.fn()
    watcher.on('add', added)

    expect(await watcher.add(root)).toBe(watcher)
    expect(reads.reduce((total, read) => total + read.mock.calls.length, 0)).toBeLessThanOrEqual(64)
    expect(reads[0]).not.toHaveBeenCalled()
    expect(added).not.toHaveBeenCalled()

    const created = path.join(root, 'new.txt')
    await fs.writeFile(created, 'new')
    backend.send(root, created, flags.created | flags.file)
    await vi.waitFor(() => expect(added).toHaveBeenCalledExactlyOnceWith(created))
  })
})

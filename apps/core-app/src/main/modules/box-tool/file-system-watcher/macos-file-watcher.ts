import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const MAX_PENDING_PATHS = 1024
const MAX_METADATA_CONCURRENCY = 4
const MAX_WRITE_SETTLE_MS = 30000

export interface NativeFileEvents {
  watch: (root: string, callback: (filePath: string, flags: number) => void) => () => Promise<void>
  getInfo: (filePath: string, flags: number) => { event: string; type?: string }
  constants: {
    MustScanSubDirs: number
    UserDropped: number
    KernelDropped: number
    RootChanged: number
  }
}

export interface MacOSFileWatchInvalidation {
  path: string
  rootPath: string
  reason: 'directory-change' | 'event-loss' | 'overflow' | 'symlink-change'
}

interface MacOSFileWatcherOptions {
  depth: number
  ignored: (filePath: string) => boolean
  stabilityThresholdMs?: number
  pollIntervalMs?: number
  native?: NativeFileEvents
}

interface PendingFile {
  path: string
  physicalPath: string
  rootPath: string
  fileType?: string
  event: 'add' | 'change'
  revision: number
  fingerprint?: string
  stableSince: number
  firstSeen: number
  due: number
  running: boolean
}

export class MacOSFileWatcher extends EventEmitter {
  private readonly stops: Array<() => Promise<void>> = []
  private readonly registrations = new Map<string, Promise<void>>()
  private readonly pending = new Map<string, PendingFile>()
  private readonly knownFiles = new Map<string, string>()
  private readonly workers = new Set<Promise<void>>()
  private readonly overflowRoots = new Map<string, number>()
  private readonly stabilityThresholdMs: number
  private readonly pollIntervalMs: number
  private timer?: ReturnType<typeof setTimeout>
  private timerDue = Number.POSITIVE_INFINITY
  private closed = false
  private closing?: Promise<void>

  constructor(private readonly options: MacOSFileWatcherOptions) {
    super()
    this.stabilityThresholdMs = options.stabilityThresholdMs ?? 500
    this.pollIntervalMs = options.pollIntervalMs ?? 100
  }

  async add(root: string): Promise<this> {
    if (this.closed) throw new Error('MacOSFileWatcher is closed')
    const logicalRoot = path.resolve(root)
    if (this.options.ignored(logicalRoot)) return this
    let registration = this.registrations.get(logicalRoot)
    if (!registration) {
      registration = this.register(logicalRoot).catch((error) => {
        this.registrations.delete(logicalRoot)
        if (!this.closed && this.listenerCount('error') > 0) this.emit('error', error)
        throw error
      })
      this.registrations.set(logicalRoot, registration)
    }
    await registration
    return this
  }

  private async register(logicalRoot: string): Promise<void> {
    const canonicalRoot = await fs.realpath(logicalRoot)
    if (this.closed) return
    const native = this.options.native ?? (await this.loadNative())
    if (this.closed) return
    this.stops.push(
      native.watch(canonicalRoot, (filePath, flags) => {
        try {
          this.receive(logicalRoot, canonicalRoot, native, filePath, flags)
        } catch (error) {
          if (!this.closed) this.emit('error', error)
        }
      })
    )
  }

  private receive(
    logicalRoot: string,
    canonicalRoot: string,
    native: NativeFileEvents,
    filePath: string,
    flags: number
  ): void {
    if (this.closed) return
    const info = native.getInfo(filePath, flags)
    const constants = native.constants
    if (
      flags &
      (constants.MustScanSubDirs |
        constants.UserDropped |
        constants.KernelDropped |
        constants.RootChanged)
    ) {
      this.invalidate(logicalRoot, logicalRoot, 'event-loss')
      return
    }
    if (this.overflowRoots.has(logicalRoot)) return
    const relativePath = path.relative(canonicalRoot, path.resolve(filePath))
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    )
      return
    if (relativePath.split(path.sep).length - 1 > this.options.depth) return
    const logicalPath = path.join(logicalRoot, relativePath)
    let candidate = logicalPath
    while (true) {
      if (this.options.ignored(candidate)) return
      if (candidate === logicalRoot) break
      candidate = path.dirname(candidate)
    }
    if (info.type === 'directory' || relativePath === '') {
      this.invalidate(logicalPath, logicalRoot, 'directory-change')
      return
    }
    if (info.type === 'symlink') {
      this.invalidate(logicalPath, logicalRoot, 'symlink-change')
      return
    }
    const event = ['created', 'moved', 'cloned'].includes(info.event) ? 'add' : 'change'
    const existing = this.pending.get(logicalPath)
    if (existing) {
      existing.revision += 1
      existing.fileType = info.type
      if (event === 'add') existing.event = event
      existing.due = Date.now()
    } else {
      if (this.pending.size >= MAX_PENDING_PATHS) {
        this.overflow(logicalRoot)
        return
      }
      this.pending.set(logicalPath, {
        path: logicalPath,
        physicalPath: path.join(canonicalRoot, relativePath),
        rootPath: logicalRoot,
        fileType: info.type,
        event,
        revision: 0,
        firstSeen: Date.now(),
        stableSince: Date.now(),
        due: Date.now(),
        running: false
      })
    }
    this.schedule(true)
  }

  private async loadNative(): Promise<NativeFileEvents> {
    if (process.platform !== 'darwin') throw new Error('Native file events require macOS')
    try {
      return await import('fsevents')
    } catch (cause) {
      const nestedCause =
        cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause
      throw new Error('The optional fsevents native backend is unavailable', { cause: nestedCause })
    }
  }

  private overflow(rootPath: string): void {
    if (this.overflowRoots.has(rootPath)) return
    this.overflowRoots.set(rootPath, Date.now() + this.pollIntervalMs)
    for (const pending of this.pending.values()) {
      if (pending.rootPath === rootPath) this.pending.delete(pending.path)
    }
    this.schedule()
  }

  private invalidate(
    filePath: string,
    rootPath: string,
    reason: MacOSFileWatchInvalidation['reason']
  ): void {
    if (this.closed) return
    for (const pending of this.pending.values()) {
      if (pending.path === filePath || pending.path.startsWith(`${filePath}${path.sep}`))
        this.pending.delete(pending.path)
    }
    this.emit('invalidate', {
      path: filePath,
      rootPath,
      reason
    } satisfies MacOSFileWatchInvalidation)
  }

  private isCurrent(pending: PendingFile, revision: number): boolean {
    return (
      !this.closed && this.pending.get(pending.path) === pending && pending.revision === revision
    )
  }

  private schedule(immediate = false): void {
    if (this.closed) return
    let earliest = Number.POSITIVE_INFINITY
    for (const due of this.overflowRoots.values()) earliest = Math.min(earliest, due)
    if (this.workers.size < MAX_METADATA_CONCURRENCY) {
      if (immediate) earliest = Date.now()
      else
        for (const pending of this.pending.values()) {
          if (!pending.running) earliest = Math.min(earliest, pending.due)
        }
    }
    if (this.timer && this.timerDue <= earliest) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    if (!Number.isFinite(earliest)) return
    this.timerDue = earliest
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        for (const [rootPath, due] of this.overflowRoots) {
          if (due > Date.now()) continue
          this.overflowRoots.delete(rootPath)
          this.invalidate(rootPath, rootPath, 'overflow')
        }
        for (const pending of this.pending.values()) {
          if (this.workers.size >= MAX_METADATA_CONCURRENCY) break
          if (pending.running || pending.due > Date.now()) continue
          pending.running = true
          const worker = this.inspect(pending)
            .catch((error) => {
              if (this.pending.get(pending.path) === pending) this.pending.delete(pending.path)
              if (!this.closed) this.emit('error', error)
            })
            .finally(() => {
              pending.running = false
              this.workers.delete(worker)
              this.schedule()
            })
          this.workers.add(worker)
        }
        this.schedule()
      },
      Math.max(0, earliest - Date.now())
    )
  }

  private async inspect(pending: PendingFile): Promise<void> {
    const revision = pending.revision
    let stats
    try {
      const parentPath = path.dirname(pending.physicalPath)
      const resolvedParent = await fs.realpath(parentPath)
      if (!this.isCurrent(pending, revision)) return
      if (resolvedParent !== parentPath) {
        this.invalidate(path.dirname(pending.path), pending.rootPath, 'symlink-change')
        return
      }
      stats = await fs.lstat(pending.physicalPath)
    } catch (error) {
      if (!this.isCurrent(pending, revision)) return
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        this.pending.delete(pending.path)
        this.knownFiles.delete(pending.path)
        if (pending.fileType === 'file') this.emit('unlink', pending.path)
        else this.invalidate(path.dirname(pending.path), pending.rootPath, 'directory-change')
        return
      }
      throw error
    }
    if (!this.isCurrent(pending, revision)) return
    if (stats.isDirectory() || stats.isSymbolicLink()) {
      this.invalidate(
        pending.path,
        pending.rootPath,
        stats.isDirectory() ? 'directory-change' : 'symlink-change'
      )
      return
    }
    if (!stats.isFile()) {
      this.pending.delete(pending.path)
      return
    }
    const now = Date.now()
    if (now - pending.firstSeen > Math.max(MAX_WRITE_SETTLE_MS, this.stabilityThresholdMs * 4)) {
      this.overflow(pending.rootPath)
      return
    }
    const fingerprint = `${stats.ino}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`
    if (pending.fingerprint !== fingerprint) {
      pending.fingerprint = fingerprint
      pending.stableSince = now
    }
    if (now - pending.stableSince >= this.stabilityThresholdMs) {
      this.pending.delete(pending.path)
      const previous = this.knownFiles.get(pending.path)
      this.knownFiles.delete(pending.path)
      this.knownFiles.set(pending.path, fingerprint)
      if (this.knownFiles.size > MAX_PENDING_PATHS) {
        const oldest = this.knownFiles.keys().next().value
        if (oldest !== undefined) this.knownFiles.delete(oldest)
      }
      if (previous !== fingerprint)
        this.emit(previous === undefined ? pending.event : 'change', pending.path)
    } else {
      pending.due =
        now + Math.min(this.pollIntervalMs, this.stabilityThresholdMs - (now - pending.stableSince))
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.pending.clear()
    this.knownFiles.clear()
    this.overflowRoots.clear()
    this.closing = this.stop()
    return this.closing
  }

  private async stop(): Promise<void> {
    await Promise.allSettled(this.registrations.values())
    const results = await Promise.allSettled(this.stops.splice(0).map(async (stop) => stop()))
    await Promise.allSettled(this.workers)
    this.registrations.clear()
    const failures = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason)
    if (failures.length) throw new AggregateError(failures, 'Failed to stop native file events')
  }
}

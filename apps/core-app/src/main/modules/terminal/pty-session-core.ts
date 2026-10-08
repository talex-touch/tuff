import type { Event, WebContents, WebContentsDidStartNavigationEventParams } from 'electron'
import type { IPty } from 'node-pty'
import type * as NodePty from 'node-pty'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import {
  findCommandInSearchRoots,
  withExecutableDirOnPath
} from '../ai/providers/cli/cli-executable'
import { createLogger } from '../../utils/logger'

const ptyLog = createLogger('PtySessionCore')

export interface PtySessionOwner {
  readonly scope: string
  readonly sender: WebContents
  readonly pluginKey?: string
}

export interface PtySessionExit {
  exitCode: number | null
  signal?: number
}

export interface PtyCreationReservation {
  readonly token: string
  readonly signal: AbortSignal
  readonly completed: Promise<void>
}

interface PtyCreationRecord extends PtyCreationReservation {
  owner: PtySessionOwner
  watcher: PtyOwnerWatch
  session?: PtySession
  abortPending: () => void
  resolveCompleted: () => void
  onDispose?: () => void
  finished: boolean
}

export interface PtySessionCreateOptions {
  owner: PtySessionOwner
  command: string
  args?: string[]
  cwd?: string
  /** Base child environment; the shared core prepends the executable directory exactly once. */
  env?: Record<string, string>
  cols?: number
  rows?: number
  signal?: AbortSignal
  creationToken?: string
  creation?: PtyCreationReservation
  validateOwner?: () => void
  onData: (id: string, data: string) => void
  onExit: (id: string, exit: PtySessionExit) => void
  onDispose?: () => void
}

interface PtySession {
  id: string
  owner: PtySessionOwner
  process: IPty
  options: PtySessionCreateOptions
  creation?: PtyCreationRecord
  subscriptions: { dispose: () => void }[]
  watcher: PtyOwnerWatch
  aborted: () => void
  closing: boolean
  completed: Promise<void>
  resolveCompleted: () => void
  finished: boolean
}

interface PtySessionCoreOptions {
  loadPty?: () => Promise<Pick<typeof NodePty, 'spawn'>>
  resolveExecutable?: (command: string, cwd: string) => Promise<string>
}

async function resolveExecutable(command: string, cwd: string): Promise<string> {
  const executable = isAbsolute(command)
    ? command
    : /[/\\]/.test(command)
      ? resolve(cwd, command)
      : await findCommandInSearchRoots(command)
  if (!executable) throw new Error('TERMINAL_EXECUTABLE_NOT_FOUND')
  try {
    if (!(await stat(executable)).isFile()) throw new Error('Not a file')
    await access(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
  } catch {
    throw new Error('TERMINAL_EXECUTABLE_NOT_FOUND')
  }
  return executable
}

function terminalSize(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error('TERMINAL_SIZE_INVALID')
  }
  return value
}

export interface PtyOwnerWatch {
  readonly signal: AbortSignal
  dispose: () => void
  cancel: () => void
}

/** Covers pending creation as well as active PTYs; reloading retains the sender object. */
export function watchPtyOwner(sender: WebContents, signal?: AbortSignal): PtyOwnerWatch {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  const navigate = (details: Event<WebContentsDidStartNavigationEventParams>): void => {
    if (details.isMainFrame && !details.isSameDocument) abort()
  }
  sender.once('destroyed', abort)
  sender.once('render-process-gone', abort)
  sender.on('did-start-navigation', navigate)
  signal?.addEventListener('abort', abort, { once: true })
  if (sender.isDestroyed() || signal?.aborted) abort()
  return {
    signal: controller.signal,
    cancel: abort,
    dispose: () => {
      sender.removeListener('destroyed', abort)
      sender.removeListener('render-process-gone', abort)
      sender.removeListener('did-start-navigation', navigate)
      signal?.removeEventListener('abort', abort)
    }
  }
}

/** Main-only PTY ownership and lifecycle shared by generic terminals and AI CLI. */
export class PtySessionCore {
  private readonly sessions = new Map<string, PtySession>()
  private readonly creations = new Map<string, Set<PtyCreationRecord>>()
  private readonly creationRecords = new WeakMap<PtyCreationReservation, PtyCreationRecord>()
  private readonly loadPty: NonNullable<PtySessionCoreOptions['loadPty']>
  private readonly resolveExecutable: NonNullable<PtySessionCoreOptions['resolveExecutable']>

  constructor(options: PtySessionCoreOptions = {}) {
    this.loadPty = options.loadPty ?? (() => import('node-pty'))
    this.resolveExecutable = options.resolveExecutable ?? resolveExecutable
  }

  reserveCreate(
    owner: PtySessionOwner,
    token: string,
    signal?: AbortSignal
  ): PtyCreationReservation {
    this.assertLiveOwner(owner, signal)
    if (typeof token !== 'string' || !token || token.length > 128) {
      throw new Error('TERMINAL_CREATION_TOKEN_INVALID')
    }
    const existing = this.creations.get(token)
    if (existing) {
      for (const record of existing) {
        if (this.sameOwner(record.owner, owner)) throw new Error('TERMINAL_CREATE_CONFLICT')
      }
    }
    const watcher = watchPtyOwner(owner.sender, signal)
    const { promise: completed, resolve: resolveCompleted } = Promise.withResolvers<void>()
    const record: PtyCreationRecord = {
      token,
      owner: { ...owner },
      signal: watcher.signal,
      watcher,
      completed,
      resolveCompleted,
      finished: false,
      abortPending: () => {
        if (!record.session) this.finishCreation(record)
      }
    }
    const records = existing ?? new Set<PtyCreationRecord>()
    records.add(record)
    this.creations.set(token, records)
    this.creationRecords.set(record, record)
    watcher.signal.addEventListener('abort', record.abortPending, { once: true })
    if (watcher.signal.aborted) this.finishCreation(record)
    return record
  }

  discardCreate(reservation: PtyCreationReservation): void {
    const record = this.creationRecords.get(reservation)
    if (record && !record.session) this.finishCreation(record)
  }

  setCreationDisposer(reservation: PtyCreationReservation, onDispose: () => void): void {
    const record = this.creationRecords.get(reservation)
    if (!record || record.finished) {
      onDispose()
      throw new Error('TERMINAL_CREATE_CANCELLED')
    }
    record.onDispose = onDispose
  }

  async cancelCreation(token: string, owner: PtySessionOwner): Promise<boolean> {
    let record: PtyCreationRecord | undefined
    for (const candidate of this.creations.get(token) ?? []) {
      if (this.sameOwner(candidate.owner, owner)) {
        record = candidate
        break
      }
    }
    if (!record) return false
    record.watcher.cancel()
    if (record.session) await this.closeSession(record.session)
    await record.completed
    return true
  }

  async create(options: PtySessionCreateOptions): Promise<{ id: string }> {
    const { owner, command, args = [] } = options
    this.assertLiveOwner(owner, options.signal)
    const reservation =
      options.creation ??
      (options.creationToken === undefined
        ? undefined
        : this.reserveCreate(owner, options.creationToken, options.signal))
    const creation = reservation ? this.creationRecords.get(reservation) : undefined
    if (reservation && !creation) throw new Error('TERMINAL_CREATE_CANCELLED')
    if (creation && !this.sameOwner(creation.owner, owner))
      throw new Error('TERMINAL_CALLER_INVALID')
    if (creation) creation.onDispose = options.onDispose
    const watcher = creation?.watcher ?? watchPtyOwner(owner.sender, options.signal)
    let session: PtySession | undefined
    try {
      if (typeof command !== 'string' || !command.trim() || command.includes('\0')) {
        throw new Error('TERMINAL_COMMAND_INVALID')
      }
      if (
        !Array.isArray(args) ||
        args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
      ) {
        throw new Error('TERMINAL_ARGS_INVALID')
      }
      if (options.cwd !== undefined && (typeof options.cwd !== 'string' || !options.cwd)) {
        throw new Error('TERMINAL_CWD_INVALID')
      }
      const cwd = options.cwd ?? process.cwd()
      try {
        if (!(await stat(cwd)).isDirectory()) throw new Error('Not a directory')
      } catch {
        throw new Error('TERMINAL_CWD_INVALID')
      }
      this.assertLiveOwner(owner, watcher.signal)
      const cols = terminalSize(options.cols, 100)
      const rows = terminalSize(options.rows, 30)
      const executable = await this.resolveExecutable(command, cwd)
      this.assertLiveOwner(owner, watcher.signal)
      const pty = await this.loadPty()
      this.assertLiveOwner(owner, watcher.signal)
      const env =
        options.env ??
        Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === 'string' && entry[0] !== 'ELECTRON_RUN_AS_NODE'
          )
        )
      options.validateOwner?.()
      let child: IPty
      try {
        child = pty.spawn(executable, args, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: withExecutableDirOnPath(env, executable)
        })
      } catch {
        throw new Error('TERMINAL_SPAWN_FAILED')
      }
      const id = randomUUID()
      const { promise: completed, resolve: resolveCompleted } = Promise.withResolvers<void>()
      const active: PtySession = {
        id,
        owner: { ...owner },
        process: child,
        options,
        subscriptions: [],
        finished: false,
        closing: false,
        completed,
        resolveCompleted,
        watcher,
        creation,
        aborted: () => {
          void this.closeSession(active).catch(() => {
            ptyLog.warn('PTY close failed', { meta: { id } })
          })
        }
      }
      session = active
      if (creation) creation.session = active
      this.sessions.set(id, active)
      const subscribe = (subscription: { dispose: () => void }): void => {
        if (active.finished) subscription.dispose()
        else active.subscriptions.push(subscription)
      }
      watcher.signal.addEventListener('abort', active.aborted, { once: true })
      let initializing = true
      let earlyExit: PtySessionExit | undefined
      subscribe(
        child.onExit((exit) => {
          if (initializing) earlyExit = exit
          else this.finish(active, exit)
        })
      )
      subscribe(
        child.onData((data) => {
          if (!active.finished && !watcher.signal.aborted && !owner.sender.isDestroyed())
            options.onData(id, data)
        })
      )
      initializing = false
      if (earlyExit) this.finish(active, earlyExit)
      if (watcher.signal.aborted) {
        await this.closeSession(active)
        throw new Error('TERMINAL_CREATE_CANCELLED')
      }
      return { id }
    } catch (error) {
      if (session) await this.closeSession(session)
      else {
        if (creation) this.finishCreation(creation)
        else {
          watcher.dispose()
          options.onDispose?.()
        }
      }
      throw error
    }
  }

  write(id: string, owner: PtySessionOwner, data: string): void {
    const session = this.requireSession(id, owner)
    if (typeof data !== 'string') throw new Error('TERMINAL_INPUT_INVALID')
    session.process.write(data)
  }

  resize(id: string, owner: PtySessionOwner, cols: number, rows: number): void {
    this.requireSession(id, owner).process.resize(terminalSize(cols, 100), terminalSize(rows, 30))
  }

  async close(id: string, owner: PtySessionOwner): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session || !this.owns(session, owner)) return false
    await this.closeSession(session)
    return true
  }

  closeScope(scope: string): Promise<void> {
    return this.closeMatching(scope)
  }

  closePlugin(scope: string, pluginKey: string): Promise<void> {
    return this.closeMatching(scope, pluginKey)
  }

  private async closeMatching(scope: string, pluginKey?: string): Promise<void> {
    const closing: Promise<void>[] = []
    for (const records of this.creations.values()) {
      for (const record of records) {
        if (
          record.owner.scope === scope &&
          (pluginKey === undefined || record.owner.pluginKey === pluginKey)
        ) {
          record.watcher.cancel()
          closing.push(record.completed)
        }
      }
    }
    for (const session of this.sessions.values()) {
      if (
        session.owner.scope === scope &&
        (pluginKey === undefined || session.owner.pluginKey === pluginKey)
      ) {
        closing.push(this.closeSession(session))
      }
    }
    await Promise.all(closing)
  }

  private finishCreation(record: PtyCreationRecord): void {
    if (record.finished) return
    record.finished = true
    const records = this.creations.get(record.token)
    records?.delete(record)
    if (records?.size === 0) this.creations.delete(record.token)
    this.creationRecords.delete(record)
    record.watcher.signal.removeEventListener('abort', record.abortPending)
    record.watcher.dispose()
    try {
      if (!record.session) record.onDispose?.()
    } finally {
      record.resolveCompleted()
    }
  }

  private sameOwner(left: PtySessionOwner, right: PtySessionOwner): boolean {
    return (
      left.scope === right.scope &&
      left.sender === right.sender &&
      left.pluginKey === right.pluginKey
    )
  }

  private assertLiveOwner(owner: PtySessionOwner, signal?: AbortSignal): void {
    if (
      !owner?.scope ||
      !owner.sender ||
      typeof owner.sender.id !== 'number' ||
      typeof owner.sender.isDestroyed !== 'function' ||
      owner.sender.isDestroyed() ||
      typeof owner.sender.on !== 'function' ||
      typeof owner.sender.once !== 'function' ||
      typeof owner.sender.removeListener !== 'function'
    ) {
      throw new Error('TERMINAL_CALLER_INVALID')
    }
    if (signal?.aborted) throw new Error('TERMINAL_CREATE_CANCELLED')
  }

  private owns(session: PtySession, owner: PtySessionOwner): boolean {
    return this.sameOwner(session.owner, owner) && !owner.sender.isDestroyed()
  }

  private requireSession(id: string, owner: PtySessionOwner): PtySession {
    const session = this.sessions.get(id)
    if (!session || !this.owns(session, owner)) throw new Error('TERMINAL_SESSION_NOT_FOUND')
    if (session.closing) throw new Error('TERMINAL_SESSION_CLOSED')
    return session
  }

  private async closeSession(session: PtySession): Promise<void> {
    if (!session.finished && !session.closing) {
      session.closing = true
      try {
        // Request termination once, but retain listeners and the lease until native onExit.
        session.process.kill('SIGKILL')
      } catch {
        session.closing = false
        throw new Error('TERMINAL_CLOSE_FAILED')
      }
    }
    await session.completed
  }

  private finish(session: PtySession, exit: PtySessionExit): void {
    if (session.finished) return
    session.finished = true
    this.sessions.delete(session.id)
    for (const subscription of session.subscriptions.splice(0)) subscription.dispose()
    session.watcher.signal.removeEventListener('abort', session.aborted)
    if (!session.creation) session.watcher.dispose()
    try {
      try {
        session.options.onDispose?.()
      } finally {
        session.options.onExit(session.id, {
          ...exit,
          exitCode:
            exit.exitCode === 0 && typeof exit.signal === 'number' && exit.signal > 0
              ? null
              : exit.exitCode
        })
      }
    } finally {
      if (session.creation) this.finishCreation(session.creation)
      session.resolveCompleted()
    }
  }
}

export const ptySessionCore = new PtySessionCore()

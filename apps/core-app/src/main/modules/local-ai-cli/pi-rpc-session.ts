import type { ChildProcess } from 'node:child_process'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { parsePiStateResponse } from './pi-native-session'

export type PiRpcRecord = Record<string, unknown>

export interface PersistentPiRpcSessionOptions {
  executable: string
  cwd: string
  args: string[]
  env: Record<string, string>
}

export interface PersistentPiRpcState {
  sessionId: string
  sessionFile: string
}

interface RecordWaiter {
  predicate: (record: PiRpcRecord) => boolean
  resolve: (record: PiRpcRecord) => void
  reject: (error: unknown) => void
}

interface QueueWaiter<T> {
  resolve: (result: IteratorResult<T>) => void
  reject: (error: unknown) => void
}

/** A small async queue that lets one RPC turn consume stdout without owning the child process. */
class PiRpcEventQueue implements AsyncIterable<PiRpcRecord>, AsyncIterator<PiRpcRecord> {
  private readonly items: PiRpcRecord[] = []
  private readonly waiters: QueueWaiter<PiRpcRecord>[] = []
  private ended = false
  private failure: unknown = null

  push(record: PiRpcRecord): void {
    if (this.ended) return
    const waiter = this.waiters.shift()
    if (waiter) waiter.resolve({ value: record, done: false })
    else this.items.push(record)
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    for (const waiter of this.waiters.splice(0)) waiter.resolve({ value: undefined, done: true })
  }

  fail(error: unknown): void {
    if (this.ended) return
    this.ended = true
    this.failure = error
    for (const waiter of this.waiters.splice(0)) waiter.reject(error)
  }

  async next(): Promise<IteratorResult<PiRpcRecord>> {
    if (this.items.length > 0) return { value: this.items.shift()!, done: false }
    if (this.failure !== null) throw this.failure
    if (this.ended) return { value: undefined, done: true }
    const { promise, resolve, reject } = Promise.withResolvers<IteratorResult<PiRpcRecord>>()
    this.waiters.push({ resolve, reject })
    return await promise
  }

  [Symbol.asyncIterator](): AsyncIterator<PiRpcRecord> {
    return this
  }
}

function isTurnComplete(record: PiRpcRecord): boolean {
  return record.type === 'agent_settled'
}

/**
 * One long-lived `pi --mode rpc` child. The native JSONL session is durable, but this object keeps
 * the actual process and its stdin/stdout alive so GUI and terminal views can submit turns through
 * the same agent instead of spawning a fresh CLI for every view change.
 */
export class PersistentPiRpcSession {
  readonly state: PersistentPiRpcState
  private readonly child: ChildProcess
  private readonly waiters = new Set<RecordWaiter>()
  private readonly closedPromise: Promise<void>
  private readonly resolveClosed: () => void
  private activeTurn: PiRpcEventQueue | null = null
  private lineBuffer = ''
  private closed = false
  private closing = false

  private constructor(child: ChildProcess, state: PersistentPiRpcState) {
    this.child = child
    this.state = state
    const { promise, resolve } = Promise.withResolvers<void>()
    this.closedPromise = promise
    this.resolveClosed = resolve

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => this.receive(chunk))
    child.once('error', (error) => this.fail(error))
    child.once('close', () => {
      this.closed = true
      this.fail(new Error('PROCESS_EXITED'))
      this.resolveClosed()
    })
  }

  static async create(options: PersistentPiRpcSessionOptions): Promise<PersistentPiRpcSession> {
    const child = spawnSafe(options.executable, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const session = new PersistentPiRpcSession(child, { sessionId: '', sessionFile: '' })
    try {
      const responsePromise = session.waitFor(
        (record) => record.type === 'response' && record.command === 'get_state'
      )
      session.write({ id: 'tuff-state', type: 'get_state' })
      const response = await responsePromise
      const state = parsePiStateResponse(response)
      if (!state) throw new Error('PROTOCOL_INVALID')
      session.state.sessionId = state.sessionId
      session.state.sessionFile = state.sessionFile
      return session
    } catch (error) {
      await session.close()
      throw error
    }
  }

  private receive(chunk: string): void {
    this.lineBuffer += chunk
    while (this.lineBuffer.includes('\n')) {
      const newline = this.lineBuffer.indexOf('\n')
      const line = this.lineBuffer.slice(0, newline).replace(/\r$/, '')
      this.lineBuffer = this.lineBuffer.slice(newline + 1)
      if (!line.trim()) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const record = parsed as PiRpcRecord
      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(record)) continue
        this.waiters.delete(waiter)
        waiter.resolve(record)
      }
      this.activeTurn?.push(record)
      if (isTurnComplete(record)) this.activeTurn?.end()
    }
  }

  private waitFor(predicate: (record: PiRpcRecord) => boolean): Promise<PiRpcRecord> {
    if (this.closed) return Promise.reject(new Error('PROCESS_EXITED'))
    const { promise, resolve, reject } = Promise.withResolvers<PiRpcRecord>()
    const waiter: RecordWaiter = { predicate, resolve, reject }
    this.waiters.add(waiter)
    return promise.finally(() => this.waiters.delete(waiter))
  }

  private fail(error: unknown): void {
    for (const waiter of this.waiters) waiter.reject(error)
    this.waiters.clear()
    this.activeTurn?.fail(error)
  }

  private write(value: PiRpcRecord): void {
    if (this.closed || !this.child.stdin?.writable) throw new Error('PROCESS_EXITED')
    this.child.stdin.write(`${JSON.stringify(value)}\n`)
  }

  async request(
    value: PiRpcRecord,
    predicate: (record: PiRpcRecord) => boolean
  ): Promise<PiRpcRecord> {
    const response = this.waitFor(predicate)
    this.write(value)
    return await response
  }

  async *prompt(prompt: string, signal?: AbortSignal): AsyncGenerator<PiRpcRecord> {
    if (this.activeTurn) throw new Error('NATIVE_SESSION_BUSY')
    if (signal?.aborted) throw new Error('CANCELLED')

    const queue = new PiRpcEventQueue()
    this.activeTurn = queue
    const abort = (): void => {
      queue.fail(new Error('CANCELLED'))
      void this.close()
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      this.write({ type: 'prompt', message: prompt })
      for await (const record of queue) yield record
    } finally {
      signal?.removeEventListener('abort', abort)
      if (this.activeTurn === queue) this.activeTurn = null
    }
  }

  async close(): Promise<void> {
    if (!this.closing) {
      this.closing = true
      this.child.kill()
    }
    await this.closedPromise
  }
}

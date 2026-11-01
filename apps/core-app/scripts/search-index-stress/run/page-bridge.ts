import {
  CdpClosedError,
  CdpConnection,
  CdpError,
  CdpTimeoutError,
  describeTarget,
  fetchJson,
  isPageTarget,
  type CdpTarget
} from '../monitor/cdp'
import { DriverError, describeError, throwIfAborted } from './errors'
import type { BridgeEvent, BridgeSlice, PageState } from './page-scripts'
import { BRIDGE_SOURCE, BRIDGE_VERSION, PAGE_STATE_EXPRESSION, bridgeCall } from './page-scripts'

interface EvaluateResponse {
  result?: { value?: unknown }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

const PAGE_GONE =
  /context was destroyed|cannot find context|target closed|session closed|inspected target navigated|no target with given id/i

export interface PageSessionOptions {
  cdpPort: number
  now: () => number
  host?: string
  /** How long to wait for the CoreBox page before settling for another page that has the ipcRenderer. */
  boxWaitMs?: number
  /** Pause between rounds over the page list. */
  pollMs?: number
  readyTimeoutMs?: number
  /** How long a call waits for the page to come back after its connection dropped. */
  reconnectTimeoutMs?: number
  log?: (line: string) => void
}

export interface BridgeCallOptions {
  timeoutMs?: number
  awaitPromise?: boolean
}

const RECOVERABLE = new Set(['searchStart', 'callStart', 'status'])

/** One page of the app under test, reached over CDP, with the bridge from page-scripts.ts installed in it. */
export class PageSession {
  private connection: CdpConnection
  private label: string
  private reconnecting: Promise<void> | null = null
  private disposed = false

  private constructor(
    connection: CdpConnection,
    label: string,
    private readonly options: PageSessionOptions
  ) {
    this.connection = connection
    this.label = label
  }

  static async open(options: PageSessionOptions): Promise<PageSession> {
    const { connection, label } = await connectToPage(options, options.readyTimeoutMs ?? 30_000)
    const session = new PageSession(connection, label, options)
    await session.inject()
    return session
  }

  get target(): string {
    return this.label
  }

  get closed(): boolean {
    return this.connection.closed
  }

  close(): void {
    this.disposed = true
    this.connection.close()
  }

  async evaluate<T>(expression: string, timeoutMs: number, awaitPromise = false): Promise<T> {
    if (this.disposed) throw new DriverError('page-missing', 'the page session was closed')
    if (this.connection.closed) await this.reconnect()
    let response: EvaluateResponse
    try {
      response = await this.connection.send<EvaluateResponse>(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise },
        timeoutMs
      )
    } catch (error) {
      throw mapCdpError(error)
    }
    if (response.exceptionDetails) {
      const details = response.exceptionDetails
      const text = details.exception?.description ?? details.text ?? 'evaluation failed'
      throw new DriverError(
        PAGE_GONE.test(text) ? 'page-missing' : 'protocol',
        `the page threw: ${text}`
      )
    }
    return response.result?.value as T
  }

  async inject(): Promise<void> {
    const outcome = await this.evaluate<{ installed: boolean; version: number } | undefined>(
      BRIDGE_SOURCE,
      10_000
    )
    if (!outcome || outcome.version !== BRIDGE_VERSION) {
      throw new DriverError('protocol', `the bridge did not install: ${JSON.stringify(outcome)}`)
    }
  }

  /**
   * Calls a bridge method. When the page lost the bridge (it was reloaded) the bridge is installed
   * again: calls that only start something run once more, calls about an existing operation report it gone.
   */
  async bridge<T = BridgeSlice>(
    method: string,
    args: unknown[] = [],
    options: BridgeCallOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 10_000
    const run = (): Promise<T | undefined> =>
      this.evaluate<T | undefined>(bridgeCall(method, ...args), timeoutMs, options.awaitPromise)
    let value = await run()
    if (isMissing(value)) {
      await this.inject()
      if (!RECOVERABLE.has(method)) return { gone: true } as T
      value = await run()
      if (isMissing(value))
        throw new DriverError('page-missing', 'the bridge is gone right after it was installed')
    }
    return value as T
  }

  private reconnect(): Promise<void> {
    if (!this.reconnecting) {
      this.reconnecting = (async () => {
        try {
          const { connection, label } = await connectToPage(
            this.options,
            this.options.reconnectTimeoutMs ?? 5_000,
            () => this.disposed
          )
          this.connection = connection
          this.label = label
          await this.inject()
          this.options.log?.(`reconnected to ${label}`)
        } finally {
          this.reconnecting = null
        }
      })()
    }
    return this.reconnecting
  }
}

function isMissing(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { missing?: unknown }).missing === true
  )
}

function mapCdpError(error: unknown): DriverError {
  if (error instanceof DriverError) return error
  if (error instanceof CdpTimeoutError)
    return new DriverError('timeout', describeError(error), { cause: error })
  if (error instanceof CdpClosedError)
    return new DriverError('page-missing', `the page connection closed: ${describeError(error)}`, {
      cause: error
    })
  if (error instanceof CdpError) {
    return new DriverError(
      PAGE_GONE.test(error.message) ? 'page-missing' : 'cdp',
      describeError(error),
      { cause: error }
    )
  }
  return new DriverError('cdp', describeError(error), { cause: error })
}

const DEFAULT_BOX_WAIT_MS = 90_000

interface SparePage {
  connection: CdpConnection
  target: CdpTarget
  state: PageState
}

/** Connects to the CoreBox page; when none shows up within `boxWaitMs` of seeing another usable page, to that one. */
async function connectToPage(
  options: PageSessionOptions,
  budgetMs: number,
  stopped: () => boolean = () => false
): Promise<{ connection: CdpConnection; label: string }> {
  const host = options.host ?? '127.0.0.1'
  const deadline = options.now() + budgetMs
  const boxWaitMs = Math.min(options.boxWaitMs ?? DEFAULT_BOX_WAIT_MS, budgetMs / 2)
  let spareSince: number | null = null
  let lastProblem = 'no page target yet'
  for (;;) {
    if (stopped()) throw new DriverError('page-missing', 'the page session was closed')
    let spare: SparePage | null = null
    try {
      const targets = await fetchJson<CdpTarget[]>(
        `http://${host}:${options.cdpPort}/json/list`,
        3_000
      )
      for (const target of targets.filter(isPageTarget)) {
        let connection: CdpConnection | null = null
        try {
          connection = await CdpConnection.open(
            target.webSocketDebuggerUrl as string,
            options.now,
            3_000
          )
          const answer = await connection.send<EvaluateResponse>(
            'Runtime.evaluate',
            { expression: PAGE_STATE_EXPRESSION, returnByValue: true },
            3_000
          )
          const state = answer.result?.value as PageState | undefined
          if (!state?.ipc) {
            lastProblem = `${describeTarget(target)} has no ipcRenderer yet`
          } else if (state.box) {
            spare?.connection.close()
            return { connection, label: `${describeTarget(target)} [CoreBox]` }
          } else if (!spare) {
            spare = { connection, target, state }
            connection = null
          }
        } catch (error) {
          lastProblem = `${describeTarget(target)}: ${describeError(error)}`
        }
        connection?.close()
      }
    } catch (error) {
      lastProblem = `target list: ${describeError(error)}`
    }
    if (spare) {
      const now = options.now()
      spareSince ??= now
      if (now - spareSince >= boxWaitMs || now >= deadline) {
        const label = `${describeTarget(spare.target)} [${spare.state.mode ?? 'unknown mode'}, not CoreBox]`
        options.log?.(
          `no CoreBox page after ${Math.round((now - spareSince) / 1000)} s, using ${label}`
        )
        return { connection: spare.connection, label }
      }
      spare.connection.close()
      lastProblem = `no CoreBox page yet, only ${spare.state.mode ?? 'other'}`
    }
    if (options.now() >= deadline)
      throw new DriverError(
        'page-missing',
        `no usable page on port ${options.cdpPort}: ${lastProblem}`
      )
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 500))
  }
}

export interface OperationResult {
  events: BridgeEvent[]
  final: BridgeSlice
}

/**
 * Starts an operation in the page and follows it to its end in short waits, so an abort or a
 * reload is noticed within `sliceMs`. A failure to follow it cancels it in the page.
 */
export async function runOperation(
  session: PageSession,
  method: 'searchStart' | 'callStart',
  args: unknown[],
  options: { sliceMs: number; signal?: AbortSignal }
): Promise<OperationResult> {
  throwIfAborted(options.signal)
  const id = String(args[0])
  await session.bridge(method, args)
  const events: BridgeEvent[] = []
  const cancel = (): void => {
    void session.bridge('cancel', [id]).catch(() => undefined)
  }
  options.signal?.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      const slice = await session.bridge('wait', [id, options.sliceMs], {
        awaitPromise: true,
        timeoutMs: options.sliceMs + 5_000
      })
      if (slice.gone) {
        throwIfAborted(options.signal)
        throw new DriverError(
          'page-missing',
          'the page was reloaded while the operation was running'
        )
      }
      if (slice.events) events.push(...slice.events)
      if (slice.done) return { events, final: slice }
      throwIfAborted(options.signal)
    }
  } catch (error) {
    cancel()
    throw error
  } finally {
    options.signal?.removeEventListener('abort', cancel)
  }
}

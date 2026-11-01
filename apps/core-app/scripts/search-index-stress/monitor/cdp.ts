export class CdpError extends Error {
  constructor(
    readonly method: string,
    message: string,
    readonly code?: number
  ) {
    super(`${method}: ${message}`)
  }
}

export class CdpClosedError extends CdpError {
  constructor(method: string, reason: string) {
    super(method, `connection closed (${reason})`)
  }
}

export class CdpTimeoutError extends CdpError {
  constructor(method: string, timeoutMs: number) {
    super(method, `no answer within ${timeoutMs} ms`)
  }
}

interface Pending {
  method: string
  sentAt: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

type EventHandler = (params: unknown) => void

/**
 * One WebSocket to a CDP endpoint (Chromium browser or page, or a Node inspector). Requests carry
 * their send time so callers can read how long the oldest one has been waiting: an unanswered
 * request is how a blocked main thread shows itself.
 */
export class CdpConnection {
  private readonly pending = new Map<number, Pending>()
  private readonly handlers = new Map<string, Set<EventHandler>>()
  private readonly closeListeners: Array<(reason: string) => void> = []
  private nextId = 1
  private closeReason: string | null = null

  private constructor(
    private readonly socket: WebSocket,
    private readonly now: () => number
  ) {
    socket.addEventListener('message', (event) => this.onMessage(event.data))
    socket.addEventListener('close', (event) =>
      this.markClosed(event.reason || `code ${event.code}`)
    )
    socket.addEventListener('error', () => this.markClosed('socket error'))
  }

  static open(url: string, now: () => number, timeoutMs = 3_000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      let settled = false
      const socket = new WebSocket(url)
      const finish = (error: Error | null, connection?: CdpConnection): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          try {
            socket.close()
          } catch {
            // already closed
          }
          reject(error)
        } else resolve(connection!)
      }
      const timer = setTimeout(() => finish(new Error(`connect to ${url} timed out`)), timeoutMs)
      socket.addEventListener('open', () => finish(null, new CdpConnection(socket, now)), {
        once: true
      })
      socket.addEventListener('error', () => finish(new Error(`connect to ${url} failed`)), {
        once: true
      })
      socket.addEventListener('close', () => finish(new Error(`connect to ${url} closed`)), {
        once: true
      })
    })
  }

  get closed(): boolean {
    return this.closeReason !== null
  }

  get closedReason(): string | null {
    return this.closeReason
  }

  /** Milliseconds the oldest unanswered request has been waiting; 0 when none is. */
  oldestPendingAgeMs(): number {
    let oldest = Infinity
    for (const entry of this.pending.values()) if (entry.sentAt < oldest) oldest = entry.sentAt
    return oldest === Infinity ? 0 : Math.max(0, this.now() - oldest)
  }

  get pendingCount(): number {
    return this.pending.size
  }

  /** `timeoutMs` of 0 or Infinity waits until the answer or the socket closes. */
  send<T = unknown>(method: string, params: object = {}, timeoutMs = 5_000): Promise<T> {
    if (this.closeReason !== null)
      return Promise.reject(new CdpClosedError(method, this.closeReason))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const entry: Pending = {
        method,
        sentAt: this.now(),
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: null
      }
      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        entry.timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new CdpTimeoutError(method, timeoutMs))
        }, timeoutMs)
      }
      this.pending.set(id, entry)
      try {
        this.socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        this.pending.delete(id)
        if (entry.timer) clearTimeout(entry.timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  on(method: string, handler: EventHandler): () => void {
    let set = this.handlers.get(method)
    if (!set) this.handlers.set(method, (set = new Set()))
    set.add(handler)
    return () => set.delete(handler)
  }

  onClose(listener: (reason: string) => void): void {
    if (this.closeReason !== null) listener(this.closeReason)
    else this.closeListeners.push(listener)
  }

  close(): void {
    this.markClosed('closed by monitor')
    try {
      this.socket.close()
    } catch {
      // already closed
    }
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string') return
    let message: {
      id?: number
      method?: string
      params?: unknown
      result?: unknown
      error?: { code?: number; message?: string }
    }
    try {
      message = JSON.parse(data)
    } catch {
      return
    }
    if (typeof message.id === 'number') {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      if (entry.timer) clearTimeout(entry.timer)
      if (message.error) {
        entry.reject(
          new CdpError(entry.method, message.error.message ?? 'error', message.error.code)
        )
      } else entry.resolve(message.result)
      return
    }
    if (message.method) {
      for (const handler of this.handlers.get(message.method) ?? []) handler(message.params)
    }
  }

  private markClosed(reason: string): void {
    if (this.closeReason !== null) return
    this.closeReason = reason
    for (const [id, entry] of this.pending) {
      this.pending.delete(id)
      if (entry.timer) clearTimeout(entry.timer)
      entry.reject(new CdpClosedError(entry.method, reason))
    }
    for (const listener of this.closeListeners.splice(0)) listener(reason)
  }
}

interface EvaluateResponse<T> {
  result?: { value?: T }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

/** `Runtime.evaluate` by value; a thrown exception in the target becomes a CdpError. */
export async function cdpEvaluate<T>(
  connection: CdpConnection,
  expression: string,
  timeoutMs = 5_000
): Promise<T> {
  const response = await connection.send<EvaluateResponse<T>>(
    'Runtime.evaluate',
    { expression, returnByValue: true },
    timeoutMs
  )
  if (response.exceptionDetails) {
    const details = response.exceptionDetails
    throw new CdpError(
      'Runtime.evaluate',
      details.exception?.description ?? details.text ?? 'evaluation failed'
    )
  }
  return response.result?.value as T
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 3_000): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return (await response.json()) as T
}

export interface CdpTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}

/** Page and webview targets only: `/json/list` also names service workers, browser UI and DevTools. */
export function isPageTarget(target: CdpTarget): boolean {
  if (target.type !== 'page' && target.type !== 'webview') return false
  if (!target.webSocketDebuggerUrl) return false
  return !target.url.startsWith('devtools://')
}

/** The inspector URL minus query string and long fragments: safe to put into reports. */
export function describeTarget(target: Pick<CdpTarget, 'title' | 'url'>): string {
  let where = target.url
  try {
    const parsed = new URL(target.url)
    where = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.hash.slice(0, 40)}`
  } catch {
    where = target.url.slice(0, 80)
  }
  return target.title ? `${target.title} (${where})` : where
}

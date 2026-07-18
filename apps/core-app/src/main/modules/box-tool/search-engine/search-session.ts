import type {
  IGatherController,
  IProviderActivate,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type {
  CoreBoxSearchEndPayload,
  CoreBoxSearchUpdatePayload
} from '@talex-touch/utils/transport/events/types'
import { getActivationKey } from './search-core-utils'

export type SearchCallerKind =
  | 'core-box'
  | 'application-index'
  | 'division-box'
  | 'ai-agent'
  | 'background'

export interface SearchCallerIdentity {
  kind: SearchCallerKind
  id: string
  senderId?: number
}

export interface SearchSink {
  start?: (sessionId: string) => void | Promise<void>
  snapshot?: (result: TuffSearchResult) => void | Promise<void>
  update?: (payload: CoreBoxSearchUpdatePayload) => void | Promise<void>
  noResults?: (sessionId: string) => void | Promise<void>
  complete?: (payload: CoreBoxSearchEndPayload) => void | Promise<void>
  error?: (error: Error) => void | Promise<void>
}

export interface SearchRequestContext {
  caller: SearchCallerIdentity
  activations?: readonly IProviderActivate[] | null
  sink?: SearchSink
}

export interface SearchExecution {
  sessionId: string
  result: Promise<TuffSearchResult>
  completed: Promise<void>
  cancel: () => boolean
}

export type SearchSessionState = 'running' | 'completed' | 'cancelled' | 'failed'

export type CachedSearchResultSnapshot = Omit<TuffSearchResult, 'sessionId'>

type BufferedDelivery =
  | { type: 'update'; payload: CoreBoxSearchUpdatePayload }
  | { type: 'no-results' }

function cloneSerializable<T>(value: T): T {
  return structuredClone(value)
}

function cloneCaller(caller: SearchCallerIdentity): Readonly<SearchCallerIdentity> {
  return Object.freeze({ ...caller })
}

function toActivationMap(
  activations: readonly IProviderActivate[] | null
): Map<string, IProviderActivate> | null {
  if (!activations?.length) return null

  const result = new Map<string, IProviderActivate>()
  for (const activation of activations) {
    const cloned = cloneSerializable(activation)
    result.set(getActivationKey(cloned), cloned)
  }
  return result
}

export function createCachedSearchResultSnapshot(
  result: TuffSearchResult
): CachedSearchResultSnapshot {
  const cloned = cloneSerializable(result)
  const { sessionId: _sessionId, ...snapshot } = cloned
  return snapshot
}

export function materializeCachedSearchResult(
  snapshot: CachedSearchResultSnapshot,
  sessionId: string
): TuffSearchResult {
  return {
    ...cloneSerializable(snapshot),
    sessionId
  }
}

export class SearchSession {
  readonly id = crypto.randomUUID()
  readonly caller: Readonly<SearchCallerIdentity>
  readonly query: Readonly<TuffQuery>
  readonly startedAt = Date.now()
  readonly signal: AbortSignal
  readonly completed: Promise<void>

  private readonly abortController = new AbortController()
  private activations: Map<string, IProviderActivate> | null
  private readonly sink: SearchSink
  private readonly bufferedDeliveries: BufferedDelivery[] = []
  private readonly onTerminal: (session: SearchSession) => void
  private readonly onDeliveryError: (error: unknown, session: SearchSession) => void
  private resolveCompleted!: () => void
  private gatherController: IGatherController | null = null
  private cacheKeyValue: string | null = null
  private deliveryTail: Promise<void> = Promise.resolve()
  private pendingTerminal: CoreBoxSearchEndPayload | null = null
  private snapshotPublished = false
  private terminalScheduled = false
  private stateValue: SearchSessionState = 'running'

  constructor(options: {
    caller: SearchCallerIdentity
    query: TuffQuery
    activations: readonly IProviderActivate[] | null
    sink?: SearchSink
    onTerminal: (session: SearchSession) => void
    onDeliveryError?: (error: unknown, session: SearchSession) => void
  }) {
    this.caller = cloneCaller(options.caller)
    this.query = Object.freeze(cloneSerializable(options.query))
    this.activations = toActivationMap(options.activations)
    this.sink = options.sink ?? {}
    this.onTerminal = options.onTerminal
    this.onDeliveryError = options.onDeliveryError ?? (() => {})
    this.signal = this.abortController.signal
    this.completed = new Promise<void>((resolve) => {
      this.resolveCompleted = resolve
    })

    this.enqueueDelivery(() => this.sink.start?.(this.id))
  }

  get state(): SearchSessionState {
    return this.stateValue
  }

  get isTerminal(): boolean {
    return this.stateValue !== 'running'
  }

  get activationMap(): ReadonlyMap<string, IProviderActivate> | null {
    return this.activations
  }

  get cacheKey(): string | null {
    return this.cacheKeyValue
  }

  associateCache(cacheKey: string): void {
    if (this.cacheKeyValue && this.cacheKeyValue !== cacheKey) {
      throw new Error(`Search session ${this.id} cannot change cache association`)
    }
    this.cacheKeyValue = cacheKey
  }

  getActivationState(): IProviderActivate[] | null {
    return this.activations ? cloneSerializable([...this.activations.values()]) : null
  }

  owns(caller: SearchCallerIdentity): boolean {
    return this.caller.kind === caller.kind && this.caller.id === caller.id
  }

  mergeActivations(results: Array<{ activate?: IProviderActivate[] }>): void {
    if (this.isTerminal) return

    const next = results.flatMap((result) => result.activate ?? [])
    if (next.length === 0) return

    if (!this.activations) {
      this.activations = new Map()
    }

    for (const activation of next) {
      const cloned = cloneSerializable(activation)
      this.activations!.set(getActivationKey(cloned), cloned)
    }
  }

  attachGather(controller: IGatherController): void {
    if (this.gatherController) {
      throw new Error(`Search session ${this.id} already owns a gather controller`)
    }

    this.gatherController = controller
    if (this.signal.aborted) {
      controller.abort()
      return
    }

    this.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  cancel(caller?: SearchCallerIdentity): boolean {
    if (this.isTerminal || this.signal.aborted) return false
    if (caller && !this.owns(caller)) return false
    this.abortController.abort()
    return true
  }

  publishSnapshot(result: TuffSearchResult): Promise<void> {
    if (this.snapshotPublished) return this.deliveryTail

    this.snapshotPublished = true
    const snapshotDelivery = this.enqueueDelivery(() => this.sink.snapshot?.(result))

    for (const delivery of this.bufferedDeliveries.splice(0)) {
      if (delivery.type === 'update') {
        this.enqueueDelivery(() => this.sink.update?.(delivery.payload))
      } else {
        this.enqueueDelivery(() => this.sink.noResults?.(this.id))
      }
    }
    this.scheduleTerminalIfReady()
    return snapshotDelivery
  }

  publishUpdate(items: TuffItem[]): boolean {
    if (this.isTerminal || this.signal.aborted || items.length === 0) return false

    const payload: CoreBoxSearchUpdatePayload = {
      searchId: this.id,
      items
    }
    if (!this.snapshotPublished) {
      this.bufferedDeliveries.push({ type: 'update', payload })
    } else {
      this.enqueueDelivery(() => this.sink.update?.(payload))
    }
    return true
  }

  publishNoResults(): boolean {
    if (this.isTerminal || this.signal.aborted) return false

    if (!this.snapshotPublished) {
      this.bufferedDeliveries.push({ type: 'no-results' })
    } else {
      this.enqueueDelivery(() => this.sink.noResults?.(this.id))
    }
    return true
  }

  complete(payload: Omit<CoreBoxSearchEndPayload, 'searchId'> = {}): boolean {
    if (this.isTerminal) return false

    this.stateValue = payload.cancelled ? 'cancelled' : 'completed'
    this.pendingTerminal = { ...payload, searchId: this.id }
    this.scheduleTerminalIfReady()
    return true
  }

  fail(error: unknown): boolean {
    if (this.isTerminal) return false

    this.stateValue = 'failed'
    const normalized = error instanceof Error ? error : new Error(String(error))
    const delivery = this.enqueueDelivery(() => this.sink.error?.(normalized))
    this.terminalScheduled = true
    void delivery.finally(() => this.finishTerminal())
    return true
  }

  private scheduleTerminalIfReady(): void {
    if (!this.snapshotPublished || !this.pendingTerminal || this.terminalScheduled) return

    this.terminalScheduled = true
    const payload = this.pendingTerminal
    const delivery = this.enqueueDelivery(() => this.sink.complete?.(payload))
    void delivery.finally(() => this.finishTerminal())
  }

  private finishTerminal(): void {
    this.onTerminal(this)
    this.resolveCompleted()
  }

  private enqueueDelivery(operation: () => void | Promise<void> | undefined): Promise<void> {
    const run = async (): Promise<void> => {
      try {
        await operation()
      } catch (error) {
        this.onDeliveryError(error, this)
      }
    }
    const next = this.deliveryTail.then(run, run)
    this.deliveryTail = next
    return next
  }
}

export interface SearchSessionTrace {
  sessionId: string
  caller: Readonly<SearchCallerIdentity>
  query: Readonly<TuffQuery>
  startedAt: number
  cacheKey: string | null
}

const MAX_RETAINED_SESSION_TRACES = 200

export class SearchSessionRegistry {
  private readonly sessions = new Map<string, SearchSession>()
  private readonly completedTraces = new Map<string, SearchSessionTrace>()
  private destroyPromise: Promise<void> | null = null

  constructor(
    private readonly options: {
      onDeliveryError?: (error: unknown, session: SearchSession) => void
    } = {}
  ) {}

  create(options: {
    caller: SearchCallerIdentity
    query: TuffQuery
    activations: readonly IProviderActivate[] | null
    sink?: SearchSink
  }): SearchSession {
    if (this.destroyPromise) {
      throw new Error('Search session registry is shutting down')
    }

    const session = new SearchSession({
      ...options,
      onTerminal: (terminalSession) => {
        this.sessions.delete(terminalSession.id)
        this.completedTraces.set(terminalSession.id, {
          sessionId: terminalSession.id,
          caller: terminalSession.caller,
          query: terminalSession.query,
          startedAt: terminalSession.startedAt,
          cacheKey: terminalSession.cacheKey
        })
        if (this.completedTraces.size > MAX_RETAINED_SESSION_TRACES) {
          const oldest = this.completedTraces.keys().next().value
          if (oldest) this.completedTraces.delete(oldest)
        }
      },
      onDeliveryError: this.options.onDeliveryError
    })
    this.sessions.set(session.id, session)
    return session
  }

  get(sessionId: string): SearchSession | undefined {
    return this.sessions.get(sessionId)
  }

  cancel(sessionId: string, caller?: SearchCallerIdentity): boolean {
    return this.sessions.get(sessionId)?.cancel(caller) ?? false
  }

  getTrace(sessionId: string): SearchSessionTrace | undefined {
    const live = this.sessions.get(sessionId)
    if (live) {
      return {
        sessionId: live.id,
        caller: live.caller,
        query: live.query,
        startedAt: live.startedAt,
        cacheKey: live.cacheKey
      }
    }
    return this.completedTraces.get(sessionId)
  }

  forgetTrace(sessionId: string): void {
    this.completedTraces.delete(sessionId)
  }

  get size(): number {
    return this.sessions.size
  }

  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise

    const sessions = [...this.sessions.values()]
    this.destroyPromise = (async () => {
      for (const session of sessions) session.cancel()
      await Promise.allSettled(sessions.map((session) => session.completed))
      this.sessions.clear()
      this.completedTraces.clear()
    })().finally(() => {
      this.destroyPromise = null
    })
    return this.destroyPromise
  }
}

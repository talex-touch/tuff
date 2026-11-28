const MIN_INTELLIGENCE_STREAM_TIMEOUT_MS = 5_000
const MAX_INTELLIGENCE_STREAM_TIMEOUT_MS = 120_000
const DEFAULT_INTELLIGENCE_STREAM_TIMEOUT_MS = 30_000

export interface IntelligenceStreamTimeoutErrorOptions {
  phase: string
  timeoutMs: number
}

export class IntelligenceStreamTimeoutError extends Error {
  readonly code = 'INTELLIGENCE_STREAM_TIMEOUT' as const
  readonly phase: string
  readonly timeoutMs: number

  constructor(options: IntelligenceStreamTimeoutErrorOptions) {
    super(`Intelligence stream timed out during ${options.phase} after ${options.timeoutMs}ms.`)
    this.name = 'IntelligenceStreamTimeoutError'
    this.phase = options.phase
    this.timeoutMs = options.timeoutMs
  }
}

export function resolveIntelligenceStreamTimeoutMs(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : DEFAULT_INTELLIGENCE_STREAM_TIMEOUT_MS
  return Math.min(Math.max(numeric, MIN_INTELLIGENCE_STREAM_TIMEOUT_MS), MAX_INTELLIGENCE_STREAM_TIMEOUT_MS)
}

export async function withIntelligenceStreamTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  phase: string,
): Promise<T> {
  const boundedTimeoutMs = resolveIntelligenceStreamTimeoutMs(timeoutMs)
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new IntelligenceStreamTimeoutError({
        phase,
        timeoutMs: boundedTimeoutMs,
      }))
    }, boundedTimeoutMs)

    void Promise.resolve(promise).then(
      () => clearTimeout(timer),
      () => clearTimeout(timer),
    )
  })

  return await Promise.race([
    promise,
    timeoutPromise,
  ])
}

export async function* iterateWithIntelligenceStreamTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
  phase: string,
): AsyncIterable<T> {
  const boundedTimeoutMs = resolveIntelligenceStreamTimeoutMs(timeoutMs)
  const iterator = iterable[Symbol.asyncIterator]()

  while (true) {
    const result = await withIntelligenceStreamTimeout(
      iterator.next(),
      boundedTimeoutMs,
      phase,
    )
    if (result.done) {
      return
    }
    yield result.value
  }
}

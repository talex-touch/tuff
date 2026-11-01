import type { Clock } from './clock'
import { RunAbort } from './errors'

export type AbortMode = 'graceful' | 'immediate'

export interface AbortState {
  /** Aborted at the first request: no more scenarios are released. */
  readonly stop: AbortSignal
  /** Aborted at once for an immediate request, or when the grace after a graceful one is over: in-flight work is cut. */
  readonly hard: AbortSignal
  /** Why the run ends early; the first request wins. */
  cause: () => RunAbort | null
  request: (reason: RunAbort, mode?: AbortMode) => void
  dispose: () => void
}

/** One place that every reason to end early passes through: the user's signal, the watchdog, a failed driver. */
export function createAbortState(
  external: AbortSignal | undefined,
  clock: Clock,
  graceMs: number
): AbortState {
  const stop = new AbortController()
  const hard = new AbortController()
  const state = { cause: null as RunAbort | null, graceStarted: false }

  const request = (reason: RunAbort, mode: AbortMode = 'graceful'): void => {
    state.cause ??= reason
    if (!stop.signal.aborted) stop.abort()
    if (mode === 'immediate') hard.abort()
    else if (!state.graceStarted) {
      state.graceStarted = true
      void clock.sleep(graceMs, hard.signal).then(() => hard.abort())
    }
  }

  const onExternal = (): void =>
    request(
      new RunAbort(
        'interrupted',
        `the run was stopped on request (${String(external?.reason ?? 'signal')})`
      )
    )
  if (external?.aborted) onExternal()
  else external?.addEventListener('abort', onExternal, { once: true })

  return {
    stop: stop.signal,
    hard: hard.signal,
    cause: () => state.cause,
    request,
    dispose: () => {
      external?.removeEventListener('abort', onExternal)
      hard.abort()
    }
  }
}

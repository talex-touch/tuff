import type { Clock } from './clock'
import { RunAbort } from './errors'
import type { Pacer } from './pacing'

export type ItemState = 'pending' | 'running' | 'ok' | 'failed' | 'blocked'

export interface Schedulable {
  id: string
  requires?: readonly string[]
}

export interface PhaseOptions<T extends Schedulable> {
  clock: Clock
  pacer: Pacer
  signal: AbortSignal
  /** Shared by every phase of a run: a scenario of the burst may require one of the steady phase. */
  states: Map<string, ItemState>
  /** Resolves true when the item's filesystem steps completed; rejects only to end the run. */
  execute: (item: T) => Promise<boolean>
  /** The item will not run: a scenario it requires failed or is not there. */
  block: (item: T, reason: string) => Promise<void> | void
  /** Called once with the first error `execute` rejected with, so the caller can cancel the other items in flight. */
  fail: (error: unknown) => void
  onSettled?: (item: T, state: 'ok' | 'failed' | 'blocked') => void
  tickMs?: number
}

type Readiness = { kind: 'ready' } | { kind: 'wait' } | { kind: 'blocked'; reason: string }

function readiness(item: Schedulable, states: Map<string, ItemState>): Readiness {
  let waiting = false
  for (const id of item.requires ?? []) {
    const state = states.get(id)
    if (state === undefined)
      return { kind: 'blocked', reason: `required scenario ${id} is not part of this run` }
    if (state === 'failed')
      return { kind: 'blocked', reason: `required scenario ${id} did not complete its steps` }
    if (state === 'blocked')
      return { kind: 'blocked', reason: `required scenario ${id} was skipped` }
    if (state === 'pending' || state === 'running') waiting = true
  }
  return waiting ? { kind: 'wait' } : { kind: 'ready' }
}

/**
 * Releases the items in plan order, at most `pacer.limit()` at a time. An item whose required
 * scenarios have not finished waits without holding up the ones behind it.
 */
export async function runPhase<T extends Schedulable>(
  items: readonly T[],
  options: PhaseOptions<T>
): Promise<void> {
  const { clock, pacer, signal, states } = options
  const tickMs = options.tickMs ?? 250
  const queue = items
  let head = 0
  const waiting: T[] = []
  const inflight = new Map<string, Promise<void>>()
  const failure = { error: undefined as unknown }
  let failed = false

  const settle = async (item: T, state: 'blocked', reason: string): Promise<void> => {
    states.set(item.id, state)
    await options.block(item, reason)
    options.onSettled?.(item, state)
  }

  const release = (item: T): void => {
    states.set(item.id, 'running')
    const run = (async (): Promise<void> => {
      try {
        const ok = await options.execute(item)
        const state = ok ? 'ok' : 'failed'
        states.set(item.id, state)
        options.onSettled?.(item, state)
      } catch (error) {
        states.set(item.id, 'pending')
        if (!failed) {
          failed = true
          failure.error = error
          options.fail(error)
        }
      } finally {
        inflight.delete(item.id)
      }
    })()
    inflight.set(item.id, run)
  }

  for (const item of items) if (!states.has(item.id)) states.set(item.id, 'pending')

  for (;;) {
    if (failed || signal.aborted) break
    pacer.update()
    let progressed = false

    for (let index = 0; index < waiting.length; ) {
      const item = waiting[index]
      const state = readiness(item, states)
      if (state.kind === 'blocked') {
        waiting.splice(index, 1)
        await settle(item, 'blocked', state.reason)
        progressed = true
      } else if (state.kind === 'ready' && inflight.size < pacer.limit()) {
        waiting.splice(index, 1)
        release(item)
        progressed = true
      } else {
        index += 1
      }
    }

    while (head < queue.length && inflight.size < pacer.limit()) {
      const item = queue[head]
      head += 1
      progressed = true
      const state = readiness(item, states)
      if (state.kind === 'blocked') await settle(item, 'blocked', state.reason)
      else if (state.kind === 'wait') waiting.push(item)
      else release(item)
    }

    if (head >= queue.length && inflight.size === 0) {
      if (waiting.length === 0) break
      if (!progressed) {
        for (const item of waiting.splice(0)) {
          const stuck = (item.requires ?? []).find(
            (id) => states.get(id) === 'pending' || states.get(id) === 'running'
          )
          await settle(
            item,
            'blocked',
            `required scenario ${stuck ?? '?'} did not run before this phase ended`
          )
        }
        break
      }
    }
    if (progressed) continue

    const wake = new AbortController()
    await Promise.race([...inflight.values(), clock.sleep(tickMs, wake.signal)])
    wake.abort()
  }

  await Promise.all(inflight.values())
  if (failed) throw failure.error
  if (signal.aborted && (head < queue.length || waiting.length > 0))
    throw new RunAbort('aborted', 'run aborted')
}

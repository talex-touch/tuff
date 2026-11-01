import { describe, expect, it } from 'vitest'
import { createAbortState } from './abort-state'
import { realClock } from './clock'
import { RunAbort } from './errors'

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('createAbortState', () => {
  it('stops releasing at once and cuts in-flight work after the grace', async () => {
    const external = new AbortController()
    const state = createAbortState(external.signal, realClock, 40)
    external.abort('SIGINT')
    expect(state.stop.aborted).toBe(true)
    expect(state.hard.aborted).toBe(false)
    expect(state.cause()).toMatchObject({ reason: 'interrupted' })
    expect(state.cause()?.message).toContain('SIGINT')
    await wait(80)
    expect(state.hard.aborted).toBe(true)
    state.dispose()
  })

  it('cuts everything for an immediate request, and the first reason stays', () => {
    const state = createAbortState(undefined, realClock, 60_000)
    state.request(new RunAbort('driver-unhealthy', 'too many failed searches'), 'immediate')
    state.request(new RunAbort('interrupted', 'later'))
    expect(state.stop.aborted && state.hard.aborted).toBe(true)
    expect(state.cause()?.reason).toBe('driver-unhealthy')
    state.dispose()
  })

  it('treats a signal that is already aborted as a request', () => {
    const external = new AbortController()
    external.abort()
    const state = createAbortState(external.signal, realClock, 60_000)
    expect(state.stop.aborted).toBe(true)
    expect(state.cause()?.reason).toBe('interrupted')
    state.dispose()
  })

  it('does not end the run on its own, and dispose cancels a pending grace', async () => {
    const state = createAbortState(undefined, realClock, 10)
    await wait(30)
    expect(state.stop.aborted).toBe(false)
    expect(state.cause()).toBeNull()
    state.request(new RunAbort('interrupted', 'x'))
    state.dispose()
    expect(state.hard.aborted).toBe(true)
  })
})

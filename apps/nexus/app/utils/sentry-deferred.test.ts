import { describe, expect, it, vi } from 'vitest'
import { ERROR_BUFFER_LIMIT, installErrorBuffer, scheduleAfterIdle } from './sentry-deferred'

function createTarget() {
  const listeners = new Map<string, Set<(event: any) => void>>()
  return {
    listeners,
    addEventListener(type: string, listener: (event: any) => void) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener))
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners.get(type)?.delete(listener)
    },
    emit(type: string, event: any) {
      for (const listener of listeners.get(type) ?? [])
        listener(event)
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    },
  }
}

describe('deferred Sentry error buffer', () => {
  it('buffers errors and rejections raised before the SDK loads and flushes them in order', () => {
    const target = createTarget()
    const buffer = installErrorBuffer(target)
    const first = new Error('first')
    const second = new Error('second')

    target.emit('error', { error: first })
    target.emit('unhandledrejection', { reason: second })
    expect(buffer.size).toBe(2)

    const capture = vi.fn()
    expect(buffer.flush(capture)).toBe(2)
    expect(capture.mock.calls).toEqual([
      [first, { kind: 'error' }],
      [second, { kind: 'unhandledrejection' }],
    ])
    expect(buffer.size).toBe(0)
  })

  it('stops listening once flushed so nothing is captured twice', () => {
    const target = createTarget()
    const buffer = installErrorBuffer(target)
    buffer.flush(() => {})

    expect(target.count()).toBe(0)
    target.emit('error', { error: new Error('late') })
    expect(buffer.size).toBe(0)
  })

  it('caps the buffer and reports how many were dropped', () => {
    const target = createTarget()
    const buffer = installErrorBuffer(target, 2)
    for (let index = 0; index < 5; index += 1)
      target.emit('error', { error: new Error(`e${index}`) })

    const capture = vi.fn()
    expect(buffer.flush(capture)).toBe(3)
    expect(capture).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: 'e0' }), { kind: 'error' })
    expect(capture).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'e1' }), { kind: 'error' })
    expect(capture).toHaveBeenNthCalledWith(3, expect.objectContaining({ message: '3 earlier error(s) were dropped before Sentry loaded' }), { kind: 'error' })
    expect(ERROR_BUFFER_LIMIT).toBeGreaterThan(2)
  })

  it('falls back to the message when an ErrorEvent carries no error object', () => {
    const target = createTarget()
    const buffer = installErrorBuffer(target)
    target.emit('error', { message: 'Script error.' })

    const capture = vi.fn()
    buffer.flush(capture)
    expect(capture).toHaveBeenCalledWith('Script error.', { kind: 'error' })
  })

  it('dispose removes the listeners without capturing anything', () => {
    const target = createTarget()
    const buffer = installErrorBuffer(target)
    target.emit('error', { error: new Error('gone') })
    buffer.dispose()

    expect(target.count()).toBe(0)
    expect(buffer.size).toBe(0)
  })
})

describe('scheduleAfterIdle', () => {
  it('prefers requestIdleCallback with the timeout and falls back to setTimeout', () => {
    const task = () => {}
    const requestIdleCallback = vi.fn()
    const setTimeout = vi.fn()

    scheduleAfterIdle(task, 1500, { requestIdleCallback, setTimeout })
    expect(requestIdleCallback).toHaveBeenCalledWith(task, { timeout: 1500 })
    expect(setTimeout).not.toHaveBeenCalled()

    scheduleAfterIdle(task, 1500, { setTimeout })
    expect(setTimeout).toHaveBeenCalledWith(task, 1500)
  })
})

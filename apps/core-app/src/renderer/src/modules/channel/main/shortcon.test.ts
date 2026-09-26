import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  shortconChangedEvent,
  shortconGetBindingEvent
} from '../../../../../shared/events/shortcut-binding'

const transport = vi.hoisted(() => ({
  send: vi.fn<(event: unknown, payload?: unknown) => Promise<unknown>>(async () => ({
    configured: 'Alt+Space',
    effective: 'Alt+Space'
  })),
  on: vi.fn<(event: unknown, handler: () => void) => () => void>(() => () => {})
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => transport
}))

import { shortconApi } from './shortcon'

/**
 * The binding query and its change push are answered by the shortcut module in the main process.
 * Both sides must hold the same event objects: a copy redefined here compiles into another bundle,
 * and a name that drifts in one of them surfaces only at runtime, as `No handler registered`.
 */
describe('shortconApi binding surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks for a binding with the event the main process answers', async () => {
    await expect(shortconApi.getBinding('core.box.toggle')).resolves.toEqual({
      configured: 'Alt+Space',
      effective: 'Alt+Space'
    })

    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(transport.send.mock.calls[0]?.[0]).toBe(shortconGetBindingEvent)
    expect(transport.send.mock.calls[0]?.[1]).toEqual({ id: 'core.box.toggle' })
  })

  it('listens for the event the main process broadcasts', () => {
    const handler = vi.fn()
    shortconApi.onChanged(handler)

    expect(transport.on).toHaveBeenCalledTimes(1)
    expect(transport.on.mock.calls[0]?.[0]).toBe(shortconChangedEvent)
    transport.on.mock.calls[0]?.[1]?.()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

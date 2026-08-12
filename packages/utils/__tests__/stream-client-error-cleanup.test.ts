import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '../transport/events'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'

/**
 * A main-process handler may report failure by emitting `{ error }` on the *data* channel
 * rather than the dedicated error channel. That path reported the error and returned without
 * calling cleanup(), so the controller stayed registered and the data/end/error listeners for
 * that streamId stayed attached forever -- one controller and three listeners leaked per
 * failed stream (#884).
 *
 * The channel mock's regChannel returns an unregister that deletes from `handlers`, so the map
 * size is a direct measure of what is still attached.
 */

const portChannelsEnv = 'TALEX_TRANSPORT_PORT_CHANNELS'

function createChannel() {
  const handlers = new Map<string, (raw: unknown) => void>()
  return {
    handlers,
    channel: {
      async send() {
        return undefined
      },
      regChannel(eventName: string, handler: (raw: unknown) => void) {
        handlers.set(eventName, handler)
        return () => {
          handlers.delete(eventName)
        }
      },
    },
  }
}

describe('stream client error cleanup', () => {
  let originalPortChannels: string | undefined

  beforeEach(() => {
    // Keep this on the plain channel path; the MessagePort path already cleaned up correctly.
    originalPortChannels = process.env[portChannelsEnv]
    delete process.env[portChannelsEnv]
  })

  afterEach(() => {
    if (originalPortChannels === undefined) {
      delete process.env[portChannelsEnv]
    }
    else {
      process.env[portChannelsEnv] = originalPortChannels
    }
  })

  async function startStream() {
    const { channel, handlers } = createChannel()
    const transport = createPluginTuffTransport(channel as any)
    const onError = vi.fn()
    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: () => {},
      onError,
    })

    return {
      handlers,
      onError,
      eventName: ClipboardEvents.change.toEventName(),
      streamId: controller.streamId,
    }
  }

  it('registers exactly the three stream channels to begin with', async () => {
    const { handlers } = await startStream()

    // Positive control: if the stream never attached anything, a later "nothing is attached"
    // assertion would pass for the wrong reason.
    expect(handlers.size).toBe(3)
  })

  it('releases the registrations when an error arrives on the data channel', async () => {
    const { handlers, onError, eventName, streamId } = await startStream()

    handlers.get(`${eventName}:stream:data:${streamId}`)?.({
      header: { status: 'request' },
      data: { error: 'quota exceeded' },
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((onError.mock.calls[0][0] as Error).message).toBe('quota exceeded')
    // The defect: this stayed at 3.
    expect(handlers.size).toBe(0)
  })

  it('still releases the registrations on the dedicated error channel', async () => {
    const { handlers, onError, eventName, streamId } = await startStream()

    handlers.get(`${eventName}:stream:error:${streamId}`)?.({
      header: { status: 'request' },
      data: { error: 'upstream closed' },
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(handlers.size).toBe(0)
  })

  it('still delivers data chunks without tearing the stream down', async () => {
    const { handlers, eventName, streamId } = await startStream()

    handlers.get(`${eventName}:stream:data:${streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { ok: true } },
    })

    // A fix that cleaned up on every data message would break streaming entirely.
    expect(handlers.size).toBe(3)
  })
})

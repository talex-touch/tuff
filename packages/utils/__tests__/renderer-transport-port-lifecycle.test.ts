import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents, TransportEvents } from '../transport/events'
import { installTransportPortHandoff } from '../transport/port-handoff'
import { TuffRendererTransport } from '../transport/sdk/renderer-transport'
import {
  createNativePortPair,
  createPortHandoffHarness,
} from './transport/port-handoff-harness'

let currentChannel: {
  send: (eventName: string, payload?: unknown) => Promise<unknown>
  regChannel: (eventName: string, handler: (raw: unknown) => void) => () => void
}

vi.mock('../renderer/hooks/use-channel', () => ({
  useChannel: () => currentChannel,
}))

/** Mirrors ABANDONED_PORT_MAX_ENTRIES, which the transport keeps module private. */
const ABANDONED_PORT_MAX_ENTRIES = 64
/** Mirrors PORT_CONFIRM_TIMEOUT_MS, the retention window for an unclaimed confirm. */
const PORT_CONFIRM_TIMEOUT_MS = 10000
/** Mirrors STREAM_PORT_TIMEOUT_MS, the budget a stream gives its port handshake. */
const STREAM_PORT_TIMEOUT_MS = 3000

const portChannelsEnv = 'TALEX_TRANSPORT_PORT_CHANNELS'
const channel = ClipboardEvents.change.toEventName()

interface BoundedSet {
  size: number
  has: (portId: string) => boolean
}

interface QueuedConfirm {
  port: { close: () => void }
}

/**
 * Both maps are private on purpose; the leaks they guard against are invisible from
 * the public surface, so the retention bounds have to be asserted directly.
 */
function readAbandonedPorts(transport: TuffRendererTransport): BoundedSet {
  return (transport as unknown as { abandonedPorts: BoundedSet }).abandonedPorts
}

function readQueuedPortConfirms(transport: TuffRendererTransport): Map<string, QueuedConfirm> {
  return (transport as unknown as { queuedPortConfirms: Map<string, QueuedConfirm> })
    .queuedPortConfirms
}

/** Lets the harness' real MessageChannel deliver a transferred port. */
async function flushPortDelivery(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise(resolve => setImmediate(resolve))
  }
}

describe('renderer transport port lifecycle', () => {
  let originalWindow: PropertyDescriptor | undefined
  let originalPortChannels: string | undefined
  let sent: Array<{ eventName: string, payload: unknown }>
  let onSend: ((eventName: string, payload: unknown) => unknown) | undefined
  let cleanups: Array<() => void>

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    originalPortChannels = process.env[portChannelsEnv]
    process.env[portChannelsEnv] = channel
    sent = []
    onSend = undefined
    cleanups = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    currentChannel = {
      async send(eventName, payload) {
        sent.push({ eventName, payload })
        return await onSend?.(eventName, payload)
      },
      regChannel() {
        return () => {}
      },
    }
  })

  afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup())
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    }
    else {
      delete (globalThis as { window?: Window }).window
    }
    if (originalPortChannels === undefined) {
      delete process.env[portChannelsEnv]
    }
    else {
      process.env[portChannelsEnv] = originalPortChannels
    }
  })

  function createTransport(): { transport: TuffRendererTransport, harness: ReturnType<typeof createPortHandoffHarness> } {
    const harness = createPortHandoffHarness()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: harness.targetWindow,
      writable: true,
    })
    const transport = new TuffRendererTransport()
    cleanups.push(harness.dispose, () => transport.destroy())
    return { transport, harness }
  }

  it('gives a stream port a budget that survives startup contention', async () => {
    const { transport } = createTransport()
    const openPort = vi.spyOn(transport, 'openPort').mockResolvedValue(null)

    await transport.stream(ClipboardEvents.change, undefined, { onData: () => {} })

    expect(openPort).toHaveBeenCalledTimes(1)
    expect(openPort.mock.calls[0][0]).toMatchObject({
      channel,
      force: true,
      timeoutMs: STREAM_PORT_TIMEOUT_MS,
    })
  })

  it('bounds abandoned port ids and evicts the oldest rather than the newest', async () => {
    const { transport } = createTransport()

    let minted = 0
    onSend = (eventName) => {
      if (eventName === TransportEvents.port.upgrade.toEventName()) {
        minted += 1
        return { accepted: true, channel, portId: `abandoned-${minted}` }
      }
      return undefined
    }

    const attempts = ABANDONED_PORT_MAX_ENTRIES * 3
    for (let i = 0; i < attempts; i += 1) {
      expect(await transport.openPort({ channel, force: true, timeoutMs: 0 })).toBeNull()
    }

    const abandoned = readAbandonedPorts(transport)
    expect(abandoned.size).toBe(ABANDONED_PORT_MAX_ENTRIES)
    expect(abandoned.has(`abandoned-${attempts}`)).toBe(true)
    expect(abandoned.has('abandoned-1')).toBe(false)
  })

  it('releases a queued confirm that no opener ever claims', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { transport, harness } = createTransport()
    cleanups.push(installTransportPortHandoff(harness.ipcRenderer, harness.targetWindow))

    // Install the handoff listener through the public API without minting a port.
    onSend = () => ({ accepted: false, channel })
    expect(await transport.openPort({ channel })).toBeNull()

    const pair = createNativePortPair()
    cleanups.push(() => pair.sender.close())
    onSend = undefined
    sent.length = 0

    harness.emit(
      TransportEvents.port.confirm.toEventName(),
      { channel, portId: 'orphan-port', scope: 'window' },
      [pair.receiver],
    )
    await flushPortDelivery()

    const queued = readQueuedPortConfirms(transport)
    expect(queued.size).toBe(1)
    const close = vi.spyOn(queued.get('orphan-port')!.port, 'close')

    vi.advanceTimersByTime(PORT_CONFIRM_TIMEOUT_MS)
    await flushPortDelivery()

    expect(close).toHaveBeenCalledTimes(1)
    expect(queued.size).toBe(0)
    expect(sent).toContainEqual({
      eventName: TransportEvents.port.close.toEventName(),
      payload: { channel, portId: 'orphan-port', reason: 'confirm_unclaimed' },
    })
  })

  it('does not orphan a transferred port when the upgrade round-trip rejects', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { transport, harness } = createTransport()
    cleanups.push(installTransportPortHandoff(harness.ipcRenderer, harness.targetWindow))

    const pair = createNativePortPair()
    cleanups.push(() => pair.sender.close())

    onSend = (eventName) => {
      if (eventName === TransportEvents.port.upgrade.toEventName()) {
        // Main minted and transferred the port before the reply failed, so the
        // renderer never learns the portId it has to release.
        harness.emit(
          TransportEvents.port.confirm.toEventName(),
          { channel, portId: 'rejected-upgrade-port', scope: 'window' },
          [pair.receiver],
        )
        throw new Error('upgrade delivery failed')
      }
      return undefined
    }

    expect(await transport.openPort({ channel, force: true })).toBeNull()
    await flushPortDelivery()

    const queued = readQueuedPortConfirms(transport)
    expect(queued.size).toBe(1)
    const close = vi.spyOn(queued.get('rejected-upgrade-port')!.port, 'close')

    vi.advanceTimersByTime(PORT_CONFIRM_TIMEOUT_MS)
    await flushPortDelivery()

    expect(close).toHaveBeenCalledTimes(1)
    expect(queued.size).toBe(0)
    expect(sent).toContainEqual({
      eventName: TransportEvents.port.close.toEventName(),
      payload: { channel, portId: 'rejected-upgrade-port', reason: 'confirm_unclaimed' },
    })
  })
})

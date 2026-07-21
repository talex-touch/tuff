import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClipboardEvents, TransportEvents } from '../transport/events'
import { installTransportPortHandoff } from '../transport/port-handoff'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'
import {
  createNativePortPair,
  createPortHandoffHarness,
} from './transport/port-handoff-harness'

describe('TuffPluginTransport.stream', () => {
  const portChannelsEnv = 'TALEX_TRANSPORT_PORT_CHANNELS'
  let originalWindow: PropertyDescriptor | undefined
  let originalPortChannels: string | undefined
  let testCleanups: Array<() => void>

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    originalPortChannels = process.env[portChannelsEnv]
    process.env[portChannelsEnv] = ClipboardEvents.change.toEventName()
    testCleanups = []
  })

  afterEach(() => {
    testCleanups.splice(0).forEach(cleanup => cleanup())
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

  function createChannel() {
    const handlers = new Map<string, (raw: unknown) => void>()
    const sent: Array<{ eventName: string, payload: unknown }> = []
    let onSend: ((eventName: string, payload: unknown) => unknown) | undefined
    const channel = {
      async send(eventName: string, payload?: unknown) {
        sent.push({ eventName, payload })
        return await onSend?.(eventName, payload)
      },
      regChannel(eventName: string, handler: (raw: unknown) => void) {
        handlers.set(eventName, handler)
        return () => {
          handlers.delete(eventName)
        }
      },
    }

    return {
      channel,
      handlers,
      sent,
      setOnSend(handler: (eventName: string, payload: unknown) => unknown) {
        onSend = handler
      },
    }
  }

  it('receives session and snapshot once through the preloaded port handoff and acknowledges confirmation', async () => {
    const harness = createPortHandoffHarness()
    const disposeHandoff = installTransportPortHandoff(
      harness.ipcRenderer,
      harness.targetWindow,
    )
    const pair = createNativePortPair()
    const { channel, handlers, sent, setOnSend } = createChannel()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: harness.targetWindow,
      writable: true,
    })
    testCleanups.push(() => pair.sender.close(), harness.dispose, disposeHandoff)

    const eventName = ClipboardEvents.change.toEventName()
    const portId = 'plugin-port-1'
    setOnSend(sentEventName => {
      if (sentEventName === TransportEvents.port.upgrade.toEventName()) {
        harness.emit(
          TransportEvents.port.confirm.toEventName(),
          { channel: eventName, portId, scope: 'window' },
          [pair.receiver],
        )
        return { accepted: true, channel: eventName, portId }
      }
      return undefined
    })

    const transport = createPluginTuffTransport(channel)
    const chunks: unknown[] = []
    let endCount = 0
    let streamId = ''
    let resolveTerminal!: () => void
    const terminal = new Promise<void>(resolve => {
      resolveTerminal = resolve
    })
    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => {
        chunks.push(chunk)
        handlers.get(`${eventName}:stream:data:${streamId}`)?.({
          header: { status: 'request' },
          data: { chunk: { source: 'channel-duplicate' } },
        })
      },
      onEnd: () => {
        endCount += 1
        resolveTerminal()
      },
    })
    streamId = controller.streamId

    pair.sender.postMessage({
      channel: eventName,
      portId,
      streamId,
      type: 'data',
      payload: { chunk: { phase: 'session' } },
    })
    pair.sender.postMessage({
      channel: eventName,
      portId,
      streamId,
      type: 'data',
      payload: { chunk: { phase: 'snapshot' } },
    })
    pair.sender.postMessage({ channel: eventName, portId, streamId, type: 'end' })

    await terminal
    expect(chunks).toEqual([{ phase: 'session' }, { phase: 'snapshot' }])
    expect(endCount).toBe(1)
    expect(sent).toContainEqual({
      eventName: TransportEvents.port.confirm.toEventName(),
      payload: { channel: eventName, portId, scope: 'window' },
    })
    expect(sent).toContainEqual({
      eventName: `${eventName}:stream:start`,
      payload: { streamId, __transportPortId: portId },
    })
  })

  it('delivers channel data and terminal when port transport is explicitly disabled', async () => {
    const { channel, handlers, sent } = createChannel()
    const transport = createPluginTuffTransport(channel)
    const eventName = ClipboardEvents.change.toEventName()
    const chunks: unknown[] = []
    let endCount = 0

    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => chunks.push(chunk),
      onEnd: () => {
        endCount += 1
      },
      port: false,
    })

    handlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { phase: 'channel-snapshot' } },
    })
    handlers.get(`${eventName}:stream:end:${controller.streamId}`)?.({})

    expect(chunks).toEqual([{ phase: 'channel-snapshot' }])
    expect(endCount).toBe(1)
    expect(sent).toEqual([
      {
        eventName: `${eventName}:stream:start`,
        payload: { streamId: controller.streamId },
      },
    ])
  })
})

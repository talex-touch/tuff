import { afterEach, describe, expect, it } from 'vitest'
import { TransportEvents } from '../transport/events'
import {
  installTransportPortHandoff,
  isTransportPortConfirmPayload,
  isTransportPortHandoffMessage,
  subscribeTransportPortHandoff,
  TRANSPORT_PORT_HANDOFF_MARKER,
} from '../transport/port-handoff'
import {
  createNativePortPair,
  createPortHandoffHarness,
  toWindowTransferable,
  waitForPortClose,
} from './transport/port-handoff-harness'

const confirmEventName = TransportEvents.port.confirm.toEventName()
const confirmPayload = {
  channel: 'core-box:search:session',
  portId: 'handoff-port-1',
  scope: 'window' as const,
  permissions: ['core-box:read'],
}

const cleanups: Array<() => void> = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

describe('transport port handoff', () => {
  it('moves one verified Electron port to the same window through structured transfer', async () => {
    const harness = createPortHandoffHarness()
    const pair = createNativePortPair()
    const received = new Promise<{ payload: unknown, port: MessagePort }>((resolve) => {
      const unsubscribe = subscribeTransportPortHandoff((port, payload) => {
        resolve({ payload, port })
      }, harness.targetWindow)
      cleanups.push(() => unsubscribe?.())
    })
    const dispose = installTransportPortHandoff(harness.ipcRenderer, harness.targetWindow)
    cleanups.push(dispose, harness.dispose, () => pair.sender.close())

    harness.emit(confirmEventName, confirmPayload, [pair.receiver])

    const handoff = await received
    expect(handoff.payload).toEqual(confirmPayload)
    expect(harness.postedMessages).toEqual([
      { marker: TRANSPORT_PORT_HANDOFF_MARKER, payload: confirmPayload },
    ])

    const message = new Promise<unknown>((resolve) => {
      handoff.port.addEventListener('message', event => resolve(event.data), { once: true })
      handoff.port.start()
    })
    pair.sender.postMessage({ phase: 'session' })

    expect(await message).toEqual({ phase: 'session' })
    handoff.port.close()
  })

  it('accepts only the fixed marker and a valid typed confirm payload', () => {
    expect(isTransportPortConfirmPayload(confirmPayload)).toBe(true)
    expect(isTransportPortConfirmPayload({ channel: '', portId: 'port-1' })).toBe(false)
    expect(isTransportPortConfirmPayload({ channel: 'core-box:search:session', portId: '' })).toBe(false)
    expect(isTransportPortConfirmPayload({ channel: 'core-box:search:session', portId: 'port-1', scope: 'other' })).toBe(false)
    expect(isTransportPortHandoffMessage({ marker: TRANSPORT_PORT_HANDOFF_MARKER, payload: confirmPayload })).toBe(true)
    expect(isTransportPortHandoffMessage({ marker: 'forged-marker', payload: confirmPayload })).toBe(false)
  })

  it('ignores foreign or forged window messages and closes invalid transferred ports', async () => {
    const harness = createPortHandoffHarness()
    const deliveries: unknown[] = []
    const unsubscribe = subscribeTransportPortHandoff((port, payload) => {
      deliveries.push({ port, payload })
    }, harness.targetWindow)
    cleanups.push(() => unsubscribe?.(), harness.dispose)

    harness.dispatchFrom({}, { marker: TRANSPORT_PORT_HANDOFF_MARKER, payload: confirmPayload })
    harness.dispatchFrom(harness.targetWindow, { marker: 'forged-marker', payload: confirmPayload })

    const invalidPayload = createNativePortPair()
    const invalidPayloadClosed = waitForPortClose(invalidPayload.sender)
    harness.targetWindow.postMessage(
      { marker: TRANSPORT_PORT_HANDOFF_MARKER, payload: { channel: '', portId: 'invalid' } },
      '*',
      [toWindowTransferable(invalidPayload.receiver)],
    )

    const first = createNativePortPair()
    const second = createNativePortPair()
    const multipleClosed = Promise.all([
      waitForPortClose(first.sender),
      waitForPortClose(second.sender),
    ])
    harness.targetWindow.postMessage(
      { marker: TRANSPORT_PORT_HANDOFF_MARKER, payload: confirmPayload },
      '*',
      [
        toWindowTransferable(first.receiver),
        toWindowTransferable(second.receiver),
      ],
    )

    await Promise.all([invalidPayloadClosed, multipleClosed])
    expect(deliveries).toEqual([])
  })

  it('closes malformed Electron ports, stops forwarding after disposal, and closes a port when window delivery fails', async () => {
    const harness = createPortHandoffHarness()
    const dispose = installTransportPortHandoff(harness.ipcRenderer, harness.targetWindow)
    cleanups.push(harness.dispose)

    const malformed = createNativePortPair()
    const malformedClosed = waitForPortClose(malformed.sender)
    harness.emit(confirmEventName, { channel: '', portId: 'malformed' }, [malformed.receiver])
    await malformedClosed
    expect(harness.postedMessages).toEqual([])

    const forwarded = createNativePortPair()
    harness.emit(confirmEventName, confirmPayload, [forwarded.receiver])
    expect(harness.postedMessages).toHaveLength(1)

    dispose()
    const afterDispose = createNativePortPair()
    harness.emit(confirmEventName, confirmPayload, [afterDispose.receiver])
    expect(harness.postedMessages).toHaveLength(1)
    afterDispose.receiver.close()
    afterDispose.sender.close()

    const failingHarness = createPortHandoffHarness({ throwOnPostMessage: true })
    const failingDispose = installTransportPortHandoff(failingHarness.ipcRenderer, failingHarness.targetWindow)
    const failing = createNativePortPair()
    const failingClosed = waitForPortClose(failing.sender)
    failingHarness.emit(confirmEventName, confirmPayload, [failing.receiver])

    await failingClosed
    failingDispose()
    failingHarness.dispose()
    forwarded.sender.close()
  })
})

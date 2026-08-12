import { describe, expect, it } from 'vitest'
import { TransportEvents } from '../../transport/events'
import { installTransportPortHandoff } from '../../transport/port-handoff'
import { createNativePortPair, createPortHandoffHarness } from './port-handoff-harness'

/**
 * The transferred port carries the privileged streaming transport. It used to be
 * posted into the page world with '*' as targetOrigin, and the receiving side only
 * checks `event.source === targetWindow` — which any script running in the page
 * satisfies. An injected script could therefore take the port and keep it for the
 * lifetime of the page (#694).
 */

const CONFIRM_EVENT = TransportEvents.port.confirm.toEventName()

function handoff(location?: Pick<Location, 'origin' | 'protocol'>) {
  const harness = createPortHandoffHarness({ location })
  const dispose = installTransportPortHandoff(harness.ipcRenderer as never, harness.targetWindow)
  const pair = createNativePortPair()
  harness.emit(CONFIRM_EVENT, { channel: 'test-channel', portId: 'test-port', scope: 'window' }, [pair.receiver])
  dispose()
  return harness.postedTargetOrigins
}

describe('transport port handoff targetOrigin', () => {
  it('posts to the page origin rather than any origin', () => {
    expect(handoff({ origin: 'https://app.example', protocol: 'https:' })).toEqual([
      'https://app.example',
    ])
  })

  it('uses file:// for a file page, whose origin serialises as the string null', () => {
    // An opaque origin has no usable specific targetOrigin, which is why the app
    // preload already special-cases this rather than posting the literal 'null'.
    expect(handoff({ origin: 'null', protocol: 'file:' })).toEqual(['file://'])
  })

  it('falls back to * only for an opaque origin that is not file:', () => {
    // No worse than the previous behaviour for this case, and it is the only
    // remaining one — every real origin now gets a specific target.
    expect(handoff({ origin: 'null', protocol: 'blob:' })).toEqual(['*'])
  })

  it('still delivers the port', () => {
    // Control: the origin must not be tightened into a delivery failure.
    const harness = createPortHandoffHarness({
      location: { origin: 'https://app.example', protocol: 'https:' },
    })
    const dispose = installTransportPortHandoff(harness.ipcRenderer as never, harness.targetWindow)
    const pair = createNativePortPair()

    harness.emit(CONFIRM_EVENT, { channel: 'test-channel', portId: 'test-port', scope: 'window' }, [pair.receiver])

    expect(harness.postedMessages).toHaveLength(1)
    dispose()
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_HOST_CONTROL_PORT_HANDOFF,
  takePluginHostControlPort
} from './plugin-host-bootstrap'

function controlPort(overrides: Record<string, unknown> = {}) {
  return {
    postMessage: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    ...overrides
  }
}

describe('plugin host control-port handoff', () => {
  it('returns the one exact valid transferred port without closing it', () => {
    const port = controlPort()

    expect(
      takePluginHostControlPort({
        data: PLUGIN_HOST_CONTROL_PORT_HANDOFF,
        ports: [port]
      })
    ).toBe(port)
    expect(port.close).not.toHaveBeenCalled()
  })

  it('closes every transferred port on a wrong marker or multiple-port handoff', () => {
    const wrongMarker = controlPort()
    expect(takePluginHostControlPort({ data: 'wrong', ports: [wrongMarker] })).toBeNull()
    expect(wrongMarker.close).toHaveBeenCalledTimes(1)

    const first = controlPort()
    const second = controlPort()
    expect(
      takePluginHostControlPort({
        data: PLUGIN_HOST_CONTROL_PORT_HANDOFF,
        ports: [first, second]
      })
    ).toBeNull()
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(second.close).toHaveBeenCalledTimes(1)
  })

  it('closes every transferred port when handoff metadata access throws', () => {
    const first = controlPort()
    const second = controlPort()
    const handoff = { ports: [first, second] } as { data: unknown; ports: unknown[] }
    Object.defineProperty(handoff, 'data', {
      get() {
        throw new Error('invalid native handoff metadata')
      }
    })

    expect(takePluginHostControlPort(handoff)).toBeNull()
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(second.close).toHaveBeenCalledTimes(1)
  })

  it('closes malformed transferred ports and continues cleanup after a close failure', () => {
    const failedClose = controlPort({
      close: vi.fn(() => {
        throw new Error('native close failed')
      })
    })
    const malformed = { close: vi.fn() }

    expect(
      takePluginHostControlPort({
        data: PLUGIN_HOST_CONTROL_PORT_HANDOFF,
        ports: [failedClose, malformed]
      })
    ).toBeNull()
    expect(failedClose.close).toHaveBeenCalledTimes(1)
    expect(malformed.close).toHaveBeenCalledTimes(1)
  })
})

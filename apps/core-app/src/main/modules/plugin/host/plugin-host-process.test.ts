import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLUGIN_HOST_CONTROL_PORT_HANDOFF } from './plugin-host-bootstrap'
import { HOST_PROTOCOL_VERSION, type HostWireMessage } from './plugin-host-wire'

class FakeControlPort {
  readonly sent: HostWireMessage[] = []
  started = false
  closed = false
  private readonly listeners = new Map<string, Set<(event?: { data: unknown }) => void>>()

  postMessage(message: unknown): void {
    this.sent.push(message as HostWireMessage)
  }

  on(event: string, listener: (event?: { data: unknown }) => void): void {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  off(event: string, listener: (event?: { data: unknown }) => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  start(): void {
    this.started = true
  }

  close(): void {
    this.closed = true
  }

  emitMessage(data: unknown): void {
    for (const listener of [...(this.listeners.get('message') ?? [])]) listener({ data })
  }
}

afterEach(() => {
  vi.doUnmock('node:process')
  vi.doUnmock('./plugin-host-child-runtime')
  vi.resetModules()
})

describe('plugin host child process endpoint', () => {
  it('acknowledges heartbeat in the control-port loop without invoking Prelude lifecycle', async () => {
    let acceptPort!: (event: unknown) => void
    const runtimeProcess = {
      parentPort: {
        once: vi.fn((_event: string, listener: (event: unknown) => void) => {
          acceptPort = listener
        })
      },
      once: vi.fn(),
      exit: vi.fn()
    }
    const callLifecycle = vi.fn()
    const runtime = {
      methods: Object.freeze([]),
      callLifecycle,
      callCallback: vi.fn(),
      shutdown: vi.fn()
    }
    class MockPluginHostChildError extends Error {
      constructor(readonly code: string) {
        super(code)
      }
    }

    vi.doMock('node:process', () => ({ default: runtimeProcess }))
    vi.doMock('./plugin-host-child-runtime', () => ({
      PluginHostChildError: MockPluginHostChildError,
      parsePluginHostLoadPayload: vi.fn(() => ({
        callbackLimits: {
          maxCallbacks: 4,
          maxConcurrentCallbacks: 2,
          maxResources: 4
        },
        capabilityManifest: Object.freeze([])
      })),
      loadPluginPrelude: vi.fn(() => runtime)
    }))

    await import('./plugin-host-process')
    const port = new FakeControlPort()
    acceptPort({ data: PLUGIN_HOST_CONTROL_PORT_HANDOFF, ports: [port] })
    expect(port.started).toBe(true)

    const owner = {
      protocolVersion: HOST_PROTOCOL_VERSION,
      activationHandle: 'child-heartbeat-owner',
      hostGeneration: 3
    } as const
    port.emitMessage({
      ...owner,
      type: 'host-init',
      requestId: 1,
      handshakeNonce: 'main-issued-nonce'
    })
    port.emitMessage({ ...owner, type: 'host-load', requestId: 2, payload: null })
    port.emitMessage({ ...owner, type: 'heartbeat', requestId: 3 })

    expect(port.sent).toContainEqual({ ...owner, type: 'heartbeat-result', requestId: 3 })
    expect(callLifecycle).not.toHaveBeenCalled()
    expect(runtimeProcess.exit).not.toHaveBeenCalled()
  })
})

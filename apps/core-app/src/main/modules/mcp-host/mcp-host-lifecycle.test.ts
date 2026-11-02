/**
 * Guards the MCP host listener lifecycle: `stopListener()` must await the
 * previous `handle.close()` before `startListener()` is allowed to rebind.
 *
 * The production fix lives in `index.ts` — the `stopping` promise gate. The
 * contract is observable through the `setPort` event handler: a rebind never
 * starts a new server until the old one is genuinely unbound, which is what keeps
 * the port the user pasted into their client valid.
 *
 * Heavy externals are stubbed — no real token, no real storage, no real socket.
 *
 * Exception: `McpHostModule` is imported statically here (vitest hoists the
 * `vi.mock` calls above it); each test instantiates a fresh one for a clean slate.
 */

import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { McpHostServerHandle, McpHostServerOptions } from './mcp-host-server'
import type { McpHostSettings } from './mcp-host-settings'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_MCP_HOST_SETTINGS } from './mcp-host-settings'
import { McpHostEvents } from '@talex-touch/utils/transport/sdk/domains/mcp-host'
import { McpHostModule } from './index'

/* ------------------------------------------------------------------ */
/* Hoisted mock dependencies                                          */
/* ------------------------------------------------------------------ */

/**
 * `startMcpHostServer` is the only real I/O boundary the lifecycle touches.
 * Each call hands back a handle whose `close()` returns a promise the test
 * controls — that is the seam the race lives on.
 */
const { startMcpHostServer } = vi.hoisted(() => ({
  startMcpHostServer: vi.fn<(options: McpHostServerOptions) => Promise<McpHostServerHandle>>()
}))

/**
 * The mock transport's `on` captures handlers by event name so tests can replay
 * them without a real transport layer. Must be hoisted so the
 * `../../core/runtime-accessor` mock factory can reference it during import.
 */
const { handlers, registerTransportHandler } = vi.hoisted(() => {
  type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown>
  const captured = new Map<string, Handler>()

  function registerTransportHandler(
    event: { toEventName: () => string },
    handler: Handler
  ): () => void {
    captured.set(event.toEventName(), handler)
    return () => captured.delete(event.toEventName())
  }

  return { handlers: captured, registerTransportHandler }
})

vi.mock('electron', () => ({ app: { getPath: () => '/runtime-root' } }))
vi.mock('./mcp-host-server', () => ({ startMcpHostServer }))
vi.mock('../../utils/app-root-path', () => ({
  resolveRuntimeRootPath: () => '/runtime-root'
}))
vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: () => ({
    app: {},
    channel: { keyManager: {} },
    transport: { on: registerTransportHandler }
  })
}))
vi.mock('../storage', () => ({
  getMainConfig: () => ({ ...DEFAULT_MCP_HOST_SETTINGS }),
  saveMainConfigDurable: vi.fn().mockResolvedValue({ success: true, version: 1 }),
  waitForMainStorageReady: vi.fn().mockResolvedValue({ state: 'ready' })
}))
vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: vi.fn().mockResolvedValue('test-token'),
  setSecureStoreValue: vi.fn().mockResolvedValue(true),
  isSecureStoreAvailable: vi.fn().mockReturnValue(true)
}))
vi.mock('../ai/ai-orchestrator-store', () => ({
  aiOrchestratorStore: { listImportedItems: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../tool-gateway', () => ({
  toolGatewayModule: {
    createRegistry: () => new Map(),
    requestConfirmation: vi.fn()
  }
}))
vi.mock('../ai/skill-local-sources', () => ({
  listEnabledLocalSkills: vi.fn().mockResolvedValue([])
}))
vi.mock('../ai/tool-error-projection', () => ({
  describeToolFailure: vi.fn(() => 'detail=stub'),
  formatStableToolError: vi.fn((e: unknown) => String(e)),
  projectToolError: vi.fn()
}))

/* ------------------------------------------------------------------ */
/* Handle + module fixtures                                           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- private fields need bracket access
type AnyModule = Record<string, any>

/** A handle whose `close()` resolves only when `releaseClose()` is called. */
interface ControllableHandle extends McpHostServerHandle {
  releaseClose: () => void
}

interface ControllableHandleInternal extends ControllableHandle {
  closeCalls: number
}

function makeControllableHandle(url: string, port: number): ControllableHandleInternal {
  const state: { resolve: (() => void) | null; calls: number } = {
    resolve: null,
    calls: 0
  }
  const closed = new Promise<void>((resolve) => {
    state.resolve = resolve
  })
  return {
    url,
    port,
    close: () => {
      state.calls++
      return closed
    },
    releaseClose: () => {
      state.resolve?.()
    },
    get closeCalls(): number {
      return state.calls
    }
  } as unknown as ControllableHandleInternal
}

/**
 * Each test starts from a module whose settings are loaded and whose listener
 * is already up — the state `setPort` expects to find at runtime.
 *
 * All private state is set before `onInit` to prevent the auto-restart-on-boot
 * path (which fires inside `onInit`) from racing the test's initial handle.
 */
function setupModule(settings: Partial<McpHostSettings> = {}): {
  module: AnyModule
  handle: ControllableHandleInternal
} {
  const module = new McpHostModule()
  const m = module as unknown as AnyModule

  // Pre-seed all state before onInit so the auto-start path in the constructor
  // sees `loaded = true` and skips its own ensureLoaded().then() race.
  m.loaded = true
  m.settings = { ...DEFAULT_MCP_HOST_SETTINGS, enabled: true, ...settings }
  m.token = 'test-token'
  const port = settings.port ?? 43110
  const handle = makeControllableHandle(`http://127.0.0.1:${port}/mcp`, port)
  m.handle = handle

  const ctx = {
    app: {},
    manager: { getModule: () => undefined },
    moduleKey: McpHostModule.key,
    runtime: { app: {}, channel: { keyManager: {} } },
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
  }

  void module.onInit(ctx as never)

  return { module: m, handle }
}

async function invokeHandler(eventName: string, payload: unknown): Promise<unknown> {
  const handler = handlers.get(eventName)
  if (!handler) throw new Error(`handler for ${eventName} not registered`)
  return handler(payload, {} as HandlerContext)
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('mcp host listener lifecycle', () => {
  it('awaits the previous close() before starting a new server on setPort', async () => {
    startMcpHostServer.mockReset()
    handlers.clear()

    const { module, handle } = setupModule({ port: 43110 })

    // The new server the rebind will request once close() resolves.
    const nextHandle = makeControllableHandle('http://127.0.0.1:43111/mcp', 43111)
    startMcpHostServer.mockResolvedValue(nextHandle)

    // Fire setPort; do NOT release the old handle yet.
    const portPromise = invokeHandler(McpHostEvents.setPort.toEventName(), {
      port: 43111
    })

    // Drain the microtask queue past stopListener's await on `this.stopping`.
    // If the fix were absent, startMcpHostServer would already have been called.
    for (let i = 0; i < 8; i++) await Promise.resolve()

    expect(handle.closeCalls).toBe(1)
    expect(startMcpHostServer).not.toHaveBeenCalled()

    // Releasing the old handle lets stopListener's await resolve, which unblocks
    // startListener and requests the new server.
    handle.releaseClose()

    await portPromise

    expect(startMcpHostServer).toHaveBeenCalledTimes(1)
    expect(module.handle).toBe(nextHandle)
  })

  it('does not start a second server while the first close() is still pending', async () => {
    startMcpHostServer.mockReset()
    handlers.clear()

    const { module, handle } = setupModule({ port: 43110 })

    const nextHandle = makeControllableHandle('http://127.0.0.1:43111/mcp', 43111)
    startMcpHostServer.mockResolvedValue(nextHandle)

    const portPromise = invokeHandler(McpHostEvents.setPort.toEventName(), {
      port: 43111
    })

    // Drain microtask queue without releasing close().
    for (let i = 0; i < 8; i++) await Promise.resolve()

    // close() was called on the old handle but its promise is still pending.
    expect(handle.closeCalls).toBe(1)
    expect(startMcpHostServer).not.toHaveBeenCalled()

    handle.releaseClose()
    await portPromise

    expect(startMcpHostServer).toHaveBeenCalledTimes(1)
    expect(module.handle).toBe(nextHandle)
  })
})

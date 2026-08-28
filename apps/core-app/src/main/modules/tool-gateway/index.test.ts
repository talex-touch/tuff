/**
 * Gate behaviour of the module that owns the confirmation round-trip.
 *
 * The gateway server is faked so the module's own `confirm` callback can be
 * driven directly — the wire contract it sits behind has its own suite in
 * `gateway-server.test.ts`.
 */

import type { ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  AgentToolConfirmRequest,
  AgentToolConfirmSettlement,
  AgentToolGatewayState,
  AgentToolPermissionMode
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type {
  AgentToolAuditEvent,
  ConfirmationDecision,
  ConfirmationRequest,
  ToolGatewayOptions
} from './gateway-server'
import type { ToolGatewayModule as ToolGatewayModuleInstance } from './index'
import { AgentToolEvents } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<unknown, (payload: unknown, context: unknown) => unknown>(),
  broadcast: vi.fn(),
  toolLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  startToolGateway: vi.fn(),
  resetSessionApprovals: vi.fn(),
  close: vi.fn(async () => undefined),
  confirm: null as
    | null
    | ((request: ConfirmationRequest, signal: AbortSignal) => Promise<ConfirmationDecision>),
  audit: null as null | ((event: AgentToolAuditEvent) => void)
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => mocks.toolLog
}))

vi.mock('electron', () => ({
  shell: { openPath: vi.fn(async () => '') }
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: () => ({
    transport: {
      on: (event: unknown, handler: (payload: unknown, context: unknown) => unknown) => {
        mocks.handlers.set(event, handler)
        return vi.fn()
      },
      broadcast: mocks.broadcast
    }
  })
}))

vi.mock('./gateway-server', () => ({
  startToolGateway: mocks.startToolGateway
}))

vi.mock('../ai/ai-import-content-store', () => ({
  aiImportContentStore: { read: vi.fn(async () => '') }
}))

vi.mock('../ai/ai-orchestrator-store', () => ({
  aiOrchestratorStore: { listImportedItems: vi.fn(async () => []) }
}))

vi.mock('../ai/intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: {
    registerProfile: vi.fn(),
    listStructuredTools: vi.fn(async () => []),
    callTool: vi.fn(async () => '')
  }
}))

vi.mock('../ai/providers/pi-cli-provider', () => ({
  setPiToolRuntimeResolver: vi.fn()
}))

vi.mock('../ai/skill-local-sources', () => ({
  LOCAL_SKILL_ID_PREFIX: 'local:',
  readEnabledLocalSkill: vi.fn(async () => '')
}))

vi.mock('../box-tool/core-box/manager', () => ({
  coreBoxManager: { search: vi.fn(async () => ({ items: [] })) }
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: null }
}))

let gateway: ToolGatewayModuleInstance | null = null

function hostContext(): HandlerContext {
  return {} as HandlerContext
}

function pluginContext(name: string): HandlerContext {
  return { plugin: { name } } as unknown as HandlerContext
}

/** Lets a broadcast and any pending continuation run before we assert on it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function setEnabled(
  payload: { enabled: boolean; mode?: AgentToolPermissionMode },
  context: HandlerContext = hostContext()
): Promise<{ enabled: boolean; tools: string[] }> {
  const handler = mocks.handlers.get(AgentToolEvents.setEnabled)
  if (!handler) throw new Error('setEnabled handler was never registered')
  return (await handler(payload, context)) as { enabled: boolean; tools: string[] }
}

async function getState(context: HandlerContext = hostContext()): Promise<AgentToolGatewayState> {
  const handler = mocks.handlers.get(AgentToolEvents.getState)
  if (!handler) throw new Error('getState handler was never registered')
  return (await handler(undefined, context)) as AgentToolGatewayState
}

function decide(payload: { requestId: string; approved: boolean; remember: boolean }): {
  accepted: boolean
} {
  const handler = mocks.handlers.get(AgentToolEvents.confirmDecision)
  if (!handler) throw new Error('confirmDecision handler was never registered')
  return handler(payload, hostContext()) as { accepted: boolean }
}

/** Asks the gate the way the gateway server would, once a tool wants to run. */
function askGate(
  overrides: Partial<ConfirmationRequest> = {},
  signal = new AbortController().signal
): Promise<ConfirmationDecision> {
  if (!mocks.confirm) throw new Error('gateway was never started')
  return mocks.confirm(
    {
      callId: 'call-1',
      tool: 'tuff_open_path',
      risk: 'execute',
      summary: 'Open /tmp/report.pdf',
      input: '{}',
      ...overrides
    },
    signal
  )
}

function lastConfirmRequest(): AgentToolConfirmRequest {
  const call = [...mocks.broadcast.mock.calls]
    .reverse()
    .find(([event]) => event === AgentToolEvents.confirmRequest)
  if (!call) throw new Error('nothing was broadcast to the renderer')
  return call[1] as AgentToolConfirmRequest
}

function lastConfirmSettlement(): AgentToolConfirmSettlement {
  const call = [...mocks.broadcast.mock.calls]
    .reverse()
    .find(([event]) => event === AgentToolEvents.confirmSettled)
  if (!call) throw new Error('no confirmation settlement was broadcast to the renderer')
  return call[1] as AgentToolConfirmSettlement
}

beforeEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.confirm = null
  mocks.audit = null
  mocks.startToolGateway.mockImplementation(async (options: ToolGatewayOptions) => {
    mocks.confirm = options.confirm
    mocks.audit = options.onAudit ?? null
    return {
      url: 'http://127.0.0.1:1/invoke',
      token: 'test-token',
      resetSessionApprovals: mocks.resetSessionApprovals,
      close: mocks.close
    }
  })

  const { ToolGatewayModule } = await import('./index')
  gateway = new ToolGatewayModule()
  gateway.onInit({} as ModuleInitContext<TalexEvents>)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await gateway?.onDestroy()
  gateway = null
})

describe('permission mode at the confirmation gate', () => {
  it('auto-approves under full access without asking the renderer', async () => {
    const canary = 'sk-secret@/tmp/private-report.pdf'
    await setEnabled({ enabled: true, mode: 'full' })

    const decision = await askGate({
      tool: 'tuff_mcp_call',
      summary: canary
    })

    expect(decision).toEqual({ approved: true, remember: false })
    expect(mocks.broadcast).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.toolLog.info.mock.calls)).not.toContain(canary)
  })

  it('logs only the strict gateway audit projection', async () => {
    await setEnabled({ enabled: true, mode: 'full' })
    const audit: AgentToolAuditEvent = {
      schema: 'agent-tool-audit/v1',
      phase: 'result',
      callId: 'call-1',
      toolId: 'tuff_open_path',
      risk: 'execute',
      status: 'success',
      durationMs: 10,
      code: 'TOOL_OK'
    }

    mocks.audit?.(audit)

    expect(mocks.toolLog.info).toHaveBeenCalledWith(`Agent tool audit ${JSON.stringify(audit)}`)
  })

  it('goes back to asking once the user leaves full access', async () => {
    await setEnabled({ enabled: true, mode: 'full' })
    await askGate()
    expect(mocks.broadcast).not.toHaveBeenCalled()

    await setEnabled({ enabled: true, mode: 'review' })
    const inFlight = askGate({ tool: 'tuff_read_file', risk: 'read' })
    await flush()
    expect(mocks.broadcast).toHaveBeenCalledTimes(1)

    expect(
      decide({ requestId: lastConfirmRequest().requestId, approved: true, remember: true })
    ).toEqual({
      accepted: true
    })
    await expect(inFlight).resolves.toEqual({ approved: true, remember: true })
  })

  it('never settles a request that was already waiting when the mode widened', async () => {
    await setEnabled({ enabled: true, mode: 'review' })

    let settled: ConfirmationDecision | null = null
    const inFlight = askGate({ summary: 'Open /Applications/Mail.app' })
    void inFlight.then((decision) => {
      settled = decision
    })
    await flush()
    const request = lastConfirmRequest()

    await setEnabled({ enabled: true, mode: 'full' })
    await flush()
    // Widening applies to the next call only — the card already on screen is
    // still the user's to answer, so nobody can wave through a running
    // destructive call by switching modes underneath it.
    expect(settled).toBeNull()

    decide({ requestId: request.requestId, approved: false, remember: false })
    await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
  })

  it('treats an enable message without a mode as review', async () => {
    await setEnabled({ enabled: true, mode: 'full' })
    // A sender that omits the field — one built before modes existed, or a
    // stale one — must not inherit the standing grant.
    await setEnabled({ enabled: true })

    const inFlight = askGate()
    await flush()
    expect(mocks.broadcast).toHaveBeenCalledTimes(1)

    decide({ requestId: lastConfirmRequest().requestId, approved: false, remember: false })
    await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
  })

  it('refuses to let a plugin widen the gate', async () => {
    await setEnabled({ enabled: true, mode: 'review' })
    await expect(
      setEnabled({ enabled: true, mode: 'full' }, pluginContext('evil.plugin'))
    ).rejects.toThrow('cannot drive agent tools')

    const inFlight = askGate()
    await flush()
    expect(mocks.broadcast).toHaveBeenCalledTimes(1)

    decide({ requestId: lastConfirmRequest().requestId, approved: false, remember: false })
    await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
  })

  it('times out a review decision with a fixed redacted diagnostic', async () => {
    vi.useFakeTimers()
    const canary = 'sk-secret@/tmp/timeout-path'
    try {
      await setEnabled({ enabled: true, mode: 'review' })
      const inFlight = askGate({ tool: canary, summary: canary })
      const request = lastConfirmRequest()

      await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

      await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
      expect(lastConfirmSettlement()).toEqual({
        requestId: request.requestId,
        reason: 'timeout'
      })
      expect(decide({ requestId: request.requestId, approved: true, remember: false })).toEqual({
        accepted: false
      })
      expect(mocks.toolLog.warn).toHaveBeenCalledWith('Agent tool confirmation timed out')
      expect(JSON.stringify(mocks.toolLog.warn.mock.calls)).not.toContain(canary)
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows the packaged acceptance timeout override to shorten the default', async () => {
    vi.useFakeTimers()
    vi.stubEnv('TUFF_AGENT_TOOL_CONFIRM_TIMEOUT_MS', '500')
    try {
      await setEnabled({ enabled: true, mode: 'review' })
      let settled = false
      const inFlight = askGate()
      void inFlight.then(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(499)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['1', '120000', '240000', 'not-a-number'])(
    'ignores an unsafe confirmation timeout override %s',
    async (override) => {
      vi.useFakeTimers()
      vi.stubEnv('TUFF_AGENT_TOOL_CONFIRM_TIMEOUT_MS', override)
      try {
        await setEnabled({ enabled: true, mode: 'review' })
        let settled = false
        const inFlight = askGate()
        void inFlight.then(() => {
          settled = true
        })

        await vi.advanceTimersByTimeAsync(2 * 60 * 1000 - 1)
        expect(settled).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
      } finally {
        vi.useRealTimers()
      }
    }
  )

  it('cancels a pending review when the gateway client aborts', async () => {
    vi.useFakeTimers()
    try {
      await setEnabled({ enabled: true, mode: 'review' })
      const controller = new AbortController()
      const inFlight = askGate({}, controller.signal)
      const request = lastConfirmRequest()

      controller.abort()

      await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
      expect(lastConfirmSettlement()).toEqual({
        requestId: request.requestId,
        reason: 'cancelled'
      })
      expect(
        mocks.broadcast.mock.calls.filter(([event]) => event === AgentToolEvents.confirmSettled)
      ).toHaveLength(1)
      expect(decide({ requestId: request.requestId, approved: true, remember: false })).toEqual({
        accepted: false
      })
      expect(mocks.toolLog.warn).not.toHaveBeenCalledWith('Agent tool confirmation timed out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes the abort listener after a normal decision settles', async () => {
    vi.useFakeTimers()
    try {
      await setEnabled({ enabled: true, mode: 'review' })
      const controller = new AbortController()
      const addAbortListener = vi.spyOn(controller.signal, 'addEventListener')
      const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener')
      const inFlight = askGate({}, controller.signal)
      const request = lastConfirmRequest()

      decide({ requestId: request.requestId, approved: true, remember: false })
      await expect(inFlight).resolves.toEqual({ approved: true, remember: false })
      expect(addAbortListener).toHaveBeenCalledTimes(1)
      expect(removeAbortListener).toHaveBeenCalledTimes(1)
      expect(removeAbortListener).toHaveBeenCalledWith('abort', addAbortListener.mock.calls[0]![1])
      controller.abort()
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

      expect(
        mocks.broadcast.mock.calls.filter(([event]) => event === AgentToolEvents.confirmSettled)
      ).toEqual([])
      expect(mocks.toolLog.warn).not.toHaveBeenCalledWith('Agent tool confirmation timed out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles pending review decisions before shutdown', async () => {
    await setEnabled({ enabled: true, mode: 'review' })
    const inFlight = askGate()
    await flush()
    const request = lastConfirmRequest()

    await gateway?.onDestroy()
    gateway = null

    await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
    expect(lastConfirmSettlement()).toEqual({
      requestId: request.requestId,
      reason: 'cancelled'
    })
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
})

describe('enabling and disabling tools', () => {
  it('reports the conservative initial gateway state without starting it', async () => {
    await expect(getState()).resolves.toEqual({
      enabled: false,
      mode: 'review',
      ready: false,
      tools: []
    })
    expect(mocks.startToolGateway).not.toHaveBeenCalled()
  })

  it('reports enabled but not ready while gateway startup is still in flight', async () => {
    let resolveStart!: (handle: {
      url: string
      token: string
      resetSessionApprovals: typeof mocks.resetSessionApprovals
      close: typeof mocks.close
    }) => void
    const start = new Promise<{
      url: string
      token: string
      resetSessionApprovals: typeof mocks.resetSessionApprovals
      close: typeof mocks.close
    }>((resolve) => {
      resolveStart = resolve
    })
    mocks.startToolGateway.mockImplementationOnce(async (options: ToolGatewayOptions) => {
      mocks.confirm = options.confirm
      mocks.audit = options.onAudit ?? null
      return await start
    })

    const enabling = setEnabled({ enabled: true, mode: 'review' })

    await expect(getState()).resolves.toEqual({
      enabled: true,
      mode: 'review',
      ready: false,
      tools: []
    })

    resolveStart({
      url: 'http://127.0.0.1:1/invoke',
      token: 'test-token',
      resetSessionApprovals: mocks.resetSessionApprovals,
      close: mocks.close
    })
    await enabling
    const ready = await getState()
    expect(ready).toMatchObject({ enabled: true, mode: 'review', ready: true })
    expect(ready.tools).toContain('tuff_read_file')
  })

  it('waits for an in-flight start and closes its late handle during teardown', async () => {
    let resolveStart!: (handle: {
      url: string
      token: string
      resetSessionApprovals: typeof mocks.resetSessionApprovals
      close: typeof mocks.close
    }) => void
    const start = new Promise<{
      url: string
      token: string
      resetSessionApprovals: typeof mocks.resetSessionApprovals
      close: typeof mocks.close
    }>((resolve) => {
      resolveStart = resolve
    })
    mocks.startToolGateway.mockImplementationOnce(async () => await start)
    const enabling = setEnabled({ enabled: true, mode: 'full' })
    let destroyed = false
    const destroying = gateway?.onDestroy().then(() => {
      destroyed = true
    })

    await Promise.resolve()
    expect(destroyed).toBe(false)
    resolveStart({
      url: 'http://127.0.0.1:1/invoke',
      token: 'test-token',
      resetSessionApprovals: mocks.resetSessionApprovals,
      close: mocks.close
    })

    await Promise.all([enabling, destroying])
    expect(mocks.close).toHaveBeenCalledTimes(1)
    expect(gateway?.getRuntimeConfig()).toBeNull()
    gateway = null
  })

  it('does not expose gateway state to a plugin caller', async () => {
    await expect(getState(pluginContext('evil.plugin'))).rejects.toThrow('cannot drive agent tools')
  })

  it('hands pi the tool list while enabled and takes it away on disable', async () => {
    const on = await setEnabled({ enabled: true, mode: 'full' })
    expect(on.enabled).toBe(true)
    expect(on.tools).toContain('tuff_search_files')

    const off = await setEnabled({ enabled: false })
    expect(off).toEqual({ enabled: false, tools: [] })
    expect(gateway?.getRuntimeConfig()).toBeNull()
    // Disabling means "pi gets no tools", not a teardown: one listener serves
    // the session, so turning tools back on rebinds nothing.
    expect(mocks.startToolGateway).toHaveBeenCalledTimes(1)
  })

  it('starts from review when tools come back on', async () => {
    await setEnabled({ enabled: true, mode: 'full' })
    await setEnabled({ enabled: false })
    await setEnabled({ enabled: true, mode: 'review' })

    const inFlight = askGate()
    await flush()
    expect(mocks.broadcast).toHaveBeenCalledTimes(1)

    decide({ requestId: lastConfirmRequest().requestId, approved: false, remember: false })
    await expect(inFlight).resolves.toEqual({ approved: false, remember: false })
  })
})

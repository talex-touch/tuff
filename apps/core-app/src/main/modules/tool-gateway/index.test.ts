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
  AgentToolPermissionMode
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type {
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
  confirm: null as null | ((request: ConfirmationRequest) => Promise<ConfirmationDecision>)
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: () => mocks.toolLog
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

function decide(payload: { requestId: string; approved: boolean; remember: boolean }): {
  accepted: boolean
} {
  const handler = mocks.handlers.get(AgentToolEvents.confirmDecision)
  if (!handler) throw new Error('confirmDecision handler was never registered')
  return handler(payload, hostContext()) as { accepted: boolean }
}

/** Asks the gate the way the gateway server would, once a tool wants to run. */
function askGate(overrides: Partial<ConfirmationRequest> = {}): Promise<ConfirmationDecision> {
  if (!mocks.confirm) throw new Error('gateway was never started')
  return mocks.confirm({
    callId: 'call-1',
    tool: 'tuff_open_path',
    risk: 'execute',
    summary: 'Open /tmp/report.pdf',
    input: '{}',
    ...overrides
  })
}

function lastConfirmRequest(): AgentToolConfirmRequest {
  const call = mocks.broadcast.mock.calls.at(-1)
  if (!call) throw new Error('nothing was broadcast to the renderer')
  return call[1] as AgentToolConfirmRequest
}

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.confirm = null
  mocks.startToolGateway.mockImplementation(async (options: ToolGatewayOptions) => {
    mocks.confirm = options.confirm
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
  await gateway?.onDestroy()
  gateway = null
})

describe('permission mode at the confirmation gate', () => {
  it('auto-approves under full access without asking the renderer', async () => {
    await setEnabled({ enabled: true, mode: 'full' })

    const decision = await askGate({
      tool: 'tuff_mcp_call',
      summary: '⚠ files/delete_file — remove /tmp/report.pdf'
    })

    expect(decision).toEqual({ approved: true, remember: false })
    expect(mocks.broadcast).not.toHaveBeenCalled()
    // The destructive marker the MCP mapping added stays in the audit line: a
    // standing grant is the one place nobody sees the confirmation card.
    expect(mocks.toolLog.info).toHaveBeenCalledWith(
      expect.stringContaining('Auto-approved (full-allow): tuff_mcp_call')
    )
    expect(mocks.toolLog.info).toHaveBeenCalledWith(expect.stringContaining('⚠ files/delete_file'))
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
})

describe('enabling and disabling tools', () => {
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

/**
 * Agent tool gateway.
 *
 * Owns the loopback endpoint the `pi` extension calls, the confirmation
 * round-trip with the renderer, and the allowlist handed to `pi` on spawn.
 * Host-only: granting a plugin the ability to run these tools would hand it
 * the user's filesystem behind the same consent prompt.
 */

import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  AgentToolConfirmRequest,
  AgentToolConfirmSettlementReason,
  AgentToolGatewayState,
  AgentToolPermissionMode
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { ConfirmationDecision, ToolGatewayHandle } from './gateway-server'
import { randomUUID } from 'node:crypto'
import { AgentToolEvents } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { shell } from 'electron'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { aiImportContentStore } from '../ai/ai-import-content-store'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { intelligenceMcpRegistry } from '../ai/intelligence-mcp-registry'
import { setPiToolRuntimeResolver } from '../ai/providers/pi-cli-provider'
import { readEnabledLocalSkill } from '../ai/skill-local-sources'
import { coreBoxManager } from '../box-tool/core-box/manager'
import { pluginModule } from '../plugin/plugin-module'
import { createAgentContextSource } from './agent-context-source'
import { startToolGateway } from './gateway-server'
import { createPluginFeatureSource } from './plugin-feature-source'
import { createToolRegistry } from './tool-registry'

export * from './agent-context-source'
export * from './gateway-server'
export * from './plugin-feature-source'
export * from './tool-registry'

const toolLog = createLogger('agent-tools')

/** A user who never answers must not wedge the agent loop forever. */
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 2 * 60 * 1000
const MIN_CONFIRMATION_TIMEOUT_MS = 250
const CONFIRMATION_TIMEOUT_ENV = 'TUFF_AGENT_TOOL_CONFIRM_TIMEOUT_MS'

function resolveConfirmationTimeoutMs(): number {
  const candidate = Number(process.env[CONFIRMATION_TIMEOUT_ENV])
  return Number.isInteger(candidate) &&
    candidate >= MIN_CONFIRMATION_TIMEOUT_MS &&
    candidate < DEFAULT_CONFIRMATION_TIMEOUT_MS
    ? candidate
    : DEFAULT_CONFIRMATION_TIMEOUT_MS
}

function assertHostOwned(context: HandlerContext): void {
  const pluginId = context?.plugin?.name
  if (pluginId) {
    throw new Error(`[AgentTools] Plugin '${pluginId}' cannot drive agent tools`)
  }
}

export class ToolGatewayModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('ToolGateway')

  private disposers: Array<() => void> = []
  private handle: ToolGatewayHandle | null = null
  /**
   * The in-flight start, so overlapping callers join it instead of each binding a port.
   * `handle` alone cannot guard this: it is only assigned once startToolGateway() resolves,
   * so two setEnabled(true) calls both passed the check, both bound, and the second assignment
   * dropped the first server on the floor still listening (#642).
   */
  private starting: Promise<ToolGatewayHandle> | null = null
  private enabled = false
  /**
   * How the gate answers while tools are on. `full` is a standing grant the
   * user gave deliberately; it defaults to `review` so an enable message from
   * a sender that knows nothing about modes never widens permissions.
   */
  private mode: AgentToolPermissionMode = 'review'
  private pending = new Map<
    string,
    (decision: ConfirmationDecision, reason?: AgentToolConfirmSettlementReason) => void
  >()
  /**
   * MCP servers run in this process, under the registry the orchestrator
   * already owns — the agent process never gets a server of its own, so every
   * call still lands in front of the confirmation gate.
   */
  private readonly agentContext = createAgentContextSource({
    listImportedItems: () => aiOrchestratorStore.listImportedItems(),
    readContent: (contentRef) => aiImportContentStore.read(contentRef),
    readLocalSkill: (skillId) => readEnabledLocalSkill(skillId),
    registerMcpProfile: (profile) => intelligenceMcpRegistry.registerProfile(profile),
    listStructuredTools: (profileIds) => intelligenceMcpRegistry.listStructuredTools(profileIds),
    callMcpTool: (profileId, toolName, input) =>
      intelligenceMcpRegistry.callTool(profileId, toolName, input)
  })

  /**
   * The plugin manager appears only once the plugin module has initialised, and
   * the set changes as the user enables or reloads plugins — so the list is
   * read per call rather than captured here.
   */
  private readonly pluginFeatures = createPluginFeatureSource({
    listPlugins: () => [...(pluginModule.pluginManager?.plugins.values() ?? [])]
  })

  constructor() {
    super(ToolGatewayModule.key, { create: false })
  }

  /** Spawn-time inputs for the pi provider; empty tools means "no tools". */
  getRuntimeConfig(): { url: string; token: string; tools: string[] } | null {
    if (!this.enabled || !this.handle) return null
    return {
      url: this.handle.url,
      token: this.handle.token,
      tools: [...createToolRegistry(this.registryOptions()).keys()]
    }
  }

  private getGatewayState(): AgentToolGatewayState {
    const config = this.getRuntimeConfig()
    return {
      enabled: this.enabled,
      mode: this.mode,
      ready: this.enabled && this.handle !== null,
      tools: config?.tools ?? []
    }
  }

  private registryOptions() {
    return {
      searchFiles: async (query: string, limit: number) => {
        // Reuses CoreBox's own search rather than walking the disk: the agent
        // then sees exactly what the launcher would, index and ranking included.
        const result = await coreBoxManager.search({ text: query })
        const items = Array.isArray(result?.items) ? result.items : []
        return items
          .map((item) => {
            const entry = item as unknown as {
              render?: { basic?: { title?: string; subtitle?: string } }
              meta?: { extension?: { path?: string } }
            }
            return {
              name: entry.render?.basic?.title ?? '',
              path: entry.meta?.extension?.path ?? entry.render?.basic?.subtitle ?? ''
            }
          })
          .filter((entry) => entry.name || entry.path)
          .slice(0, limit)
      },
      openPath: async (path: string) => shell.openPath(path),
      agentContext: this.agentContext,
      pluginFeatures: this.pluginFeatures
    }
  }

  private async ensureGateway(runtimeTransport: {
    broadcast: (event: unknown, payload: unknown) => unknown
  }): Promise<void> {
    if (this.handle) return
    if (this.starting) {
      await this.starting
      return
    }

    this.starting = startToolGateway({
      tools: createToolRegistry(this.registryOptions()),
      onLog: (message) => toolLog.warn(message),
      onAudit: (event) => toolLog.info(`Agent tool audit ${JSON.stringify(event)}`),
      confirm: async (request, signal) => {
        if (signal.aborted) return { approved: false, remember: false }
        // Read per call, so a mode change lands on the next call only: requests
        // already waiting in `this.pending` still need the user's answer rather
        // than being settled retroactively by the switch.
        if (this.mode === 'full') {
          // Never remembered: the standing grant lives in the mode, so switching
          // back to review restores the prompt for every tool.
          return { approved: true, remember: false }
        }

        const requestId = randomUUID()
        const payload: AgentToolConfirmRequest = {
          requestId,
          tool: request.tool,
          risk: request.risk,
          summary: request.summary,
          input: request.input
        }

        return new Promise<ConfirmationDecision>((resolveDecision) => {
          let settled = false
          const notifySettlement = (reason: AgentToolConfirmSettlementReason): void => {
            try {
              runtimeTransport.broadcast(AgentToolEvents.confirmSettled, { requestId, reason })
            } catch {
              toolLog.warn('Agent tool confirmation settlement broadcast failed')
            }
          }
          const settle = (
            decision: ConfirmationDecision,
            reason?: AgentToolConfirmSettlementReason
          ): void => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            signal.removeEventListener('abort', onAbort)
            this.pending.delete(requestId)
            if (reason) notifySettlement(reason)
            resolveDecision(decision)
          }
          const onAbort = (): void => {
            settle({ approved: false, remember: false }, 'cancelled')
          }
          const timer = setTimeout(() => {
            toolLog.warn('Agent tool confirmation timed out')
            settle({ approved: false, remember: false }, 'timeout')
          }, resolveConfirmationTimeoutMs())

          this.pending.set(requestId, settle)
          signal.addEventListener('abort', onAbort, { once: true })

          if (signal.aborted) {
            onAbort()
            return
          }

          try {
            runtimeTransport.broadcast(AgentToolEvents.confirmRequest, payload)
          } catch {
            toolLog.warn('Agent tool confirmation request broadcast failed')
            settle({ approved: false, remember: false }, 'cancelled')
          }
        })
      }
    })

    try {
      this.handle = await this.starting
    } finally {
      // Cleared on failure too, so a start that throws does not wedge every later attempt.
      this.starting = null
    }

    toolLog.info('Tool gateway listening')
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'ToolGatewayModule.onInit')
    const transport = runtime.transport as unknown as {
      on: (event: unknown, handler: (payload: never, context: never) => unknown) => () => void
      broadcast: (event: unknown, payload: unknown) => unknown
    }

    this.disposers.push(
      transport.on(AgentToolEvents.getState, ((_payload: void, context: HandlerContext) => {
        assertHostOwned(context)
        return this.getGatewayState()
      }) as never),

      transport.on(AgentToolEvents.setEnabled, (async (
        payload: { enabled: boolean; mode?: AgentToolPermissionMode },
        context: HandlerContext
      ) => {
        assertHostOwned(context)
        this.enabled = payload.enabled === true
        // Anything but an explicit `full` means review — an omitted or unknown
        // value must not be read as the wider grant.
        this.mode = payload.mode === 'full' ? 'full' : 'review'
        if (this.enabled) await this.ensureGateway(transport)
        const config = this.getRuntimeConfig()
        return { enabled: this.enabled, tools: config?.tools ?? [] }
      }) as never),

      transport.on(AgentToolEvents.confirmDecision, ((
        payload: { requestId: string; approved: boolean; remember: boolean },
        context: HandlerContext
      ) => {
        assertHostOwned(context)
        const settle = this.pending.get(payload.requestId)
        if (!settle) return { accepted: false }
        this.pending.delete(payload.requestId)
        settle({ approved: payload.approved === true, remember: payload.remember === true })
        return { accepted: true }
      }) as never),

      transport.on(AgentToolEvents.resetApprovals, ((
        _payload: undefined,
        context: HandlerContext
      ) => {
        assertHostOwned(context)
        this.handle?.resetSessionApprovals()
        return { reset: true }
      }) as never)
    )

    // The provider asks at spawn time, so flipping tools on mid-conversation
    // takes effect on the next turn without re-registering anything.
    setPiToolRuntimeResolver(() => this.getRuntimeConfig())

    toolLog.info('Agent tool channels registered')
  }

  async onDestroy(): Promise<void> {
    setPiToolRuntimeResolver(null)
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    // Every waiting call is answered before the socket goes: a pending promise
    // would otherwise keep an agent loop hanging past shutdown.
    for (const settle of [...this.pending.values()]) {
      settle({ approved: false, remember: false }, 'cancelled')
    }
    try {
      await this.starting
    } catch {
      // A failed start has no handle to close; teardown still resets module state.
    }
    await this.handle?.close()
    this.handle = null
    this.enabled = false
    this.mode = 'review'
  }
}

export const toolGatewayModule = new ToolGatewayModule()

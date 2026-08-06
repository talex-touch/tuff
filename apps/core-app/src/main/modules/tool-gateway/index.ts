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
import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { ConfirmationDecision, ToolGatewayHandle } from './gateway-server'
import { randomUUID } from 'node:crypto'
import { getLogger } from '@talex-touch/utils/common/logger'
import { AgentToolEvents } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { shell } from 'electron'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import { aiImportContentStore } from '../ai/ai-import-content-store'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { intelligenceMcpRegistry } from '../ai/intelligence-mcp-registry'
import { setPiToolRuntimeResolver } from '../ai/providers/pi-cli-provider'
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

const toolLog = getLogger('agent-tools')

/** A user who never answers must not wedge the agent loop forever. */
const CONFIRMATION_TIMEOUT_MS = 2 * 60 * 1000

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
  private enabled = false
  private pending = new Map<string, (decision: ConfirmationDecision) => void>()
  /**
   * MCP servers run in this process, under the registry the orchestrator
   * already owns — the agent process never gets a server of its own, so every
   * call still lands in front of the confirmation gate.
   */
  private readonly agentContext = createAgentContextSource({
    listImportedItems: () => aiOrchestratorStore.listImportedItems(),
    readContent: (contentRef) => aiImportContentStore.read(contentRef),
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

    this.handle = await startToolGateway({
      tools: createToolRegistry(this.registryOptions()),
      onLog: (message) => toolLog.info(message),
      confirm: async (request) => {
        const requestId = randomUUID()
        const payload: AgentToolConfirmRequest = {
          requestId,
          tool: request.tool,
          risk: request.risk,
          summary: request.summary,
          input: request.input
        }

        return new Promise<ConfirmationDecision>((resolveDecision) => {
          const timer = setTimeout(() => {
            this.pending.delete(requestId)
            toolLog.warn(`Confirmation for ${request.tool} timed out`)
            resolveDecision({ approved: false, remember: false })
          }, CONFIRMATION_TIMEOUT_MS)

          this.pending.set(requestId, (decision) => {
            clearTimeout(timer)
            resolveDecision(decision)
          })

          runtimeTransport.broadcast(AgentToolEvents.confirmRequest, payload)
        })
      }
    })

    toolLog.info(`Tool gateway listening on ${this.handle.url}`)
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'ToolGatewayModule.onInit')
    const transport = runtime.transport as unknown as {
      on: (event: unknown, handler: (payload: never, context: never) => unknown) => () => void
      broadcast: (event: unknown, payload: unknown) => unknown
    }

    this.disposers.push(
      transport.on(AgentToolEvents.setEnabled, (async (
        payload: { enabled: boolean },
        context: HandlerContext
      ) => {
        assertHostOwned(context)
        this.enabled = payload.enabled === true
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
    for (const settle of this.pending.values()) settle({ approved: false, remember: false })
    this.pending.clear()
    await this.handle?.close()
    this.handle = null
  }
}

export const toolGatewayModule = new ToolGatewayModule()

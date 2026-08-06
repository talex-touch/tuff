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
import { setPiToolRuntimeResolver } from '../ai/providers/pi-cli-provider'
import { startToolGateway } from './gateway-server'
import { createToolRegistry } from './tool-registry'

export * from './gateway-server'
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
        // Search lives behind CoreBox's provider stack; wired in S6 once the
        // feature-invocation surface lands. Until then the tool answers
        // honestly rather than pretending to have searched.
        void query
        void limit
        return [] as Array<{ name: string; path: string }>
      },
      openPath: async (path: string) => shell.openPath(path)
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

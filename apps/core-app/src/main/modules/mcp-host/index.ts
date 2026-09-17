/**
 * Tuff as a local MCP server.
 *
 * The `pi` extension already lets a model running *on this machine* call Tuff
 * tools; this module does the same for agents running elsewhere — an editor, a
 * terminal agent, anything that speaks MCP — by binding one loopback endpoint
 * on the user's behalf.
 *
 * Three rules shape it:
 *
 * - **The gate is shared, never forked.** Calls land in the same confirmation
 *   prompt the home conversation uses, driven by the same pending map in
 *   `toolGatewayModule`. An external client gets no quieter path than a local
 *   one, and the standing `full` grant applies to both or to neither.
 * - **Off is the default.** The listener only exists once the user turns it on,
 *   and tools that write, open or run start disabled even then.
 * - **The address is stable.** A client config is written once into someone
 *   else's editor, so the port is the user's, persisted, and a port that cannot
 *   be bound is reported rather than silently swapped for a random one.
 */

import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  McpHostState,
  McpHostToolView
} from '@talex-touch/utils/transport/sdk/domains/mcp-host'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { McpCallOutcome, McpToolDescriptor } from './mcp-host-protocol'
import type { McpHostServerHandle } from './mcp-host-server'
import type { McpHostSettings } from './mcp-host-settings'
import type { ToolResult } from '../tool-gateway/tool-registry'
import { randomBytes, createHash } from 'node:crypto'
import { McpHostEvents } from '@talex-touch/utils/transport/sdk/domains/mcp-host'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { getMainConfig, saveMainConfigDurable, waitForMainStorageReady } from '../storage'
import { aiOrchestratorStore } from '../ai/ai-orchestrator-store'
import { BaseModule } from '../abstract-base-module'
import { toolGatewayModule } from '../tool-gateway'
import { truncateForModel } from '../tool-gateway/tool-registry'
import {
  DEFAULT_MCP_HOST_SETTINGS,
  normalizeMcpHostSettings,
  resolveMcpHostPort
} from './mcp-host-settings'
import { startMcpHostServer } from './mcp-host-server'
import { createMcpHostToolset, stableStringify } from './mcp-host-tools'

export * from './mcp-host-protocol'
export * from './mcp-host-server'
export * from './mcp-host-settings'
export * from './mcp-host-tools'

const mcpHostLog = createLogger('mcp-host')

/** Told to every client on `initialize`; the gate is not discoverable otherwise. */
const MCP_HOST_INSTRUCTIONS =
  "Tools run on the user's machine through Tuff, and every call is shown to them for approval first. " +
  'A call can therefore come back saying the user declined — that is a normal answer, not a transport failure.'

export class McpHostModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('McpHost')

  private disposers: Array<() => void> = []
  private handle: McpHostServerHandle | null = null
  private starting: Promise<McpHostServerHandle | null> | null = null
  private settings: McpHostSettings = { ...DEFAULT_MCP_HOST_SETTINGS }
  /** Set once the persisted document has actually been read. */
  private loaded = false
  /** The in-flight read, so overlapping callers share one. */
  private loading: Promise<void> | null = null
  /**
   * Approvals the user remembered, for this launch only — same lifetime as the
   * gateway's set, which is cleared when a conversation starts.
   *
   * The key is the tool plus a digest of its exact arguments. That is narrower
   * on purpose: the gateway keys `tuff_read_file` by the resolved path, and the
   * fallback here cannot resolve anything, so a blanket per-tool key would let
   * one remembered yes cover every later read. Narrower is the safe direction
   * for a caller that nothing else vouches for.
   */
  private readonly remembered = new Set<string>()
  private lastError: string | undefined
  private toolset: ReturnType<typeof createMcpHostToolset> | null = null

  constructor() {
    super(McpHostModule.key, { create: false })
  }

  private ensureToolset(): ReturnType<typeof createMcpHostToolset> {
    this.toolset ??= createMcpHostToolset({
      registry: toolGatewayModule.createRegistry(),
      listImportedSkills: async () => {
        const items = await aiOrchestratorStore.listImportedItems()
        return (
          items
            // Only what the user activated: an imported row that is switched off is
            // not merely unlisted in the home conversation, and must not become
            // readable here just because a different surface asked.
            .filter((item) => Boolean(item.contentRef) && item.active === true)
            .map((item) => ({
              id: item.id,
              name: item.name || item.id,
              description: item.alias ?? ''
            }))
        )
      }
    })
    return this.toolset
  }

  /**
   * The tools this host currently offers. Read per request so switching one off
   * stops it being listed on the client's next refresh — and so the toolset
   * picks up plugins installed after the listener started.
   */
  private listExposedTools(): McpToolDescriptor[] {
    const toolset = this.ensureToolset()
    return toolset.specs
      .filter((spec) => this.isToolEnabled(spec.name, spec.defaultEnabled))
      .map((spec) => ({
        name: spec.name,
        description: spec.description,
        inputSchema: spec.inputSchema
      }))
  }

  private isToolEnabled(name: string, fallback: boolean): boolean {
    const override = this.settings.tools[name]
    return typeof override === 'boolean' ? override : fallback
  }

  private isEnabled(): boolean {
    return this.settings.enabled === true
  }

  /**
   * Runs one call after the shared gate has settled. A denied call is an
   * `isError` result rather than a transport failure, matching what the home
   * conversation sees: the model should be able to read the refusal and stop.
   */
  private async callTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<McpCallOutcome> {
    const toolset = this.ensureToolset()
    const tool = toolset.resolve(name)
    if (!tool) return { output: `Unknown tool: ${name}`, isError: true }

    if (
      !this.isToolEnabled(name, toolset.specs.find((s) => s.name === name)?.defaultEnabled ?? false)
    ) {
      return { output: `Tool ${name} is switched off in Tuff settings.`, isError: true }
    }

    // Same rule the gateway applies: only a read may be waved through by a
    // remembered approval, and only for the exact call that was shown.
    const rememberKey = `${name}:${createHash('sha256').update(stableStringify(args)).digest('hex')}`
    if (tool.risk === 'read' && this.remembered.has(rememberKey)) {
      return await this.runTool(name, tool, args)
    }

    let decision: { approved: boolean; remember: boolean }
    try {
      decision = await toolGatewayModule.requestConfirmation(
        {
          tool: name,
          risk: tool.risk,
          summary: tool.summarize(args),
          // The card shows this verbatim, so it is the same pretty-printed JSON
          // the local agent's calls put there — one card format, two callers.
          input: JSON.stringify(args, null, 2)
        },
        signal
      )
    } catch (error) {
      // Fail closed: a gate that cannot ask is not an approval.
      return {
        output: `The user could not be asked to approve ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        isError: true
      }
    }

    if (!decision.approved) {
      return {
        output: `The user denied ${name}. They may allow it if you ask again.`,
        isError: true
      }
    }
    // The card offers "remember for this session" to both callers, so it has to
    // mean something here too — dropped silently it is a promise the UI makes
    // and the code does not keep.
    if (decision.remember && tool.risk === 'read') this.remembered.add(rememberKey)

    return await this.runTool(name, tool, args)
  }

  /** Runs the tool and reduces both success and failure to a wire-safe outcome. */
  private async runTool(
    name: string,
    tool: { execute: (args: Record<string, unknown>) => Promise<ToolResult> },
    args: Record<string, unknown>
  ): Promise<McpCallOutcome> {
    try {
      const result = await tool.execute(args)
      return { output: truncateForModel(result.output), isError: result.isError }
    } catch {
      return { output: `${name} failed to run.`, isError: true }
    }
  }

  private async stopListener(): Promise<void> {
    this.handle?.close()
    this.handle = null
  }

  private async startListener(): Promise<McpHostServerHandle | null> {
    if (this.handle) return this.handle
    if (this.starting) return await this.starting

    this.starting = (async (): Promise<McpHostServerHandle | null> => {
      try {
        const handle = await startMcpHostServer({
          port: resolveMcpHostPort(this.settings.port),
          token: this.settings.token,
          serverVersion: MCP_HOST_SERVER_VERSION,
          instructions: MCP_HOST_INSTRUCTIONS,
          listTools: () => this.listExposedTools(),
          callTool: (name, args, signal) => this.callTool(name, args, signal),
          onLog: (message) => mcpHostLog.info(message)
        })
        this.handle = handle
        this.lastError = undefined
        return handle
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        mcpHostLog.warn('MCP host listener failed to start', { error: this.lastError })
        this.settings = { ...this.settings, enabled: false }
        this.persist()
        return null
      } finally {
        this.starting = null
      }
    })()

    return await this.starting
  }

  /**
   * Reads the persisted settings, once.
   *
   * `onInit` runs before the storage module is ready — reading there throws
   * `StorageModule not ready: pending` and silently falls back to defaults,
   * which would both forget the user's token and let the next write persist
   * those defaults over the real file. So the read waits for readiness instead,
   * and is remembered only once it succeeds.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    if (this.loading) return await this.loading
    this.loading = (async () => {
      try {
        await waitForMainStorageReady()
        this.settings = normalizeMcpHostSettings(getMainConfig(StorageList.MCP_HOST_SETTINGS))
        this.loaded = true
      } catch (error) {
        mcpHostLog.warn('Failed to load MCP host settings, using defaults', {
          error: error instanceof Error ? error.message : String(error)
        })
      } finally {
        this.loading = null
      }
    })()
    return await this.loading
  }

  /** Durable, not fire-and-forget: this document holds a credential and a port. */
  private async persist(): Promise<void> {
    try {
      await waitForMainStorageReady()
      await saveMainConfigDurable(StorageList.MCP_HOST_SETTINGS, this.settings)
      this.loaded = true
    } catch (error) {
      mcpHostLog.warn('Failed to persist MCP host settings', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private getState(): McpHostState {
    const toolset = this.ensureToolset()
    const tools: McpHostToolView[] = toolset.specs.map((spec) => ({
      name: spec.name,
      description: spec.description,
      risk: spec.risk,
      enabled: this.isToolEnabled(spec.name, spec.defaultEnabled)
    }))
    return {
      enabled: this.isEnabled(),
      running: this.handle !== null,
      endpoint: this.handle?.url ?? null,
      port: this.handle?.port ?? resolveMcpHostPort(this.settings.port),
      token: this.settings.token,
      tools,
      lastError: this.lastError
    }
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'McpHostModule.onInit')
    const transport = runtime.transport as unknown as {
      on: (event: unknown, handler: (payload: never, context: never) => unknown) => () => void
    }

    this.disposers.push(
      transport.on(McpHostEvents.getState, (async (_payload: void, context: HandlerContext) => {
        assertHostOwnedMcpHost(context)
        await this.ensureLoaded()
        return this.getState()
      }) as never),

      transport.on(McpHostEvents.setEnabled, (async (
        payload: { enabled: boolean },
        context: HandlerContext
      ) => {
        assertHostOwnedMcpHost(context)
        await this.ensureLoaded()
        if (payload.enabled === true) {
          // A token is minted on first use, not at install time: an unused
          // feature should not leave a credential on disk.
          if (!this.settings.token) this.settings.token = mintMcpHostToken()
          this.settings.enabled = true
          await this.persist()
          await this.startListener()
        } else {
          this.settings.enabled = false
          await this.persist()
          await this.stopListener()
        }
        return this.getState()
      }) as never),

      transport.on(McpHostEvents.setToolEnabled, (async (
        payload: { name: string; enabled: boolean },
        context: HandlerContext
      ) => {
        assertHostOwnedMcpHost(context)
        await this.ensureLoaded()
        const toolset = this.ensureToolset()
        if (!toolset.specs.some((spec) => spec.name === payload.name)) {
          throw new Error(`Unknown MCP host tool: ${payload.name}`)
        }
        this.settings.tools = { ...this.settings.tools, [payload.name]: payload.enabled === true }
        await this.persist()
        return this.getState()
      }) as never),

      transport.on(McpHostEvents.setPort, (async (
        payload: { port: number },
        context: HandlerContext
      ) => {
        assertHostOwnedMcpHost(context)
        await this.ensureLoaded()
        const port = resolveMcpHostPort(payload.port)
        if (port === this.settings.port) return this.getState()
        // A running listener holds the old port; rebinding is the only way the
        // new one takes effect, and doing it here keeps the state truthful.
        await this.stopListener()
        this.settings.port = port
        await this.persist()
        if (this.isEnabled()) await this.startListener()
        return this.getState()
      }) as never),

      transport.on(McpHostEvents.rotateToken, (async (
        _payload: undefined,
        context: HandlerContext
      ) => {
        assertHostOwnedMcpHost(context)
        await this.ensureLoaded()
        this.settings.token = mintMcpHostToken()
        await this.persist()
        // The old token is worthless the moment the file changes, but the
        // listener compares against the value it started with, so it restarts.
        await this.restartForToken()
        return this.getState()
      }) as never)
    )

    mcpHostLog.info('MCP host channels registered')

    // A listener the user switched on comes back with the app: the client config
    // they pasted elsewhere is still pointing at this port, and an endpoint that
    // only answers after a manual toggle is a broken config, not a safe default.
    // Driven by readiness rather than ordered after it, because `onInit` runs
    // while storage is still pending.
    void this.ensureLoaded().then(() => (this.isEnabled() ? this.startListener() : null))
  }

  private async restartForToken(): Promise<void> {
    if (!this.isEnabled()) return
    await this.stopListener()
    await this.startListener()
  }

  async onDestroy(): Promise<void> {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    try {
      await this.starting
    } catch {
      // A failed start has nothing to close; teardown still resets state.
    }
    await this.stopListener()
  }
}

function assertHostOwnedMcpHost(context: HandlerContext): void {
  const pluginId = context?.plugin?.name
  if (pluginId) {
    throw new Error(`[McpHost] Plugin '${pluginId}' cannot drive the local MCP server`)
  }
}

export function mintMcpHostToken(): string {
  return randomBytes(32).toString('hex')
}

export const MCP_HOST_SERVER_VERSION = '1.0.0'

export const mcpHostModule = new McpHostModule()

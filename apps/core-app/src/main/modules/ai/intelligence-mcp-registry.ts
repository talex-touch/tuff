import type { AdaptedStructuredTool } from '@talex-touch/tuff-intelligence'
import { McpToolAdapter } from '@talex-touch/tuff-intelligence'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { app } from 'electron'
import { getSecureStoreValue, isSecureStoreAvailable } from '../../utils/secure-store'
import { createLogger } from '../../utils/logger'
import { createMcpFailure, readMcpFailureReason } from './intelligence-mcp-failure'
import { projectToolError, projectToolErrorCode } from './tool-error-projection'

const mcpLog = createLogger('Intelligence').child('McpRegistry')

type McpToolDescriptor = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export type IntelligenceMcpProfile =
  | {
      id: string
      name: string
      enabled?: boolean
      transport: {
        type: 'stdio'
        command: string
        args?: string[]
        cwd?: string
        env?: Record<string, string>
        envAuthRefs?: Record<string, string>
      }
      metadata?: Record<string, unknown>
    }
  | {
      id: string
      name: string
      enabled?: boolean
      transport: {
        type: 'streamable-http'
        url: string
        headers?: Record<string, string>
        authTokenKey?: string
        headerAuthRefs?: Record<string, string>
      }
      metadata?: Record<string, unknown>
    }

type ConnectedMcpSession = {
  client: Client
  transport: StdioClientTransport | StreamableHTTPClientTransport
  generation: number
  idleTimer: NodeJS.Timeout | null
  rpcCount: number
  closed: boolean
}

type PendingMcpConnection = {
  generation: number
  promise: Promise<ConnectedMcpSession>
}

function stableProfileDefinition(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableProfileDefinition).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableProfileDefinition(record[key])}`)
    .join(',')}}`
}

function resolveSecureStoreRootPath(): string {
  return resolveRuntimeRootPath(app)
}

function normalizeTextContent(content: unknown): string {
  const items = Array.isArray(content) ? content : []
  const parts: string[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as Record<string, unknown>
    if (row.type === 'text' && typeof row.text === 'string') {
      parts.push(row.text)
    } else if (row.type === 'resource' && row.resource && typeof row.resource === 'object') {
      const resource = row.resource as Record<string, unknown>
      if (typeof resource.text === 'string') {
        parts.push(resource.text)
      }
    }
  }
  return parts.join('\n\n').trim()
}

function resolveToolRisk(tool: McpToolDescriptor) {
  if (tool.annotations?.destructiveHint) {
    return 'critical' as const
  }
  if (tool.annotations?.readOnlyHint) {
    return 'low' as const
  }
  if (tool.annotations?.openWorldHint) {
    return 'high' as const
  }
  return McpToolAdapter.defaultRiskLevel(tool.name)
}

function getCompositeToolId(profileId: string, toolName: string): string {
  return `mcp.${profileId}.${toolName}`
}

function stableMcpFailure(reason: 'server-unavailable' | 'tool-failed'): Error {
  const projection = projectToolErrorCode(
    reason === 'server-unavailable' ? 'MCP_SERVER_UNAVAILABLE' : 'MCP_TOOL_FAILED'
  )
  return createMcpFailure(reason, projection.message)
}

function normalizeMcpFailure(
  error: unknown,
  fallback: 'server-unavailable' | 'tool-failed'
): Error {
  return stableMcpFailure(readMcpFailureReason(error) ?? fallback)
}

function normalizeMcpCallFailure(error: unknown, sessionClosed: boolean): Error {
  const declaredReason = readMcpFailureReason(error)
  if (declaredReason) return stableMcpFailure(declaredReason)

  const projectedCode = projectToolError(error).code
  const transportFailed =
    sessionClosed ||
    projectedCode === 'MCP_SERVER_UNAVAILABLE' ||
    projectedCode === 'TOOL_SERVICE_UNAVAILABLE' ||
    projectedCode === 'TOOL_EXECUTION_TIMEOUT'
  return stableMcpFailure(transportFailed ? 'server-unavailable' : 'tool-failed')
}

export class IntelligenceMcpRegistry {
  private readonly profiles = new Map<string, IntelligenceMcpProfile>()
  private readonly sessions = new Map<string, ConnectedMcpSession>()
  private readonly generations = new Map<string, number>()
  private readonly connecting = new Map<string, PendingMcpConnection>()

  getProfile(profileId: string): IntelligenceMcpProfile | undefined {
    const profile = this.profiles.get(profileId)
    return profile?.enabled === false ? undefined : profile
  }

  registerProfile(profile: IntelligenceMcpProfile): void {
    const existing = this.profiles.get(profile.id)
    if (existing && stableProfileDefinition(existing) === stableProfileDefinition(profile)) return

    this.profiles.set(profile.id, profile)
    this.invalidateProfile(profile.id)
    const session = this.sessions.get(profile.id)
    if (session) void this.closeSession(profile.id, session)
  }

  async unregisterProfile(profileId: string): Promise<boolean> {
    const existed = this.profiles.delete(profileId)
    await this.closeProfile(profileId)
    return existed
  }

  async closeProfile(profileId: string): Promise<void> {
    this.invalidateProfile(profileId)
    const session = this.sessions.get(profileId)
    const pending = this.connecting.get(profileId)
    await Promise.allSettled([
      ...(session ? [this.closeSession(profileId, session)] : []),
      ...(pending
        ? [pending.promise.then((connected) => this.closeSession(profileId, connected))]
        : [])
    ])
  }

  registerProfiles(profiles: IntelligenceMcpProfile[]): void {
    const incoming = new Map(profiles.map((profile) => [profile.id, profile]))
    for (const profileId of this.profiles.keys()) {
      if (incoming.has(profileId)) continue
      this.profiles.delete(profileId)
      void this.closeProfile(profileId)
    }
    for (const profile of incoming.values()) this.registerProfile(profile)
  }

  async listStructuredTools(profileIds?: string[]): Promise<AdaptedStructuredTool[]> {
    const profiles = this.getEnabledProfiles(profileIds)
    const tools: AdaptedStructuredTool[] = []

    for (const profile of profiles) {
      const session = await this.connectProfile(profile).catch((error: unknown) => {
        throw normalizeMcpFailure(error, 'server-unavailable')
      })
      const response = await this.withSessionRpc(profile.id, session, () =>
        session.client.listTools()
      ).catch((error: unknown) => {
        throw normalizeMcpFailure(error, 'server-unavailable')
      })
      for (const tool of response.tools ?? []) {
        tools.push(
          McpToolAdapter.fromDefinition({
            id: getCompositeToolId(profile.id, tool.name),
            name: getCompositeToolId(profile.id, tool.name),
            description: tool.description || `${profile.name} / ${tool.name}`,
            schema: tool.inputSchema ?? {
              type: 'object',
              properties: {}
            },
            serverId: profile.id,
            metadata: {
              profileId: profile.id,
              profileName: profile.name,
              toolName: tool.name
            },
            riskLevel: resolveToolRisk(tool),
            approvalRequired: ['high', 'critical'].includes(resolveToolRisk(tool)),
            execute: async (input) => await this.callTool(profile.id, tool.name, input)
          })
        )
      }
    }

    return tools
  }

  async callTool(profileId: string, toolName: string, input: unknown): Promise<unknown> {
    const profile = this.getProfile(profileId)
    if (!profile) throw stableMcpFailure('server-unavailable')

    const session = await this.connectProfile(profile).catch((error: unknown) => {
      throw normalizeMcpFailure(error, 'server-unavailable')
    })
    const result = await this.withSessionRpc(profileId, session, () =>
      session.client.callTool({
        name: toolName,
        arguments: input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
      })
    ).catch((error: unknown) => {
      throw normalizeMcpCallFailure(error, session.closed)
    })

    if (result.isError) throw stableMcpFailure('tool-failed')

    if (result.structuredContent) return result.structuredContent

    const text = normalizeTextContent(result.content ?? [])
    return text || result.content
  }

  async closeAll(): Promise<void> {
    const profileIds = new Set([...this.sessions.keys(), ...this.connecting.keys()])
    for (const profileId of this.profiles.keys()) this.invalidateProfile(profileId)
    await Promise.allSettled(Array.from(profileIds, (profileId) => this.closeProfile(profileId)))
  }

  private getEnabledProfiles(profileIds?: string[]): IntelligenceMcpProfile[] {
    const allow = Array.isArray(profileIds) && profileIds.length > 0 ? new Set(profileIds) : null
    return Array.from(this.profiles.values()).filter(
      (profile) => profile.enabled !== false && (!allow || allow.has(profile.id))
    )
  }

  private invalidateProfile(profileId: string): number {
    const generation = (this.generations.get(profileId) ?? 0) + 1
    this.generations.set(profileId, generation)
    return generation
  }

  private async connectProfile(profile: IntelligenceMcpProfile): Promise<ConnectedMcpSession> {
    const currentProfile = this.profiles.get(profile.id)
    if (!currentProfile) throw stableMcpFailure('server-unavailable')
    if (currentProfile !== profile) return await this.connectProfile(currentProfile)

    const generation = this.generations.get(profile.id) ?? 0
    const cached = this.sessions.get(profile.id)
    if (cached?.generation === generation && !cached.closed) {
      this.touchSession(profile.id, cached)
      return cached
    }

    const pending = this.connecting.get(profile.id)
    if (pending?.generation === generation) return await pending.promise

    const promise = this.openSession(profile, generation)
    this.connecting.set(profile.id, { generation, promise })
    try {
      const session = await promise
      if (
        this.generations.get(profile.id) !== generation ||
        this.profiles.get(profile.id) !== profile
      ) {
        await this.closeSession(profile.id, session)
        const replacement = this.profiles.get(profile.id)
        if (!replacement) throw stableMcpFailure('server-unavailable')
        return await this.connectProfile(replacement)
      }
      this.sessions.set(profile.id, session)
      this.touchSession(profile.id, session)
      return session
    } finally {
      if (this.connecting.get(profile.id)?.promise === promise) this.connecting.delete(profile.id)
    }
  }

  private async openSession(
    profile: IntelligenceMcpProfile,
    generation: number
  ): Promise<ConnectedMcpSession> {
    const client = new Client({ name: 'tuff-intelligence', version: '1.0.0' })
    const transport =
      profile.transport.type === 'stdio'
        ? new StdioClientTransport({
            command: profile.transport.command,
            args: profile.transport.args,
            cwd: profile.transport.cwd,
            env: await this.resolveStdioEnv(
              profile as Extract<IntelligenceMcpProfile, { transport: { type: 'stdio' } }>
            ),
            stderr: 'pipe'
          })
        : new StreamableHTTPClientTransport(new URL(profile.transport.url), {
            requestInit: {
              headers: await this.resolveHttpHeaders(
                profile as Extract<
                  IntelligenceMcpProfile,
                  { transport: { type: 'streamable-http' } }
                >
              )
            }
          })

    let session: ConnectedMcpSession | null = null
    // A close can arrive while connect() is still awaiting, before there is a session object to
    // mark. Recording it is what stops the object built below from being returned and cached
    // with closed: false, leaving the registry serving a dead transport (#777).
    let closedBeforeSessionExisted = false
    client.onerror = () => {
      mcpLog.warn('MCP transport failed', { meta: { code: 'MCP_SERVER_UNAVAILABLE' } })
    }
    client.onclose = () => {
      if (session) {
        this.removeSession(profile.id, session)
      } else {
        closedBeforeSessionExisted = true
      }
      mcpLog.info('MCP transport disconnected')
    }

    await client.connect(transport)
    if (closedBeforeSessionExisted) {
      // Nothing to remove -- this session was never added to this.sessions. connectProfile
      // propagates the throw and clears its pending entry in the finally, so the next caller
      // starts a fresh connect rather than awaiting a dead one.
      throw stableMcpFailure('server-unavailable')
    }
    session = {
      client,
      transport,
      generation,
      idleTimer: null,
      rpcCount: 0,
      closed: false
    }
    return session
  }

  private async withSessionRpc<T>(
    profileId: string,
    session: ConnectedMcpSession,
    operation: () => Promise<T>
  ): Promise<T> {
    if (session.closed) throw stableMcpFailure('server-unavailable')
    session.rpcCount += 1
    clearTimeout(session.idleTimer ?? undefined)
    session.idleTimer = null
    try {
      return await operation()
    } finally {
      session.rpcCount -= 1
      if (session.rpcCount === 0 && this.sessions.get(profileId) === session && !session.closed)
        this.touchSession(profileId, session)
    }
  }

  private touchSession(profileId: string, session: ConnectedMcpSession): void {
    clearTimeout(session.idleTimer ?? undefined)
    session.idleTimer = null
    if (session.rpcCount > 0 || session.closed || this.sessions.get(profileId) !== session) return
    session.idleTimer = setTimeout(
      () => {
        void this.closeSession(profileId, session)
      },
      5 * 60 * 1000
    )
    session.idleTimer.unref?.()
  }

  private removeSession(profileId: string, session: ConnectedMcpSession): void {
    session.closed = true
    clearTimeout(session.idleTimer ?? undefined)
    session.idleTimer = null
    if (this.sessions.get(profileId) === session) this.sessions.delete(profileId)
  }

  private async closeSession(profileId: string, session: ConnectedMcpSession): Promise<void> {
    if (session.closed) return
    this.removeSession(profileId, session)
    try {
      if (session.transport instanceof StreamableHTTPClientTransport)
        await session.transport.terminateSession().catch(() => undefined)
      await session.client.close()
    } catch {
      mcpLog.warn('MCP session close failed', { meta: { code: 'MCP_SERVER_UNAVAILABLE' } })
    }
  }

  private async resolveStdioEnv(
    profile: Extract<IntelligenceMcpProfile, { transport: { type: 'stdio' } }>
  ): Promise<Record<string, string>> {
    const env = { ...(profile.transport.env ?? {}) }
    if (!isSecureStoreAvailable(resolveSecureStoreRootPath())) return env
    for (const [key, authRef] of Object.entries(profile.transport.envAuthRefs ?? {})) {
      const value = await getSecureStoreValue(
        resolveSecureStoreRootPath(),
        authRef,
        'ai-import-secret',
        () => mcpLog.warn('MCP credential resolution failed')
      )
      if (value !== null) env[key] = value
    }
    return env
  }

  private async resolveHttpHeaders(
    profile: Extract<IntelligenceMcpProfile, { transport: { type: 'streamable-http' } }>
  ): Promise<Record<string, string>> {
    const headers = { ...(profile.transport.headers ?? {}) }
    if (isSecureStoreAvailable(resolveSecureStoreRootPath())) {
      for (const [name, authRef] of Object.entries(profile.transport.headerAuthRefs ?? {})) {
        const value = await getSecureStoreValue(
          resolveSecureStoreRootPath(),
          authRef,
          'ai-import-secret',
          () => mcpLog.warn('MCP credential resolution failed')
        )
        if (value !== null) headers[name] = value
      }
    }
    const tokenKey = profile.transport.authTokenKey?.trim()
    if (!tokenKey || headers.Authorization) return headers
    if (!isSecureStoreAvailable(resolveSecureStoreRootPath())) return headers

    const token = await getSecureStoreValue(resolveSecureStoreRootPath(), tokenKey, () =>
      mcpLog.warn('MCP credential resolution failed')
    )
    if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`
    return headers
  }
}

export const intelligenceMcpRegistry = new IntelligenceMcpRegistry()

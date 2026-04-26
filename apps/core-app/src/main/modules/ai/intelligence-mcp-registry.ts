import type { AdaptedStructuredTool } from '@talex-touch/tuff-intelligence'
import { McpToolAdapter } from '@talex-touch/tuff-intelligence'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { app } from 'electron'
import { getSecureStoreValue, isSecureStoreAvailable } from '../../utils/secure-store'
import { createLogger } from '../../utils/logger'

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
      }
      metadata?: Record<string, unknown>
    }

type ConnectedMcpSession = {
  client: Client
  transport: StdioClientTransport | StreamableHTTPClientTransport
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

export class IntelligenceMcpRegistry {
  private profiles = new Map<string, IntelligenceMcpProfile>()
  private sessions = new Map<string, ConnectedMcpSession>()

  registerProfile(profile: IntelligenceMcpProfile): void {
    this.profiles.set(profile.id, profile)
  }

  registerProfiles(profiles: IntelligenceMcpProfile[]): void {
    this.profiles.clear()
    for (const profile of profiles) {
      this.registerProfile(profile)
    }
  }

  async listStructuredTools(profileIds?: string[]): Promise<AdaptedStructuredTool[]> {
    const profiles = this.getEnabledProfiles(profileIds)
    const tools: AdaptedStructuredTool[] = []

    for (const profile of profiles) {
      const session = await this.connectProfile(profile)
      const response = await session.client.listTools()
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
            execute: async (input) => {
              return await this.callTool(profile.id, tool.name, input)
            }
          })
        )
      }
    }

    return tools
  }

  async callTool(profileId: string, toolName: string, input: unknown): Promise<unknown> {
    const profile = this.profiles.get(profileId)
    if (!profile || profile.enabled === false) {
      throw new Error(`MCP profile ${profileId} is not available`)
    }

    const session = await this.connectProfile(profile)
    const result = await session.client.callTool({
      name: toolName,
      arguments: input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
    })

    if (result.isError) {
      throw new Error(normalizeTextContent(result.content ?? []) || `MCP tool ${toolName} failed`)
    }

    if (result.structuredContent) {
      return result.structuredContent
    }

    const text = normalizeTextContent(result.content ?? [])
    return text || result.content
  }

  async closeAll(): Promise<void> {
    const sessions = Array.from(this.sessions.values())
    this.sessions.clear()

    await Promise.allSettled(
      sessions.map(async (session) => {
        try {
          if (session.transport instanceof StreamableHTTPClientTransport) {
            await session.transport.terminateSession().catch(() => undefined)
          }
          await session.client.close()
        } catch (error) {
          mcpLog.warn('Failed to close MCP session', { error })
        }
      })
    )
  }

  private getEnabledProfiles(profileIds?: string[]): IntelligenceMcpProfile[] {
    const allow = Array.isArray(profileIds) && profileIds.length > 0 ? new Set(profileIds) : null
    return Array.from(this.profiles.values()).filter((profile) => {
      if (profile.enabled === false) {
        return false
      }
      if (allow && !allow.has(profile.id)) {
        return false
      }
      return true
    })
  }

  private async connectProfile(profile: IntelligenceMcpProfile): Promise<ConnectedMcpSession> {
    const cached = this.sessions.get(profile.id)
    if (cached) {
      return cached
    }

    const client = new Client({
      name: 'tuff-intelligence',
      version: '1.0.0'
    })

    const transport =
      profile.transport.type === 'stdio'
        ? new StdioClientTransport({
            command: profile.transport.command,
            args: profile.transport.args,
            cwd: profile.transport.cwd,
            env: profile.transport.env,
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

    client.onerror = (error) => {
      mcpLog.warn(`MCP profile ${profile.id} transport error`, { error })
    }
    client.onclose = () => {
      this.sessions.delete(profile.id)
      mcpLog.info(`MCP profile ${profile.id} disconnected`)
    }

    await client.connect(transport)

    const session: ConnectedMcpSession = {
      client,
      transport
    }
    this.sessions.set(profile.id, session)
    return session
  }

  private async resolveHttpHeaders(
    profile: Extract<IntelligenceMcpProfile, { transport: { type: 'streamable-http' } }>
  ): Promise<Record<string, string>> {
    const headers = {
      ...(profile.transport.headers ?? {})
    }
    const tokenKey = profile.transport.authTokenKey?.trim()
    if (!tokenKey || headers.Authorization) {
      return headers
    }
    if (!isSecureStoreAvailable()) {
      return headers
    }

    const token = await getSecureStoreValue(
      resolveSecureStoreRootPath(),
      tokenKey,
      (message, error) => {
        mcpLog.warn(`${message} for MCP profile ${profile.id}`, { error })
      }
    )
    if (token?.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`
    }
    return headers
  }
}

export const intelligenceMcpRegistry = new IntelligenceMcpRegistry()

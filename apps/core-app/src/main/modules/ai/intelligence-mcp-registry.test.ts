import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registryMocks = vi.hoisted(() => {
  const clients: Array<InstanceType<typeof Client>> = []
  const stdioTransports: Array<InstanceType<typeof StdioClientTransport>> = []
  const httpTransports: Array<InstanceType<typeof StreamableHTTPClientTransport>> = []
  const connectResults: Array<Promise<void>> = []
  const mcpLog = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  const getSecureStoreValue = vi.fn(async (..._args: unknown[]) => null)
  const isSecureStoreAvailable = vi.fn(() => false)

  class Client {
    onerror: ((error: unknown) => void) | undefined
    onclose: (() => void) | undefined
    connect = vi.fn(() => connectResults.shift() ?? Promise.resolve())
    listTools = vi.fn(async () => ({ tools: [] }))
    callTool = vi.fn(
      async (
        ..._args: unknown[]
      ): Promise<{
        content: Array<{ type: string; text: string }>
        isError?: boolean
        structuredContent?: unknown
      }> => ({ content: [{ type: 'text', text: 'tool result' }] })
    )
    close = vi.fn(async () => undefined)

    constructor() {
      clients.push(this)
    }
  }

  class StdioClientTransport {
    constructor(readonly options: unknown) {
      stdioTransports.push(this)
    }
  }

  class StreamableHTTPClientTransport {
    terminateSession = vi.fn(async () => undefined)

    constructor(
      readonly url: URL,
      readonly options: unknown
    ) {
      httpTransports.push(this)
    }
  }

  const reset = () => {
    clients.splice(0)
    stdioTransports.splice(0)
    httpTransports.splice(0)
    connectResults.splice(0)
  }

  return {
    Client,
    StdioClientTransport,
    StreamableHTTPClientTransport,
    clients,
    stdioTransports,
    httpTransports,
    connectResults,
    mcpLog,
    getSecureStoreValue,
    isSecureStoreAvailable,
    reset
  }
})

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/tuff-mcp-registry-test') }
}))

vi.mock('../../utils/app-root-path', () => ({
  resolveRuntimeRootPath: vi.fn(() => '/tmp/tuff-mcp-registry-test')
}))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    child: () => registryMocks.mcpLog
  })
}))

vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: registryMocks.getSecureStoreValue,
  isSecureStoreAvailable: registryMocks.isSecureStoreAvailable
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: registryMocks.Client
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: registryMocks.StdioClientTransport
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: registryMocks.StreamableHTTPClientTransport
}))

vi.mock('@talex-touch/tuff-intelligence', () => ({
  McpToolAdapter: {
    defaultRiskLevel: vi.fn(() => 'low'),
    fromDefinition: vi.fn((definition: unknown) => definition)
  }
}))

import { readMcpFailureReason } from './intelligence-mcp-failure'
import { IntelligenceMcpRegistry } from './intelligence-mcp-registry'

function serializeWithErrorDetails(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (!(nested instanceof Error)) return nested
    return Object.fromEntries(
      Object.getOwnPropertyNames(nested).map((name) => [
        name,
        (nested as unknown as Record<string, unknown>)[name]
      ])
    )
  })
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, resolve, reject }
}

function stdioProfile(command = 'mcp-one'): IntelligenceMcpProfile {
  return {
    id: 'mcp-profile',
    name: 'Test MCP',
    transport: { type: 'stdio', command }
  }
}

describe('IntelligenceMcpRegistry session lifecycle', () => {
  const registries: IntelligenceMcpRegistry[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    registryMocks.reset()
    registryMocks.getSecureStoreValue.mockResolvedValue(null)
    registryMocks.isSecureStoreAvailable.mockReturnValue(false)
  })

  afterEach(async () => {
    await Promise.all(registries.splice(0).map(async (registry) => await registry.closeAll()))
    vi.useRealTimers()
  })

  it('deduplicates simultaneous calls onto one in-flight connection', async () => {
    const connection = deferred<void>()
    registryMocks.connectResults.push(connection.promise)
    const registry = new IntelligenceMcpRegistry()
    registries.push(registry)
    registry.registerProfile(stdioProfile())

    const first = registry.callTool('mcp-profile', 'status', {})
    const second = registry.callTool('mcp-profile', 'status', {})
    await Promise.resolve()

    expect(registryMocks.clients).toHaveLength(1)
    connection.resolve()

    await expect(Promise.all([first, second])).resolves.toEqual(['tool result', 'tool result'])
    expect(registryMocks.clients[0].connect).toHaveBeenCalledTimes(1)
    expect(registryMocks.clients[0].callTool).toHaveBeenCalledTimes(2)
  })

  it('连接期间收到 close 时不缓存该会话,下一次调用重新连接', async () => {
    // onclose is installed before the await, but the session object only exists after it. A
    // close landing in that window used to hit `session === null`, do nothing, and let the
    // freshly built object be returned and cached with closed: false (#777).
    const connection = deferred<void>()
    registryMocks.connectResults.push(connection.promise)
    const registry = new IntelligenceMcpRegistry()
    registries.push(registry)
    registry.registerProfile(stdioProfile())

    const call = registry.callTool('mcp-profile', 'status', {})
    await Promise.resolve()

    // The transport dies while connect() is still pending.
    registryMocks.clients[0].onclose?.()
    connection.resolve()

    await expect(call).rejects.toMatchObject({
      message: 'MCP server is unavailable.',
      mcpFailureReason: 'server-unavailable'
    })

    // The dead session must not have been cached: a second call has to build a new client.
    const second = registry.callTool('mcp-profile', 'status', {})
    await Promise.resolve()
    expect(registryMocks.clients).toHaveLength(2)
    await expect(second).resolves.toBe('tool result')
  })

  it('closes a stale connecting generation and retries against the replacement profile', async () => {
    const firstConnection = deferred<void>()
    registryMocks.connectResults.push(firstConnection.promise)
    const registry = new IntelligenceMcpRegistry()
    registries.push(registry)
    registry.registerProfile(stdioProfile('mcp-old'))

    const call = registry.callTool('mcp-profile', 'status', {})
    await Promise.resolve()
    expect(registryMocks.clients).toHaveLength(1)

    registry.registerProfile(stdioProfile('mcp-replacement'))
    firstConnection.resolve()

    await expect(call).resolves.toBe('tool result')
    expect(registryMocks.clients).toHaveLength(2)
    expect(registryMocks.clients[0].close).toHaveBeenCalledTimes(1)
    expect(registryMocks.stdioTransports[1].options).toMatchObject({ command: 'mcp-replacement' })
  })

  it('does not close an idle session while its RPC is still active', async () => {
    const toolResult = deferred<{ content: Array<{ type: 'text'; text: string }> }>()
    const registry = new IntelligenceMcpRegistry()
    registries.push(registry)
    registry.registerProfile(stdioProfile())

    await expect(registry.callTool('mcp-profile', 'prime-session', {})).resolves.toBe('tool result')
    registryMocks.clients[0].callTool.mockReturnValueOnce(toolResult.promise)

    const activeCall = registry.callTool('mcp-profile', 'long-running', {})
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)

    expect(registryMocks.clients[0].close).not.toHaveBeenCalled()
    toolResult.resolve({ content: [{ type: 'text', text: 'finished' }] })
    await expect(activeCall).resolves.toBe('finished')
  })

  it('projects missing, server and tool failures to stable MCP reasons', async () => {
    const canary = 'sk-live-secret@/Users/private/native-stack.ts:42'
    const registry = new IntelligenceMcpRegistry()
    registries.push(registry)

    const missing = await registry.callTool(canary, canary, {}).catch((error: unknown) => error)
    expect(readMcpFailureReason(missing)).toBe('server-unavailable')
    expect(missing).toMatchObject({ message: 'MCP server is unavailable.' })

    registry.registerProfile(stdioProfile())
    await expect(registry.callTool('mcp-profile', 'prime', {})).resolves.toBe('tool result')

    registryMocks.clients[0].callTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: canary }]
    })
    const toolFailure = await registry
      .callTool('mcp-profile', 'failure', {})
      .catch((error: unknown) => error)
    expect(readMcpFailureReason(toolFailure)).toBe('tool-failed')
    expect(toolFailure).toMatchObject({ message: 'MCP tool execution failed.' })

    registryMocks.clients[0].callTool.mockRejectedValueOnce(new Error(canary))
    const rejectedToolFailure = await registry
      .callTool('mcp-profile', 'rejected-tool-failure', {})
      .catch((error: unknown) => error)
    expect(readMcpFailureReason(rejectedToolFailure)).toBe('tool-failed')
    expect(rejectedToolFailure).toMatchObject({ message: 'MCP tool execution failed.' })

    registryMocks.clients[0].callTool.mockRejectedValueOnce(
      Object.assign(new Error(canary), { code: 'ECONNRESET' })
    )
    const serverFailure = await registry
      .callTool('mcp-profile', 'transport-failure', {})
      .catch((error: unknown) => error)
    expect(readMcpFailureReason(serverFailure)).toBe('server-unavailable')
    expect(serverFailure).toMatchObject({ message: 'MCP server is unavailable.' })

    const closedCall = deferred<never>()
    registryMocks.clients[0].callTool.mockReturnValueOnce(closedCall.promise)
    const disconnected = registry
      .callTool('mcp-profile', 'disconnected-in-flight', {})
      .catch((error: unknown) => error)
    await vi.waitFor(() => {
      expect(registryMocks.clients[0].callTool).toHaveBeenLastCalledWith({
        name: 'disconnected-in-flight',
        arguments: {}
      })
    })
    registryMocks.clients[0].onclose?.()
    closedCall.reject(new Error(canary))
    const disconnectedFailure = await disconnected
    expect(readMcpFailureReason(disconnectedFailure)).toBe('server-unavailable')
    expect(disconnectedFailure).toMatchObject({ message: 'MCP server is unavailable.' })

    expect(
      serializeWithErrorDetails({
        missing,
        toolFailure,
        rejectedToolFailure,
        serverFailure,
        disconnectedFailure
      })
    ).not.toContain(canary)
  })

  it('keeps transport, close and secure-store diagnostics free of raw failures and profiles', async () => {
    const canary = 'sk-live-secret@/Users/private/native-stack.ts:42'
    registryMocks.isSecureStoreAvailable.mockReturnValue(true)
    const registry = new IntelligenceMcpRegistry()
    registries.push(registry)
    registry.registerProfile({
      id: 'private-profile',
      name: 'Private MCP',
      transport: {
        type: 'stdio',
        command: 'mcp-one',
        envAuthRefs: { API_KEY: 'private-auth-ref' }
      }
    })

    await expect(registry.callTool('private-profile', 'prime', {})).resolves.toBe('tool result')
    const secureStoreCallback = registryMocks.getSecureStoreValue.mock.calls[0]?.[3] as
      | ((message: string, error: unknown) => void)
      | undefined
    secureStoreCallback?.(canary, new Error(canary))
    registryMocks.clients[0].onerror?.(new Error(canary))
    registryMocks.clients[0].close.mockRejectedValueOnce(new Error(canary))

    await registry.closeProfile('private-profile')

    const serializedLogs = serializeWithErrorDetails({
      warn: registryMocks.mcpLog.warn.mock.calls,
      info: registryMocks.mcpLog.info.mock.calls
    })
    expect(serializedLogs).not.toContain(canary)
    expect(serializedLogs).not.toContain('private-profile')
    expect(registryMocks.mcpLog.warn).toHaveBeenCalledWith('MCP credential resolution failed')
    expect(registryMocks.mcpLog.warn).toHaveBeenCalledWith('MCP transport failed', {
      meta: { code: 'MCP_SERVER_UNAVAILABLE' }
    })
    expect(registryMocks.mcpLog.warn).toHaveBeenCalledWith('MCP session close failed', {
      meta: { code: 'MCP_SERVER_UNAVAILABLE' }
    })
  })
})

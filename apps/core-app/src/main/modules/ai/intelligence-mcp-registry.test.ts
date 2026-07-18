import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registryMocks = vi.hoisted(() => {
  const clients: Array<InstanceType<typeof Client>> = []
  const stdioTransports: Array<InstanceType<typeof StdioClientTransport>> = []
  const httpTransports: Array<InstanceType<typeof StreamableHTTPClientTransport>> = []
  const connectResults: Array<Promise<void>> = []

  class Client {
    onerror: ((error: unknown) => void) | undefined
    onclose: (() => void) | undefined
    connect = vi.fn(() => connectResults.shift() ?? Promise.resolve())
    listTools = vi.fn(async () => ({ tools: [] }))
    callTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'tool result' }] }))
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
    child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  })
}))

vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: vi.fn(),
  isSecureStoreAvailable: vi.fn(() => false)
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

import { IntelligenceMcpRegistry } from './intelligence-mcp-registry'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
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
})

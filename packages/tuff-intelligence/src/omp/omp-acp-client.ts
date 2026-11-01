import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import readline from 'node:readline'
import type {
  AcpConfigOption,
  AcpInitializeResult,
  AcpPromptContent,
  AcpPromptResult,
  AcpSessionNewResult,
  AcpSessionUpdateNotification,
  AcpUsageUpdate,
  OmpAcpSpawnOptions,
  OmpSessionCreateOptions,
  OmpStreamEvent
} from './types'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export class OmpAcpSession {
  private _currentModel?: string

  get currentModel(): string | undefined {
    return this._currentModel
  }

  constructor(
    readonly sessionId: string,
    private readonly client: OmpAcpClient,
    public configOptions: AcpConfigOption[] = []
  ) {}

  async setModel(model: string): Promise<void> {
    await this.client.sendRequest('session/set_config_option', {
      sessionId: this.sessionId,
      configId: 'model',
      value: model
    })
    this._currentModel = model
  }

  async setConfig(configId: string, value: string | boolean): Promise<void> {
    await this.client.sendRequest('session/set_config_option', {
      sessionId: this.sessionId,
      configId,
      value
    })
  }

  async prompt(
    content: string | AcpPromptContent[],
    onEvent?: (event: OmpStreamEvent) => void
  ): Promise<{ output: string; usage?: AcpUsageUpdate }> {
    let output = ''
    let usage: AcpUsageUpdate | undefined

    for await (const event of this.promptStream(content)) {
      if (event.type === 'delta' && event.text) {
        output += event.text
      }
      if (event.type === 'usage' && event.usage) {
        usage = event.usage
      }
      onEvent?.(event)
    }

    return { output, usage }
  }

  async *promptStream(content: string | AcpPromptContent[]): AsyncIterable<OmpStreamEvent> {
    const formattedPrompt: AcpPromptContent[] =
      typeof content === 'string' ? [{ type: 'text', text: content }] : content

    const eventQueue: OmpStreamEvent[] = []
    let resolver: (() => void) | null = null
    const state = { finished: false }
    let failure: Error | null = null

    const pushEvent = (event: OmpStreamEvent) => {
      eventQueue.push(event)
      resolver?.()
      resolver = null
    }

    const unsubscribe = this.client.onSessionUpdate(this.sessionId, (notification) => {
      const update = notification.update
      const updateType = update.sessionUpdate

      if (updateType === 'agent_thought_chunk' && update.content?.text) {
        pushEvent({
          type: 'thinking',
          text: update.content.text,
          raw: update
        })
      } else if (updateType === 'agent_message_chunk' && update.content?.text) {
        pushEvent({
          type: 'delta',
          text: update.content.text,
          raw: update
        })
      } else if (updateType === 'usage_update' && update.usage) {
        pushEvent({
          type: 'usage',
          usage: update.usage,
          raw: update
        })
      } else if (updateType === 'config_option_update' && update.configOptions) {
        this.configOptions = update.configOptions
      } else {
        pushEvent({
          type: 'status',
          raw: update
        })
      }
    })

    const requestPromise = this.client
      .sendRequest<AcpPromptResult>('session/prompt', {
        sessionId: this.sessionId,
        prompt: formattedPrompt
      })
      .then((res) => {
        if (res.usage) {
          pushEvent({ type: 'usage', usage: res.usage, raw: res })
        }
        state.finished = true
        resolver?.()
        resolver = null
      })
      .catch((err) => {
        failure = err instanceof Error ? err : new Error(String(err))
        state.finished = true
        resolver?.()
        resolver = null
      })

    try {
      while (!state.finished || eventQueue.length > 0) {
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            resolver = resolve
          })
        }
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!
        }
        if (state.finished && eventQueue.length === 0) break
      }

      await requestPromise
      if (failure) throw failure
    } finally {
      unsubscribe()
    }
  }

  async cancel(): Promise<void> {
    await this.client.sendRequest('session/cancel', {
      sessionId: this.sessionId
    })
  }
  async close(): Promise<void> {
    await this.client.sendRequest('session/close', {
      sessionId: this.sessionId
    })
  }
}

export class OmpAcpClient extends EventEmitter {
  private nextRequestId = 1
  private readonly pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private readonly sessionListeners = new Map<
    string,
    Set<(notification: AcpSessionUpdateNotification) => void>
  >()
  private closed = false
  public agentInfo?: AcpInitializeResult['agentInfo']
  public capabilities?: AcpInitializeResult['agentCapabilities']

  constructor(private readonly process: ChildProcess) {
    super()
    this.setupProcess()
  }

  private setupProcess(): void {
    if (!this.process.stdout) throw new Error('Process stdout not readable')

    const rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false
    })

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const msg = JSON.parse(trimmed)
        this.handleMessage(msg)
      } catch (err) {
        this.emit('protocol_error', err, trimmed)
      }
    })

    this.process.on('exit', (code, signal) => {
      this.closed = true
      const error = new Error(`OMP ACP process exited (code=${code}, signal=${signal})`)
      for (const pending of this.pendingRequests.values()) {
        pending.reject(error)
      }
      this.pendingRequests.clear()
      this.emit('close', code, signal)
    })

    this.process.on('error', (err) => {
      this.emit('error', err)
    })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    if ('id' in msg && typeof msg.id === 'number') {
      const res = msg as unknown as JsonRpcResponse
      const pending = this.pendingRequests.get(res.id)
      if (pending) {
        this.pendingRequests.delete(res.id)
        if (res.error) {
          pending.reject(new Error(res.error.message || `JSON-RPC error ${res.error.code}`))
        } else {
          pending.resolve(res.result)
        }
      }
      return
    }

    if ('method' in msg && typeof msg.method === 'string') {
      const notif = msg as unknown as JsonRpcNotification
      if (notif.method === 'session/update' && notif.params) {
        const payload = notif.params as AcpSessionUpdateNotification
        const listeners = this.sessionListeners.get(payload.sessionId)
        if (listeners) {
          for (const listener of listeners) {
            listener(payload)
          }
        }
      }
      this.emit('notification', notif.method, notif.params)
    }
  }

  async sendRequest<T>(method: string, params?: unknown): Promise<T> {
    if (this.closed) throw new Error('OMP ACP client is closed')
    const id = this.nextRequestId++
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {})
    }

    return await new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      })
      const payload = `${JSON.stringify(req)}\n`
      this.process.stdin?.write(payload, 'utf8', (err) => {
        if (err) {
          this.pendingRequests.delete(id)
          reject(err)
        }
      })
    })
  }

  onSessionUpdate(
    sessionId: string,
    handler: (notification: AcpSessionUpdateNotification) => void
  ): () => void {
    let set = this.sessionListeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.sessionListeners.set(sessionId, set)
    }
    set.add(handler)

    return () => {
      const current = this.sessionListeners.get(sessionId)
      if (current) {
        current.delete(handler)
        if (current.size === 0) {
          this.sessionListeners.delete(sessionId)
        }
      }
    }
  }

  async initialize(clientInfo: { name: string; version: string } = { name: 'tuff', version: '1.0.0' }): Promise<AcpInitializeResult> {
    const result = await this.sendRequest<AcpInitializeResult>('initialize', {
      clientInfo
    })
    this.agentInfo = result.agentInfo
    this.capabilities = result.agentCapabilities
    return result
  }

  async createSession(options: OmpSessionCreateOptions = {}): Promise<OmpAcpSession> {
    const cwd = options.cwd || process.cwd()
    const result = await this.sendRequest<AcpSessionNewResult>('session/new', {
      cwd,
      mcpServers: options.mcpServers || []
    })

    const session = new OmpAcpSession(result.sessionId, this, result.configOptions || [])
    if (options.model) {
      await session.setModel(options.model)
    }
    return session
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    return await new Promise<void>((resolve) => {
      this.process.once('close', () => resolve())
      try {
        this.process.stdin?.end()
        this.process.kill('SIGTERM')
      } catch {
        resolve()
      }
    })
  }

  static async spawn(options: OmpAcpSpawnOptions = {}): Promise<OmpAcpClient> {
    const executable = options.executablePath || 'omp'
    const proc = spawn(executable, ['acp'], {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {})
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const client = new OmpAcpClient(proc)
    await client.initialize()
    return client
  }
}

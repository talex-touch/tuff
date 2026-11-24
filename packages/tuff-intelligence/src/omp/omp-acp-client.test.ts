import type { ChildProcess } from 'node:child_process'
import type { OmpStreamEvent } from './types'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { OmpAcpClient, OmpAcpSession } from './omp-acp-client'

function createMockChildProcess(options?: {
  ignoreSigterm?: boolean
}): {
  proc: ChildProcess
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  killSignals: Array<NodeJS.Signals | number | undefined>
} {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const emitter = new EventEmitter()
  const killSignals: Array<NodeJS.Signals | number | undefined> = []

  const proc = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    unref: vi.fn(),
    kill: (signal?: NodeJS.Signals | number) => {
      killSignals.push(signal)
      if (options?.ignoreSigterm && signal === 'SIGTERM') {
        return true
      }
      proc.exitCode = signal === 'SIGKILL' ? null : 0
      proc.signalCode = typeof signal === 'string' ? signal : null
      emitter.emit('exit', proc.exitCode, proc.signalCode)
      emitter.emit('close', proc.exitCode, proc.signalCode)
      return true
    },
  }) as unknown as ChildProcess & { exitCode: number | null, signalCode: NodeJS.Signals | null }

  return { proc, stdin, stdout, stderr, killSignals }
}

describe('ompAcpClient unit tests', () => {
  it('performs initialize handshake correctly', async () => {
    const { proc, stdin, stdout } = createMockChildProcess()
    const client = new OmpAcpClient(proc)

    let capturedInput = ''
    stdin.on('data', (chunk) => {
      capturedInput += chunk.toString()
      const lines = capturedInput.split('\n')
      if (lines.length > 1) {
        const req = JSON.parse(lines[0]!)
        expect(req.method).toBe('initialize')
        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              protocolVersion: 1,
              agentInfo: { name: 'omp', version: '18.14.2' },
            },
          })}\n`,
        )
      }
    })

    const res = await client.initialize({ name: 'test', version: '1.0' })
    expect(res.protocolVersion).toBe(1)
    expect(client.agentInfo?.name).toBe('omp')
    await client.close()
  })

  it('omits clientCapabilities by default and forwards them when provided on initialize', async () => {
    const { proc, stdin, stdout } = createMockChildProcess()
    const client = new OmpAcpClient(proc)
    const receivedParams: Array<Record<string, unknown>> = []

    let buffer = ''
    stdin.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim())
          continue
        const req = JSON.parse(line)
        receivedParams.push(req.params as Record<string, unknown>)
        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              protocolVersion: 1,
              agentInfo: { name: 'omp', version: '18.14.2' },
            },
          })}\n`,
        )
      }
    })

    await client.initialize({ name: 'test', version: '1.0' })
    await client.initialize({ name: 'test', version: '1.0' }, 5_000, {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    })

    expect('clientCapabilities' in receivedParams[0]!).toBe(false)
    expect(receivedParams[1]!.clientCapabilities).toEqual({
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    })
    await client.close()
  })

  it('routes session/update notifications and streams message chunks', async () => {
    const { proc, stdin, stdout } = createMockChildProcess()
    const client = new OmpAcpClient(proc)

    const session = new OmpAcpSession('session-123', client)

    stdin.on('data', (chunk) => {
      const line = chunk.toString().trim()
      const req = JSON.parse(line)
      if (req.method === 'session/prompt') {
        // Emit streaming updates before sending the response
        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session-123',
              update: {
                sessionUpdate: 'agent_thought_chunk',
                content: { type: 'thinking', text: 'analyzing...' },
              },
            },
          })}\n`,
        )

        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session-123',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: 'Hello, Tuff!' },
              },
            },
          })}\n`,
        )

        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              stopReason: 'end_turn',
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            },
          })}\n`,
        )
      }
    })

    const events: string[] = []
    const result = await session.prompt('Hello', (event) => {
      if (event.type === 'thinking')
        events.push(`think:${event.text}`)
      if (event.type === 'delta')
        events.push(`delta:${event.text}`)
    })

    expect(result.output).toBe('Hello, Tuff!')
    expect(events).toEqual(['think:analyzing...', 'delta:Hello, Tuff!'])
    await client.close()
  })

  it('maps tool_call, tool_call_update, and tool_result notifications to structured stream events', async () => {
    const { proc, stdin, stdout } = createMockChildProcess()
    const client = new OmpAcpClient(proc)
    const session = new OmpAcpSession('session-tools', client)

    stdin.on('data', (chunk) => {
      const req = JSON.parse(chunk.toString().trim())
      if (req.method !== 'session/prompt')
        return

      stdout.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'session-tools',
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'call-1',
              title: 'file.read',
              status: 'in_progress',
              rawInput: { path: 'README.md' },
            },
          },
        })}\n`,
      )
      stdout.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'session-tools',
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: 'call-1',
              status: 'completed',
              rawOutput: 'readme text',
            },
          },
        })}\n`,
      )
      stdout.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          result: { stopReason: 'end_turn' },
        })}\n`,
      )
    })

    const events: OmpStreamEvent[] = []
    for await (const event of session.promptStream('Read readme')) {
      events.push(event)
    }

    expect(events).toEqual([
      expect.objectContaining({
        type: 'tool_call',
        toolCall: expect.objectContaining({
          toolCallId: 'call-1',
          toolName: 'file.read',
          args: { path: 'README.md' },
          isError: false,
        }),
      }),
      expect.objectContaining({
        type: 'tool_result',
        toolCall: expect.objectContaining({
          toolCallId: 'call-1',
          result: 'readme text',
          status: 'completed',
          isError: false,
        }),
      }),
    ])
    await client.close()
  })

  it('handles incoming session/request_permission RPCs via handler and fails closed without one', async () => {
    const { proc, stdin, stdout } = createMockChildProcess()
    const client = new OmpAcpClient(proc)

    const replies: Array<Record<string, unknown>> = []
    stdin.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim())
          replies.push(JSON.parse(line))
      }
    })

    // Without a handler: fails closed with cancelled outcome
    stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'session/request_permission',
        params: { sessionId: 's1', options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] },
      })}\n`,
    )

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(replies[0]).toEqual({
      jsonrpc: '2.0',
      id: 10,
      result: { outcome: { outcome: 'cancelled' } },
    })

    // With a handler: returns handler response
    client.setRequestHandler(async (method, params) => {
      expect(method).toBe('session/request_permission')
      expect((params as { sessionId: string }).sessionId).toBe('s1')
      return { outcome: { outcome: 'selected', optionId: 'allow' } }
    })

    stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'session/request_permission',
        params: { sessionId: 's1', options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }] },
      })}\n`,
    )

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(replies[1]).toEqual({
      jsonrpc: '2.0',
      id: 11,
      result: { outcome: { outcome: 'selected', optionId: 'allow' } },
    })

    await client.close()
  })

  it('aborts promptStream immediately on AbortSignal and sends session/cancel', async () => {
    const { proc, stdin } = createMockChildProcess()
    const client = new OmpAcpClient(proc)
    const session = new OmpAcpSession('session-abort', client)
    const sentMethods: string[] = []

    stdin.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim())
          continue
        const req = JSON.parse(line)
        sentMethods.push(req.method)
      }
    })

    const controller = new AbortController()
    const collected: OmpStreamEvent[] = []
    const streamPromise = (async () => {
      for await (const event of session.promptStream('Hang forever', { signal: controller.signal })) {
        collected.push(event)
      }
    })()

    await new Promise(resolve => setTimeout(resolve, 15))
    controller.abort()
    await streamPromise

    expect(collected).toEqual([])
    expect(sentMethods).toContain('session/prompt')
    expect(sentMethods).toContain('session/cancel')
    await client.close()
  })

  it('rejects pending requests on process error without uncaught EventEmitter exception', async () => {
    const { proc } = createMockChildProcess()
    const client = new OmpAcpClient(proc)

    const initPromise = client.initialize()
    proc.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))

    await expect(initPromise).rejects.toThrow('spawn ENOENT')
    expect(client.isClosed()).toBe(true)
  })

  it('escalates from SIGTERM to SIGKILL on close() when process ignores SIGTERM', async () => {
    const { proc, killSignals } = createMockChildProcess({ ignoreSigterm: true })
    const client = new OmpAcpClient(proc)

    await client.close()

    expect(killSignals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(client.isClosed()).toBe(true)
  })
})

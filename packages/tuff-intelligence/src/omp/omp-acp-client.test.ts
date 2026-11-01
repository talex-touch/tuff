import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { OmpAcpClient, OmpAcpSession } from './omp-acp-client'
import { resolveOmpExecutable } from '../../../../apps/core-app/src/main/modules/ai/providers/pi-cli-runtime'

function createMockChildProcess(): {
  proc: ChildProcess
  stdin: PassThrough
  stdout: PassThrough
} {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const emitter = new EventEmitter()

  const proc = Object.assign(emitter, {
    stdin,
    stdout,
    stderr: new PassThrough(),
    kill: () => {
      emitter.emit('exit', 0, null)
      emitter.emit('close', 0, null)
      return true
    }
  }) as unknown as ChildProcess

  return { proc, stdin, stdout }
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
              agentInfo: { name: 'omp', version: '18.14.2' }
            }
          })}\n`
        )
      }
    })

    const res = await client.initialize({ name: 'test', version: '1.0' })
    expect(res.protocolVersion).toBe(1)
    expect(client.agentInfo?.name).toBe('omp')
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
                content: { type: 'thinking', text: 'analyzing...' }
              }
            }
          })}\n`
        )

        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session-123',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: 'Hello, Tuff!' }
              }
            }
          })}\n`
        )

        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              stopReason: 'end_turn',
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
            }
          })}\n`
        )
      }
    })

    const events: string[] = []
    const result = await session.prompt('Hello', (event) => {
      if (event.type === 'thinking') events.push(`think:${event.text}`)
      if (event.type === 'delta') events.push(`delta:${event.text}`)
    })

    expect(result.output).toBe('Hello, Tuff!')
    expect(events).toEqual(['think:analyzing...', 'delta:Hello, Tuff!'])
  })
})

describe('ompAcpClient live integration smoke', () => {
  it('connects to real omp CLI via ACP when installed', async () => {
    const ompPath = await resolveOmpExecutable()
    if (!ompPath) {
      return
    }

    const client = await OmpAcpClient.spawn({
      executablePath: ompPath,
      cwd: '/tmp'
    })

    expect(client.agentInfo).toBeDefined()
    expect(client.agentInfo?.name).toBe('omp')

    const session = await client.createSession({
      cwd: '/tmp',
      model: 'cpa/gemini-3.8-flash'
    })

    expect(session.sessionId).toBeDefined()

    const receivedChunks: string[] = []
    const res = await session.prompt('Say "Live ACP Smoke Pass" in exactly 4 words.', (ev) => {
      if (ev.type === 'delta' && ev.text) {
        receivedChunks.push(ev.text)
      }
    })

    expect(res.output).toBeDefined()
    expect(res.output.toLowerCase()).toContain('live acp smoke pass')
    expect(receivedChunks.length).toBeGreaterThan(0)

    await session.close()
    await client.close()
  }, 20000)
})

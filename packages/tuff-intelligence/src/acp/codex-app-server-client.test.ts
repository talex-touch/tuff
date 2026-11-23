import type { CliPermissionRequest, CliRuntimeStreamEvent } from './types'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  buildCodexAppServerSpawnConfig,
  CodexAppServerClient,
  CodexAppServerSession,
} from './codex-app-server-client'

const FAKE_CODEX_SERVER = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

const pendingApprovals = new Map();

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);

  // Incoming response from client to approval request
  if (msg.id !== undefined && !msg.method) {
    const cb = pendingApprovals.get(msg.id);
    if (cb) {
      pendingApprovals.delete(msg.id);
      cb(msg.result);
    }
    return;
  }

  // Note: intentionally omit "jsonrpc": "2.0" on several frames to test wire compatibility!
  if (msg.method === 'initialize') {
    send({
      id: msg.id,
      result: { serverInfo: { name: 'codex-app-server', version: '0.42.0' } },
    });
    return;
  }

  if (msg.method === 'initialized') {
    return;
  }

  if (msg.method === 'thread/start') {
    send({
      id: msg.id,
      result: {
        thread: { id: 'thread-1', cwd: msg.params.cwd },
        echoApprovalPolicy: msg.params.approvalPolicy,
      },
    });
    return;
  }

  if (msg.method === 'thread/resume') {
    send({
      id: msg.id,
      result: { thread: { id: msg.params.threadId, cwd: msg.params.cwd } },
    });
    return;
  }

  if (msg.method === 'turn/start') {
    const threadId = msg.params.threadId;
    const text = msg.params.input?.[0]?.text ?? '';
    const turnId = 'turn-1';
    send({ id: msg.id, result: { turn: { id: turnId, status: 'inProgress' } } });

    if (text === 'stream-full') {
      process.stdout.write('malformed stdout line\\n');
      send({
        method: 'item/reasoning/summaryTextDelta',
        params: { threadId, turnId, delta: 'Thinking ' },
      });
      send({
        method: 'item/reasoning/textDelta',
        params: { threadId, turnId, delta: 'deeply' },
      });
      send({
        method: 'item/started',
        params: {
          threadId,
          turnId,
          item: { id: 'cmd-1', type: 'commandExecution', command: 'ls -la', cwd: msg.params.cwd },
        },
      });
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: { id: 'cmd-1', type: 'commandExecution', status: 'completed', exitCode: 0, aggregatedOutput: 'file.ts' },
        },
      });
      // Non-fatal error item (pi-provider-contracts.md §11.3.2)
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: { id: 'err-warn', type: 'error', message: 'transient warning' },
        },
      });
      // Streamed message item (should NOT be duplicated on item/completed)
      send({
        method: 'item/agentMessage/delta',
        params: { threadId, turnId, itemId: 'msg-1', delta: 'Hello' },
      });
      send({
        method: 'item/agentMessage/delta',
        params: { threadId, turnId, itemId: 'msg-1', delta: ' Codex!' },
      });
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: { id: 'msg-1', type: 'agentMessage', text: 'Hello Codex!' },
        },
      });
      // Second non-streamed message item (SHOULD emit delta from item/completed)
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: { id: 'msg-2', type: 'agentMessage', text: ' Done.' },
        },
      });
      send({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId,
          tokenUsage: {
            last: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 25 },
          },
        },
      });
      send({
        method: 'turn/completed',
        params: { threadId, turn: { id: turnId, status: 'completed' } },
      });
      return;
    }

    if (text === 'check-input-and-policy') {
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: {
            id: 'msg-echo',
            type: 'agentMessage',
            text: JSON.stringify({
              approvalPolicy: msg.params.approvalPolicy,
              input: msg.params.input,
            }),
          },
        },
      });
      send({
        method: 'turn/completed',
        params: { threadId, turn: { id: turnId, status: 'completed' } },
      });
      return;
    }

    if (text === 'approvals') {
      pendingApprovals.set(901, (res1) => {
        pendingApprovals.set(902, (res2) => {
          pendingApprovals.set(903, (res3) => {
            send({
              method: 'item/agentMessage/delta',
              params: {
                threadId,
                turnId,
                itemId: 'msg-appr',
                delta: JSON.stringify({ cmd: res1, file: res2, perm: res3 }),
              },
            });
            send({
              method: 'turn/completed',
              params: { threadId, turn: { id: turnId, status: 'completed' } },
            });
          });
          send({
            id: 903,
            method: 'item/permissions/requestApproval',
            params: { threadId, itemId: 'p-3', permissions: { network: true }, reason: 'Need network' },
          });
        });
        send({
          id: 902,
          method: 'item/fileChange/requestApproval',
          params: { threadId, itemId: 'f-2', reason: 'Write file' },
        });
      });
      send({
        id: 901,
        method: 'item/commandExecution/requestApproval',
        params: { threadId, itemId: 'c-1', command: 'npm test', reason: 'Run tests' },
      });
      return;
    }

    if (text === 'turn-fail') {
      send({
        method: 'turn/completed',
        params: {
          threadId,
          turn: { id: turnId, status: 'failed', error: { message: 'quota exceeded' } },
        },
      });
      return;
    }

    if (text === 'premature-exit') {
      process.stderr.write('fatal codex crash\\n');
      process.exit(2);
    }

    if (text === 'delta-without-item-id') {
      send({
        method: 'item/agentMessage/delta',
        params: { threadId, turnId, delta: 'No-id delta' },
      });
      send({
        method: 'item/completed',
        params: {
          threadId,
          turnId,
          item: { id: 'msg-final-id', type: 'agentMessage', text: 'No-id delta' },
        },
      });
      send({
        method: 'turn/completed',
        params: { threadId, turn: { id: turnId, status: 'completed' } },
      });
      return;
    }

    if (text === 'hang') {
      return;
    }
  }

  if (msg.method === 'turn/interrupt') {
    send({ id: msg.id, result: { interrupted: true } });
  }
});
`

describe('codexAppServerClient unit & fake-subprocess tests', () => {
  it('serializes MCP secrets into child env vars (NEVER literal tokens in argv) and supports strictMcpServers', () => {
    const config = buildCodexAppServerSpawnConfig({
      strictMcpServers: true,
      mcpServers: [
        {
          name: 'tuff-host',
          type: 'http',
          url: 'http://127.0.0.1:4123/mcp',
          headers: [
            { name: 'Authorization', value: 'Bearer secret-bearer-token-123' },
            { name: 'X-Custom-Secret', value: 'hdr-secret-456' },
          ],
        },
        {
          name: 'local-stdio',
          type: 'stdio',
          command: '/usr/bin/mcp-tool',
          args: ['--serve'],
          env: { MCP_API_KEY: 'stdio-secret-789' },
        },
      ],
    })

    // Must start with app-server --stdio and clear ambient mcp_servers first
    expect(config.args.slice(0, 4)).toEqual(['app-server', '--stdio', '-c', 'mcp_servers={}'])

    const joinedArgs = config.args.join(' ')
    expect(joinedArgs).not.toContain('secret-bearer-token-123')
    expect(joinedArgs).not.toContain('hdr-secret-456')
    expect(joinedArgs).not.toContain('stdio-secret-789')

    expect(config.env.TUFF_MCP_TOKEN_0).toBe('secret-bearer-token-123')
    expect(config.env.TUFF_MCP_HDR_0_0).toBe('hdr-secret-456')
    expect(config.env.MCP_API_KEY).toBe('stdio-secret-789')

    expect(config.args).toContain('mcp_servers.tuff-host.url="http://127.0.0.1:4123/mcp"')
    expect(config.args).toContain('mcp_servers.tuff-host.bearer_token_env_var="TUFF_MCP_TOKEN_0"')
    expect(config.args).toContain('mcp_servers.tuff-host.env_http_headers={"X-Custom-Secret"="TUFF_MCP_HDR_0_0"}')
    expect(config.args).toContain('mcp_servers.local-stdio.command="/usr/bin/mcp-tool"')
    expect(config.args).toContain('mcp_servers.local-stdio.args=["--serve"]')
    expect(config.args).toContain('mcp_servers.local-stdio.env_vars=["MCP_API_KEY"]')
  })

  it('streams reasoning, tool calls, non-duplicated agent deltas, non-fatal error items, and OpenAI usage over real stdio', async () => {
    const { spawn } = await import('node:child_process')
    const proc = spawn(process.execPath, ['-e', FAKE_CODEX_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client = new CodexAppServerClient(proc)
    const protocolErrors: string[] = []
    client.on('protocol_error', (_err, line) => protocolErrors.push(line))

    try {
      await client.initialize()
      expect(client.agentInfo).toEqual({ name: 'codex-app-server', version: '0.42.0' })

      const session = await client.createSession({
        cwd: process.cwd(),
        model: 'o3',
        reasoningEffort: 'high',
        permissionMode: 'full', // must STILL send approvalPolicy: 'untrusted'
      })
      expect(session).toBeInstanceOf(CodexAppServerSession)
      expect(session.sessionId).toBe('thread-1')

      const events: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('stream-full')) {
        events.push(ev)
      }

      expect(protocolErrors).toEqual(['malformed stdout line'])
      expect(events).toEqual([
        expect.objectContaining({ type: 'thinking', text: 'Thinking ' }),
        expect.objectContaining({ type: 'thinking', text: 'deeply' }),
        expect.objectContaining({
          type: 'tool_call',
          toolCall: expect.objectContaining({
            toolCallId: 'cmd-1',
            toolName: 'commandExecution',
            args: { command: 'ls -la', cwd: process.cwd() },
            isError: false,
          }),
        }),
        expect.objectContaining({
          type: 'tool_result',
          toolCall: expect.objectContaining({
            toolCallId: 'cmd-1',
            toolName: 'commandExecution',
            result: 'file.ts',
            status: 'completed',
            isError: false,
          }),
        }),
        expect.objectContaining({ type: 'status', status: 'transient warning' }),
        expect.objectContaining({ type: 'delta', text: 'Hello' }),
        expect.objectContaining({ type: 'delta', text: ' Codex!' }),
        expect.objectContaining({ type: 'delta', text: ' Done.' }),
        expect.objectContaining({
          type: 'usage',
          usage: {
            inputTokens: 100, // cached_input_tokens NOT added on top
            outputTokens: 25,
            totalTokens: 125,
            cacheReadTokens: 40,
          },
        }),
      ])

      // Verify image block mapping + always-untrusted approvalPolicy even in 'full' mode
      const echoEvents: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream([
        { type: 'text', text: 'check-input-and-policy' },
        { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
        { type: 'image', mimeType: 'image/png' }, // malformed: missing data -> skipped
        { type: 'image', data: 'orphan' }, // malformed: missing mimeType -> skipped
      ])) {
        echoEvents.push(ev)
      }
      const echoDelta = echoEvents.find(e => e.type === 'delta')
      expect(echoDelta?.type).toBe('delta')
      const parsedEcho = JSON.parse((echoDelta as { type: 'delta', text: string }).text)
      expect(parsedEcho.approvalPolicy).toBe('untrusted')
      expect(parsedEcho.input).toEqual([
        { type: 'text', text: 'check-input-and-policy' },
        { type: 'image', url: 'data:image/png;base64,iVBORw0KGgo=' },
      ])

      // Verify thread/resume
      const resumed = await client.createSession({
        cwd: process.cwd(),
        resumeSessionId: 'thread-prev-42',
      })
      expect(resumed.sessionId).toBe('thread-prev-42')
    }
    finally {
      await client.close()
    }
  })

  it('handles command, fileChange, and permissions approvals and fails closed without handler or on error', async () => {
    const { spawn } = await import('node:child_process')
    const proc = spawn(process.execPath, ['-e', FAKE_CODEX_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const seen: CliPermissionRequest[] = []
    const client = new CodexAppServerClient(proc, {
      onPermission: (req) => {
        seen.push(req)
        if (req.toolName === 'commandExecution')
          return { approved: true, remember: true }
        if (req.toolName === 'fileChange')
          return { approved: false, cancelled: true }
        return { approved: true }
      },
    })

    try {
      await client.initialize()
      const session = await client.createSession({ cwd: process.cwd() })

      let output = ''
      for await (const ev of session.promptStream('approvals')) {
        if (ev.type === 'delta')
          output += ev.text
      }
      expect(seen.map(s => [s.toolName, s.riskHint])).toEqual([
        ['commandExecution', 'execute'],
        ['fileChange', 'write'],
        ['permissions', 'execute'],
      ])
      expect(JSON.parse(output)).toEqual({
        cmd: { decision: 'acceptForSession' },
        file: { decision: 'cancel' },
        perm: { scope: 'turn', permissions: { network: true } },
      })

      // Throwing handler -> fail closed
      client.setPermissionHandler(() => {
        throw new Error('policy error')
      })
      let outputThrow = ''
      for await (const ev of session.promptStream('approvals')) {
        if (ev.type === 'delta')
          outputThrow += ev.text
      }
      expect(JSON.parse(outputThrow)).toEqual({
        cmd: { decision: 'decline' },
        file: { decision: 'decline' },
        perm: { scope: 'turn', permissions: {} },
      })

      // Missing handler -> fail closed
      client.setPermissionHandler(null)
      let outputNone = ''
      for await (const ev of session.promptStream('approvals')) {
        if (ev.type === 'delta')
          outputNone += ev.text
      }
      expect(JSON.parse(outputNone)).toEqual({
        cmd: { decision: 'decline' },
        file: { decision: 'decline' },
        perm: { scope: 'turn', permissions: {} },
      })
    }
    finally {
      await client.close()
    }
  })

  it('rejects on turn/completed failure and on premature child exit with exit code and stderr tail', async () => {
    const { spawn } = await import('node:child_process')

    // Case 1: turn/completed with status: failed
    const proc1 = spawn(process.execPath, ['-e', FAKE_CODEX_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client1 = new CodexAppServerClient(proc1)
    try {
      await client1.initialize()
      const session1 = await client1.createSession({ cwd: process.cwd() })
      await expect(async () => {
        for await (const _ev of session1.promptStream('turn-fail')) {
          // drain
        }
      }).rejects.toThrow('quota exceeded')
    }
    finally {
      await client1.close()
    }

    // Case 2: premature process exit before turn/completed
    const proc2 = spawn(process.execPath, ['-e', FAKE_CODEX_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client2 = new CodexAppServerClient(proc2)
    try {
      await client2.initialize()
      const session2 = await client2.createSession({ cwd: process.cwd() })
      await expect(async () => {
        for await (const _ev of session2.promptStream('premature-exit')) {
          // drain
        }
      }).rejects.toThrow(/code=2.*fatal codex crash/)
    }
    finally {
      await client2.close()
    }
  })

  it('aborts cleanly on AbortSignal, sends turn/interrupt, and escalates SIGTERM -> SIGKILL on teardown', async () => {
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
        if (signal === 'SIGTERM')
          return true
        proc.signalCode = 'SIGKILL'
        emitter.emit('exit', null, 'SIGKILL')
        emitter.emit('close', null, 'SIGKILL')
        return true
      },
    }) as any

    const sentMethods: string[] = []
    stdin.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim())
          continue
        const msg = JSON.parse(line)
        sentMethods.push(msg.method)
        if (msg.method === 'initialize') {
          stdout.write(`${JSON.stringify({ id: msg.id, result: { serverInfo: { name: 'codex' } } })}\n`)
        }
        else if (msg.method === 'thread/start') {
          stdout.write(`${JSON.stringify({ id: msg.id, result: { thread: { id: 't-abort' } } })}\n`)
        }
        else if (msg.method === 'turn/start') {
          stdout.write(`${JSON.stringify({ id: msg.id, result: { turn: { id: 'turn-abort' } } })}\n`)
        }
      }
    })

    const client = new CodexAppServerClient(proc)
    await client.initialize()
    const session = await client.createSession({ cwd: process.cwd() })

    const controller = new AbortController()
    const run = (async () => {
      const items: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('hang', { signal: controller.signal })) {
        items.push(ev)
      }
      return items
    })()

    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort()
    expect(await run).toEqual([])
    expect(sentMethods).toContain('turn/interrupt')

    await client.close()
    expect(killSignals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(client.isClosed()).toBe(true)
  })

  it('rejects on premature stdout EOF without process exit before turn/completed', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const emitter = new EventEmitter()
    const proc = Object.assign(emitter, {
      stdin,
      stdout,
      stderr,
      exitCode: null,
      signalCode: null,
      kill: () => true,
      unref: () => undefined,
    }) as any

    stdin.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim())
          continue
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') {
          stdout.write(`${JSON.stringify({ id: msg.id, result: { serverInfo: { name: 'codex' } } })}\n`)
        }
        else if (msg.method === 'thread/start') {
          stdout.write(`${JSON.stringify({ id: msg.id, result: { thread: { id: 't-eof' } } })}\n`)
        }
        else if (msg.method === 'turn/start') {
          stdout.write(`${JSON.stringify({ id: msg.id, result: { turn: { id: 'turn-eof' } } })}\n`)
          stderr.write('codex pipe broken')
          stdout.end()
        }
      }
    })

    const client = new CodexAppServerClient(proc)
    await client.initialize()
    const session = await client.createSession({ cwd: process.cwd() })

    await expect(async () => {
      for await (const _ev of session.promptStream('hi')) {
        // drain
      }
    }).rejects.toThrow(/stdout closed before turn completed.*codex pipe broken/)

    await client.close()
  })

  it('deduplicates item/completed agentMessage when prior deltas omitted itemId', async () => {
    const { spawn } = await import('node:child_process')
    const proc = spawn(process.execPath, ['-e', FAKE_CODEX_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client = new CodexAppServerClient(proc)
    try {
      await client.initialize()
      const session = await client.createSession({ cwd: process.cwd() })
      const deltas: string[] = []
      for await (const ev of session.promptStream('delta-without-item-id')) {
        if (ev.type === 'delta')
          deltas.push(ev.text)
      }
      expect(deltas).toEqual(['No-id delta'])
    }
    finally {
      await client.close()
    }
  })

  it('rejects cleanly with ENOENT when CodexAppServerClient.spawn cannot find executable', async () => {
    const missingBin = path.join(os.tmpdir(), `tuff-missing-codex-${randomUUID()}`)
    await expect(
      CodexAppServerClient.spawn({ executablePath: missingBin, initTimeoutMs: 500 }),
    ).rejects.toThrow(/ENOENT/)
  })
})

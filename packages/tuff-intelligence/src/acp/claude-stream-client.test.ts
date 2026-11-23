import type { CliPermissionRequest, CliRuntimeStreamEvent } from './types'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  buildClaudeStreamArgs,
  ClaudeStreamClient,
  ClaudeStreamSession,
} from './claude-stream-client'

const FAKE_CLAUDE_SERVER = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

const pendingControl = new Map();
let turnCount = 0;

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);

  if (msg.type === 'control_response') {
    const reqId = msg.response?.request_id;
    const cb = pendingControl.get(reqId);
    if (cb) {
      pendingControl.delete(reqId);
      cb(msg.response);
    }
    return;
  }

  if (msg.type === 'control_request' && msg.request?.subtype === 'interrupt') {
    send({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: { interrupted: true } } });
    return;
  }

  if (msg.type === 'user') {
    turnCount += 1;
    const blocks = msg.message?.content ?? [];
    const text = blocks.find((b) => b.type === 'text')?.text ?? '';

    if (turnCount === 1) {
      send({ type: 'system', subtype: 'init', session_id: 'claude-sess-77', claude_code_version: '2.1.330' });
    }

    if (text === 'multi-turn-1') {
      process.stdout.write('non-json log line\\n');
      send({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm ' } } });
      send({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hello' } } });
      send({ type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: ' Claude' } } });
      // Streaming tool_use
      send({ type: 'stream_event', event: { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu-1', name: 'Read', input: {} } } });
      send({ type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"path":"src/' } } });
      send({ type: 'stream_event', event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: 'a.ts"}' } } });
      send({ type: 'stream_event', event: { type: 'content_block_stop', index: 2 } });
      // Assistant message repeats text (MUST be ignored!) + tu-1 (already emitted!) + unseen tu-2 (SHOULD be backfilled!)
      send({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello Claude' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { path: 'src/a.ts' } },
            { type: 'tool_use', id: 'tu-2', name: 'Grep', input: { pattern: 'foo' } },
          ],
        },
      });
      // Tool results
      send({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: 'file body', is_error: false },
            { type: 'tool_result', tool_use_id: 'tu-2', content: 'grep failed', is_error: true },
          ],
        },
      });
      send({
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: 'claude-sess-77',
        total_cost_usd: 0.0125,
        usage: {
          input_tokens: 10,
          cache_creation_input_tokens: 20,
          cache_read_input_tokens: 30,
          output_tokens: 15,
        },
      });
      return;
    }

    if (text === 'multi-turn-2') {
      send({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'sid:' + msg.session_id + '|blocks:' + JSON.stringify(blocks) },
        },
      });
      send({ type: 'result', subtype: 'success', is_error: false, session_id: 'claude-sess-77' });
      return;
    }

    if (text === 'permission-flow') {
      pendingControl.set('ctrl-1', (res1) => {
        pendingControl.set('ctrl-2', (res2) => {
          send({
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: JSON.stringify({ nested: res1, flat: res2 }) },
            },
          });
          send({ type: 'result', subtype: 'success', is_error: false });
        });
        // Flat subtype shape (defensive compatibility)
        send({
          type: 'control_request',
          request_id: 'ctrl-2',
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'echo hi' },
        });
      });
      // Standard nested request.subtype shape
      send({
        type: 'control_request',
        request_id: 'ctrl-1',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Edit',
          tool_use_id: 'tu-edit',
          input: { file_path: 'a.ts' },
        },
      });
      return;
    }

    if (text === 'permission-cancel') {
      let replied = false;
      pendingControl.set('ctrl-cancel', () => {
        replied = true;
      });
      send({
        type: 'control_request',
        request_id: 'ctrl-cancel',
        request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'sleep 1' } },
      });
      setTimeout(() => {
        send({ type: 'control_cancel_request', request_id: 'ctrl-cancel' });
      }, 15);
      setTimeout(() => {
        send({
          type: 'stream_event',
          event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'replied:' + replied } },
        });
        send({ type: 'result', subtype: 'success', is_error: false });
      }, 90);
      return;
    }

    if (text === 'subtype-success-but-is-error') {
      send({
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'API Error: 400 unknown provider for model bogus',
      });
      return;
    }

    if (text === 'premature-exit') {
      process.stderr.write('claude crashed hard\\n');
      process.exit(3);
    }

    if (text === 'hang') {
      return;
    }
  }
});
`

describe('claudeStreamClient unit & fake-subprocess tests', () => {
  it('builds valid claude argv with --print, omits --permission-mode by default, and rejects invalid modes', () => {
    const args = buildClaudeStreamArgs({
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
      systemPrompt: 'Be concise',
      strictMcpConfig: true,
      resumeSessionId: 'prev-1',
    }, '/tmp/tuff-claude-mcp-test.json')

    expect(args).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-prompt-tool',
      'stdio',
      '--no-chrome',
      '--model',
      'claude-sonnet-4-6',
      '--effort',
      'high',
      '--system-prompt',
      'Be concise',
      '--mcp-config',
      '/tmp/tuff-claude-mcp-test.json',
      '--strict-mcp-config',
      '--resume',
      'prev-1',
    ])
    expect(args).not.toContain('--permission-mode')

    const withMode = buildClaudeStreamArgs({ permissionMode: 'manual' })
    expect(withMode).toContain('--permission-mode')
    expect(withMode).toContain('manual')

    expect(() => buildClaudeStreamArgs({ permissionMode: 'default' as any })).toThrow(/Unsupported Claude permissionMode/)
    expect(() => buildClaudeStreamArgs({ permissionMode: 'bypassPermissions' as any })).toThrow(/Unsupported Claude permissionMode/)
  })

  it('writes MCP secrets to a mode-0600 temp file (never argv) and unlinks on close() and ENOENT spawn error', async () => {
    const shimPath = path.join(os.tmpdir(), `tuff-fake-claude-${randomUUID()}.mjs`)
    await writeFile(
      shimPath,
      `#!${process.execPath}
import readline from 'node:readline'
const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on('line', () => {
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify(process.argv.slice(2)) } },
  }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false }) + '\\n')
})
`,
      { encoding: 'utf8', mode: 0o700 },
    )
    await chmod(shimPath, 0o700)

    let configPath: string | null = null
    try {
      const client = await ClaudeStreamClient.spawn({
        executablePath: shimPath,
        mcpServers: [
          {
            name: 'tuff-host',
            type: 'http',
            url: 'http://127.0.0.1:9999/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer secret-claude-token-xyz' }],
          },
        ],
        strictMcpConfig: true,
      })

      configPath = client.getMcpConfigPath()
      expect(configPath).toBeTruthy()
      expect(existsSync(configPath!)).toBe(true)

      try {
        const session = await client.createSession({ cwd: process.cwd() })
        let childArgvJson = ''
        for await (const ev of session.promptStream('check-argv')) {
          if (ev.type === 'delta')
            childArgvJson += ev.text
        }
        const childArgv = JSON.parse(childArgvJson) as string[]
        expect(childArgv.join(' ')).not.toContain('secret-claude-token-xyz')
        expect(childArgv).toContain('--mcp-config')
        expect(childArgv).toContain(configPath!)
        expect(childArgv).toContain('--strict-mcp-config')

        const info = await stat(configPath!)
        expect(info.mode & 0o777).toBe(0o600)

        const content = JSON.parse(await readFile(configPath!, 'utf8'))
        expect(content).toEqual({
          mcpServers: {
            'tuff-host': {
              type: 'http',
              url: 'http://127.0.0.1:9999/mcp',
              headers: {
                Authorization: 'Bearer secret-claude-token-xyz',
              },
            },
          },
        })
      }
      finally {
        await client.close()
      }

      // Temp MCP config file MUST be unlinked after close()
      expect(existsSync(configPath!)).toBe(false)
      expect(client.getMcpConfigPath()).toBeNull()
    }
    finally {
      await unlink(shimPath).catch(() => undefined)
    }

    // Missing executable MUST reject spawn() directly with ENOENT AND unlink its temp MCP file
    const beforeTmpFiles = new Set(
      (await readdir(os.tmpdir())).filter(name => name.startsWith('tuff-claude-mcp-')),
    )
    const missingBin = path.join(os.tmpdir(), `tuff-missing-claude-${randomUUID()}`)
    await expect(
      ClaudeStreamClient.spawn({
        executablePath: missingBin,
        mcpServers: [
          {
            name: 'tuff-host',
            type: 'http',
            url: 'http://127.0.0.1:9999/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer never-leaked' }],
          },
        ],
      }),
    ).rejects.toThrow(/ENOENT/)

    const afterTmpFiles = (await readdir(os.tmpdir())).filter(
      name => name.startsWith('tuff-claude-mcp-') && !beforeTmpFiles.has(name),
    )
    expect(afterTmpFiles).toEqual([])

    // Invalid permissionMode throws before spawn and leaves no temp MCP file
    await expect(
      ClaudeStreamClient.spawn({
        executablePath: process.execPath,
        permissionMode: 'bypassPermissions' as any,
        mcpServers: [{ name: 'tuff-host', type: 'http', url: 'http://127.0.0.1:1/mcp' }],
      }),
    ).rejects.toThrow(/Unsupported Claude permissionMode/)
  })

  it('streams multi-turn deltas, thinking, tool calls/results without double-printing, maps images, and parses additive usage', async () => {
    const proc = spawn(process.execPath, ['-e', FAKE_CLAUDE_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client = new ClaudeStreamClient(proc)
    const protocolErrors: string[] = []
    client.on('protocol_error', (_err, raw) => protocolErrors.push(raw))

    try {
      const session = await client.createSession({ cwd: process.cwd() })
      expect(session).toBeInstanceOf(ClaudeStreamSession)
      expect(session.protocol).toBe('claude-stream-json')

      const turn1Events: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('multi-turn-1')) {
        turn1Events.push(ev)
      }

      expect(session.sessionId).toBe('claude-sess-77')
      expect(client.agentInfo).toEqual({ name: 'claude', version: '2.1.330' })
      expect(protocolErrors).toEqual(['non-json log line'])

      expect(turn1Events).toEqual([
        expect.objectContaining({ type: 'status', status: 'init' }),
        expect.objectContaining({ type: 'thinking', text: 'hmm ' }),
        expect.objectContaining({ type: 'delta', text: 'Hello' }),
        expect.objectContaining({ type: 'delta', text: ' Claude' }),
        expect.objectContaining({
          type: 'tool_call',
          toolCall: expect.objectContaining({
            toolCallId: 'tu-1',
            toolName: 'Read',
            args: { path: 'src/a.ts' },
            isError: false,
          }),
        }),
        expect.objectContaining({
          type: 'tool_call',
          toolCall: expect.objectContaining({
            toolCallId: 'tu-2',
            toolName: 'Grep',
            args: { pattern: 'foo' },
            isError: false,
          }),
        }),
        expect.objectContaining({
          type: 'tool_result',
          toolCall: expect.objectContaining({
            toolCallId: 'tu-1',
            toolName: 'Read',
            result: 'file body',
            isError: false,
          }),
        }),
        expect.objectContaining({
          type: 'tool_result',
          toolCall: expect.objectContaining({
            toolCallId: 'tu-2',
            toolName: 'Grep',
            result: 'grep failed',
            isError: true,
          }),
        }),
        expect.objectContaining({
          type: 'usage',
          usage: {
            inputTokens: 60, // 10 + 20 + 30 additive Anthropic buckets
            outputTokens: 15,
            totalTokens: 75,
            cacheReadTokens: 30,
            cacheWriteTokens: 20,
            cost: { total: 0.0125 },
          },
        }),
      ])

      // Turn 2 on SAME persistent process carries captured session_id + valid image block only
      let turn2Text = ''
      for await (const ev of session.promptStream([
        { type: 'text', text: 'multi-turn-2' },
        { type: 'image', mimeType: 'image/webp', data: 'UklGRg==' },
        { type: 'image', mimeType: 'image/webp' }, // malformed: missing data -> skipped
      ])) {
        if (ev.type === 'delta')
          turn2Text += ev.text
      }
      expect(turn2Text).toContain('sid:claude-sess-77|blocks:')
      const parsedBlocks = JSON.parse(turn2Text.split('|blocks:')[1]!)
      expect(parsedBlocks).toEqual([
        { type: 'text', text: 'multi-turn-2' },
        { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'UklGRg==' } },
      ])
    }
    finally {
      await client.close()
    }
  })

  it('handles control_request can_use_tool (allow, deny, throw/missing fail-closed) and control_cancel_request', async () => {
    const proc = spawn(process.execPath, ['-e', FAKE_CLAUDE_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const seen: CliPermissionRequest[] = []
    const client = new ClaudeStreamClient(proc, {
      onPermission: (req) => {
        seen.push(req)
        if (req.toolName === 'Edit') {
          return { approved: true, updatedInput: { file_path: 'safe.ts' } }
        }
        return { approved: false, reason: 'No shell allowed' }
      },
    })

    try {
      const session = await client.createSession({ cwd: process.cwd() })
      let out = ''
      for await (const ev of session.promptStream('permission-flow')) {
        if (ev.type === 'delta')
          out += ev.text
      }

      expect(seen.map(s => [s.toolName, s.riskHint])).toEqual([
        ['Edit', 'write'],
        ['Bash', 'execute'],
      ])
      expect(JSON.parse(out)).toEqual({
        nested: {
          subtype: 'success',
          request_id: 'ctrl-1',
          response: { behavior: 'allow', updatedInput: { file_path: 'safe.ts' } },
        },
        flat: {
          subtype: 'success',
          request_id: 'ctrl-2',
          response: { behavior: 'deny', message: 'No shell allowed' },
        },
      })

      // Missing handler -> fail closed deny
      client.setPermissionHandler(null)
      let outNone = ''
      for await (const ev of session.promptStream('permission-flow')) {
        if (ev.type === 'delta')
          outNone += ev.text
      }
      expect(JSON.parse(outNone).nested.response).toEqual({
        behavior: 'deny',
        message: 'Permission denied',
      })

      // Throwing handler -> fail closed deny
      client.setPermissionHandler(() => {
        throw new Error('boom')
      })
      let outThrow = ''
      for await (const ev of session.promptStream('permission-flow')) {
        if (ev.type === 'delta')
          outThrow += ev.text
      }
      expect(JSON.parse(outThrow).nested.response).toEqual({
        behavior: 'deny',
        message: 'Permission denied',
      })

      // control_cancel_request suppresses stale response from slow handler
      client.setPermissionHandler(async () => {
        await new Promise(resolve => setTimeout(resolve, 60))
        return { approved: true }
      })
      let outCancel = ''
      for await (const ev of session.promptStream('permission-cancel')) {
        if (ev.type === 'delta')
          outCancel += ev.text
      }
      expect(outCancel).toBe('replied:false')
    }
    finally {
      await client.close()
    }
  })

  it('fails on is_error=true even when subtype=success, and fails on premature exit with exit code and stderr tail', async () => {
    const proc1 = spawn(process.execPath, ['-e', FAKE_CLAUDE_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client1 = new ClaudeStreamClient(proc1)
    try {
      const session1 = await client1.createSession({ cwd: process.cwd() })
      await expect(async () => {
        for await (const _ev of session1.promptStream('subtype-success-but-is-error')) {
          // drain
        }
      }).rejects.toThrow('API Error: 400 unknown provider for model bogus')
    }
    finally {
      await client1.close()
    }

    const proc2 = spawn(process.execPath, ['-e', FAKE_CLAUDE_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client2 = new ClaudeStreamClient(proc2)
    try {
      const session2 = await client2.createSession({ cwd: process.cwd() })
      await expect(async () => {
        for await (const _ev of session2.promptStream('premature-exit')) {
          // drain
        }
      }).rejects.toThrow(/code=3.*claude crashed hard/)
    }
    finally {
      await client2.close()
    }
  })

  it('aborts cleanly on AbortSignal (sends interrupt) and escalates SIGTERM -> SIGKILL on stubborn child', async () => {
    const stubborn = `
process.on('SIGTERM', () => { /* ignore SIGTERM */ });
setInterval(() => {}, 10000);
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'stubborn-ready' }) + '\\n');
${FAKE_CLAUDE_SERVER}
`
    const proc = spawn(process.execPath, ['-e', stubborn], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client = new ClaudeStreamClient(proc)

    // Wait until the child has actually booted and registered its SIGTERM trap.
    await new Promise<void>((resolve) => {
      const unsub = client.onStreamMessage((msg) => {
        if (msg.type === 'system' && msg.session_id === 'stubborn-ready') {
          unsub()
          resolve()
        }
      })
    })

    const session = await client.createSession({ cwd: process.cwd() })

    const controller = new AbortController()
    const streamTask = (async () => {
      const items: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('hang', { signal: controller.signal })) {
        items.push(ev)
      }
      return items
    })()

    await new Promise(resolve => setTimeout(resolve, 25))
    controller.abort()
    const collected = await streamTask
    expect(collected.filter(ev => ev.type !== 'status')).toEqual([])

    const start = Date.now()
    await client.close()
    const elapsed = Date.now() - start
    expect(client.isClosed()).toBe(true)
    expect(elapsed).toBeGreaterThanOrEqual(120)
    expect(elapsed).toBeLessThan(2_000)
  })

  it('rejects on premature stdout EOF without process exit when result never arrives', async () => {
    const { EventEmitter } = await import('node:events')
    const { PassThrough } = await import('node:stream')
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

    const client = new ClaudeStreamClient(proc)
    const session = await client.createSession({ cwd: process.cwd() })

    stdin.once('data', () => {
      stderr.write('unexpected eof reason')
      stdout.end()
    })

    await expect(async () => {
      for await (const _ev of session.promptStream('hello')) {
        // drain
      }
    }).rejects.toThrow(/stdout closed before result arrived.*unexpected eof reason/)

    await client.close()
  })
})

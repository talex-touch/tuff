import type { CliPermissionRequest, CliRuntimeStreamEvent } from './types'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { OmpAcpClient, OmpAcpSession } from '../omp/omp-acp-client'
import { AcpClient, AcpSession, mapDecisionToAcpPermissionResult } from './acp-client'
import { CLI_RUNTIME_KINDS } from './types'

/**
 * Spawns a real Node child process running an inline script to test real OS stdio pipes,
 * JSON-RPC framing, permissions, cancellation, malformed lines, and SIGTERM -> SIGKILL teardown.
 */
function spawnFakeAcpClient(
  script: string,
  options?: {
    onPermission?: (req: CliPermissionRequest) => any
    onRequest?: (method: string, params: unknown) => any
    initTimeoutMs?: number
    clientInfo?: { name: string, version: string }
    protocolVersion?: number
    clientCapabilities?: Record<string, unknown>
    label?: string
  },
): Promise<AcpClient> {
  return AcpClient.spawn({
    executablePath: process.execPath,
    args: ['-e', script],
    ...options,
  })
}

const STANDARD_FAKE_ACP_SERVER = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
let activePromptId = null;

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);

  // Incoming response from client to our server->client request
  if (msg.id && !msg.method) {
    if (msg.id === 'perm-1' && activePromptId !== null) {
      const outcome = msg.result?.outcome;
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'sess-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'perm:' + JSON.stringify(outcome) },
          },
        },
      });
      const promptId = activePromptId;
      activePromptId = null;
      send({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'end_turn' } });
    }
    return;
  }

  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion ?? 1,
        agentInfo: { name: 'fake-acp', version: '2.0.0' },
        agentCapabilities: { loadSession: true },
        echoInitParams: msg.params,
      },
    });
    return;
  }

  if (msg.method === 'session/new') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        sessionId: 'sess-1',
        configOptions: [
          { id: 'model', name: 'Model', type: 'select', currentValue: 'default' },
          { id: 'thinking', name: 'Thinking', category: 'thought_level', type: 'select', currentValue: 'medium' },
        ],
      },
    });
    return;
  }

  if (msg.method === 'session/load') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        sessionId: msg.params.sessionId,
        configOptions: [{ id: 'model', name: 'Model', type: 'select', currentValue: 'resumed-model' }],
      },
    });
    return;
  }

  if (msg.method === 'session/set_config_option') {
    send({ jsonrpc: '2.0', id: msg.id, result: { ok: true, configId: msg.params.configId, value: msg.params.value } });
    return;
  }

  if (msg.method === 'session/prompt') {
    const text = msg.params?.prompt?.[0]?.text ?? '';
    if (text === 'trigger-permission') {
      activePromptId = msg.id;
      send({
        jsonrpc: '2.0',
        id: 'perm-1',
        method: 'session/request_permission',
        params: {
          sessionId: msg.params.sessionId,
          toolCall: {
            toolCallId: 'tc-perm',
            title: 'bash',
            kind: 'execute',
            rawInput: { command: 'rm -rf /tmp/test' },
          },
          options: [
            { optionId: 'opt-allow-once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'opt-allow-always', name: 'Always allow', kind: 'allow_always' },
            { optionId: 'opt-reject-once', name: 'Reject once', kind: 'reject_once' },
          ],
        },
      });
      return;
    }

    if (text === 'malformed-and-stream') {
      process.stdout.write('not json noise\\n');
      process.stdout.write('12345\\n');
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: msg.params.sessionId,
          update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'thinking', text: ' step 1' } },
        },
      });
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: msg.params.sessionId,
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tc-1',
            title: 'file.read',
            status: 'in_progress',
            rawInput: { path: 'a.ts' },
          },
        },
      });
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: msg.params.sessionId,
          update: {
            sessionUpdate: 'tool_call_update',
            toolCallId: 'tc-1',
            status: 'completed',
            rawOutput: 'ok-content',
          },
        },
      });
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: msg.params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello' } },
        },
      });
      send({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: msg.params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' world' } },
        },
      });
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { stopReason: 'end_turn', usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 } },
      });
      return;
    }

    if (text === 'hang') {
      return;
    }

    send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
    return;
  }

  if (msg.method === 'session/cancel') {
    send({ jsonrpc: '2.0', id: msg.id, result: { cancelled: true } });
    return;
  }

  if (msg.method === 'session/close') {
    send({ jsonrpc: '2.0', id: msg.id, result: { closed: true } });
  }
});
`

describe('acpClient fake-subprocess & protocol tests', () => {
  it('performs full ACP initialize, session/new, session/load, streaming, tool calls, and ignores malformed stdout lines', async () => {
    const client = await spawnFakeAcpClient(STANDARD_FAKE_ACP_SERVER, {
      clientInfo: { name: 'tuff-test', version: '0.1.0' },
    })

    const protocolErrors: string[] = []
    client.on('protocol_error', (_err, rawLine) => {
      protocolErrors.push(rawLine)
    })

    try {
      expect(client.protocol).toBe('acp')
      expect(client.agentInfo).toEqual({ name: 'fake-acp', version: '2.0.0' })
      expect(client.capabilities?.loadSession).toBe(true)

      const session = await client.createSession({
        cwd: process.cwd(),
        model: 'claude-sonnet',
        reasoningEffort: 'high',
      })
      expect(session).toBeInstanceOf(AcpSession)
      expect(session.protocol).toBe('acp')
      expect(session.sessionId).toBe('sess-1')
      expect(session.currentModel).toBe('claude-sonnet')

      const events: CliRuntimeStreamEvent[] = []
      for await (const event of session.promptStream('malformed-and-stream')) {
        events.push(event)
      }

      expect(protocolErrors).toEqual(['not json noise', '12345'])
      expect(events).toEqual([
        expect.objectContaining({ type: 'thinking', text: ' step 1' }),
        expect.objectContaining({
          type: 'tool_call',
          toolCall: expect.objectContaining({
            toolCallId: 'tc-1',
            toolName: 'file.read',
            args: { path: 'a.ts' },
            isError: false,
          }),
        }),
        expect.objectContaining({
          type: 'tool_result',
          toolCall: expect.objectContaining({
            toolCallId: 'tc-1',
            result: 'ok-content',
            status: 'completed',
            isError: false,
          }),
        }),
        expect.objectContaining({ type: 'delta', text: 'Hello' }),
        expect.objectContaining({ type: 'delta', text: ' world' }),
        expect.objectContaining({
          type: 'usage',
          usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        }),
      ])

      const resumed = await client.createSession({
        cwd: process.cwd(),
        resumeSessionId: 'sess-existing',
      })
      expect(resumed.sessionId).toBe('sess-existing')
      await resumed.close()
      await session.close()
    }
    finally {
      await client.close()
    }
  })

  it('bridges session/request_permission via onPermission (allow, reject, fail-closed on missing or throwing handler)', async () => {
    // 1. Approved once
    const received: CliPermissionRequest[] = []
    const client = await spawnFakeAcpClient(STANDARD_FAKE_ACP_SERVER, {
      onPermission: (req) => {
        received.push(req)
        return { approved: true, remember: false }
      },
    })

    try {
      const session = await client.createSession({ cwd: process.cwd() })
      const res1 = await session.prompt('trigger-permission')
      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({
        sessionId: 'sess-1',
        protocol: 'acp',
        toolCallId: 'tc-perm',
        toolName: 'bash',
        riskHint: 'execute',
      })
      expect(res1.output).toBe('perm:{"outcome":"selected","optionId":"opt-allow-once"}')

      // 2. Reject once
      client.setPermissionHandler(() => ({ approved: false }))
      const res2 = await session.prompt('trigger-permission')
      expect(res2.output).toBe('perm:{"outcome":"selected","optionId":"opt-reject-once"}')

      // 3. Handler throws -> fail closed (cancelled)
      client.setPermissionHandler(() => {
        throw new Error('gateway unavailable')
      })
      const res3 = await session.prompt('trigger-permission')
      expect(res3.output).toBe('perm:{"outcome":"cancelled"}')

      // 4. No handler -> fail closed (cancelled)
      client.setPermissionHandler(null)
      const res4 = await session.prompt('trigger-permission')
      expect(res4.output).toBe('perm:{"outcome":"cancelled"}')
    }
    finally {
      await client.close()
    }
  })

  it('maps CliPermissionDecision to ACP outcomes strictly and fails closed if allow option absent', () => {
    const options = [
      { optionId: 'a1', name: 'Allow Once', kind: 'allow_once' },
      { optionId: 'a2', name: 'Allow Always', kind: 'allow_always' },
      { optionId: 'r1', name: 'Reject Once', kind: 'reject_once' },
    ]
    expect(mapDecisionToAcpPermissionResult({ approved: true, remember: true }, options)).toEqual({
      outcome: { outcome: 'selected', optionId: 'a2' },
    })
    expect(mapDecisionToAcpPermissionResult({ approved: false, cancelled: true }, options)).toEqual({
      outcome: { outcome: 'cancelled' },
    })
    expect(mapDecisionToAcpPermissionResult({ approved: true }, [{ optionId: 'r1', name: 'Reject', kind: 'reject_once' }])).toEqual({
      outcome: { outcome: 'cancelled' },
    })
  })

  it('times out initialize cleanly and terminates hung child process', async () => {
    const hungScript = `setInterval(() => {}, 10000);`
    await expect(
      spawnFakeAcpClient(hungScript, { initTimeoutMs: 60, label: 'Hung ACP' }),
    ).rejects.toThrow('Hung ACP initialize timed out after 60ms')
  })

  it('aborts promptStream via AbortSignal and escalates SIGTERM -> SIGKILL for stubborn child process', async () => {
    const stubbornScript = `
process.on('SIGTERM', () => { /* ignore SIGTERM */ });
setInterval(() => {}, 10000);
${STANDARD_FAKE_ACP_SERVER}
`
    const client = await spawnFakeAcpClient(stubbornScript)
    const session = await client.createSession({ cwd: process.cwd() })

    const controller = new AbortController()
    const streamTask = (async () => {
      const collected: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('hang', { signal: controller.signal })) {
        collected.push(ev)
      }
      return collected
    })()

    await new Promise(resolve => setTimeout(resolve, 25))
    controller.abort()
    const collected = await streamTask
    expect(collected).toEqual([])

    let closedSignal: NodeJS.Signals | null = null
    client.on('close', (_code, signal) => {
      closedSignal = signal
    })

    const start = Date.now()
    await client.close()
    const elapsed = Date.now() - start
    expect(client.isClosed()).toBe(true)
    // Should wait ~150ms SIGTERM grace, then SIGKILL promptly (well under 2s)
    expect(elapsed).toBeGreaterThanOrEqual(120)
    expect(elapsed).toBeLessThan(2_000)
    // Child was killed via SIGKILL
    expect(closedSignal === 'SIGKILL' || closedSignal === null).toBe(true)
  })

  it('keeps OmpAcpClient and OmpAcpSession backwards compatible as AcpClient/AcpSession subclasses', async () => {
    const proc = spawn(process.execPath, ['-e', STANDARD_FAKE_ACP_SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const client = new OmpAcpClient(proc)
    try {
      expect(client).toBeInstanceOf(AcpClient)
      const init = await client.initialize()
      expect(init.agentInfo.name).toBe('fake-acp')
      const session = await client.createSession({ cwd: process.cwd() })
      expect(session).toBeInstanceOf(OmpAcpSession)
      expect(session).toBeInstanceOf(AcpSession)
    }
    finally {
      await client.close()
    }
  })

  it('forwards arbitrary ACP spawn args verbatim and handles set_model fallback, array content blocks, and snake_case usage', async () => {
    expect(CLI_RUNTIME_KINDS).toEqual([
      'omp',
      'codex',
      'claude',
      'antigravity',
      'opencode',
      'gemini',
      'kiro',
      'cursor',
    ])

    const quirkyServer = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const cliArgs = process.argv.slice(1);
let selectedModel = null;

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);

  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: String(msg.id),
      result: {
        protocolVersion: 1,
        agentInfo: { name: 'quirky-acp', version: '1.2.3' },
      },
    });
    return;
  }

  if (msg.method === 'session/new') {
    send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'q-1' } });
    return;
  }

  if (msg.method === 'session/set_config_option') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found: session/set_config_option' },
    });
    return;
  }

  if (msg.method === 'session/set_model') {
    selectedModel = msg.params?.modelId ?? null;
    send({ jsonrpc: '2.0', id: msg.id, result: { ok: true } });
    return;
  }

  if (msg.method === 'session/prompt') {
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: msg.params.sessionId,
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: [{ type: 'text', text: 'plan:' }, { type: 'text', text: selectedModel || 'none' }],
        },
      },
    });
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: msg.params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: [{ type: 'text', text: 'args=' + cliArgs.join(',') }],
        },
      },
    });
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        stopReason: 'end_turn',
        usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10, cached_read_tokens: 2 },
      },
    });
    return;
  }

  if (msg.method === 'session/close') {
    send({ jsonrpc: '2.0', id: msg.id, result: { closed: true } });
  }
});
`
    const client = await AcpClient.spawn({
      executablePath: process.execPath,
      args: ['-e', quirkyServer, '--', '--experimental-acp', '--stdio'],
      label: 'gemini-acp',
    })
    try {
      expect(client.agentInfo).toEqual({ name: 'quirky-acp', version: '1.2.3' })
      const session = await client.createSession({
        cwd: process.cwd(),
        model: 'gemini-2.5-pro',
      })
      expect(session.currentModel).toBe('gemini-2.5-pro')

      const events: CliRuntimeStreamEvent[] = []
      for await (const event of session.promptStream('hello')) {
        events.push(event)
      }
      expect(events).toEqual([
        expect.objectContaining({ type: 'thinking', text: 'plan:gemini-2.5-pro' }),
        expect.objectContaining({ type: 'delta', text: 'args=--experimental-acp,--stdio' }),
        expect.objectContaining({
          type: 'usage',
          usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10, cacheReadTokens: 2 },
        }),
      ])
      await session.close()
    }
    finally {
      await client.close()
    }
  })

  it('rejects null initialize results in AcpClient.spawn() and closes the child process', async () => {
    const nullInitServer = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const msg = JSON.parse(line.trim());
  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: null }) + '\\n');
  }
});
`
    await expect(
      AcpClient.spawn({
        executablePath: process.execPath,
        args: ['-e', nullInitServer],
        label: 'null-init-acp',
      }),
    ).rejects.toMatchObject({
      code: 'PROTOCOL_INVALID',
      message: expect.stringContaining('initialize returned invalid result'),
    })
  })

  it('validates prompt results, preserves stopReason, and rejects null or stopReason-less results before ending stream', async () => {
    const edgePromptServer = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } });
    return;
  }
  if (msg.method === 'session/new') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        sessionId: 'edge-1',
        modes: { currentModeId: 'agent', availableModes: [{ id: 'agent' }, { id: 'plan' }] },
      },
    });
    return;
  }
  if (msg.method === 'session/set_mode') {
    send({ jsonrpc: '2.0', id: msg.id, result: {} });
    return;
  }
  if (msg.method === 'session/prompt') {
    const text = msg.params?.prompt?.[0]?.text || '';
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: msg.params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'partial-' + text },
        },
      },
    });
    if (text === 'null-result') {
      send({ jsonrpc: '2.0', id: msg.id, result: null });
    }
    else if (text === 'missing-stop') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
    }
    else if (text === 'max-tokens') {
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'max_tokens' } });
    }
    else {
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
    }
  }
});
`
    const client = await AcpClient.spawn({
      executablePath: process.execPath,
      args: ['-e', edgePromptServer],
      label: 'edge-acp',
    })
    try {
      expect(client.agentInfo).toBeUndefined()
      const session = await client.createSession({ cwd: process.cwd() })
      expect(session.modes?.currentModeId).toBe('agent')
      await session.setMode('plan')
      expect(session.modes?.currentModeId).toBe('plan')

      // Valid end_turn without usage succeeds and preserves stopReason.
      const okEvents: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('ok')) {
        okEvents.push(ev)
      }
      expect(okEvents).toEqual([expect.objectContaining({ type: 'delta', text: 'partial-ok' })])
      expect(session.lastStopReason).toBe('end_turn')

      // max_tokens preserves stopReason across promptStream boundary.
      const truncatedEvents: CliRuntimeStreamEvent[] = []
      for await (const ev of session.promptStream('max-tokens')) {
        truncatedEvents.push(ev)
      }
      expect(truncatedEvents).toEqual([
        expect.objectContaining({ type: 'delta', text: 'partial-max-tokens' }),
      ])
      expect(session.lastStopReason).toBe('max_tokens')

      // result: null rejects instead of ending normally.
      await expect(async () => {
        for await (const _ev of session.promptStream('null-result')) {
          // consume
        }
      }).rejects.toMatchObject({ code: 'PROTOCOL_INVALID' })

      // result without stopReason also rejects.
      await expect(async () => {
        for await (const _ev of session.promptStream('missing-stop')) {
          // consume
        }
      }).rejects.toMatchObject({ code: 'PROTOCOL_INVALID' })
    }
    finally {
      await client.close()
    }
  })
})

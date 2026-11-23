import type {
  AcpMcpServerConfig,
  CliPermissionDecision,
  CliPermissionRequest,
  CliRuntimeStreamEvent
} from '@talex-touch/tuff-intelligence'
import type {
  PiRuntimeRunEvent,
  PiRuntimeRunRecord,
  PiRuntimeStartPayload
} from '../pi-agent-runtime-protocol'
import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AcpClient,
  ClaudeStreamClient,
  CodexAppServerClient,
  OmpAcpClient
} from '@talex-touch/tuff-intelligence'
import {
  isRunCancelledControlError,
  isRunInterruptedControlError,
  readRunFailureDetail
} from '../pi-agent-runtime-control-error'
import {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  OMP_CLI_PROFILE_ID
} from '../providers/pi-cli-runtime'
import { GitWorktreeManager } from '../worktree'
import { CliAgentRuntimeHost } from './cli-agent-runtime-host'

const execFileAsync = promisify(execFile)

function createPayload(
  profileId: string,
  overrides?: Partial<PiRuntimeStartPayload>
): PiRuntimeStartPayload {
  const now = Date.now()
  return {
    run: {
      id: overrides?.run?.id ?? 'run-cli-1',
      sessionId: 'session-1',
      objective: 'Inspect repo',
      profileId,
      runtimeProvider: 'pi-core',
      cwd: overrides?.run?.cwd ?? '/tmp',
      status: 'running',
      metadata: {},
      createdAt: now,
      updatedAt: now,
      ...overrides?.run
    },
    request: {
      objective: 'Inspect repo',
      cwd: overrides?.run?.cwd ?? '/tmp',
      ...overrides?.request
    },
    profile: {
      id: profileId,
      name: profileId,
      description: `Profile ${profileId}`,
      runtimeProvider: 'pi-core',
      enabled: true,
      systemPrompt: 'Follow project rules.',
      modelPreference: [],
      allowedToolIds: [],
      enabledSkillIds: [],
      permissionPolicy: { mode: 'manual', allowedPermissions: [] },
      timeoutMs: 30_000,
      createdAt: now,
      updatedAt: now,
      ...overrides?.profile
    },
    tools: [],
    history: [],
    budget: {
      maxSteps: 10,
      maxToolCalls: 10,
      maxChildRuns: 0,
      maxConcurrency: 1
    },
    ...overrides
  }
}

function makeFakeClient(options: {
  protocol: 'acp' | 'codex-app-server' | 'claude-stream-json'
  sessionId?: string
  events?: CliRuntimeStreamEvent[]
  onPrompt?: (
    prompt: unknown,
    streamOptions?: { signal?: AbortSignal }
  ) => AsyncIterable<CliRuntimeStreamEvent>
  onClose?: () => void
}) {
  let closed = false
  const closeListeners: Array<() => void> = []
  const sessionClose = vi.fn(async () => undefined)
  const sessionCancel = vi.fn(async () => undefined)
  const createSession = vi.fn(async (sessionOpts?: Record<string, unknown>) => ({
    sessionId: options.sessionId ?? `${options.protocol}-session-1`,
    protocol: options.protocol,
    promptStream: (prompt: unknown, streamOpts?: { signal?: AbortSignal }) => {
      if (options.onPrompt) return options.onPrompt(prompt, streamOpts)
      return (async function* (): AsyncIterable<CliRuntimeStreamEvent> {
        for (const event of options.events ?? [
          { type: 'delta', text: `ok-from-${options.protocol}` }
        ]) {
          yield event
        }
      })()
    },
    cancel: sessionCancel,
    close: sessionClose,
    capturedSessionOpts: sessionOpts
  }))

  const clientClose = vi.fn(async () => {
    closed = true
    options.onClose?.()
    for (const listener of closeListeners) listener()
  })

  const client = {
    protocol: options.protocol,
    agentInfo: { name: options.protocol, version: '1.0.0' },
    isClosed: vi.fn(() => closed),
    stderrTail: vi.fn(() => ''),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'close') closeListeners.push(listener)
      return client
    }),
    createSession,
    close: clientClose
  }

  return { client, createSession, sessionClose, sessionCancel, clientClose }
}

describe('CliAgentRuntimeHost', () => {
  const tempDirs: string[] = []

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  async function initTempGitRepo(): Promise<{ repoRoot: string; worktreeBaseDir: string }> {
    const root = await mkdtemp(join(tmpdir(), 'tuff-cli-host-git-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'repo')
    const worktreeBaseDir = join(root, 'wt-base')
    await execFileAsync('git', ['init', '-b', 'main', repoRoot])
    await execFileAsync('git', ['-C', repoRoot, 'config', 'user.email', 'test@tuff.local'])
    await execFileAsync('git', ['-C', repoRoot, 'config', 'user.name', 'Tuff Test'])
    await writeFile(join(repoRoot, 'README.md'), 'hello\n', 'utf8')
    await execFileAsync('git', ['-C', repoRoot, 'add', 'README.md'])
    await execFileAsync('git', ['-C', repoRoot, 'commit', '-m', 'init'])
    return { repoRoot: await realpath(repoRoot), worktreeBaseDir }
  }

  it('refuses non-external profiles (default-pi / custom) without spawning any driver', async () => {
    const resolveDriver = vi.fn()
    const host = new CliAgentRuntimeHost({ resolveDriver })

    let caught: unknown
    try {
      await host.execute(createPayload('default-pi'))
    } catch (error) {
      caught = error
    }
    expect(readRunFailureDetail(caught)).toContain('CLI_PROFILE_UNSUPPORTED')
    expect(resolveDriver).not.toHaveBeenCalled()
  })

  it('executes codex via codex-app-server, recycles on MCP fingerprint change, and enforces per-call permissionMode=review', async () => {
    const capturedSpawnOpts: Array<Record<string, unknown>> = []
    const spawnedClients: Array<ReturnType<typeof makeFakeClient>> = []
    let activeMcp: AcpMcpServerConfig[] = [
      {
        name: 'tuff-host',
        type: 'http',
        url: 'http://127.0.0.1:44111/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer token-1' }]
      }
    ]

    vi.spyOn(CodexAppServerClient, 'spawn').mockImplementation(async (opts) => {
      capturedSpawnOpts.push(opts as unknown as Record<string, unknown>)
      const fake = makeFakeClient({
        protocol: 'codex-app-server',
        sessionId: `thread-${spawnedClients.length + 1}`,
        events: [
          { type: 'thinking', text: 'codex plan' },
          {
            type: 'tool_call',
            toolCall: { toolCallId: 'cmd-1', toolName: 'commandExecution', args: { cmd: 'ls' } }
          },
          {
            type: 'tool_result',
            toolCall: {
              toolCallId: 'cmd-1',
              toolName: 'commandExecution',
              result: 'README.md',
              isError: false
            }
          },
          { type: 'delta', text: 'codex answer' },
          { type: 'usage', usage: { inputTokens: 40, outputTokens: 15, totalTokens: 55 } }
        ]
      })
      spawnedClients.push(fake)
      return fake.client as unknown as CodexAppServerClient
    })

    const recordedEvents: PiRuntimeRunEvent[] = []
    const recordedRecords: PiRuntimeRunRecord[] = []
    const host = new CliAgentRuntimeHost({
      resolveDriver: async () => ({
        kind: 'codex',
        protocol: 'codex-app-server',
        executablePath: '/mock/bin/codex',
        adapterName: 'codex'
      }),
      resolveMcpServers: async () => activeMcp,
      onEvent: (ev) => {
        recordedEvents.push(ev)
      },
      onRecord: (_runId, record) => {
        recordedRecords.push(record)
      }
    })

    // Run 1 -> spawns client #1 with MCP token-1
    const res1 = await host.execute(
      createPayload(CODEX_CLI_PROFILE_ID, {
        run: { id: 'codex-run-1', cwd: '/tmp' } as PiRuntimeStartPayload['run'],
        profile: {
          ...createPayload(CODEX_CLI_PROFILE_ID).profile,
          modelPreference: ['codex-cli', 'gpt-5.4']
        }
      })
    )
    expect(res1.output).toBe('codex answer')
    expect(res1.usage).toMatchObject({ promptTokens: 40, completionTokens: 15, totalTokens: 55 })
    expect(spawnedClients).toHaveLength(1)
    expect(spawnedClients[0]!.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/tmp',
        model: 'gpt-5.4',
        permissionMode: 'review'
      })
    )
    expect(capturedSpawnOpts[0]?.strictMcpServers).toBeUndefined()
    expect(recordedRecords).toHaveLength(1)
    expect(recordedEvents.map((e) => e.type)).toEqual([
      'reasoning',
      'tool_execution_start',
      'tool_execution_end',
      'text'
    ])

    // Run 2 with identical MCP -> reuses client #1
    await host.execute(
      createPayload(CODEX_CLI_PROFILE_ID, {
        run: { id: 'codex-run-2', cwd: '/tmp' } as PiRuntimeStartPayload['run']
      })
    )
    expect(spawnedClients).toHaveLength(1)

    // Run 3 with automationPolicy (strictMcpServers: true) and rotated token -> recycles to client #2
    activeMcp = []
    await host.execute(
      createPayload(CODEX_CLI_PROFILE_ID, {
        run: { id: 'codex-run-3', cwd: '/tmp' } as PiRuntimeStartPayload['run'],
        request: {
          objective: 'Automated run',
          cwd: '/tmp',
          metadata: { automationPolicy: { version: 1, allowedMcpServerIds: [] } }
        }
      })
    )
    expect(spawnedClients).toHaveLength(2)
    expect(spawnedClients[0]!.clientClose).toHaveBeenCalledTimes(1)
    expect(capturedSpawnOpts[1]?.strictMcpServers).toBe(true)

    await host.stop()
    expect(spawnedClients[1]!.clientClose).toHaveBeenCalledTimes(1)
  })

  it('routes codex-acp and claude-acp through generic AcpClient.spawn when ACP adapters resolve', async () => {
    const fakeAcp = makeFakeClient({
      protocol: 'acp',
      sessionId: 'acp-sess-1',
      events: [{ type: 'delta', text: 'via-acp-adapter' }]
    })
    const acpSpawnSpy = vi
      .spyOn(AcpClient, 'spawn')
      .mockResolvedValue(fakeAcp.client as unknown as AcpClient)
    const ompSpawnSpy = vi.spyOn(OmpAcpClient, 'spawn')

    const host = new CliAgentRuntimeHost({
      resolveDriver: async (kind) => ({
        kind,
        protocol: 'acp',
        executablePath: `/mock/bin/${kind}-acp`,
        adapterName: `${kind}-acp`
      })
    })

    const res = await host.execute(createPayload(CODEX_CLI_PROFILE_ID))
    expect(res.output).toBe('via-acp-adapter')
    expect(acpSpawnSpy).toHaveBeenCalledTimes(1)
    expect(acpSpawnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath: '/mock/bin/codex-acp',
        args: [],
        label: 'codex-acp'
      })
    )
    expect(ompSpawnSpy).not.toHaveBeenCalled()
    expect(host.getRunProtocol('run-cli-1')).toBe('acp')

    await host.stop()
  })

  it('closes claude-stream-json client BEFORE releasing worktree lease and enforces strictMcpConfig under automationPolicy', async () => {
    const { repoRoot, worktreeBaseDir } = await initTempGitRepo()
    const worktreeManager = new GitWorktreeManager({ baseDir: worktreeBaseDir })
    const order: string[] = []

    const capturedClaudeOpts: Array<Record<string, unknown>> = []
    let capturedPermission:
      | ((req: CliPermissionRequest) => Promise<CliPermissionDecision>)
      | undefined

    vi.spyOn(ClaudeStreamClient, 'spawn').mockImplementation(async (opts) => {
      capturedClaudeOpts.push(opts as unknown as Record<string, unknown>)
      capturedPermission = opts?.onPermission as typeof capturedPermission
      const fake = makeFakeClient({
        protocol: 'claude-stream-json',
        sessionId: 'claude-sess-1',
        onClose: () => {
          order.push('claude-client-closed')
        },
        onPrompt: async function* () {
          // Verify permission callback routes even when sessionId is empty string
          const decision = await capturedPermission!({
            sessionId: '',
            protocol: 'claude-stream-json',
            toolName: 'Bash',
            input: { command: 'echo hi' }
          })
          expect(decision.approved).toBe(true)
          // Remember must be stripped for execute risk even if handler returned remember: true
          expect(decision.remember).toBe(false)
          yield { type: 'delta', text: 'claude-done' }
        }
      })
      return fake.client as unknown as ClaudeStreamClient
    })

    const releaseSpy = vi
      .spyOn(worktreeManager, 'releaseWorktree')
      .mockImplementation(async (id, opts) => {
        order.push('worktree-released')
        return await GitWorktreeManager.prototype.releaseWorktree.call(worktreeManager, id, opts)
      })

    const events: PiRuntimeRunEvent[] = []
    const host = new CliAgentRuntimeHost({
      worktreeManager,
      resolveDriver: async () => ({
        kind: 'claude',
        protocol: 'claude-stream-json',
        executablePath: '/mock/bin/claude',
        adapterName: 'claude'
      }),
      onEvent: (ev) => {
        events.push(ev)
      },
      onPermissionRequest: async () => ({ approved: true, remember: true })
    })

    const result = await host.execute(
      createPayload(CLAUDE_CLI_PROFILE_ID, {
        run: { id: 'claude-wt-run', cwd: repoRoot } as PiRuntimeStartPayload['run'],
        request: {
          objective: 'Check repo in worktree',
          cwd: repoRoot,
          metadata: {
            worktree: true,
            automationPolicy: { version: 1, allowedMcpServerIds: [] }
          }
        }
      })
    )

    expect(result.output).toBe('claude-done')
    expect(capturedClaudeOpts[0]?.strictMcpConfig).toBe(true)
    expect(capturedClaudeOpts[0]?.systemPrompt).toBe('Follow project rules.')
    expect(capturedClaudeOpts[0]?.cwd).not.toBe(repoRoot)
    expect(String(capturedClaudeOpts[0]?.cwd)).toContain(worktreeBaseDir)
    expect(releaseSpy).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['claude-client-closed', 'worktree-released'])
    // Clean worktree was removed on completion
    expect(host.getRunWorktreeLease('claude-wt-run')).toBeUndefined()
    // Worktree path never leaks into runtime events
    expect(JSON.stringify(events)).not.toContain(worktreeBaseDir)

    await host.stop()
    await worktreeManager.disposeAll({ force: true })
  })

  it('preserves dirty worktree edits on completion, exposes diff, and releases on explicit force', async () => {
    const { repoRoot, worktreeBaseDir } = await initTempGitRepo()
    const worktreeManager = new GitWorktreeManager({ baseDir: worktreeBaseDir })

    vi.spyOn(OmpAcpClient, 'spawn').mockImplementation(async () => {
      const fake = makeFakeClient({
        protocol: 'acp',
        sessionId: 'omp-wt-sess'
      })
      fake.createSession.mockImplementation(async (sessionOpts?: Record<string, unknown>) => {
        const effectiveCwd = String(sessionOpts?.cwd)
        return {
          sessionId: 'omp-wt-sess',
          protocol: 'acp' as const,
          promptStream: async function* () {
            await writeFile(join(effectiveCwd, 'README.md'), 'hello\nmodified-by-agent\n', 'utf8')
            yield { type: 'delta' as const, text: 'edited README' }
          },
          cancel: fake.sessionCancel,
          close: fake.sessionClose,
          capturedSessionOpts: sessionOpts
        }
      })
      return fake.client as unknown as OmpAcpClient
    })

    const host = new CliAgentRuntimeHost({
      worktreeManager,
      resolveDriver: async () => ({
        kind: 'omp',
        protocol: 'acp',
        executablePath: '/mock/bin/omp',
        adapterName: 'omp'
      })
    })

    const res = await host.execute(
      createPayload(OMP_CLI_PROFILE_ID, {
        run: { id: 'omp-dirty-wt', cwd: repoRoot } as PiRuntimeStartPayload['run'],
        request: {
          objective: 'Edit README in worktree',
          cwd: repoRoot,
          metadata: { worktree: true }
        }
      })
    )

    expect(res.output).toBe('edited README')
    const lease = host.getRunWorktreeLease('omp-dirty-wt')
    expect(lease).toBeDefined()
    expect(lease?.worktreePath).not.toBe(repoRoot)

    const diff = await host.getRunWorktreeDiff('omp-dirty-wt')
    expect(diff).not.toBeNull()
    expect(diff?.status.dirty).toBe(true)
    expect(diff?.patch).toContain('modified-by-agent')

    // Default release without force fails with WORKTREE_DIRTY
    await expect(host.releaseRunWorktree('omp-dirty-wt')).rejects.toMatchObject({
      code: 'WORKTREE_DIRTY'
    })
    expect(host.getRunWorktreeLease('omp-dirty-wt')).toBeDefined()

    // Explicit force removes worktree
    const released = await host.releaseRunWorktree('omp-dirty-wt', { force: true })
    expect(released?.removed).toBe(true)
    expect(host.getRunWorktreeLease('omp-dirty-wt')).toBeUndefined()

    await host.stop()
    await worktreeManager.disposeAll({ force: true })
  })

  it('cancels and interrupts active runs cleanly on cancel() and stop()', async () => {
    const fake = makeFakeClient({
      protocol: 'codex-app-server',
      sessionId: 'codex-long-1',
      onPrompt: async function* (_prompt, opts) {
        await new Promise<void>((resolve) => {
          opts?.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      }
    })
    vi.spyOn(CodexAppServerClient, 'spawn').mockResolvedValue(
      fake.client as unknown as CodexAppServerClient
    )

    const host = new CliAgentRuntimeHost({
      resolveDriver: async () => ({
        kind: 'codex',
        protocol: 'codex-app-server',
        executablePath: '/mock/bin/codex',
        adapterName: 'codex'
      })
    })

    const cancelledRun = host.execute(
      createPayload(CODEX_CLI_PROFILE_ID, {
        run: { id: 'codex-cancel-1', cwd: '/tmp' } as PiRuntimeStartPayload['run']
      })
    )
    await new Promise((r) => setTimeout(r, 15))
    expect(host.isRunActive('codex-cancel-1')).toBe(true)
    expect(host.cancel('codex-cancel-1')).toBe(true)
    await expect(cancelledRun).rejects.toSatisfy(isRunCancelledControlError)

    const interruptedRun = host.execute(
      createPayload(CODEX_CLI_PROFILE_ID, {
        run: { id: 'codex-stop-1', cwd: '/tmp' } as PiRuntimeStartPayload['run']
      })
    )
    await new Promise((r) => setTimeout(r, 15))
    await host.stop()
    await expect(interruptedRun).rejects.toSatisfy(isRunInterruptedControlError)
    expect(fake.clientClose).toHaveBeenCalled()
  })
})

import type {
  AcpMcpServerConfig,
  CliPermissionDecision,
  CliPermissionRequest,
  CliRuntimeStreamEvent
} from '@talex-touch/tuff-intelligence'
import type {
  AiAgentProfile,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import type { PiRuntimeStartPayload } from './pi-agent-runtime-protocol'
import { createHash } from 'node:crypto'
import { structuredStrictStringify } from '@talex-touch/utils'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AcpClient,
  ClaudeStreamClient,
  CodexAppServerClient,
  OmpAcpClient
} from '@talex-touch/tuff-intelligence'

const mocks = vi.hoisted(() => {
  const profiles = new Map<string, AiAgentProfile>()
  const runs = new Map<string, AiOrchestratorRunRecord>()
  const runMessages = new Map<string, Array<{ seq: number; envelope: string }>>()
  const tools = new Map<string, unknown>()
  const worktreeLeases = new Map<string, Record<string, unknown>>()
  return {
    profiles,
    runs,
    runMessages,
    tools,
    worktreeLeases,
    resolveOmpExecutable: vi.fn(async (): Promise<string | null> => '/mock/bin/omp'),
    resolveCodexAcpExecutable: vi.fn(async (): Promise<string | null> => null),
    resolveCodexExecutable: vi.fn(async (): Promise<string | null> => '/mock/bin/codex'),
    resolveClaudeAcpExecutable: vi.fn(async (): Promise<string | null> => null),
    resolveClaudeExecutable: vi.fn(async (): Promise<string | null> => '/mock/bin/claude'),
    activeMcpServer: null as { url: string; token: string } | null,
    gatewayMode: 'review' as 'review' | 'full',
    requestConfirmation: vi.fn(async () => ({ approved: true, remember: false })),
    piExecute: vi.fn(),
    piStop: vi.fn(async () => undefined),
    piCancel: vi.fn(() => false),
    piIsRunActive: vi.fn(() => false),
    worktreeAcquire: vi.fn(async (opts: { runId: string; repoRoot: string }) => {
      const lease = {
        worktreeId: `wt-${opts.runId}`,
        runId: opts.runId,
        repoRoot: opts.repoRoot,
        worktreePath: `/mock-userdata/ai-worktrees/wt-${opts.runId}`,
        effectiveCwd: `/mock-userdata/ai-worktrees/wt-${opts.runId}`,
        branchName: `tuff/wt/${opts.runId}`,
        baseRef: 'HEAD',
        baseCommit: 'abc123',
        createdAt: Date.now()
      }
      worktreeLeases.set(lease.worktreeId, lease)
      return lease
    }),
    worktreeGetLease: vi.fn((worktreeId: string) => worktreeLeases.get(worktreeId)),
    worktreeGetDiff: vi.fn(async (worktreeId: string) => ({
      worktreeId,
      status: {
        worktreeId,
        worktreePath: `/mock-userdata/ai-worktrees/${worktreeId}`,
        branchName: `tuff/wt/${worktreeId}`,
        headCommit: 'abc123',
        dirty: true,
        changedFiles: [{ path: 'README.md', status: 'M' }],
        ahead: 0,
        behind: 0
      },
      patch: '+edited',
      truncated: false,
      byteLength: 7
    })),
    worktreeRelease: vi.fn(async (worktreeId: string) => {
      worktreeLeases.delete(worktreeId)
      return { worktreeId, removed: true, branchDeleted: true }
    }),
    worktreeDisposeAll: vi.fn(async () => undefined),
    appendOrchestratorEvent: vi.fn(async () => undefined),
    appendRunMessage: vi.fn(async (runId: string, envelope: string) => {
      const list = runMessages.get(runId) ?? []
      const seq = list.length + 1
      list.push({ seq, envelope })
      runMessages.set(runId, list)
      return seq
    }),
    listRunMessages: vi.fn(async (runId: string) => runMessages.get(runId) ?? []),
    deleteRunMessages: vi.fn(async (runId: string) => {
      runMessages.delete(runId)
    }),
    truncateRunMessages: vi.fn(async (runId: string, keepCount: number) => {
      const list = runMessages.get(runId) ?? []
      runMessages.set(runId, list.slice(0, keepCount))
    })
  }
})

vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => true),
    getPath: vi.fn(() => '/tmp/tuff-multi-cli-orchestrator-test'),
    commandLine: {
      appendSwitch: vi.fn(),
      hasSwitch: vi.fn(() => false),
      getSwitchValue: vi.fn(() => '')
    }
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  MessageChannelMain: vi.fn(),
  powerMonitor: { on: vi.fn(), off: vi.fn(), getSystemIdleTime: vi.fn(() => 0) },
  utilityProcess: { fork: vi.fn() }
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn(),
  getCurrentScope: vi.fn(() => ({ setTag: vi.fn(), setContext: vi.fn(), setUser: vi.fn() })),
  flush: vi.fn(async () => true)
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false, windows: false, macOS: false, linux: false }
}))

vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('../../utils/logger', () => ({
  formatDuration: (ms: number) => `${ms}ms`,
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })
  })
}))

vi.mock('../../utils/i18n-helper', () => ({ t: (key: string) => key }))

vi.mock('../sentry/sentry-service', () => ({
  SentryServiceModule: class {},
  getSentryService: vi.fn(() => ({
    isTelemetryEnabled: vi.fn(() => false),
    isEnabled: vi.fn(() => false),
    queueNexusTelemetry: vi.fn()
  })),
  setSentryServiceInstance: vi.fn()
}))

vi.mock('../mcp-host', () => ({
  mcpHostModule: {
    getActiveServerConfig: () => mocks.activeMcpServer
  }
}))

vi.mock('../tool-gateway', () => ({
  toolGatewayModule: {
    getGatewayState: () => ({ enabled: true, mode: mocks.gatewayMode, ready: true, tools: [] }),
    requestConfirmation: mocks.requestConfirmation
  }
}))

vi.mock('./worktree', () => ({
  gitWorktreeManager: {
    acquireWorktree: mocks.worktreeAcquire,
    getLease: mocks.worktreeGetLease,
    listLeases: vi.fn(() => Array.from(mocks.worktreeLeases.values())),
    inspectWorktree: vi.fn(),
    getWorktreeDiff: mocks.worktreeGetDiff,
    releaseWorktree: mocks.worktreeRelease,
    reapOrphans: vi.fn(async () => ({
      reapedIds: [],
      skippedActiveIds: [],
      skippedDirtyIds: [],
      failedIds: []
    })),
    disposeAll: mocks.worktreeDisposeAll
  }
}))

vi.mock('./agents', () => ({
  agentManager: { getAgent: vi.fn() },
  toolRegistry: {
    hasTool: vi.fn((toolId: string) => mocks.tools.has(toolId)),
    registerTool: vi.fn((tool: { id: string }, handler: unknown) => {
      mocks.tools.set(tool.id, handler)
    })
  }
}))

vi.mock('./ai-orchestrator-store', () => ({
  DEFAULT_PROFILE_ID: 'default-pi',
  aiOrchestratorStore: {
    initialize: vi.fn(async () => undefined),
    getProfile: vi.fn(async (profileId: string) => mocks.profiles.get(profileId) ?? null),
    getAutomation: vi.fn(async () => null),
    createOrchestratorRun: vi.fn(async (run: AiOrchestratorRunRecord) => {
      mocks.runs.set(run.id, { ...run })
    }),
    getOrchestratorRun: vi.fn(async (runId: string) => mocks.runs.get(runId) ?? null),
    updateOrchestratorRun: vi.fn(
      async (runId: string, update: Partial<AiOrchestratorRunRecord>) => {
        const current = mocks.runs.get(runId)
        if (!current) throw new Error(`Unknown run ${runId}`)
        const next = { ...current, ...update, updatedAt: Date.now() }
        mocks.runs.set(runId, next)
        return next
      }
    ),
    appendOrchestratorEvent: mocks.appendOrchestratorEvent,
    appendRunMessage: mocks.appendRunMessage,
    listRunMessages: mocks.listRunMessages,
    deleteRunMessages: mocks.deleteRunMessages,
    truncateRunMessages: mocks.truncateRunMessages,
    listSessionHistory: vi.fn(async () => []),
    listOrchestratorRuns: vi.fn(async (options?: { status?: string }) =>
      Array.from(mocks.runs.values()).filter(
        (run) => !options?.status || run.status === options.status
      )
    )
  }
}))

vi.mock('./ai-automation-scheduler', () => ({
  aiAutomationScheduler: {
    setExecutor: vi.fn(),
    initialize: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  }
}))

vi.mock('./ai-cli-import-service', () => ({
  aiCliImportService: { preview: vi.fn(), apply: vi.fn() }
}))

vi.mock('./ai-imported-config-runtime', () => ({
  aiImportedConfigRuntime: {
    initialize: vi.fn(async () => undefined),
    buildSystemPrompt: vi.fn(async () => ''),
    assertAgentProfileVisible: vi.fn(async () => undefined)
  }
}))

vi.mock('./ai-run-input-vault', () => ({
  saveRunInput: vi.fn(async () => true),
  loadRunInput: vi.fn(async () => null),
  discardRunInput: vi.fn(async () => undefined)
}))

vi.mock('./ai-run-record-seal', () => ({
  sealRunRecord: vi.fn(async (runId: string, seq: number, record: unknown) =>
    JSON.stringify({ runId, seq, record })
  ),
  openRunRecords: vi.fn(async () => null)
}))

vi.mock('./providers/pi-cli-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./providers/pi-cli-runtime')>()
  return {
    ...actual,
    resolveOmpExecutable: mocks.resolveOmpExecutable,
    resolveCodexAcpExecutable: mocks.resolveCodexAcpExecutable,
    resolveCodexExecutable: mocks.resolveCodexExecutable,
    resolveClaudeAcpExecutable: mocks.resolveClaudeAcpExecutable,
    resolveClaudeExecutable: mocks.resolveClaudeExecutable
  }
})

vi.mock('./pi-agent-runtime-host', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pi-agent-runtime-host')>()
  return {
    ...actual,
    PiAgentRuntimeHost: class {
      start = vi.fn(async () => undefined)
      stop = mocks.piStop
      isReady = vi.fn(() => true)
      isRunActive = mocks.piIsRunActive
      execute = mocks.piExecute
      cancel = mocks.piCancel
    },
    resolvePiRuntimeToolSpecs: vi.fn(() => [])
  }
})

import { AiCliOrchestrator } from './ai-cli-orchestrator'
import {
  CLAUDE_CLI_PROFILE_ID,
  CLAUDE_CLI_PROVIDER_ID,
  CODEX_CLI_PROFILE_ID,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_PROFILE_ID,
  OMP_CLI_PROVIDER_ID
} from './providers/pi-cli-runtime'

const AUTHORITY_VERSION = 1_700_000_000_000

function makeProfile(id: string, overrides?: Partial<AiAgentProfile>): AiAgentProfile {
  return {
    id,
    name: id,
    description: `Profile ${id}`,
    runtimeProvider: 'pi-core',
    enabled: true,
    systemPrompt: `System prompt for ${id}`,
    modelPreference: [],
    allowedToolIds: ['file.read'],
    enabledSkillIds: [],
    permissionPolicy: { mode: 'manual', allowedPermissions: [] },
    timeoutMs: 30_000,
    createdAt: AUTHORITY_VERSION,
    updatedAt: AUTHORITY_VERSION,
    ...overrides
  }
}

function profileAuthorityDigest(profile: AiAgentProfile): string {
  return createHash('sha256')
    .update(
      structuredStrictStringify({
        id: profile.id,
        runtimeProvider: profile.runtimeProvider,
        enabled: profile.enabled,
        allowedToolIds: profile.allowedToolIds,
        enabledSkillIds: profile.enabledSkillIds,
        permissionPolicy: profile.permissionPolicy,
        timeoutMs: profile.timeoutMs,
        updatedAt: profile.updatedAt
      })
    )
    .digest('hex')
}

function opaqueRef(namespace: 'pi-call' | 'pi-tool', value: string): string {
  return `${namespace}:${createHash('sha256')
    .update(`${namespace}\0${value}`)
    .digest('hex')
    .slice(0, 32)}`
}

describe('AiCliOrchestrator multi-CLI runtime wiring & invariants', () => {
  let orchestrator: AiCliOrchestrator

  let ompSpawnSpy: MockInstance
  let acpSpawnSpy: MockInstance
  let codexSpawnSpy: MockInstance
  let claudeSpawnSpy: MockInstance

  let codexMcpCaptured: AcpMcpServerConfig[] | undefined
  let codexOnPermission: ((req: CliPermissionRequest) => Promise<CliPermissionDecision>) | undefined
  let claudeMcpCaptured: AcpMcpServerConfig[] | undefined
  let claudeCwdCaptured: string | undefined
  let claudeOnPermission:
    | ((req: CliPermissionRequest) => Promise<CliPermissionDecision>)
    | undefined
  let codexStreamImpl: () => AsyncIterable<CliRuntimeStreamEvent>
  let claudeStreamImpl: () => AsyncIterable<CliRuntimeStreamEvent>

  beforeEach(async () => {
    mocks.profiles.clear()
    mocks.runs.clear()
    mocks.runMessages.clear()
    mocks.tools.clear()
    mocks.worktreeLeases.clear()
    mocks.activeMcpServer = null
    mocks.gatewayMode = 'review'
    mocks.resolveOmpExecutable.mockReset().mockResolvedValue('/mock/bin/omp')
    mocks.resolveCodexAcpExecutable.mockReset().mockResolvedValue(null)
    mocks.resolveCodexExecutable.mockReset().mockResolvedValue('/mock/bin/codex')
    mocks.resolveClaudeAcpExecutable.mockReset().mockResolvedValue(null)
    mocks.resolveClaudeExecutable.mockReset().mockResolvedValue('/mock/bin/claude')
    mocks.requestConfirmation.mockReset().mockResolvedValue({ approved: true, remember: false })
    mocks.piExecute.mockReset().mockImplementation(async (payload: PiRuntimeStartPayload) => ({
      runId: payload.run.id,
      output: 'pi-output',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    }))
    mocks.worktreeAcquire.mockClear()
    mocks.worktreeGetDiff.mockClear()
    mocks.worktreeRelease.mockClear()
    mocks.worktreeDisposeAll.mockClear()
    mocks.appendOrchestratorEvent.mockClear()
    mocks.listRunMessages.mockClear()

    codexMcpCaptured = undefined
    codexOnPermission = undefined
    claudeMcpCaptured = undefined
    claudeCwdCaptured = undefined
    claudeOnPermission = undefined

    codexStreamImpl = async function* () {
      yield { type: 'delta', text: 'codex-native-answer' }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }
    }
    claudeStreamImpl = async function* () {
      yield { type: 'delta', text: 'claude-native-answer' }
      yield { type: 'usage', usage: { inputTokens: 14, outputTokens: 6, totalTokens: 20 } }
    }

    ompSpawnSpy = vi.spyOn(OmpAcpClient, 'spawn').mockImplementation(async () => {
      return {
        protocol: 'acp',
        agentInfo: { name: 'omp', version: '18.16.0' },
        isClosed: vi.fn(() => false),
        stderrTail: vi.fn(() => ''),
        on: vi.fn(),
        close: vi.fn(async () => undefined),
        createSession: vi.fn(async () => ({
          sessionId: 'omp-sess-1',
          protocol: 'acp',
          promptStream: async function* () {
            yield { type: 'delta', text: 'omp-answer' }
          },
          cancel: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined)
        }))
      } as unknown as OmpAcpClient
    })

    acpSpawnSpy = vi.spyOn(AcpClient, 'spawn').mockImplementation(async (opts) => {
      return {
        protocol: 'acp',
        agentInfo: { name: opts.label ?? 'acp', version: '1.0.0' },
        isClosed: vi.fn(() => false),
        stderrTail: vi.fn(() => ''),
        on: vi.fn(),
        close: vi.fn(async () => undefined),
        createSession: vi.fn(async () => ({
          sessionId: `${opts.label ?? 'acp'}-sess-1`,
          protocol: 'acp',
          promptStream: async function* () {
            yield { type: 'delta', text: `${opts.label ?? 'acp'}-answer` }
          },
          cancel: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined)
        }))
      } as unknown as AcpClient
    })

    codexSpawnSpy = vi.spyOn(CodexAppServerClient, 'spawn').mockImplementation(async (opts) => {
      codexMcpCaptured = opts?.mcpServers
      codexOnPermission = opts?.onPermission as typeof codexOnPermission
      return {
        protocol: 'codex-app-server',
        agentInfo: { name: 'codex', version: '1.0.0' },
        isClosed: vi.fn(() => false),
        stderrTail: vi.fn(() => ''),
        on: vi.fn(),
        close: vi.fn(async () => undefined),
        createSession: vi.fn(async () => ({
          sessionId: 'codex-thread-1',
          protocol: 'codex-app-server',
          promptStream: () => codexStreamImpl(),
          cancel: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined)
        }))
      } as unknown as CodexAppServerClient
    })

    claudeSpawnSpy = vi.spyOn(ClaudeStreamClient, 'spawn').mockImplementation(async (opts) => {
      claudeMcpCaptured = opts?.mcpServers
      claudeCwdCaptured = opts?.cwd
      claudeOnPermission = opts?.onPermission as typeof claudeOnPermission
      return {
        protocol: 'claude-stream-json',
        agentInfo: { name: 'claude', version: '2.1.330' },
        isClosed: vi.fn(() => false),
        stderrTail: vi.fn(() => ''),
        on: vi.fn(),
        close: vi.fn(async () => undefined),
        createSession: vi.fn(async () => ({
          sessionId: 'claude-sess-1',
          protocol: 'claude-stream-json',
          promptStream: () => claudeStreamImpl(),
          cancel: vi.fn(async () => undefined),
          close: vi.fn(async () => undefined)
        }))
      } as unknown as ClaudeStreamClient
    })

    mocks.profiles.set('default-pi', makeProfile('default-pi'))
    mocks.profiles.set(OMP_CLI_PROFILE_ID, makeProfile(OMP_CLI_PROFILE_ID))
    mocks.profiles.set(CODEX_CLI_PROFILE_ID, makeProfile(CODEX_CLI_PROFILE_ID))
    mocks.profiles.set(CLAUDE_CLI_PROFILE_ID, makeProfile(CLAUDE_CLI_PROFILE_ID))
    mocks.profiles.set(
      'custom-codex-claude-profile',
      makeProfile('custom-codex-claude-profile', {
        modelPreference: [CODEX_CLI_PROVIDER_ID, CLAUDE_CLI_PROVIDER_ID, OMP_CLI_PROVIDER_ID]
      })
    )

    orchestrator = new AiCliOrchestrator()
    await orchestrator.initialize()
  })

  afterEach(async () => {
    await orchestrator.shutdown().catch(() => undefined)
    vi.restoreAllMocks()
  })

  describe('strict 1:1 scheduler-decides-executor isolation (AGENTS.md)', () => {
    it('routes profile:cli:codex ONLY to Codex driver and never spawns OMP, Claude, or Pi', async () => {
      const res = await orchestrator.executeAgentCapability(
        { task: 'Run codex task' },
        { metadata: { profileId: CODEX_CLI_PROFILE_ID } }
      )
      expect(res.result.result).toBe('codex-native-answer')
      expect(res.provider).toBe('tuff-codex-runtime')
      expect(res.model).toBe('codex-app-server')
      expect(codexSpawnSpy).toHaveBeenCalledTimes(1)
      expect(ompSpawnSpy).not.toHaveBeenCalled()
      expect(claudeSpawnSpy).not.toHaveBeenCalled()
      expect(acpSpawnSpy).not.toHaveBeenCalled()
      expect(mocks.piExecute).not.toHaveBeenCalled()
    })

    it('prefers codex-acp adapter over codex app-server when installed and reports model=codex-acp', async () => {
      mocks.resolveCodexAcpExecutable.mockResolvedValue('/mock/bin/codex-acp')
      const res = await orchestrator.executeAgentCapability(
        { task: 'Run codex acp' },
        { metadata: { profileId: CODEX_CLI_PROFILE_ID } }
      )
      expect(res.result.result).toBe('codex-acp-answer')
      expect(res.provider).toBe('tuff-codex-runtime')
      expect(res.model).toBe('codex-acp')
      expect(acpSpawnSpy).toHaveBeenCalledTimes(1)
      expect(codexSpawnSpy).not.toHaveBeenCalled()
      expect(ompSpawnSpy).not.toHaveBeenCalled()
      expect(claudeSpawnSpy).not.toHaveBeenCalled()
    })

    it('routes profile:cli:claude ONLY to Claude driver and prefers claude-acp when installed', async () => {
      const nativeRes = await orchestrator.executeAgentCapability(
        { task: 'Run claude native' },
        { metadata: { profileId: CLAUDE_CLI_PROFILE_ID } }
      )
      expect(nativeRes.result.result).toBe('claude-native-answer')
      expect(nativeRes.provider).toBe('tuff-claude-runtime')
      expect(nativeRes.model).toBe('claude-stream-json')
      expect(claudeSpawnSpy).toHaveBeenCalledTimes(1)
      expect(codexSpawnSpy).not.toHaveBeenCalled()
      expect(ompSpawnSpy).not.toHaveBeenCalled()

      mocks.resolveClaudeAcpExecutable.mockResolvedValue('/mock/bin/claude-agent-acp')
      const acpRes = await orchestrator.executeAgentCapability(
        { task: 'Run claude acp' },
        { metadata: { profileId: CLAUDE_CLI_PROFILE_ID } }
      )
      expect(acpRes.result.result).toBe('claude-acp-answer')
      expect(acpRes.provider).toBe('tuff-claude-runtime')
      expect(acpRes.model).toBe('claude-acp')
      expect(acpSpawnSpy).toHaveBeenCalledTimes(1)
      expect(claudeSpawnSpy).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['default-pi', 'default-pi', CODEX_CLI_PROVIDER_ID, 'gpt-5.4'],
      ['unnamed profile', undefined, CLAUDE_CLI_PROVIDER_ID, 'claude-sonnet-4-6'],
      ['custom profile', 'custom-codex-claude-profile', OMP_CLI_PROVIDER_ID, 'cpa/gemini-3.8-flash']
    ])(
      'keeps %s strictly on PiAgentRuntimeHost even when handed %s model',
      async (_label, profileId, providerId, model) => {
        const run = await orchestrator.executeWorkspace(
          { objective: 'Stay on Pi scheduler', profileId },
          {
            conversationId: `conv-${profileId ?? 'unnamed'}`,
            turnId: 'turn-1',
            projectId: null,
            providerId,
            model,
            history: [],
            assertAuthority: async () => undefined
          }
        )

        expect(run.status).toBe('completed')
        expect(run.output).toBe('pi-output')
        expect(mocks.piExecute).toHaveBeenCalledTimes(1)
        expect(ompSpawnSpy).not.toHaveBeenCalled()
        expect(acpSpawnSpy).not.toHaveBeenCalled()
        expect(codexSpawnSpy).not.toHaveBeenCalled()
        expect(claudeSpawnSpy).not.toHaveBeenCalled()
      }
    )
  })

  describe('shared tuff-host MCP injection and fail-closed permission gate', () => {
    it('bridges tuff-host MCP and toolGatewayModule.requestConfirmation for Codex & Claude', async () => {
      mocks.activeMcpServer = { url: 'http://127.0.0.1:44999/mcp', token: 'tok-multi-secret' }

      let releaseCodex: (() => void) | undefined
      codexStreamImpl = async function* () {
        await new Promise<void>((resolve) => {
          releaseCodex = resolve
        })
        yield { type: 'delta', text: 'codex-ok' }
      }

      const codexRun = orchestrator.execute({
        objective: 'Codex with gate',
        profileId: CODEX_CLI_PROFILE_ID
      })
      await new Promise((r) => setTimeout(r, 20))

      expect(codexMcpCaptured).toEqual([
        {
          name: 'tuff-host',
          type: 'http',
          url: 'http://127.0.0.1:44999/mcp',
          headers: [{ name: 'Authorization', value: 'Bearer tok-multi-secret' }]
        }
      ])

      // Execute risk: remember=true from confirmation MUST be downgraded to remember=false
      mocks.requestConfirmation.mockResolvedValueOnce({ approved: true, remember: true })
      await expect(
        codexOnPermission!({
          sessionId: 'codex-thread-1',
          protocol: 'codex-app-server',
          toolName: 'commandExecution',
          riskHint: 'execute',
          input: { command: 'rm -rf tmp' }
        })
      ).resolves.toMatchObject({ approved: true, remember: false })

      // Read risk: remember=true IS preserved
      mocks.requestConfirmation.mockResolvedValueOnce({ approved: true, remember: true })
      await expect(
        codexOnPermission!({
          sessionId: 'codex-thread-1',
          protocol: 'codex-app-server',
          toolName: 'readFile',
          riskHint: 'read',
          input: { path: 'README.md' }
        })
      ).resolves.toMatchObject({ approved: true, remember: true })

      // Confirmation error -> fail closed
      mocks.requestConfirmation.mockRejectedValueOnce(new Error('Surface unmounted'))
      await expect(
        codexOnPermission!({
          sessionId: 'codex-thread-1',
          protocol: 'codex-app-server',
          toolName: 'fileChange',
          riskHint: 'write',
          input: { path: 'a.ts' }
        })
      ).resolves.toMatchObject({ approved: false, cancelled: false })

      releaseCodex?.()
      await expect(codexRun).resolves.toMatchObject({ status: 'completed', output: 'codex-ok' })

      // Claude stream-json receives tuff-host MCP and respects full mode per call
      let releaseClaude: (() => void) | undefined
      claudeStreamImpl = async function* () {
        await new Promise<void>((resolve) => {
          releaseClaude = resolve
        })
        yield { type: 'delta', text: 'claude-ok' }
      }

      const claudeRun = orchestrator.execute({
        objective: 'Claude with gate',
        profileId: CLAUDE_CLI_PROFILE_ID
      })
      await new Promise((r) => setTimeout(r, 20))

      expect(claudeMcpCaptured).toEqual([
        {
          name: 'tuff-host',
          type: 'http',
          url: 'http://127.0.0.1:44999/mcp',
          headers: [{ name: 'Authorization', value: 'Bearer tok-multi-secret' }]
        }
      ])

      mocks.gatewayMode = 'full'
      const callsBeforeFull = mocks.requestConfirmation.mock.calls.length
      await expect(
        claudeOnPermission!({
          sessionId: 'claude-sess-1',
          protocol: 'claude-stream-json',
          toolName: 'Bash',
          input: { command: 'ls' }
        })
      ).resolves.toMatchObject({ approved: true, remember: false })
      expect(mocks.requestConfirmation.mock.calls.length).toBe(callsBeforeFull)

      // Switching back to review mid-run immediately re-engages confirmation
      mocks.gatewayMode = 'review'
      mocks.requestConfirmation.mockResolvedValueOnce({ approved: false, remember: false })
      await expect(
        claudeOnPermission!({
          sessionId: 'claude-sess-1',
          protocol: 'claude-stream-json',
          toolName: 'Bash',
          input: { command: 'ls' }
        })
      ).resolves.toMatchObject({ approved: false })
      expect(mocks.requestConfirmation.mock.calls.length).toBe(callsBeforeFull + 1)

      releaseClaude?.()
      await expect(claudeRun).resolves.toMatchObject({ status: 'completed', output: 'claude-ok' })
    })
  })

  describe('opt-in Git Worktree isolation and shutdown hygiene', () => {
    it('isolates subprocess cwd when metadata.worktree is enabled without leaking worktreePath into persisted metadata', async () => {
      const run = await orchestrator.execute({
        objective: 'Work inside isolated worktree',
        profileId: CLAUDE_CLI_PROFILE_ID,
        cwd: '/tmp',
        metadata: { worktree: { enabled: true, cleanupOnComplete: false } }
      })

      expect(run.status).toBe('completed')
      expect(mocks.worktreeAcquire).toHaveBeenCalledTimes(1)
      expect(claudeCwdCaptured).toBe(`/mock-userdata/ai-worktrees/wt-${run.id}`)

      // Persisted run record and events must NOT contain worktreePath or worktree option
      const storedRun = mocks.runs.get(run.id)
      expect(JSON.stringify(storedRun)).not.toContain('ai-worktrees')
      expect(JSON.stringify(mocks.appendOrchestratorEvent.mock.calls)).not.toContain('ai-worktrees')

      // Orchestrator exposes worktree lease / diff / release hooks
      expect(orchestrator.getRunWorktreeLease(run.id)?.worktreeId).toBe(`wt-${run.id}`)
      const diff = await orchestrator.getRunWorktreeDiff(run.id)
      expect(diff?.patch).toBe('+edited')
      const released = await orchestrator.releaseRunWorktree(run.id, { force: true })
      expect(released?.removed).toBe(true)

      await orchestrator.shutdown()
      expect(mocks.worktreeDisposeAll).toHaveBeenCalledWith({ force: false })
    })
  })

  describe('restart recovery for Codex and Claude external CLI profiles', () => {
    it('marks already-running Codex/Claude runs interrupted and resumes queued runs without Pi replay logs', async () => {
      await orchestrator.shutdown()

      const codexProfile = makeProfile(CODEX_CLI_PROFILE_ID)
      const claudeProfile = makeProfile(CLAUDE_CLI_PROFILE_ID)
      const metadataFor = (profile: AiAgentProfile) => ({
        schemaVersion: 1,
        executionBudget: { maxSteps: 10, maxChildRuns: 0, maxConcurrency: 1 },
        allowedToolRefs: [opaqueRef('pi-tool', 'file.read')],
        requestInputPresent: false,
        profileAuthorityVersion: profile.updatedAt,
        profileAuthorityDigest: profileAuthorityDigest(profile)
      })

      mocks.runs.set('codex-running', {
        id: 'codex-running',
        sessionId: 's-1',
        objective: 'Running codex',
        profileId: CODEX_CLI_PROFILE_ID,
        runtimeProvider: 'pi-core',
        cwd: '/tmp',
        status: 'running',
        metadata: metadataFor(codexProfile),
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      mocks.runs.set('claude-queued', {
        id: 'claude-queued',
        sessionId: 's-2',
        objective: 'Queued claude',
        profileId: CLAUDE_CLI_PROFILE_ID,
        runtimeProvider: 'pi-core',
        cwd: '/tmp',
        status: 'queued',
        metadata: metadataFor(claudeProfile),
        createdAt: Date.now(),
        updatedAt: Date.now()
      })

      const restarted = new AiCliOrchestrator()
      await restarted.initialize()
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (mocks.runs.get('claude-queued')?.status === 'completed') break
        await new Promise((r) => setTimeout(r, 10))
      }
      await restarted.shutdown()

      expect(mocks.runs.get('codex-running')?.status).toBe('interrupted')
      expect(mocks.runs.get('claude-queued')?.status).toBe('completed')
      expect(mocks.runs.get('claude-queued')?.output).toBe('claude-native-answer')
      expect(mocks.piExecute).not.toHaveBeenCalled()
      expect(mocks.listRunMessages).not.toHaveBeenCalled()
    })
  })
})

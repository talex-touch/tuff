import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type {
  LocalAiCliErrorCode,
  LocalAiCliPasteBackRequest,
  LocalAiCliPasteBackResult,
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliSessionSummary,
  LocalAiCliStartRequest,
  LocalAiCliTaskChunk,
  LocalAiCliTerminalCreateRequest,
  LocalAiCliTerminalExit
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { HandlerContext, StreamContext } from '@talex-touch/utils/transport/main'
import type { WebContents } from 'electron'
import type { IPty } from 'node-pty'
import type { ChildProcess } from 'node:child_process'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { PiEntriesSnapshot, PiSessionFileCapture } from './pi-native-session'
import type { StoredLocalAiCliSession } from './session-store'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import {
  LOCAL_AI_CLI_LIMITS,
  LocalAiCliEvents,
  normalizeLocalAiCliApprovalDecision,
  normalizeLocalAiCliProjectId,
  normalizeLocalAiCliSessionRef,
  normalizeLocalAiCliStartRequest,
  normalizeLocalAiCliTerminalCreateRequest
} from '@talex-touch/utils/transport/events/local-ai-cli'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { BrowserWindow, clipboard, dialog } from 'electron'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import {
  getAppDestinationNavigationService,
  type AppDestinationRuntime
} from '../app-destination/app-destination-navigation'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { omniPanelModule } from '../omni-panel'
import { getAutoPasteCapabilityPatch } from '../platform/capability-adapter'
import { getProject, touchProject } from '../project/project-store'
import { getMainConfig, saveMainConfig } from '../storage'
import { activeAppService } from '../system/active-app'
import { sendPlatformShortcut } from '../system/desktop-shortcut'
import { LocalAiCliApprovalBroker } from './approval-broker'
import {
  resolveAllLocalAiCliProviderStatuses,
  resolveLocalAiCliProviderStatus
} from './executable-resolver'
import { nativeSessionLeaseRegistry } from './native-session-lease'
import { isNativeSessionMissingError } from './native-session-errors'
import { scanNativeSessionsForProject } from './native-session-discovery'
import {
  capturePiSessionFile,
  parsePiEntriesResponse,
  parsePiStateResponse,
  verifyPiSessionAppend
} from './pi-native-session'
import {
  createLocalAiCliResumeArgs,
  createLocalAiCliTaskSpec,
  decodeLocalAiCliEvent,
  getLocalAiCliProviderDefinition,
  LOCAL_AI_CLI_PROVIDERS
} from './provider-registry'
import {
  forgetLocalAiCliSession,
  getLocalAiCliSession,
  listLocalAiCliSessions,
  markLocalAiCliSessionState,
  subscribeLocalAiCliSessionMutations,
  touchLocalAiCliSession,
  upsertDiscoveredLocalAiCliSessions,
  upsertLocalAiCliSession
} from './session-store'
import { setLocalAiCliWorkspaceRoot } from './workspace-root'

const localAiCliLog = createLogger('LocalAiCli')
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const LOCAL_AI_CLI_SHORTCUT_ID = 'local-ai-cli.quick-open'
const LOCAL_AI_CLI_SHORTCUT_OWNER = 'core-app:local-ai-cli'

type MainTransport = ReturnType<typeof getTuffTransportMain>

interface TaskProcessSession {
  process?: ChildProcess
  abortController?: AbortController
  releaseLease?: () => void
  done?: Promise<void>
}

interface TerminalSession {
  ownerId: number
  process: IPty
  dataSubscription: { dispose: () => void }
  exitSubscription: { dispose: () => void }
  sender: WebContents
  senderDestroyed: () => void
  releaseLease?: () => void
}

interface LocalAiCliExecution {
  cwd: string
  projectId: string | null
  pointer: StoredLocalAiCliSession | null
}

interface PiRunState {
  beforeEntries: PiEntriesSnapshot
  capturedHead: string | null
  file: PiSessionFileCapture
  verificationRequested: boolean
}

function isLocalAiCliBetaAvailable(): boolean {
  return process.platform === 'darwin' && process.env.TUFF_ENABLE_LOCAL_AI_CLI === '1'
}

function readSettings(): AppSetting {
  return getMainConfig(StorageList.APP_SETTING) as AppSetting
}

function assertHostContext(
  context:
    | Pick<HandlerContext, 'plugin' | 'sender'>
    | Pick<StreamContext<unknown>, 'plugin' | 'sender'>
): number {
  if (context.plugin || typeof context.sender?.id !== 'number') {
    throw new Error('LOCAL_AI_CLI_HOST_ONLY')
  }
  return context.sender.id
}

function terminalSize(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, max)
    : fallback
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function sanitizedChildEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[0] !== 'ELECTRON_RUN_AS_NODE'
    )
  )
}

function buildPrompt(prompt: string, context: LocalAiCliStartRequest['context']): string {
  if (context.length === 0) return prompt
  const contextText = context.map((item) => `[${item.kind}]\n${item.text}`).join('\n\n')
  return `${prompt}\n\nContext supplied by the user:\n${contextText}`
}

function terminalArgs(
  provider: LocalAiCliProviderId,
  access: LocalAiCliTerminalCreateRequest['access'],
  nativeSessionId?: string
): string[] {
  if (access === 'workspace-write') {
    throw new Error('LOCAL_AI_CLI_WRITE_APPROVAL_UNAVAILABLE')
  }
  const resumeArgs = nativeSessionId ? createLocalAiCliResumeArgs(provider, nativeSessionId) : []
  switch (provider) {
    case 'pi':
      return [
        '--no-tools',
        '--no-extensions',
        '--no-skills',
        '--no-prompt-templates',
        '--no-context-files',
        ...resumeArgs
      ]
    case 'oh-my-pi':
      return ['--no-tools', '--no-extensions', '--no-skills', '--no-rules', ...resumeArgs]
    case 'codex':
      return [
        '--ask-for-approval',
        'never',
        '--sandbox',
        'read-only',
        '--no-alt-screen',
        ...resumeArgs
      ]
    case 'claude':
      return [
        '--tools',
        '',
        '--disable-slash-commands',
        '--permission-mode',
        'plan',
        '--no-chrome',
        ...resumeArgs
      ]
  }
}

function toSessionSummary(session: StoredLocalAiCliSession): LocalAiCliSessionSummary {
  return {
    sessionRef: session.id,
    projectId: session.projectId,
    provider: session.provider,
    title: session.title,
    state: session.state,
    origin: session.origin,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastSeenAt: session.lastSeenAt
  }
}

function taskFailureCode(error: unknown): LocalAiCliErrorCode {
  const message = error instanceof Error ? error.message : ''
  if (
    message === 'PROVIDER_RESUME_UNSUPPORTED' ||
    message === 'NATIVE_SESSION_BUSY' ||
    message === 'NATIVE_SESSION_MISSING' ||
    message === 'NATIVE_SESSION_CONFLICT' ||
    message === 'WORKSPACE_INVALID'
  ) {
    return message
  }
  return message === 'PROCESS_START_FAILED' ? 'PROCESS_START_FAILED' : 'PROTOCOL_INVALID'
}

export class LocalAiCliModule extends BaseModule {
  static key = Symbol.for('local-ai-cli')
  name: ModuleKey = LocalAiCliModule.key

  private transport: MainTransport | null = null
  private destinationRuntime: AppDestinationRuntime | null = null
  private readonly disposers: Array<() => void> = []
  private readonly approvals = new LocalAiCliApprovalBroker()
  private readonly taskProcesses = new Map<string, TaskProcessSession>()
  private readonly terminalSessions = new Map<string, TerminalSession>()
  private readonly nativeSessionLeases = nativeSessionLeaseRegistry
  private workspacePath = ''
  private pendingPanelReturnUntil = 0

  constructor() {
    super(LocalAiCliModule.key, { create: true })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'LocalAiCliModule.onInit')
    const channel = runtime.app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
    this.destinationRuntime = runtime.app
    this.workspacePath = join(this.requireDirPath(ctx), 'workspace')
    await mkdir(this.workspacePath, { recursive: true })
    setLocalAiCliWorkspaceRoot(this.workspacePath)
    this.registerHandlers()
    if (isLocalAiCliBetaAvailable()) {
      shortcutModule.registerMainShortcut(
        LOCAL_AI_CLI_SHORTCUT_ID,
        'CommandOrControl+Shift+L',
        () => {
          void omniPanelModule.showLocalAi()
        },
        { owner: LOCAL_AI_CLI_SHORTCUT_OWNER, enabled: true }
      )
    }
  }

  private registerHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      subscribeLocalAiCliSessionMutations((mutation) => {
        transport.broadcast(LocalAiCliEvents.session.changed, mutation)
      }),
      transport.on(LocalAiCliEvents.status.get, async (_payload, context) => {
        assertHostContext(context)
        return await this.getStatus()
      }),
      transport.on(LocalAiCliEvents.status.locate, async (payload, context) => {
        assertHostContext(context)
        return await this.locateProvider(payload?.provider)
      }),
      transport.on(LocalAiCliEvents.status.openSettings, async (_payload, context) => {
        assertHostContext(context)
        return await this.openSettings()
      }),
      transport.on(LocalAiCliEvents.status.returnToPanel, async (_payload, context) => {
        assertHostContext(context)
        return await this.returnToPanel()
      }),
      transport.onStream(LocalAiCliEvents.task.stream, async (payload, context) => {
        const ownerId = assertHostContext(context)
        await this.runTask(payload, ownerId, context)
      }),
      transport.on(LocalAiCliEvents.task.approval, (payload, context) => {
        const ownerId = assertHostContext(context)
        const decision = normalizeLocalAiCliApprovalDecision(payload)
        this.approvals.resolve(decision.approvalId, ownerId, decision.decision)
      }),
      transport.on(LocalAiCliEvents.task.pasteBack, async (payload, context) => {
        assertHostContext(context)
        return await this.pasteBack(payload)
      }),
      transport.on(LocalAiCliEvents.session.list, async (payload, context) => {
        assertHostContext(context)
        let projectId: string | null | undefined
        if (payload?.projectId === null) {
          projectId = null
        } else if (payload?.projectId !== undefined) {
          projectId = normalizeLocalAiCliProjectId(payload.projectId)
          if (!projectId) throw new Error('LOCAL_AI_CLI_PROJECT_INVALID')
        }
        return (await listLocalAiCliSessions(projectId)).map(toSessionSummary)
      }),
      transport.on(LocalAiCliEvents.session.discover, async (payload, context) => {
        assertHostContext(context)
        const projectId = normalizeLocalAiCliProjectId(payload?.projectId)
        if (!projectId) throw new Error('LOCAL_AI_CLI_PROJECT_INVALID')
        const project = await getProject(projectId)
        if (!project) throw new Error('LOCAL_AI_CLI_PROJECT_INVALID')
        if (project.archived) throw new Error('LOCAL_AI_CLI_PROJECT_ARCHIVED')
        const scan = await scanNativeSessionsForProject(project.rootPath)
        const persisted = await upsertDiscoveredLocalAiCliSessions(
          scan.candidates.map((candidate) => ({
            projectId,
            ...candidate
          }))
        )
        if (persisted.sessions.length > 0) await touchProject(projectId)
        return {
          discovered: persisted.created,
          skipped: scan.skipped + persisted.sessions.length - persisted.created,
          incomplete: scan.incomplete
        }
      }),
      transport.on(LocalAiCliEvents.session.forget, async (payload, context) => {
        assertHostContext(context)
        const sessionRef = normalizeLocalAiCliSessionRef(payload?.sessionRef)
        if (!sessionRef) throw new Error('LOCAL_AI_CLI_SESSION_INVALID')
        const pointer = await getLocalAiCliSession(sessionRef)
        if (!pointer) return { forgotten: false }
        if (
          this.nativeSessionLeases.isLeased({
            provider: pointer.provider,
            projectRoot: pointer.projectRoot,
            nativeSessionId: pointer.nativeSessionId
          })
        ) {
          throw new Error('NATIVE_SESSION_BUSY')
        }
        return { forgotten: await forgetLocalAiCliSession(sessionRef) }
      }),
      transport.on(LocalAiCliEvents.terminal.create, async (payload, context) => {
        const ownerId = assertHostContext(context)
        return await this.createTerminal(payload, ownerId, context.sender as WebContents)
      }),
      transport.on(LocalAiCliEvents.terminal.write, (payload, context) => {
        this.writeTerminal(payload?.sessionId, payload?.data, assertHostContext(context))
      }),
      transport.on(LocalAiCliEvents.terminal.resize, (payload, context) => {
        this.resizeTerminal(
          payload?.sessionId,
          payload?.cols,
          payload?.rows,
          assertHostContext(context)
        )
      }),
      transport.on(LocalAiCliEvents.terminal.kill, (payload, context) => {
        this.killTerminal(payload?.sessionId, assertHostContext(context))
      })
    )
  }

  private async openSettings(): Promise<boolean> {
    const runtime = this.destinationRuntime
    if (!runtime) return false

    const result = getAppDestinationNavigationService(runtime).open('settings-intelligence')
    if (result.status === 'unavailable') return false

    this.pendingPanelReturnUntil = Date.now() + 5 * 60_000
    return true
  }

  private async returnToPanel(): Promise<boolean> {
    if (!isLocalAiCliBetaAvailable() || Date.now() > this.pendingPanelReturnUntil) {
      this.pendingPanelReturnUntil = 0
      return false
    }
    const status = await this.getStatus()
    const runnable = status.providers.some(
      (provider) => provider.enabled && provider.installed && provider.capabilities.taskRead
    )
    if (!status.enabled || !runnable) return false
    this.pendingPanelReturnUntil = 0
    await omniPanelModule.restoreLocalAi()
    return true
  }

  private async getStatus() {
    const settings = readSettings().localAiCli
    if (!isLocalAiCliBetaAvailable()) {
      return {
        betaAvailable: false,
        enabled: false,
        defaultProvider: null,
        providers: LOCAL_AI_CLI_PROVIDERS.map((provider) => ({
          id: provider.id,
          label: provider.label,
          enabled: false,
          installed: false,
          issueCode: 'BETA_UNAVAILABLE' as const,
          capabilities: {
            taskRead: false,
            taskWriteApproval: false,
            terminalRead: false,
            terminalWriteApproval: false,
            taskResume: false,
            terminalResume: false
          }
        }))
      }
    }
    return {
      betaAvailable: true,
      enabled: settings.enabled,
      defaultProvider: settings.defaultProvider,
      providers: await resolveAllLocalAiCliProviderStatuses(settings)
    }
  }

  private async locateProvider(provider: unknown): Promise<LocalAiCliProviderStatus> {
    if (!isLocalAiCliBetaAvailable()) throw new Error('LOCAL_AI_CLI_BETA_UNAVAILABLE')
    const definition = LOCAL_AI_CLI_PROVIDERS.find((candidate) => candidate.id === provider)
    if (!definition) throw new Error('LOCAL_AI_CLI_PROVIDER_INVALID')
    const result = await dialog.showOpenDialog({
      title: `Locate ${definition.label}`,
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length !== 1) {
      throw new Error('LOCAL_AI_CLI_LOCATE_CANCELLED')
    }
    const appSettings = readSettings()
    const nextSettings = structuredClone(appSettings)
    nextSettings.localAiCli.providers[definition.id].executableOverride = result.filePaths[0]!
    await saveMainConfig(StorageList.APP_SETTING, nextSettings)
    return await resolveLocalAiCliProviderStatus(definition.id, nextSettings.localAiCli)
  }

  private async requireRunnableProvider(
    providerId: LocalAiCliProviderId,
    access: LocalAiCliTerminalCreateRequest['access']
  ): Promise<LocalAiCliProviderStatus> {
    if (!isLocalAiCliBetaAvailable()) throw new Error('LOCAL_AI_CLI_BETA_UNAVAILABLE')
    const settings = readSettings().localAiCli
    if (!settings.enabled) throw new Error('LOCAL_AI_CLI_FEATURE_DISABLED')
    if (!settings.providers[providerId]?.enabled) {
      throw new Error('LOCAL_AI_CLI_PROVIDER_DISABLED')
    }
    const status = await resolveLocalAiCliProviderStatus(providerId, settings)
    if (!status.installed || !status.executablePath) {
      throw new Error('LOCAL_AI_CLI_PROVIDER_UNAVAILABLE')
    }
    if (access === 'workspace-write' && !status.capabilities.taskWriteApproval) {
      throw new Error('LOCAL_AI_CLI_WRITE_APPROVAL_UNAVAILABLE')
    }
    return status
  }

  private async verifyExecutionRoot(storedRoot: string): Promise<string> {
    try {
      const canonicalRoot = await realpath(storedRoot)
      const details = await stat(canonicalRoot)
      if (!details.isDirectory() || canonicalRoot !== storedRoot)
        throw new Error('WORKSPACE_INVALID')
      return canonicalRoot
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_INVALID') throw error
      throw new Error('WORKSPACE_INVALID')
    }
  }

  private async resolveLocalAiCliExecution(request: {
    provider: LocalAiCliProviderId
    projectId?: string
    sessionRef?: string
  }): Promise<LocalAiCliExecution> {
    if (request.sessionRef) {
      const pointer = await getLocalAiCliSession(request.sessionRef)
      if (!pointer) throw new Error('NATIVE_SESSION_MISSING')
      if (
        pointer.provider !== request.provider ||
        pointer.projectId !== (request.projectId ?? null)
      ) {
        throw new Error('NATIVE_SESSION_CONFLICT')
      }
      if (pointer.state === 'missing') throw new Error('NATIVE_SESSION_MISSING')
      if (pointer.state === 'conflict') throw new Error('NATIVE_SESSION_CONFLICT')
      return {
        cwd: await this.verifyExecutionRoot(pointer.projectRoot),
        projectId: pointer.projectId,
        pointer
      }
    }

    if (request.projectId) {
      const project = await getProject(request.projectId)
      if (!project) throw new Error('LOCAL_AI_CLI_PROJECT_INVALID')
      return {
        cwd: await this.verifyExecutionRoot(project.rootPath),
        projectId: project.id,
        pointer: null
      }
    }

    return {
      cwd: await this.verifyExecutionRoot(this.workspacePath),
      projectId: null,
      pointer: null
    }
  }

  private acquirePointerLease(pointer: StoredLocalAiCliSession): () => void {
    return this.nativeSessionLeases.acquire({
      provider: pointer.provider,
      projectRoot: pointer.projectRoot,
      nativeSessionId: pointer.nativeSessionId
    })
  }

  private async registerFreshNativeSession(
    execution: LocalAiCliExecution,
    provider: LocalAiCliProviderId,
    nativeSessionId: string,
    prompt: string,
    expectedHeadId?: string | null
  ): Promise<{ pointer: StoredLocalAiCliSession; releaseLease: () => void }> {
    const releaseLease = this.nativeSessionLeases.acquire({
      provider,
      projectRoot: execution.cwd,
      nativeSessionId
    })
    try {
      const pointer = await upsertLocalAiCliSession({
        projectId: execution.projectId,
        provider,
        projectRoot: execution.cwd,
        nativeSessionId,
        prompt,
        expectedHeadId
      })
      if (execution.projectId) await touchProject(execution.projectId)
      return { pointer, releaseLease }
    } catch (error) {
      releaseLease()
      throw error
    }
  }

  private async touchNativeSession(
    pointer: StoredLocalAiCliSession,
    expectedHeadId?: string
  ): Promise<void> {
    await touchLocalAiCliSession(pointer.id, expectedHeadId)
    if (pointer.projectId) await touchProject(pointer.projectId)
  }

  private async runClaudeSdkTask(
    callId: string,
    request: LocalAiCliStartRequest,
    prompt: string,
    ownerId: number,
    executablePath: string,
    execution: LocalAiCliExecution,
    context: StreamContext<LocalAiCliTaskChunk>
  ): Promise<void> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const abortController = new AbortController()
    const readTools = request.access === 'answer-only' ? [] : ['Read', 'Glob', 'Grep']
    const tools =
      request.access === 'workspace-write' ? [...readTools, 'Edit', 'Write', 'Bash'] : readTools
    let completeText = ''
    let completed = false
    let pointer = execution.pointer
    let sessionPublished = false
    let releaseLease = pointer ? this.acquirePointerLease(pointer) : undefined
    let settleTask!: () => void
    const taskDone = new Promise<void>((resolve) => {
      settleTask = resolve
    })
    this.taskProcesses.set(callId, { abortController, releaseLease, done: taskDone })
    context.emit({ type: 'status', callId, status: 'starting' })
    context.signal.addEventListener('abort', () => abortController.abort(), { once: true })

    try {
      const stream = query({
        prompt,
        options: {
          abortController,
          cwd: execution.cwd,
          ...(pointer ? { resume: pointer.nativeSessionId } : {}),
          pathToClaudeCodeExecutable: executablePath,
          includePartialMessages: true,
          maxTurns: 1,
          tools,
          allowedTools: readTools,
          permissionMode: 'default',
          settings:
            request.access === 'workspace-write'
              ? { permissions: { allow: readTools, ask: ['Bash', 'Edit', 'Write'] } }
              : undefined,
          canUseTool: async (toolName: string, input: Record<string, unknown>) => {
            if (readTools.includes(toolName)) {
              return { behavior: 'allow' as const, updatedInput: input }
            }
            if (request.access !== 'workspace-write' || !tools.includes(toolName)) {
              return {
                behavior: 'deny' as const,
                message: 'This local-agent request does not allow that tool'
              }
            }
            const decision = await this.approvals.request({
              callId,
              ownerId,
              provider: 'claude',
              toolName,
              operation: toolName === 'Bash' ? 'command' : 'write',
              summary: `${toolName} requested by Claude Code`,
              signal: context.signal,
              emit: (approval) => context.emit({ type: 'approval', callId, approval })
            })
            return decision === 'allow-once'
              ? { behavior: 'allow' as const, updatedInput: input }
              : { behavior: 'deny' as const, message: 'User denied this tool request' }
          }
        }
      })
      context.emit({ type: 'status', callId, status: 'running' })
      for await (const message of stream) {
        const decoded = decodeLocalAiCliEvent('claude', message)
        if (decoded.sessionId) {
          if (pointer && decoded.sessionId !== pointer.nativeSessionId) {
            await markLocalAiCliSessionState(pointer.id, 'missing')
            throw new Error('NATIVE_SESSION_MISSING')
          }
          if (!pointer) {
            const registered = await this.registerFreshNativeSession(
              execution,
              'claude',
              decoded.sessionId,
              request.prompt
            )
            pointer = registered.pointer
            releaseLease = registered.releaseLease
            this.taskProcesses.set(callId, {
              abortController,
              releaseLease,
              done: taskDone
            })
          }
          if (!sessionPublished) {
            sessionPublished = true
            context.emit({ type: 'session', callId, provider: 'claude', sessionRef: pointer.id })
          }
        }
        if (decoded.delta) {
          completeText += decoded.delta
          context.emit({ type: 'text-delta', callId, text: decoded.delta })
        }
        if (!completeText && decoded.completeText) completeText = decoded.completeText
        if (decoded.completed) completed = true
      }
      if (context.isCancelled() || abortController.signal.aborted) {
        context.emit({ type: 'cancelled', callId })
      } else if (completed && pointer && completeText.trim()) {
        await this.touchNativeSession(pointer)
        context.emit({ type: 'complete', callId, text: completeText.trim() })
      } else {
        context.emit({ type: 'failed', callId, code: 'PROTOCOL_INVALID', recoverable: true })
      }
    } catch (error) {
      if (context.isCancelled() || abortController.signal.aborted) {
        context.emit({ type: 'cancelled', callId })
      } else {
        let failure = error
        if (pointer && isNativeSessionMissingError(error)) {
          await markLocalAiCliSessionState(pointer.id, 'missing')
          failure = new Error('NATIVE_SESSION_MISSING')
        } else if (
          pointer &&
          error instanceof Error &&
          error.message === 'NATIVE_SESSION_CONFLICT'
        ) {
          await markLocalAiCliSessionState(pointer.id, 'conflict')
        }
        const code = taskFailureCode(failure)
        context.emit({
          type: 'failed',
          callId,
          code,
          recoverable: code !== 'NATIVE_SESSION_CONFLICT' && code !== 'NATIVE_SESSION_MISSING'
        })
      }
    } finally {
      this.approvals.cancelCall(callId)
      this.taskProcesses.delete(callId)
      releaseLease?.()
      context.end()
      settleTask()
    }
  }

  private async runTask(
    rawRequest: unknown,
    ownerId: number,
    context: StreamContext<LocalAiCliTaskChunk>
  ): Promise<void> {
    const request = normalizeLocalAiCliStartRequest(rawRequest)
    const status = await this.requireRunnableProvider(request.provider, request.access)
    const execution = await this.resolveLocalAiCliExecution(request)
    if (execution.pointer && !status.capabilities.taskResume) {
      throw new Error('PROVIDER_RESUME_UNSUPPORTED')
    }

    const callId = randomUUID()
    const prompt = buildPrompt(request.prompt, request.context)
    if (request.provider === 'claude') {
      await this.runClaudeSdkTask(
        callId,
        request,
        prompt,
        ownerId,
        status.executablePath!,
        execution,
        context
      )
      return
    }

    let releaseLease = execution.pointer ? this.acquirePointerLease(execution.pointer) : undefined
    const spec = createLocalAiCliTaskSpec(
      request.provider,
      prompt,
      request.access,
      execution.pointer?.nativeSessionId
    )
    let child: ChildProcess
    try {
      child = spawnSafe(status.executablePath!, spec.args, {
        cwd: execution.cwd,
        env: sanitizedChildEnv(),
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch {
      releaseLease?.()
      context.emit({ type: 'failed', callId, code: 'PROCESS_START_FAILED', recoverable: true })
      context.end()
      return
    }

    const taskRecord: TaskProcessSession = { process: child, releaseLease }
    this.taskProcesses.set(callId, taskRecord)
    context.emit({ type: 'status', callId, status: 'starting' })

    let pointer = execution.pointer
    let sessionPublished = false
    let stdoutBuffer = ''
    let completeText = ''
    let stderrText = ''
    let sawProtocolEvent = false
    let completionReady = false
    let protocolFailure: unknown = null
    let finalized = false
    let piState: { sessionId: string; sessionFile: string } | null = null
    let piRun: PiRunState | null = null
    let ompResumeAwaitingConfirmation = false
    let protocolChain = Promise.resolve()
    let settleTask!: () => void
    const taskDone = new Promise<void>((resolve) => {
      settleTask = resolve
    })
    taskRecord.done = taskDone

    const writeProtocol = (value: Record<string, unknown>): void => {
      if (!child.stdin?.writable) throw new Error('PROTOCOL_INVALID')
      child.stdin.write(`${JSON.stringify(value)}\n`)
    }

    const markMissingAndThrow = async (): Promise<never> => {
      if (pointer) await markLocalAiCliSessionState(pointer.id, 'missing')
      throw new Error('NATIVE_SESSION_MISSING')
    }

    const markConflictAndThrow = async (): Promise<never> => {
      if (pointer) await markLocalAiCliSessionState(pointer.id, 'conflict')
      throw new Error('NATIVE_SESSION_CONFLICT')
    }

    const publishNativeSession = async (
      nativeSessionId: string,
      expectedHeadId?: string | null
    ): Promise<StoredLocalAiCliSession> => {
      if (pointer) {
        if (pointer.nativeSessionId !== nativeSessionId) await markMissingAndThrow()
        await this.touchNativeSession(pointer, expectedHeadId ?? undefined)
      } else {
        const registered = await this.registerFreshNativeSession(
          execution,
          request.provider,
          nativeSessionId,
          request.prompt,
          expectedHeadId
        )
        pointer = registered.pointer
        releaseLease = registered.releaseLease
        taskRecord.releaseLease = releaseLease
      }
      if (!sessionPublished) {
        sessionPublished = true
        context.emit({
          type: 'session',
          callId,
          provider: request.provider,
          sessionRef: pointer.id
        })
      }
      return pointer
    }

    const requestProviderPrompt = (nativeSessionId: string): void => {
      if (!spec.prompt) throw new Error('PROTOCOL_INVALID')
      if (spec.protocol === 'codex-app-server') {
        writeProtocol({
          id: 3,
          method: 'turn/start',
          params: {
            threadId: nativeSessionId,
            input: [{ type: 'text', text: spec.prompt }],
            cwd: execution.cwd,
            approvalPolicy: request.access === 'workspace-write' ? 'untrusted' : 'never',
            sandboxPolicy:
              request.access === 'workspace-write'
                ? {
                    type: 'workspaceWrite',
                    writableRoots: [execution.cwd],
                    networkAccess: false
                  }
                : { type: 'readOnly' }
          }
        })
        return
      }
      writeProtocol({
        jsonrpc: '2.0',
        id: 3,
        method: 'session/prompt',
        params: {
          sessionId: nativeSessionId,
          prompt: [{ type: 'text', text: spec.prompt }]
        }
      })
    }

    const handleProtocolLine = async (line: string): Promise<void> => {
      if (!line.trim()) return
      let nativeEvent: Record<string, unknown>
      try {
        const parsed = JSON.parse(line)
        const record = asObject(parsed)
        if (!record) throw new Error('PROTOCOL_INVALID')
        nativeEvent = record
      } catch {
        throw new Error('PROTOCOL_INVALID')
      }
      sawProtocolEvent = true

      if (spec.protocol === 'pi-rpc') {
        const state = parsePiStateResponse(nativeEvent)
        if (state) {
          if (pointer && state.sessionId !== pointer.nativeSessionId) await markMissingAndThrow()
          piState = state
          writeProtocol({ id: 'tuff-before', type: 'get_entries' })
          return
        }
        if (nativeEvent.type === 'response' && nativeEvent.command === 'get_state') {
          await markMissingAndThrow()
        }
        const entries = parsePiEntriesResponse(nativeEvent)
        if (entries && !piRun) {
          if (!piState) throw new Error('PROTOCOL_INVALID')
          if (pointer && entries.leafId !== pointer.expectedHeadId) {
            await markConflictAndThrow()
          }
          const file = await capturePiSessionFile(
            piState.sessionFile,
            piState.sessionId,
            execution.cwd
          )
          await publishNativeSession(piState.sessionId, entries.leafId)
          piRun = {
            beforeEntries: entries,
            capturedHead: entries.leafId,
            file,
            verificationRequested: false
          }
          if (!spec.prompt) throw new Error('PROTOCOL_INVALID')
          writeProtocol({ type: 'prompt', message: spec.prompt })
          return
        }
        if (entries && piRun?.verificationRequested) {
          const finalHead = await verifyPiSessionAppend({
            capture: piRun.file,
            capturedHead: piRun.capturedHead,
            beforeEntryIds: new Set(piRun.beforeEntries.entries.map((entry) => entry.id)),
            post: entries
          })
          if (!pointer) throw new Error('PROTOCOL_INVALID')
          await this.touchNativeSession(pointer, finalHead)
          completionReady = true
          child.kill()
          return
        }
        if (nativeEvent.type === 'response' && nativeEvent.command === 'get_entries') {
          await markConflictAndThrow()
        }
      }

      if (spec.protocol === 'codex-app-server' && nativeEvent.id === 1) {
        if (!nativeEvent.result) throw new Error('PROTOCOL_INVALID')
        writeProtocol({
          id: 2,
          method: pointer ? 'thread/resume' : 'thread/start',
          params: pointer
            ? {
                threadId: pointer.nativeSessionId,
                cwd: execution.cwd,
                approvalPolicy: request.access === 'workspace-write' ? 'untrusted' : 'never',
                sandbox: request.access === 'workspace-write' ? 'workspace-write' : 'read-only',
                excludeTurns: true
              }
            : {
                cwd: execution.cwd,
                approvalPolicy: request.access === 'workspace-write' ? 'untrusted' : 'never',
                sandbox: request.access === 'workspace-write' ? 'workspace-write' : 'read-only',
                serviceName: 'talex-touch',
                sessionStartSource: 'startup'
              }
        })
        return
      }

      if (spec.protocol === 'codex-app-server' && nativeEvent.id === 2) {
        if (nativeEvent.error) {
          if (pointer) await markMissingAndThrow()
          throw new Error('PROTOCOL_INVALID')
        }
        const result = asObject(nativeEvent.result)
        const thread = asObject(result?.thread)
        const threadId = typeof thread?.id === 'string' ? thread.id : ''
        if (!threadId) throw new Error('PROTOCOL_INVALID')
        const returnedCwd =
          typeof thread?.cwd === 'string'
            ? thread.cwd
            : typeof result?.cwd === 'string'
              ? result.cwd
              : undefined
        if (returnedCwd) {
          const canonicalReturnedCwd = await realpath(returnedCwd).catch(() => '')
          if (canonicalReturnedCwd !== execution.cwd) await markConflictAndThrow()
        }
        await publishNativeSession(threadId)
        requestProviderPrompt(threadId)
        return
      }

      if (spec.protocol === 'omp-acp' && nativeEvent.id === 1) {
        if (!nativeEvent.result) throw new Error('PROTOCOL_INVALID')
        writeProtocol({
          jsonrpc: '2.0',
          id: 2,
          method: pointer ? 'session/resume' : 'session/new',
          params: pointer
            ? { sessionId: pointer.nativeSessionId, cwd: execution.cwd, mcpServers: [] }
            : { cwd: execution.cwd, mcpServers: [] }
        })
        return
      }

      if (spec.protocol === 'omp-acp' && nativeEvent.id === 2) {
        if (nativeEvent.error) {
          if (pointer) await markMissingAndThrow()
          throw new Error('PROTOCOL_INVALID')
        }
        if (pointer) {
          ompResumeAwaitingConfirmation = true
          return
        }
        const result = asObject(nativeEvent.result)
        const sessionId = typeof result?.sessionId === 'string' ? result.sessionId : ''
        if (!sessionId) throw new Error('PROTOCOL_INVALID')
        await publishNativeSession(sessionId)
        requestProviderPrompt(sessionId)
        return
      }

      const nativeMethod = typeof nativeEvent.method === 'string' ? nativeEvent.method : ''
      if (
        spec.protocol === 'omp-acp' &&
        ompResumeAwaitingConfirmation &&
        nativeMethod === 'session/update'
      ) {
        const params = asObject(nativeEvent.params)
        const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : ''
        if (!pointer || sessionId !== pointer.nativeSessionId) await markMissingAndThrow()
        ompResumeAwaitingConfirmation = false
        await publishNativeSession(sessionId)
        requestProviderPrompt(sessionId)
        return
      }
      if (
        spec.protocol === 'codex-app-server' &&
        nativeEvent.id !== undefined &&
        [
          'item/commandExecution/requestApproval',
          'item/fileChange/requestApproval',
          'item/permissions/requestApproval'
        ].includes(nativeMethod)
      ) {
        const params = asObject(nativeEvent.params)
        const reason = typeof params?.reason === 'string' ? params.reason : ''
        const isCommand = nativeMethod.includes('commandExecution')
        const isPermission = nativeMethod.includes('permissions')
        context.emit({ type: 'status', callId, status: 'waiting-approval' })
        void this.approvals
          .request({
            callId,
            ownerId,
            provider: 'codex',
            toolName: isCommand
              ? 'Codex command'
              : isPermission
                ? 'Codex permissions'
                : 'Codex file change',
            operation: isCommand ? 'command' : 'write',
            summary: reason || `${nativeMethod} in the selected workspace`,
            signal: context.signal,
            emit: (approval) => context.emit({ type: 'approval', callId, approval })
          })
          .then((decision) => {
            if (finalized || !child.stdin?.writable) return
            const result = isPermission
              ? decision === 'allow-once'
                ? { scope: 'turn', permissions: params?.permissions ?? {} }
                : { scope: 'turn', permissions: {} }
              : { decision: decision === 'allow-once' ? 'accept' : 'decline' }
            writeProtocol({ id: nativeEvent.id, result })
            context.emit({ type: 'status', callId, status: 'running' })
          })
          .catch(() => undefined)
        return
      }

      if (
        spec.protocol === 'omp-acp' &&
        nativeMethod === 'session/request_permission' &&
        nativeEvent.id !== undefined
      ) {
        const params = asObject(nativeEvent.params)
        const toolCall = asObject(params?.toolCall)
        const options = Array.isArray(params?.options)
          ? params.options
              .map(asObject)
              .filter((option): option is Record<string, unknown> => Boolean(option))
          : []
        context.emit({ type: 'status', callId, status: 'waiting-approval' })
        void this.approvals
          .request({
            callId,
            ownerId,
            provider: 'oh-my-pi',
            toolName: typeof toolCall?.title === 'string' ? toolCall.title : 'OMP tool',
            operation: 'write',
            summary: 'OMP requested permission for a tool in the selected workspace',
            signal: context.signal,
            emit: (approval) => context.emit({ type: 'approval', callId, approval })
          })
          .then((decision) => {
            if (finalized || !child.stdin?.writable) return
            const wantedKind = decision === 'allow-once' ? 'allow_once' : 'reject_once'
            const selected = options.find((option) => option.kind === wantedKind)
            const outcome =
              typeof selected?.optionId === 'string'
                ? { outcome: 'selected', optionId: selected.optionId }
                : { outcome: 'cancelled' }
            writeProtocol({
              jsonrpc: '2.0',
              id: nativeEvent.id,
              result: { outcome }
            })
            context.emit({ type: 'status', callId, status: 'running' })
          })
          .catch(() => undefined)
        return
      }

      const decoded = decodeLocalAiCliEvent(request.provider, nativeEvent)
      if (decoded.delta) {
        completeText += decoded.delta
        context.emit({ type: 'text-delta', callId, text: decoded.delta })
      }
      if (!completeText && decoded.completeText) completeText = decoded.completeText
      if (decoded.completed && spec.terminateOnComplete && completeText.trim()) {
        if (!pointer) throw new Error('PROTOCOL_INVALID')
        if (spec.protocol === 'pi-rpc') {
          if (!piRun || piRun.verificationRequested) throw new Error('PROTOCOL_INVALID')
          piRun.verificationRequested = true
          writeProtocol({
            id: 'tuff-after',
            type: 'get_entries',
            ...(piRun.capturedHead ? { since: piRun.capturedHead } : {})
          })
        } else {
          await this.touchNativeSession(pointer)
          completionReady = true
          child.kill()
        }
      }
    }

    const enqueueProtocolLine = (line: string): void => {
      protocolChain = protocolChain
        .then(async () => {
          if (protocolFailure) return
          await handleProtocolLine(line)
        })
        .catch(async (error) => {
          if (pointer && error instanceof Error && error.message === 'NATIVE_SESSION_CONFLICT') {
            try {
              await markLocalAiCliSessionState(pointer.id, 'conflict')
            } catch {
              // Preserve the authoritative protocol conflict if state persistence also fails.
            }
          }
          if (!protocolFailure) protocolFailure = error
          child.kill()
        })
    }

    const finalize = async (exitCode: number | null): Promise<void> => {
      if (finalized) return
      finalized = true
      if (stdoutBuffer.trim()) {
        enqueueProtocolLine(stdoutBuffer.replace(/\r$/, ''))
        stdoutBuffer = ''
      }
      await protocolChain
      if (
        !protocolFailure &&
        pointer &&
        !completionReady &&
        stderrText &&
        isNativeSessionMissingError(new Error(stderrText))
      ) {
        await markLocalAiCliSessionState(pointer.id, 'missing')
        protocolFailure = new Error('NATIVE_SESSION_MISSING')
      }
      this.approvals.cancelCall(callId)
      this.taskProcesses.delete(callId)
      try {
        if (context.isCancelled()) {
          context.emit({ type: 'cancelled', callId })
        } else if (protocolFailure) {
          const code = taskFailureCode(protocolFailure)
          context.emit({
            type: 'failed',
            callId,
            code,
            recoverable: code !== 'NATIVE_SESSION_CONFLICT' && code !== 'NATIVE_SESSION_MISSING'
          })
        } else if (completionReady && pointer && completeText.trim()) {
          context.emit({ type: 'complete', callId, text: completeText.trim() })
        } else {
          context.emit({
            type: 'failed',
            callId,
            code:
              exitCode === null && !sawProtocolEvent
                ? 'PROCESS_START_FAILED'
                : sawProtocolEvent
                  ? 'PROCESS_EXITED'
                  : 'PROTOCOL_INVALID',
            recoverable: true
          })
        }
      } finally {
        releaseLease?.()
        context.end()
        settleTask()
      }
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      while (stdoutBuffer.includes('\n')) {
        const newline = stdoutBuffer.indexOf('\n')
        const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '')
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        enqueueProtocolLine(line)
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      if (stderrText.length < 4_096) stderrText += chunk.slice(0, 4_096 - stderrText.length)
    })
    child.once('spawn', () => context.emit({ type: 'status', callId, status: 'running' }))
    child.once('error', () => {
      if (!protocolFailure) protocolFailure = new Error('PROCESS_START_FAILED')
      child.kill()
    })
    child.once('close', (code) => {
      void finalize(code)
    })
    context.signal.addEventListener('abort', () => child.kill(), { once: true })
    child.stdin?.write(spec.stdin)
    await taskDone
  }

  private async pasteBack(payload: LocalAiCliPasteBackRequest): Promise<LocalAiCliPasteBackResult> {
    if (!isLocalAiCliBetaAvailable() || !readSettings().localAiCli.enabled) {
      return { success: false, reason: 'target-unavailable' }
    }
    const text =
      typeof payload?.text === 'string'
        ? payload.text.trim().slice(0, LOCAL_AI_CLI_LIMITS.resultChars)
        : ''
    const appName = typeof payload?.appName === 'string' ? payload.appName.trim() : ''
    const windowTitle = typeof payload?.windowTitle === 'string' ? payload.windowTitle.trim() : ''
    const capturedAt = Number(payload?.capturedAt)
    if (!text || !appName) return { success: false, reason: 'target-unavailable' }
    if (
      !Number.isFinite(capturedAt) ||
      capturedAt > Date.now() + 30_000 ||
      Date.now() - capturedAt > 5 * 60_000
    ) {
      return { success: false, reason: 'capture-expired' }
    }

    omniPanelModule.hideForPasteBack()
    await new Promise((resolve) => setTimeout(resolve, 180))
    const active = await activeAppService.getActiveApp({
      includeIcon: false,
      forceRefresh: true
    })
    if (!active) return { success: false, reason: 'target-unavailable' }
    if (active.displayName?.trim() !== appName) {
      return { success: false, reason: 'target-drift' }
    }
    if (windowTitle && active.windowTitle?.trim() !== windowTitle) {
      return { success: false, reason: 'target-drift' }
    }

    const capability = await getAutoPasteCapabilityPatch()
    if (capability.supportLevel === 'unsupported') {
      return { success: false, reason: 'unsupported' }
    }
    clipboard.writeText(text)
    try {
      await sendPlatformShortcut('paste')
      return { success: true }
    } catch {
      return { success: false, reason: 'unsupported' }
    }
  }

  private async createTerminal(
    rawRequest: unknown,
    ownerId: number,
    sender: WebContents
  ): Promise<{ sessionId: string }> {
    const request = normalizeLocalAiCliTerminalCreateRequest(rawRequest)
    const provider = getLocalAiCliProviderDefinition(request.provider).id
    const status = await this.requireRunnableProvider(provider, request.access)
    const execution = await this.resolveLocalAiCliExecution(request)
    if (request.access === 'workspace-write' && !status.capabilities.terminalWriteApproval) {
      throw new Error('LOCAL_AI_CLI_WRITE_APPROVAL_UNAVAILABLE')
    }
    if (execution.pointer && !status.capabilities.terminalResume) {
      throw new Error('PROVIDER_RESUME_UNSUPPORTED')
    }
    const releaseLease = execution.pointer ? this.acquirePointerLease(execution.pointer) : undefined
    const pty = await import('node-pty')
    const sessionId = randomUUID()
    let process: IPty
    try {
      process = pty.spawn(
        status.executablePath!,
        terminalArgs(provider, request.access, execution.pointer?.nativeSessionId),
        {
          name: 'xterm-256color',
          cols: terminalSize(request.cols, DEFAULT_COLS, LOCAL_AI_CLI_LIMITS.terminalCols),
          rows: terminalSize(request.rows, DEFAULT_ROWS, LOCAL_AI_CLI_LIMITS.terminalRows),
          cwd: execution.cwd,
          env: sanitizedChildEnv()
        }
      )
    } catch (error) {
      releaseLease?.()
      throw error
    }

    const targetWindowId = BrowserWindow.fromWebContents(sender)?.id
    const dataSubscription = process.onData((data: string) => {
      if (sender.isDestroyed() || !this.transport || targetWindowId === undefined) return
      this.transport.broadcastToWindow(targetWindowId, LocalAiCliEvents.terminal.data, {
        sessionId,
        data: data.slice(0, LOCAL_AI_CLI_LIMITS.terminalChunkChars)
      })
    })
    const exitSubscription = process.onExit(
      ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        this.disposeTerminalSession(sessionId)
        if (sender.isDestroyed() || !this.transport || targetWindowId === undefined) return
        const payload: LocalAiCliTerminalExit = {
          sessionId,
          exitCode,
          ...(typeof signal === 'number' ? { signal } : {})
        }
        this.transport.broadcastToWindow(targetWindowId, LocalAiCliEvents.terminal.exit, payload)
      }
    )
    const senderDestroyed = (): void => {
      process.kill()
      this.disposeTerminalSession(sessionId)
    }
    sender.once('destroyed', senderDestroyed)
    this.terminalSessions.set(sessionId, {
      ownerId,
      process,
      dataSubscription,
      exitSubscription,
      sender,
      senderDestroyed,
      releaseLease
    })
    if (execution.pointer) {
      try {
        await this.touchNativeSession(execution.pointer)
      } catch (error) {
        process.kill()
        this.disposeTerminalSession(sessionId)
        throw error
      }
    }
    return { sessionId }
  }

  private requireTerminalSession(sessionId: unknown, ownerId: number): TerminalSession {
    if (typeof sessionId !== 'string') throw new Error('LOCAL_AI_CLI_TERMINAL_INVALID')
    const session = this.terminalSessions.get(sessionId)
    if (!session || session.ownerId !== ownerId) {
      throw new Error('LOCAL_AI_CLI_TERMINAL_NOT_FOUND')
    }
    return session
  }

  private writeTerminal(sessionId: unknown, data: unknown, ownerId: number): void {
    const session = this.requireTerminalSession(sessionId, ownerId)
    if (typeof data !== 'string' || data.length > LOCAL_AI_CLI_LIMITS.terminalInputChars) {
      throw new Error('LOCAL_AI_CLI_TERMINAL_INPUT_INVALID')
    }
    session.process.write(data)
  }

  private resizeTerminal(sessionId: unknown, cols: unknown, rows: unknown, ownerId: number): void {
    const session = this.requireTerminalSession(sessionId, ownerId)
    session.process.resize(
      terminalSize(cols, DEFAULT_COLS, LOCAL_AI_CLI_LIMITS.terminalCols),
      terminalSize(rows, DEFAULT_ROWS, LOCAL_AI_CLI_LIMITS.terminalRows)
    )
  }

  private killTerminal(sessionId: unknown, ownerId: number): void {
    const session = this.requireTerminalSession(sessionId, ownerId)
    session.process.kill()
    this.disposeTerminalSession(sessionId as string)
  }

  private disposeTerminalSession(sessionId: string): void {
    const session = this.terminalSessions.get(sessionId)
    if (!session) return
    session.dataSubscription.dispose()
    session.sender.removeListener('destroyed', session.senderDestroyed)
    session.releaseLease?.()
    this.terminalSessions.delete(sessionId)
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    shortcutModule.unregisterMainShortcut(LOCAL_AI_CLI_SHORTCUT_ID)
    this.approvals.destroy()
    for (const dispose of this.disposers.splice(0)) dispose()
    const taskCompletions: Promise<void>[] = []
    for (const session of this.taskProcesses.values()) {
      session.abortController?.abort()
      session.process?.kill()
      session.releaseLease?.()
      if (session.done) taskCompletions.push(session.done)
    }
    await Promise.allSettled(taskCompletions)
    this.taskProcesses.clear()
    for (const [sessionId, session] of this.terminalSessions) {
      session.process.kill()
      this.disposeTerminalSession(sessionId)
    }
    setLocalAiCliWorkspaceRoot(null)
    this.transport = null
    this.destinationRuntime = null
    localAiCliLog.info('Local AI CLI runtime destroyed')
  }
}

export const localAiCliModule = new LocalAiCliModule()

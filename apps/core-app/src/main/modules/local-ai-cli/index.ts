import type { ChildProcess } from 'node:child_process'
import type { IPty } from 'node-pty'
import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliPasteBackRequest,
  LocalAiCliPasteBackResult,
  LocalAiCliTaskChunk,
  LocalAiCliTerminalCreateRequest,
  LocalAiCliTerminalExit
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { HandlerContext, StreamContext } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import {
  LocalAiCliEvents,
  LOCAL_AI_CLI_LIMITS,
  normalizeLocalAiCliApprovalDecision,
  normalizeLocalAiCliStartRequest
} from '@talex-touch/utils/transport/events/local-ai-cli'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { clipboard, dialog, type BrowserWindow, type WebContents } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { omniPanelModule } from '../omni-panel'
import { getAutoPasteCapabilityPatch } from '../platform/capability-adapter'
import { activeAppService } from '../system/active-app'
import { sendPlatformShortcut } from '../system/desktop-shortcut'
import { getMainConfig, saveMainConfig } from '../storage'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import {
  resolveAllLocalAiCliProviderStatuses,
  resolveLocalAiCliProviderStatus
} from './executable-resolver'
import { LocalAiCliApprovalBroker } from './approval-broker'
import {
  createLocalAiCliResumeArgs,
  createLocalAiCliTaskSpec,
  decodeLocalAiCliEvent,
  getLocalAiCliProviderDefinition,
  LOCAL_AI_CLI_PROVIDERS
} from './provider-registry'

const localAiCliLog = createLogger('LocalAiCli')
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
const LOCAL_AI_CLI_SHORTCUT_ID = 'local-ai-cli.quick-open'
const LOCAL_AI_CLI_SHORTCUT_OWNER = 'core-app:local-ai-cli'

type MainTransport = ReturnType<typeof getTuffTransportMain>

type TerminalSession = {
  ownerId: number
  process: IPty
  dataSubscription: { dispose: () => void }
  exitSubscription: { dispose: () => void }
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

function buildPrompt(
  prompt: string,
  context: ReturnType<typeof normalizeLocalAiCliStartRequest>['context']
): string {
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
  if (nativeSessionId) return createLocalAiCliResumeArgs(provider, nativeSessionId)
  switch (provider) {
    case 'pi':
      return ['--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates']
    case 'oh-my-pi':
      return ['--no-tools', '--no-extensions', '--no-skills', '--no-rules']
    case 'codex':
      return ['--ask-for-approval', 'never', '--sandbox', 'read-only', '--no-alt-screen']
    case 'claude':
      return ['--tools', '', '--disable-slash-commands', '--permission-mode', 'plan', '--no-chrome']
  }
}

export class LocalAiCliModule extends BaseModule {
  static key = Symbol.for('local-ai-cli')
  name: ModuleKey = LocalAiCliModule.key

  private transport: MainTransport | null = null
  private mainWindow: BrowserWindow | null = null
  private readonly disposers: Array<() => void> = []
  private readonly approvals = new LocalAiCliApprovalBroker()
  private readonly taskProcesses = new Map<string, ChildProcess>()
  private readonly terminalSessions = new Map<string, TerminalSession>()
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
    this.mainWindow = runtime.app.window.window
    this.workspacePath = join(this.requireDirPath(ctx), 'workspace')
    await mkdir(this.workspacePath, { recursive: true })
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
    const window = this.mainWindow
    if (!window || window.isDestroyed() || !this.transport) return false
    if (window.isMinimized()) window.restore()
    this.pendingPanelReturnUntil = Date.now() + 5 * 60_000
    window.show()
    window.focus()
    await this.transport.sendTo(window.webContents, AppEvents.window.navigate, {
      path: '/setting?section=local-ai-cli'
    })
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
            resume: false
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

  private async runClaudeSdkTask(
    callId: string,
    prompt: string,
    access: LocalAiCliTerminalCreateRequest['access'],
    ownerId: number,
    executablePath: string,
    context: StreamContext<LocalAiCliTaskChunk>
  ): Promise<void> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const abortController = new AbortController()
    const readTools = access === 'answer-only' ? [] : ['Read', 'Glob', 'Grep']
    const tools = access === 'workspace-write' ? [...readTools, 'Edit', 'Write', 'Bash'] : readTools
    let completeText = ''
    let completed = false
    let nativeSessionId: string | undefined

    context.emit({ type: 'session', callId, provider: 'claude' })
    context.emit({ type: 'status', callId, status: 'starting' })
    context.signal.addEventListener('abort', () => abortController.abort(), { once: true })

    try {
      const stream = query({
        prompt,
        options: {
          abortController,
          cwd: this.workspacePath,
          pathToClaudeCodeExecutable: executablePath,
          includePartialMessages: true,
          maxTurns: 1,
          tools,
          allowedTools: readTools,
          permissionMode: 'default',
          settings:
            access === 'workspace-write'
              ? { permissions: { allow: readTools, ask: ['Bash', 'Edit', 'Write'] } }
              : undefined,
          canUseTool: async (toolName, input) => {
            if (readTools.includes(toolName)) {
              return { behavior: 'allow' as const, updatedInput: input }
            }
            if (access !== 'workspace-write' || !tools.includes(toolName)) {
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
        if (decoded.sessionId && decoded.sessionId !== nativeSessionId) {
          nativeSessionId = decoded.sessionId
          context.emit({
            type: 'session',
            callId,
            provider: 'claude',
            nativeSessionId
          })
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
      } else if (completed && completeText.trim()) {
        context.emit({ type: 'complete', callId, text: completeText.trim() })
      } else {
        context.emit({ type: 'failed', callId, code: 'PROTOCOL_INVALID', recoverable: true })
      }
      context.end()
    } catch {
      if (context.isCancelled() || abortController.signal.aborted) {
        context.emit({ type: 'cancelled', callId })
      } else {
        context.emit({ type: 'failed', callId, code: 'PROCESS_EXITED', recoverable: true })
      }
      context.end()
    }
  }

  private async runTask(
    rawRequest: unknown,
    ownerId: number,
    context: StreamContext<LocalAiCliTaskChunk>
  ): Promise<void> {
    const request = normalizeLocalAiCliStartRequest(rawRequest)
    const status = await this.requireRunnableProvider(request.provider, request.access)
    const callId = randomUUID()
    const prompt = buildPrompt(request.prompt, request.context)
    if (request.provider === 'claude') {
      await this.runClaudeSdkTask(
        callId,
        prompt,
        request.access,
        ownerId,
        status.executablePath!,
        context
      )
      return
    }
    const spec = createLocalAiCliTaskSpec(request.provider, prompt, request.access)
    const process = spawnSafe(status.executablePath!, spec.args, {
      cwd: this.workspacePath,
      env: sanitizedChildEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.taskProcesses.set(callId, process)
    context.emit({ type: 'session', callId, provider: request.provider })
    context.emit({ type: 'status', callId, status: 'starting' })

    let stdoutBuffer = ''
    let completeText = ''
    let nativeSessionId: string | undefined
    let sawProtocolEvent = false
    let settled = false

    const finish = (chunk: LocalAiCliTaskChunk) => {
      if (settled) return
      settled = true
      this.approvals.cancelCall(callId)
      this.taskProcesses.delete(callId)
      context.emit(chunk)
      context.end()
    }

    const handleLine = (line: string) => {
      if (!line.trim()) return
      let decoded: ReturnType<typeof decodeLocalAiCliEvent>
      try {
        const nativeEvent = JSON.parse(line) as Record<string, unknown>
        if (spec.protocol === 'codex-app-server' && nativeEvent.id === 1 && nativeEvent.result) {
          process.stdin?.write(
            `${JSON.stringify({
              id: 2,
              method: 'thread/start',
              params: {
                cwd: this.workspacePath,
                approvalPolicy: request.access === 'workspace-write' ? 'untrusted' : 'never',
                sandbox: request.access === 'workspace-write' ? 'workspace-write' : 'read-only',
                serviceName: 'talex-touch',
                sessionStartSource: 'startup'
              }
            })}\n`
          )
        } else if (spec.protocol === 'codex-app-server' && nativeEvent.id === 2) {
          const result = nativeEvent.result as { thread?: { id?: unknown } } | undefined
          const threadId = typeof result?.thread?.id === 'string' ? result.thread.id : ''
          if (!threadId || !spec.prompt) throw new Error('codex-thread-start-invalid')
          nativeSessionId = threadId
          context.emit({
            type: 'session',
            callId,
            provider: request.provider,
            nativeSessionId: threadId
          })
          process.stdin?.write(
            `${JSON.stringify({
              id: 3,
              method: 'turn/start',
              params: {
                threadId,
                input: [{ type: 'text', text: spec.prompt }],
                cwd: this.workspacePath,
                approvalPolicy: request.access === 'workspace-write' ? 'untrusted' : 'never',
                sandboxPolicy:
                  request.access === 'workspace-write'
                    ? {
                        type: 'workspaceWrite',
                        writableRoots: [this.workspacePath],
                        networkAccess: false
                      }
                    : { type: 'readOnly' }
              }
            })}\n`
          )
        } else if (spec.protocol === 'omp-acp' && nativeEvent.id === 1 && nativeEvent.result) {
          process.stdin?.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'session/new',
              params: { cwd: this.workspacePath, mcpServers: [] }
            })}\n`
          )
        } else if (spec.protocol === 'omp-acp' && nativeEvent.id === 2) {
          const result = nativeEvent.result as { sessionId?: unknown } | undefined
          const sessionId = typeof result?.sessionId === 'string' ? result.sessionId : ''
          if (!sessionId || !spec.prompt) throw new Error('omp-session-start-invalid')
          nativeSessionId = sessionId
          context.emit({
            type: 'session',
            callId,
            provider: request.provider,
            nativeSessionId: sessionId
          })
          process.stdin?.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              method: 'session/prompt',
              params: {
                sessionId,
                prompt: [{ type: 'text', text: spec.prompt }]
              }
            })}\n`
          )
        }
        const nativeMethod = typeof nativeEvent.method === 'string' ? nativeEvent.method : ''
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
              summary: reason || `${nativeMethod} in the isolated workspace`,
              signal: context.signal,
              emit: (approval) => context.emit({ type: 'approval', callId, approval })
            })
            .then((decision) => {
              if (settled || !process.stdin?.writable) return
              const result = isPermission
                ? decision === 'allow-once'
                  ? { scope: 'turn', permissions: params?.permissions ?? {} }
                  : { scope: 'turn', permissions: {} }
                : { decision: decision === 'allow-once' ? 'accept' : 'decline' }
              process.stdin.write(`${JSON.stringify({ id: nativeEvent.id, result })}\n`)
              context.emit({ type: 'status', callId, status: 'running' })
            })
        } else if (
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
              summary: 'OMP requested permission for a tool in the isolated workspace',
              signal: context.signal,
              emit: (approval) => context.emit({ type: 'approval', callId, approval })
            })
            .then((decision) => {
              if (settled || !process.stdin?.writable) return
              const wantedKind = decision === 'allow-once' ? 'allow_once' : 'reject_once'
              const selected = options.find((option) => option.kind === wantedKind)
              const outcome =
                typeof selected?.optionId === 'string'
                  ? { outcome: 'selected', optionId: selected.optionId }
                  : { outcome: 'cancelled' }
              process.stdin.write(
                `${JSON.stringify({
                  jsonrpc: '2.0',
                  id: nativeEvent.id,
                  result: { outcome }
                })}\n`
              )
              context.emit({ type: 'status', callId, status: 'running' })
            })
        }
        decoded = decodeLocalAiCliEvent(request.provider, nativeEvent)
      } catch {
        finish({ type: 'failed', callId, code: 'PROTOCOL_INVALID', recoverable: true })
        process.kill()
        return
      }
      sawProtocolEvent = true
      if (decoded.sessionId && decoded.sessionId !== nativeSessionId) {
        nativeSessionId = decoded.sessionId
        context.emit({
          type: 'session',
          callId,
          provider: request.provider,
          nativeSessionId
        })
      }
      if (decoded.delta) {
        completeText += decoded.delta
        context.emit({ type: 'text-delta', callId, text: decoded.delta })
      }
      if (!completeText && decoded.completeText) completeText = decoded.completeText
      if (decoded.completed && spec.terminateOnComplete && completeText.trim()) {
        finish({ type: 'complete', callId, text: completeText.trim() })
        process.kill()
      }
    }

    process.stdout?.setEncoding('utf8')
    process.stdout?.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      while (stdoutBuffer.includes('\n')) {
        const newline = stdoutBuffer.indexOf('\n')
        const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '')
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        handleLine(line)
      }
    })
    process.stderr?.resume()
    process.once('spawn', () => context.emit({ type: 'status', callId, status: 'running' }))
    process.once('error', () =>
      finish({ type: 'failed', callId, code: 'PROCESS_START_FAILED', recoverable: true })
    )
    process.once('close', (code) => {
      if (stdoutBuffer.trim()) handleLine(stdoutBuffer)
      if (settled) return
      if (context.isCancelled()) {
        finish({ type: 'cancelled', callId })
      } else if (code === 0 && sawProtocolEvent && completeText.trim()) {
        finish({ type: 'complete', callId, text: completeText.trim() })
      } else {
        finish({
          type: 'failed',
          callId,
          code: sawProtocolEvent ? 'PROCESS_EXITED' : 'PROTOCOL_INVALID',
          recoverable: true
        })
      }
    })
    context.signal.addEventListener(
      'abort',
      () => {
        process.kill()
      },
      { once: true }
    )
    if (spec.protocol) {
      process.stdin?.write(spec.stdin)
    } else {
      process.stdin?.end(spec.stdin)
    }
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
    request: LocalAiCliTerminalCreateRequest,
    ownerId: number,
    sender: WebContents
  ): Promise<{ sessionId: string }> {
    const provider = getLocalAiCliProviderDefinition(request.provider).id
    const status = await this.requireRunnableProvider(provider, request.access)
    if (request.access === 'workspace-write' && !status.capabilities.terminalWriteApproval) {
      throw new Error('LOCAL_AI_CLI_WRITE_APPROVAL_UNAVAILABLE')
    }
    const pty = await import('node-pty')
    const sessionId = randomUUID()
    const process = pty.spawn(
      status.executablePath!,
      terminalArgs(provider, request.access, request.nativeSessionId),
      {
        name: 'xterm-256color',
        cols: terminalSize(request.cols, DEFAULT_COLS, LOCAL_AI_CLI_LIMITS.terminalCols),
        rows: terminalSize(request.rows, DEFAULT_ROWS, LOCAL_AI_CLI_LIMITS.terminalRows),
        cwd: this.workspacePath,
        env: sanitizedChildEnv()
      }
    )
    const dataSubscription = process.onData((data) => {
      if (sender.isDestroyed() || !this.transport) return
      void this.transport.sendTo(sender, LocalAiCliEvents.terminal.data, {
        sessionId,
        data: data.slice(0, LOCAL_AI_CLI_LIMITS.terminalChunkChars)
      })
    })
    const exitSubscription = process.onExit(({ exitCode, signal }) => {
      this.disposeTerminalSession(sessionId)
      if (sender.isDestroyed() || !this.transport) return
      const payload: LocalAiCliTerminalExit = {
        sessionId,
        exitCode,
        ...(typeof signal === 'number' ? { signal } : {})
      }
      void this.transport.sendTo(sender, LocalAiCliEvents.terminal.exit, payload)
    })
    this.terminalSessions.set(sessionId, {
      ownerId,
      process,
      dataSubscription,
      exitSubscription
    })
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
    session.exitSubscription.dispose()
    this.terminalSessions.delete(sessionId)
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    shortcutModule.unregisterMainShortcut(LOCAL_AI_CLI_SHORTCUT_ID)
    this.approvals.destroy()
    for (const dispose of this.disposers.splice(0)) dispose()
    for (const process of this.taskProcesses.values()) process.kill()
    this.taskProcesses.clear()
    for (const [sessionId, session] of this.terminalSessions) {
      session.process.kill()
      this.disposeTerminalSession(sessionId)
    }
    this.transport = null
    this.mainWindow = null
    localAiCliLog.info('Local AI CLI runtime destroyed')
  }
}

export const localAiCliModule = new LocalAiCliModule()

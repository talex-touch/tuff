import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { TuffEvent } from '@talex-touch/utils/transport'
import type {
  LocalAiCliApprovalRequest,
  LocalAiCliErrorCode,
  LocalAiCliPasteBackRequest,
  LocalAiCliPasteBackResult,
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliSessionSummary,
  LocalAiCliStartRequest,
  LocalAiCliStatus,
  LocalAiCliStatusRequest,
  LocalAiCliTaskChunk,
  LocalAiCliTerminalCreateRequest,
  LocalAiCliTerminalCreateResult
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type {
  HandlerContext,
  ITuffTransportMain,
  StreamContext
} from '@talex-touch/utils/transport/main'
import type { WebContents } from 'electron'
import type { ChildProcess } from 'node:child_process'
import type { PiEntriesSnapshot, PiSessionFileCapture } from './pi-native-session'
import type { LocalAiCliTaskSpec } from './provider-registry'
import type { StoredLocalAiCliSession } from './session-store'
import type { PtySessionOwner } from '../terminal/pty-session-core'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AcpClient,
  AcpSession,
  type AcpConfigOption,
  type AcpSessionModeState
} from '@talex-touch/tuff-intelligence'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { normalizeLocalAiCliSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
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
import { clipboard, dialog, shell } from 'electron'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { t } from '../../utils/i18n-helper'
import { createLogger } from '../../utils/logger'
import {
  getAppDestinationNavigationService,
  type AppDestinationRuntime
} from '../app-destination/app-destination-navigation'
import { BaseModule } from '../abstract-base-module'
import { withExecutableDirOnPath } from '../ai/providers/cli/cli-executable'
import { shortcutModule } from '../global-shortcon'
import { omniPanelModule } from '../omni-panel'
import { getAutoPasteCapabilityPatch } from '../platform/capability-adapter'
import { getProject, touchProject } from '../project/project-store'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'
import { activeAppService } from '../system/active-app'
import { sendPlatformShortcut } from '../system/desktop-shortcut'
import { ptySessionCore, watchPtyOwner } from '../terminal/pty-session-core'
import { LocalAiCliApprovalBroker } from './approval-broker'
import {
  refreshLocalAiCliExecutables,
  resolveAllLocalAiCliProviderStatuses,
  resolveLocalAiCliProviderStatus,
  stopLocalAiCliVersionProbes
} from './executable-resolver'
import { nativeSessionLeaseRegistry } from './native-session-lease'
import { isNativeSessionMissingError, isPiSessionNotFoundError } from './native-session-errors'
import {
  findNativeSessionFile,
  hasPiSessionFileNamedFor,
  scanNativeSessionsForProject
} from './native-session-discovery'
import {
  capturePiSessionFile,
  isPiSessionFileUnwritten,
  parsePiEntriesResponse,
  parsePiStateResponse,
  verifyPiSessionAppend,
  verifyPiSessionFirstWrite
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
  getLocalAiCliSessionForConversation,
  listLocalAiCliSessions,
  markLocalAiCliSessionState,
  subscribeLocalAiCliSessionMutations,
  touchLocalAiCliSession,
  upsertDiscoveredLocalAiCliSessions,
  upsertLocalAiCliSession
} from './session-store'
import { PersistentPiRpcSession } from './pi-rpc-session'
import { setLocalAiCliWorkspaceRoot } from './workspace-root'

const localAiCliLog = createLogger('LocalAiCli')
const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30
/** Idle time after which a persistent pi child is closed; the next turn starts it again. */
const PERSISTENT_PI_IDLE_MS = 10 * 60 * 1000
/** Bounded wait for legacy OMP versions whose `session/resume` confirms the ID via `session/update`. */
const OMP_RESUME_CONFIRM_TIMEOUT_MS = 10_000
const LOCAL_AI_CLI_SHORTCUT_ID = 'local-ai-cli.quick-open'
const LOCAL_AI_CLI_SHORTCUT_OWNER = 'core-app:local-ai-cli'

type MainTransport = ITuffTransportMain

interface TaskProcessSession {
  process?: ChildProcess
  abortController?: AbortController
  releaseLease?: () => void
  done?: Promise<void>
}

interface PersistentPiHandle {
  session: PersistentPiRpcSession
  pointer: StoredLocalAiCliSession
  releaseLease: () => void
  /** Closes the child after an idle period; cleared while a turn holds it. */
  idleTimer?: ReturnType<typeof setTimeout>
}

interface LocalAiCliExecution {
  cwd: string
  projectId: string | null
  pointer: StoredLocalAiCliSession | null
}

interface PiRunState {
  beforeEntries: PiEntriesSnapshot
  capturedHead: string | null
  /**
   * The session file as it stood before the prompt, or `null` for a new session pi has not written
   * yet: pi writes that file whole with its first reply, so it is checked from its header once the
   * run is over ({@link verifyPiSessionFirstWrite}).
   */
  file: PiSessionFileCapture | null
  verificationRequested: boolean
}

/**
 * Local agents are a macOS Beta: Windows and Linux show no entry until discovery, PTY, process-tree
 * cleanup and a real-machine acceptance exist there (08-04 R23). On macOS the Settings section is
 * always there; every other entry — ⌘⇧L, the CoreBox button, the omni-panel action, the project
 * menu group, the execution handlers — also waits for the user's master switch,
 * `localAiCli.enabled` (08-04 R15: consent is a setting, never an environment variable).
 */
function isLocalAiCliPlatformSupported(): boolean {
  return process.platform === 'darwin'
}

function readSettings(): AppSetting {
  return getMainConfig(StorageList.APP_SETTING) as AppSetting
}

function readLocalAiCliSettings(): AppSetting['localAiCli'] {
  return normalizeLocalAiCliSetting(readSettings()?.localAiCli)
}

/** The 「选择程序」 picks, one per CLI, in a form two snapshots can be compared by. */
function executableOverrides(
  settings: AppSetting['localAiCli']
): Record<LocalAiCliProviderId, string> {
  return Object.fromEntries(
    LOCAL_AI_CLI_PROVIDERS.map((provider) => [
      provider.id,
      settings.providers?.[provider.id]?.executableOverride?.trim() ?? ''
    ])
  ) as Record<LocalAiCliProviderId, string>
}

/**
 * A provider as reported while the master switch is off to a caller that did not ask for detail:
 * nothing was looked for or run, so `installed: false` here says nothing about the machine, and
 * the issue says so instead of claiming the CLI is unavailable.
 */
function unprobedProviderStatus(
  providerId: LocalAiCliProviderId,
  settings: AppSetting['localAiCli']
): LocalAiCliProviderStatus {
  return {
    id: providerId,
    label: getLocalAiCliProviderDefinition(providerId).label,
    enabled: settings.providers?.[providerId]?.enabled === true,
    installed: false,
    issueCode: 'NOT_PROBED',
    capabilities: {
      taskRead: false,
      taskWriteApproval: false,
      terminalRead: false,
      terminalWriteApproval: false,
      taskResume: false,
      terminalResume: false
    }
  }
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
    case 'antigravity':
      return ['--mode', 'plan', '--sandbox', ...resumeArgs]
    case 'cursor':
      return ['--mode', 'plan', ...resumeArgs]
    case 'opencode':
    case 'gemini':
    case 'kiro':
      throw new Error('LOCAL_AI_CLI_TERMINAL_UNAVAILABLE')
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

function isProtocolInvalidError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'PROTOCOL_INVALID'
  )
}

function isJsonRpcMethodNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === -32601
  )
}

/**
 * Only an explicit JSON-RPC error reporting that the session does not exist should mark a saved
 * session pointer `missing`. Process exits, stdout EOF, and transient internal errors have no
 * session-missing error semantics and must leave the pointer retryable.
 */
function isAcpResumeSessionMissingError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  if (typeof code !== 'number') return false
  if (code === -32601) return false
  if (code === -32002) return true
  if (isNativeSessionMissingError(error)) return true
  const message = error instanceof Error ? error.message : String(error)
  return /\bno such session\b|\bsession\b.*\bmissing\b/i.test(message)
}

async function applyPreferredAcpReadOnlyMode(
  session: AcpSession,
  preferredModes: readonly string[] | undefined
): Promise<void> {
  if (!preferredModes || preferredModes.length === 0) return
  if (session.modes && Array.isArray(session.modes.availableModes)) {
    for (const target of preferredModes) {
      const matched = session.modes.availableModes.find(
        (mode) => mode.id.toLowerCase() === target.toLowerCase()
      )
      if (!matched) continue
      if (session.modes.currentModeId?.toLowerCase() !== matched.id.toLowerCase()) {
        await session.setMode(matched.id)
      }
      return
    }
  }
  const modeConfig = session.configOptions.find(
    (opt) => opt.category === 'mode' || opt.id === 'mode'
  )
  if (modeConfig && Array.isArray(modeConfig.options)) {
    for (const target of preferredModes) {
      const matched = modeConfig.options.find(
        (opt) => opt.value.toLowerCase() === target.toLowerCase()
      )
      if (!matched) continue
      if (String(modeConfig.currentValue).toLowerCase() !== matched.value.toLowerCase()) {
        await session.setConfig(modeConfig.id, matched.value)
      }
      return
    }
  }
}

function taskFailureCode(error: unknown): LocalAiCliErrorCode {
  if (isProtocolInvalidError(error)) return 'PROTOCOL_INVALID'
  const message = error instanceof Error ? error.message : ''
  if (
    message === 'PROVIDER_RESUME_UNSUPPORTED' ||
    message === 'NATIVE_SESSION_BUSY' ||
    message === 'NATIVE_SESSION_MISSING' ||
    message === 'NATIVE_SESSION_CONFLICT' ||
    message === 'WORKSPACE_INVALID' ||
    message === 'TOKEN_LIMIT_REACHED'
  ) {
    return message
  }
  return message === 'PROCESS_START_FAILED' || message === 'PROCESS_EXITED'
    ? message
    : 'PROTOCOL_INVALID'
}

export class LocalAiCliModule extends BaseModule {
  static key = Symbol.for('local-ai-cli')
  name: ModuleKey = LocalAiCliModule.key

  private transport: MainTransport | null = null
  private destinationRuntime: AppDestinationRuntime | null = null
  private readonly disposers: Array<() => void> = []
  private readonly approvals = new LocalAiCliApprovalBroker()
  private readonly taskProcesses = new Map<string, TaskProcessSession>()
  private readonly persistentPiSessions = new Map<string, PersistentPiHandle>()
  private readonly persistentPiStarts = new Set<string>()
  private terminalLifecycle = new AbortController()
  private readonly nativeSessionLeases = nativeSessionLeaseRegistry
  private workspacePath = ''
  private pendingPanelReturnUntil = 0
  /** Whether ⌘⇧L is registered: it follows the master switch, not just the platform. */
  private quickOpenShortcutRegistered = false
  /** The master switch last seen, to tell an open OmniPanel it flipped; `null` before the first read. */
  private lastMasterSwitch: boolean | null = null
  /** The picks last seen, to notice one being cleared; `null` until the first settings read. */
  private lastExecutableOverrides: Record<LocalAiCliProviderId, string> | null = null
  /** Its own function per module, as the event bus refuses one handler registered twice. */
  private readonly stopProbesOnQuit = (): void => stopLocalAiCliVersionProbes({ quitting: true })

  constructor() {
    super(LocalAiCliModule.key, { create: true })
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'LocalAiCliModule.onInit')
    const channel = runtime.app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)
    this.terminalLifecycle = new AbortController()
    this.destinationRuntime = runtime.app
    this.workspacePath = join(this.requireDirPath(ctx), 'workspace')
    await mkdir(this.workspacePath, { recursive: true })
    setLocalAiCliWorkspaceRoot(this.workspacePath)
    this.registerHandlers()
    // The quit flow's first step: module unload is what its budget and the dev force-exit cut
    // off, and a `--version` probe the app leaves behind is never reaped.
    touchEventBus.on(TalexEvents.BEFORE_QUIT_STOP_WATCHERS, this.stopProbesOnQuit)
    this.disposers.push(() =>
      touchEventBus.off(TalexEvents.BEFORE_QUIT_STOP_WATCHERS, this.stopProbesOnQuit)
    )
    if (isLocalAiCliPlatformSupported()) {
      // Read once here as well as through the subscription: the subscription only replays a
      // value the store has already loaded.
      this.applySettings(readSettings().localAiCli)
      this.disposers.push(
        subscribeMainConfig(StorageList.APP_SETTING, (settings) => {
          this.applySettings(settings.localAiCli)
        })
      )
    }
  }

  /**
   * Follows the settings: ⌘⇧L exists only while the master switch is on (registered when it turns
   * on, unregistered when it turns off), and a 「选择程序」 pick that is cleared sends the lookups
   * back to the search, which may have changed since they were memoised. A new pick needs no
   * refresh here: it is its own memo key, and `locate` refreshes after writing it.
   */
  private applySettings(settings: AppSetting['localAiCli'] | undefined): void {
    if (!settings) return
    const normalized = normalizeLocalAiCliSetting(settings)
    const enabled = normalized.enabled === true
    this.syncQuickOpenShortcut(enabled)
    // The panel's 「交给本机代理」 follows the switch too; an open panel reads its actions again.
    if (this.lastMasterSwitch !== null && this.lastMasterSwitch !== enabled) {
      omniPanelModule.requestFeatureRefresh('local-ai-cli')
    }
    this.lastMasterSwitch = enabled

    const overrides = executableOverrides(normalized)
    const previous = this.lastExecutableOverrides
    this.lastExecutableOverrides = overrides
    const cleared =
      previous !== null &&
      LOCAL_AI_CLI_PROVIDERS.some((provider) => previous[provider.id] && !overrides[provider.id])
    if (cleared) {
      void refreshLocalAiCliExecutables(normalized).catch((error) => {
        localAiCliLog.warn('Local AI CLI re-probe after a cleared executable pick failed', {
          error
        })
      })
    }
  }

  private syncQuickOpenShortcut(enabled: boolean): void {
    if (enabled === this.quickOpenShortcutRegistered) return
    this.quickOpenShortcutRegistered = enabled
    if (!enabled) {
      shortcutModule.unregisterMainShortcut(LOCAL_AI_CLI_SHORTCUT_ID)
      return
    }
    shortcutModule.registerMainShortcut(
      LOCAL_AI_CLI_SHORTCUT_ID,
      'CommandOrControl+Shift+L',
      () => {
        void omniPanelModule.showLocalAi()
      },
      { owner: LOCAL_AI_CLI_SHORTCUT_OWNER, enabled: true }
    )
  }

  private registerHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.disposers.push(
      subscribeLocalAiCliSessionMutations((mutation) => {
        transport.broadcast(LocalAiCliEvents.session.changed, mutation)
      }),
      transport.on(LocalAiCliEvents.status.get, async (payload, context) => {
        assertHostContext(context)
        return await this.getStatus({
          detail: payload?.detail === true,
          refresh: payload?.refresh === true
        })
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
      transport.on(LocalAiCliEvents.session.revealFile, async (payload, context) => {
        assertHostContext(context)
        const conversationId =
          typeof payload?.conversationId === 'string' ? payload.conversationId.trim() : ''
        if (!conversationId || conversationId.length > 128 || conversationId.includes('\0'))
          throw new Error('LOCAL_AI_CLI_SESSION_INVALID')
        const pointer = await getLocalAiCliSessionForConversation(conversationId)
        if (!pointer) return { revealed: false }
        const filePath = await findNativeSessionFile(
          pointer.provider,
          pointer.nativeSessionId,
          pointer.projectRoot
        )
        if (!filePath) return { revealed: false }
        shell.showItemInFolder(filePath)
        return { revealed: true }
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
        this.writeTerminal(
          payload?.sessionId,
          payload?.data,
          assertHostContext(context),
          context.sender as WebContents
        )
      }),
      transport.on(LocalAiCliEvents.terminal.resize, (payload, context) => {
        this.resizeTerminal(
          payload?.sessionId,
          payload?.cols,
          payload?.rows,
          assertHostContext(context),
          context.sender as WebContents
        )
      }),
      transport.on(LocalAiCliEvents.terminal.kill, (payload, context) => {
        const ownerId = assertHostContext(context)
        const sender = context.sender as WebContents
        return payload?.sessionId !== undefined
          ? this.killTerminal(payload.sessionId, ownerId, sender)
          : this.cancelTerminalCreation(payload?.creationToken, ownerId, sender)
      }),
      transport.on(LocalAiCliEvents.terminal.ack, (payload, context) => {
        this.acknowledgeTerminal(
          payload?.sessionId,
          payload?.chars,
          assertHostContext(context),
          context.sender as WebContents
        )
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
    if (!isLocalAiCliPlatformSupported() || Date.now() > this.pendingPanelReturnUntil) {
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

  /**
   * Answered from the memoised lookups unless `refresh` asks to probe again (「重新探测」): CoreBox,
   * the omni panel and every project menu read this, and none of them should start four CLI
   * processes to do it. Off macOS nothing is probed at all. With the master switch off those
   * readers need only `enabled`, and a CLI's `--version` is still a third-party program run before
   * the user agreed to any: then only `detail` probes, which Settings asks for, as the place where
   * the user decides.
   */
  private async getStatus(request: LocalAiCliStatusRequest = {}): Promise<LocalAiCliStatus> {
    const settings = readLocalAiCliSettings()
    if (!isLocalAiCliPlatformSupported()) {
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
    if (!settings.enabled && request.detail !== true && request.refresh !== true) {
      return {
        betaAvailable: true,
        enabled: false,
        defaultProvider: settings.defaultProvider,
        providers: LOCAL_AI_CLI_PROVIDERS.map((provider) =>
          unprobedProviderStatus(provider.id, settings)
        )
      }
    }
    if (request.refresh === true) await refreshLocalAiCliExecutables(settings)
    return {
      betaAvailable: true,
      enabled: settings.enabled,
      defaultProvider: settings.defaultProvider,
      providers: await resolveAllLocalAiCliProviderStatuses(settings)
    }
  }

  private async locateProvider(provider: unknown): Promise<LocalAiCliProviderStatus> {
    if (!isLocalAiCliPlatformSupported()) throw new Error('LOCAL_AI_CLI_BETA_UNAVAILABLE')
    const definition = LOCAL_AI_CLI_PROVIDERS.find((candidate) => candidate.id === provider)
    if (!definition) throw new Error('LOCAL_AI_CLI_PROVIDER_INVALID')
    const result = await dialog.showOpenDialog({
      title: t('nativeDialogs.files.locateCli', { name: definition.label }),
      // An app bundle is a directory, never the CLI: open it like a folder rather than return it.
      // The pick is used as found, so a symlink must stay one: a mise shim resolved to its
      // target is mise itself, which no CLI's version check accepts.
      properties: ['openFile', 'treatPackageAsDirectory', 'noResolveAliases']
    })
    if (result.canceled || result.filePaths.length !== 1) {
      throw new Error('LOCAL_AI_CLI_LOCATE_CANCELLED')
    }
    const appSettings = readSettings()
    const nextSettings = structuredClone(appSettings)
    nextSettings.localAiCli = normalizeLocalAiCliSetting(nextSettings.localAiCli)
    nextSettings.localAiCli.providers[definition.id].executableOverride = result.filePaths[0]!
    await saveMainConfig(StorageList.APP_SETTING, nextSettings)
    // The pick is used as chosen, never resolved through its links (a shim dispatches on the name
    // it was run by). Probing again also hands the chat providers the same pick.
    await refreshLocalAiCliExecutables(nextSettings.localAiCli)
    return await resolveLocalAiCliProviderStatus(definition.id, nextSettings.localAiCli)
  }

  private async requireRunnableProvider(
    providerId: LocalAiCliProviderId,
    access: LocalAiCliTerminalCreateRequest['access']
  ): Promise<LocalAiCliProviderStatus> {
    if (!isLocalAiCliPlatformSupported()) throw new Error('LOCAL_AI_CLI_BETA_UNAVAILABLE')
    const settings = readLocalAiCliSettings()
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
          // Replaces the SDK's default `{ ...process.env }`: an npm-installed claude is a node
          // script, and the SDK resolves its interpreter from this PATH.
          env: withExecutableDirOnPath(sanitizedChildEnv(), executablePath),
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

  private async getOrCreatePersistentPi(
    request: LocalAiCliStartRequest,
    status: LocalAiCliProviderStatus,
    execution: LocalAiCliExecution
  ): Promise<PersistentPiHandle> {
    const existing = execution.pointer
      ? this.persistentPiSessions.get(execution.pointer.id)
      : undefined
    if (existing) return existing

    const startKey = `${execution.cwd}\0${execution.pointer?.id ?? 'new'}`
    if (this.persistentPiStarts.has(startKey)) throw new Error('NATIVE_SESSION_BUSY')
    this.persistentPiStarts.add(startKey)
    let session: PersistentPiRpcSession | undefined
    let releaseLease: (() => void) | undefined
    try {
      const spec = createLocalAiCliTaskSpec(
        'pi',
        '',
        request.access,
        execution.pointer?.nativeSessionId
      )
      session = await PersistentPiRpcSession.create({
        executable: status.executablePath!,
        cwd: execution.cwd,
        args: spec.args,
        env: withExecutableDirOnPath(sanitizedChildEnv(), status.executablePath!)
      })
      if (execution.pointer && session.state.sessionId !== execution.pointer.nativeSessionId) {
        await markLocalAiCliSessionState(execution.pointer.id, 'missing')
        throw new Error('NATIVE_SESSION_MISSING')
      }

      const beforeResponse = await session.request(
        { id: 'tuff-before', type: 'get_entries' },
        (record) => record.type === 'response' && record.command === 'get_entries'
      )
      const beforeEntries = parsePiEntriesResponse(beforeResponse)
      if (!beforeEntries) throw new Error('PROTOCOL_INVALID')

      let pointer = execution.pointer
      if (pointer) {
        if (beforeEntries.leafId !== pointer.expectedHeadId) {
          await markLocalAiCliSessionState(pointer.id, 'conflict')
          throw new Error('NATIVE_SESSION_CONFLICT')
        }
        releaseLease = this.acquirePointerLease(pointer)
      } else {
        const registered = await this.registerFreshNativeSession(
          execution,
          'pi',
          session.state.sessionId,
          request.prompt,
          beforeEntries.leafId
        )
        pointer = registered.pointer
        releaseLease = registered.releaseLease
      }

      const handle: PersistentPiHandle = { session, pointer, releaseLease }
      this.persistentPiSessions.set(pointer.id, handle)
      return handle
    } catch (error) {
      releaseLease?.()
      await session?.close().catch(() => undefined)
      throw error
    } finally {
      this.persistentPiStarts.delete(startKey)
    }
  }

  /** Arms the idle close; a turn that ends on this child re-arms it from its own finally. */
  private schedulePersistentPiIdle(handle: PersistentPiHandle): void {
    this.clearPersistentPiIdle(handle)
    if (this.persistentPiSessions.get(handle.pointer.id) !== handle) return
    const timer = setTimeout(() => {
      handle.idleTimer = undefined
      if (handle.session.hasActiveTurn) return
      void this.discardPersistentPi(handle).catch(() => undefined)
    }, PERSISTENT_PI_IDLE_MS)
    timer.unref?.()
    handle.idleTimer = timer
  }

  private clearPersistentPiIdle(handle: PersistentPiHandle): void {
    if (!handle.idleTimer) return
    clearTimeout(handle.idleTimer)
    handle.idleTimer = undefined
  }

  private async discardPersistentPi(handle: PersistentPiHandle): Promise<void> {
    this.clearPersistentPiIdle(handle)
    if (this.persistentPiSessions.get(handle.pointer.id) === handle) {
      this.persistentPiSessions.delete(handle.pointer.id)
    }
    try {
      await handle.session.close()
    } finally {
      handle.releaseLease()
    }
  }

  private async runPersistentPiTask(
    request: LocalAiCliStartRequest,
    context: StreamContext<LocalAiCliTaskChunk>
  ): Promise<void> {
    const callId = randomUUID()
    const prompt = buildPrompt(request.prompt, request.context)
    let handle: PersistentPiHandle | undefined
    let completeText = ''
    // pi retries inside one run, so only the latest assistant message says whether an attempt failed.
    let attemptFailed = false
    let turnFailed = false
    context.emit({ type: 'status', callId, status: 'starting' })
    try {
      const status = await this.requireRunnableProvider(request.provider, request.access)
      const execution = await this.resolveLocalAiCliExecution(request)
      if (execution.pointer && !status.capabilities.taskResume) {
        throw new Error('PROVIDER_RESUME_UNSUPPORTED')
      }
      handle = await this.getOrCreatePersistentPi(request, status, execution)
      // A turn already streaming on this child owns the head; reading it now would report a false conflict.
      if (handle.session.hasActiveTurn) throw new Error('NATIVE_SESSION_BUSY')
      this.clearPersistentPiIdle(handle)
      context.emit({ type: 'session', callId, provider: 'pi', sessionRef: handle.pointer.id })

      const beforeResponse = await handle.session.request(
        { id: 'tuff-turn-before', type: 'get_entries' },
        (record) => record.type === 'response' && record.command === 'get_entries'
      )
      const beforeEntries = parsePiEntriesResponse(beforeResponse)
      if (!beforeEntries) throw new Error('PROTOCOL_INVALID')
      if (beforeEntries.leafId !== handle.pointer.expectedHeadId) {
        await markLocalAiCliSessionState(handle.pointer.id, 'conflict')
        throw new Error('NATIVE_SESSION_CONFLICT')
      }

      const file = (await isPiSessionFileUnwritten(handle.session.state.sessionFile))
        ? null
        : await capturePiSessionFile(
            handle.session.state.sessionFile,
            handle.session.state.sessionId,
            handle.pointer.projectRoot
          )
      const capturedHead = beforeEntries.leafId
      context.emit({ type: 'status', callId, status: 'running' })

      for await (const nativeEvent of handle.session.prompt(prompt, context.signal)) {
        const decoded = decodeLocalAiCliEvent('pi', nativeEvent)
        if (decoded.delta) {
          completeText += decoded.delta
          context.emit({ type: 'text-delta', callId, text: decoded.delta })
        }
        if (!completeText && decoded.completeText) completeText = decoded.completeText
        if (
          nativeEvent.type === 'message_end' &&
          asObject(nativeEvent.message)?.role === 'assistant'
        ) {
          attemptFailed = decoded.failed === true
        }
        if (decoded.completed) turnFailed = decoded.failed === true || attemptFailed
      }

      const afterResponse = await handle.session.request(
        {
          id: 'tuff-turn-after',
          type: 'get_entries',
          ...(capturedHead ? { since: capturedHead } : {})
        },
        (record) => record.type === 'response' && record.command === 'get_entries'
      )
      const afterEntries = parsePiEntriesResponse(afterResponse)
      if (!afterEntries) throw new Error('PROTOCOL_INVALID')
      const finalHead = file
        ? await verifyPiSessionAppend({
            capture: file,
            capturedHead,
            beforeEntryIds: new Set(beforeEntries.entries.map((entry) => entry.id)),
            post: afterEntries
          })
        : await verifyPiSessionFirstWrite({
            sessionFile: handle.session.state.sessionFile,
            nativeSessionId: handle.session.state.sessionId,
            projectRoot: handle.pointer.projectRoot,
            before: beforeEntries,
            post: afterEntries
          })
      if (!finalHead) throw new Error('NATIVE_SESSION_CONFLICT')
      await this.touchNativeSession(handle.pointer, finalHead)
      handle.pointer = (await getLocalAiCliSession(handle.pointer.id)) ?? handle.pointer

      // pi has written this turn whatever its outcome, so the head moves before the terminal chunk.
      if (context.isCancelled()) {
        context.emit({ type: 'cancelled', callId })
      } else if (turnFailed || !completeText.trim()) {
        context.emit({ type: 'failed', callId, code: 'PROCESS_EXITED', recoverable: true })
      } else {
        context.emit({ type: 'complete', callId, text: completeText.trim() })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // A busy child is streaming another owner's turn; closing it here would kill that turn.
      if (handle && message !== 'NATIVE_SESSION_BUSY') {
        if (message === 'NATIVE_SESSION_CONFLICT') {
          await markLocalAiCliSessionState(handle.pointer.id, 'conflict').catch(() => undefined)
        } else if (message === 'NATIVE_SESSION_MISSING') {
          await markLocalAiCliSessionState(handle.pointer.id, 'missing').catch(() => undefined)
        }
        await this.discardPersistentPi(handle)
      }
      if (context.isCancelled() || message === 'CANCELLED') {
        context.emit({ type: 'cancelled', callId })
      } else {
        const code = taskFailureCode(error)
        context.emit({
          type: 'failed',
          callId,
          code,
          recoverable: code !== 'NATIVE_SESSION_CONFLICT' && code !== 'NATIVE_SESSION_MISSING'
        })
      }
    } finally {
      if (handle) this.schedulePersistentPiIdle(handle)
      context.end()
    }
  }

  private async runAcpTask(
    callId: string,
    request: LocalAiCliStartRequest,
    prompt: string,
    ownerId: number,
    executablePath: string,
    spec: LocalAiCliTaskSpec,
    execution: LocalAiCliExecution,
    context: StreamContext<LocalAiCliTaskChunk>
  ): Promise<void> {
    let pointer = execution.pointer
    let releaseLease = pointer ? this.acquirePointerLease(pointer) : undefined
    let child: ChildProcess
    try {
      child = spawnSafe(executablePath, spec.args, {
        cwd: execution.cwd,
        env: {
          ...withExecutableDirOnPath(sanitizedChildEnv(), executablePath),
          ...(spec.env ?? {})
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch {
      releaseLease?.()
      context.emit({ type: 'failed', callId, code: 'PROCESS_START_FAILED', recoverable: true })
      context.end()
      return
    }

    const abortController = new AbortController()
    let settleTask!: () => void
    const taskDone = new Promise<void>((resolve) => {
      settleTask = resolve
    })
    const taskRecord: TaskProcessSession = {
      process: child,
      abortController,
      releaseLease,
      done: taskDone
    }
    this.taskProcesses.set(callId, taskRecord)
    context.emit({ type: 'status', callId, status: 'starting' })

    const onContextAbort = (): void => abortController.abort()
    if (context.signal.aborted) abortController.abort()
    else context.signal.addEventListener('abort', onContextAbort, { once: true })

    const definition = getLocalAiCliProviderDefinition(request.provider)
    let sawSpawnError = false
    let sawProtocolError = false
    let initialized = false
    let activeSession: AcpSession | null = null

    const client = new AcpClient(child, {
      label: definition.label,
      onPermission: async (permissionReq) => {
        if (request.access !== 'workspace-write') {
          return {
            approved: false,
            reason: 'This local-agent request does not allow tool approvals'
          }
        }
        if (context.isCancelled() || abortController.signal.aborted) {
          return { approved: false, cancelled: true }
        }
        const operation: LocalAiCliApprovalRequest['operation'] =
          permissionReq.riskHint === 'execute'
            ? 'command'
            : permissionReq.riskHint === 'read'
              ? 'read'
              : 'write'
        context.emit({ type: 'status', callId, status: 'waiting-approval' })
        try {
          const decision = await this.approvals.request({
            callId,
            ownerId,
            provider: request.provider,
            toolName: permissionReq.toolName || `${definition.label} tool`,
            operation,
            summary:
              permissionReq.summary ||
              `${definition.label} requested permission for a tool in the selected workspace`,
            signal: abortController.signal,
            emit: (approval) => context.emit({ type: 'approval', callId, approval })
          })
          if (!context.isCancelled() && !abortController.signal.aborted) {
            context.emit({ type: 'status', callId, status: 'running' })
          }
          if (decision === 'allow-once') {
            const hasAllowOnce = permissionReq.acpOptions?.some(
              (option) =>
                option && option.kind === 'allow_once' && typeof option.optionId === 'string'
            )
            return hasAllowOnce ? { approved: true } : { approved: false, cancelled: true }
          }
          return { approved: false }
        } catch {
          return { approved: false, cancelled: true }
        }
      }
    })

    client.on('protocol_error', () => {
      sawProtocolError = true
      void client.close().catch(() => undefined)
    })
    client.on('error', () => {
      sawSpawnError = true
    })

    const onAbort = (): void => {
      if (activeSession) {
        void activeSession.cancel().catch(() => undefined)
      }
      void client.close().catch(() => undefined)
    }
    if (abortController.signal.aborted) onAbort()
    else abortController.signal.addEventListener('abort', onAbort, { once: true })

    try {
      const initResult = await client.initialize({
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false
        },
        clientInfo: { name: 'talex-touch', title: 'Talex Touch', version: '1' }
      })
      if (!initResult || typeof initResult !== 'object') {
        throw new Error('PROTOCOL_INVALID')
      }
      initialized = true
      if (context.isCancelled() || abortController.signal.aborted) {
        context.emit({ type: 'cancelled', callId })
        return
      }
      context.emit({ type: 'status', callId, status: 'running' })

      if (pointer) {
        const advertisesSessionResume = Boolean(
          initResult.agentCapabilities?.sessionCapabilities?.resume
        )
        const supportsSessionResume = request.provider === 'oh-my-pi' || advertisesSessionResume
        const supportsLoadSession = initResult.agentCapabilities?.loadSession === true

        if (supportsSessionResume) {
          const updateQueue: Array<Record<string, unknown>> = []
          let resolveNextUpdate: ((params: Record<string, unknown>) => void) | null = null
          let rejectNextUpdate: ((error: Error) => void) | null = null
          const onNotification = (method: string, params: unknown): void => {
            if (method !== 'session/update') return
            const record = asObject(params)
            if (!record) return
            if (resolveNextUpdate) {
              const resolve = resolveNextUpdate
              resolveNextUpdate = null
              rejectNextUpdate = null
              resolve(record)
            } else {
              updateQueue.push(record)
            }
          }
          const onCloseDuringResume = (): void => {
            if (rejectNextUpdate) {
              const reject = rejectNextUpdate
              resolveNextUpdate = null
              rejectNextUpdate = null
              reject(new Error('PROCESS_EXITED'))
            }
          }
          const onAbortDuringResume = (): void => {
            if (rejectNextUpdate) {
              const reject = rejectNextUpdate
              resolveNextUpdate = null
              rejectNextUpdate = null
              reject(new Error('CANCELLED'))
            }
          }
          client.on('notification', onNotification)
          client.once('close', onCloseDuringResume)
          abortController.signal.addEventListener('abort', onAbortDuringResume, { once: true })
          let resumeResult: Record<string, unknown> | null = null
          try {
            let rawResult: unknown
            try {
              rawResult = await client.sendRequest<unknown>('session/resume', {
                sessionId: pointer.nativeSessionId,
                cwd: execution.cwd,
                mcpServers: [],
                ...(spec.acpSessionMeta ? { _meta: spec.acpSessionMeta } : {})
              })
            } catch (error) {
              if (sawProtocolError || sawSpawnError || abortController.signal.aborted) throw error
              if (isJsonRpcMethodNotFoundError(error)) {
                throw new Error('PROVIDER_RESUME_UNSUPPORTED')
              }
              if (isAcpResumeSessionMissingError(error)) {
                await markLocalAiCliSessionState(pointer.id, 'missing')
                throw new Error('NATIVE_SESSION_MISSING')
              }
              throw error
            }
            resumeResult = asObject(rawResult)
            if (!resumeResult) {
              throw new Error('PROTOCOL_INVALID')
            }
            const returnedSessionId =
              typeof resumeResult.sessionId === 'string' && resumeResult.sessionId
                ? resumeResult.sessionId
                : undefined
            if (returnedSessionId) {
              if (returnedSessionId !== pointer.nativeSessionId) {
                await markLocalAiCliSessionState(pointer.id, 'missing')
                throw new Error('NATIVE_SESSION_MISSING')
              }
            } else if (advertisesSessionResume) {
              // ACP v1 allows `session/resume` to return `{}` without replaying history.
              // Reject only an explicit session ID mismatch if an update already arrived.
              const mismatched = updateQueue.find(
                (entry) =>
                  typeof entry.sessionId === 'string' &&
                  entry.sessionId.length > 0 &&
                  entry.sessionId !== pointer!.nativeSessionId
              )
              if (mismatched) {
                await markLocalAiCliSessionState(pointer.id, 'missing')
                throw new Error('NATIVE_SESSION_MISSING')
              }
            } else {
              // Legacy OMP builds omit `sessionId` and do not advertise standard ACP resume;
              // wait with a bounded deadline for the confirming `session/update` before prompting.
              let confirmTimer: ReturnType<typeof setTimeout> | undefined
              const confirming =
                updateQueue.shift() ??
                (await new Promise<Record<string, unknown>>((resolve, reject) => {
                  if (client.isClosed()) {
                    reject(new Error('PROCESS_EXITED'))
                    return
                  }
                  if (abortController.signal.aborted) {
                    reject(new Error('CANCELLED'))
                    return
                  }
                  confirmTimer = setTimeout(() => {
                    if (rejectNextUpdate) {
                      resolveNextUpdate = null
                      rejectNextUpdate = null
                      reject(new Error('PROCESS_EXITED'))
                    }
                  }, OMP_RESUME_CONFIRM_TIMEOUT_MS)
                  resolveNextUpdate = (params) => {
                    if (confirmTimer) clearTimeout(confirmTimer)
                    resolve(params)
                  }
                  rejectNextUpdate = (err) => {
                    if (confirmTimer) clearTimeout(confirmTimer)
                    reject(err)
                  }
                }).finally(() => {
                  if (confirmTimer) clearTimeout(confirmTimer)
                }))
              const confirmedId =
                typeof confirming.sessionId === 'string' ? confirming.sessionId : ''
              if (confirmedId !== pointer.nativeSessionId) {
                await markLocalAiCliSessionState(pointer.id, 'missing')
                throw new Error('NATIVE_SESSION_MISSING')
              }
            }
          } finally {
            client.removeListener('notification', onNotification)
            client.removeListener('close', onCloseDuringResume)
            abortController.signal.removeEventListener('abort', onAbortDuringResume)
          }
          const resumeConfigOptions = Array.isArray(resumeResult?.configOptions)
            ? (resumeResult.configOptions as AcpConfigOption[])
            : []
          const resumeModes = asObject(resumeResult?.modes) as AcpSessionModeState | null
          activeSession = new AcpSession(
            pointer.nativeSessionId,
            client,
            resumeConfigOptions,
            resumeModes && Array.isArray(resumeModes.availableModes) ? resumeModes : undefined
          )
          if (request.access !== 'workspace-write') {
            await applyPreferredAcpReadOnlyMode(activeSession, spec.acpModePreference)
          }
          await this.touchNativeSession(pointer)
          context.emit({
            type: 'session',
            callId,
            provider: request.provider,
            sessionRef: pointer.id
          })
        } else if (supportsLoadSession) {
          let loaded: AcpSession
          try {
            loaded = await client.loadSession({
              sessionId: pointer.nativeSessionId,
              cwd: execution.cwd,
              mcpServers: [],
              ...(spec.acpSessionMeta ? { _meta: spec.acpSessionMeta } : {})
            })
          } catch (error) {
            if (sawProtocolError || sawSpawnError || abortController.signal.aborted) throw error
            if (isJsonRpcMethodNotFoundError(error)) {
              throw new Error('PROVIDER_RESUME_UNSUPPORTED')
            }
            if (isAcpResumeSessionMissingError(error)) {
              await markLocalAiCliSessionState(pointer.id, 'missing')
              throw new Error('NATIVE_SESSION_MISSING')
            }
            throw error
          }
          if (loaded.sessionId !== pointer.nativeSessionId) {
            await markLocalAiCliSessionState(pointer.id, 'missing')
            throw new Error('NATIVE_SESSION_MISSING')
          }
          activeSession = loaded
          if (request.access !== 'workspace-write') {
            await applyPreferredAcpReadOnlyMode(activeSession, spec.acpModePreference)
          }
          await this.touchNativeSession(pointer)
          context.emit({
            type: 'session',
            callId,
            provider: request.provider,
            sessionRef: pointer.id
          })
        } else {
          throw new Error('PROVIDER_RESUME_UNSUPPORTED')
        }
      } else {
        const created = await client.createSession({
          cwd: execution.cwd,
          mcpServers: [],
          ...(spec.acpSessionMeta ? { _meta: spec.acpSessionMeta } : {})
        })
        if (typeof created.sessionId !== 'string' || !created.sessionId.trim()) {
          throw new Error('PROTOCOL_INVALID')
        }
        activeSession = created
        if (request.access !== 'workspace-write') {
          await applyPreferredAcpReadOnlyMode(activeSession, spec.acpModePreference)
        }
        const registered = await this.registerFreshNativeSession(
          execution,
          request.provider,
          created.sessionId,
          request.prompt
        )
        pointer = registered.pointer
        releaseLease = registered.releaseLease
        taskRecord.releaseLease = releaseLease
        context.emit({
          type: 'session',
          callId,
          provider: request.provider,
          sessionRef: pointer.id
        })
      }

      let completeText = ''
      for await (const event of activeSession.promptStream(prompt, {
        signal: abortController.signal
      })) {
        if (event.type === 'delta' && event.text) {
          completeText += event.text
          context.emit({ type: 'text-delta', callId, text: event.text })
        }
      }

      const stopReason = activeSession.lastStopReason
      if (context.isCancelled() || abortController.signal.aborted || stopReason === 'cancelled') {
        context.emit({ type: 'cancelled', callId })
      } else if (sawProtocolError) {
        context.emit({ type: 'failed', callId, code: 'PROTOCOL_INVALID', recoverable: true })
      } else if (stopReason === 'max_tokens') {
        if (pointer) {
          await this.touchNativeSession(pointer)
        }
        if (context.isCancelled() || abortController.signal.aborted) {
          context.emit({ type: 'cancelled', callId })
        } else {
          context.emit({ type: 'failed', callId, code: 'TOKEN_LIMIT_REACHED', recoverable: true })
        }
      } else if (pointer && completeText.trim() && stopReason === 'end_turn') {
        await this.touchNativeSession(pointer)
        if (context.isCancelled() || abortController.signal.aborted) {
          context.emit({ type: 'cancelled', callId })
        } else {
          context.emit({ type: 'complete', callId, text: completeText.trim() })
        }
      } else {
        context.emit({ type: 'failed', callId, code: 'PROCESS_EXITED', recoverable: true })
      }
    } catch (error) {
      if (context.isCancelled() || abortController.signal.aborted) {
        context.emit({ type: 'cancelled', callId })
      } else {
        let failure: unknown = error
        if (sawSpawnError) {
          failure = new Error('PROCESS_START_FAILED')
        } else if (sawProtocolError || isProtocolInvalidError(error)) {
          failure = new Error('PROTOCOL_INVALID')
        } else if (pointer && isAcpResumeSessionMissingError(error)) {
          await markLocalAiCliSessionState(pointer.id, 'missing').catch(() => undefined)
          failure = new Error('NATIVE_SESSION_MISSING')
        } else if (
          initialized &&
          !(
            error instanceof Error &&
            (error.message === 'NATIVE_SESSION_MISSING' ||
              error.message === 'NATIVE_SESSION_CONFLICT' ||
              error.message === 'NATIVE_SESSION_BUSY' ||
              error.message === 'PROVIDER_RESUME_UNSUPPORTED' ||
              error.message === 'WORKSPACE_INVALID' ||
              error.message === 'PROTOCOL_INVALID' ||
              error.message === 'TOKEN_LIMIT_REACHED')
          )
        ) {
          failure = new Error('PROCESS_EXITED')
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
      context.signal.removeEventListener('abort', onContextAbort)
      abortController.signal.removeEventListener('abort', onAbort)
      this.approvals.cancelCall(callId)
      await client.close().catch(() => undefined)
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
    if (request.provider === 'pi' && request.persistent === true) {
      await this.runPersistentPiTask(request, context)
      return
    }
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

    const spec = createLocalAiCliTaskSpec(
      request.provider,
      prompt,
      request.access,
      execution.pointer?.nativeSessionId
    )
    if (spec.protocol === 'acp') {
      await this.runAcpTask(
        callId,
        request,
        prompt,
        ownerId,
        status.executablePath!,
        spec,
        execution,
        context
      )
      return
    }

    let releaseLease = execution.pointer ? this.acquirePointerLease(execution.pointer) : undefined
    let child: ChildProcess
    try {
      child = spawnSafe(status.executablePath!, spec.args, {
        cwd: execution.cwd,
        env: withExecutableDirOnPath(sanitizedChildEnv(), status.executablePath!),
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
    let piAttemptFailed = false
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
      }
    }

    const handleProtocolLine = async (line: string): Promise<void> => {
      if (!line.trim()) return
      if (spec.protocol === 'pi-rpc' && (context.isCancelled() || completionReady)) return
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
          // Only a new task may find no file yet; a stored session's file is captured as it is.
          const file =
            !pointer && (await isPiSessionFileUnwritten(piState.sessionFile))
              ? null
              : await capturePiSessionFile(piState.sessionFile, piState.sessionId, execution.cwd)
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
          if (!piState) throw new Error('PROTOCOL_INVALID')
          const finalHead = piRun.file
            ? await verifyPiSessionAppend({
                capture: piRun.file,
                capturedHead: piRun.capturedHead,
                beforeEntryIds: new Set(piRun.beforeEntries.entries.map((entry) => entry.id)),
                post: entries
              })
            : await verifyPiSessionFirstWrite({
                sessionFile: piState.sessionFile,
                nativeSessionId: piState.sessionId,
                projectRoot: execution.cwd,
                before: piRun.beforeEntries,
                post: entries
              })
          if (context.isCancelled()) return
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

      const decoded = decodeLocalAiCliEvent(request.provider, nativeEvent)
      if (
        spec.protocol === 'pi-rpc' &&
        nativeEvent.type === 'message_end' &&
        asObject(nativeEvent.message)?.role === 'assistant'
      ) {
        piAttemptFailed = decoded.failed === true
      }
      if (
        spec.protocol === 'pi-rpc' &&
        decoded.completed &&
        (decoded.failed || piAttemptFailed) &&
        !piRun?.verificationRequested
      ) {
        protocolFailure = new Error('PROCESS_EXITED')
        child.kill()
        return
      }
      if (decoded.delta) {
        completeText += decoded.delta
        context.emit({ type: 'text-delta', callId, text: decoded.delta })
      }
      if (!completeText && decoded.completeText) completeText = decoded.completeText
      if (decoded.completed && spec.terminateOnComplete && completeText.trim()) {
        if (!pointer) throw new Error('PROTOCOL_INVALID')
        if (spec.protocol === 'pi-rpc') {
          // pi ends a run twice, `agent_end` and then `agent_settled`, and the second arrives ahead
          // of the `get_entries` answer: the run is already being verified.
          if (piRun?.verificationRequested) return
          if (!piRun) throw new Error('PROTOCOL_INVALID')
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
      if (!protocolFailure && pointer && !completionReady && stderrText) {
        if (isNativeSessionMissingError(new Error(stderrText))) {
          await markLocalAiCliSessionState(pointer.id, 'missing')
          protocolFailure = new Error('NATIVE_SESSION_MISSING')
        } else if (spec.protocol === 'pi-rpc' && isPiSessionNotFoundError(stderrText)) {
          // pi finds a `--session` by the id in each file's header, so a file still named for it
          // was edited or replaced; only no file at all is a missing session.
          const replaced = await hasPiSessionFileNamedFor(pointer.nativeSessionId).catch(
            () => false
          )
          await markLocalAiCliSessionState(pointer.id, replaced ? 'conflict' : 'missing')
          protocolFailure = new Error(
            replaced ? 'NATIVE_SESSION_CONFLICT' : 'NATIVE_SESSION_MISSING'
          )
        }
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
    if (!isLocalAiCliPlatformSupported() || !readLocalAiCliSettings().enabled) {
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
  ): Promise<LocalAiCliTerminalCreateResult> {
    const owner = this.terminalOwner(ownerId, sender)
    const request = normalizeLocalAiCliTerminalCreateRequest(rawRequest)
    const flowControl = request.flowControl === true
    const creation = ptySessionCore.reserveCreate(
      owner,
      request.creationToken ?? randomUUID(),
      this.terminalLifecycle.signal
    )
    const watcher = watchPtyOwner(sender, creation.signal)
    let releaseLease: (() => void) | undefined
    try {
      const provider = getLocalAiCliProviderDefinition(request.provider).id
      const status = await this.requireRunnableProvider(provider, request.access)
      if (watcher.signal.aborted) throw new Error('TERMINAL_CREATE_CANCELLED')
      const execution = await this.resolveLocalAiCliExecution(request)
      if (request.access === 'workspace-write' && !status.capabilities.terminalWriteApproval) {
        throw new Error('LOCAL_AI_CLI_WRITE_APPROVAL_UNAVAILABLE')
      }
      if (!status.capabilities.terminalRead) {
        throw new Error('LOCAL_AI_CLI_TERMINAL_UNAVAILABLE')
      }
      if (execution.pointer && !status.capabilities.terminalResume) {
        throw new Error('PROVIDER_RESUME_UNSUPPORTED')
      }
      if (watcher.signal.aborted) throw new Error('TERMINAL_CREATE_CANCELLED')
      if (execution.pointer) {
        const release = this.acquirePointerLease(execution.pointer)
        let released = false
        releaseLease = () => {
          if (released) return
          released = true
          release()
        }
        ptySessionCore.setCreationDisposer(creation, releaseLease)
      }
      const { id } = await ptySessionCore.create({
        owner,
        command: status.executablePath!,
        args: terminalArgs(provider, request.access, execution.pointer?.nativeSessionId),
        cols: terminalSize(request.cols, DEFAULT_COLS, LOCAL_AI_CLI_LIMITS.terminalCols),
        rows: terminalSize(request.rows, DEFAULT_ROWS, LOCAL_AI_CLI_LIMITS.terminalRows),
        cwd: execution.cwd,
        env: sanitizedChildEnv(),
        signal: watcher.signal,
        creation,
        onDispose: releaseLease,
        flowControl,
        onData: (sessionId, data) =>
          this.sendTerminalEvent(sender, LocalAiCliEvents.terminal.data, {
            sessionId,
            data
          }),
        onExit: (sessionId, exit) =>
          this.sendTerminalEvent(sender, LocalAiCliEvents.terminal.exit, {
            sessionId,
            ...exit
          })
      })
      if (execution.pointer) await this.touchNativeSession(execution.pointer)
      return flowControl ? { sessionId: id, flowControl } : { sessionId: id }
    } catch (error) {
      await ptySessionCore.cancelCreation(creation.token, owner)
      releaseLease?.()
      throw error
    } finally {
      watcher.dispose()
      ptySessionCore.discardCreate(creation)
    }
  }

  private terminalOwner(ownerId: number, sender: WebContents): PtySessionOwner {
    if (!sender || sender.id !== ownerId || sender.isDestroyed()) {
      throw new Error('LOCAL_AI_CLI_HOST_ONLY')
    }
    return { scope: 'local-ai-cli', sender }
  }

  private sendTerminalEvent<T extends { sessionId: string }>(
    sender: WebContents,
    event: TuffEvent<T, void>,
    payload: T
  ): void {
    if (sender.isDestroyed() || !this.transport) return
    try {
      this.transport.notifyTo(sender, event, payload)
    } catch {
      localAiCliLog.debug('Terminal delivery failed', { meta: { sessionId: payload.sessionId } })
    }
  }

  private writeTerminal(
    sessionId: unknown,
    data: unknown,
    ownerId: number,
    sender: WebContents
  ): void {
    if (typeof sessionId !== 'string') throw new Error('LOCAL_AI_CLI_TERMINAL_INVALID')
    if (typeof data !== 'string' || data.length > LOCAL_AI_CLI_LIMITS.terminalInputChars) {
      throw new Error('LOCAL_AI_CLI_TERMINAL_INPUT_INVALID')
    }
    this.controlTerminal(() =>
      ptySessionCore.write(sessionId, this.terminalOwner(ownerId, sender), data)
    )
  }

  private resizeTerminal(
    sessionId: unknown,
    cols: unknown,
    rows: unknown,
    ownerId: number,
    sender: WebContents
  ): void {
    if (typeof sessionId !== 'string') throw new Error('LOCAL_AI_CLI_TERMINAL_INVALID')
    this.controlTerminal(() =>
      ptySessionCore.resize(
        sessionId,
        this.terminalOwner(ownerId, sender),
        terminalSize(cols, DEFAULT_COLS, LOCAL_AI_CLI_LIMITS.terminalCols),
        terminalSize(rows, DEFAULT_ROWS, LOCAL_AI_CLI_LIMITS.terminalRows)
      )
    )
  }

  private acknowledgeTerminal(
    sessionId: unknown,
    chars: unknown,
    ownerId: number,
    sender: WebContents
  ): void {
    if (typeof sessionId !== 'string' || typeof chars !== 'number') {
      throw new Error('LOCAL_AI_CLI_TERMINAL_INVALID')
    }
    ptySessionCore.acknowledge(sessionId, this.terminalOwner(ownerId, sender), chars)
  }

  private async killTerminal(
    sessionId: unknown,
    ownerId: number,
    sender: WebContents
  ): Promise<void> {
    if (typeof sessionId !== 'string') throw new Error('LOCAL_AI_CLI_TERMINAL_INVALID')
    if (!(await ptySessionCore.close(sessionId, this.terminalOwner(ownerId, sender)))) {
      throw new Error('LOCAL_AI_CLI_TERMINAL_NOT_FOUND')
    }
  }

  private async cancelTerminalCreation(
    token: unknown,
    ownerId: number,
    sender: WebContents
  ): Promise<void> {
    if (typeof token !== 'string') throw new Error('LOCAL_AI_CLI_TERMINAL_INVALID')
    if (!(await ptySessionCore.cancelCreation(token, this.terminalOwner(ownerId, sender)))) {
      throw new Error('LOCAL_AI_CLI_TERMINAL_NOT_FOUND')
    }
  }

  private controlTerminal(run: () => void): void {
    try {
      run()
    } catch (error) {
      if (error instanceof Error && error.message === 'TERMINAL_SESSION_NOT_FOUND') {
        throw new Error('LOCAL_AI_CLI_TERMINAL_NOT_FOUND')
      }
      throw error
    }
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    this.terminalLifecycle.abort()
    await ptySessionCore.closeScope('local-ai-cli')
    shortcutModule.unregisterMainShortcut(LOCAL_AI_CLI_SHORTCUT_ID)
    this.quickOpenShortcutRegistered = false
    this.lastMasterSwitch = null
    this.lastExecutableOverrides = null
    this.approvals.destroy()
    for (const dispose of this.disposers.splice(0)) dispose()
    stopLocalAiCliVersionProbes()
    const persistentSessions = [...this.persistentPiSessions.values()]
    this.persistentPiSessions.clear()
    await Promise.allSettled(
      persistentSessions.map(async (session) => {
        this.clearPersistentPiIdle(session)
        await session.session.close()
        session.releaseLease()
      })
    )
    const taskCompletions: Promise<void>[] = []
    for (const session of this.taskProcesses.values()) {
      session.abortController?.abort()
      session.process?.kill()
      session.releaseLease?.()
      if (session.done) taskCompletions.push(session.done)
    }
    await Promise.allSettled(taskCompletions)
    this.taskProcesses.clear()
    // PTY listeners, sender watches and native leases have already converged in the shared core.
    setLocalAiCliWorkspaceRoot(null)
    this.transport = null
    this.destinationRuntime = null
    localAiCliLog.info('Local AI CLI runtime destroyed')
  }
}

export const localAiCliModule = new LocalAiCliModule()

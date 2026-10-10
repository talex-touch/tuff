import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { ReasoningEffortSetting } from '@talex-touch/utils/intelligence/reasoning-effort'
import type {
  AgentWorkspaceSdk,
  ConversationWorkspaceMode,
  ConversationWorkspaceSettings,
  ConversationWorkspaceState,
  WorkspaceMessageUpdate,
  WorkspaceQueuedInput,
  WorkspaceSubmitDisposition
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import type { ComputedRef, Ref } from 'vue'
import type { SessionModelSettings } from './home-model-scope'
import type {
  ConversationMessage,
  ConversationSendOptions,
  WorkspaceConversationAdapter
} from './useHomeConversation'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createAgentWorkspaceSdk } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, toRaw, watch } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { toModelAttachments } from './attachment-payload'
import { createLatestOnly } from './latest-only'
import { applyWorkspaceUpdate, fromHostMessage } from './workspace-message-stream'

const workspaceLog = createRendererLogger('AgentWorkspace')

/** The cap Main enforces (upstream TurnQueue bound); shown, never enforced, here. */
export const WORKSPACE_QUEUE_LIMIT = 8

/**
 * Codes Main rejects a workspace call with. Anything else surfaces as `unknown`, carrying the raw
 * message as detail — a localized label for an error nobody defined would be a guess.
 */
export const AGENT_WORKSPACE_ERROR_CODES = [
  'WORKSPACE_QUEUE_FULL',
  'WORKSPACE_BUSY',
  'WORKSPACE_QUEUE_HELD',
  'WORKSPACE_NOT_FOUND',
  'WORKSPACE_PROFILE_UNAVAILABLE',
  'WORKSPACE_PROJECT_UNAVAILABLE',
  'WORKSPACE_MODE_REQUIRES_FORK',
  'WORKSPACE_FORK_BUSY',
  'WORKSPACE_FORK_ANCHOR_INVALID',
  'WORKSPACE_FORK_NATIVE_UNSAFE',
  'WORKSPACE_RUN_NOT_PENDING',
  'WORKSPACE_STALE_TURN',
  'WORKSPACE_VOICE_UNAVAILABLE'
] as const

export type AgentWorkspaceErrorCode = (typeof AGENT_WORKSPACE_ERROR_CODES)[number] | 'unknown'

export interface AgentWorkspaceError {
  code: AgentWorkspaceErrorCode
  detail: string
}

/** The transport wraps Main's thrown message; the code is the stable part of it. */
export function toAgentWorkspaceError(error: unknown): AgentWorkspaceError {
  const detail = error instanceof Error ? error.message : String(error ?? '')
  const code = AGENT_WORKSPACE_ERROR_CODES.find((candidate) => detail.includes(candidate))
  return { code: code ?? 'unknown', detail }
}

/** Thrown back to callers so a failed submit can return its draft to the composer. */
export class AgentWorkspaceRequestError extends Error {
  constructor(readonly failure: AgentWorkspaceError) {
    super(failure.detail || failure.code)
    this.name = 'AgentWorkspaceRequestError'
  }
}

/** Which of Main's queue actions a row offers; the order rules themselves are Main's. */
export type WorkspaceQueueAction = 'remove' | 'up' | 'down' | 'promote'

/** Settings a blank Home sends with its first message: global defaults plus the chosen mode. */
export interface WorkspaceDraftDefaults {
  providerId?: string
  model?: string
  reasoningEffort: ReasoningEffortSetting
  autoContext: boolean
}

/** What a Home send can carry beyond the text: the opening lead, or the form call it answers. */
export interface WorkspaceSendOptions extends ConversationSendOptions {
  /** The form tool call this message answers; Main marks it submitted in the same write. */
  answersToolCallId?: string
  /** Sends this kept voice clip as the message's voice; the text is its transcript. */
  voiceRecordingId?: string
}

export interface UseAgentWorkspaceOptions {
  /** The thread on screen; `null` for a blank Home that has not sent anything yet. */
  conversationId: () => string | null
  /** The project a blank Home was opened for. Main validates and binds it at creation. */
  projectId: () => string | null
  /** The title a new conversation is created with: its first message, until one is generated. */
  title: (text: string) => string
  /** Global defaults a new conversation starts from (model pin, reasoning, Auto Context). */
  defaults: () => WorkspaceDraftDefaults
  /** Locale wording of the system note that carries the Home opening on every turn. */
  leadNote: (lead: string) => string
  /** A failure the user has to hear about that has no caller to throw to (stop, queue actions). */
  onError: (failure: AgentWorkspaceError, action: string) => void
  /** Injectable for tests; defaults to the transport-backed SDK. */
  sdk?: AgentWorkspaceSdk
}

export interface UseAgentWorkspaceReturn {
  adapter: WorkspaceConversationAdapter
  state: Readonly<Ref<ConversationWorkspaceState | null>>
  /** The thread's own settings, or the draft a blank Home will create the thread with. */
  settings: ComputedRef<ConversationWorkspaceSettings>
  /** Model/reasoning as the Home model scope reads them; undefined while the global default rules. */
  sessionModel: ComputedRef<SessionModelSettings | undefined>
  /** A stored thread is being read from Main for the first time. */
  loading: Ref<boolean>
  /** The last read failed; the thread cannot be shown as Main holds it. */
  loadError: Ref<AgentWorkspaceError | null>
  queue: ComputedRef<WorkspaceQueuedInput[]>
  /** Main is running a turn or waiting on its approval: new input queues instead of starting. */
  busy: ComputedRef<boolean>
  /** Which queue action is in flight, so its row can show the pending state. */
  queuePending: Ref<{ queueId: string; action: WorkspaceQueueAction } | null>
  resuming: Ref<boolean>
  reload: () => Promise<void>
  /**
   * Reads a stored thread ahead of switching to it; the switch then shows it at once. Never throws:
   * a failed read becomes `loadError` when the switch lands.
   */
  prefetch: (conversationId: string) => Promise<void>
  /** Sends or queues; resolves with Main's disposition once the input is durable. */
  submit: (
    text: string,
    attachments?: AiAttachment[],
    options?: WorkspaceSendOptions
  ) => Promise<WorkspaceSubmitDisposition>
  configure: (patch: Partial<ConversationWorkspaceSettings>) => Promise<void>
  setDraftMode: (mode: ConversationWorkspaceMode) => void
  setDraftProfile: (profileId: string | undefined) => void
  resume: () => Promise<void>
  queueAction: (queueId: string, action: WorkspaceQueueAction) => Promise<void>
  fork: (request: { messageId?: string; mode?: ConversationWorkspaceMode }) => Promise<string>
  approveRun: () => Promise<void>
  rejectRun: () => Promise<void>
  runDecision: Ref<'approve' | 'reject' | null>
  profiles: Ref<AiAgentProfile[]>
  profilesLoading: Ref<boolean>
  profilesError: Ref<boolean>
  loadProfiles: () => Promise<void>
  setProfileEnabled: (profile: AiAgentProfile, enabled: boolean) => Promise<void>
  profileSaving: Ref<string | null>
}

/**
 * The renderer half of the Main-owned Home workspace: a typed mirror of the conversation's state,
 * and the calls that change it.
 *
 * Main owns execution, the message history and the pending-input queue (A5–A7). Nothing here runs a
 * turn, keeps a queue of its own or writes a snapshot back: every change is a request Main accepts
 * or rejects, and what shows is the state Main broadcast. The adapter it builds is what
 * `useHomeConversation` delegates to, so the stream, the top bar and the panel all read Main.
 */
export function useAgentWorkspace(options: UseAgentWorkspaceOptions): UseAgentWorkspaceReturn {
  const sdk = options.sdk ?? createAgentWorkspaceSdk(useTuffTransport())
  const intelligence = useIntelligenceSdk()

  const state = shallowRef<ConversationWorkspaceState | null>(null)
  /** The rows as they render: Main's history with this turn's streamed frames applied. */
  const messages = ref<ConversationMessage[]>([])
  const loading = ref(false)
  const loadError = ref<AgentWorkspaceError | null>(null)
  const queuePending = ref<{ queueId: string; action: WorkspaceQueueAction } | null>(null)
  const resuming = ref(false)
  const runDecision = ref<'approve' | 'reject' | null>(null)

  /** A blank Home's mode and profile before Main holds the thread. */
  const draftMode = ref<ConversationWorkspaceMode>('chat')
  const draftProfileId = ref<string | undefined>(undefined)

  /**
   * Stream frame bookkeeping. A turn's frames apply in `seq` order and only while it is the turn
   * Main is running: once its terminal state landed, or Main moved on to another turn, anything
   * still in flight for it is late and must not reopen a settled row (A5, A11).
   */
  const turnSeq = new Map<string, number>()
  const closedTurns = new Set<string>()

  const loadSequence = createLatestOnly()
  /** Set between minting a blank Home's id and Main's reply that created the thread. */
  let pendingCreate: string | null = null

  const currentId = (): string | null => options.conversationId()

  function rebuildMessages(next: ConversationWorkspaceState): void {
    const live = new Map(messages.value.map((message) => [message.id, message]))
    // A stored `streaming` row is only live while Main reports a running turn for this thread;
    // otherwise it is a reply that ended without settling, and spinning on it would be a lie.
    const turnLive =
      Boolean(next.activeTurnId) &&
      (next.status === 'running' || next.status === 'pending_approval')
    messages.value = next.messages.map((host) => {
      const current = live.get(host.id)
      // A row still streaming in this window is ahead of the copy Main stored: state broadcasts
      // (a queue change mid-reply) carry the persisted body, not the frames since. Main's copy
      // takes over once it says the row is settled.
      if (turnLive && current?.status === 'streaming' && host.status === 'streaming') return current
      const message = fromHostMessage(host)
      if (message.status === 'streaming' && !turnLive) {
        message.status = 'failed'
        message.error ??= { code: 'WORKSPACE_TURN_INTERRUPTED', detail: '' }
      }
      return message
    })
  }

  /**
   * Takes a state if it belongs to the thread on screen and is newer than the one held. Ordering is
   * Main's revision: a slow reply to an earlier call must not roll back a broadcast that overtook it.
   */
  function applyState(next: ConversationWorkspaceState | null | undefined): void {
    if (!next || next.conversationId !== currentId()) return
    const held = state.value
    if (held && held.conversationId === next.conversationId && next.revision < held.revision) return
    const previousTurn =
      held?.conversationId === next.conversationId ? held.activeTurnId : undefined
    if (previousTurn && previousTurn !== next.activeTurnId) closedTurns.add(previousTurn)
    state.value = next
    rebuildMessages(next)
  }

  function applyFrame(frame: WorkspaceMessageUpdate): void {
    if (frame.conversationId !== currentId()) return
    if (closedTurns.has(frame.turnId)) return
    const held = state.value
    // Main publishes admission before frames. No active host turn means there is nothing a late
    // frame may resume, including after a reload that never observed the turn closing.
    if (
      !held ||
      held.conversationId !== frame.conversationId ||
      held.activeTurnId !== frame.turnId ||
      (held.status !== 'running' && held.status !== 'pending_approval')
    )
      return
    const host = held.messages.find((message) => message.id === frame.update.message.id)
    // The final message is durable before Main clears activeTurnId. Its status takes precedence
    // even in that interval; neither a delta nor a snapshot can reopen it or introduce another row.
    if (host?.status !== 'streaming' || host.meta?.turnId !== frame.turnId) return
    const last = turnSeq.get(frame.turnId) ?? -1
    if (frame.seq <= last) return
    turnSeq.set(frame.turnId, frame.seq)

    const id = frame.update.message.id
    const index = messages.value.findIndex((message) => message.id === id)
    const next = applyWorkspaceUpdate(index >= 0 ? messages.value[index] : undefined, frame.update)
    if (!next) return
    if (index >= 0) messages.value.splice(index, 1, next)
    else messages.value.push(next)
    if (frame.update.stream !== 'delta' && next.status !== 'streaming')
      closedTurns.add(frame.turnId)
  }

  function resetMirror(): void {
    state.value = null
    messages.value = []
    turnSeq.clear()
    closedTurns.clear()
    loadError.value = null
    queuePending.value = null
    runDecision.value = null
  }

  /** An existing thread Main has no record of cannot be shown, only reported. */
  function adopt(next: ConversationWorkspaceState | null): void {
    if (next) applyState(next)
    else loadError.value = { code: 'WORKSPACE_NOT_FOUND', detail: '' }
  }

  async function reload(): Promise<void> {
    const id = currentId()
    const isCurrent = loadSequence.claim()
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    loadError.value = null
    try {
      const next = await sdk.get(id)
      if (!isCurrent()) return
      adopt(next)
    } catch (error) {
      if (!isCurrent()) return
      loadError.value = toAgentWorkspaceError(error)
      workspaceLog.error(`Failed to read workspace ${id}`, error)
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  /**
   * A read started by the navigation itself, alongside the history record, so the thread is on
   * screen in the same update that switches to it — never a blank stage while a second read runs.
   */
  let prefetched: {
    id: string
    state: ConversationWorkspaceState | null
    error: AgentWorkspaceError | null
  } | null = null

  async function prefetch(id: string): Promise<void> {
    try {
      prefetched = { id, state: await sdk.get(id), error: null }
    } catch (error) {
      workspaceLog.error(`Failed to read workspace ${id}`, error)
      prefetched = { id, state: null, error: toAgentWorkspaceError(error) }
    }
  }

  watch(
    () => currentId(),
    (id, previous) => {
      if (id === previous) return
      // The first send mints the id and creates the thread in one call; its reply is the state.
      // Reading it again here would race that reply for nothing.
      if (previous === null && id && pendingCreate === id) return
      resetMirror()
      const ready = prefetched
      prefetched = null
      if (id && ready?.id === id) {
        loadSequence.claim()
        loading.value = false
        if (ready.error) loadError.value = ready.error
        else adopt(ready.state)
        return
      }
      void reload()
    },
    { immediate: true }
  )

  const disposers = [sdk.onChanged(applyState), sdk.onMessageUpdate(applyFrame)]
  if (getCurrentScope()) {
    onScopeDispose(() => {
      for (const dispose of disposers) dispose()
    })
  }

  const settings = computed<ConversationWorkspaceSettings>(() => {
    if (state.value) return state.value.settings
    const defaults = options.defaults()
    return {
      mode: draftMode.value,
      ...(draftMode.value === 'agent' && draftProfileId.value
        ? { profileId: draftProfileId.value }
        : {}),
      ...(defaults.providerId && defaults.model
        ? { providerId: defaults.providerId, model: defaults.model }
        : {}),
      reasoningEffort: defaults.reasoningEffort,
      autoContext: defaults.autoContext
    }
  })

  const sessionModel = computed<SessionModelSettings | undefined>(() => {
    const held = state.value?.settings
    if (!held) return undefined
    return {
      providerId: held.providerId,
      model: held.model,
      reasoningEffort: held.reasoningEffort ?? 'auto'
    }
  })

  const busy = computed(
    () => state.value?.status === 'running' || state.value?.status === 'pending_approval'
  )

  const isCompacting = computed(() => {
    const held = state.value
    if (!held?.activeTurnId || !busy.value) return false
    const events = (held.context?.compactions ?? []).filter(
      (event) => event.turnId === held.activeTurnId
    )
    return events.at(-1)?.phase === 'start'
  })

  async function submit(
    rawText: string,
    attachments?: AiAttachment[],
    sendOptions: WorkspaceSendOptions = {}
  ): Promise<WorkspaceSubmitDisposition> {
    const text = rawText.trim()
    const conversationId = currentId()
    if (!text || !conversationId) throw new Error('CONVERSATION_WORKSPACE_UNAVAILABLE')
    const created = state.value?.conversationId === conversationId
    // Claimed before the first await: the id watcher must see this creation as in flight, or it
    // would read a thread Main has not created yet and report it missing.
    if (!created) pendingCreate = conversationId
    const lead = !created ? sendOptions.lead?.trim() : undefined
    try {
      // Attachment encoding can outlive navigation or settings edits. All request
      // identity and user choices belong to the press that started this submission.
      const submission = {
        conversationId,
        id: crypto.randomUUID(),
        text,
        settings: { ...settings.value },
        ...(created
          ? {}
          : { create: { projectId: options.projectId(), title: options.title(text) } }),
        ...(lead ? { lead: { text: lead, note: options.leadNote(lead) } } : {}),
        ...(sendOptions.answersToolCallId
          ? { answersToolCallId: sendOptions.answersToolCallId }
          : {}),
        ...(sendOptions.voiceRecordingId ? { voiceRecordingId: sendOptions.voiceRecordingId } : {})
      }
      const carried = attachments?.length ? await toModelAttachments(attachments) : []
      const result = await sdk.submit({
        ...submission,
        ...(carried.length ? { attachments: carried } : {})
      })
      applyState(result.state)
      return result.disposition
    } catch (error) {
      throw new AgentWorkspaceRequestError(toAgentWorkspaceError(error))
    } finally {
      if (pendingCreate === conversationId) pendingCreate = null
    }
  }

  /**
   * Runs one state-changing call for the thread on screen and takes Main's reply. Failures are
   * reported, not thrown: these are button presses with no caller left to hear about them.
   */
  async function mutate(
    action: string,
    call: (conversationId: string) => Promise<ConversationWorkspaceState>
  ): Promise<boolean> {
    const conversationId = currentId()
    if (!conversationId || state.value?.conversationId !== conversationId) return false
    try {
      applyState(await call(conversationId))
      return true
    } catch (error) {
      const failure = toAgentWorkspaceError(error)
      workspaceLog.warn(`Workspace ${action} failed`, failure.detail)
      options.onError(failure, action)
      return false
    }
  }

  async function configure(patch: Partial<ConversationWorkspaceSettings>): Promise<void> {
    const held = state.value
    if (!held) return
    // A full replacement, built from Main's copy: a field patched to undefined is cleared (auto).
    const next: ConversationWorkspaceSettings = { ...held.settings, ...patch }
    for (const key of Object.keys(next) as Array<keyof ConversationWorkspaceSettings>) {
      if (next[key] === undefined) delete next[key]
    }
    await mutate('configure', (conversationId) => sdk.configure(conversationId, next))
  }

  async function retry(): Promise<void> {
    const conversationId = currentId()
    const last = messages.value.at(-1)
    if (!conversationId || !last || last.role !== 'assistant' || last.status !== 'failed') return
    const user = [...messages.value].reverse().find((message) => message.role === 'user')
    if (!user) return
    try {
      const result = await sdk.submit({
        conversationId,
        id: crypto.randomUUID(),
        text: user.content,
        settings: settings.value,
        retryOfMessageId: last.id
      })
      applyState(result.state)
    } catch (error) {
      const failure = toAgentWorkspaceError(error)
      options.onError(failure, 'retry')
    }
  }

  const adapter: WorkspaceConversationAdapter = {
    get messages() {
      return messages.value
    },
    get isStreaming() {
      return busy.value
    },
    get isCompacting() {
      return isCompacting.value
    },
    send: async (text, attachments, sendOptions) => {
      await submit(text, attachments, sendOptions)
    },
    stop: () => {
      // Stop pauses Main's queue as well as the turn; pending inputs stay for an explicit continue.
      void mutate('pause', (conversationId) => sdk.pause(conversationId))
    },
    retry,
    // Navigation only: the mirror follows `conversationId`, so leaving for a blank Home drops
    // nothing Main holds. No `restore`: switching threads is the id change itself.
    reset: () => {
      if (!currentId()) resetMirror()
    }
  }

  async function resume(): Promise<void> {
    resuming.value = true
    try {
      await mutate('resume', (conversationId) => sdk.resume(conversationId))
    } finally {
      resuming.value = false
    }
  }

  async function queueAction(queueId: string, action: WorkspaceQueueAction): Promise<void> {
    if (queuePending.value) return
    queuePending.value = { queueId, action }
    try {
      await mutate(`queue.${action}`, (conversationId) => {
        if (action === 'remove') return sdk.removeQueued(conversationId, queueId)
        if (action === 'promote') return sdk.promoteQueued(conversationId, queueId)
        return sdk.reorderQueued(conversationId, queueId, action)
      })
    } finally {
      queuePending.value = null
    }
  }

  async function fork(request: {
    messageId?: string
    mode?: ConversationWorkspaceMode
  }): Promise<string> {
    const conversationId = currentId()
    if (!conversationId) throw new Error('CONVERSATION_WORKSPACE_UNAVAILABLE')
    try {
      // Main answers with the child's state; the page navigates to it only if it still owns the
      // navigation, and the mirror then reads the child as any other thread.
      const child = await sdk.fork({ conversationId, ...request })
      return child.conversationId
    } catch (error) {
      throw new AgentWorkspaceRequestError(toAgentWorkspaceError(error))
    }
  }

  async function decideRun(decision: 'approve' | 'reject'): Promise<void> {
    const runId = state.value?.pendingRun?.runId
    if (!runId || runDecision.value) return
    runDecision.value = decision
    try {
      await mutate(`run.${decision}`, (conversationId) =>
        decision === 'approve'
          ? sdk.approveRun({ conversationId, runId })
          : sdk.rejectRun({ conversationId, runId })
      )
    } finally {
      runDecision.value = null
    }
  }

  // --------------------------------------------------------------------------
  // Agent profiles: the orchestrator's own records, read and toggled through its existing calls.
  // --------------------------------------------------------------------------

  const profiles = ref<AiAgentProfile[]>([])
  const profilesLoading = ref(false)
  const profilesError = ref(false)
  const profileSaving = ref<string | null>(null)
  let profilesInFlight: Promise<void> | null = null

  function loadProfiles(): Promise<void> {
    profilesInFlight ??= (async () => {
      profilesLoading.value = true
      try {
        profiles.value = await intelligence.orchestratorListProfiles()
        profilesError.value = false
      } catch (error) {
        workspaceLog.warn('Failed to list agent profiles', String(error))
        profilesError.value = true
      } finally {
        profilesLoading.value = false
        profilesInFlight = null
      }
    })()
    return profilesInFlight
  }

  async function setProfileEnabled(profile: AiAgentProfile, enabled: boolean): Promise<void> {
    if (profileSaving.value) return
    profileSaving.value = profile.id
    try {
      // The row comes out of the reactive list: spread, its nested fields (tool ids, policy) stay
      // proxies, and the IPC's structured clone refuses them. The raw record clones.
      const saved = await intelligence.orchestratorSaveProfile({ ...toRaw(profile), enabled })
      profiles.value = profiles.value.map((entry) => (entry.id === saved.id ? saved : entry))
    } catch (error) {
      options.onError(toAgentWorkspaceError(error), 'profile.save')
    } finally {
      profileSaving.value = null
    }
  }

  return {
    adapter,
    state,
    settings,
    sessionModel,
    loading,
    loadError,
    queue: computed(() => state.value?.queue ?? []),
    busy,
    queuePending,
    resuming,
    reload,
    prefetch,
    submit,
    configure,
    setDraftMode: (mode) => {
      draftMode.value = mode
    },
    setDraftProfile: (profileId) => {
      draftProfileId.value = profileId
    },
    resume,
    queueAction,
    fork,
    approveRun: () => decideRun('approve'),
    rejectRun: () => decideRun('reject'),
    runDecision,
    profiles,
    profilesLoading,
    profilesError,
    loadProfiles,
    setProfileEnabled,
    profileSaving
  }
}

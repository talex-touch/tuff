<script lang="ts" name="HomePage" setup>
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type {
  ConversationMessage,
  ConversationTurnMeta
} from '~/modules/conversation/useHomeConversation'
import type { AgentWorkspaceError } from '~/modules/conversation/useAgentWorkspace'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSelectionActions } from '@talex-touch/tuffex/selection-actions'
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import { TxToolConfirmation } from '@talex-touch/tuffex/tool-confirmation'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { describeFailure } from '~/utils/failure-text'
import { createRollbackSync } from '~/utils/rollback-sync'
import { useRoute, useRouter } from 'vue-router'
import { prefersReducedMotion, useSendChoreography } from '~/composables/useSendChoreography'
import { createWorkingConversationTitle } from '~/modules/conversation/conversation-title'
import { useAppSdk, useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { useAgentTools } from '~/modules/conversation/useAgentTools'
import { useCodePreviewTabs } from '~/modules/conversation/useCodePreviewTabs'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { useConversationLoading } from '~/modules/conversation/useConversationLoading'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'
import {
  AgentWorkspaceRequestError,
  toAgentWorkspaceError,
  useAgentWorkspace,
  WORKSPACE_QUEUE_LIMIT
} from '~/modules/conversation/useAgentWorkspace'
import { provideHomeModelScope } from '~/modules/conversation/home-model-scope'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'
import { useReasoningEffort } from '~/modules/conversation/useReasoningEffort'
import { initialReasoningSettingForNewSession } from '@talex-touch/utils/intelligence/model-binding'
import { buildActivityTurns, toGatewayApproval } from '~/modules/conversation/workspace-activity'
import { toHomeModelLimits } from '~/modules/conversation/workspace-panel'
import { contextOccupancyTokens } from '@talex-touch/pi-desktop-reuse/context-usage'
import { createOpeningLeadNote } from '~/modules/home-push/opening'
import { USAGE_LIMITS_ROUTE } from '~/modules/intelligence/ai-error-recovery'
import { appSetting } from '~/modules/storage/app-storage'
import { useProjectStore } from '~/stores/projects'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { showDictationNotice } from './composer/dictation-notice'
import { modelPillFace } from './composer/model-pill'
import { deriveSendState, isAwaitingFirstToken } from './composer/send-state'
import HomeContextMeter from './composer/HomeContextMeter.vue'
import HomeRunStatus from './composer/HomeRunStatus.vue'
import {
  contextPercent,
  deriveRunStep,
  formatWindow,
  lastReportedTurn
} from './composer/run-status'
import { useComposerDictation } from './composer/useComposerDictation'
import TuffAIComposer from './TuffAIComposer.vue'
import HomeVoiceDraft from './composer/HomeVoiceDraft.vue'
import HomeSidePanel from './HomeSidePanel.vue'
import HomeMessageRail from './HomeMessageRail.vue'
import HomeMessageRow from './HomeMessageRow.vue'
import { homeMessageContextKey } from './composables/home-message-context'
import HomeTopBar from './HomeTopBar.vue'
import HomeRunApproval from './workspace/HomeRunApproval.vue'
import HomeWorkspaceModeMenu from './workspace/HomeWorkspaceModeMenu.vue'
import HomeWorkspaceQueue from './workspace/HomeWorkspaceQueue.vue'
import { homeLog } from './composables/home-log'
import { useReadAloud } from './composables/useReadAloud'
import { useMessageParts } from './composables/useMessageParts'
import { useHomeAttachments } from './composables/useHomeAttachments'
import { useLeavingHead } from './composables/useLeavingHead'
import { useConversationRestore } from './composables/useConversationRestore'
import { usePassageSelection } from './composables/usePassageSelection'
import { useFileLinkClick } from './composables/useFileLinkClick'
import HomeFilePreviewDrawer from './preview/HomeFilePreviewDrawer.vue'
import { useConversationTitle } from './composables/useConversationTitle'
import { useThinkingTicker } from '@talex-touch/intelligence-uikit/utils'
import { useHomeCommands } from './composables/useHomeCommands'
import { useHomeOpening } from './composables/useHomeOpening'
import { useHomeSubmit } from './composables/useHomeSubmit'
import { useSendState } from './composables/useSendState'
import { useWorkspaceControls } from './composables/useWorkspaceControls'
import { useTurnMetrics } from './composables/useTurnMetrics'
import HomeEmptyHead from './HomeEmptyHead.vue'
import HomePayloadModal from './HomePayloadModal.vue'
import HomePushCard from './HomePushCard.vue'

/**
 * The empty state and message stream share one composer node, preserving focus across the first
 * send. Main owns execution, durable history and queues; this page owns only the current view,
 * draft and the navigation-scoped effects of asynchronous submissions.
 */
const { t, locale } = useI18n()

const props = withDefaults(
  defineProps<{
    browserLanding?: boolean
    browserActive?: boolean
    browserNavigate?: (input: string) => Promise<void>
  }>(),
  { browserLanding: false, browserActive: true }
)
const browserMode = ref<'browse' | 'ask'>('browse')
const browserNavigating = ref(false)

const MAX_INPUT_HEIGHT = 200

const draft = ref('')
/** The scrolling transcript column: the subtree a text selection is scoped to. */
const bodyRef = ref<HTMLElement | null>(null)
/** The floating selection bar itself; focusing it must not read as a deselection. */
const selectionBarRef = ref<HTMLElement | null>(null)
/** Scroll behaviour (stick-to-bottom, follow, back-to-bottom pill) lives inside the stream now. */
const streamRef = ref<TxConversationStreamInstance | null>(null)
/** The composer component; the page reads its box, field and draft ghost through it. */
const composerEl = ref<InstanceType<typeof TuffAIComposer> | null>(null)
/** The field the draft is typed in. */
const inputRef = computed(() => composerEl.value?.input ?? null)
/** The composer's own box: what the send choreography measures and the FLIP animates. */
const composerRef = computed(() => composerEl.value?.box ?? null)
/** A wrapped draft as it sat in the field, fading out while the lifted bubble's text fades in. */
const draftGhostRef = computed(() => composerEl.value?.ghost ?? null)
/** The FLIP animates this — the composer *and* the push card under it travel as one body. */
const composerGroupRef = ref<HTMLElement | null>(null)
/** The greeting's root, which the page measures before a flip and pins where it stood. */
const headEl = ref<InstanceType<typeof HomeEmptyHead> | null>(null)
const headRef = computed(() => headEl.value?.el ?? null)
/**
 * Host for the send-flight clone. The page root, not `document.body`: the
 * clone must sit under the shell/tuffex CSS-variable scope or it renders in
 * fallback colours mid-air.
 */
const pageRef = ref<HTMLElement | null>(null)
const composerHeight = ref(0)

/**
 * The send lift's bubble (see `useSendChoreography().liftDraft`). Declared in the template rather
 * than created at runtime so the scoped styles reach it.
 */
const liftGhostRef = ref<HTMLElement | null>(null)
const liftFillRef = ref<HTMLElement | null>(null)
const liftTextRef = ref<HTMLElement | null>(null)
const router = useRouter()
const route = useRoute()

const {
  resolvedChoice: globalResolvedModel,
  routing: modelRouting,
  ensureLoaded: ensureModelOptionsLoaded
} = useModelOptions()
/**
 * The global reasoning default: what a conversation is created with. Once Main holds the thread, its
 * own setting rules (`modelScope`).
 */
const { setting: reasoningEffortSetting } = useReasoningEffort()
/**
 * Loaded at mount rather than on first menu open, so the persisted selection resolves — and
 * the pill stops saying auto — before the user reaches for it.
 */
onMounted(() => {
  void ensureModelOptionsLoaded()
})

/**
 * Allocated on the first send, so an untouched home screen never creates a conversation.
 * Reactive because it also keys the stream instance: old stored threads share counter-style
 * message ids, and one keep-alive'd stream carrying its height cache across them laid thread B out
 * with thread A's measurements. Draft → creation does not change it (the id is minted at send
 * time), so the key flips only on real thread switches.
 */
const conversationId = ref<string | null>(null)
const projectId = ref<string | null>(null)

/**
 * The Main-owned workspace behind Home (A2, A5–A7): execution, history and pending inputs live in
 * Main; this page mirrors them and sends requests. The project a thread is created with is the one
 * Main validates and keeps — switching the sidebar's project later never re-roots it.
 */
const workspace = useAgentWorkspace({
  conversationId: () => conversationId.value,
  projectId: () => projectId.value,
  // The opening message is the working title until a generated one replaces it (#969).
  title: createWorkingConversationTitle,
  defaults: () => ({
    providerId: modelRouting.value.providerId,
    model: modelRouting.value.model,
    // A stored choice — `auto` included — is the user's and stands. Only a profile that never
    // stored one takes the pinned model's explicit default, and none leaves it on auto (A4).
    reasoningEffort:
      appSetting.conversation?.reasoningEffort === undefined
        ? (initialReasoningSettingForNewSession(globalResolvedModel.value?.binding) ??
          reasoningEffortSetting.value)
        : reasoningEffortSetting.value,
    autoContext: autoContext.value
  }),
  // The Home opening reaches the model on every turn as this system note, worded in the reader's
  // locale.
  leadNote: createOpeningLeadNote(t),
  onError: (failure, action) => reportWorkspaceError(failure, action)
})

/**
 * Both model pills edit the open thread's own selection once Main holds it, and the global default
 * on a blank Home — never the other way round (A5).
 */
const modelScope = provideHomeModelScope({
  settings: () => workspace.sessionModel.value,
  configure: (patch) => void workspace.configure(patch)
})

const conversation = useHomeConversation({ workspace: () => workspace.adapter })
const { isCompacting, isEmpty, isStreaming, lastTurn, messages } = conversation

const panelOpen = ref(false)
const panelTab = ref('outputs')
const {
  tabs: codeTabs,
  activeId: activeCodeTabId,
  open: openCodeTab,
  select: selectCodeTab,
  close: closeCodeTab
} = useCodePreviewTabs(conversationId)

function showCodePreview(preview: StreamMarkdownCodePreview): void {
  openCodeTab(preview)
  panelTab.value = 'preview'
  panelOpen.value = true
}
const { setConversationLoading } = useConversationLoading()

/**
 * Whether this page is the one on screen. Read by the surface watcher below and by the composer's
 * commands, which an off-screen page must not offer as runnable.
 */
const isHomeRoute = computed(() =>
  props.browserLanding
    ? route.path === '/browser' && props.browserActive
    : route.path === '/home' || route.path.startsWith('/home/c/')
)

/** Both pills read this: the pinned model with its mark, or the routing label with the auto mark. */
const modelPill = computed(() =>
  modelPillFace(modelScope.resolvedChoice.value, t('home.modelName'))
)

/** The composer's pill adds the reasoning level the next send runs at; the top bar's does not. */
const composerModel = computed(() => {
  const level = modelScope.pillLevel.value
  return { ...modelPill.value, effort: level ? t(reasoningLevelLabelKey(level)) : undefined }
})

/** Only macOS and Windows have a microphone pane to open; elsewhere the notice stands alone. */
const micSettingsAvailable = (() => {
  const platform = getCurrentRendererPlatformState()
  return platform.isMac || platform.isWindows
})()

/**
 * The composer's microphone (D10): dictation into the draft at the caret. Not gated by the Voice
 * Input switch (D10-a) — pressing the button is the consent. Its notices become toasts carrying the
 * one action that fixes them.
 */
const dictation = useComposerDictation({
  draft,
  input: () => inputRef.value,
  language: () => appSetting.voiceInput?.language,
  onTextChange: autoGrow,
  onNotice: (kind, detail) =>
    showDictationNotice(
      kind,
      {
        t,
        locale: locale.value,
        openRecognitionSettings: () => void router.push('/setting/intelligence/capabilities'),
        openMicrophoneSettings: micSettingsAvailable
          ? () => void dictation.openMicrophoneSettings()
          : undefined,
        openUsageLimits: () => void router.push(USAGE_LIMITS_ROUTE)
      },
      detail
    )
})

/**
 * What a send leaves on the page while it is in the air: shared by the send path, the thread
 * restore and the append watcher. The motion score is created further down, so it is read lazily.
 */
const submitState = useSendState({ choreography: () => choreography })
const { sending, lifting, openingHold } = submitState

watch(
  [
    () => (typeof route.params.id === 'string' ? route.params.id : conversationId.value),
    isStreaming,
    sending
  ],
  ([id, streaming, isSending]) => {
    if (id) {
      setConversationLoading(id, Boolean(streaming || isSending))
    }
  },
  { immediate: true }
)

// A plain send waits for dictation to finish; while it runs the send key means 「结束并发送」 (D10-d).
// A running reply does not block it: Main takes the message as a pending input (A6).
const canSend = computed(
  () =>
    draft.value.trim().length > 0 &&
    isHomeRoute.value &&
    (typeof route.params.id !== 'string' || route.params.id === conversationId.value) &&
    !dictation.active.value &&
    !sending.value &&
    !browserNavigating.value &&
    !workspace.loading.value &&
    !workspace.loadError.value
)

/** Main is busy and the draft would join its queue rather than start a turn. */
const sendQueues = computed(
  () => workspace.busy.value || (workspace.state.value?.queue.length ?? 0) > 0
)

/**
 * The voice clip (`DictationClip`): the last dictation's audio, recognized or not, waiting to be
 * recognized again or sent as a voice message. In a thread it is one more row of the stream, so it
 * sits where the message it may become will land; on an untouched Home it waits above the composer.
 */
const VOICE_DRAFT_ID = '__home-voice-draft__'
const VOICE_DRAFT_ROW: ConversationMessage = {
  id: VOICE_DRAFT_ID,
  role: 'user',
  content: '',
  status: 'complete'
}
const streamItems = computed(() =>
  dictation.clip.value ? [...messages.value, VOICE_DRAFT_ROW] : messages.value
)
const voiceSendBlocked = computed(
  () =>
    !isHomeRoute.value ||
    sending.value ||
    dictation.active.value ||
    workspace.loading.value ||
    Boolean(workspace.loadError.value)
)

/** The send key's face (`composer/send-state.ts`), derived from state this page already owns. */
const sendState = computed(() =>
  deriveSendState({
    hasText: draft.value.trim().length > 0,
    streaming: isStreaming.value,
    awaitingFirstToken: isAwaitingFirstToken(messages.value.at(-1)),
    blocked: Boolean(agentTools.pending.value) || Boolean(workspace.state.value?.pendingRun),
    dictating: dictation.active.value
  })
)

// A reply started from anywhere else (a form answer, a retry) ends dictation gracefully: its last
// words still land in the draft while the microphone yields its slot to the stop capsule. Leaving
// Home ends it the same way.
watch(isStreaming, (streaming) => {
  if (streaming) void dictation.stop()
})
watch(isHomeRoute, (visible) => {
  if (!visible) {
    submitState.invalidatePageSubmission()
    void dictation.stop()
  }
})

/**
 * The border beam (TuffEx `TxBorderBeam`) on the composer's own box.
 *
 * It runs on the untouched home screen only, where the field *is* the page's primary target and
 * the outward `pulse-outside` bloom is what says so. Once a transcript exists the box keeps its
 * plain border: static emphasis that never changes state is paint the border already carries.
 *
 * The running state is deliberately excluded — while a response streams the composer wears the
 * living glow on its own pseudo-elements, and two effects on one box fight for the same edge. So is
 * dictation, which lights the box from below with the voice glow.
 */
const composerBeamActive = computed(
  () =>
    !props.browserLanding &&
    isHomeRoute.value &&
    isEmpty.value &&
    !isStreaming.value &&
    !dictation.active.value
)

/**
 * Auto Context has no composer control any more: it and the old tools pill read as the same
 * switch to users, so 「设置 · 插件与工具」 owns the toggle and the composer keeps a single
 * permission pill. Still read here because every send asks for its current value.
 *
 * Backed by `appSetting` rather than a local ref: this is the same preference the settings page
 * manages, and a local one would reset on every navigation.
 */
const autoContext = computed(() => appSetting.tools?.autoContext !== false)

// ============================================================================
// Agent tools
// ============================================================================

const agentTools = useAgentTools()

/**
 * Mounting is not visibility: the shell keeps this page alive while the user reads Settings, and a
 * confirmation card drawn into a hidden page is one nobody can answer. Main needs the difference —
 * a call driven from outside the app (the local MCP server) should be refused with an explanation
 * rather than wait two minutes for a prompt that is not on screen.
 *
 * `/home/c/:id` is the stored-conversation route and renders this same component, card included, so
 * it counts as visible for the same reason `/home` does.
 */
watch(isHomeRoute, (visible) => agentTools.setSurfaceVisible(visible), { immediate: true })

/**
 * How far the assistant may go with tools: no tools at all, tools that ask before every
 * call, or tools that run unasked.
 *
 * Reading falls back to the pre-mode boolean so an upgrade lands on 「自动审阅」 instead of
 * silently losing tools; writing keeps that boolean in step, so rolling back to a build that
 * only knows it still finds the same intent.
 */
const agentToolsMode = computed<AgentToolsMode>({
  get: () => {
    const tools = appSetting.tools
    return tools?.agentToolsMode ?? (tools?.agentTools === true ? 'review' : 'off')
  },
  set: (mode) => {
    const tools = appSetting.tools
    if (!tools) return
    tools.agentToolsMode = mode
    tools.agentTools = mode !== 'off'
  }
})

/**
 * Mirrors the mode into main — a watcher rather than the menu component, because the gateway
 * starts disabled on every launch: a user who left tools on last session would otherwise get
 * none until they happened to touch the pill.
 */
/**
 * Mirrored through `createRollbackSync` rather than a bare `void`.
 *
 * #835: the boolean this replaced discarded both the result and the rejection, so a failed sync --
 * gateway port in use, handler not registered -- left the pill reading "on" and `aria-pressed="true"`
 * across restarts while the gateway was shut, and every tool call the model attempted then failed.
 * The three-state rewrite on app-shell-v2 arrived after that fix and went back to `void`, which
 * would have reintroduced it in mode form. Same failure, one more state to be wrong in.
 */
const syncAgentToolsMode = createRollbackSync<AgentToolsMode>({
  sync: async (mode) => {
    await agentTools.setMode(mode)
  },
  rollback: (previous) => {
    const tools = appSetting.tools
    if (!tools) return
    tools.agentToolsMode = previous
    tools.agentTools = previous !== 'off'
    toast.error(t('home.error.agentToolsSync'))
  },
  onError: (error) => homeLog.error('Failed to sync agent tools mode with main', error)
})

watch(
  agentToolsMode,
  (mode, previous) => {
    // Main is already closed at startup, so the first read only has to push a mode that opens it.
    if (mode === 'off' && previous === undefined) return
    void syncAgentToolsMode(mode, previous ?? 'off')
  },
  { immediate: true }
)

/** Stays here rather than in the menu: this component owns the agent-tools transport instance. */
async function resetRememberedApprovals(): Promise<void> {
  try {
    await agentTools.resetApprovals()
    toast.success(t('home.permissionResetDone'))
  } catch (error) {
    homeLog.warn('Failed to reset remembered approvals', String(error))
    toast.error(t('home.permissionResetFailed'))
  }
}

/**
 * The motion score lives in its own composable — it drives three sibling
 * subtrees plus the stream's imperative scroll API, so the view keeps only the
 * conversation-shaped decisions (who owns a batch, when to send).
 */
const choreography = useSendChoreography({
  host: () => pageRef.value,
  scroller: () =>
    pageRef.value?.querySelector<HTMLElement>('.tx-conversation-stream__scroller') ?? null,
  composerGroup: () => composerGroupRef.value,
  composer: () => composerRef.value,
  liftOverlay: () => {
    const ghost = liftGhostRef.value
    const fill = liftFillRef.value
    const text = liftTextRef.value
    return ghost && fill && text ? { ghost, fill, text } : null
  }
})
const enteringMessages = choreography.enteringMessages

watch(
  () => messages.value.length,
  (length, previous) => {
    // Consumed before ANY early return: a claim that survived reduced motion
    // (or a non-streaming append) used to latch, hijack the next programmatic
    // batch, and strand its rows at opacity 0 with nothing left to reveal them.
    const claimed = submitState.consumeChoreographedSend()
    if (!isStreaming.value || prefersReducedMotion()) return
    const appended = messages.value.slice(previous ?? 0, length)
    choreography.markEntering(appended.map((message) => message.id))
    // The composer's own send runs the full glide-flight-placeholder score;
    // everything else (retry placeholders, form submissions) enters here.
    if (claimed && appended.some((message) => message.role === 'user')) return
    void nextTick(() => {
      for (const message of appended) {
        choreography.playEntrance(message.id, message.role === 'user' ? 0.8 : 0.6)
      }
    })
  }
)

// ============================================================================
// Read aloud
// ============================================================================

const intelligenceSdk = useIntelligenceSdk()

const { toggleSpeak, speakStateOf } = useReadAloud()

const appSdk = useAppSdk()

const messageParts = useMessageParts({
  submit: (text, attachments, options) => workspace.submit(text, attachments, options),
  openExternal: (url) => appSdk.openExternal(url),
  clearDraft: () => {
    draft.value = ''
  },
  onSubmitError: reportSubmitError
})

/** Grows the composer with its content up to a cap, then scrolls — the usual chat affordance. */
function autoGrow(): void {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
}

// ---------------------------------------------------------------------------
// Highlighted transcript text
// ---------------------------------------------------------------------------

const { passageSelection, passageActions, runPassageAction } = usePassageSelection({
  body: bodyRef,
  bar: selectionBarRef,
  input: inputRef,
  draft,
  conversationId,
  autoGrow
})

// ---------------------------------------------------------------------------
// File path links: Command-Click opens in right drawer, Shift-Command-Click in system
// ---------------------------------------------------------------------------

const fileDrawerVisible = ref(false)
const previewFilePath = ref('')
const previewDisplayPath = ref('')

useFileLinkClick({
  container: bodyRef,
  projectRoot: computed(() => currentProject.value?.rootPath),
  onOpenRight: ({ absolutePath, displayPath }) => {
    previewFilePath.value = absolutePath
    previewDisplayPath.value = displayPath
    fileDrawerVisible.value = true
  }
})

/**
 * The field returns to one line once its draft is sent — eased rather than snapped when `animate`:
 * the docked composer is bottom-anchored, so a multi-line draft collapsing at once would drop its
 * top edge in one frame.
 */
function collapseDraft(animate: boolean): void {
  const input = inputRef.value
  if (!input) return
  const from = input.offsetHeight
  autoGrow()
  const to = Number.parseFloat(input.style.height) || from
  if (animate && Math.abs(from - to) >= 1 && !prefersReducedMotion()) {
    input.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: 220,
      easing: 'cubic-bezier(0.2, 0, 0, 1)'
    })
  }
}

/** Widest a user bubble may be: its `max-width` (78%) against the chat lane the rows share. */
function bubbleMaxWidth(): number {
  const lane = composerGroupRef.value?.querySelector<HTMLElement>('.HomePage-ComposerBeam')
  return (lane?.getBoundingClientRect().width ?? 0) * 0.78
}

const { measureLeavingHead, pinLeavingHead } = useLeavingHead(headRef)

function workspaceErrorText(failure: AgentWorkspaceError): string {
  return t(`home.workspace.error.${failure.code === 'unknown' ? 'unknown' : failure.code}`)
}

/** A workspace call the reader made failed: say what Main said, in their language. */
function reportWorkspaceError(failure: AgentWorkspaceError, action: string): void {
  homeLog.warn(`Workspace ${action} rejected`, failure.detail)
  const description = failure.code === 'unknown' ? describeFailure(failure.detail, t, '') : ''
  toast.error(workspaceErrorText(failure), description ? { description } : undefined)
}

function reportSubmitError(error: unknown): void {
  const failure =
    error instanceof AgentWorkspaceRequestError ? error.failure : toAgentWorkspaceError(error)
  reportWorkspaceError(failure, 'submit')
}

const {
  pendingAttachments,
  attachPreviewProps,
  attachOpenLabel,
  addFiles,
  removeAttachment,
  isDragover,
  onPaste,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop
} = useHomeAttachments({
  isActive: () => isHomeRoute.value,
  onAdd: () => {
    if (props.browserLanding) browserMode.value = 'ask'
  },
  focusInput: () => inputRef.value?.focus()
})

/**
 * Feeds the measured composer stack height to the stream's bottom padding.
 *
 * The stack can contain both the composer and a pending tool confirmation. Observing the stack
 * keeps the transcript and back-to-bottom control clear of every blocking control without
 * duplicating either component's variable height in CSS.
 */
let composerObserver: ResizeObserver | null = null

onMounted(() => {
  const element = composerGroupRef.value
  if (!element || typeof ResizeObserver === 'undefined') return
  composerObserver = new ResizeObserver(([entry]) => {
    // Border-box, not contentRect: the clearance must include every card, gap, border and padding.
    if (entry)
      composerHeight.value = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
  })
  composerObserver.observe(element)
})

onBeforeUnmount(() => {
  composerObserver?.disconnect()
  composerObserver = null
  // Pending knocks and reveals would otherwise fire against whatever mounts next.
  choreography.cancel()
})

const composerClearance = computed(() =>
  composerHeight.value > 0 ? `${Math.round(composerHeight.value)}px` : undefined
)

// ============================================================================
// Persistence
// ============================================================================

const history = useConversationHistory()

const { generatedTitle, conversationTitle } = useConversationTitle({
  messages,
  conversationId,
  busy: () => workspace.busy.value,
  history,
  sdk: intelligenceSdk
})
const projectStore = useProjectStore()

const currentProject = computed(() =>
  projectId.value ? (projectStore.projects.find((p) => p.id === projectId.value) ?? null) : null
)

const { resetBlankConversation } = useConversationRestore({
  browserLanding: () => props.browserLanding,
  isHomeRoute,
  conversationId,
  projectId,
  generatedTitle,
  workspace,
  history,
  projectStore,
  composer: () => composerRef.value,
  stream: () => streamRef.value,
  focusInput: () => inputRef.value?.focus(),
  resetConversation: () => conversation.reset(),
  submitState,
  invalidateChoreography: () => choreography.invalidate(),
  playComposerFlip: (deltaY) => choreography.playComposerFlip(deltaY),
  measureLeavingHead,
  pinLeavingHead,
  // A dictation belongs to the thread it started in: switching threads abandons it where it
  // stands, without writing the draft back. (A first send never trips this — it waits for
  // dictation to end.) Its clip goes too — except across the id a first send mints, and takes
  // back when it fails, where the thread on screen has not changed.
  onThreadChange: (next, previous) => {
    dictation.cancel({ restore: false })
    if (submitState.isOwnMintedChange(next, previous)) return
    dictation.dismissClip()
  }
})

// ============================================================================
// Home push: the opening line and the card under the composer
// ============================================================================

const {
  push,
  homeRecommendationsEnabled,
  openingPhase,
  openingText,
  openingSource,
  openingBusy,
  pushSteps,
  pushStep,
  pushSelected,
  pushLoadingRows,
  pushLabels,
  choosePush,
  pushSkeleton,
  pushSettling,
  openingSnapshot,
  pushSlotStyle
} = useHomeOpening({
  openingHold,
  browserLanding: () => props.browserLanding,
  isEmpty,
  conversationId,
  projectId,
  routing: () => modelRouting.value,
  routingReady: () => ensureModelOptionsLoaded(),
  draft,
  input: inputRef,
  autoGrow,
  // Called only from a click, long after setup, so the send path below may be declared later.
  submit: () => submit()
})

// ============================================================================
// The send path
// ============================================================================

const { submit, pressSend, sendVoiceDraft, handleKeydown, handleComposerKeydown } = useHomeSubmit({
  submitState,
  browserLanding: () => props.browserLanding,
  browserNavigate: props.browserNavigate,
  browserMode,
  browserNavigating,
  isHomeRoute,
  isEmpty,
  conversationId,
  messages,
  draft,
  pendingAttachments,
  canSend,
  voiceSendBlocked,
  sendQueues,
  imageInputAccepted: () => modelScope.resolvedChoice.value?.binding.imageInput.accepted,
  homeRecommendationsEnabled,
  opening: openingSnapshot,
  push,
  workspace,
  dictation,
  history,
  choreography,
  stream: () => streamRef.value,
  input: () => inputRef.value,
  composer: () => composerRef.value,
  draftGhost: () => draftGhostRef.value,
  launchSendKey: () => composerEl.value?.launch(),
  autoGrow,
  collapseDraft,
  bubbleMaxWidth,
  measureLeavingHead,
  pinLeavingHead,
  resetBlankConversation,
  setConversationLoading,
  reportSubmitError
})

// ============================================================================
// Workspace: mode, profile, branches, approvals
// ============================================================================

const {
  hasHistory,
  branching,
  branchTo,
  canBranchFrom,
  selectMode,
  selectAgentProfile,
  pendingRunProfileName
} = useWorkspaceControls({
  workspace,
  messages,
  conversationId,
  history,
  onSubmitError: reportSubmitError
})

/** The gateway's requests as this conversation sees them: its own, another's, or external. */
const gatewayApprovals = computed(() =>
  [agentTools.pending.value, ...agentTools.queued.value]
    .filter((request) => request !== null)
    .map((request) => toGatewayApproval(request, conversationId.value))
)

const pendingGatewayOrigin = computed(() => gatewayApprovals.value[0]?.origin)

const activityTurns = computed(() => buildActivityTurns(messages.value))

/** The routed model's own limits from its effective binding; auto routing knows none. */
const modelLimits = computed(() => toHomeModelLimits(modelScope.resolvedChoice.value?.binding))

/** The assistant message of the turn in flight, if one is streaming. */
const streamingAssistant = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return last?.role === 'assistant' && last.status === 'streaming' ? last : undefined
})

/**
 * When the turn in flight began, for the run-status clock: Main's own stamp on the streaming
 * message, taken when it claimed the turn. It survives a reload mid-run, and a turn that waited in
 * the queue is timed from its claim, not from the click.
 */
const runStartedAt = computed(() => streamingAssistant.value?.createdAt)

/** The step the streaming assistant message is on, read off its parts. */
const runStep = computed(() => deriveRunStep(streamingAssistant.value?.parts))

const isThinkingActive = computed(() => {
  if (!isStreaming.value) return false
  const step = runStep.value
  return step.kind === 'waiting' || (step.kind === 'thinking' && !step.title)
})

const thinkingTicker = useThinkingTicker({
  active: isThinkingActive,
  locale
})

provide(homeMessageContextKey, {
  ...messageParts,
  attachPreviewProps,
  attachOpenLabel,
  thinkingVerb: thinkingTicker.activeVerb,
  thinkingLabel: thinkingTicker.activeLabel
})

function estimateTextTokens(text: string): number {
  if (!text) return 0
  let count = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code > 0x7f) count += 1
    else count += 0.25
  }
  return Math.ceil(count)
}

function estimateTranscriptTokens(allMessages: readonly ConversationMessage[]): number {
  let total = 0
  for (const msg of allMessages) {
    if (msg.content) total += estimateTextTokens(msg.content)
    if (msg.parts) {
      for (const part of msg.parts) {
        if (part.type === 'text' && part.text) total += estimateTextTokens(part.text)
        else if (part.type === 'reasoning' && part.text) total += estimateTextTokens(part.text)
      }
    }
  }
  return Math.max(1, total)
}

/**
 * Share of the routed model's window the request occupies.
 * Uses the provider-reported usage if available; otherwise estimates from the transcript so the
 * meter is present while answering (streaming) and on the first turn.
 */
const contextShare = computed(() => {
  const turn = lastReportedTurn(messages.value) as ConversationTurnMeta | undefined
  let occupancy = turn
    ? contextOccupancyTokens({
        inputTokens: turn.promptTokens ?? 0,
        outputTokens: turn.completionTokens ?? 0,
        totalTokens: turn.totalTokens ?? 0
      })
    : 0
  if (occupancy <= 0) {
    occupancy = estimateTranscriptTokens(messages.value)
  }
  return contextPercent(occupancy, modelLimits.value.contextWindow?.value ?? 128_000)
})
const contextWindowText = computed(() =>
  formatWindow(modelLimits.value.contextWindow?.value ?? 128_000)
)
const { showTurnMetrics, isTurnFooterResting } = useTurnMetrics(messages)

// ============================================================================
// Command layer
// ============================================================================

useHomeCommands({
  isHomeRoute,
  browserLanding: () => props.browserLanding,
  panelOpen,
  focusComposer: () => inputRef.value?.focus(),
  canSend: () => canSend.value || (dictation.active.value && !isStreaming.value),
  send: pressSend,
  isStreaming: () => isStreaming.value,
  stop: () => conversation.stop()
})
</script>

<template>
  <div
    ref="pageRef"
    class="HomePage"
    :class="{ conversing: !isEmpty }"
    :style="{ '--home-composer-height': composerClearance }"
  >
    <HomeTopBar
      v-if="!browserLanding"
      :title="conversationTitle"
      :panel-open="panelOpen"
      :turn="lastTurn"
      :message-count="messages.length"
      :project-name="currentProject?.name"
      :project-path="currentProject?.rootPath"
      :can-branch="hasHistory && !workspace.busy.value && !branching"
      :branching="branching"
      @toggle-panel="panelOpen = !panelOpen"
      @branch="branchTo({})"
    />

    <div class="HomePage-Split">
      <div ref="bodyRef" class="HomePage-Body">
        <TxGradualBlur
          v-if="!isEmpty"
          position="top"
          height="72px"
          :strength="2.5"
          curve="bezier"
          :z-index="4"
          class="HomePage-TopBlur"
        />
        <TxGradualBlur
          v-if="!isEmpty"
          position="bottom"
          height="calc(var(--home-composer-height, 112px) + 96px)"
          :strength="2.5"
          curve="bezier"
          :z-index="4"
          class="HomePage-BottomBlur"
        />
        <HomeMessageRail
          v-if="!isEmpty && !panelOpen"
          :items="messages"
          @navigate="streamRef?.scrollToIndex($event)"
        />
        <div class="HomePage-Center">
          <Transition name="home-head">
            <HomeEmptyHead
              v-if="isEmpty"
              ref="headEl"
              :browser-landing="browserLanding"
              :opening-enabled="homeRecommendationsEnabled"
              :phase="openingPhase"
              :text="openingText"
              :source="openingSource"
              :busy="openingBusy"
              :loading-label="pushLabels.openingLoading"
            />
          </Transition>

          <!-- Leave: the thread dissolves in place (absolute, out of layout)
               while the composer springs back to centre through it. -->
          <Transition name="home-stream">
            <TxConversationStream
              v-if="!isEmpty"
              ref="streamRef"
              :key="conversationId ?? 'draft'"
              class="HomePage-Stream"
              role="log"
              :items="streamItems"
              item-key="id"
              :streaming="isStreaming"
            >
              <template #item="{ item: message, index }">
                <!-- The voice clip waits where the message it may become will land. -->
                <div v-if="message.id === VOICE_DRAFT_ID" class="HomePage-StreamRow">
                  <div class="HomePage-VoiceRow">
                    <HomeVoiceDraft
                      v-if="dictation.clip.value"
                      :clip="dictation.clip.value"
                      :dictating="dictation.active.value"
                      :send-blocked="voiceSendBlocked"
                      @retry="dictation.recognizeClip()"
                      @send="sendVoiceDraft()"
                      @dismiss="dictation.dismissClip()"
                    />
                  </div>
                </div>
                <div v-else class="HomePage-StreamRow">
                  <HomeMessageRow
                    :message="message"
                    :entering="enteringMessages.has(message.id)"
                    :latest="index === messages.length - 1"
                    :streaming="isStreaming"
                    :compacting="isCompacting"
                    :resting="isTurnFooterResting(message)"
                    :branchable="canBranchFrom(message, index)"
                    :branching="branching"
                    :speak-state="speakStateOf(message)"
                    :show-metrics="showTurnMetrics"
                    @retry="conversation.retry()"
                    @regenerate="conversation.retry()"
                    @speak="toggleSpeak(message)"
                    @branch="branchTo({ messageId: message.id })"
                    @code-preview="showCodePreview"
                  />
                </div>
              </template>
            </TxConversationStream>
          </Transition>

          <HomePayloadModal />

          <div ref="composerGroupRef" class="HomePage-ComposerGroup">
            <!-- Main could not read this thread: nothing below is its state, so say so and offer
                 the read again rather than an empty stage that looks like a new conversation. -->
            <div v-if="workspace.loadError.value" class="HomePage-WorkspaceAlert" role="alert">
              <span class="i-ri-error-warning-line HomePage-ErrorIcon" aria-hidden="true" />
              <p class="HomePage-WorkspaceAlertText">
                {{ workspaceErrorText(workspace.loadError.value) }}
              </p>
              <button class="HomePage-RetryBtn" type="button" @click="workspace.reload()">
                {{ t('home.workspace.retry') }}
              </button>
            </div>

            <!-- An agent run waiting on the run gate (run id), apart from the tool gate below. -->
            <HomeRunApproval
              v-if="workspace.state.value?.pendingRun"
              :run="workspace.state.value.pendingRun"
              :profile-name="pendingRunProfileName"
              :deciding="workspace.runDecision.value"
              @approve="workspace.approveRun()"
              @reject="workspace.rejectRun()"
            />

            <!-- The agent cannot continue until this is answered. Keeping the card in the measured
                 composer stack reserves its full height while the transcript still scrolls behind it. -->
            <div v-if="agentTools.pending.value" class="HomePage-ConfirmSlot">
              <!-- Main attributed the request to its turn; one it could not is not this thread's. -->
              <p
                v-if="pendingGatewayOrigin && pendingGatewayOrigin !== 'current'"
                class="HomePage-ConfirmOrigin"
              >
                <span class="i-ri-information-line" aria-hidden="true" />
                <span>{{ t(`home.workspace.gateway.originNote.${pendingGatewayOrigin}`) }}</span>
              </p>
              <TxToolConfirmation
                :tool-name="agentTools.pending.value.tool"
                :summary="agentTools.pending.value.summary"
                :input="agentTools.pending.value.input"
                :risk="agentTools.pending.value.risk"
                :allow-label="t('home.toolAllow')"
                :deny-label="t('home.toolDeny')"
                :remember-label="t('home.toolRemember')"
                @approve="agentTools.approve($event.remember)"
                @deny="agentTools.deny($event.remember)"
              />
            </div>

            <Transition name="home-queue">
              <HomeWorkspaceQueue
                v-if="workspace.state.value && workspace.queue.value.length > 0"
                :items="workspace.queue.value"
                :status="workspace.state.value.status"
                :held="workspace.state.value.queueHeld"
                :limit="WORKSPACE_QUEUE_LIMIT"
                :pending="workspace.queuePending.value"
                :resuming="workspace.resuming.value"
                @action="workspace.queueAction"
                @update="workspace.updateQueued"
                @resume="workspace.resume()"
              />
            </Transition>

            <!-- An untouched Home has no stream for the voice clip to end: it waits here instead. -->
            <HomeVoiceDraft
              v-if="isEmpty && dictation.clip.value"
              class="HomePage-VoiceDraftDock"
              :clip="dictation.clip.value"
              :dictating="dictation.active.value"
              :send-blocked="voiceSendBlocked"
              @retry="dictation.recognizeClip()"
              @send="sendVoiceDraft()"
              @dismiss="dictation.dismissClip()"
            />

            <!-- Above the composer, not in the transcript: the turn's clock and current step while it
                 runs, and how full the context is. The meter's track sits ON the box's top border
                 (the dock is pulled down by the group's gap), inset by the corner radius so it rides
                 the straight edge. Both state what the page already knows. -->
            <div v-if="!isEmpty && (isStreaming || contextShare !== null)" class="HomePage-RunDock">
              <HomeRunStatus
                v-if="isStreaming"
                :started-at="runStartedAt"
                :step="runStep"
                :verb="thinkingTicker.activeLabel.value"
              />
              <HomeContextMeter
                v-if="contextShare !== null || isStreaming"
                class="HomePage-ContextMeter"
                :percent="contextShare ?? 0"
                :window-text="contextWindowText"
              />
            </div>

            <!-- The composer: the box, its beam and glow, the tray, the field and the tool row.
                 It owns the look; the page owns what a press does. -->
            <TuffAIComposer
              ref="composerEl"
              v-model:draft="draft"
              v-model:permission-mode="agentToolsMode"
              :placeholder="t(browserLanding ? 'browser.composerPlaceholder' : 'home.placeholder')"
              :attachments="pendingAttachments"
              :attach-open-label="attachOpenLabel"
              :attach-preview-props="attachPreviewProps"
              :input-disabled="browserNavigating"
              :dragover="isDragover"
              :live="isStreaming"
              :lifting="lifting"
              :beam-active="composerBeamActive"
              :dictation="dictation"
              :model="composerModel"
              :send-state="sendState"
              :send-queues="sendQueues"
              @input="autoGrow"
              @input-keydown="handleKeydown"
              @box-keydown="handleComposerKeydown"
              @paste="onPaste"
              @dragenter="onDragEnter"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
              @remove="removeAttachment"
              @files="addFiles"
              @send="pressSend"
              @stop="conversation.stop()"
              @mic="dictation.toggle()"
              @reset-approvals="resetRememberedApprovals"
            >
              <template #mode>
                <template v-if="browserLanding">
                  <TxButton
                    size="sm"
                    variant="flat"
                    :type="browserMode === 'browse' ? 'primary' : 'text'"
                    :aria-pressed="browserMode === 'browse'"
                    :disabled="pendingAttachments.length > 0 || browserNavigating"
                    icon="i-ri-global-line"
                    @click="browserMode = 'browse'"
                    >{{ t('browser.browse') }}</TxButton
                  >
                  <TxButton
                    size="sm"
                    variant="flat"
                    :type="browserMode === 'ask' ? 'primary' : 'text'"
                    :aria-pressed="browserMode === 'ask'"
                    :disabled="browserNavigating"
                    icon="i-ri-search-line"
                    @click="browserMode = 'ask'"
                    >{{ t('browser.ask') }}</TxButton
                  >
                </template>
                <HomeWorkspaceModeMenu
                  v-if="!browserLanding"
                  :mode="workspace.settings.value.mode"
                  :profile-id="workspace.settings.value.profileId"
                  :profiles="workspace.profiles.value"
                  :profiles-loading="workspace.profilesLoading.value"
                  :profile-saving="workspace.profileSaving.value"
                  :profiles-error="workspace.profilesError.value"
                  :branch-on-change="hasHistory"
                  :locked="workspace.busy.value || branching"
                  @select-chat="selectMode('chat')"
                  @select-agent="selectAgentProfile"
                  @toggle-profile="workspace.setProfileEnabled"
                  @load-profiles="workspace.loadProfiles()"
                />
              </template>
            </TuffAIComposer>

            <!-- The push card: the guide, or 「为你准备」. It enters once the composer has landed
                 and leaves with the greeting, pinned under the box and dissolving on its back as it
                 docks. The slot reserves the mode's tallest page (`pushSlotStyle`). -->
            <Transition
              name="home-card"
              appear
              appear-from-class="home-card-appear-from"
              appear-active-class="home-card-appear-active"
            >
              <HomePushCard
                v-if="isEmpty && homeRecommendationsEnabled"
                v-model:step="pushStep"
                :steps="pushSteps"
                :selected="pushSelected"
                :loading="pushSkeleton"
                :loading-rows="pushLoadingRows"
                :settling="pushSettling"
                :prev-label="pushLabels.prev"
                :next-label="pushLabels.next"
                :slot-style="pushSlotStyle"
                @select="choosePush"
              />
            </Transition>
            <slot v-if="browserLanding" name="browser-footer" />
          </div>
        </div>
      </div>

      <!--
        The slot is what animates, not the panel: the panel keeps its fixed width inside a
        narrowing, clipping box, so the rows slide out of view instead of reflowing every frame
        while the width interpolates.
      -->
      <Transition name="home-panel">
        <div v-if="panelOpen" class="HomePage-PanelSlot">
          <HomeSidePanel
            v-model:tab="panelTab"
            :messages="messages"
            :conversation-id="conversationId"
            :context="workspace.state.value?.context"
            :turn="lastTurn"
            :activity-turns="activityTurns"
            :limits="modelLimits"
            :gateway="gatewayApprovals"
            :pending-run="workspace.state.value?.pendingRun"
            :loading="workspace.loading.value"
            :code-tabs="codeTabs"
            :active-code-tab-id="activeCodeTabId"
            @locate="streamRef?.scrollToIndex($event)"
            @select-code-tab="selectCodeTab"
            @close-code-tab="closeCodeTab"
          />
        </div>
      </Transition>
    </div>

    <!-- The send lift: the sent text, lifted off the composer as its own bubble and sprung to its
         row (composables/send-lift). Idle it is hidden and holds nothing. -->
    <div ref="liftGhostRef" class="HomePage-SendLift" aria-hidden="true">
      <div ref="liftFillRef" class="HomePage-SendLiftFill" />
      <div ref="liftTextRef" class="HomePage-UserBubble HomePage-SendLiftText" />
    </div>

    <!-- Highlighting a passage in the transcript raises this over the last selected line. It sits
         on the page root, not in the scrolling column, so the column's own overflow cannot clip it. -->
    <!-- Mounted only while something is selected: a floating layer has no business
         existing, measuring or animating when there is no passage to act on. -->
    <TxSelectionActions
      v-if="passageSelection"
      ref="selectionBarRef"
      :selection="passageSelection"
      :actions="passageActions"
      :aria-label="t('home.selectionActions')"
      hide-prompt
      @action="runPassageAction"
    />

    <!-- File preview drawer for command-clicking file paths in conversation -->
    <HomeFilePreviewDrawer
      v-model:visible="fileDrawerVisible"
      :file-path="previewFilePath"
      :display-path="previewDisplayPath"
    />
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  /**
   * Shared by the animating slot and the panel inside it, so the two can never drift apart.
   * 360 rather than the original 280: the panel now carries five tabs and file paths, and 280
   * truncated both.
   */
  --home-panel-width: 360px;
  // Resolve against each lane's containing block, not the whole viewport: the right panel is a
  // real grid sibling and must reduce the transcript, confirmation and composer together.
  --home-chat-lane-width: min(720px, calc(100% - 64px));

  // ---------------------------------------------------------------------------
  // Layer scale. One rule governs it: the composer stack is the top layer and a
  // message is always one layer beneath it — mid-flight included. The send
  // animation's clone used to carry a hardcoded `z-index: 30` and flew OVER
  // the box it had just left.
  //
  // The values compete directly: nothing between here and them opens a
  // stacking context (`.HomePage-Center` is `position: relative` at `z-index:
  // auto`, `.HomePage-Body` only has `overflow`), so they have to be read off
  // one scale rather than picked per site.
  // ---------------------------------------------------------------------------
  --home-z-leaving: 0; // the stream and greeting dissolving on their way out
  --home-z-flight: 1; // the send flight's clone
  --home-z-topblur: 4; // gradual blur at the top of the conversation
  --home-z-bottomblur: 4; // gradual blur at the bottom of the conversation
  --home-z-topbar: 6; // top bar above blur and messages
  --home-z-composer: 8; // composer and pending confirmation — above every message
  --home-z-lift: 9;

  // The TuffIntelligence wheel the running state wears — the composer's live light and the send
  // key's stop-capsule ring (`composer/ComposerSendIsland.vue`) read the same stops, in oklch.
  --home-live-stops: #0894ff, #c959dd 27%, #ff2e54 52%, #ff9004 74%, #0894ff;

  // ---------------------------------------------------------------------------
  // TuffEx token bridge: every tuffex component under this surface renders in
  // the shell's design language. Colour flips with the shell tokens; the
  // components' `theme="auto"` handles the structural themes (shiki, mermaid).
  // ---------------------------------------------------------------------------
  --tx-color-primary: var(--shell-primary);
  --tx-color-danger: var(--shell-danger);
  // The shell has no success token; done states borrow the accent.
  --tx-color-success: var(--shell-primary);
  --tx-text-color-primary: var(--shell-text-primary);
  --tx-text-color-secondary: var(--shell-text-muted);
  --tx-text-color-placeholder: var(--shell-text-muted);
  --tx-border-color: var(--shell-border-strong);
  --tx-border-color-light: var(--shell-border);
  --tx-border-color-lighter: var(--shell-border);
  --tx-fill-color: var(--shell-surface);
  --tx-fill-color-light: var(--shell-surface);
  --tx-fill-color-lighter: var(--shell-surface);
  --tx-fill-color-darker: var(--shell-surface-2);
  --tx-fill-color-blank: var(--shell-bg);
  --tx-bg-color: var(--shell-bg);

  /**
   * Two columns: the top bar over the conversation, and the right panel beside both. The panel
   * spans the two rows, so it runs the full height and its own header sits level with the top
   * bar. `.HomePage-Split` dissolves into this grid instead of laying out a row of its own.
   */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  container-type: inline-size;
  // The top bar is pinned, so the page itself never scrolls — the body below it owns the overflow.
  overflow: hidden;
}

:deep(.HomeTopBar) {
  grid-column: 1;
  grid-row: 1;
  position: relative;
  z-index: var(--home-z-topbar);
}

/**
 * A wrapper in the markup only: its children are cells of the page grid. The body takes the
 * conversation column under the top bar; the panel slot takes the second column across both rows.
 */
.HomePage-Split {
  display: contents;
}

.HomePage-PanelSlot {
  display: flex;
  grid-column: 2;
  grid-row: 1 / -1;
  width: var(--home-panel-width);
  // Clips the fixed-width panel while the slot narrows, which is what keeps the rows from
  // re-wrapping on every frame of the animation.
  overflow: hidden;
}

@container (max-width: 720px) {
  // Under the conversation instead, across the full width: an implicit third row, so the second
  // column is left empty and collapses to nothing.
  .HomePage-PanelSlot {
    --home-panel-width: 100%;
    grid-column: 1 / -1;
    grid-row: 3;
    width: 100%;
    height: min(35vh, 300px);
    min-height: 160px;
    border-top: 1px solid var(--shell-border);
  }

  .HomePage-PanelSlot :deep(.HomeSidePanel) {
    min-width: 0;
    height: 100%;
    border-left: 0;
  }
}

/**
 * Matches the shell's own shedding vocabulary (`ShellChromeBar`): the same easing and roughly the
 * same duration, so opening this panel reads as the same kind of motion as collapsing the sidebar.
 * Opacity runs shorter than width so the contents are gone before the box finishes closing.
 */
.home-panel-enter-active,
.home-panel-leave-active {
  transition:
    width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.16s ease;
}

.home-panel-enter-from,
.home-panel-leave-to {
  width: 0;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .home-panel-enter-active,
  .home-panel-leave-active {
    transition: none;
  }
}

.HomePage-Body {
  grid-column: 1;
  grid-row: 2;
  // Without this the stream's 720px column would push the panel off-screen instead of narrowing.
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  position: relative;

  // When conversing, messages run all the way through to the top under HomeTopBar and TxGradualBlur.
  .HomePage.conversing & {
    grid-row: 1 / -1;
    overflow: hidden;
  }
}

.HomePage-TopBlur {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 72px;
  z-index: var(--home-z-topblur);
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--shell-bg) 80%, transparent) 0%,
    color-mix(in srgb, var(--shell-bg) 35%, transparent) 40%,
    transparent 100%
  );
}

.HomePage-BottomBlur {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--home-composer-height, 112px) + 96px);
  z-index: var(--home-z-bottomblur);
  pointer-events: none;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--shell-bg) 85%, transparent) 0%,
    color-mix(in srgb, var(--shell-bg) 60%, transparent) 35%,
    color-mix(in srgb, var(--shell-bg) 25%, transparent) 70%,
    transparent 100%
  );
}
.HomePage-Center {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  // Truly centered vertically; slight optical balance for the top bar without top-heavy bias.
  padding-bottom: 16px;
  // Anchors the floating composer in conversation, and the dissolving stream
  // while it leaves — the anchor must not vanish with the `conversing` class
  // mid-dissolve, so it lives here unconditionally.
  position: relative;

  .HomePage.conversing & {
    gap: 16px;
    justify-content: flex-start;
    height: 100%;
    min-height: 0;
    padding-bottom: 0;
  }
}

/**
 * Leaving a conversation: the thread drops out of layout instantly (so the
 * empty-state layout — and the composer FLIP measured against it — is final
 * from the first frame) and dissolves in place under the returning composer.
 */
.home-stream-leave-active {
  position: absolute;
  z-index: var(--home-z-leaving);
  inset: 0;
  /* Opacity only — animating a blur() radius re-rasters the whole transcript
     every frame, the exact stutter the send flight's no-blur rule exists to
     avoid (see animateSendFlight). */
  transition: opacity 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-leave-to {
  opacity: 0;
}

/* Opening a thread: the transcript breathes in while the composer docks. */
.home-stream-enter-active {
  transition: opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-enter-from {
  opacity: 0;
}

/** The stream component owns the scroll; this box only claims the flex space. */
.HomePage-Stream {
  flex: 1;
  width: 100%;
  min-height: 0;

  /**
   * The tail and back-to-bottom pill clear the measured composer stack. That stack grows when a
   * tool confirmation is pending, so neither the last tool row nor its status can sit underneath
   * an actionable card. `:deep` is required because both controls live inside the stream.
   */
  :deep(.tx-conversation-stream__scroller) {
    padding: 72px 0 calc(var(--home-composer-height, 112px) + 88px);
    box-sizing: border-box;
  }

  :deep(.tx-conversation-stream__pill) {
    z-index: 10;
    bottom: calc(var(--home-composer-height, 112px) + 32px);
  }
}

/** One container-relative lane shared by every virtualized message row and the composer stack. */
.HomePage-StreamRow {
  width: var(--home-chat-lane-width);
  min-width: 0;
  margin: 0 auto;
  padding-bottom: 20px;
  box-sizing: border-box;
}

/* The voice clip's row, on the message lane's right edge where the message it may become will land. */
.HomePage-VoiceRow {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* Above the composer on an untouched Home: the lane the messages will use, its right edge. */
.HomePage-VoiceDraftDock {
  width: var(--home-chat-lane-width, 100%);
  max-width: 100%;
}

/**
 * The status line and the context meter, as one block above the composer. Its bottom edge is the
 * meter's track, and the margin cancels the group's gap except for 4px, so the track rides above the
 * box rather than over its border: the border, which turns blue on focus, stays whole, and the 3px
 * focus ring around it stays clear of the track. It paints over the beam wrapper (`z-index: 2`) so
 * the beam's bloom never dims it.
 */
.HomePage-RunDock {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  // The clock, the step and the meter are one reading, not three cards: 4px holds them as a block
  // without the meter drifting away from the line it belongs to.
  gap: 4px;
  width: var(--home-chat-lane-width);
  min-width: 0;
  // Cancels the group's gap and then some, so the block sits ON the box's top edge instead of
  // floating a card-height above it: 4px is the gap left between the meter's track and the border.
  margin-bottom: calc(-1 * var(--home-group-gap) + 4px);
  pointer-events: none;
}

.HomePage-ContextMeter {
  // The box's corner radius: the track rides the straight part of the edge, not the curve.
  padding-inline: 24px;
  box-sizing: border-box;
}

/**
 * The blocking card stays in the floating composer stack instead of the transcript. Its height is
 * measured as real layout, so it remains reachable without covering the last running tool row.
 */
.HomePage-WorkspaceAlert {
  display: flex;
  gap: 10px;
  align-items: center;
  width: var(--home-chat-lane-width);
  min-width: 0;
  padding: 10px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-danger-soft);
  box-sizing: border-box;
  pointer-events: auto;
}

.HomePage-WorkspaceAlertText {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
}

/* Who asked: shown above the tool card when Main did not attribute the call to this thread. */
.HomePage-ConfirmOrigin {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 0 0 6px;
  padding: 6px 10px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-warning-soft);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
}

.HomePage-ConfirmSlot {
  width: var(--home-chat-lane-width);
  min-width: 0;
  animation: home-msg-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  pointer-events: auto;
}

/**
 * The send lift's bubble: fixed to the viewport so it can cross the whole pane, moved by
 * `transform` alone (`composables/send-lift`), and laid out once exactly as the landed bubble —
 * same typography, same widest width — so the swap to the real row is invisible. Hidden and empty
 * between sends.
 */
.HomePage-SendLift {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--home-z-lift);
  pointer-events: none;
  visibility: hidden;

  // Promoted only while a lift runs: a layer held between sends would be memory for nothing.
  &.is-active {
    visibility: visible;
    will-change: transform;
  }
}

/* The bubble's own material, faded in as it leaves the composer (opacity only: composited). */
.HomePage-SendLiftFill {
  position: absolute;
  inset: 0;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface-2);
  opacity: 0;
}

/* The message itself, typeset by `.HomePage-UserBubble`; its fill is the layer under it. */
.HomePage-UserBubble.HomePage-SendLiftText {
  position: relative;
  margin: 0;
  background: none;
}

.HomePage-ErrorIcon {
  flex: none;
  margin-top: 1px;
  color: var(--shell-danger);
}

.HomePage-RetryBtn {
  flex: none;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--shell-danger-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-danger);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;

  // The block itself is already `danger-soft`, so the hover has to go a step deeper to register.
  &:hover {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
  }
}

.HomePage-ComposerGroup {
  // Between the composer and the push card on the empty stage; the card's leave pins it there.
  --home-card-gap: 12px;
  // What the group's own `gap` is, so a child that overlaps the box below it can cancel exactly that.
  --home-group-gap: var(--home-card-gap);

  display: flex;
  flex-direction: column;
  gap: var(--home-group-gap);
  align-items: center;
  width: 100%;
  min-width: 0;
  // Above the dissolving stream while a conversation is being left, and above
  // the send animation's clone while a message is on its way up.
  position: relative;
  z-index: var(--home-z-composer);

  /**
   * Floats over the stream rather than sitting below it, so the transcript runs the full height of
   * the pane and scrolls under the composer.
   *
   * `pointer-events` is handed back only to the actionable confirmation and composer cards: the
   * group spans the full width, and its empty margins must not swallow transcript wheel events.
   */
  .HomePage.conversing & {
    position: absolute;
    right: 0;
    bottom: 20px;
    left: 0;
    --home-group-gap: 18px;
    gap: var(--home-group-gap);
    pointer-events: none;

    &:has(.HomeWorkspaceQueue) {
      --home-group-gap: 0px;
    }
  }
}

/* The greeting bows out as the first message lands, and — once the composer
   has sprung back to centre — materialises again out of a blur when a new
   conversation resets the stage. The enter delays are the sequencing: the box
   lands first (~0.42s in), then the logo resolves, then the card beneath. */
.home-head-leave-active {
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-head-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.98);
}

.home-head-enter-active {
  transition:
    opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.42s,
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.42s,
    filter 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.42s;
}

.home-head-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  filter: blur(8px);
}

/* The card returns a beat after the greeting once the composer has landed, and on a fresh page
   almost at once. One motion for the whole card — its rows are in place from the first frame, and
   its own rise-in stagger is off (`appear`), or it would run out of sight during the delay. */
.home-card-enter-active,
.home-card-appear-active {
  transition:
    opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-card-enter-active {
  transition-delay: 0.45s;
}

.home-card-appear-active {
  transition-delay: 0.08s;
}

.home-card-enter-from,
.home-card-appear-from {
  opacity: 0;
  transform: translateY(10px);
}

/* Out of flow the moment the leave starts: the group is bottom-anchored, and a
   card that kept its flow height would hold the composer high, then drop it in
   one visible snap when it unmounts mid-glide. Pinned to its old spot below the
   box instead, dissolving on its back as the box docks. Opacity and a nudge
   only: a blur this size would re-raster the whole card every frame of the send. */
.home-card-leave-active {
  position: absolute;
  top: calc(100% + var(--home-card-gap));
  left: 50%;
  transform: translateX(-50%);
  transition:
    opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-card-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* The queue card smoothly emerges from and tucks behind the composer box. */
@media (prefers-reduced-motion: no-preference) {
  .home-queue-enter-active {
    transition:
      opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .home-queue-leave-active {
    transition:
      opacity 0.2s cubic-bezier(0.4, 0, 1, 1),
      transform 0.2s cubic-bezier(0.4, 0, 1, 1);
  }
}

.home-queue-enter-from,
.home-queue-leave-to {
  opacity: 0;
  transform: translateY(28px) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .home-queue-enter-active,
  .home-queue-leave-active {
    transition: none;
  }
}

/* The gate: set on the composer, read by the send key's stop ring, and — because it is a
   registered number — transitionable, which is the whole fade. */
@property --home-glow-on {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

@keyframes home-msg-pop {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* A path named in the reply: dotted until hovered, solid while ⌘ is held (it opens on ⌘ click). */
:deep(.is-file-path) {
  color: var(--shell-primary);
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: pointer;

  &:hover {
    text-decoration-style: solid;
    background: color-mix(in srgb, var(--shell-primary) 10%, transparent);
  }
}

:deep(.is-command-path-clickable) {
  cursor: pointer !important;
  text-decoration: underline solid !important;
  text-underline-offset: 3px !important;
}

@media (prefers-reduced-motion: reduce) {
  .home-head-leave-active,
  .home-head-enter-active,
  .home-card-leave-active,
  .home-card-enter-active,
  .home-card-appear-active,
  .home-stream-leave-active,
  .home-stream-enter-active {
    transition: none;
  }
}
</style>

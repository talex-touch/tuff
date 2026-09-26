<script lang="ts" name="HomePage" setup>
import type { AiAttachment, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { ITuffIcon } from '@talex-touch/utils'
import type { ToolChartSpec } from '~/components/intelligence/ToolChartCard.vue'
import type {
  FormFieldValue,
  FormSpec,
  WidgetSpec
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { MessageSegment } from '~/modules/conversation/chain-steps'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { HomeOpeningPhase, HomeOpeningSource } from '~/modules/home-push/opening'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxBorderBeam } from '@talex-touch/tuffex/border-beam'
import { TxChainOfThought } from '@talex-touch/tuffex/chain-of-thought'
import { TxChoiceCard } from '@talex-touch/tuffex/choice-card'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSkeleton, useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { resetRemoteImagePolicy } from '@talex-touch/tuffex/stream-markdown'
import { TxCodeBlock, TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
import { TxToolCallCard } from '@talex-touch/tuffex/tool-call-card'
import { TxToolConfirmation } from '@talex-touch/tuffex/tool-confirmation'
import {
  CHART_RESULT_PREFIX,
  FORM_RESULT_PREFIX,
  WIDGET_RESULT_PREFIX
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { createRollbackSync } from '~/utils/rollback-sync'
import { useRoute, useRouter } from 'vue-router'
import AppLogo from '~/components/icon/AppLogo.vue'
import ToolChartCard from '~/components/intelligence/ToolChartCard.vue'
import ToolWidgetCard from '~/components/intelligence/ToolWidgetCard.vue'
import ToolFormCard from '~/components/intelligence/ToolFormCard.vue'
import { toMessageSegments } from '~/modules/conversation/chain-steps'
import { createLatestOnly } from '~/modules/conversation/latest-only'
import type { SendFlightHandle, SendLift } from '~/composables/useSendChoreography'
import {
  FLIGHT_IMPACT_MS,
  prefersReducedMotion,
  SCROLL_TWEEN_MS,
  useSendChoreography
} from '~/composables/useSendChoreography'
import {
  deriveRestoredTitle,
  findTitleExchange,
  generateConversationTitle,
  shouldGenerateTitle
} from '~/modules/conversation/conversation-title'
import {
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
} from '~/modules/conversation/conversation-error-display'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { useAgentTools } from '~/modules/conversation/useAgentTools'
import {
  createConversationId,
  useConversationHistory
} from '~/modules/conversation/useConversationHistory'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'
import { useReasoningEffort } from '~/modules/conversation/useReasoningEffort'
import { HOME_FEED_MAX_ITEMS } from '~/modules/home-push/feed'
import { createOpeningLeadNote } from '~/modules/home-push/opening'
import { useHomePush } from '~/modules/home-push/useHomePush'
import { modelFamilyIconFor } from '~/modules/intelligence/model-family-icons'
import { providerIconForId } from '~/modules/intelligence/provider-icons'
import { registerMainWindowCommandHandlers } from '~/modules/shortcuts/main-window-shortcuts'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import { useProjectStore } from '~/stores/projects'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import ComposerToolbar from './composer/ComposerToolbar.vue'
import { showDictationNotice } from './composer/dictation-notice'
import { deriveSendState, isAwaitingFirstToken } from './composer/send-state'
import { useComposerDictation } from './composer/useComposerDictation'
import HomeSidePanel from './HomeSidePanel.vue'
import HomeTopBar from './HomeTopBar.vue'

/**
 * Home empty state from artboard `JVvAr`, plus the in-place conversation from task
 * `08-04-home-conversation` R1.
 *
 * The empty state and the message stream share one route and one composer node — swapping the
 * composer between two branches would drop input focus on the very first send. Conversation state
 * lives in memory only; persistence, `/home/c/:id` and the sidebar history land in R2/R3.
 */
const { t } = useI18n()

const MAX_INPUT_HEIGHT = 200

const draft = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
/** Scroll behaviour (stick-to-bottom, follow, back-to-bottom pill) lives inside the stream now. */
const streamRef = ref<TxConversationStreamInstance | null>(null)
const composerRef = ref<HTMLElement | null>(null)
/** The tool row; `submit()` launches its send key at the press. */
const toolbarRef = ref<InstanceType<typeof ComposerToolbar> | null>(null)
/** The FLIP animates this — the composer *and* the push card under it travel as one body. */
const composerGroupRef = ref<HTMLElement | null>(null)
/** Measured before a send so the leaving greeting can be pinned in place. */
const headRef = ref<HTMLElement | null>(null)
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
/** A wrapped draft as it sat in the field, fading out while the lifted bubble's text fades in. */
const draftGhostRef = ref<HTMLElement | null>(null)
/**
 * The sent text is still on the composer (lifted, not yet clear of it): the empty field's
 * placeholder would read as a second text under it, so it waits.
 */
const lifting = ref(false)

const router = useRouter()
const route = useRoute()

const {
  resolvedChoice: resolvedModel,
  routing: modelRouting,
  ensureLoaded: ensureModelOptionsLoaded
} = useModelOptions()
/**
 * The reasoning effort: one global setting, read at every send, and the level the composer's model
 * pill shows for the model the next send pins (`pillLevel`: nothing on auto, D11-a).
 */
const { setting: reasoningEffortSetting, pillLevel: reasoningPillLevel } = useReasoningEffort()
/**
 * Loaded at mount rather than on first menu open, so the persisted selection resolves — and
 * the pill stops saying auto — before the user reaches for it.
 */
onMounted(() => {
  void ensureModelOptionsLoaded()
})

const conversation = useHomeConversation({
  // A getter, not a snapshot: switching model mid-conversation must apply to the next send.
  routing: () => modelRouting.value,
  // Likewise for Auto Context, which the settings page owns — each send reads its current value.
  autoContext: () => autoContext.value,
  identity: () => {
    const id = conversationId.value
    if (!id) throw new Error('HOME_CONVERSATION_ID_MISSING')
    return { conversationId: id, projectId: projectId.value }
  },
  // Read per send like routing, so a level picked mid-conversation applies to the next message; the
  // non-streaming fallback carries the same value.
  reasoningEffort: () => reasoningEffortSetting.value,
  // The Home opening, once it is the thread's first message, reaches the model on every turn as
  // this system note (`toProviderMessages`), worded in the reader's locale.
  leadNote: createOpeningLeadNote(t)
})
const { isCompacting, isEmpty, isStreaming, lastTurn, messages } = conversation

const panelOpen = ref(false)

/**
 * Whether this page is the one on screen. Read by the surface watcher below and by the composer's
 * commands, which an off-screen page must not offer as runnable.
 */
const isHomeRoute = computed(() => route.path === '/home' || route.path.startsWith('/home/c/'))

/**
 * Both pills read this: the pinned model's display name and provider icon when it resolves, the
 * routing label alone when it does not — auto keeps its text-only look.
 */
const modelPill = computed<{ label: string; icon: ITuffIcon | undefined }>(() => {
  const resolved = resolvedModel.value
  return resolved
    ? {
        label: resolved.displayName,
        icon:
          modelFamilyIconFor(resolved.model) ??
          providerIconForId(resolved.providerId, resolved.providerType)
      }
    : { label: t('home.modelName'), icon: undefined }
})

/** The composer's pill adds the reasoning level the next send runs at; the top bar's does not. */
const composerModel = computed(() => ({
  ...modelPill.value,
  effort: reasoningPillLevel.value ? t(reasoningLevelLabelKey(reasoningPillLevel.value)) : undefined
}))

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
  onNotice: (kind) =>
    showDictationNotice(kind, {
      t,
      openRecognitionSettings: () => void router.push('/setting/intelligence/capabilities'),
      openMicrophoneSettings: micSettingsAvailable
        ? () => void dictation.openMicrophoneSettings()
        : undefined
    })
})

// A plain send waits for dictation to finish; while it runs the send key means 「结束并发送」 (D10-d).
const canSend = computed(
  () => draft.value.trim().length > 0 && !isStreaming.value && !dictation.active.value
)

/** The send key's face (`composer/send-state.ts`), derived from state this page already owns. */
const sendState = computed(() =>
  deriveSendState({
    hasText: draft.value.trim().length > 0,
    streaming: isStreaming.value,
    awaitingFirstToken: isAwaitingFirstToken(messages.value.at(-1)),
    blocked: Boolean(agentTools.pending.value),
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
  if (!visible) void dictation.stop()
})

/**
 * The border beam (TuffEx `TxBorderBeam`) on the composer's own box.
 *
 * It runs on the untouched home screen only, where the field *is* the page's primary target and
 * the outward `pulse-outside` bloom is what says so. Once a transcript exists the box keeps its
 * plain border: static emphasis that never changes state is paint the border already carries.
 *
 * The running state is deliberately excluded — while a response streams the composer wears the
 * living glow on its own pseudo-elements, and two effects on one box fight for the same edge.
 */
const composerBeamActive = computed(() => isEmpty.value && !isStreaming.value)

/**
 * The opening message is the working title until the model summarises one (#969).
 *
 * Generation is once per conversation, after the first settled turn, and every failure keeps the
 * working title silently — the label is never worth an error surface. `generatedTitle` also carries
 * a stored custom title across restore, so the top bar agrees with the sidebar after a reload.
 */
const generatedTitle = ref<string | null>(null)
/**
 * Which conversation has a title call in flight — an id, not a boolean. This component instance is
 * reused across thread switches, so a flat flag set by conversation A would make conversation B's
 * settled turn skip its own generation window.
 */
let titleInFlightFor: string | null = null
const titleSequence = createLatestOnly()

/**
 * Every conversation-store write goes through here, in order.
 *
 * The settled-turn watcher and the title upgrade both persist, and the SDK does not promise write
 * ordering — a title upgrade holding an older message snapshot could land after a newer settled
 * turn and shrink the stored thread. Chaining makes the order the call order, and each writer
 * re-reads live state inside its queued turn so nothing stale is captured.
 */
let persistChain: Promise<void> = Promise.resolve()
function enqueuePersist(write: () => Promise<void>): Promise<void> {
  const next = persistChain.then(write, write)
  persistChain = next.catch(() => {})
  return next
}

const firstUserContent = computed(
  () => messages.value.find((message) => message.role === 'user')?.content
)
const conversationTitle = computed(() => generatedTitle.value ?? firstUserContent.value)

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

/**
 * Set by `submit` just before it sends: an explicit hand-off, not an
 * inference. A user message can also arrive programmatically — a form
 * submission calls `conversation.send` directly — and guessing "user message
 * ⇒ the composer will choreograph it" left those permanently hidden.
 */
let choreographedSend = false

watch(
  () => messages.value.length,
  (length, previous) => {
    // Consumed before ANY early return: a claim that survived reduced motion
    // (or a non-streaming append) used to latch, hijack the next programmatic
    // batch, and strand its rows at opacity 0 with nothing left to reveal them.
    const claimed = choreographedSend
    choreographedSend = false
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

/** At most one message reads at a time; starting another stops the current. */
const speaking = ref<{ id: string; state: 'loading' | 'speaking' } | null>(null)
let speakAudio: HTMLAudioElement | null = null
let speakToken = 0

function stopSpeaking(): void {
  speakToken += 1
  speakAudio?.pause()
  speakAudio = null
  speaking.value = null
}

async function toggleSpeak(message: ConversationMessage): Promise<void> {
  if (speaking.value?.id === message.id) {
    stopSpeaking()
    return
  }
  stopSpeaking()
  if (!message.content) return

  const token = ++speakToken
  speaking.value = { id: message.id, state: 'loading' }
  try {
    const result = await intelligenceSdk.ttsSpeak({ text: message.content })
    // The user may have toggled away while synthesis ran.
    if (token !== speakToken) return
    const audio = new Audio(result.audio)
    speakAudio = audio
    audio.onended = () => {
      if (token === speakToken) stopSpeaking()
    }
    await audio.play()
    if (token === speakToken) speaking.value = { id: message.id, state: 'speaking' }
  } catch (error) {
    if (token !== speakToken) return
    homeLog.warn('Read aloud failed', String(error))
    toast.error(t('home.speakFailed'))
    stopSpeaking()
  }
}

onBeforeUnmount(stopSpeaking)

function speakStateOf(message: ConversationMessage): 'idle' | 'loading' | 'speaking' {
  return speaking.value?.id === message.id ? speaking.value.state : 'idle'
}

/**
 * The message body, in the order the provider streamed it: each thinking span
 * its own block, each tool call its own card. Derived per render rather than
 * cached — `parts` grows in place on every delta.
 */
function segmentsOf(message: ConversationMessage): MessageSegment[] {
  return toMessageSegments(message.parts, message.status === 'streaming', {
    thinking: t('home.thinking'),
    interrupted: t('home.toolInterrupted')
  })
}

/**
 * Tool results carrying a chart spec render as a chart in the card's result
 * slot; everything else falls through to the card's own text rendering.
 */
function chartSpecOf(tool: AiToolCallPart): ToolChartSpec | null {
  const output = tool.output
  if (tool.status !== 'done' || !output?.startsWith(CHART_RESULT_PREFIX)) return null
  try {
    return JSON.parse(output.slice(CHART_RESULT_PREFIX.length)) as ToolChartSpec
  } catch {
    return null
  }
}

function formSpecOf(tool: AiToolCallPart): FormSpec | null {
  const output = tool.output
  if (tool.status !== 'done' || !output?.startsWith(FORM_RESULT_PREFIX)) return null
  try {
    return JSON.parse(output.slice(FORM_RESULT_PREFIX.length)) as FormSpec
  } catch {
    return null
  }
}

/**
 * A model-authored widget. No parse of the payload's *code* is attempted here —
 * only the envelope — because nothing this side could check would make running
 * it safer. The sandbox is what makes it safe.
 */
function widgetSpecOf(tool: AiToolCallPart): WidgetSpec | null {
  const output = tool.output
  if (tool.status !== 'done' || !output?.startsWith(WIDGET_RESULT_PREFIX)) return null
  try {
    const spec = JSON.parse(output.slice(WIDGET_RESULT_PREFIX.length)) as WidgetSpec
    return typeof spec?.source === 'string' && spec.source ? spec : null
  } catch {
    return null
  }
}

/** Ids of forms already answered this session — locks their cards. */
const submittedForms = reactive(new Set<string>())

/**
 * Half-typed form input, keyed by tool call id. The stream virtualizes rows
 * out of the DOM once they scroll far enough away, and a card component's own
 * state unmounts with it — this is what hands the draft back on remount.
 * Plain Map on purpose: it is only read when a card mounts.
 */
const formDrafts = new Map<string, Record<string, FormFieldValue>>()

/**
 * A form submission continues the conversation as a plain user message: the
 * model reads it like any other turn, so the loop needs no second channel.
 */
function submitForm(tool: AiToolCallPart, values: Record<string, unknown>): void {
  submittedForms.add(tool.id)
  // On the part itself so it persists with the thread: a reloaded
  // conversation must not re-offer a form that was already answered.
  tool.submitted = true
  formDrafts.delete(tool.id)
  const lines = Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`)
  draft.value = ''
  void conversation.send(`【${t('home.formSubmitted')}】\n${lines.join('\n')}`)
}

/**
 * The raw payload affordance is for builders: dev builds only, and even
 * there just a whisper of a toggle per widget. It opens a dialog with the
 * call rendered as highlighted JSON — the code block brings its own copy
 * button, so inspection and grabbing the payload are one gesture each.
 */
const showToolPayload = import.meta.env.DEV
const payloadFor = ref<AiToolCallPart | null>(null)

const payloadJson = computed(() => {
  const input = payloadFor.value?.input
  if (!input) return ''
  try {
    // Normalized pretty-print; the accumulator may hand over compact JSON.
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch {
    return input
  }
})

/**
 * The reader's manual open/collapse, keyed per thinking block. Held here rather
 * than in the chain component because streaming re-renders can recreate that
 * instance — state kept there dies mid-turn, which read as "clicking does
 * nothing". Keyed by segment rather than by message now that one turn can
 * carry several blocks.
 */
const chainOpen = reactive(new Map<string, boolean>())

/** Grows the composer with its content up to a cap, then scrolls — the usual chat affordance. */
function autoGrow(): void {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
}

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

/** The greeting as it stood before the stage flips to a conversation; `null` when there is none. */
interface LeavingHead {
  el: HTMLElement
  rect: DOMRect
}

/** Read before the reactive flip: once the thread is non-empty, the ref no longer points at it. */
function measureLeavingHead(): LeavingHead | null {
  const el = headRef.value
  return el ? { el, rect: el.getBoundingClientRect() } : null
}

/**
 * The leaving greeting must neither ride the new layout (it would teleport to the column top) nor
 * keep occupying it (it would shove the stream down, then snap it up when the fade ends): pin it
 * where it stood, out of flow. Both ways off the blank stage need it — a first send and opening a
 * stored thread.
 */
function pinLeavingHead(head: LeavingHead | null): void {
  if (!head?.el.isConnected || prefersReducedMotion()) return
  const host = head.el.parentElement?.getBoundingClientRect()
  if (!host) return
  head.el.style.position = 'absolute'
  head.el.style.top = `${Math.round(head.rect.top - host.top)}px`
  head.el.style.left = `${Math.round(head.rect.left - host.left)}px`
  // Only the measured offsets are inline; the layer rides the shared scale.
  head.el.classList.add('is-leaving')
}

async function submit(): Promise<void> {
  if (!canSend.value) return
  // The send key launches with the press — a click, Enter and the shortcut all pass here — so its
  // arrow leaves with the lifted message and the stop capsule grows as the reply starts.
  toolbarRef.value?.launch()

  const text = draft.value
  const attachments =
    pendingAttachments.value.length > 0 ? [...pendingAttachments.value] : undefined
  // The lift carries the typed text off the composer as its own bubble. A send with attachments
  // keeps the clone flight, which carries the whole row — the tray included — not the text alone.
  const input = inputRef.value
  // The conversation's first message: its lift and the dock take their time (LIFT_SCORE).
  const opening = isEmpty.value
  // The Home opening above the composer becomes this thread's first message — a finished one only:
  // one still being written is dropped here and never joins (`takeLead`). Taken before anything
  // awaits, so no opening can start or land between the press and the append. The greeting keeps
  // showing what it showed until it has left (`openingHold`).
  let lead: string | undefined
  if (opening) {
    openingHold.value = {
      phase: openingPhase.value,
      text: openingText.value,
      source: openingSource.value
    }
    lead = push.takeLead() ?? undefined
  }
  const liftable = !attachments && !!input && !prefersReducedMotion()
  let lift: SendLift | null = null
  if (liftable && input) {
    // A lift still in the air lands first — before this one lays its bubble over the draft.
    choreography.invalidate()
    // Read before the draft clears: the bubble is laid over the text where it sits.
    lift = choreography.liftDraft({
      text,
      input,
      bubbleMaxWidth: bubbleMaxWidth(),
      draftGhost: draftGhostRef.value,
      opening,
      onClear: () => {
        lifting.value = false
      }
    })
    lifting.value = lift !== null
  }
  draft.value = ''
  // Ownership moves to the message: the tray empties, the bubbles keep the object URLs alive.
  pendingAttachments.value = []
  await nextTick()
  collapseDraft(lift !== null)

  // Allocated here rather than at setup so an untouched home screen never claims an id.
  conversationId.value ??= createConversationId()

  // Claim the incoming batch before it exists: the length watcher fires
  // during `send`'s flush, so the flag must already be up.
  choreographedSend = true

  // FLIP: the composer travels from centre stage to the bottom dock. Measured
  // around the reactive flip so the same node glides instead of teleporting.
  const composerEl = composerRef.value
  const first = composerEl?.getBoundingClientRect()
  const head = measureLeavingHead()

  const turn = conversation.send(text, attachments, { lead })
  // Appended in the same flush as the user's message, as the thread's first row.
  const firstRow = messages.value[0]
  const leadId = lead && firstRow?.role === 'assistant' ? firstRow.id : undefined
  // Sending from a scrolled-up position still lands you on your own message —
  // the stream only auto-follows readers already at the bottom.
  await nextTick()

  // If send() bailed on its own streaming guard nothing was appended, the
  // watcher never consumed the claim, and a latched claim would steal the
  // next batch's entrance. Clearing after the flush is free in the normal
  // path — the watcher already consumed it.
  choreographedSend = false
  // The greeting left in that flush, keeping the opening it showed; nothing is left to hold.
  openingHold.value = null

  pinLeavingHead(head)

  if (composerEl && first && !prefersReducedMotion()) {
    // The box docks as the bubble rises: the two part in opposite directions, together.
    const deltaY = first.top - composerEl.getBoundingClientRect().top
    if (Math.abs(deltaY) > 8) {
      choreography.playComposerFlip(deltaY, opening && lift ? { opening: true } : undefined)
    }
  }

  // The send choreography: space and strike as ONE gesture. The freshly
  // appended rows are already in the layout (hidden by `--enter`), so the
  // glide opens the room while the message is already on its way —
  // iMessage's zero-latency press.
  //
  // A lift took the stage at the top of `submit`, landing any lift still in
  // the air there. That landing resolved its impact, and the placeholder reveal
  // chained to it was stamped during the awaits since: a second bump here would
  // silence it and leave the earlier reply hidden until the entrance watchdog —
  // and would land this send's own lift.
  if (!liftable) choreography.invalidate()
  const sentId = [...messages.value].reverse().find((message) => message.role === 'user')?.id
  const placeholderId =
    messages.value.at(-1)?.role === 'assistant' ? messages.value.at(-1)?.id : undefined

  if (prefersReducedMotion()) {
    // Only reachable when the preference flipped mid-send: put the lifted text down.
    lift?.cancel()
    streamRef.value?.scrollToBottom()
    await turn
    return
  }

  void streamRef.value?.tweenToBottom(SCROLL_TWEEN_MS)
  // The opening the reader already read above the composer takes its place at the head of the
  // thread as the greeting leaves, before the lifted message lands under it. The append watcher
  // hid it with the rest of the claimed batch, and the send score below reveals only the message
  // and the placeholder. No knock: nothing sits above the first row.
  if (leadId) choreography.playEntrance(leadId, 0)
  let flight: SendFlightHandle | null = null
  if (lift) {
    if (sentId) flight = lift.fly(sentId)
    else lift.cancel()
  } else {
    // No lift (attachments, or one that could not be laid out): the clone flight carries the row,
    // so a claimed row is never left hidden for the watchdog to find.
    flight = sentId ? choreography.playSend(sentId, composerEl) : null
  }
  if (placeholderId) {
    // No knock of its own: the thread was just struck, and a second hit this
    // close would read as stutter rather than physics.
    const reveal = (): void => choreography.playEntrance(placeholderId, 0)
    if (flight) {
      void flight.impact.then(() => choreography.scheduleForCurrentSend(reveal, 80))
    } else {
      choreography.scheduleForCurrentSend(reveal, FLIGHT_IMPACT_MS + 80)
    }
  }
  await turn
}

/**
 * The send key, Enter and the send shortcut. While dictating they mean 「结束并发送」 (D10-d): the
 * session stops, and once its last words have landed in the draft they go out as an ordinary send.
 */
async function pressSend(): Promise<void> {
  if (dictation.active.value) {
    if ((await dictation.stop()) === 'inserted') await submit()
    return
  }
  await submit()
}

function handleKeydown(event: KeyboardEvent): void {
  // `isComposing` keeps Enter from cutting an IME candidate selection short.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void pressSend()
}

/**
 * Esc cancels a dictation and puts the draft back as it was before it started — from anywhere in
 * the composer: a click leaves focus on the microphone key, not in the field.
 */
function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !dictation.active.value) return
  event.preventDefault()
  dictation.cancel()
}

function resolveErrorTitle(code: string | undefined): string {
  if (code === CONVERSATION_ERROR_PROVIDER_UNAVAILABLE) return t('home.error.noProvider')
  if (code === CONVERSATION_ERROR_EMPTY_RESPONSE) return t('home.error.empty')
  return t('home.error.generic')
}

/**
 * Retrying a missing provider reruns the same failure forever, so that one case swaps the retry for
 * a way out. `/setting/intelligence/channels` is where a provider is actually enabled — the
 * intelligence settings page only cross-links to it.
 */
function isProviderUnavailable(code: string | undefined): boolean {
  return code === CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
}

function openProviderSettings(): void {
  void router.push('/setting/intelligence/channels')
}

// ============================================================================
// Composer attachments (memory-only: never in the provider payload, never persisted)
// ============================================================================

const pendingAttachments = ref<AiAttachment[]>([])

/**
 * Object URLs this surface created. Revoked wholesale on unmount rather than
 * per-message: the conversation is in-memory and keep-alive keeps this
 * component around, so the registry is bounded by the session, not leaked.
 */
const objectUrls = new Set<string>()

function toAttachment(file: File): AiAttachment {
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file)
    objectUrls.add(url)
    return { kind: 'image', id: crypto.randomUUID(), url, name: file.name }
  }
  return {
    kind: 'file',
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    mime: file.type
  }
}

function addFiles(files: File[]): void {
  // Allowed while a reply streams, like typing: only sending waits for the turn to end.
  if (files.length === 0) return
  pendingAttachments.value = [...pendingAttachments.value, ...files.map(toAttachment)]
}

function removeAttachment(id: string): void {
  const target = pendingAttachments.value.find((attachment) => attachment.id === id)
  if (target?.kind === 'image' && objectUrls.delete(target.url)) URL.revokeObjectURL(target.url)
  pendingAttachments.value = pendingAttachments.value.filter((attachment) => attachment.id !== id)
}

/** The files a paste carries — a copied picture arrives as one `image/png` file item. */
function pastedFiles(event: ClipboardEvent): File[] {
  const files: File[] = []
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

function onPaste(event: ClipboardEvent): void {
  const files = pastedFiles(event)
  if (files.length === 0) return
  // Keeps platform side text (a Finder-copied file pastes its name) out of the draft.
  event.preventDefault()
  addFiles(files)
}

/**
 * A picture pasted with the focus outside any field still lands in the composer: after a click on
 * the send button, on the thread or on nothing, ⌘V never reaches the textarea's own handler.
 * A paste into another field stays that field's; text pasted outside a field is dropped as before.
 */
function onPagePaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || !isHomeRoute.value) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return
  const files = pastedFiles(event)
  if (files.length === 0) return
  event.preventDefault()
  addFiles(files)
  inputRef.value?.focus()
}

window.addEventListener('paste', onPagePaste)
onBeforeUnmount(() => window.removeEventListener('paste', onPagePaste))

/** Enter/leave fire per descendant — only the pair count says "still inside". */
const dragDepth = ref(0)
const isDragover = computed(() => dragDepth.value > 0)

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
  if (!dragHasFiles(event)) return
  event.preventDefault()
  dragDepth.value += 1
}

function onDragOver(event: DragEvent): void {
  // Required — without it the browser refuses the drop.
  if (isDragover.value) event.preventDefault()
}

function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent): void {
  if (!isDragover.value) return
  event.preventDefault()
  dragDepth.value = 0
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

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
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
  // Pending knocks and reveals would otherwise fire against whatever mounts next.
  choreography.cancel()
})

const composerClearance = computed(() =>
  composerHeight.value > 0 ? `${Math.round(composerHeight.value)}px` : undefined
)

// ============================================================================
// Persistence
// ============================================================================

const homeLog = createRendererLogger('HomeConversation')
const history = useConversationHistory()
const projectStore = useProjectStore()

/**
 * Allocated on the first send, so an untouched home screen never writes an
 * empty row. Reactive because it also keys the stream instance: old stored
 * threads share counter-style message ids, and one keep-alive'd stream
 * carrying its height cache across them laid thread B out with thread A's
 * measurements. Draft → first persist does not change it (the id is minted
 * at send time), so the key flips only on real thread switches.
 */
const conversationId = ref<string | null>(null)
const projectId = ref<string | null>(null)
const currentProject = computed(() =>
  projectId.value ? (projectStore.projects.find((p) => p.id === projectId.value) ?? null) : null
)

watch(
  projectId,
  (id) => {
    projectStore.setActiveProjectId(id)
  },
  { immediate: true }
)

/**
 * Remote images in a reply are held back until the reader asks for them: an
 * image fetches with no click, so an unreviewed `src` reports their IP to
 * whoever wrote the markdown — which, for a reply built from pages the model
 * just read, is not the model. TuffEx carries no i18n, so the wording comes
 * from here.
 */
const markdownLabels = computed(() => ({
  blockedImageText: t('home.image.blocked'),
  loadImageOnceText: t('home.image.loadOnce'),
  allowSessionImagesText: t('home.image.allowSession'),
  copyTableText: t('home.table.copyTable'),
  copiedTableText: t('home.table.copiedTable')
}))

/**
 * Consent is per conversation. Carrying it into the next thread would widen it
 * without asking, and the reader has no way to notice that it happened.
 */
watch(conversationId, () => resetRemoteImagePolicy())

/**
 * A dictation belongs to the thread it started in: switching threads abandons it where it stands,
 * without writing the draft back. (A first send never trips this — it waits for dictation to end.)
 */
watch(conversationId, () => dictation.cancel({ restore: false }))

/**
 * Which navigation the watcher is currently serving. Two overlapping restores are not sequenced by
 * anything else, so a slower earlier load used to land after a faster later one and leave the URL
 * naming one thread while the view showed another (#826).
 */
const restoreSequence = createLatestOnly()

async function resetBlankConversation(nextProjectId: string | null): Promise<void> {
  conversationId.value = null
  projectId.value = nextProjectId
  choreography.invalidate()
  const composerEl = composerRef.value
  const first = composerEl?.getBoundingClientRect()
  conversation.reset()
  generatedTitle.value = null
  await nextTick()
  inputRef.value?.focus()
  if (composerEl && first && !prefersReducedMotion()) {
    const dy = first.top - composerEl.getBoundingClientRect().top
    if (Math.abs(dy) > 8) choreography.playComposerFlip(dy)
  }
}

/**
 * Restores the thread named by `/home/c/:id`, and resets to a blank one on plain `/home`.
 *
 * Watching the param rather than loading once on mount is what makes the sidebar work: navigating
 * between two stored conversations reuses this component instance, so mount never fires again.
 */
watch(
  () => route.params.id,
  async (id) => {
    const target = typeof id === 'string' ? id : null
    // Claimed before any await, so a plain /home navigation also invalidates a restore in flight -
    // otherwise it would land on top of the blank thread reset() just produced.
    const isCurrentRestore = restoreSequence.claim()
    if (!target) {
      await resetBlankConversation(projectStore.consumePendingProjectId())
      return
    }
    if (target === conversationId.value) return

    const restored = await history.load(target)
    // A newer navigation started while this load was in flight; it owns the view now.
    if (!isCurrentRestore()) return
    if (!restored) return
    conversationId.value = target
    projectId.value = restored.projectId
    // Opening a thread from the blank home docks the composer — the same
    // journey as a first send, so it gets the same measured spring instead
    // of teleporting. Thread-to-thread hops measure ~0 and stay still.
    const composerEl = composerRef.value
    const first = composerEl?.getBoundingClientRect()
    const head = measureLeavingHead()
    // A send still in the air lands before its thread is swapped out, rather than flying on to a row
    // that is leaving. Not before the same-thread return above: a first send's own navigation to its
    // new id passes through here and must leave its lift alone.
    choreography.invalidate()
    conversation.restore(restored.messages)
    // A stored title that differs from the opening message is a real one; the working-title
    // persist writes the opening message back, and treating that as custom would block
    // generation forever.
    generatedTitle.value = deriveRestoredTitle(
      restored.title,
      restored.messages.find((message) => message.role === 'user')?.content
    )
    // Wholesale replacement doesn't trip the stream's prepend anchoring, and keep-alive
    // reuses this instance — landing at the latest message needs an explicit call. The greeting
    // leaves the flow first, so the scroll lands against the stream's final height.
    await nextTick()
    pinLeavingHead(head)
    streamRef.value?.scrollToBottom()
    if (composerEl && first && !prefersReducedMotion()) {
      const dy = first.top - composerEl.getBoundingClientRect().top
      if (Math.abs(dy) > 8) choreography.playComposerFlip(dy)
    }
  },
  { immediate: true }
)

watch(
  () => projectStore.pendingProjectId,
  async (pendingProjectId) => {
    if (pendingProjectId === undefined || typeof route.params.id === 'string') return
    restoreSequence.claim()
    await resetBlankConversation(projectStore.consumePendingProjectId())
  }
)

// ============================================================================
// Home push: the opening line and the card under the composer
// ============================================================================

/**
 * The blank conversation's personal-assistant push (`modules/home-push`): a model-written opening
 * under the greeting, and a card under the composer — the two-page guide, or 「为你准备」 once there
 * is history.
 *
 * Set up after the thread watchers above: its immediate watcher reads `conversationId` (declared any
 * earlier it would hit the TDZ), and by now the route watcher has claimed the blank conversation's
 * project, so the first entry is already the right one. Only plain `/home` counts — `/home/c/:id` is
 * empty too while its thread loads, and must not pay for an opening it is about to replace.
 */
const push = useHomePush({
  active: () => route.path === '/home' && isEmpty.value && conversationId.value === null,
  projectId: () => projectId.value,
  // The opening takes the route the chat turns take — a local CLI there answers in ten-odd seconds,
  // so the template stands in meanwhile (`modules/home-push/opening.ts`).
  routing: () => modelRouting.value,
  // The pinned model resolves only once the model list has loaded (the mount-time load above), and
  // `modelRouting` reads as auto until then: the first opening after a launch waits for it.
  routingReady: () => ensureModelOptionsLoaded(),
  composer: {
    // The clipboard row: written and focused, never sent — the reader sees what would go out first.
    prefill: async (text) => {
      draft.value = text
      await nextTick()
      autoGrow()
      inputRef.value?.focus()
    },
    // A starter task: the ordinary send, lift included. Focused first, so the lift leaves from a
    // composer on screen and the keyboard stays where the conversation continues.
    send: async (text) => {
      draft.value = text
      await nextTick()
      autoGrow()
      inputRef.value?.focus()
      await submit()
    },
    // 「我自己说」
    focus: () => inputRef.value?.focus()
  }
})
const {
  mode: pushMode,
  steps: pushSteps,
  step: pushStep,
  selected: pushSelected,
  loading: pushLoading,
  loadingRows: pushLoadingRows,
  labels: pushLabels,
  choose: choosePush
} = push

/**
 * The opening as the greeting shows it. `submit` pins it for the one flush between taking the lead
 * and the greeting's leave: `takeLead` drops an opening still being written, and the greeting should
 * fade out with the words the reader saw rather than lose them a frame before it goes.
 */
const openingHold = shallowRef<{
  phase: HomeOpeningPhase
  text: string
  source: HomeOpeningSource | null
} | null>(null)
const openingPhase = computed(() => openingHold.value?.phase ?? push.opening.phase.value)
const openingText = computed(() => openingHold.value?.text ?? push.opening.text.value)
/** Keys the text: the model's opening taking the template's place is a swap, not an edit. */
const openingSource = computed(() =>
  openingHold.value ? openingHold.value.source : push.opening.source.value
)
/**
 * A screen reader waits out the skeleton and the stream, then reads what shows once it is whole:
 * the template as it stands in, and the model's opening again if it takes the template's place.
 */
const openingBusy = computed(
  () => openingPhase.value === 'pending' || openingPhase.value === 'streaming'
)

/**
 * The card's skeleton, held back and held on (`useDeferredLoading`): local reads that land inside
 * its delay never show one. Until they land the card stays out of sight rather than show rows that
 * are not final yet — on a cold start that is the guide, about to become 「为你准备」. Its slot keeps
 * the room either way.
 */
const pushSkeleton = useDeferredLoading(pushLoading)
const pushSettling = computed(() => pushLoading.value && !pushSkeleton.value)

/**
 * How many option rows the card's slot holds in the current mode: the guide's longest page, or a
 * full 「为你准备」. Paging the guide, the clipboard row arriving and rows replacing their skeleton
 * then never resize the slot — and the stage is centred on its whole height, so any of them would
 * otherwise move the composer. One- and two-column counts both, for `.HomePage-PushSlot`'s
 * container query to pick from.
 */
const pushSlotStyle = computed(() => {
  const options =
    pushMode.value === 'feed'
      ? HOME_FEED_MAX_ITEMS
      : Math.max(0, ...pushSteps.value.map((step) => step.options.length))
  return {
    '--home-push-rows-1': options,
    '--home-push-rows-2': Math.ceil(options / 2),
    '--home-push-pager': pushSteps.value.length > 1 ? 1 : 0
  }
})

/**
 * Fire-and-forget: the settled-turn persist above already wrote the working title, so the thread is
 * durable before the summary call even starts, and a second persist upgrades the label when the
 * call lands. Claimed against `titleSequence` so switching threads mid-call drops the result
 * instead of stamping it onto the wrong conversation.
 */
function maybeGenerateTitle(): void {
  // The first reply to the user — never the Home opening a thread can start with, which would
  // title the conversation after the greeting instead of what was asked.
  const firstAssistant = findTitleExchange(messages.value).firstAssistantContent
  const idAtStart = conversationId.value
  if (!idAtStart) return
  if (
    !shouldGenerateTitle({
      generatedTitle: generatedTitle.value,
      inFlight: titleInFlightFor === idAtStart,
      firstUserContent: firstUserContent.value,
      firstAssistantContent: firstAssistant
    })
  ) {
    return
  }
  const isCurrent = titleSequence.claim()
  titleInFlightFor = idAtStart
  void (async () => {
    try {
      const title = await generateConversationTitle(
        intelligenceSdk,
        firstUserContent.value ?? '',
        firstAssistant ?? '',
        {
          prompt: t('home.titleGen.prompt'),
          userLabel: t('home.titleGen.userLabel'),
          assistantLabel: t('home.titleGen.assistantLabel')
        }
      )
      if (!title || !isCurrent() || conversationId.value !== idAtStart) return
      generatedTitle.value = title
      // Queued behind any settled-turn write, and the messages are read inside the queued turn:
      // however late this lands, it stores the thread as it is then, never a shrunken snapshot.
      await enqueuePersist(async () => {
        if (conversationId.value !== idAtStart) return
        await history.persist(idAtStart, title, messages.value, projectId.value)
      })
    } catch (error) {
      // The working title is already on screen and persisted; a label upgrade may fail silently.
      homeLog.warn('Conversation title generation failed', String(error))
    } finally {
      if (titleInFlightFor === idAtStart) titleInFlightFor = null
    }
  })()
}

/**
 * Writes after every settled turn.
 *
 * Keyed on the streaming flag rather than on content: saving per delta would issue a full-thread
 * rewrite for every token.
 */
watch(
  () => isStreaming.value,
  async (streaming, wasStreaming) => {
    if (streaming || !wasStreaming || !conversationId.value) return
    try {
      await enqueuePersist(async () => {
        if (!conversationId.value) return
        await history.persist(
          conversationId.value,
          conversationTitle.value ?? '',
          messages.value,
          projectId.value
        )
      })
      // Landing on the conversation's own URL is what lets the sidebar and a reload return to it.
      if (route.params.id !== conversationId.value) {
        await router.replace(`/home/c/${conversationId.value}`)
      }
      maybeGenerateTitle()
    } catch (error) {
      // A watcher rejection is an unhandled promise nobody sees, and losing a thread silently is
      // worse than losing it loudly — the conversation stays on screen either way.
      homeLog.error('Failed to persist conversation', error)
    }
  }
)

// ============================================================================
// Command layer
// ============================================================================

/**
 * The composer's commands, registered while this page is alive.
 *
 * Their handlers are this component's state — the panel, the draft, the running turn — so they are
 * registered here rather than in the shell's list, which cannot reach any of it. Two consequences
 * worth stating: the rows disappear when the page unmounts, and every one of them is gated on the
 * Home route being visible, because the shell keeps this page alive while the user is in Settings
 * and an enabled-looking row that quietly toggles an off-screen panel is a lie.
 */
const disposeCommands = registerMainWindowCommandHandlers([
  {
    id: 'toggle-panel',
    enabled: () => isHomeRoute.value,
    run: () => {
      panelOpen.value = !panelOpen.value
    }
  },
  {
    id: 'focus-composer',
    enabled: () => isHomeRoute.value,
    run: () => inputRef.value?.focus()
  },
  {
    id: 'send',
    enabled: () =>
      isHomeRoute.value && (canSend.value || (dictation.active.value && !isStreaming.value)),
    run: () => pressSend()
  },
  {
    id: 'stop',
    enabled: () => isHomeRoute.value && isStreaming.value,
    run: () => conversation.stop()
  }
])

onBeforeUnmount(disposeCommands)
</script>

<template>
  <div
    ref="pageRef"
    class="HomePage"
    :class="{ conversing: !isEmpty }"
    :style="{ '--home-composer-height': composerClearance }"
  >
    <HomeTopBar
      :title="conversationTitle"
      :model-name="modelPill.label"
      :model-icon="modelPill.icon"
      :panel-open="panelOpen"
      :turn="lastTurn"
      :message-count="messages.length"
      :project-name="currentProject?.name"
      :project-path="currentProject?.rootPath"
      @toggle-panel="panelOpen = !panelOpen"
    />

    <div class="HomePage-Split">
      <div class="HomePage-Body">
        <div class="HomePage-Center">
          <Transition name="home-head">
            <div v-if="isEmpty" ref="headRef" class="HomePage-Head">
              <AppLogo class="HomePage-Mark" />
              <h1 class="HomePage-Greeting">
                {{ t('home.greeting') }}
              </h1>
              <!-- The assistant speaks first. Three lines tall whatever it holds — skeleton, a
                   stream, or nothing — so the composer and the card below never move for it. -->
              <div class="HomePage-Opening" role="status" :aria-busy="openingBusy || undefined">
                <template v-if="openingPhase === 'pending'">
                  <span class="sr-only">{{ pushLabels.openingLoading }}</span>
                  <div class="HomePage-OpeningSkeleton" aria-hidden="true">
                    <TxSkeleton class="HomePage-OpeningBar" :height="10" :radius="5" />
                    <TxSkeleton class="HomePage-OpeningBar is-short" :height="10" :radius="5" />
                  </div>
                </template>
                <!-- The template stands in while a slow route writes; the model's opening
                     replaces it whole, the old words fading out first. -->
                <Transition v-else name="home-opening-swap" mode="out-in">
                  <p v-if="openingText" :key="openingSource ?? ''" class="HomePage-OpeningText">
                    {{ openingText }}
                  </p>
                </Transition>
              </div>
            </div>
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
              :items="messages"
              item-key="id"
              :streaming="isStreaming"
            >
              <template #item="{ item: message, index }">
                <div class="HomePage-StreamRow">
                  <div
                    class="HomePage-Message"
                    :class="[
                      message.role,
                      { 'HomePage-Message--enter': enteringMessages.has(message.id) }
                    ]"
                    :data-message-id="message.id"
                    :aria-busy="message.status === 'streaming'"
                  >
                    <template v-if="message.role === 'user'">
                      <TxAttachmentTray
                        v-if="message.attachments?.length"
                        class="HomePage-MsgAttachments"
                        :attachments="message.attachments"
                        :preview-title="t('home.attachPreview')"
                      />
                      <div class="HomePage-UserBubble">
                        {{ message.content }}
                      </div>
                      <!-- Only for what stayed local: a non-image attachment, or an image whose
                           bytes were already gone by the time the turn was sent. -->
                      <p
                        v-if="
                          (message.attachments?.length ?? 0) >
                          (message.modelAttachments?.length ?? 0)
                        "
                        class="HomePage-AttachHint"
                      >
                        {{ t('home.attachmentNotSent') }}
                      </p>
                      <TxMessageActions
                        class="HomePage-MsgActions is-resting"
                        :appear="false"
                        :copy-text="message.content"
                        :copy-label="t('home.copy')"
                        :copied-label="t('home.copied')"
                      />
                    </template>

                    <template v-else>
                      <!-- Reasoning and tool calls in the order they streamed:
                           each thinking span its own block, each call its own
                           card. One trail per turn used to fold everything into
                           a single box, which lost that order entirely.
                           Keyed by segment: the surrounding v-if/v-for branches
                           churn on every streaming delta, and unkeyed alignment
                           can recreate these mid-turn — taking the user's
                           open/collapse choice with it. -->
                      <template v-for="segment in segmentsOf(message)" :key="segment.id">
                        <!-- The label carries the span's own title, so the
                             block reads as that thought rather than as a
                             generic container. -->
                        <TxChainOfThought
                          v-if="segment.kind === 'reasoning'"
                          class="HomePage-Chain"
                          :steps="[segment.step]"
                          :streaming="message.status === 'streaming'"
                          :default-open="false"
                          :user-open="chainOpen.get(segment.id)"
                          :label="segment.step.title"
                          @toggle="chainOpen.set(segment.id, $event)"
                        />

                        <!-- Prose sits where it was spoken. Tested before the
                             widget branch below, which reads `segment.part` —
                             a text segment carries no call to read it from. -->
                        <TxStreamMarkdown
                          v-else-if="segment.kind === 'text'"
                          class="HomePage-Reply"
                          :content="segment.text"
                          :streaming="segment.streaming"
                          v-bind="markdownLabels"
                        />

                        <!-- Widgets embed as themselves — a form is a form, not
                             a tool log with a form inside. The machinery card
                             stays for tools without a face, and for the
                             running window before a widget's spec exists. -->
                        <div
                          v-else-if="
                            formSpecOf(segment.part) ||
                            chartSpecOf(segment.part) ||
                            widgetSpecOf(segment.part)
                          "
                          class="HomePage-WidgetBlock"
                        >
                          <ToolWidgetCard
                            v-if="widgetSpecOf(segment.part)"
                            :source="widgetSpecOf(segment.part)!.source"
                            :title="widgetSpecOf(segment.part)!.title"
                            :fallback="segment.part.output"
                          />
                          <ToolFormCard
                            v-else-if="formSpecOf(segment.part)"
                            :spec="formSpecOf(segment.part)!"
                            :submitted="
                              submittedForms.has(segment.part.id) || segment.part.submitted === true
                            "
                            :initial-values="formDrafts.get(segment.part.id)"
                            :submit-label="t('home.formSubmit')"
                            :reset-label="t('home.formReset')"
                            :required-hint="t('home.formRequired')"
                            :submitted-label="t('home.formDone')"
                            :select-placeholder="t('home.formSelect')"
                            @submit="submitForm(segment.part, $event)"
                            @change="formDrafts.set(segment.part.id, $event)"
                          />
                          <ToolChartCard
                            v-else
                            :spec="chartSpecOf(segment.part)!"
                            :animate="message.status === 'streaming'"
                          />

                          <!-- The raw call, for builders only: a whisper of a
                               toggle, and none at all outside dev builds. -->
                          <button
                            v-if="showToolPayload"
                            class="HomePage-PayloadBtn"
                            type="button"
                            @click="payloadFor = segment.part"
                          >
                            <span class="i-ri-braces-line" />
                            <span>{{ t('home.toolPayload') }}</span>
                          </button>
                        </div>
                        <TxToolCallCard
                          v-else
                          class="HomePage-Tool"
                          :tool-call="segment.part"
                          :retry-label="t('home.retry')"
                        />
                      </template>

                      <!-- A turn that never carried structured parts stays a
                           plain string; the loop above has nothing to render
                           for it. Guarded on `parts` rather than on segment
                           count so a turn whose parts are all tool calls does
                           not replay its text here as well. -->
                      <TxStreamMarkdown
                        v-if="!message.parts && message.content"
                        class="HomePage-Reply"
                        v-bind="markdownLabels"
                        :content="message.content"
                        :streaming="message.status === 'streaming'"
                      />

                      <!-- Pre-first-token wait: a thinking orb, rolled fresh per response. The send
                           key's `waiting` reads the same predicate, so the two cannot disagree. -->
                      <TxThinkingOrb
                        v-else-if="isAwaitingFirstToken(message)"
                        class="HomePage-Thinking"
                        :size="64"
                        :display-size="28"
                        :label="t('home.thinking')"
                      />

                      <!-- The provider is squeezing its context mid-turn; a
                           silent pause here read as a hang. -->
                      <p
                        v-if="message.status === 'streaming' && isCompacting"
                        class="HomePage-Compacting"
                        role="status"
                      >
                        <span class="i-ri-archive-2-line" aria-hidden="true" />
                        <span>{{ t('home.compacting') }}</span>
                      </p>

                      <div v-if="message.status === 'failed'" class="HomePage-Error" role="alert">
                        <span class="i-ri-error-warning-line HomePage-ErrorIcon" />
                        <div class="HomePage-ErrorBody">
                          <p class="HomePage-ErrorTitle">
                            {{ resolveErrorTitle(message.error?.code) }}
                          </p>
                          <p v-if="message.error?.detail" class="HomePage-ErrorDetail">
                            {{ message.error.detail }}
                          </p>
                        </div>
                        <button
                          v-if="isProviderUnavailable(message.error?.code)"
                          class="HomePage-RetryBtn"
                          type="button"
                          @click="openProviderSettings"
                        >
                          {{ t('home.configureProvider') }}
                        </button>
                        <button
                          v-else-if="index === messages.length - 1"
                          class="HomePage-RetryBtn"
                          type="button"
                          @click="conversation.retry()"
                        >
                          {{ t('home.retry') }}
                        </button>
                      </div>

                      <!-- Surfaces out of a blur once the answer settles; the last
                           reply keeps it on show, older ones reveal on hover. -->
                      <TxMessageActions
                        v-if="message.status === 'complete'"
                        class="HomePage-MsgActions"
                        :class="{ 'is-resting': index !== messages.length - 1 }"
                        :copy-text="message.content"
                        :regenerable="index === messages.length - 1 && !isStreaming"
                        :speakable="!!message.content"
                        :speak-state="speakStateOf(message)"
                        :copy-label="t('home.copy')"
                        :copied-label="t('home.copied')"
                        :regenerate-label="t('home.regenerate')"
                        :speak-label="t('home.speak')"
                        :stop-speak-label="t('home.speakStop')"
                        @regenerate="conversation.retry()"
                        @speak="toggleSpeak(message)"
                      />
                    </template>
                  </div>
                </div>
              </template>
            </TxConversationStream>
          </Transition>

          <!-- The dev payload inspector: one dialog for whichever widget's
               toggle was clicked, highlighted JSON with its own copy button. -->
          <TxModal
            :model-value="payloadFor !== null"
            :title="`${payloadFor?.name ?? ''} · ${t('home.toolPayload')}`"
            width="640px"
            @update:model-value="payloadFor = null"
          >
            <TxCodeBlock
              class="HomePage-PayloadCode"
              lang="json"
              :code="payloadJson"
              :closed="true"
            />
          </TxModal>

          <div ref="composerGroupRef" class="HomePage-ComposerGroup">
            <!-- The agent cannot continue until this is answered. Keeping the card in the measured
                 composer stack reserves its full height while the transcript still scrolls behind it. -->
            <div v-if="agentTools.pending.value" class="HomePage-ConfirmSlot">
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

            <!-- The beam wraps rather than decorates: it draws on the composer's own edge, and
                 reads that edge's 24px radius off the element in its slot. -->
            <TxBorderBeam
              class="HomePage-ComposerBeam"
              size="pulse-outside"
              :active="composerBeamActive"
            >
              <div
                ref="composerRef"
                class="HomePage-Composer"
                :class="{
                  'is-dragover': isDragover,
                  'is-live': isStreaming,
                  'is-lifting': lifting
                }"
                @dragenter="onDragEnter"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
                @keydown="handleComposerKeydown"
              >
                <TxAttachmentTray
                  v-if="pendingAttachments.length"
                  class="HomePage-ComposerTray"
                  :attachments="pendingAttachments"
                  removable
                  :remove-label="t('home.attachRemove')"
                  :cancel-label="t('home.attachCancel')"
                  :preview-title="t('home.attachPreview')"
                  @remove="removeAttachment"
                />

                <!-- Read-only while dictating: the words land at the caret, and neither a keystroke
                     nor an IME can move the range under them. -->
                <textarea
                  ref="inputRef"
                  v-model="draft"
                  class="HomePage-Input"
                  rows="1"
                  :aria-label="t('home.placeholder')"
                  :placeholder="t('home.placeholder')"
                  :readonly="dictation.active.value"
                  @input="autoGrow"
                  @keydown="handleKeydown"
                  @paste="onPaste"
                />

                <!-- One family of 32px controls (`composer/`); the send key is an island that grows
                     into 「■ 停止」 and the microphone into the dictation capsule, neither moving a
                     neighbour. -->
                <ComposerToolbar
                  ref="toolbarRef"
                  v-model:permission-mode="agentToolsMode"
                  :model="composerModel"
                  :send-state="sendState"
                  :mic-state="dictation.state.value"
                  :mic-levels="dictation.levels.value"
                  :mic-elapsed-ms="dictation.elapsedMs.value"
                  :mic-outcome="dictation.outcome.value"
                  @files="addFiles"
                  @send="pressSend"
                  @stop="conversation.stop()"
                  @mic="dictation.toggle()"
                  @reset-approvals="resetRememberedApprovals"
                />

                <!-- A wrapped draft as it sat, fading out while the lifted bubble's own lines fade in
                     (~140ms); empty otherwise. -->
                <div class="HomePage-DraftGhost" aria-hidden="true">
                  <div ref="draftGhostRef" class="HomePage-DraftGhostText" />
                </div>
              </div>
            </TxBorderBeam>

            <!-- The push card: the guide, or 「为你准备」. It enters once the composer has landed
                 and leaves with the greeting, pinned under the box and dissolving on its back as it
                 docks. The slot reserves the mode's tallest page (`pushSlotStyle`). -->
            <Transition
              name="home-card"
              appear
              appear-from-class="home-card-appear-from"
              appear-active-class="home-card-appear-active"
            >
              <div v-if="isEmpty" class="HomePage-Push">
                <div class="HomePage-PushSlot" :style="pushSlotStyle">
                  <TxChoiceCard
                    v-model:step="pushStep"
                    class="HomePage-PushCard"
                    :class="{ 'is-settling': pushSettling }"
                    :steps="pushSteps"
                    :selected="pushSelected"
                    :loading="pushSkeleton"
                    :loading-rows="pushLoadingRows"
                    :columns="2"
                    :appear="false"
                    :prev-label="pushLabels.prev"
                    :next-label="pushLabels.next"
                    @select="choosePush"
                  />
                </div>
              </div>
            </Transition>
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
          <HomeSidePanel :messages="messages" @locate="streamRef?.scrollToIndex($event)" />
        </div>
      </Transition>
    </div>

    <!-- The send lift: the sent text, lifted off the composer as its own bubble and sprung to its
         row (composables/send-lift). Idle it is hidden and holds nothing. -->
    <div ref="liftGhostRef" class="HomePage-SendLift" aria-hidden="true">
      <div ref="liftFillRef" class="HomePage-SendLiftFill" />
      <div ref="liftTextRef" class="HomePage-UserBubble HomePage-SendLiftText" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  /**
   * Shared by the animating slot and the panel inside it, so the two can never drift apart.
   * 360 rather than the original 280: the panel now carries four tabs and file paths, and 280
   * truncated both.
   */
  --home-panel-width: 360px;
  // Resolve against each lane's containing block, not the whole viewport: the right panel is a
  // real flex sibling and must reduce the transcript, confirmation and composer together.
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
  --home-z-composer: 2; // composer and pending confirmation — above every message
  // The one exception: the send lift's bubble. It starts as the draft's own text, which lies on the
  // composer's surface, so it leaves from above the box rather than from behind it; its fill is
  // transparent while it still overlaps the box, so nothing of the composer is covered.
  --home-z-lift: 3;

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

  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  // The top bar is pinned, so the page itself never scrolls — the body below it owns the overflow.
  overflow: hidden;

  // The bridge above folds tuffex's four fills onto the shell's two surfaces, so `--tx-fill-color`
  // and `--tx-fill-color-light` are one colour — and the push card rests its options on the second
  // and hovers them onto the first: a hover with nothing to change to. Inside the card the ramp
  // runs a step further instead. The hover takes the shell's second surface, and the skeleton bars
  // the card draws on a resting row (`--tx-fill-color-darker`) a step past that, where they read.
  .HomePage-Push {
    --tx-fill-color: var(--shell-surface-2);
    --tx-fill-color-darker: var(--shell-border);
  }
}

/** Splits the area under the top bar between the conversation and the optional right panel. */
.HomePage-Split {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.HomePage-PanelSlot {
  display: flex;
  flex: none;
  width: var(--home-panel-width);
  // Clips the fixed-width panel while the slot narrows, which is what keeps the rows from
  // re-wrapping on every frame of the animation.
  overflow: hidden;
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
  flex: 1 1 auto;
  // Without this the stream's 720px column would push the panel off-screen instead of narrowing.
  min-width: 0;
  min-height: 0;
  overflow-y: auto;

  // The stream owns the scroll once a conversation exists, so the body must not scroll too.
  .HomePage.conversing & {
    overflow: hidden;
  }
}

.HomePage-Center {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  // Artboard lifts the block above true centre rather than bottom-weighting it like Codex. The lift
  // gives way in a short window before the stage has to scroll: at 600px the hero — greeting,
  // opening, composer and the guide's tallest page — takes all the height under the top bar.
  padding-bottom: clamp(0px, calc(100vh - 620px), 52px);
  box-sizing: border-box;
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

.HomePage-Head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  // The chat lane, like the composer under it: the opening wraps at this width. A centred flex item
  // would otherwise shrink to its content, and the opening's content is one long line.
  width: var(--home-chat-lane-width);
  min-width: 0;

  /* Pinned out of flow by `submit`, which measures the offsets; the layer is
     the scale's, so the greeting dissolves under the returning composer. */
  &.is-leaving {
    z-index: var(--home-z-leaving);
  }
}

/* 48px rather than the artboard's 64: the hero now carries the opening too, and has to fit a 600px
   window with the guide under the composer. */
.HomePage-Mark {
  width: 48px;
  height: 48px;
}

.HomePage-Greeting {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-display);
  font-weight: 600;
  // One display line, set tight for the same room.
  line-height: 1.2;
}

/**
 * The assistant's opening, under the greeting. Three lines tall whatever it holds — the skeleton, a
 * stream, the finished text or nothing — so text arriving never moves the composer or the card.
 *
 * 13px on a 20px line fits the longest opening the model may write (160 characters,
 * `sanitizeOpeningText`) in three lines of a full-width lane. A narrower lane clamps it with an
 * ellipsis rather than push the stage down; the whole text still joins the thread when sent.
 */
.HomePage-Opening {
  --home-opening-line: 20px;

  width: 100%;
  height: calc(3 * var(--home-opening-line));
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-body);
  line-height: var(--home-opening-line);
  text-align: center;
}

.HomePage-OpeningText {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

/* Bars where the opening's first two lines will be — most openings run to two. */
.HomePage-OpeningSkeleton {
  // On the page background the skeleton's own default, the lightest fill, disappears.
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  flex-direction: column;
  align-items: center;
}

/* A line box each, its bar centred in it (TxSkeleton's root is a flex column). */
.HomePage-OpeningBar {
  justify-content: center;
  width: 78%;
  height: var(--home-opening-line);

  &.is-short {
    width: 52%;
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* The words surface where the skeleton stood — streamed, replayed or the template alike. */
  .HomePage-OpeningText {
    animation: home-opening-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}

@keyframes home-opening-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* The template leaves before the model's opening surfaces where it stood. */
  .HomePage-OpeningText.home-opening-swap-leave-active {
    animation: home-opening-out 0.16s ease-in both;
  }
}

@keyframes home-opening-out {
  to {
    opacity: 0;
  }
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
    padding: 28px 0 calc(var(--home-composer-height, 112px) + 28px);
    box-sizing: border-box;
  }

  :deep(.tx-conversation-stream__pill) {
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

.HomePage-Message {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* All arrival physics deform from the bottom edge — where hits land and
     where bubbles rise from. The motion itself runs on WAAPI springs. */
  transform-origin: 50% 100%;

  /* Holds a freshly appended row invisible for the frame between render and
     its spring taking over; the animation's own opacity replaces this. */
  &.HomePage-Message--enter {
    opacity: 0;
  }

  &.user {
    align-items: flex-end;
  }

  &.assistant {
    align-items: flex-start;
  }
}

/**
 * The stand-in that flies from the composer to the landing row. It is a message,
 * so it obeys the message rule: one layer under the composer, which means the
 * bubble rises out from behind the box instead of sliding across its face.
 */
.HomePage-FlightClone {
  z-index: var(--home-z-flight);
}

.HomePage-MsgAttachments {
  max-width: 78%;
}

/**
 * The blocking card stays in the floating composer stack instead of the transcript. Its height is
 * measured as real layout, so it remains reachable without covering the last running tool row.
 */
.HomePage-ConfirmSlot {
  width: var(--home-chat-lane-width);
  min-width: 0;
  animation: home-msg-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  pointer-events: auto;
}

.HomePage-Chain,
.HomePage-Tool {
  width: 100%;
}

/** A widget stands on its own: one quiet frame, no tool-log chrome around it. */
.HomePage-WidgetBlock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface);
  box-sizing: border-box;
}

.HomePage-PayloadBtn {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  align-self: flex-start;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-secondary);
  }
}

.HomePage-PayloadCode {
  max-height: 420px;
  overflow: auto;
}

.HomePage-AttachHint {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.HomePage-UserBubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface-2);
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
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

/**
 * No fill on replies: in v2 the raised look comes from strokes, and body copy is not a
 * raised surface. The class now sits on TxStreamMarkdown — no `pre-wrap` here, markdown
 * owns its own whitespace; colour and size align the markdown body with the shell.
 */
.HomePage-Reply {
  width: 100%;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  word-break: break-word;
}

.HomePage-Thinking {
  margin: 2px 0;
}

.HomePage-Compacting {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin: 2px 0 0;
  color: var(--shell-text-muted);
  font-size: 12px;
  animation: home-compacting-pulse 1.6s ease-in-out infinite;
}

@keyframes home-compacting-pulse {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

.HomePage-MsgActions {
  margin-top: 2px;

  /* Older messages keep a quiet surface; the bar returns under the pointer. */
  &.is-resting {
    opacity: 0;
    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

.HomePage-Message:hover .HomePage-MsgActions.is-resting,
.HomePage-MsgActions.is-resting:focus-within {
  opacity: 1;
}

.HomePage-Error {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-danger-soft);
  box-sizing: border-box;
}

.HomePage-ErrorIcon {
  flex: none;
  margin-top: 1px;
  color: var(--shell-danger);
}

.HomePage-ErrorBody {
  flex: 1;
  min-width: 0;
}

.HomePage-ErrorTitle {
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
}

.HomePage-ErrorDetail {
  margin: 4px 0 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  word-break: break-word;
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
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  // The block itself is already `danger-soft`, so the hover has to go a step deeper to register.
  &:hover {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
  }
}

.HomePage-ComposerGroup {
  // Between the composer and the push card on the empty stage; the card's leave pins it there.
  --home-card-gap: 12px;

  display: flex;
  flex-direction: column;
  gap: var(--home-card-gap);
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
    gap: 18px;
    pointer-events: none;
  }
}

/**
 * The beam is a wrapper, so it owns the lane: the beam draws on its own border box and the composer
 * fills it. Keeping `--home-chat-lane-width` here alone is what stops the `100%` inside that token
 * from resolving against a shrink-to-fit parent.
 */
.HomePage-ComposerBeam {
  width: var(--home-chat-lane-width);
  min-width: 0;
}

.HomePage-Composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
  padding: 16px 16px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-2xl);
  background: var(--shell-bg);
  /* Always on, even while the background above it is opaque and hides it:
     gaining a backdrop layer mid-dock forces a compositor re-build that can
     flash for a frame — cheaper to keep the layer and fade the paint. */
  backdrop-filter: blur(20px) saturate(180%);
  /* Layered: a tight contact shadow plus a soft ambient one reads as lift
     without the smudge a single big blur gives. */
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
    0 8px 24px var(--shell-shadow);
  box-sizing: border-box;
  --home-glow-on: 0;
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    --home-glow-on 0.6s ease;

  &:focus-within {
    border-color: var(--shell-primary);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
      0 10px 30px var(--shell-shadow),
      0 0 0 3px color-mix(in srgb, var(--shell-primary) 10%, transparent);
  }

  /* While a response runs, the box wears the TuffIntelligence gradient as
     living light: a hairline rim in the frame edge plus a tight bloom around
     it, both cut from one conic wheel (oklch keeps the colour travel luminous
     instead of muddying between stops). The layers spin in opposite
     directions and breathe on co-prime periods, so no two moments align —
     weather, not a spinner. The layers are always present and gated by
     `--home-glow-on`, which is what lets the light fade in and out instead
     of snapping with the class. */
  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1.5px;
    background: conic-gradient(from var(--home-glow-angle) in oklch, var(--home-live-stops));
    pointer-events: none;
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  /* The bloom: a compact ring, blurred slightly less than it is thick, so the
     light stays a vivid band hugging the frame and dies within ~14px — wide
     low-alpha spreads curdle into pastel fog on a light surface. The radius
     grows with the inset so the corners stay concentric instead of pooling.
     `::before` paints under the box's children — the inward bleed lands
     beneath the glass, never over the text. */
  &::before {
    inset: -6px;
    border-radius: calc(var(--shell-radius-2xl) + 6px);
    padding: 8px;
    filter: blur(7px) saturate(1.05);
    opacity: calc(var(--home-glow-on) * var(--home-glow-alpha) * 0.45);
    animation:
      home-glow-spin 17s linear infinite reverse,
      home-glow-breathe 7.3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  &::after {
    /* The half-pixel blur melts the hairline into the frame edge — without it
       the ring reads as a sticker laid on top rather than light in the rim. */
    filter: blur(0.5px);
    opacity: calc(var(--home-glow-on) * var(--home-glow-alpha) * 0.62);
    animation:
      home-glow-spin 11s linear infinite,
      home-glow-rim 5.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  &.is-live {
    --home-glow-on: 1;
  }

  /**
   * Floating form. The fill drops to translucent so the always-on backdrop
   * blur has something to show — the swap rides the background transition,
   * so the material change is a fade, not a cut. The shadow deepens because
   * the box now has live content sliding underneath it rather than a flat
   * page.
   */
  .HomePage.conversing & {
    background: color-mix(in srgb, var(--shell-bg) 72%, transparent);
    box-shadow: 0 6px 24px var(--shell-shadow);
    pointer-events: auto;
  }

  /* Files hovering over the box: the border switches to an invitation. */
  &.is-dragover {
    border-style: dashed;
    border-color: var(--shell-primary);
  }
}

.HomePage-Input {
  width: 100%;
  max-height: 200px;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-md);
  line-height: 1.5;
  resize: none;
  // The focus indicator is promoted to the whole composer via `:focus-within`, so it outlines
  // what reads as the field instead of drawing a second ring inside the card.
  outline: none;
}

textarea.HomePage-Input:focus-visible {
  outline: none;
  box-shadow: none;
}

.HomePage-Input::placeholder {
  color: var(--shell-text-muted);
  // The way back in once a lifted send has cleared the box; the way out is instant (below).
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* The sent text is still lifting off the composer: an empty field's placeholder under it would read
   as two texts at once. */
.HomePage-Composer.is-lifting .HomePage-Input::placeholder {
  color: transparent;
  transition: none;
}

/**
 * A wrapped draft where it sat in the textarea (`fadeDraft`), fading out while the lifted bubble's
 * own lines fade in over it. Empty outside a send.
 */
.HomePage-DraftGhost {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

/* Typeset like `.HomePage-Input`, and like a textarea wraps, so the first frame is the draft. */
.HomePage-DraftGhostText {
  position: absolute;
  margin: 0;
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-md);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

/**
 * The push card's lane, and a query container: its slot reserves rows for the columns the card
 * actually lays out. The card's own sizes are compacted here — TxChoiceCard reads them from any
 * ancestor — so the guide's tallest page still fits a 600px window under the composer.
 */
.HomePage-Push {
  --tx-choice-card-pad: 6px;
  --tx-choice-card-label-line: 18px;
  --tx-choice-card-desc-line: 16px;

  container: home-push / inline-size;
  width: var(--home-chat-lane-width);
  min-width: 0;
}

/**
 * Holds the mode's tallest page (`pushSlotStyle`), so the card can shrink inside it — a shorter
 * page, fewer rows, rows replacing their skeleton — without the centred stage moving the composer.
 *
 * The arithmetic is TxChoiceCard's own box: 10px of block padding and a 2px gap in each option, 6px
 * between rows, and a head of 6px + a 20px title line + 10px, with a 24px pager and a 4px gap above
 * the title when there are pages to turn. Only the two text lines and the inset are variables; the
 * rest is restated here, so a change to the card's spacing shows up as a slot that no longer fits.
 */
.HomePage-PushSlot {
  --home-push-row: calc(
    20px + var(--tx-choice-card-label-line) + 2px + var(--tx-choice-card-desc-line)
  );
  --home-push-rows: var(--home-push-rows-1);
  --home-push-head: calc(36px + var(--home-push-pager) * 28px);
  --home-push-list: calc(var(--home-push-rows) * (var(--home-push-row) + 6px) - 6px);

  min-height: calc(2 * var(--tx-choice-card-pad) + var(--home-push-head) + var(--home-push-list));
}

/* TxChoiceCard turns to two columns at 480px of its content box, inside its two 6px insets. */
@container home-push (width >= 492px) {
  .HomePage-PushSlot {
    --home-push-rows: var(--home-push-rows-2);
  }
}

/* Rows that are not final, before the skeleton is due (`pushSettling`). */
.HomePage-PushCard.is-settling {
  visibility: hidden;
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

/* @property is what lets these interpolate — same trick as IntelligenceHeader. */
@property --home-glow-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

/* The breathing amplitude. Kept apart from `opacity` itself so the keyframes
   compose with the on/off gate instead of fighting it for the property. */
@property --home-glow-alpha {
  syntax: '<number>';
  inherits: false;
  initial-value: 1;
}

/* The gate: set on the composer, read by both pseudo layers, and — because it
   is a registered number — transitionable, which is the whole fade. */
@property --home-glow-on {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

@keyframes home-glow-spin {
  to {
    --home-glow-angle: 360deg;
  }
}

@keyframes home-glow-breathe {
  0%,
  100% {
    --home-glow-alpha: 0.62;
  }

  50% {
    --home-glow-alpha: 1;
  }
}

@keyframes home-glow-rim {
  0%,
  100% {
    --home-glow-alpha: 0.72;
  }

  50% {
    --home-glow-alpha: 1;
  }
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

@media (prefers-reduced-motion: reduce) {
  /* The watcher never marks rows under reduced motion; this guards a marked
     row against ever being stranded invisible if it does slip through. */
  .HomePage-Message.HomePage-Message--enter {
    opacity: 1;
  }

  .home-head-leave-active,
  .home-head-enter-active,
  .home-card-leave-active,
  .home-card-enter-active,
  .home-card-appear-active,
  .home-stream-leave-active,
  .home-stream-enter-active {
    transition: none;
  }

  /* The light holds still but stays on — the running state must survive. */
  .HomePage-Composer::before,
  .HomePage-Composer::after {
    animation: none;
  }

  .HomePage-Compacting {
    animation: none;
  }
}
</style>

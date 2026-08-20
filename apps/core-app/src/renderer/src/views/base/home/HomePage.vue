<script lang="ts" name="HomePage" setup>
import type { AiAttachment, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { ToolChartSpec } from '~/components/intelligence/ToolChartCard.vue'
import type {
  FormFieldValue,
  FormSpec,
  WidgetSpec
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { MessageSegment } from '~/modules/conversation/chain-steps'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxChainOfThought } from '@talex-touch/tuffex/chain-of-thought'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { TxModal } from '@talex-touch/tuffex/modal'
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
import {
  FLIGHT_IMPACT_MS,
  prefersReducedMotion,
  SCROLL_TWEEN_MS,
  useSendChoreography
} from '~/composables/useSendChoreography'
import {
  deriveRestoredTitle,
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
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import HomeModelMenu from './HomeModelMenu.vue'
import HomePermissionMenu from './HomePermissionMenu.vue'
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
/** The FLIP animates this — composer *and* quick pills travel as one body. */
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

const router = useRouter()
const route = useRoute()

const { selection: modelSelection, selectedModel } = useModelOptions()

const conversation = useHomeConversation({
  // A getter, not a snapshot: switching model mid-conversation must apply to the next send.
  routing: () => modelSelection.value,
  // Likewise for Auto Context, which the settings page owns — each send reads its current value.
  autoContext: () => autoContext.value
})
const { isCompacting, isEmpty, isStreaming, lastTurn, messages } = conversation

const panelOpen = ref(false)

/** The pill shows the pinned model when there is one, and the routing label when there is not. */
const modelLabel = computed(() => selectedModel.value ?? t('home.modelName'))

const canSend = computed(() => draft.value.trim().length > 0 && !isStreaming.value)

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
  composer: () => composerRef.value
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

const quickPills = [
  { icon: 'i-ri-file-search-line', key: 'searchFiles' },
  { icon: 'i-ri-translate-2', key: 'translateClipboard' },
  { icon: 'i-ri-folder-line', key: 'tidyDownloads' },
  { icon: 'i-ri-terminal-box-line', key: 'runScript' }
] as const

/** Grows the composer with its content up to a cap, then scrolls — the usual chat affordance. */
function autoGrow(): void {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
}

async function applyPill(key: string): Promise<void> {
  draft.value = t(`home.pill.${key}`)
  await nextTick()
  autoGrow()
  inputRef.value?.focus()
}

async function submit(): Promise<void> {
  if (!canSend.value) return

  const text = draft.value
  const attachments =
    pendingAttachments.value.length > 0 ? [...pendingAttachments.value] : undefined
  draft.value = ''
  // Ownership moves to the message: the tray empties, the bubbles keep the object URLs alive.
  pendingAttachments.value = []
  await nextTick()
  autoGrow()

  // Allocated here rather than at setup so an untouched home screen never claims an id.
  conversationId.value ??= createConversationId()

  // Claim the incoming batch before it exists: the length watcher fires
  // during `send`'s flush, so the flag must already be up.
  choreographedSend = true

  // FLIP: the composer travels from centre stage to the bottom dock. Measured
  // around the reactive flip so the same node glides instead of teleporting.
  const composerEl = composerRef.value
  const first = composerEl?.getBoundingClientRect()
  const headEl = headRef.value
  const headRect = headEl?.getBoundingClientRect()

  const turn = conversation.send(text, attachments)
  // Sending from a scrolled-up position still lands you on your own message —
  // the stream only auto-follows readers already at the bottom.
  await nextTick()

  // If send() bailed on its own streaming guard nothing was appended, the
  // watcher never consumed the claim, and a latched claim would steal the
  // next batch's entrance. Clearing after the flush is free in the normal
  // path — the watcher already consumed it.
  choreographedSend = false

  // The leaving greeting must neither ride the new layout (it would teleport
  // to the column top) nor keep occupying it (it would shove the stream down,
  // then snap it up when the fade ends): pin it where it stood, out of flow.
  if (headEl?.isConnected && headRect && !prefersReducedMotion()) {
    const host = headEl.parentElement?.getBoundingClientRect()
    if (host) {
      headEl.style.position = 'absolute'
      headEl.style.top = `${Math.round(headRect.top - host.top)}px`
      headEl.style.left = `${Math.round(headRect.left - host.left)}px`
      // Only the measured offsets are inline; the layer rides the shared scale.
      headEl.classList.add('is-leaving')
    }
  }

  if (composerEl && first && !prefersReducedMotion()) {
    const deltaY = first.top - composerEl.getBoundingClientRect().top
    if (Math.abs(deltaY) > 8) choreography.playComposerFlip(deltaY)
  }

  // The send choreography: space and strike as ONE gesture. The freshly
  // appended rows are already in the layout (hidden by `--enter`), so the
  // glide opens the room while the clone is already in the air — iMessage's
  // zero-latency press.
  choreography.invalidate()
  const sentId = [...messages.value].reverse().find((message) => message.role === 'user')?.id
  const placeholderId =
    messages.value.at(-1)?.role === 'assistant' ? messages.value.at(-1)?.id : undefined

  if (prefersReducedMotion()) {
    streamRef.value?.scrollToBottom()
    await turn
    return
  }

  void streamRef.value?.tweenToBottom(SCROLL_TWEEN_MS)
  const flight = sentId ? choreography.playSend(sentId, composerEl) : null
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

function handleKeydown(event: KeyboardEvent): void {
  // `isComposing` keeps Enter from cutting an IME candidate selection short.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void submit()
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
const fileInputRef = ref<HTMLInputElement | null>(null)

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
  if (files.length === 0 || isStreaming.value) return
  pendingAttachments.value = [...pendingAttachments.value, ...files.map(toAttachment)]
}

function removeAttachment(id: string): void {
  const target = pendingAttachments.value.find((attachment) => attachment.id === id)
  if (target?.kind === 'image' && objectUrls.delete(target.url)) URL.revokeObjectURL(target.url)
  pendingAttachments.value = pendingAttachments.value.filter((attachment) => attachment.id !== id)
}

function onFilePick(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  // Clearing lets the same file be picked twice in a row.
  input.value = ''
}

function onPaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items
  if (!items) return

  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (files.length === 0) return

  // Keeps platform side text (a Finder-copied file pastes its name) out of the draft.
  event.preventDefault()
  addFiles(files)
}

/** Enter/leave fire per descendant — only the pair count says "still inside". */
const dragDepth = ref(0)
const isDragover = computed(() => dragDepth.value > 0)

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
  if (isStreaming.value || !dragHasFiles(event)) return
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
 * Feeds the floating composer's measured height to the stream's bottom padding.
 *
 * Observed rather than computed from the textarea's `scrollHeight`: the composer also carries the
 * tool row and its own padding, and a wrapped tool row changes the total without the textarea
 * changing at all.
 */
let composerObserver: ResizeObserver | null = null

onMounted(() => {
  const element = composerRef.value
  if (!element || typeof ResizeObserver === 'undefined') return
  composerObserver = new ResizeObserver(([entry]) => {
    // Border-box, not contentRect: the clearance and the back-to-bottom pill
    // offset need the composer's *visual* height, padding and border included.
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

/**
 * Allocated on the first send, so an untouched home screen never writes an
 * empty row. Reactive because it also keys the stream instance: old stored
 * threads share counter-style message ids, and one keep-alive'd stream
 * carrying its height cache across them laid thread B out with thread A's
 * measurements. Draft → first persist does not change it (the id is minted
 * at send time), so the key flips only on real thread switches.
 */
const conversationId = ref<string | null>(null)

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
 * Which navigation the watcher is currently serving. Two overlapping restores are not sequenced by
 * anything else, so a slower earlier load used to land after a faster later one and leave the URL
 * naming one thread while the view showed another (#826).
 */
const restoreSequence = createLatestOnly()

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
      conversationId.value = null
      // Any half-played send choreography dies with the thread it animated.
      choreography.invalidate()
      // The reverse FLIP: leaving a conversation undocks the composer, and the
      // same node must glide from the bottom dock back to centre stage — the
      // mirror of the first-send journey, same duration, same easing.
      const composerEl = composerRef.value
      const first = composerEl?.getBoundingClientRect()
      conversation.reset()
      generatedTitle.value = null
      await nextTick()
      if (composerEl && first && !prefersReducedMotion()) {
        const dy = first.top - composerEl.getBoundingClientRect().top
        if (Math.abs(dy) > 8) choreography.playComposerFlip(dy)
      }
      return
    }
    if (target === conversationId.value) return

    const restored = await history.load(target)
    // A newer navigation started while this load was in flight; it owns the view now.
    if (!isCurrentRestore()) return
    if (!restored) return
    conversationId.value = target
    // Opening a thread from the blank home docks the composer — the same
    // journey as a first send, so it gets the same measured spring instead
    // of teleporting. Thread-to-thread hops measure ~0 and stay still.
    const composerEl = composerRef.value
    const first = composerEl?.getBoundingClientRect()
    conversation.restore(restored.messages)
    // A stored title that differs from the opening message is a real one; the working-title
    // persist writes the opening message back, and treating that as custom would block
    // generation forever.
    generatedTitle.value = deriveRestoredTitle(
      restored.title,
      restored.messages.find((message) => message.role === 'user')?.content
    )
    // Wholesale replacement doesn't trip the stream's prepend anchoring, and keep-alive
    // reuses this instance — landing at the latest message needs an explicit call.
    await nextTick()
    streamRef.value?.scrollToBottom()
    if (composerEl && first && !prefersReducedMotion()) {
      const dy = first.top - composerEl.getBoundingClientRect().top
      if (Math.abs(dy) > 8) choreography.playComposerFlip(dy)
    }
  },
  { immediate: true }
)

/**
 * Fire-and-forget: the settled-turn persist above already wrote the working title, so the thread is
 * durable before the summary call even starts, and a second persist upgrades the label when the
 * call lands. Claimed against `titleSequence` so switching threads mid-call drops the result
 * instead of stamping it onto the wrong conversation.
 */
function maybeGenerateTitle(): void {
  const firstAssistant = messages.value.find(
    (message) => message.role === 'assistant' && message.status === 'complete'
  )?.content
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
        await history.persist(idAtStart, title, messages.value)
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
        await history.persist(conversationId.value, conversationTitle.value ?? '', messages.value)
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
      :model-name="modelLabel"
      :panel-open="panelOpen"
      :turn="lastTurn"
      :message-count="messages.length"
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

                      <!-- Pre-first-token wait: a thinking orb, rolled fresh per response. -->
                      <TxThinkingOrb
                        v-else-if="
                          message.status === 'streaming' &&
                          !message.content &&
                          !segmentsOf(message).length
                        "
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

          <!-- Sits above the composer rather than inside the stream: the agent
               is blocked until this is answered, so it must stay in view even
               when the reader has scrolled away from the tail. -->
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
            <div
              ref="composerRef"
              class="HomePage-Composer"
              :class="{ 'is-dragover': isDragover, 'is-live': isStreaming }"
              @dragenter="onDragEnter"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
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

              <textarea
                ref="inputRef"
                v-model="draft"
                class="HomePage-Input"
                rows="1"
                :aria-label="t('home.placeholder')"
                :placeholder="t('home.placeholder')"
                @input="autoGrow"
                @keydown="handleKeydown"
                @paste="onPaste"
              />

              <div class="HomePage-ToolRow">
                <div class="HomePage-ToolLeft">
                  <input
                    ref="fileInputRef"
                    type="file"
                    multiple
                    class="HomePage-FileInput"
                    :aria-label="t('home.attach')"
                    @change="onFilePick"
                  />
                  <button
                    class="HomePage-RoundBtn"
                    type="button"
                    :aria-label="t('home.attach')"
                    @click="fileInputRef?.click()"
                  >
                    <span class="i-ri-add-line" />
                  </button>
                  <HomePermissionMenu
                    v-model:mode="agentToolsMode"
                    @reset="resetRememberedApprovals"
                  />
                </div>

                <div class="HomePage-ToolRight">
                  <div class="HomePage-ModelSlot">
                    <HomeModelMenu placement="top-end">
                      <template #trigger="{ open }">
                        <button
                          class="HomePage-ModelPill"
                          type="button"
                          :aria-label="t('home.model')"
                          :aria-expanded="open"
                        >
                          <span class="HomePage-ModelName">{{ modelLabel }}</span>
                          <span class="HomePage-ModelEffort">{{ t('home.effortHigh') }}</span>
                          <span class="i-ri-arrow-down-s-line" />
                        </button>
                      </template>
                    </HomeModelMenu>
                  </div>
                  <button
                    class="HomePage-RoundBtn borderless"
                    type="button"
                    :aria-label="t('home.voice')"
                  >
                    <span class="i-ri-mic-line" />
                  </button>
                  <button
                    v-if="isStreaming"
                    class="HomePage-SendBtn"
                    type="button"
                    :aria-label="t('home.stop')"
                    @click="conversation.stop()"
                  >
                    <span class="i-ri-stop-fill" />
                  </button>
                  <button
                    v-else
                    class="HomePage-SendBtn"
                    type="button"
                    :disabled="!canSend"
                    :aria-label="t('home.send')"
                    @click="submit"
                  >
                    <span class="i-ri-arrow-up-line" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Explicit duration: the pills stagger via child animations, so
                 the root has no transition of its own for Vue to time against. -->
            <Transition name="home-pills" appear :duration="{ enter: 1150, leave: 240 }">
              <div v-if="isEmpty" class="HomePage-Pills">
                <button
                  v-for="pill in quickPills"
                  :key="pill.key"
                  class="HomePage-QuickPill"
                  type="button"
                  @click="applyPill(pill.key)"
                >
                  <span :class="pill.icon" />
                  <span>{{ t(`home.pill.${pill.key}`) }}</span>
                </button>
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

  // ---------------------------------------------------------------------------
  // Layer scale. One rule governs it: the composer is the top layer and a
  // message is always one layer beneath it — mid-flight included. The send
  // animation's clone used to carry a hardcoded `z-index: 30` and flew OVER
  // the box it had just left.
  //
  // The four values compete directly: nothing between here and them opens a
  // stacking context (`.HomePage-Center` is `position: relative` at `z-index:
  // auto`, `.HomePage-Body` only has `overflow`), so they have to be read off
  // one scale rather than picked per site.
  // ---------------------------------------------------------------------------
  --home-z-leaving: 0; // the stream and greeting dissolving on their way out
  --home-z-flight: 1; // the send animation's in-air bubble clone
  --home-z-composer: 2; // the composer — above every message, always
  --home-z-confirm: 3; // pending-tool card: not a message, so it may sit higher

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
  gap: 30px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  // Artboard lifts the block above true centre rather than bottom-weighting it like Codex.
  padding-bottom: 52px;
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
  gap: 18px;
  align-items: center;

  /* Pinned out of flow by `submit`, which measures the offsets; the layer is
     the scale's, so the greeting dissolves under the returning composer. */
  &.is-leaving {
    z-index: var(--home-z-leaving);
  }
}

.HomePage-Mark {
  width: 64px;
  height: 64px;
}

.HomePage-Greeting {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-display);
  font-weight: 600;
}

/** The stream component owns the scroll; this box only claims the flex space. */
.HomePage-Stream {
  flex: 1;
  width: 100%;
  min-height: 0;

  /**
   * The tail clears the floating composer instead of ending underneath it, and the
   * back-to-bottom pill has to hover above that composer, not under it. Both are
   * driven by the measured composer height for the same reason the padding always
   * was: the textarea grows to 200px. `:deep` because these live inside the stream
   * component and scoped selectors would never reach them otherwise.
   */
  :deep(.tx-conversation-stream__scroller) {
    padding: 28px 0 calc(var(--home-composer-height, 112px) + 28px);
    box-sizing: border-box;
  }

  :deep(.tx-conversation-stream__pill) {
    bottom: calc(var(--home-composer-height, 112px) + 32px);
  }
}

/** Per-row column: same 720px lane as the composer, one row per virtualized item. */
.HomePage-StreamRow {
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
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
 * The pending-tool card floats with the composer rather than scrolling with the
 * transcript: the agent is blocked until it is answered, so it has to stay
 * reachable even when the reader has scrolled away.
 */
.HomePage-ConfirmSlot {
  position: absolute;
  animation: home-msg-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  right: 0;
  bottom: calc(var(--home-composer-height, 112px) + 28px);
  left: 0;
  z-index: var(--home-z-confirm);
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
  margin: 0 auto;
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
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
  // Above the dissolving stream while a conversation is being left, and above
  // the send animation's clone while a message is on its way up.
  position: relative;
  z-index: var(--home-z-composer);

  /**
   * Floats over the stream rather than sitting below it, so the transcript runs the full height of
   * the pane and scrolls under the composer.
   *
   * `pointer-events` is handed back only to the composer itself: the group spans the full width, and
   * left as-is its empty margins would swallow wheel events aimed at the messages behind them.
   */
  .HomePage.conversing & {
    position: absolute;
    right: 0;
    bottom: 20px;
    left: 0;
    pointer-events: none;
  }
}

.HomePage-Composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
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
    background: conic-gradient(
      from var(--home-glow-angle) in oklch,
      #0894ff,
      #c959dd 27%,
      #ff2e54 52%,
      #ff9004 74%,
      #0894ff
    );
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

/** The picker is reached through the "+" button; the input itself never shows. */
.HomePage-FileInput {
  display: none;
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
}

.HomePage-ToolRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.HomePage-ToolLeft,
.HomePage-ToolRight {
  display: flex;
  gap: 8px;
  align-items: center;
}

.HomePage-RoundBtn,
.HomePage-SendBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.HomePage-RoundBtn {
  width: 30px;

  &.borderless {
    border-color: transparent;
  }

  &:hover {
    background: var(--shell-surface);
  }
}

/** Keeps the composer's model pill from stretching in the tool row. */
.HomePage-ModelSlot {
  flex: none;
}

/**
 * Sits next to send rather than on the left: the model and effort are properties of the message
 * about to be sent, not of the composer's input affordances.
 */
.HomePage-ModelPill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--shell-border-strong);
  }

  .i-ri-arrow-down-s-line {
    color: var(--shell-text-muted);
  }
}

.HomePage-ModelName {
  color: var(--shell-text-secondary);
  font-weight: 500;
}

.HomePage-ModelEffort {
  color: var(--shell-text-muted);
}

.HomePage-SendBtn {
  width: 30px;
  border-color: transparent;
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  transition:
    transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover:not(:disabled) {
    opacity: 0.92;
    transform: scale(1.06);
  }

  &:active:not(:disabled) {
    transform: scale(0.94);
  }

  // Artboard `AHQQk`: an empty composer carries a neutral key, not a faded primary one — a
  // dimmed accent still reads as "the send button, but broken".
  &:disabled {
    background: var(--shell-surface-2);
    color: var(--shell-text-muted);
    cursor: not-allowed;
  }
}

.HomePage-Pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

/* The greeting bows out as the first message lands, and — once the composer
   has sprung back to centre — materialises again out of a blur when a new
   conversation resets the stage. The enter delays are the sequencing: the box
   lands first (~0.42s in), then the logo resolves, then the pills beneath. */
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

/* The quick pills dissolve on the composer's back as it docks, and return one
   by one — each pops in on its own beat rather than the row fading as a slab.
   The stagger lives on the children (the root wrapper has nothing to animate),
   which is why the Transition above carries an explicit duration. A fresh
   page starts almost immediately; the return after 「新建对话」 waits for the
   composer to land first. */
/* Out of flow the moment the leave starts: the group is bottom-anchored, and
   pills that kept their flow height would hold the composer ~50px high, then
   drop it in one visible snap when they unmount mid-glide. Pinned to their
   old spot below the box instead, dissolving on its back. */
.home-pills-leave-active {
  position: absolute;
  top: calc(100% + 18px);
  left: 50%;
  width: max-content;
  transform: translateX(-50%);
  transition:
    opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-pills-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
  filter: blur(6px);
}

.home-pills-enter-active .HomePage-QuickPill,
.home-pills-appear-active .HomePage-QuickPill {
  animation: home-pill-in 0.34s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@for $i from 1 through 4 {
  .home-pills-enter-active .HomePage-QuickPill:nth-child(#{$i}) {
    animation-delay: #{0.45 + $i * 0.07}s;
  }

  .home-pills-appear-active .HomePage-QuickPill:nth-child(#{$i}) {
    animation-delay: #{0.05 + $i * 0.07}s;
  }
}

@keyframes home-pill-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.94);
    filter: blur(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
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
  .home-pills-leave-active,
  .home-pills-enter-active,
  .home-stream-leave-active,
  .home-stream-enter-active {
    transition: none;
  }

  .home-pills-enter-active .HomePage-QuickPill,
  .home-pills-appear-active .HomePage-QuickPill {
    animation: none;
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

.HomePage-QuickPill {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 7px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--shell-border-strong);
    transform: translateY(-1px);
    box-shadow: 0 3px 10px var(--shell-shadow);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>

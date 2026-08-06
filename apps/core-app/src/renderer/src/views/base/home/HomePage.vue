<script lang="ts" name="HomePage" setup>
import type { AiAttachment, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { ToolChartSpec } from '~/components/intelligence/ToolChartCard.vue'
import type { FormFieldValue, FormSpec } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxChainOfThought } from '@talex-touch/tuffex/chain-of-thought'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
import { TxToolCallCard } from '@talex-touch/tuffex/tool-call-card'
import { TxToolConfirmation } from '@talex-touch/tuffex/tool-confirmation'
import {
  CHART_RESULT_PREFIX,
  FORM_RESULT_PREFIX
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppLogo from '~/components/icon/AppLogo.vue'
import ToolChartCard from '~/components/intelligence/ToolChartCard.vue'
import ToolFormCard from '~/components/intelligence/ToolFormCard.vue'
import { toChainSteps } from '~/modules/conversation/chain-steps'
import {
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
} from '~/modules/conversation/conversation-error-display'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { toast } from 'vue-sonner'
import { useAgentTools } from '~/modules/conversation/useAgentTools'
import {
  createConversationId,
  useConversationHistory
} from '~/modules/conversation/useConversationHistory'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { hasWindow } from '@talex-touch/utils/env'
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
const { isEmpty, isStreaming, lastTurn, messages } = conversation

const panelOpen = ref(false)

/** The pill shows the pinned model when there is one, and the routing label when there is not. */
const modelLabel = computed(() => selectedModel.value ?? t('home.modelName'))

const canSend = computed(() => draft.value.trim().length > 0 && !isStreaming.value)

/**
 * Working title until R2 generates one: the opening message is what the user themselves called the
 * conversation. Deliberately not truncated here — the top bar ellipsises on overflow, and a title
 * cut in the data layer would stay cut once R2 persists it.
 */
const conversationTitle = computed(
  () => messages.value.find((message) => message.role === 'user')?.content
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
watch(
  agentToolsMode,
  (mode, previous) => {
    // Main is already closed at startup, so the first read only has to push a mode that opens it.
    if (mode === 'off' && previous === undefined) return
    void agentTools.setMode(mode)
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

// ============================================================================
// Arrival physics — the iMessage collision, done as one system: every new
// message flies in on a damped spring and, at the moment it lands, knocks the
// thread above it upward in a decaying wave. Both curves are sampled offline
// because WAAPI has no spring primitive.
// ============================================================================

/**
 * Step response of a ζ=0.66 spring (one ~6% overshoot, then a settle): `x` is
 * the eased position 0→1 and `v` the normalized velocity, which drives the
 * jelly stretch — a bubble is longest while it moves fastest, and the brief
 * negative tail squashes it as the overshoot springs back.
 */
const SPRING = [
  { o: 0, x: 0, v: 0 },
  { o: 0.036, x: 0.046, v: 0.555 },
  { o: 0.071, x: 0.156, v: 0.869 },
  { o: 0.107, x: 0.3, v: 1 },
  { o: 0.143, x: 0.453, v: 1 },
  { o: 0.179, x: 0.6, v: 0.915 },
  { o: 0.214, x: 0.729, v: 0.782 },
  { o: 0.25, x: 0.836, v: 0.629 },
  { o: 0.286, x: 0.92, v: 0.476 },
  { o: 0.321, x: 0.981, v: 0.336 },
  { o: 0.357, x: 1.023, v: 0.216 },
  { o: 0.393, x: 1.048, v: 0.119 },
  { o: 0.429, x: 1.06, v: 0.046 },
  { o: 0.464, x: 1.063, v: -0.005 },
  { o: 0.5, x: 1.06, v: -0.038 },
  { o: 0.571, x: 1.043, v: -0.064 },
  { o: 0.643, x: 1.024, v: -0.057 },
  { o: 0.714, x: 1.01, v: -0.039 },
  { o: 0.786, x: 1.001, v: -0.02 },
  { o: 0.857, x: 0.997, v: -0.007 },
  { o: 0.929, x: 0.996, v: 0.001 },
  { o: 1, x: 1, v: 0 }
] as const

const SPRING_MS = 560
/** Where `x` first crosses its target — the impact that launches the wave. */
const SPRING_IMPACT_MS = 200

/**
 * Impulse response of a ζ=0.5 spring: how a resting row rings after being
 * hit from below — up fast, back through neutral, one small counter-swing.
 */
const IMPULSE = [
  { o: 0, y: 0 },
  { o: 0.042, y: 0.707 },
  { o: 0.083, y: 1 },
  { o: 0.125, y: 0.985 },
  { o: 0.167, y: 0.786 },
  { o: 0.208, y: 0.514 },
  { o: 0.25, y: 0.25 },
  { o: 0.292, y: 0.042 },
  { o: 0.333, y: -0.093 },
  { o: 0.375, y: -0.156 },
  { o: 0.417, y: -0.165 },
  { o: 0.458, y: -0.138 },
  { o: 0.5, y: -0.095 },
  { o: 0.542, y: -0.051 },
  { o: 0.583, y: -0.014 },
  { o: 0.625, y: 0.011 },
  { o: 0.708, y: 0.027 },
  { o: 0.792, y: 0.017 },
  { o: 0.875, y: 0.004 },
  { o: 1, y: 0 }
] as const

const IMPULSE_MS = 480

/**
 * Ids of messages whose entrance has not finished. The template renders them
 * at `opacity: 0` so the fresh row never flashes at rest before its WAAPI
 * spring takes over; ids leave the set when the animation settles, so a
 * virtualized remount (scrolling back up) stays still. Filled only while a
 * turn is streaming — restoring a stored thread never replays entrances.
 */
const enteringMessages = reactive(new Set<string>())

watch(
  () => messages.value.length,
  (length, previous) => {
    if (!isStreaming.value || prefersReducedMotion()) return
    const appended = messages.value.slice(previous ?? 0, length)
    for (const message of appended) enteringMessages.add(message.id)
    void nextTick(() => {
      for (const message of appended) {
        // The user's own message is animated by the send flight instead.
        if (message.role !== 'user') runEntrance(message.id)
      }
    })
  }
)

function messageElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)
}

/** Spring keyframes for a bubble rising `rise`px into place, jelly included. */
function arrivalKeyframes(rise: number, jelly: number): Record<string, string | number>[] {
  return SPRING.map(({ o, x, v }) => ({
    offset: o,
    transform:
      `translateY(${((1 - x) * rise).toFixed(2)}px) ` +
      `scale(${(1 - jelly * 0.5 * v).toFixed(4)}, ${(1 + jelly * v).toFixed(4)})`,
    opacity: Math.min(1, o / 0.18)
  }))
}

/** A reply surfaces from just below its resting place and nudges the thread. */
function runEntrance(id: string): void {
  const el = messageElement(id)
  if (!el) {
    enteringMessages.delete(id)
    return
  }
  // `backwards`, not `both`: the first keyframe covers the pre-start frame
  // (the `--enter` class covers the pre-animation render), and leaving no
  // forward fill means a finished entrance holds no composited state. The
  // hide class leaves at impact, while the animation still owns opacity —
  // never at the finish edge, where removal could flash.
  animateRaw(el, arrivalKeyframes(22, 0.04), {
    duration: SPRING_MS,
    easing: 'linear',
    fill: 'backwards'
  })
  window.setTimeout(() => {
    enteringMessages.delete(id)
    knockRows(el, 0.6)
  }, SPRING_IMPACT_MS)
}

/**
 * The collision itself: rows above the landing bubble ring like a chain of
 * sprung masses — nearer rows harder and sooner, each with a touch of squash
 * (origin at their bottom edge, where the hit lands). Amplitudes decay fast
 * enough that the wave dies inside four rows.
 */
function knockRows(origin: HTMLElement, strength: number): void {
  if (prefersReducedMotion()) return
  const rows = Array.from(origin.ownerDocument.querySelectorAll<HTMLElement>('[data-message-id]'))
  const index = rows.indexOf(origin)
  if (index <= 0) return

  const amplitudes = [9, 5.5, 3, 1.5]
  amplitudes.forEach((amplitude, order) => {
    const row = rows[index - 1 - order]
    const lift = amplitude * strength
    if (!row || lift < 0.75) return
    const squash = 0.032 * (lift / (amplitudes[0] ?? 9))
    animateRaw(
      row,
      IMPULSE.map(({ o, y }) => ({
        offset: o,
        transform:
          `translateY(${(-lift * y).toFixed(2)}px) ` +
          `scaleY(${(1 - squash * Math.max(0, y)).toFixed(4)})`
      })),
      { duration: IMPULSE_MS, delay: order * 42, easing: 'linear' }
    )
  })
}

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

function chainStepsOf(message: ConversationMessage) {
  return toChainSteps(message.parts, message.status === 'streaming')
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
  formDrafts.delete(tool.id)
  const lines = Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`)
  draft.value = ''
  void conversation.send(`【${t('home.formSubmitted')}】\n${lines.join('\n')}`)
}

/** A lone tool call renders as its own card; two or more become the timeline. */
function soloToolOf(message: ConversationMessage): AiToolCallPart[] {
  const steps = chainStepsOf(message)
  if (steps.length !== 1) return []
  const tools = (message.parts ?? []).filter(
    (part): part is AiToolCallPart => part.type === 'tool-call'
  )
  return tools.length === 1 ? tools : []
}

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
  conversationId ??= createConversationId()

  // FLIP: the composer travels from centre stage to the bottom dock. Measured
  // around the reactive flip so the same node glides instead of teleporting.
  const composerEl = composerRef.value
  const first = composerEl?.getBoundingClientRect()

  const turn = conversation.send(text, attachments)
  // Sending from a scrolled-up position still lands you on your own message —
  // the stream only auto-follows readers already at the bottom.
  await nextTick()

  if (composerEl && first && !prefersReducedMotion()) {
    const last = composerEl.getBoundingClientRect()
    const deltaY = first.top - last.top
    if (Math.abs(deltaY) > 8) {
      composerEl.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
        { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      )
    }
  }

  streamRef.value?.scrollToBottom()
  // One frame later: the virtualized spacers have settled, so the flight
  // measures true rects and the re-assert lands on the real bottom.
  requestAnimationFrame(() => {
    streamRef.value?.scrollToBottom()
    animateSendFlight(composerEl)
  })
  await turn
}

/**
 * The send flight: the fresh user bubble lifts off from the composer's
 * *visual* position (mid-FLIP transforms included via getBoundingClientRect),
 * sharpening out of a blur as it detaches, riding the same spring as every
 * other arrival — and the wave fires at the spring's impact moment, not at
 * animation end, so the thread above recoils exactly when the bubble lands.
 */
function animateSendFlight(composerEl: HTMLElement | null): void {
  const sent = [...messages.value].reverse().find((message) => message.role === 'user')
  if (!composerEl || prefersReducedMotion()) {
    if (sent) enteringMessages.delete(sent.id)
    return
  }
  const bubble = sent ? messageElement(sent.id) : null
  if (!sent || !bubble) {
    if (sent) enteringMessages.delete(sent.id)
    return
  }

  const deltaY = composerEl.getBoundingClientRect().top - bubble.getBoundingClientRect().top
  if (deltaY < 4) {
    enteringMessages.delete(sent.id)
    return
  }

  // Same fill discipline as `runEntrance`: backwards to cover the launch
  // frame, no forward fill left behind, hide class released at impact.
  animateRaw(
    bubble,
    SPRING.map(({ o, x, v }) => ({
      offset: o,
      transform:
        `translateY(${((1 - x) * deltaY).toFixed(1)}px) ` +
        `scale(${(1 - 0.05 * v).toFixed(4)}, ${(1 + 0.1 * v).toFixed(4)})`,
      filter: `blur(${(6 * Math.max(0, 1 - o / 0.3)).toFixed(1)}px)`,
      opacity: Math.min(1, 0.5 + o / 0.4)
    })),
    { duration: SPRING_MS, easing: 'linear', fill: 'backwards' }
  )

  // Launch recoil; composited additively so it stacks on the first-send FLIP
  // instead of replacing it.
  animateRaw(
    composerEl,
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.988)', offset: 0.35 },
      { transform: 'scale(1)' }
    ],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', composite: 'add' }
  )

  // A full-strength hit: the bubble arrives carrying the send's momentum.
  window.setTimeout(() => {
    enteringMessages.delete(sent.id)
    knockRows(bubble, 1)
  }, SPRING_IMPACT_MS)
}

/**
 * WAAPI through lib-agnostic parameter types: the DOM lib pinned by the
 * toolchain predates `filter` keyframes and additive `composite`, both of
 * which the runtime (Chromium 130+) supports.
 */
function animateRaw(
  el: HTMLElement,
  frames: Record<string, string | number>[],
  options: Record<string, string | number>
): Animation {
  return el.animate(
    frames as unknown as Parameters<HTMLElement['animate']>[0],
    options as unknown as Parameters<HTMLElement['animate']>[1]
  )
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
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
})

const composerClearance = computed(() =>
  composerHeight.value > 0 ? `${Math.round(composerHeight.value)}px` : undefined
)

// ============================================================================
// Persistence
// ============================================================================

const homeLog = createRendererLogger('HomeConversation')
const history = useConversationHistory()

/** Allocated on the first send, so an untouched home screen never writes an empty row. */
let conversationId: string | null = null

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
    if (!target) {
      conversationId = null
      conversation.reset()
      return
    }
    if (target === conversationId) return

    const restored = await history.load(target)
    if (!restored) return
    conversationId = target
    conversation.restore(restored)
    // Wholesale replacement doesn't trip the stream's prepend anchoring, and keep-alive
    // reuses this instance — landing at the latest message needs an explicit call.
    await nextTick()
    streamRef.value?.scrollToBottom()
  },
  { immediate: true }
)

/**
 * Writes after every settled turn.
 *
 * Keyed on the streaming flag rather than on content: saving per delta would issue a full-thread
 * rewrite for every token.
 */
watch(
  () => isStreaming.value,
  async (streaming, wasStreaming) => {
    if (streaming || !wasStreaming || !conversationId) return
    try {
      await history.persist(conversationId, conversationTitle.value ?? '', messages.value)
      // Landing on the conversation's own URL is what lets the sidebar and a reload return to it.
      if (route.params.id !== conversationId) {
        await router.replace(`/home/c/${conversationId}`)
      }
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
    class="HomePage"
    :class="{ conversing: !isEmpty }"
    :style="{ '--home-composer-height': composerClearance }"
  >
    <HomeTopBar
      :title="conversationTitle"
      :model-name="modelLabel"
      :panel-open="panelOpen"
      @toggle-panel="panelOpen = !panelOpen"
    />

    <div class="HomePage-Split">
      <div class="HomePage-Body">
        <div class="HomePage-Center">
          <Transition name="home-head">
            <div v-if="isEmpty" class="HomePage-Head">
              <AppLogo class="HomePage-Mark" />
              <h1 class="HomePage-Greeting">
                {{ t('home.greeting') }}
              </h1>
            </div>
          </Transition>

          <TxConversationStream
            v-if="!isEmpty"
            ref="streamRef"
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
                        (message.attachments?.length ?? 0) > (message.modelAttachments?.length ?? 0)
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
                    <!-- The trail of reasoning and tool calls, above the answer
                         it produced. Rendered from parts; a single step reads
                         better as the plain card the tool card already is. -->
                    <TxChainOfThought
                      v-if="chainStepsOf(message).length > 1"
                      class="HomePage-Chain"
                      :steps="chainStepsOf(message)"
                      :streaming="message.status === 'streaming'"
                      :default-open="false"
                      :label="t('home.chainOfThought')"
                    />
                    <TxToolCallCard
                      v-for="tool in soloToolOf(message)"
                      :key="tool.id"
                      class="HomePage-Tool"
                      :tool-call="tool"
                      :retry-label="t('home.retry')"
                    >
                      <template v-if="chartSpecOf(tool)" #result>
                        <ToolChartCard :spec="chartSpecOf(tool)!" />
                      </template>
                      <template v-else-if="formSpecOf(tool)" #result>
                        <ToolFormCard
                          :spec="formSpecOf(tool)!"
                          :submitted="submittedForms.has(tool.id)"
                          :initial-values="formDrafts.get(tool.id)"
                          :submit-label="t('home.formSubmit')"
                          :reset-label="t('home.formReset')"
                          :required-hint="t('home.formRequired')"
                          :submitted-label="t('home.formDone')"
                          :select-placeholder="t('home.formSelect')"
                          @submit="submitForm(tool, $event)"
                          @change="formDrafts.set(tool.id, $event)"
                        />
                      </template>
                    </TxToolCallCard>

                    <TxStreamMarkdown
                      v-if="message.content"
                      class="HomePage-Reply"
                      :content="message.content"
                      :streaming="message.status === 'streaming'"
                    />

                    <!-- Pre-first-token wait: a thinking orb, rolled fresh per response. -->
                    <TxThinkingOrb
                      v-else-if="message.status === 'streaming' && !chainStepsOf(message).length"
                      class="HomePage-Thinking"
                      :size="64"
                      :display-size="28"
                      :label="t('home.thinking')"
                    />

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

          <div class="HomePage-ComposerGroup">
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
          <HomeSidePanel :turn="lastTurn" :message-count="messages.length" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  // Shared by the animating slot and the panel inside it, so the two can never drift apart.
  --home-panel-width: 280px;

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

  .HomePage.conversing & {
    gap: 16px;
    justify-content: flex-start;
    height: 100%;
    min-height: 0;
    padding-bottom: 0;
    // Anchors the floating composer below.
    position: relative;
  }
}

.HomePage-Head {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
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
  z-index: 2;
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
  margin: 0 auto;
}

.HomePage-Chain,
.HomePage-Tool {
  width: 100%;
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
  /* Layered: a tight contact shadow plus a soft ambient one reads as lift
     without the smudge a single big blur gives. */
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
    0 8px 24px var(--shell-shadow);
  box-sizing: border-box;
  --home-glow-on: 0;
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
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
   * Floating form. The fill drops to translucent so the blur has something to do — an opaque
   * `--shell-bg` would render the backdrop filter invisible — and the shadow deepens because the
   * box now has live content sliding underneath it rather than a flat page.
   */
  .HomePage.conversing & {
    background: color-mix(in srgb, var(--shell-bg) 72%, transparent);
    backdrop-filter: blur(20px) saturate(180%);
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

/* The greeting bows out as the first message lands; it never re-enters mid-session. */
.home-head-leave-active {
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-head-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.98);
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

  .home-head-leave-active {
    transition: none;
  }

  /* The light holds still but stays on — the running state must survive. */
  .HomePage-Composer::before,
  .HomePage-Composer::after {
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

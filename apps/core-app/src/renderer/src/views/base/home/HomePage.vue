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
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { TxCodeBlock, TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
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
 * Step response of a ζ=0.62 spring (one ~8% overshoot, then a settle): `x` is
 * the eased position 0→1 and `v` the normalized velocity, which drives the
 * jelly stretch — a bubble is longest while it moves fastest, and the brief
 * negative tail squashes it as the overshoot springs back.
 */
const SPRING = [
  { o: 0, x: 0, v: 0 },
  { o: 0.036, x: 0.041, v: 0.538 },
  { o: 0.071, x: 0.139, v: 0.847 },
  { o: 0.107, x: 0.269, v: 0.985 },
  { o: 0.143, x: 0.409, v: 1 },
  { o: 0.179, x: 0.544, v: 0.934 },
  { o: 0.214, x: 0.667, v: 0.821 },
  { o: 0.25, x: 0.772, v: 0.685 },
  { o: 0.286, x: 0.858, v: 0.544 },
  { o: 0.321, x: 0.925, v: 0.412 },
  { o: 0.357, x: 0.974, v: 0.294 },
  { o: 0.393, x: 1.008, v: 0.195 },
  { o: 0.429, x: 1.029, v: 0.116 },
  { o: 0.5, x: 1.046, v: 0.012 },
  { o: 0.571, x: 1.041, v: -0.035 },
  { o: 0.643, x: 1.03, v: -0.046 },
  { o: 0.714, x: 1.017, v: -0.04 },
  { o: 0.821, x: 1.004, v: -0.021 },
  { o: 0.929, x: 0.999, v: -0.007 },
  { o: 1, x: 1, v: 0 }
] as const

const SPRING_MS = 410
/** Where `x` first crosses its target — the impact that launches the wave. */
const SPRING_IMPACT_MS = 161

/**
 * How a resting row rings after being hit from below. Not a raw spring
 * impulse: the onset is mass-shaped (quadratic-ish — a row accelerates, it
 * doesn't twitch), the crown at ~16% is round, sampling is dense through the
 * rise and peak so the linear-interpolated keyframes carry no corners, and
 * the counter-swing is a gentle −7% rather than a wobble.
 */
const IMPULSE = [
  { o: 0, y: 0 },
  { o: 0.05, y: 0.084 },
  { o: 0.1, y: 0.547 },
  { o: 0.14, y: 0.927 },
  { o: 0.18, y: 0.991 },
  { o: 0.22, y: 0.995 },
  { o: 0.27, y: 0.939 },
  { o: 0.32, y: 0.836 },
  { o: 0.38, y: 0.681 },
  { o: 0.45, y: 0.49 },
  { o: 0.52, y: 0.314 },
  { o: 0.6, y: 0.151 },
  { o: 0.68, y: 0.035 },
  { o: 0.76, y: -0.036 },
  { o: 0.84, y: -0.05 },
  { o: 0.92, y: -0.02 },
  { o: 1, y: 0 }
] as const

const IMPULSE_MS = 560

/**
 * The wave fires well *before* the arrival spring's first crossing: the
 * knocked rows' mass-shaped onset takes ~0.2×IMPULSE_MS to build, and the
 * lead is what makes their crest coincide with the landing — the rows read
 * as giving way under the approach, not as being slapped after it.
 */
const KNOCK_LEAD_MS = 110

/**
 * The send flight's own curve — a drop of liquid leaving the composer. Three
 * regimes, position- and velocity-continuous: a lazy jerk ramp (half the time
 * covers barely two fifths of the distance), a compressed rush where velocity
 * peaks just past the split (o≈0.58), and a soft capture — ~3% overshoot
 * gliding home slowly, so the landing reads as absorbed rather than slammed.
 * Baked offline like SPRING; `v` is normalized to its peak.
 */
const FLIGHT = [
  { o: 0, x: 0, v: 0 },
  { o: 0.1, x: 0.003, v: 0.023 },
  { o: 0.2, x: 0.025, v: 0.09 },
  { o: 0.28, x: 0.069, v: 0.177 },
  { o: 0.35, x: 0.134, v: 0.276 },
  { o: 0.41, x: 0.215, v: 0.379 },
  { o: 0.46, x: 0.304, v: 0.477 },
  { o: 0.5, x: 0.391, v: 0.563 },
  { o: 0.54, x: 0.492, v: 0.657 },
  { o: 0.58, x: 0.629, v: 0.982 },
  { o: 0.62, x: 0.791, v: 0.905 },
  { o: 0.66, x: 0.918, v: 0.612 },
  { o: 0.7, x: 0.994, v: 0.315 },
  { o: 0.74, x: 1.027, v: 0.102 },
  { o: 0.79, x: 1.032, v: -0.032 },
  { o: 0.85, x: 1.018, v: -0.063 },
  { o: 0.92, x: 1.004, v: -0.034 },
  { o: 1, x: 1, v: 0 }
] as const

const FLIGHT_MS = 460
/** The split — velocity peaks, the composer lets go, its recoil fires here. */
const FLIGHT_SPLIT_MS = 253
/** First crossing of the resting place — the strike lands here. */
const FLIGHT_IMPACT_MS = 324
/** How deep the bubble starts sunk into the composer while fused with it. */
const FLIGHT_SINK_PX = 8

/** The "make room" glide before the strike — fixed, however far away the reader was. */
const SCROLL_TWEEN_MS = 280

/** Stamps each send's choreography; a newer send silences the older one's pending beats. */
let sendSeq = 0

/**
 * Ids of messages whose entrance has not finished. The template renders them
 * at `opacity: 0` so the fresh row never flashes at rest before its WAAPI
 * spring takes over; ids leave the set when the animation settles, so a
 * virtualized remount (scrolling back up) stays still. Filled only while a
 * turn is streaming — restoring a stored thread never replays entrances.
 */
const enteringMessages = reactive(new Set<string>())

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
    if (!isStreaming.value || prefersReducedMotion()) return
    const appended = messages.value.slice(previous ?? 0, length)
    for (const message of appended) enteringMessages.add(message.id)
    const claimed = choreographedSend
    choreographedSend = false
    // The composer's own send runs the full glide-flight-placeholder score;
    // everything else (retry placeholders, form submissions) enters here.
    if (claimed && appended.some((message) => message.role === 'user')) return
    void nextTick(() => {
      for (const message of appended) {
        runEntrance(message.id, message.role === 'user' ? 0.8 : 0.6)
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
function runEntrance(id: string, strength = 0.6): void {
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
  animateRaw(el, arrivalKeyframes(26, 0.07), {
    duration: SPRING_MS,
    easing: 'linear',
    fill: 'backwards'
  })
  if (strength > 0) {
    window.setTimeout(() => knockRows(el, strength), SPRING_IMPACT_MS - KNOCK_LEAD_MS)
  }
  window.setTimeout(() => enteringMessages.delete(id), SPRING_IMPACT_MS)
}

/**
 * The collision itself: rows above the landing bubble ring like a chain of
 * sprung masses — nearer rows harder and sooner, farther rows later, slower
 * and duller, the way a real chain disperses. Pure translation: deformation
 * belongs to the incoming bubble; a neighbour that squashes while it lifts
 * reads as two motions fighting. Amplitudes die inside four rows.
 */
function knockRows(origin: HTMLElement, strength: number): void {
  if (prefersReducedMotion()) return
  const rows = Array.from(origin.ownerDocument.querySelectorAll<HTMLElement>('[data-message-id]'))
  const index = rows.indexOf(origin)
  if (index <= 0) return

  const amplitudes = [18, 12, 7, 3.5]
  amplitudes.forEach((amplitude, order) => {
    const row = rows[index - 1 - order]
    const lift = amplitude * strength
    if (!row || lift < 0.75) return
    // Promoted for the ring, released after: four rows composited at once is
    // fine, four rows promoted forever is memory.
    row.style.willChange = 'transform'
    const clear = (): void => {
      row.style.willChange = ''
    }
    const wave = animateRaw(
      row,
      IMPULSE.map(({ o, y }) => ({
        offset: o,
        transform: `translateY(${(-lift * y).toFixed(2)}px)`
      })),
      // Dispersion: each hop through the chain loses pace as well as height.
      { duration: Math.round(IMPULSE_MS * (1 + 0.15 * order)), delay: order * 42, easing: 'linear' }
    )
    void wave.finished.then(clear).catch(clear)
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
  // On the part itself so it persists with the thread: a reloaded
  // conversation must not re-offer a form that was already answered.
  tool.submitted = true
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
 * The cards a message renders in its body. A lone tool call shows whatever it
 * is; on a multi-step turn the trail carries the log, but calls that produced
 * a *widget* — a form, a chart — must still surface as the real thing: the
 * form the model believes is on screen cannot live only as a JSON line inside
 * a collapsed timeline.
 */
function toolCardsOf(message: ConversationMessage): AiToolCallPart[] {
  const solo = soloToolOf(message)
  if (solo.length > 0) return solo
  return (message.parts ?? []).filter(
    (part): part is AiToolCallPart =>
      part.type === 'tool-call' && (formSpecOf(part) !== null || chartSpecOf(part) !== null)
  )
}

/**
 * The reader's manual open/collapse per message. Held here rather than in the
 * chain component because streaming re-renders can recreate that instance —
 * state kept there dies mid-turn, which read as "clicking does nothing".
 */
const chainOpen = reactive(new Map<string, boolean>())

/**
 * A real trail (2+ steps) always shows. A lone step depends on what it is: a
 * thinking step is the turn's only record of its reasoning, so it stays after
 * the turn settles (collapsed — the reader chooses to look); a lone tool call
 * already renders as its own card, so a trail would say everything twice.
 * While streaming, a lone step of any kind shows so a turn whose only
 * activity is one live span never reads as a hang.
 */
function showChain(message: ConversationMessage): boolean {
  const steps = chainStepsOf(message)
  if (steps.length > 1) return true
  if (steps.length !== 1 || soloToolOf(message).length > 0) return false
  return steps[0]?.kind === 'thinking' || message.status === 'streaming'
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

  // The leaving greeting must neither ride the new layout (it would teleport
  // to the column top) nor keep occupying it (it would shove the stream down,
  // then snap it up when the fade ends): pin it where it stood, out of flow.
  if (headEl?.isConnected && headRect && !prefersReducedMotion()) {
    const host = headEl.parentElement?.getBoundingClientRect()
    if (host) {
      headEl.style.position = 'absolute'
      headEl.style.top = `${Math.round(headRect.top - host.top)}px`
      headEl.style.left = `${Math.round(headRect.left - host.left)}px`
      headEl.style.zIndex = '0'
    }
  }

  if (composerEl && first && !prefersReducedMotion()) {
    const deltaY = first.top - composerEl.getBoundingClientRect().top
    if (Math.abs(deltaY) > 8) flipComposer(deltaY)
  }

  // The send choreography: space and strike as ONE gesture. The freshly
  // appended rows are already in the layout (hidden by `--enter`), so the
  // flight's landing point is computable up front — the glide opens the room
  // while the clone is already in the air, iMessage's zero-latency press.
  const seq = ++sendSeq
  const placeholderId =
    messages.value.at(-1)?.role === 'assistant' ? messages.value.at(-1)?.id : undefined

  if (prefersReducedMotion()) {
    streamRef.value?.scrollToBottom()
    await turn
    return
  }

  void streamRef.value?.tweenToBottom(SCROLL_TWEEN_MS)
  const flight = animateSendFlight(composerEl)
  if (placeholderId) {
    // No knock of its own: the thread was just struck, and a second hit this
    // close would read as stutter rather than physics.
    const reveal = (): void => {
      if (seq === sendSeq) runEntrance(placeholderId, 0)
    }
    if (flight) {
      void flight.impact.then(() => window.setTimeout(reveal, 80))
    } else {
      window.setTimeout(reveal, FLIGHT_IMPACT_MS + 80)
    }
  }
  await turn
}

/**
 * The send flight, iMessage's own trick: a fixed-position CLONE of the bubble
 * flies from the composer to the bubble's *final* resting place — computed
 * against the make-room glide's own target — while the real bubble stays
 * hidden and the thread slides independently underneath. Decoupling flight
 * from scroll is what lets the drop leave the composer on press, with no
 * queueing behind the glide.
 *
 * No blur: per-frame `blur()` radius changes force a re-raster of the bubble
 * texture every frame, which is exactly the stutter this replaces. The jelly
 * stretch carries the speed instead — fast things deform, crisp.
 *
 * Beats fire off the animation's own clock (split → recoil, impact → knock,
 * finish → swap clone for the real row), read by one rAF watcher — wall-clock
 * timers drifted a frame or two under load and landed the knock after the eye
 * had already seen the touch-down.
 */
function animateSendFlight(composerEl: HTMLElement | null): { impact: Promise<void> } | null {
  const sent = [...messages.value].reverse().find((message) => message.role === 'user')
  const bail = (): null => {
    if (sent) enteringMessages.delete(sent.id)
    return null
  }
  if (!composerEl || prefersReducedMotion()) return bail()
  const bubble = sent ? messageElement(sent.id) : null
  if (!sent || !bubble) return bail()

  const host = pageRef.value
  if (!host) return bail()
  const scroller = host.querySelector<HTMLElement>('.tx-conversation-stream__scroller')
  const bubbleRect = bubble.getBoundingClientRect()
  // Where the bubble will sit once the glide lands: its current rect shifted
  // by the scroll still owed. The rows are already in their final layout
  // (hidden by `--enter`), so the scroll is the only motion left to account.
  const owed = scroller
    ? Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop)
    : 0
  const finalTop = bubbleRect.top - owed
  const deltaY = composerEl.getBoundingClientRect().top - finalTop
  if (deltaY < 4) return bail()
  const launchY = deltaY + FLIGHT_SINK_PX

  const clone = bubble.cloneNode(true) as HTMLElement
  clone.removeAttribute('data-message-id') // the knock query must not hit the stand-in
  clone.setAttribute('aria-hidden', 'true')
  clone.classList.remove('HomePage-Message--enter')
  Object.assign(clone.style, {
    position: 'fixed',
    top: `${finalTop}px`,
    left: `${bubbleRect.left}px`,
    width: `${bubbleRect.width}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '30',
    willChange: 'transform'
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(clone)

  const animation = animateRaw(
    clone,
    FLIGHT.map(({ o, x, v }) => {
      // The bubble emerges slightly small, as if still part of the box, and
      // the jelly stretch rides the velocity on top of that.
      const emerge = 0.94 + 0.06 * Math.min(1, o / 0.45)
      return {
        offset: o,
        transform:
          `translateY(${((1 - x) * launchY).toFixed(1)}px) ` +
          `scale(${(emerge * (1 - 0.05 * v)).toFixed(4)}, ${(emerge * (1 + 0.14 * v)).toFixed(4)})`,
        opacity: Math.min(1, 0.4 + o * 1.35)
      }
    }),
    // `both`: the clone owns the launch frame before the first tick and holds
    // the landing pose until the swap removes it.
    { duration: FLIGHT_MS, easing: 'linear', fill: 'both' }
  )

  let impactResolve: () => void = () => {}
  const impact = new Promise<void>((resolve) => {
    impactResolve = resolve
  })
  const seq = sendSeq
  let recoiled = false
  let knocked = false
  let landed = false
  let done = false

  // The swap: the clone's landing pose is exactly the real row's rest, so
  // revealing one while removing the other is invisible.
  const finish = (): void => {
    if (done) return
    done = true
    enteringMessages.delete(sent.id)
    clone.remove()
    impactResolve()
  }

  const watch = (): void => {
    if (done) return
    // A newer send owns the stage now; this flight ends where it stands.
    if (seq !== sendSeq) {
      animation.cancel()
      finish()
      return
    }
    const elapsed = Number(animation.currentTime ?? 0)
    if (!recoiled && elapsed >= FLIGHT_SPLIT_MS) {
      recoiled = true
      // Recoil at the split — the box springs back the moment the drop snaps
      // free. Composited additively so it stacks on the first-send FLIP.
      animateRaw(
        composerEl,
        [
          { transform: 'scale(1)' },
          { transform: 'scale(0.985)', offset: 0.35 },
          { transform: 'scale(1)' }
        ],
        { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', composite: 'add' }
      )
    }
    if (!knocked && elapsed >= FLIGHT_IMPACT_MS - KNOCK_LEAD_MS) {
      knocked = true
      // A full-strength hit: the bubble arrives carrying the send's momentum.
      knockRows(bubble, 1)
    }
    if (!landed && elapsed >= FLIGHT_IMPACT_MS) {
      landed = true
      impactResolve()
    }
    requestAnimationFrame(watch)
  }
  requestAnimationFrame(watch)
  void animation.finished.then(finish).catch(finish)

  return { impact }
}

/**
 * The composer's dock/undock journey rides the same spring as the messages —
 * a slight overshoot past its destination and a whisper of jelly, so landing
 * reads as a soft impact rather than an ease-out stop. Sign-agnostic: the
 * first-send drop and the new-conversation rise share it. The *group* is what
 * travels, so the quick pills dissolve in place on the composer's back
 * instead of detaching the moment the dock class flips the layout.
 */
function flipComposer(deltaY: number): void {
  const el = composerGroupRef.value ?? composerRef.value
  if (!el) return
  animateRaw(
    el,
    SPRING.map(({ o, x, v }) => {
      // The messages' full 8% rebound scaled to a box this big reads as a
      // wobble, not a landing — compress the overshoot to ~3% and let the
      // jelly carry the impact instead. Vertical only: an X squeeze on a
      // 720px-wide box is a visible ±8px breathing of its edges.
      const xc = x > 1 ? 1 + (x - 1) * 0.35 : x
      return {
        offset: o,
        transform:
          `translateY(${((1 - xc) * deltaY).toFixed(1)}px) ` +
          `scaleY(${(1 + 0.022 * v).toFixed(4)})`
      }
    }),
    { duration: 520, easing: 'linear' }
  )
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
      conversationId.value = null
      // Any half-played send choreography dies with the thread it animated.
      sendSeq += 1
      // The reverse FLIP: leaving a conversation undocks the composer, and the
      // same node must glide from the bottom dock back to centre stage — the
      // mirror of the first-send journey, same duration, same easing.
      const composerEl = composerRef.value
      const first = composerEl?.getBoundingClientRect()
      conversation.reset()
      await nextTick()
      if (composerEl && first && !prefersReducedMotion()) {
        const dy = first.top - composerEl.getBoundingClientRect().top
        if (Math.abs(dy) > 8) flipComposer(dy)
      }
      return
    }
    if (target === conversationId.value) return

    const restored = await history.load(target)
    if (!restored) return
    conversationId.value = target
    // Opening a thread from the blank home docks the composer — the same
    // journey as a first send, so it gets the same measured spring instead
    // of teleporting. Thread-to-thread hops measure ~0 and stay still.
    const composerEl = composerRef.value
    const first = composerEl?.getBoundingClientRect()
    conversation.restore(restored)
    // Wholesale replacement doesn't trip the stream's prepend anchoring, and keep-alive
    // reuses this instance — landing at the latest message needs an explicit call.
    await nextTick()
    streamRef.value?.scrollToBottom()
    if (composerEl && first && !prefersReducedMotion()) {
      const dy = first.top - composerEl.getBoundingClientRect().top
      if (Math.abs(dy) > 8) flipComposer(dy)
    }
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
    if (streaming || !wasStreaming || !conversationId.value) return
    try {
      await history.persist(conversationId.value, conversationTitle.value ?? '', messages.value)
      // Landing on the conversation's own URL is what lets the sidebar and a reload return to it.
      if (route.params.id !== conversationId.value) {
        await router.replace(`/home/c/${conversationId.value}`)
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
    ref="pageRef"
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
                      <!-- The trail of reasoning and tool calls, above the answer
                           it produced. Rendered from parts; a single step reads
                           better as the plain card the tool card already is. -->
                      <!-- Keyed: the surrounding v-if/v-for branches churn on
                           every streaming delta, and unkeyed alignment can
                           recreate this component mid-turn — taking the
                           user's open/collapse choice with it. -->
                      <TxChainOfThought
                        v-if="showChain(message)"
                        key="chain"
                        class="HomePage-Chain"
                        :steps="chainStepsOf(message)"
                        :streaming="message.status === 'streaming'"
                        :default-open="false"
                        :user-open="chainOpen.get(message.id)"
                        :label="t('home.chainOfThought')"
                        @toggle="chainOpen.set(message.id, $event)"
                      />
                      <template v-for="tool in toolCardsOf(message)" :key="tool.id">
                        <!-- Widgets embed as themselves — a form is a form, not
                             a tool log with a form inside. The machinery card
                             stays for tools without a face, and for the
                             running window before a widget's spec exists. -->
                        <div
                          v-if="formSpecOf(tool) || chartSpecOf(tool)"
                          class="HomePage-WidgetBlock"
                        >
                          <ToolFormCard
                            v-if="formSpecOf(tool)"
                            :spec="formSpecOf(tool)!"
                            :submitted="submittedForms.has(tool.id) || tool.submitted === true"
                            :initial-values="formDrafts.get(tool.id)"
                            :submit-label="t('home.formSubmit')"
                            :reset-label="t('home.formReset')"
                            :required-hint="t('home.formRequired')"
                            :submitted-label="t('home.formDone')"
                            :select-placeholder="t('home.formSelect')"
                            @submit="submitForm(tool, $event)"
                            @change="formDrafts.set(tool.id, $event)"
                          />
                          <ToolChartCard
                            v-else
                            :spec="chartSpecOf(tool)!"
                            :animate="message.status === 'streaming'"
                          />

                          <!-- The raw call, for builders only: a whisper of a
                               toggle, and none at all outside dev builds. -->
                          <button
                            v-if="showToolPayload"
                            class="HomePage-PayloadBtn"
                            type="button"
                            @click="payloadFor = tool"
                          >
                            <span class="i-ri-braces-line" />
                            <span>{{ t('home.toolPayload') }}</span>
                          </button>
                        </div>
                        <TxToolCallCard
                          v-else
                          class="HomePage-Tool"
                          :tool-call="tool"
                          :retry-label="t('home.retry')"
                        />
                      </template>

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
  z-index: 0;
  inset: 0;
  transition:
    opacity 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-leave-to {
  opacity: 0;
  filter: blur(8px);
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
  // Above the dissolving stream while a conversation is being left.
  position: relative;
  z-index: 1;

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

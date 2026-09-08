<script lang="ts" setup name="VoicePanel">
import type {
  AssistantRuntimeConfig,
  AssistantVoiceCancelHoldPayload
} from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { StreamController } from '@talex-touch/utils/transport/types'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { TxBorderBeam } from '@talex-touch/tuffex/border-beam'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPreloadProcessInfo } from '~/modules/preload/process-info'
import { useI18n } from 'vue-i18n'

/**
 * How long each notice stays before the dock collapses.
 *
 * Cancelling is the shortest on purpose: the user just did it, so telling them at length
 * repeats what they already know. A failure they did not cause needs longer to be read.
 */
const NOTICE_HOLD_MS = {
  muted: 900,
  warning: 2100,
  danger: 1200,
  /** A notice carrying a button has to outlast the reflex to reach for it. */
  action: 6500
} as const

/**
 * Main owns the cancellation deadline. The HUD uses the same interval only to draw the charge
 * that main has already accepted; reaching one is never a local cancellation decision.
 */
const CANCEL_HOLD_MS = 600
const CHARGE_TICK_MS = 30

/**
 * When waiting stops being normal.
 *
 * Both are starting points, not measurements: nobody has p50/p90 for this path yet. They are
 * named rather than inlined so the eventual real numbers replace something visible.
 */
const SLOW_AFTER_MS = 3000
const VERY_SLOW_AFTER_MS = 8000

/**
 * How long the device gets to produce its first level frame before we stop saying "preparing".
 *
 * Breathing forever is its own kind of lie: after this the microphone is not slow, it is not
 * answering, and the user needs to be told that instead of watched at.
 */
const CAPTURE_START_TIMEOUT_MS = 2000

type NoticeTone = keyof typeof NOTICE_HOLD_MS
type NoticeAction = 'undo' | 'retry' | 'settings' | 'asrSettings'

/**
 * Where a microphone failure can actually be fixed — and only where such a pane exists.
 *
 * Linux has no equivalent that works across desktops, so there the notice keeps its sentence
 * and no button: offering a control that opens nothing is worse than offering none.
 */
const MIC_SETTINGS_PLATFORMS = new Set(['darwin', 'win32'])
type Notice = { message: string; tone: NoticeTone; action?: NoticeAction; icon?: string }

/**
 * The one failure class that has a picture worth drawing.
 *
 * A microphone with a line through it says "the device, not the words" before the sentence is
 * read. It is deliberately not given to quota, congestion or the unclassified fallback: an icon
 * of a microphone next to "out of credit" would name the wrong culprit.
 */
const MIC_FAILURE_ICON = 'i-carbon-microphone-off'
/**
 * The other failure that has a picture: nothing is wrong with the hardware, the feature simply
 * has not been set up. A sliders icon says "this is a setting" before the sentence does, which
 * is what lets the sentence stop carrying the instruction.
 */
const SETUP_ICON = 'i-carbon-settings-adjust'

/**
 * The device card is not measured — its copy is fixed and short.
 *
 * It is also the one notice with a picture, so it stacks instead of running in a line: the
 * icon centred, the sentence under it, the two controls on the floor. A layout that says
 * "the microphone" before it says anything else.
 */
const ICON_CARD_WIDTH = 264
const ICON_CARD_HEIGHT = 124

/** Bars in the input meter. Each one holds a single 10Hz level frame, so 24 ≈ 2.4s of history. */
const WAVE_BAR_COUNT = 24
const WAVE_BAR_MIN_HEIGHT = 3
const WAVE_BAR_MAX_HEIGHT = 28

/**
 * Auto-gain for the meter.
 *
 * Raw RMS from a normal speaking voice sits around 0.02–0.10, so drawing it directly gives a
 * flat line with no legible difference between syllables. The meter instead normalizes against
 * a reference that tracks the recent peak: it rises fast so a sudden shout does not clip, and
 * falls slowly so the quiet words right after a loud one are still readable.
 *
 * `WAVE_NOISE_GATE` is what stops this from lying. Without it, dividing by a small reference
 * would amplify room tone into a full-scale display — the meter would look alive in a silent
 * room, which is exactly the fake animation this whole surface exists to avoid.
 */
const WAVE_NOISE_GATE = 0.012
const WAVE_REF_FLOOR = 0.05
const WAVE_REF_ATTACK = 0.6
/**
 * Release is the number that matters for the second half of the ask: after a loud burst the
 * reference has to come back down fast enough that the next quiet sentence is legible again.
 * At 10Hz this recovers from a shout to the floor in roughly 1.7s. Much slower (0.03 was the
 * first guess) leaves nine seconds of near-flat meter; much faster makes it pump per syllable.
 */
const WAVE_REF_RELEASE = 0.15

const PILL_BASE_WIDTH = 200
const PILL_MAX_WIDTH = 340
const PILL_BASE_HEIGHT = 44
/** The tallest the island ever gets: its padding, two clamped lines, the gap and one control. */
const PILL_TALL_HEIGHT = 88
/** Both paddings, and the gap between the text row and the control row. */
const PILL_TALL_PADDING = 10
const PILL_ROW_GAP = 4
/**
 * The shape changes with the height, not just the size.
 *
 * A pill radius is half its height by definition, so keeping `radius: full` at 88px turns the
 * two ends into oversized semicircles and eats the room the second line needs. Expanding into
 * a rounded rectangle is what the shape is actually doing — one line is a pill, two lines is a
 * card — so the radius says so, and stays far below the 44 that would make it a pill again.
 */
const PILL_TALL_RADIUS = 24
/**
 * The round controls grow with the surface, but not in proportion to it.
 *
 * In the pill they are the height minus its padding — the control *is* the bar. A card is
 * taller than any control should be, so there they match the two-line text block beside them
 * instead: the control tracks the content, not the container.
 */
const CONTROL_BASE_SIZE = 34
const CONTROL_TALL_SIZE = 40
/** padding (10) + both round slots (68) + both gaps (16); the centre gets what is left. */
const PILL_CHROME_WIDTH = 94
/**
 * The per-character reveal.
 *
 * `CHAR_STAGGER_MS` is the gap between neighbours; `CHAR_STAGGER_TOTAL_MS` is the ceiling on the
 * whole wave, so a long sentence tightens its spacing instead of taking a second and a half to
 * finish arriving. The message is still one string to a screen reader — the spans are presentation.
 */
const CHAR_STAGGER_MS = 16
const CHAR_STAGGER_TOTAL_MS = 240

/**
 * Slack for the pixel the measurement cannot see.
 *
 * `scrollWidth` is an integer and the text's real width is not, so a sentence measuring 145.7
 * reports 145 and gets a 145-wide slot — a fraction too narrow, and it wraps. Every message
 * short enough to fit on one line is a coin flip without this.
 */
const TEXT_WIDTH_SLACK = 2

const props = withDefaults(
  defineProps<{
    managedByDock?: boolean
    generation?: number
  }>(),
  { managedByDock: false, generation: 0 }
)

const emit = defineEmits<{
  finished: [generation?: number]
}>()

const transport = useTuffTransport()
const { t } = useI18n()
const runtimeConfig = ref<AssistantRuntimeConfig>({
  enabled: false,
  language: 'zh-CN'
})

const listening = ref(false)
const transcribing = ref(false)
const startingVoiceCapture = ref(false)
const notice = ref<Notice | null>(null)
const sessionSeq = ref(0)
const levels = ref<number[]>(new Array(WAVE_BAR_COUNT).fill(0))
const centerTextRef = ref<HTMLElement | null>(null)
const pillRef = ref<HTMLElement | null>(null)
const pillWidth = ref(PILL_BASE_WIDTH)
const pillHeight = ref(PILL_BASE_HEIGHT)
const expanded = computed(() => pillHeight.value > PILL_BASE_HEIGHT)
const pillRadius = computed(() =>
  expanded.value ? PILL_TALL_RADIUS : Math.round(PILL_BASE_HEIGHT / 2)
)
const controlSize = computed(() => (expanded.value ? CONTROL_TALL_SIZE : CONTROL_BASE_SIZE))
/** The card that leads with a picture: icon over sentence, controls on the floor. */
const iconCard = computed(() => Boolean(notice.value?.icon))
const ACTION_ICONS: Record<NoticeAction, string> = {
  undo: 'i-carbon-undo',
  retry: 'i-carbon-renew',
  settings: 'i-carbon-settings',
  asrSettings: 'i-carbon-settings'
}
const ACTION_LABELS: Record<NoticeAction, string> = {
  undo: 'assistant.voicePanel.undo',
  retry: 'assistant.voicePanel.retry',
  settings: 'assistant.voicePanel.openMicrophoneSettings',
  asrSettings: 'assistant.voicePanel.openRecognitionSettings'
}
const actionIcon = computed(() =>
  notice.value?.action ? ACTION_ICONS[notice.value.action] : ACTION_ICONS.retry
)
const actionLabel = computed(() =>
  t(notice.value?.action ? ACTION_LABELS[notice.value.action] : ACTION_LABELS.retry)
)
/** Script-owned rather than CSS: the size is a function of the surface, and tests read it. */
const controlStyle = computed(() => ({
  width: `${controlSize.value}px`,
  height: `${controlSize.value}px`
}))
/** 0..1 while Escape is held; the border draws it so the commitment is visible. */
const cancelCharge = ref(0)
const waitedMs = ref(0)
const recovering = ref(false)
/** False until the first level frame lands — see `preparing`. */
const hasLevel = ref(false)

const voiceSdk = createVoiceSdk(transport)
const voiceInputEnabled = computed(() => runtimeConfig.value.enabled)
const voiceActive = computed(
  () => listening.value || transcribing.value || startingVoiceCapture.value
)

const hasNotice = computed(() => notice.value !== null)
/**
 * Cancel outlives the confirm action.
 *
 * While the transcript is in flight the session is still abortable — main checks its abort
 * signal before polishing and before delivering — so Escape has to keep working right up to
 * the moment the text lands.
 */
const canCancel = computed(() => listening.value || transcribing.value || hasNotice.value)
const canConfirm = computed(() => listening.value && !hasNotice.value)
/** The confirm slot stops being a button while transcribing — it becomes the progress mark. */
const showsOrb = computed(() => (transcribing.value || recovering.value) && !hasNotice.value)
/**
 * Before the first level frame, the meter has nothing to draw.
 *
 * Drawing 24 bars at minimum height is not "empty": it is a working meter reporting silence,
 * which is a claim we cannot make while the device is still opening. So the meter waits for
 * data and the pill breathes instead.
 */
const preparing = computed(() => listening.value && !hasLevel.value && !hasNotice.value)
const holdingCancel = computed(() => cancelCharge.value > 0)
const slowness = computed(() => {
  if (!transcribing.value) return 'normal'
  if (waitedMs.value >= VERY_SLOW_AFTER_MS) return 'very-slow'
  if (waitedMs.value >= SLOW_AFTER_MS) return 'slow'
  return 'normal'
})

/**
 * The border is the only progress this surface can honestly draw.
 *
 * There is no percentage to show — the provider reports partials and a final, never a
 * fraction — so the beam says "still running" and changes colour when that stops being
 * routine. Holding Escape takes it over entirely, because a charge that is about to throw
 * away a sentence outranks a progress hint.
 */
const beamTone = computed(() => {
  if (holdingCancel.value) return 'danger'
  if (notice.value) return notice.value.tone === 'muted' ? 'muted' : notice.value.tone
  if (slowness.value !== 'normal') return 'warning'
  return 'accent'
})
const beamActive = computed(() => voiceActive.value || holdingCancel.value || hasNotice.value)
/**
 * Colour carries the same three-tone scale the notices use, so the border never says something
 * the text contradicts. `mono` is the neutral one; the palettes are reserved for a live session.
 */
const beamVariant = computed<'colorful' | 'mono' | 'sunset'>(() => {
  if (beamTone.value === 'danger' || beamTone.value === 'warning') return 'sunset'
  if (beamTone.value === 'muted') return 'mono'
  return 'colorful'
})

/** Faster while transcribing, slower when the wait stops being routine — the beam reads as pace. */
const beamDurationSeconds = computed(() => {
  if (holdingCancel.value) return 0.6
  if (slowness.value === 'very-slow') return 12
  if (transcribing.value || recovering.value) return 3
  return 6
})
const centerText = computed(() => {
  if (notice.value) return notice.value.message
  if (holdingCancel.value) return t('assistant.voicePanel.holdToCancel')
  if (recovering.value) return t('assistant.voicePanel.recovering')
  if (preparing.value) return t('assistant.voicePanel.capturingDevice')
  if (!transcribing.value) return ''
  if (slowness.value === 'very-slow') return t('assistant.voicePanel.stillWorkingLong')
  if (slowness.value === 'slow') return t('assistant.voicePanel.stillWorking')
  return t('assistant.voicePanel.voiceTranscribingShort')
})

/**
 * What counts as "different content" for the swap.
 *
 * Keyed on the sentence rather than on the phase, so slow → very-slow reads as a change too:
 * the words are what the user is looking at, and swapping them in place under a still frame is
 * the jarring part. The waveform is one identity for as long as it is the waveform — its bars
 * animate on their own and must not be torn down every level frame.
 */
/** Split for the reveal only; `centerText` stays the single source of the sentence. */
const centerChars = computed(() => Array.from(centerText.value))
function charDelay(index: number): number {
  const count = Math.max(1, centerChars.value.length)
  return Math.round(index * Math.min(CHAR_STAGGER_MS, CHAR_STAGGER_TOTAL_MS / count))
}

const centerKey = computed(() =>
  centerText.value ? `text:${centerText.value}` : listening.value ? 'wave' : 'idle'
)

/**
 * The text element of the slot that is arriving, not the one that is leaving.
 *
 * Both are in the DOM together for the length of the transition, and the outgoing one still
 * carries the old sentence — measuring that would size the pill for the message it is in the
 * middle of forgetting.
 */
function currentTextEl(): HTMLElement | null {
  const root = pillRef.value
  if (!root) return centerTextRef.value
  return (
    root.querySelector<HTMLElement>(
      '.voice-dock__slot:not(.voice-swap-leave-active) .voice-dock__text'
    ) ?? centerTextRef.value
  )
}

let voiceStreamController: StreamController | null = null
let activeVoiceGeneration: number | null = null
let nextVoiceGeneration = 0
let stopRequestedGeneration: number | null = null
let panelGeneration = 0
let panelTaskGeneration = 0
let disposePanelOpen: (() => void) | null = null
let disposeCancelHold: (() => void) | null = null
let finishTimer: ReturnType<typeof setTimeout> | null = null
let finished = false
let waveReference = WAVE_REF_FLOOR
let holdTimer: ReturnType<typeof setInterval> | null = null
let waitTimer: ReturnType<typeof setInterval> | null = null
let captureStartTimer: ReturnType<typeof setTimeout> | null = null

function stopCaptureStartTimer(): void {
  if (captureStartTimer === null) return
  clearTimeout(captureStartTimer)
  captureStartTimer = null
}

function stopHold(): void {
  if (holdTimer !== null) {
    clearInterval(holdTimer)
    holdTimer = null
  }
  cancelCharge.value = 0
}

function stopWaitClock(): void {
  if (waitTimer !== null) {
    clearInterval(waitTimer)
    waitTimer = null
  }
  waitedMs.value = 0
}

/**
 * Map one raw RMS frame onto 0..1 against the running reference.
 *
 * The reference chases peaks quickly and decays slowly, so a whisper fills the meter and a
 * shout does not clip — the visible difference between syllables survives either way. Below
 * the noise gate the answer is a hard zero: room tone must read as silence, not as speech.
 */
function normalizeLevel(rms: number): number {
  if (!Number.isFinite(rms) || rms < WAVE_NOISE_GATE) return 0

  const rate = rms > waveReference ? WAVE_REF_ATTACK : WAVE_REF_RELEASE
  waveReference = Math.max(WAVE_REF_FLOOR, waveReference + (rms - waveReference) * rate)

  // Square root, not linear: loudness is perceptual, and the interesting detail lives low.
  return Math.min(1, Math.sqrt(rms / waveReference))
}

function barHeight(level: number): number {
  return WAVE_BAR_MIN_HEIGHT + Math.round(level * (WAVE_BAR_MAX_HEIGHT - WAVE_BAR_MIN_HEIGHT))
}

function clearFinishTimer(): void {
  if (finishTimer === null) return
  clearTimeout(finishTimer)
  finishTimer = null
}

function emitFinished(): void {
  if (finished) return
  finished = true
  emit('finished', props.generation)
}

/**
 * The held recording outlives nothing but its own button.
 *
 * Main keeps the audio because there is an undo or a retry to press. The moment that notice
 * leaves the screen — expired, replaced, or reset by the next session — the reason is gone, so
 * main is told to drop it instead of being left to time it out. Ten megabytes of what the user
 * just said is not something to keep for nobody; the timer over there is only the backstop for
 * a renderer that never gets to say this.
 */
function endRecoveryOffer(): void {
  // `recoverLast` clears the notice *before* it calls main, so spending an offer is already
  // indistinguishable from not having one — which is what keeps a retry from deleting the very
  // audio it is about to use. That ordering is load-bearing and is pinned by a test.
  const action = notice.value?.action
  if (action !== 'undo' && action !== 'retry') return
  void voiceSdk.discardRecovery().catch(() => {
    // Best effort: a failed discard must not surface as an error on a surface the user has
    // already dismissed, and main's timer still closes the window.
  })
}

function showNotice(message: string, tone: NoticeTone, action?: NoticeAction, icon?: string): void {
  endRecoveryOffer()
  notice.value = { message, tone, ...(action ? { action } : {}), ...(icon ? { icon } : {}) }
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  recovering.value = false
  stopHold()
  stopWaitClock()
  stopCaptureStartTimer()
  clearFinishTimer()
  // A notice you can act on gets the long hold; one you can only read gets its own.
  const hold = action ? NOTICE_HOLD_MS.action : NOTICE_HOLD_MS[tone]
  finishTimer = setTimeout(() => {
    finishTimer = null
    // The surface is collapsing, so whatever it was offering stops being reachable here.
    endRecoveryOffer()
    emitFinished()
  }, hold)
}

/**
 * Sort a failure into the three tones.
 *
 * Quota and provider congestion are not failures of the user or of the app — they resolve on
 * their own or in Settings, so they read as warnings rather than errors. Everything unclassified
 * stays danger, because an unknown failure is the one worth interrupting for.
 */
function classifyFailure(error: unknown): Notice {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  const code = ((error as { code?: unknown })?.code ?? '').toString()
  const haystack = `${code} ${raw}`.toUpperCase()

  // Device and permission failures are the ones the provider describes worst: its sentence is
  // English, truncated by the width, and offers no way out. They are entirely classifiable, so
  // they get our own copy and no retry — retrying finds the same missing microphone.
  if (/PERMISSION|DENIED|NOT_?AUTHORIZ|UNAUTHORIZED/.test(haystack))
    return {
      message: t('assistant.voicePanel.microphoneDenied'),
      tone: 'warning',
      icon: MIC_FAILURE_ICON,
      ...(canOpenMicSettings ? { action: 'settings' as const } : {})
    }

  const deviceMissing =
    /CANNOT_?FIND|NO_?(INPUT_?)?DEVICE|DEVICE_?NOT_?FOUND|NO_?MICROPHONE|CAPTURE_?UNAVAILABLE|(?:MICROPHONE|INPUT|CAPTURE|AUDIO).{0,80}UNSUPPORTED|UNSUPPORTED.{0,80}(?:MICROPHONE|INPUT|CAPTURE|AUDIO)/
  if (deviceMissing.test(haystack))
    return {
      message: t('assistant.voicePanel.microphoneMissing'),
      tone: 'warning',
      icon: MIC_FAILURE_ICON,
      ...(canOpenMicSettings ? { action: 'settings' as const } : {})
    }

  // Same compact recovery shape as the microphone card: the status names the recognition issue,
  // and the action opens the existing Intelligence channel and capability configuration.
  if (/VOICE_ASR_NOT_CONFIGURED/.test(haystack)) {
    return {
      message: t('assistant.voicePanel.voiceRecognitionNotConfigured'),
      tone: 'warning',
      icon: SETUP_ICON,
      action: 'asrSettings'
    }
  }

  // The sibling of the branch above, and it was left behind when that one was fixed: same
  // instruction inside the sentence, same 47 characters breaking the same card. Both routes end
  // in the same place, so both offer the same button.
  if (/VOICE_ASR_(?:PROVIDER|CREDENTIAL)_UNAVAILABLE/.test(haystack)) {
    return {
      message: t('assistant.voicePanel.voiceRecognitionUnavailable'),
      tone: 'warning',
      icon: SETUP_ICON,
      action: 'asrSettings'
    }
  }

  if (/QUOTA|CREDIT|INSUFFICIENT_BALANCE/.test(haystack))
    return { message: t('assistant.voicePanel.quotaExhausted'), tone: 'warning' }

  const congested =
    /RATE_?LIMIT|TOO_?MANY_?REQUESTS|OVERLOAD|HIGH_?DEMAND|BUSY|\b429\b|\b503\b|\b529\b/
  if (congested.test(haystack))
    return { message: t('assistant.voicePanel.serviceBusy'), tone: 'warning' }

  // The raw message goes to the console, not into the pill. A provider's own sentence is
  // English, gets truncated by the width, and tells the user nothing they can act on.
  // eslint-disable-next-line no-console
  if (error) console.warn('[voice] unclassified failure', error)
  return { message: t('assistant.voicePanel.voiceTranscribeFailed'), tone: 'danger' }
}

function resetPanelState(): void {
  endRecoveryOffer()
  clearFinishTimer()
  finished = false
  notice.value = null
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  levels.value = new Array(WAVE_BAR_COUNT).fill(0)
  waveReference = WAVE_REF_FLOOR
  hasLevel.value = false
  recovering.value = false
  stopHold()
  stopWaitClock()
  stopCaptureStartTimer()
}

function isCurrentPanel(generation: number, taskGeneration?: number): boolean {
  return (
    panelGeneration === generation &&
    (taskGeneration === undefined || panelTaskGeneration === taskGeneration)
  )
}
function isCurrentVoiceSession(generation: number): boolean {
  return activeVoiceGeneration === generation
}

function retireVoiceSession(generation: number): boolean {
  if (!isCurrentVoiceSession(generation)) return false
  activeVoiceGeneration = null
  if (stopRequestedGeneration === generation) stopRequestedGeneration = null
  voiceStreamController = null
  return true
}

async function loadRuntimeConfig(
  generation = panelGeneration,
  taskGeneration = panelTaskGeneration
): Promise<void> {
  try {
    const nextConfig = await transport.send(
      AssistantEvents.floatingBall.getRuntimeConfig,
      undefined
    )
    if (isCurrentPanel(generation, taskGeneration)) runtimeConfig.value = nextConfig
  } catch (error) {
    // A late settings failure must not turn an already-running microphone session into a
    // misleading error surface; the session can safely use the default language.
    if (isCurrentPanel(generation, taskGeneration) && !voiceActive.value) {
      showNotice(classifyFailure(error).message, 'danger')
    }
  }
}

function cancelVoiceSession(): void {
  const controller = voiceStreamController
  const generation = activeVoiceGeneration
  if (generation !== null) retireVoiceSession(generation)
  voiceStreamController = null
  stopRequestedGeneration = null
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  controller?.cancel()
}

/**
 * Stop capturing but let the session finish.
 *
 * Deliberately not `cancel()`: cancelling aborts the whole session main-side, so the
 * transcript is never delivered. When opening the stream is still pending, remember the stop
 * and apply it as soon as its controller arrives instead of discarding that new session.
 */
function finishVoiceInput(): void {
  const generation = activeVoiceGeneration
  if (finished || generation === null || !listening.value) return
  stopRequestedGeneration = generation
  listening.value = false
  transcribing.value = true
  startingVoiceCapture.value = false

  stopWaitClock()
  waitTimer = setInterval(() => {
    waitedMs.value += 100
  }, 100)

  voiceStreamController?.stop?.()
}

function completeVoiceSession(generation: number): void {
  if (!retireVoiceSession(generation)) return
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  stopWaitClock()
  stopCaptureStartTimer()
  if (notice.value) return
  emitFinished()
}

function handleVoiceSessionEvent(generation: number, event: VoiceAsrStreamEvent): void {
  if (!isCurrentVoiceSession(generation)) return
  if (event.type === 'device') {
    // Said once, at the top of a session that opened different hardware than the last one did.
    // Not a failure and not an instruction, so it takes the muted tone and its short hold; it
    // replaces "opening the microphone" because naming the device answers that too.
    showNotice(t('assistant.voicePanel.usingDevice', { name: event.name }), 'muted')
    return
  }
  if (event.type === 'level') {
    // The handover is the data arriving, not a timer: the meter takes over the moment it has
    // something true to draw.
    hasLevel.value = true
    stopCaptureStartTimer()
    levels.value = [...levels.value.slice(1), normalizeLevel(event.rms)]
    return
  }
  if (event.type === 'partial') return
  if (event.type === 'final') {
    if (!event.text.trim() || event.delivery?.method === 'none') {
      retireVoiceSession(generation)
      showNotice(
        t(
          !event.text.trim()
            ? 'assistant.voicePanel.voiceTranscribeEmpty'
            : 'assistant.voicePanel.voiceDeliveryFailed'
        ),
        'warning'
      )
    }
    return
  }
  completeVoiceSession(generation)
}

function showVoiceSessionError(generation: number, error: unknown): void {
  if (!retireVoiceSession(generation)) return
  const classified = classifyFailure(error)
  // Quota and congestion get no retry button: retrying is still out of credit, still busy.
  // A classified failure knows better than the tone rule what can be done about it: a missing
  // microphone is fixed in Settings, not by asking the same provider again.
  const retryable = classified.tone === 'danger'
  showNotice(
    classified.message,
    classified.tone,
    classified.action ?? (retryable ? 'retry' : undefined),
    classified.icon
  )
}

async function startVoiceSession(): Promise<void> {
  if (!voiceInputEnabled.value) {
    showNotice(t('assistant.voicePanel.voiceInputDisabled'), 'warning')
    return
  }
  if (activeVoiceGeneration !== null || startingVoiceCapture.value || transcribing.value) return

  const owner = panelGeneration
  panelTaskGeneration += 1
  const generation = ++nextVoiceGeneration
  activeVoiceGeneration = generation
  clearFinishTimer()
  finished = false
  startingVoiceCapture.value = true
  listening.value = true
  notice.value = null
  levels.value = new Array(WAVE_BAR_COUNT).fill(0)
  hasLevel.value = false
  // A stale peak from the last session would flatten the first words of this one.
  waveReference = WAVE_REF_FLOOR
  stopCaptureStartTimer()
  captureStartTimer = setTimeout(() => {
    captureStartTimer = null
    if (
      !isCurrentPanel(owner) ||
      !isCurrentVoiceSession(generation) ||
      hasLevel.value ||
      !listening.value
    ) {
      return
    }
    // Not slow — not answering. Breathing forever would be its own kind of lie.
    cancelVoiceSession()
    showNotice(
      t('assistant.voicePanel.microphoneUnresponsive'),
      'warning',
      canOpenMicSettings ? 'settings' : undefined,
      MIC_FAILURE_ICON
    )
  }, CAPTURE_START_TIMEOUT_MS)
  // The orb is re-rolled per session through this key; changing its `state` would not.
  sessionSeq.value += 1
  try {
    const controller = await voiceSdk.asrStream(
      {
        language: runtimeConfig.value.language,
        cleanup: true,
        delivery: 'active-app',
        emitLevel: true
      },
      {
        onData: (event) => handleVoiceSessionEvent(generation, event),
        onError: (error) => showVoiceSessionError(generation, error),
        onEnd: () => completeVoiceSession(generation)
      }
    )
    if (!isCurrentPanel(owner) || !isCurrentVoiceSession(generation)) {
      controller.cancel()
      return
    }
    voiceStreamController = controller
    if (stopRequestedGeneration === generation) controller.stop?.()
  } catch (error) {
    showVoiceSessionError(generation, error)
  } finally {
    if (isCurrentVoiceSession(generation)) startingVoiceCapture.value = false
  }
}

async function handlePanelOpened(): Promise<void> {
  const generation = ++panelGeneration
  const taskGeneration = ++panelTaskGeneration
  cancelVoiceSession()
  resetPanelState()
  // The voice-input gate and language must be current before any entry can start capture.
  await loadRuntimeConfig(generation, taskGeneration)
  await nextTick()
}

/** Cancelling is the same act from Esc, the ✕ button, or a dock command. */
function cancelSession(): void {
  if (!canCancel.value) return
  if (hasNotice.value) {
    clearFinishTimer()
    emitFinished()
    return
  }
  const wasListening = listening.value
  cancelVoiceSession()
  // Undo restores the same words from the audio main kept. Offering it after the transcript
  // may already have been delivered would be a promise this side cannot keep.
  showNotice(t('assistant.voicePanel.cancelled'), 'muted', wasListening ? 'undo' : undefined)
}

function handleConfirm(): void {
  if (!canConfirm.value) return
  finishVoiceInput()
}

/**
 * Undo and retry are the same call.
 *
 * Both mean "use the audio main is still holding": one because the user cancelled, one
 * because transcription failed. The difference is the sentence shown, not the work done.
 */
const canOpenMicSettings = MIC_SETTINGS_PLATFORMS.has(getPreloadProcessInfo()?.platform ?? '')

/**
 * The one action on the pill that is not about the recording.
 *
 * Undo and retry both mean "use the audio main is still holding"; settings means "the audio was
 * never going to arrive, go turn the microphone on". Routing them through one handler would put
 * a recovery spinner on a button that recovers nothing.
 */
async function openMicSettings(): Promise<void> {
  try {
    await voiceSdk.openMicrophoneSettings()
    clearFinishTimer()
    emitFinished()
  } catch {
    showNotice(t('assistant.voicePanel.microphoneSettingsUnavailable'), 'warning')
  }
}

async function handleNoticeAction(): Promise<void> {
  if (notice.value?.action === 'settings') {
    await openMicSettings()
    return
  }
  if (notice.value?.action === 'asrSettings') {
    // Main brings the settings window forward and collapses this surface; nothing to report
    // back here, and a failure to open is not worth replacing the sentence that explains why
    // the user is here in the first place.
    void transport.send(AssistantEvents.voice.openIntelligenceSettings, undefined)
    clearFinishTimer()
    emitFinished()
    return
  }
  await recoverLast()
}

async function recoverLast(): Promise<void> {
  const action = notice.value?.action
  if (!action || action === 'settings') return

  const generation = panelGeneration
  const taskGeneration = ++panelTaskGeneration
  clearFinishTimer()
  notice.value = null
  recovering.value = true
  sessionSeq.value += 1

  try {
    const result = await voiceSdk.retryLastFailure({ delivery: 'active-app' })
    if (!isCurrentPanel(generation, taskGeneration)) return
    recovering.value = false
    if (result.expired) {
      // Say which thing failed. "Recording expired" and "transcription failed" send the
      // user to different places, and only one of them is worth another button.
      showNotice(t('assistant.voicePanel.recoveryExpired'), 'warning')
      return
    }
    if (!result.text) {
      showNotice(t('assistant.voicePanel.voiceTranscribeEmpty'), 'warning')
      return
    }
    emitFinished()
  } catch (error) {
    if (!isCurrentPanel(generation, taskGeneration)) return
    recovering.value = false
    const classified = classifyFailure(error)
    showNotice(classified.message, classified.tone, 'retry')
  }
}

function beginCancelCharge(): void {
  if (holdTimer !== null) return
  const startedAt = Date.now()
  holdTimer = setInterval(() => {
    cancelCharge.value = Math.min(1, (Date.now() - startedAt) / CANCEL_HOLD_MS)
  }, CHARGE_TICK_MS)
}

function handleCancelHold(state: AssistantVoiceCancelHoldPayload['state']): void {
  if (state === 'start') {
    beginCancelCharge()
    return
  }
  stopHold()
  if (state === 'commit') cancelSession()
}

/**
 * How wide the text would be on one line — which is not what `scrollWidth` reports.
 *
 * The paragraph wraps inside a slot whose width comes from this very measurement, so reading
 * it as it stands answers "how wide are you right now", not "how wide do you want to be": a
 * short sentence that wrapped at the base width reports that it fits, and the pill never grows
 * for it. Forcing one line for the duration of the read is what asks the second question.
 */
function measureNaturalWidth(element: HTMLElement): number {
  const previous = element.style.whiteSpace
  element.style.whiteSpace = 'nowrap'
  const width = element.scrollWidth
  element.style.whiteSpace = previous
  return width
}

// Measured rather than expressed in CSS: `width: fit-content` is not animatable without
// `interpolate-size`, and the window behind the pill deliberately never resizes.
watch([centerText, showsOrb, () => notice.value?.icon], async () => {
  if (!centerText.value) {
    pillWidth.value = PILL_BASE_WIDTH
    pillHeight.value = PILL_BASE_HEIGHT
    return
  }
  // Fixed geometry, no measurement: this card's copy is short and constant, and it stacks
  // rather than running in a line, so there is no natural width to ask about.
  if (notice.value?.icon) {
    pillWidth.value = ICON_CARD_WIDTH
    pillHeight.value = ICON_CARD_HEIGHT
    return
  }

  await nextTick()
  const element = currentTextEl()
  if (!element) return
  const chrome = PILL_CHROME_WIDTH
  const needed = measureNaturalWidth(element) + TEXT_WIDTH_SLACK + chrome
  pillWidth.value = Math.min(PILL_MAX_WIDTH, Math.max(PILL_BASE_WIDTH, needed))

  // Width first, height second. Truncating at the cap loses the half of the sentence that
  // says what to do — "Cannot find m…" is exactly the wrong half to drop — so only once one
  // line cannot fit even at the cap does the island grow instead.
  if (needed <= PILL_MAX_WIDTH) {
    pillHeight.value = PILL_BASE_HEIGHT
    return
  }

  // Grow first, then measure what the text actually took. The card hands it the full width
  // instead of the pill's middle column, so how many lines it needs is only knowable after the
  // layout has already changed — and a card sized for two lines around one line of text is the
  // same empty band as before, just turned on its side.
  pillHeight.value = PILL_TALL_HEIGHT
  await nextTick()
  const textHeight = currentTextEl()?.scrollHeight ?? 0
  pillHeight.value = Math.min(
    PILL_TALL_HEIGHT,
    Math.max(
      PILL_BASE_HEIGHT + 1,
      PILL_TALL_PADDING + textHeight + PILL_ROW_GAP + CONTROL_TALL_SIZE
    )
  )
})

defineExpose({
  openPanel: handlePanelOpened,
  startVoiceInput: (): void => {
    void startVoiceSession()
  },
  stopVoiceInput: finishVoiceInput,
  toggleVoiceInput: (): void => {
    if (listening.value || startingVoiceCapture.value) finishVoiceInput()
    else if (!transcribing.value && !recovering.value) void startVoiceSession()
  },
  handleCancelHold
})

onMounted(() => {
  if (!props.managedByDock) {
    disposePanelOpen = transport.on(AssistantEvents.voice.panelOpened, async () => {
      await handlePanelOpened()
    })
    disposeCancelHold = transport.on(AssistantEvents.voice.cancelHold, (payload) => {
      handleCancelHold(payload.state)
    })
    void loadRuntimeConfig()
  }
})

onBeforeUnmount(() => {
  panelGeneration += 1
  panelTaskGeneration += 1
  disposeCancelHold?.()
  disposeCancelHold = null
  stopHold()
  stopWaitClock()
  stopCaptureStartTimer()
  clearFinishTimer()
  cancelVoiceSession()
  disposePanelOpen?.()
  disposePanelOpen = null
})
</script>

<template>
  <div class="voice-panel-root">
    <div
      ref="pillRef"
      class="voice-dock"
      role="status"
      aria-live="polite"
      :aria-busy="voiceActive"
      :class="[
        notice ? `voice-dock--${notice.tone}` : null,
        preparing ? 'voice-dock--preparing' : null,
        expanded ? 'voice-dock--expanded' : null,
        iconCard ? 'voice-dock--icon-card' : null,
        holdingCancel ? 'voice-dock--holding' : null,
        slowness !== 'normal' && !notice ? 'voice-dock--warning' : null
      ]"
      :style="{
        width: `${pillWidth}px`,
        height: `${pillHeight}px`,
        borderRadius: `${pillRadius}px`
      }"
    >
      <button
        class="voice-dock__btn voice-dock__btn--cancel"
        type="button"
        data-testid="voice-cancel"
        :style="controlStyle"
        :disabled="!canCancel"
        :aria-label="t('assistant.voicePanel.cancelSession')"
        @click="cancelSession"
      >
        <span class="i-carbon-close" aria-hidden="true" />
      </button>

      <TxBorderBeam
        :active="beamActive"
        :border-radius="pillRadius"
        :duration="beamDurationSeconds"
        :color-variant="beamVariant"
        aria-hidden="true"
      />

      <Transition name="voice-swap">
        <div :key="centerKey" class="voice-dock__slot">
          <span
            v-if="notice?.icon && centerText"
            class="voice-dock__icon"
            :class="notice.icon"
            data-testid="voice-notice-icon"
            aria-hidden="true"
          />
          <p
            v-if="centerText"
            ref="centerTextRef"
            class="voice-dock__text"
            :class="{ 'voice-dock__text--shimmer': showsOrb }"
            :data-testid="notice ? 'voice-notice' : 'voice-hint'"
          >
            <span
              v-for="(char, index) in centerChars"
              :key="`${centerKey}:${index}`"
              class="voice-dock__char"
              :style="{ animationDelay: `${charDelay(index)}ms` }"
              >{{ char }}</span
            >
          </p>
          <div
            v-else-if="listening"
            class="voice-dock__wave"
            data-testid="voice-wave"
            aria-hidden="true"
          >
            <span
              v-for="(level, index) in levels"
              :key="index"
              :style="{ height: `${barHeight(level)}px` }"
            />
          </div>
        </div>
      </Transition>

      <!-- The confirm slot holds either an action or the progress mark, never both. -->
      <TxThinkingOrb
        v-if="showsOrb"
        :key="sessionSeq"
        data-testid="voice-orb"
        :size="64"
        :display-size="controlSize"
        state="random"
        theme="auto"
        :label="t('assistant.voicePanel.voiceTranscribingShort')"
      />
      <!--
        Icon only, and the same circle as the other two: the slot holds one round control
        whatever it means, so a label here would be the only thing in the pill made of words
        competing with the notice that is already saying something.
      -->
      <button
        v-else-if="notice?.action"
        class="voice-dock__btn voice-dock__btn--action"
        type="button"
        data-testid="voice-recover"
        :style="controlStyle"
        :aria-label="actionLabel"
        @click="handleNoticeAction"
      >
        <span :class="actionIcon" aria-hidden="true" />
      </button>
      <button
        v-else
        class="voice-dock__btn voice-dock__btn--confirm"
        type="button"
        data-testid="voice-confirm"
        :style="controlStyle"
        :disabled="!canConfirm"
        :aria-label="t('assistant.voicePanel.stopAndTranscribe')"
        @click="handleConfirm"
      >
        <span class="i-carbon-checkmark" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.voice-panel-root {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.voice-dock {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px;
  box-sizing: border-box;
  border: 1px solid var(--shell-border);
  /* Radius is inline: it tracks the height, so the shape and the size change together. */
  background: var(--shell-surface);
  box-shadow: 0 5px 12px var(--shell-shadow);
  transition:
    width 260ms cubic-bezier(0.22, 1, 0.36, 1),
    height 260ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 260ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 600ms ease-out,
    border-color 160ms ease-out;
}

/*
 * Breathing, not a meter.
 *
 * Before the first level frame there is nothing true to draw, and 24 bars at minimum height
 * would read as a working meter reporting silence. A soft pulse says "opening the device"
 * without claiming to measure anything.
 */
.voice-dock--preparing {
  animation: voice-dock-breathe 2000ms ease-in-out infinite;
}

@keyframes voice-dock-breathe {
  0%,
  100% {
    box-shadow:
      0 5px 12px var(--shell-shadow),
      0 0 0 0 var(--shell-primary-soft);
  }
  50% {
    box-shadow:
      0 5px 12px var(--shell-shadow),
      0 0 0 6px var(--shell-primary-soft);
  }
}

/* Tone rides on the border only: the surface stays neutral so the text keeps its contrast. */
.voice-dock--danger {
  border-color: var(--shell-danger-border);
}

.voice-dock--warning {
  border-color: var(--shell-warning-border);
}

.voice-dock--muted {
  border-color: var(--shell-border);
}

/* Holding Escape outranks every other tone: it is about to discard what was just said. */
.voice-dock--holding {
  border-color: var(--shell-danger-border);
}

.voice-dock {
  position: relative;
}

/*
 * TxBorderBeam is a wrapper: it draws the beam on its own border box and expects content in
 * its slot. Used here as an empty sibling it collapsed to nothing and drew nothing — while
 * still taking a flex slot and one 8px gap. Lifting it out of flow onto the pill's own box is
 * what makes the beam exist at all, and it also makes PILL_CHROME_WIDTH's two-gap arithmetic
 * true (in flow there were three).
 */
.voice-dock :deep([data-beam]) {
  position: absolute;
  border-radius: inherit;
  inset: 0;
  pointer-events: none;
}

/*
 * The recovery action replaces the confirm button rather than joining it: a notice offers one
 * thing to do, and a second circle in that slot would read as a choice that does not exist.
 */
/* Same circle as cancel and confirm — the trailing slot has exactly one shape. */
.voice-dock__btn--action {
  background: var(--shell-surface-2);
  color: var(--shell-text-primary);
  font-size: 16px;
}

.voice-dock__btn--action:hover {
  background: var(--shell-border);
}

.voice-dock__btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-full);
  cursor: pointer;
  font-size: 15px;
  transition:
    width 260ms cubic-bezier(0.22, 1, 0.36, 1),
    height 260ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 160ms ease-out,
    background 160ms ease-out;
}

.voice-dock__btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.voice-dock__btn--cancel {
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
}

.voice-dock__btn--confirm {
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  font-size: 17px;
}

.voice-dock__slot {
  display: flex;
  min-width: 0;
  overflow: hidden;
  height: 34px;
  flex: 1;
  align-items: center;
  justify-content: center;
}

/*
 * The card is two rows, not a row with the controls pushed down.
 *
 * Dropping the controls to the floor while the text stayed in the middle column left a 250px
 * empty band across the bottom — the card was half air. Here the text takes the whole top row
 * (330px instead of 234, so it needs fewer lines in the first place) and the controls own the
 * bottom one. Top is what happened, bottom is what you can do about it.
 *
 * They stay circles at both ends: a control that changes shape or side along with its surface
 * stops being recognisable as the same control.
 */
.voice-dock--expanded {
  display: grid;
  align-items: center;
  column-gap: 8px;
  grid-template-columns: auto 1fr auto;
  /* Row 2 takes whatever is left, so the controls sit on the floor at any card height. */
  grid-template-rows: auto 1fr;
  row-gap: 4px;
}

.voice-dock--expanded .voice-dock__slot {
  height: auto;
  align-self: start;
  grid-area: 1 / 1 / 2 / 4;
  justify-content: flex-start;
}

.voice-dock--expanded .voice-dock__btn--cancel {
  align-self: end;
  grid-area: 2 / 1 / 3 / 2;
}

/* Whichever trailing control is rendered — confirm, recovery action, or the orb. */
.voice-dock--expanded > *:last-child {
  align-self: end;
  grid-area: 2 / 3 / 3 / 4;
}

.voice-dock--expanded .voice-dock__text {
  text-align: left;
}

/* Sized in em so it tracks the caption text it leads. */
.voice-dock__icon {
  flex: 0 0 auto;
  margin-right: 8px;
  font-size: 1.35em;
  color: currentcolor;
}

/*
 * Pinned to the first line rather than centred on the block: an icon drifting to the vertical
 * middle of a two-line paragraph reads as decoration instead of as the subject of the sentence.
 * On one line there is no block to drift in, so it stays centred with the text.
 */
.voice-dock--expanded .voice-dock__icon {
  align-self: flex-start;
  margin-top: 1px;
}

/*
 * The stack takes the flexible row here, not the controls.
 *
 * With `auto 1fr` every spare pixel collects under the text and the icon ends up pinned 5px
 * below a 24px corner — it reads as crowded against the edge it is nearest. Flipping the rows
 * lets the stack centre itself in the space above the controls, and the extra top padding
 * keeps it clear of the curve rather than merely clear of the border.
 */
.voice-dock--icon-card {
  padding-top: 16px;
  grid-template-rows: 1fr auto;
  row-gap: 6px;
}

/*
 * The icon takes the board's warning hue rather than the shell's darkened one.
 *
 * `--shell-warning` is deliberately deepened for 11px chip ink — it has to clear AA on a soft
 * surface — and at icon size that reads as brown rather than as a warning. An icon is a
 * graphic, so the bar it has to clear is 3:1 rather than 4.5:1, which the lighter value passes
 * comfortably. The sentence keeps the accessible ink but grows to 13px/500: the stack has the
 * room, and the muddiness was as much 11px as it was hue.
 */
.voice-dock--icon-card .voice-dock__icon {
  color: #b57a18;
}

.voice-dock--icon-card .voice-dock__text {
  font-size: var(--shell-fs-body);
  font-weight: 500;
}

/*
 * The device card leads with the picture.
 *
 * A microphone with a line through it is the whole message; the sentence under it only names
 * which microphone problem it is. So the icon goes on top at the centre, the sentence sits
 * beneath it, and the two controls stay on the floor at either end — the same two circles in
 * the same two corners as every other card, because they are still the same two controls.
 */
.voice-dock--icon-card .voice-dock__slot {
  flex-direction: column;
  align-self: center;
  justify-content: center;
  gap: 6px;
}

.voice-dock--icon-card .voice-dock__icon {
  align-self: center;
  margin: 0;
  font-size: 1.9em;
}

.voice-dock--icon-card .voice-dock__text {
  -webkit-line-clamp: 1;
  text-align: center;
}

.voice-dock--danger .voice-dock__icon {
  color: var(--shell-danger);
}

.voice-dock--warning .voice-dock__icon {
  color: var(--shell-warning);
}

/*
 * Content changes as one piece, not element by element.
 *
 * The box is already animating its width, height and radius; letting the sentence inside it
 * cut straight to the next one reads as two unrelated events happening at once. The outgoing
 * content blurs and shrinks away, the incoming one blurs and grows in, and because the whole
 * slot is the unit, the icon and its sentence move together rather than racing each other.
 *
 * The leaving copy is taken out of flow so it cannot push the arriving one around — in the
 * card layouts both would otherwise claim the same grid cell.
 */
.voice-swap-enter-active,
.voice-swap-leave-active {
  transition:
    opacity 170ms ease-out,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 220ms ease-out;
}

/*
 * The leaving copy is clipped to its own box, and leaves faster than it used to.
 *
 * It holds the previous sentence at `nowrap`, so while the pill is shrinking from card width
 * back to pill width that sentence is wider than the box it sits in — and with nothing clipping
 * it, it painted *outside* the pill as a faint blurred line trailing the surface. Clipping is
 * the fix; the shorter fade just narrows the window in which the two shapes overlap at all.
 */
.voice-swap-leave-active {
  position: absolute;
  overflow: hidden;
  inset: 5px;
  transition:
    opacity 120ms ease-out,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 160ms ease-out;
}

/*
 * Only the leave blurs as a block now. The arriving content has its own wave of characters, and
 * blurring the whole slot on top of that reads as two effects fighting for the same moment.
 */
.voice-swap-leave-to {
  opacity: 0;
  filter: blur(5px);
  transform: scale(0.86);
}

.voice-dock__wave {
  display: flex;
  align-items: center;
  gap: 2px;
}

.voice-dock__wave span {
  width: 2px;
  border-radius: 1px;
  background: var(--shell-primary);
  /* Matches the 10Hz level cadence, so each bar lands exactly as the next frame arrives. */
  transition: height 100ms linear;
}

/*
 * Two lines, then ellipsis. `-webkit-line-clamp` is what allows the second line at all; the
 * measurement in the script decides whether the island is tall enough for it to show.
 */
.voice-dock__text {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  -webkit-box-orient: vertical;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  -webkit-line-clamp: 2;
  line-height: 1.4;
  /* The pill is symmetric around its centre, so a line that does wrap wraps centred. Only the
     card overrides this: two lines read as a paragraph, and paragraphs are ragged on one side. */
  text-align: center;
  /*
   * One line for the whole width animation.
   *
   * The box takes 260ms to reach the width the text asked for, and until it gets there the text
   * does not fit — so it wrapped, then snapped back onto one line when the box caught up. That
   * flash was the whole "not smooth". Held to one line it simply reveals as the pill opens.
   */
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The card is where wrapping is the point, so it is the card that turns it back on. */
.voice-dock--expanded .voice-dock__text {
  white-space: normal;
}

/*
 * Characters arrive in a wave rather than the sentence appearing at once.
 *
 * `inline-block` is what makes each one animatable, and `pre` keeps the spaces between words
 * from collapsing now that every character is its own box.
 */
.voice-dock__char {
  display: inline-block;
  animation: voice-char-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
  white-space: pre;
}

@keyframes voice-char-in {
  from {
    opacity: 0;
    filter: blur(4px);
    transform: translateY(3px) scale(0.94);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: none;
  }
}

.voice-dock--danger .voice-dock__text {
  color: var(--shell-danger);
}

.voice-dock--warning .voice-dock__text {
  color: var(--shell-warning);
}

.voice-dock--muted .voice-dock__text {
  color: var(--shell-text-muted);
}

/* Only the waiting hint shimmers. A notice is a result, and results should hold still. */
.voice-dock__text--shimmer {
  background: linear-gradient(
    90deg,
    var(--shell-text-muted) 0%,
    var(--shell-text-muted) 35%,
    var(--shell-text-primary) 50%,
    var(--shell-text-muted) 65%,
    var(--shell-text-muted) 100%
  );
  background-clip: text;
  background-size: 240% 100%;
  -webkit-text-fill-color: transparent;
  animation: voice-dock-shimmer 1400ms linear infinite;
}

@keyframes voice-dock-shimmer {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -20% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-dock {
    animation: none;
    transition: border-color 160ms ease-out;
  }

  .voice-dock__wave span {
    transition: none;
  }

  /* No blur, no scale — the swap becomes a plain cut, which is what reduced motion asks for. */
  .voice-swap-enter-active,
  .voice-swap-leave-active {
    transition: opacity 100ms ease-out;
  }

  .voice-swap-leave-to {
    filter: none;
    transform: none;
  }

  /* The sentence arrives all at once, with no delay to stagger and nothing to blur through. */
  .voice-dock__char {
    animation: none;
  }

  /* The controls resize with the surface, so they follow the same rule the surface does. */
  .voice-dock__btn {
    transition:
      opacity 160ms ease-out,
      background 160ms ease-out;
  }

  .voice-dock__text--shimmer {
    background: none;
    color: var(--shell-text-secondary);
    -webkit-text-fill-color: currentcolor;
    animation: none;
  }
}
</style>

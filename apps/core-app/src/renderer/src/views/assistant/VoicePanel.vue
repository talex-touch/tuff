<script lang="ts" setup name="VoicePanel">
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { StreamController } from '@talex-touch/utils/transport/types'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { TxBorderBeam } from '@talex-touch/tuffex/border-beam'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * How long each notice stays before the dock collapses.
 *
 * Cancelling is the shortest on purpose: the user just did it, so telling them at length
 * repeats what they already know. A failure they did not cause needs longer to be read.
 */
const NOTICE_HOLD_MS = {
  muted: 700,
  warning: 1600,
  danger: 900,
  /** A notice carrying a button has to outlast the reflex to reach for it. */
  action: 5000
} as const

/**
 * Escape cancels on hold, not on tap.
 *
 * A tap is what someone does to dismiss a dialog they were not looking at; losing a sentence
 * to that is a bad trade. Holding is deliberate, and the charge is drawn on the border so the
 * commitment is visible before it lands.
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
type NoticeAction = 'undo' | 'retry'
type Notice = { message: string; tone: NoticeTone; action?: NoticeAction }

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
/**
 * Two lines of caption text with room around them — the tallest the island ever gets.
 *
 * Not the 64 that two lines strictly need: at that height the text block fills the card edge
 * to edge and the pill reads as a pill someone stretched. A card is allowed to have air.
 */
const PILL_TALL_HEIGHT = 76
/**
 * The shape changes with the height, not just the size.
 *
 * A pill radius is half its height by definition, so keeping `radius: full` at 76px turns the
 * two ends into oversized semicircles and eats the room the second line needs. Expanding into
 * a rounded rectangle is what the shape is actually doing — one line is a pill, two lines is a
 * card — so the radius says so, and stays far below the 38 that would make it a pill again.
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

const props = withDefaults(
  defineProps<{
    managedByDock?: boolean
  }>(),
  { managedByDock: false }
)

const emit = defineEmits<{
  finished: []
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
const pillWidth = ref(PILL_BASE_WIDTH)
const pillHeight = ref(PILL_BASE_HEIGHT)
const expanded = computed(() => pillHeight.value > PILL_BASE_HEIGHT)
const pillRadius = computed(() =>
  expanded.value ? PILL_TALL_RADIUS : Math.round(PILL_BASE_HEIGHT / 2)
)
const controlSize = computed(() => (expanded.value ? CONTROL_TALL_SIZE : CONTROL_BASE_SIZE))
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
const voiceWakeEnabled = computed(() => runtimeConfig.value.enabled)
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

let voiceStreamController: StreamController | null = null
let keepListening = false
let disposePanelOpen: (() => void) | null = null
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
  emit('finished')
}

function showNotice(message: string, tone: NoticeTone, action?: NoticeAction): void {
  notice.value = { message, tone, ...(action ? { action } : {}) }
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
    return { message: t('assistant.voicePanel.microphoneDenied'), tone: 'warning' }

  const deviceMissing =
    /CANNOT_?FIND|NO_?(INPUT_?)?DEVICE|DEVICE_?NOT_?FOUND|NO_?MICROPHONE|CAPTURE_?UNAVAILABLE|UNSUPPORTED/
  if (deviceMissing.test(haystack))
    return { message: t('assistant.voicePanel.microphoneMissing'), tone: 'warning' }

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

async function loadRuntimeConfig(): Promise<void> {
  try {
    runtimeConfig.value = await transport.send(
      AssistantEvents.floatingBall.getRuntimeConfig,
      undefined
    )
  } catch (error) {
    // A late settings failure must not turn an already-running microphone session into a
    // misleading error surface; the session can safely use the default language.
    if (!voiceActive.value) showNotice(classifyFailure(error).message, 'danger')
  }
}

function cancelVoiceSession(): void {
  keepListening = false
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  const controller = voiceStreamController
  voiceStreamController = null
  controller?.cancel()
}

/**
 * Stop capturing but let the session finish.
 *
 * Deliberately not `cancel()`: cancelling aborts the whole session main-side, so the
 * transcript is never delivered. The controller is kept because `final` and `end` are
 * still coming — they are what ends the thinking phase.
 */
function finishVoiceInput(): void {
  if (finished || !listening.value) return
  keepListening = false
  listening.value = false
  transcribing.value = true
  startingVoiceCapture.value = false

  stopWaitClock()
  waitTimer = setInterval(() => {
    waitedMs.value += 100
  }, 100)

  const controller = voiceStreamController
  if (controller?.stop) {
    controller.stop()
    return
  }

  // A transport without `stop` cannot finalize; discarding is the only honest fallback.
  voiceStreamController = null
  controller?.cancel()
  emitFinished()
}

function handleVoiceSessionEvent(event: VoiceAsrStreamEvent): void {
  if (event.type === 'level') {
    // The handover is the data arriving, not a timer: the meter takes over the moment it has
    // something true to draw.
    hasLevel.value = true
    stopCaptureStartTimer()
    levels.value = [...levels.value.slice(1), normalizeLevel(event.rms)]
    return
  }
  if (event.type === 'partial' || event.type === 'final') {
    return
  }

  listening.value = false
  transcribing.value = false
  voiceStreamController = null
  keepListening = false
  emitFinished()
}

function showVoiceSessionError(error: unknown): void {
  voiceStreamController = null
  keepListening = false
  const classified = classifyFailure(error)
  // Quota and congestion get no retry button: retrying is still out of credit, still busy.
  const retryable = classified.tone === 'danger'
  showNotice(classified.message, classified.tone, retryable ? 'retry' : undefined)
}

async function startVoiceSession(force = false): Promise<void> {
  if (!force && !voiceWakeEnabled.value) {
    showNotice(t('assistant.voicePanel.voiceWakeDisabled'), 'warning')
    return
  }
  if (voiceStreamController || startingVoiceCapture.value || transcribing.value) return

  clearFinishTimer()
  finished = false
  keepListening = true
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
    if (hasLevel.value || !listening.value) return
    // Not slow — not answering. Breathing forever would be its own kind of lie.
    cancelVoiceSession()
    showNotice(t('assistant.voicePanel.microphoneUnresponsive'), 'warning')
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
        onData: handleVoiceSessionEvent,
        onError: showVoiceSessionError,
        onEnd: () => {
          listening.value = false
          transcribing.value = false
          startingVoiceCapture.value = false
          voiceStreamController = null
          keepListening = false
          emitFinished()
        }
      }
    )
    if (keepListening) {
      voiceStreamController = controller
    } else {
      controller.cancel()
    }
  } catch (error) {
    showVoiceSessionError(error)
  } finally {
    startingVoiceCapture.value = false
  }
}

async function offerRecoveryIfAny(): Promise<void> {
  try {
    const status = await voiceSdk.recoveryStatus()
    if (!status.available) return
    // The affordance that makes the retention window reachable at all: without it, audio kept
    // past the five seconds the pill is on screen has no entry point.
    showNotice(
      t(
        status.kind === 'failed'
          ? 'assistant.voicePanel.recoverFailed'
          : 'assistant.voicePanel.recoverCancelled'
      ),
      'muted',
      status.kind === 'failed' ? 'retry' : 'undo'
    )
  } catch {
    // Recovery is a bonus; failing to ask must not stop the user from speaking.
  }
}

async function handlePanelOpened(): Promise<void> {
  cancelVoiceSession()
  resetPanelState()
  // Configuration is a hint for the next request, not a prerequisite for opening the mic.
  // Keep the default language immediately usable and refresh the setting in the background.
  void loadRuntimeConfig()
  void offerRecoveryIfAny()
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
async function recoverLast(): Promise<void> {
  const action = notice.value?.action
  if (!action) return

  clearFinishTimer()
  notice.value = null
  recovering.value = true
  sessionSeq.value += 1

  try {
    const result = await voiceSdk.retryLastFailure({ delivery: 'active-app' })
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
    recovering.value = false
    const classified = classifyFailure(error)
    showNotice(classified.message, classified.tone, 'retry')
  }
}

function beginCancelHold(): void {
  if (holdTimer !== null || !canCancel.value) return
  const startedAt = Date.now()
  holdTimer = setInterval(() => {
    const progress = (Date.now() - startedAt) / CANCEL_HOLD_MS
    cancelCharge.value = Math.min(1, progress)
    if (progress < 1) return
    stopHold()
    cancelSession()
  }, CHARGE_TICK_MS)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (event.repeat || !canCancel.value) return
  beginCancelHold()
}

function handleKeyup(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  // Released early: the charge unwinds and nothing is lost. That is the point of the hold.
  stopHold()
}

// Measured rather than expressed in CSS: `width: fit-content` is not animatable without
// `interpolate-size`, and the window behind the pill deliberately never resizes.
watch([centerText, showsOrb], async () => {
  if (!centerText.value) {
    pillWidth.value = PILL_BASE_WIDTH
    pillHeight.value = PILL_BASE_HEIGHT
    return
  }
  await nextTick()
  const textWidth = centerTextRef.value?.scrollWidth ?? 0
  pillWidth.value = Math.min(
    PILL_MAX_WIDTH,
    Math.max(PILL_BASE_WIDTH, textWidth + PILL_CHROME_WIDTH)
  )

  // Width first, height second. Truncating at the cap loses the half of the sentence that
  // says what to do — "Cannot find m…" is exactly the wrong half to drop — so once the widest
  // line still does not fit, the island grows instead.
  await nextTick()
  const element = centerTextRef.value
  pillHeight.value =
    element && element.scrollWidth > element.clientWidth ? PILL_TALL_HEIGHT : PILL_BASE_HEIGHT
})

defineExpose({
  openPanel: handlePanelOpened,
  startVoiceInput: (): void => {
    void startVoiceSession(true)
  },
  stopVoiceInput: finishVoiceInput
})

onMounted(() => {
  if (!props.managedByDock) {
    disposePanelOpen = transport.on(AssistantEvents.voice.panelOpened, async () => {
      await handlePanelOpened()
    })
    void loadRuntimeConfig()
  }
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
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
      class="voice-dock"
      role="status"
      aria-live="polite"
      :aria-busy="voiceActive"
      :class="[
        notice ? `voice-dock--${notice.tone}` : null,
        preparing ? 'voice-dock--preparing' : null,
        expanded ? 'voice-dock--expanded' : null,
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

      <div class="voice-dock__slot">
        <p
          v-if="centerText"
          ref="centerTextRef"
          class="voice-dock__text"
          :class="{ 'voice-dock__text--shimmer': showsOrb }"
          :data-testid="notice ? 'voice-notice' : 'voice-hint'"
        >
          {{ centerText }}
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
        :aria-label="
          notice.action === 'undo'
            ? t('assistant.voicePanel.undo')
            : t('assistant.voicePanel.retry')
        "
        @click="recoverLast"
      >
        <span
          :class="notice.action === 'undo' ? 'i-carbon-undo' : 'i-carbon-renew'"
          aria-hidden="true"
        />
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

/* The beam is drawn on the pill's own border box, so it has to be positioned, not in flow. */
.voice-dock {
  position: relative;
}

.voice-dock :deep(.tx-border-beam) {
  border-radius: inherit;
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
  height: 34px;
  flex: 1;
  align-items: center;
  justify-content: center;
}

/*
 * Two lines read as a paragraph, not as a label. Centring them leaves ragged edges on both
 * sides; the round controls stay vertically centred because they are still controls.
 */
.voice-dock--expanded .voice-dock__slot {
  height: auto;
  justify-content: flex-start;
}

.voice-dock--expanded .voice-dock__text {
  text-align: left;
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
  text-overflow: ellipsis;
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

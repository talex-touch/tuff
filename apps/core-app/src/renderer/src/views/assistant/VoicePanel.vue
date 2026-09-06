<script lang="ts" setup name="VoicePanel">
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { StreamController } from '@talex-touch/utils/transport/types'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const ERROR_DISPLAY_MS = 900

/** Bars in the input meter. Each one holds a single 10Hz level frame, so 24 ≈ 2.4s of history. */
const WAVE_BAR_COUNT = 24
const WAVE_BAR_MIN_HEIGHT = 3
const WAVE_BAR_MAX_HEIGHT = 28

const PILL_BASE_WIDTH = 200
const PILL_MAX_WIDTH = 340
/** padding (10) + both buttons (68) + both gaps (16); the notice gets whatever is left. */
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
const errorMessage = ref('')
const sessionSeq = ref(0)
const levels = ref<number[]>(new Array(WAVE_BAR_COUNT).fill(0))
const noticeRef = ref<HTMLElement | null>(null)
const pillWidth = ref(PILL_BASE_WIDTH)

const voiceSdk = createVoiceSdk(transport)
const voiceWakeEnabled = computed(() => runtimeConfig.value.enabled)
const voiceActive = computed(
  () => listening.value || transcribing.value || startingVoiceCapture.value
)

const hasNotice = computed(() => !!errorMessage.value)
const canCancel = computed(() => listening.value || hasNotice.value)
const canConfirm = computed(() => listening.value && !hasNotice.value)

let voiceStreamController: StreamController | null = null
let keepListening = false
let disposePanelOpen: (() => void) | null = null
let finishTimer: ReturnType<typeof setTimeout> | null = null
let finished = false

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

function resetPanelState(): void {
  clearFinishTimer()
  finished = false
  errorMessage.value = ''
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  levels.value = new Array(WAVE_BAR_COUNT).fill(0)
}

async function loadRuntimeConfig(): Promise<void> {
  try {
    runtimeConfig.value = await transport.send(
      AssistantEvents.floatingBall.getRuntimeConfig,
      undefined
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
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
    levels.value = [...levels.value.slice(1), event.rms]
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
  errorMessage.value =
    error instanceof Error && error.message
      ? error.message
      : t('assistant.voicePanel.voiceTranscribeFailed')
  listening.value = false
  transcribing.value = false
  startingVoiceCapture.value = false
  voiceStreamController = null
  keepListening = false
  clearFinishTimer()
  finishTimer = setTimeout(() => {
    finishTimer = null
    emitFinished()
  }, ERROR_DISPLAY_MS)
}

async function startVoiceSession(force = false): Promise<void> {
  if (!force && !voiceWakeEnabled.value) {
    errorMessage.value = t('assistant.voicePanel.voiceWakeDisabled')
    return
  }
  if (voiceStreamController || startingVoiceCapture.value || transcribing.value) return

  clearFinishTimer()
  finished = false
  keepListening = true
  startingVoiceCapture.value = true
  listening.value = true
  errorMessage.value = ''
  levels.value = new Array(WAVE_BAR_COUNT).fill(0)
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

async function handlePanelOpened(): Promise<void> {
  cancelVoiceSession()
  resetPanelState()
  await loadRuntimeConfig()
  await nextTick()
}

function handleCancel(): void {
  if (!canCancel.value) return
  clearFinishTimer()
  cancelVoiceSession()
  emitFinished()
}

function handleConfirm(): void {
  if (!canConfirm.value) return
  finishVoiceInput()
}

// Measured rather than expressed in CSS: `width: fit-content` is not animatable without
// `interpolate-size`, and the window behind the pill deliberately never resizes.
watch([hasNotice, errorMessage], async () => {
  if (!hasNotice.value) {
    pillWidth.value = PILL_BASE_WIDTH
    return
  }
  await nextTick()
  const textWidth = noticeRef.value?.scrollWidth ?? 0
  pillWidth.value = Math.min(
    PILL_MAX_WIDTH,
    Math.max(PILL_BASE_WIDTH, textWidth + PILL_CHROME_WIDTH)
  )
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
  }
  void loadRuntimeConfig()
})

onBeforeUnmount(() => {
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
      :class="{ 'voice-dock--notice': hasNotice }"
      :style="{ width: `${pillWidth}px` }"
    >
      <button
        class="voice-dock__btn voice-dock__btn--cancel"
        type="button"
        data-testid="voice-cancel"
        :disabled="!canCancel"
        :aria-label="t('assistant.voicePanel.cancelSession')"
        @click="handleCancel"
      >
        <span class="i-carbon-close" aria-hidden="true" />
      </button>

      <div class="voice-dock__slot">
        <p v-if="hasNotice" ref="noticeRef" class="voice-dock__notice" data-testid="voice-notice">
          {{ errorMessage }}
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
        <TxThinkingOrb
          v-else
          :key="sessionSeq"
          data-testid="voice-orb"
          :size="64"
          :display-size="28"
          theme="auto"
          :label="t('assistant.voicePanel.voiceTranscribingShort')"
        />
      </div>

      <button
        class="voice-dock__btn voice-dock__btn--confirm"
        type="button"
        data-testid="voice-confirm"
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
  height: 44px;
  align-items: center;
  gap: 8px;
  padding: 5px;
  box-sizing: border-box;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface);
  box-shadow: 0 5px 12px var(--shell-shadow);
  transition:
    width 260ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 160ms ease-out;
}

.voice-dock--notice {
  border-color: var(--shell-danger-border);
}

.voice-dock__btn {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-full);
  cursor: pointer;
  font-size: 15px;
  transition:
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

.voice-dock__notice {
  overflow: hidden;
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-caption);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .voice-dock {
    transition: border-color 160ms ease-out;
  }

  .voice-dock__wave span {
    transition: none;
  }
}
</style>

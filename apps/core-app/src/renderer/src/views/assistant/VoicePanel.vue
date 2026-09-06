<script lang="ts" setup name="VoicePanel">
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { StreamController } from '@talex-touch/utils/transport/types'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const ERROR_DISPLAY_MS = 900

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
const transcribingVoice = ref(false)
const startingVoiceCapture = ref(false)
const errorMessage = ref('')
const statusMessage = ref('')
const voiceSdk = createVoiceSdk(transport)
const voiceWakeEnabled = computed(() => runtimeConfig.value.enabled)
const panelStatusText = computed(() => {
  if (errorMessage.value) return errorMessage.value
  if (startingVoiceCapture.value) return t('assistant.voicePanel.voicePreparing')
  if (transcribingVoice.value) return t('assistant.voicePanel.voiceTranscribing')
  if (listening.value) return t('assistant.voicePanel.listening')
  return statusMessage.value
})
const voiceActive = computed(
  () => listening.value || transcribingVoice.value || startingVoiceCapture.value
)

let voiceStreamController: StreamController | null = null
let keepListening = false
let disposePanelOpen: (() => void) | null = null
let finishTimer: ReturnType<typeof setTimeout> | null = null
let finished = false

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
  statusMessage.value = ''
  listening.value = false
  transcribingVoice.value = false
  startingVoiceCapture.value = false
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
  transcribingVoice.value = false
  startingVoiceCapture.value = false
  const controller = voiceStreamController
  voiceStreamController = null
  controller?.cancel()
}

function finishVoiceInput(): void {
  if (finished) return
  keepListening = false
  listening.value = false
  transcribingVoice.value = true
  startingVoiceCapture.value = false
  statusMessage.value = t('assistant.voicePanel.voiceTranscribing')
  const controller = voiceStreamController
  voiceStreamController = null
  controller?.cancel()
  emitFinished()
}

function handleVoiceSessionEvent(event: VoiceAsrStreamEvent): void {
  if (event.type === 'partial') {
    statusMessage.value = t('assistant.voicePanel.voiceTranscribing')
    return
  }
  if (event.type === 'final') {
    statusMessage.value =
      event.delivery?.method === 'none'
        ? t('assistant.voicePanel.submitFailed')
        : t('assistant.voicePanel.voiceTranscribed')
    return
  }

  listening.value = false
  transcribingVoice.value = false
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
  transcribingVoice.value = false
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
  if (voiceStreamController || startingVoiceCapture.value || transcribingVoice.value) return

  clearFinishTimer()
  finished = false
  keepListening = true
  startingVoiceCapture.value = true
  listening.value = true
  errorMessage.value = ''
  statusMessage.value = t('assistant.voicePanel.voicePreparing')
  try {
    const controller = await voiceSdk.asrStream(
      {
        language: runtimeConfig.value.language,
        cleanup: true,
        delivery: 'active-app'
      },
      {
        onData: handleVoiceSessionEvent,
        onError: showVoiceSessionError,
        onEnd: () => {
          listening.value = false
          transcribingVoice.value = false
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
      class="voice-panel"
      role="status"
      aria-live="polite"
      :aria-busy="voiceActive"
      :class="{ 'voice-panel--active': voiceActive, 'voice-panel--error': !!errorMessage }"
    >
      <span class="voice-panel-mark" aria-hidden="true">
        <span class="i-carbon-microphone-filled" />
      </span>
      <p class="voice-panel-status">{{ panelStatusText }}</p>
      <div class="voice-signal" :class="{ active: voiceActive }" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
</template>

<style scoped>
.voice-panel-root {
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
}

.voice-panel {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  box-sizing: border-box;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-xl);
  background: var(--shell-surface);
  box-shadow: 0 8px 14px var(--shell-shadow);
}

.voice-panel--error {
  border-color: var(--shell-danger-border);
}

.voice-panel-mark {
  display: inline-flex;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
  font-size: 14px;
}

.voice-panel--error .voice-panel-mark {
  border-color: var(--shell-danger-border);
  background: var(--shell-danger-soft);
  color: var(--shell-danger);
}

.voice-panel-status {
  min-width: 0;
  flex: 1;
  margin: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-caption);
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-panel--error .voice-panel-status {
  color: var(--shell-danger);
}

.voice-signal {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 36px;
  height: 20px;
  opacity: 0.45;
}

.voice-signal span {
  width: 3px;
  height: 6px;
  border-radius: 3px;
  background: var(--shell-primary);
  transform-origin: center;
}

.voice-signal span:nth-child(2) {
  height: 11px;
}

.voice-signal span:nth-child(3) {
  height: 17px;
}

.voice-signal span:nth-child(4) {
  height: 12px;
}

.voice-signal span:nth-child(5) {
  height: 8px;
}

.voice-signal.active {
  opacity: 1;
}

.voice-signal.active span {
  animation: voice-signal-pulse 620ms ease-in-out infinite alternate;
}

.voice-signal.active span:nth-child(2) {
  animation-delay: -180ms;
}

.voice-signal.active span:nth-child(3) {
  animation-delay: -320ms;
}

.voice-signal.active span:nth-child(4) {
  animation-delay: -100ms;
}

@keyframes voice-signal-pulse {
  from {
    transform: scaleY(0.55);
  }
  to {
    transform: scaleY(1.16);
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-signal.active span {
    animation: none;
  }
}
</style>

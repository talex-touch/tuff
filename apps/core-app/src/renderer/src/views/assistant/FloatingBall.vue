<script lang="ts" setup name="FloatingBall">
import type { AssistantRuntimeConfig } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import type { StreamController } from '@talex-touch/utils/transport/types'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createVoiceSdk } from '@talex-touch/utils/transport/sdk/domains/voice'
import { useI18n } from 'vue-i18n'

const transport = useTuffTransport()
const { t } = useI18n()
const runtimeConfig = ref<AssistantRuntimeConfig>({
  enabled: false,
  language: 'zh-CN',
  wakeWords: ['阿洛', 'aler'],
  cooldownMs: 2200,
  continuous: true,
  assistantName: '阿洛 aler',
  openPanelOnWake: true
})

const listening = ref(false)
const errorMessage = ref('')
const isDragging = ref(false)
const lastHeard = ref('')
const voiceSdk = createVoiceSdk(transport)
const dragState = reactive({
  active: false,
  originX: 0,
  originY: 0,
  offsetX: 0,
  offsetY: 0
})

let voiceStreamController: StreamController | null = null
let wakeGeneration = 0
let lastWakeAt = 0
let lastMoveAt = 0

const statusText = computed(() => {
  if (errorMessage.value) return errorMessage.value
  if (!runtimeConfig.value.enabled) return t('assistant.floatingBall.voiceWakeOff')
  if (listening.value) {
    return t('assistant.floatingBall.listening', {
      wakeWords: runtimeConfig.value.wakeWords.join(' / ')
    })
  }
  return t('assistant.floatingBall.clickToOpen')
})

const showWakeBadge = computed(() => runtimeConfig.value.enabled && listening.value)

function normalizeWakeText(text: string): string {
  return text.toLowerCase().replace(/[\s,.!?，。！？、;；:：'"`~\-_/\\(){}\[\]]/g, '')
}

function scheduleRestart(): void {
  if (!runtimeConfig.value.enabled || wakeGeneration === 0) return
  setTimeout(() => {
    if (runtimeConfig.value.enabled && !voiceStreamController) void startWakeListening()
  }, 600)
}

function stopWakeListening(): void {
  wakeGeneration += 1
  listening.value = false
  const controller = voiceStreamController
  voiceStreamController = null
  controller?.cancel()
}

function maybeWake(transcript: string): void {
  if (!runtimeConfig.value.enabled || !runtimeConfig.value.openPanelOnWake) return
  const now = Date.now()
  if (now - lastWakeAt < runtimeConfig.value.cooldownMs) return

  const normalized = normalizeWakeText(transcript)
  const matched = runtimeConfig.value.wakeWords.some((wakeWord) => {
    return normalized.includes(normalizeWakeText(wakeWord))
  })
  if (!matched) return

  lastWakeAt = now
  stopWakeListening()
  void transport.send(AssistantEvents.floatingBall.openVoicePanel, { source: 'wake-word' })
}

function handleWakeEvent(event: VoiceAsrStreamEvent): void {
  if (event.type === 'partial' || event.type === 'final') {
    if (!event.text) return
    lastHeard.value = event.text
    maybeWake(event.text)
    return
  }
  listening.value = false
  voiceStreamController = null
  scheduleRestart()
}

async function startWakeListening(): Promise<void> {
  if (!runtimeConfig.value.enabled) {
    stopWakeListening()
    return
  }
  if (voiceStreamController) return

  const generation = ++wakeGeneration
  errorMessage.value = ''
  listening.value = true
  try {
    const controller = await voiceSdk.asrStream(
      {
        language: runtimeConfig.value.language,
        cleanup: false,
        delivery: 'none'
      },
      {
        onData: handleWakeEvent,
        onError: (error) => {
          if (generation !== wakeGeneration) return
          listening.value = false
          voiceStreamController = null
          errorMessage.value =
            error instanceof Error
              ? error.message
              : t('assistant.floatingBall.recognitionError', { error: 'voice-session-failed' })
          scheduleRestart()
        },
        onEnd: () => {
          if (generation !== wakeGeneration) return
          listening.value = false
          voiceStreamController = null
          scheduleRestart()
        }
      }
    )
    if (generation !== wakeGeneration || !runtimeConfig.value.enabled) {
      controller.cancel()
      return
    }
    voiceStreamController = controller
  } catch (error) {
    if (generation !== wakeGeneration) return
    listening.value = false
    errorMessage.value =
      error instanceof Error
        ? error.message
        : t('assistant.floatingBall.recognitionError', { error: 'voice-session-failed' })
    scheduleRestart()
  }
}

async function loadRuntimeConfig(): Promise<void> {
  try {
    const next = await transport.send(AssistantEvents.floatingBall.getRuntimeConfig, undefined)
    runtimeConfig.value = next
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function openVoicePanel(source: 'click' | 'wake-word'): Promise<void> {
  await transport.send(AssistantEvents.floatingBall.openVoicePanel, { source })
}

function updateFloatingBallPosition(x: number, y: number): void {
  const now = Date.now()
  if (now - lastMoveAt < 16) return
  lastMoveAt = now
  void transport.send(AssistantEvents.floatingBall.updatePosition, { x, y })
}

function onPointerMove(event: MouseEvent): void {
  if (!dragState.active) return

  const deltaX = Math.abs(event.screenX - dragState.originX)
  const deltaY = Math.abs(event.screenY - dragState.originY)
  if (!isDragging.value && (deltaX > 3 || deltaY > 3)) {
    isDragging.value = true
  }
  if (!isDragging.value) return

  const nextX = Math.round(event.screenX - dragState.offsetX)
  const nextY = Math.round(event.screenY - dragState.offsetY)
  updateFloatingBallPosition(nextX, nextY)
}

function onPointerUp(): void {
  dragState.active = false
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  setTimeout(() => {
    isDragging.value = false
  }, 0)
}

function onPointerDown(event: MouseEvent): void {
  dragState.active = true
  dragState.originX = event.screenX
  dragState.originY = event.screenY
  dragState.offsetX = event.clientX
  dragState.offsetY = event.clientY
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)
}

function onBallClick(): void {
  if (isDragging.value) return
  void openVoicePanel('click')
}

onMounted(async () => {
  await loadRuntimeConfig()
  startWakeListening()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  stopWakeListening()
})
</script>

<template>
  <div class="floating-ball-root" @mousedown="onPointerDown" @click="onBallClick">
    <div
      class="floating-ball"
      :title="statusText"
      :class="{ listening: showWakeBadge, error: !!errorMessage }"
    >
      <span class="assistant-char">阿</span>
    </div>
    <div v-if="showWakeBadge" class="wake-dot" />
  </div>
</template>

<style scoped>
.floating-ball-root {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  cursor: grab;
}

.floating-ball-root:active {
  cursor: grabbing;
}

.floating-ball {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fef3c7, #f97316 72%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 24px rgba(120, 53, 15, 0.35);
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease;
}

.floating-ball:hover {
  transform: scale(1.04);
  box-shadow: 0 12px 26px rgba(120, 53, 15, 0.45);
}

.floating-ball.listening {
  box-shadow:
    0 0 0 6px rgba(251, 146, 60, 0.2),
    0 12px 26px rgba(120, 53, 15, 0.45);
}

.floating-ball.error {
  background: radial-gradient(circle at 30% 30%, #fecaca, #ef4444 72%);
}

.assistant-char {
  color: #7c2d12;
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.wake-dot {
  position: absolute;
  right: 5px;
  bottom: 4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.15);
}
</style>

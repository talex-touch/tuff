<script lang="ts" setup name="VoiceDock">
import type { AssistantVoiceCommandPayload } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import FloatingBall from './FloatingBall.vue'
import VoicePanel from './VoicePanel.vue'

type VoicePanelHandle = {
  openPanel: (source?: string) => Promise<void>
  startVoiceInput: () => void
  stopVoiceInput: () => void
}

const PROCESSING_TRANSITION_MS = 520

const transport = useTuffTransport()
const expanded = ref(false)
const processing = ref(false)
const panel = ref<VoicePanelHandle | null>(null)

let disposePanelOpened: (() => void) | null = null
let disposePanelClosed: (() => void) | null = null
let disposeCommand: (() => void) | null = null
let processingTimer: ReturnType<typeof setTimeout> | null = null

function clearProcessingTimer(): void {
  if (processingTimer === null) return
  clearTimeout(processingTimer)
  processingTimer = null
}

function showFloatingBallAfterProcessing(): void {
  clearProcessingTimer()
  processing.value = true
  processingTimer = setTimeout(() => {
    processingTimer = null
    processing.value = false
  }, PROCESSING_TRANSITION_MS)
}

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  clearProcessingTimer()
  processing.value = false
  expanded.value = true
  await nextTick()
  await panel.value?.openPanel(payload?.source)
}
function handlePanelFinished(): void {
  expanded.value = false
  showFloatingBallAfterProcessing()
  void transport.send(AssistantEvents.voice.closePanel, undefined)
}

function handlePanelClosed(): void {
  expanded.value = false
  showFloatingBallAfterProcessing()
}

async function handleCommand(payload: AssistantVoiceCommandPayload): Promise<void> {
  if (payload.action === 'stop') {
    if (expanded.value) panel.value?.stopVoiceInput()
    return
  }

  clearProcessingTimer()
  processing.value = false
  expanded.value = true
  await nextTick()
  panel.value?.startVoiceInput()
}

onMounted(() => {
  disposePanelOpened = transport.on(AssistantEvents.voice.panelOpened, (payload) => {
    void handlePanelOpened(payload)
  })
  disposePanelClosed = transport.on(AssistantEvents.voice.panelClosed, () => {
    handlePanelClosed()
  })
  disposeCommand = transport.on(AssistantEvents.voice.command, (payload) => {
    void handleCommand(payload)
  })
})

onBeforeUnmount(() => {
  disposePanelOpened?.()
  disposePanelOpened = null
  disposePanelClosed?.()
  disposePanelClosed = null
  disposeCommand?.()
  disposeCommand = null
  clearProcessingTimer()
})
</script>

<template>
  <div class="voice-dock-root" :class="{ 'voice-dock-root--expanded': expanded }">
    <Transition name="voice-dock-surface" mode="out-in">
      <VoicePanel
        v-if="expanded"
        key="panel"
        ref="panel"
        managed-by-dock
        @finished="handlePanelFinished"
      />
      <div
        v-else-if="processing"
        key="processing"
        class="voice-dock-processing"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="voice-dock-processing__ring" aria-hidden="true" />
      </div>
      <FloatingBall v-else key="floating-ball" />
    </Transition>
  </div>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  background: transparent !important;
}

.voice-dock-root {
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.voice-dock-root--expanded {
  isolation: isolate;
}

.voice-dock-root :deep(.floating-ball-root) {
  pointer-events: auto;
}

.voice-dock-processing {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.voice-dock-processing__ring {
  width: 28px;
  height: 28px;
  border: 2px solid var(--shell-border);
  border-top-color: var(--shell-primary);
  border-radius: 50%;
  animation: voice-dock-processing-spin 680ms linear infinite;
}

@keyframes voice-dock-processing-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-dock-processing__ring {
    animation: none;
  }
}

.voice-dock-surface-enter-active,
.voice-dock-surface-leave-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.voice-dock-surface-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.94);
}

.voice-dock-surface-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .voice-dock-surface-enter-active,
  .voice-dock-surface-leave-active {
    transition: opacity 100ms ease-out;
  }

  .voice-dock-surface-enter-from,
  .voice-dock-surface-leave-to {
    transform: none;
  }
}
</style>

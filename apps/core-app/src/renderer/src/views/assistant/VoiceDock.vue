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

const transport = useTuffTransport()
const expanded = ref(false)
const panel = ref<VoicePanelHandle | null>(null)

let disposePanelOpened: (() => void) | null = null
let disposePanelClosed: (() => void) | null = null
let disposeCommand: (() => void) | null = null

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  expanded.value = true
  await nextTick()
  await panel.value?.openPanel(payload?.source)
}

// No intermediate spinner: the panel owns the whole session now, including the wait for the
// transcript, which it shows as the thinking orb inside the pill.
function handlePanelFinished(): void {
  expanded.value = false
  void transport.send(AssistantEvents.voice.closePanel, undefined)
}

function handlePanelClosed(): void {
  expanded.value = false
}

async function handleCommand(payload: AssistantVoiceCommandPayload): Promise<void> {
  if (payload.action === 'stop') {
    if (expanded.value) panel.value?.stopVoiceInput()
    return
  }

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

/*
 * The window is a transparent canvas wider than the pill, so the pill can animate its own
 * width without a window resize. Only the visible surfaces take pointer events.
 */
.voice-dock-root {
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.voice-dock-root--expanded {
  isolation: isolate;
}

.voice-dock-root :deep(.floating-ball-root),
.voice-dock-root :deep(.voice-dock) {
  pointer-events: auto;
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

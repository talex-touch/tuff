<script lang="ts" setup name="VoiceDock">
import type { AssistantVoiceCommandPayload } from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

let dockGeneration = 0
let voiceStartIssued = false
let panelReady: Promise<void> | null = null
let pendingStop = false
let disposePanelOpened: (() => void) | null = null
let disposePanelClosed: (() => void) | null = null
let disposeCommand: (() => void) | null = null

/**
 * Resolve once VoicePanel actually exists.
 *
 * `<Transition mode="out-in">` keeps the panel unmounted until the ball's leave transition has
 * finished, so the template ref is still null a tick after `expanded` flips. Reading it there
 * and calling through `?.` is how the dock ends up on screen with an empty pill and no session:
 * the open and the start were both issued to nobody, silently. Resolves null if the dock
 * collapses while we are still waiting — there is nothing left to start by then.
 */
function whenPanelReady(): Promise<VoicePanelHandle | null> {
  if (panel.value || !expanded.value) return Promise.resolve(panel.value)
  return new Promise((resolve) => {
    const stop = watch([panel, expanded], () => {
      if (!panel.value && expanded.value) return
      stop()
      resolve(panel.value)
    })
  })
}

function startVoiceInputOnce(): void {
  const voicePanel = panel.value
  if (!expanded.value || !voicePanel || voiceStartIssued || pendingStop) return
  voiceStartIssued = true
  voicePanel.startVoiceInput()
}

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  if (expanded.value && (panel.value || panelReady)) return
  const generation = ++dockGeneration
  expanded.value = true
  voiceStartIssued = false

  const opening = (async (): Promise<void> => {
    const voicePanel = await whenPanelReady()
    if (generation !== dockGeneration || !expanded.value) return
    await voicePanel?.openPanel(payload?.source)
  })()
  panelReady = opening
  try {
    await opening
  } finally {
    if (panelReady === opening) panelReady = null
  }

  // VoiceDock is a recording HUD, not a second confirmation screen: every open action starts
  // the shared session once the panel has reset its state. A repeated command notification is
  // harmless because the start gate below is idempotent.
  if (generation !== dockGeneration || !expanded.value) return
  if (pendingStop) {
    pendingStop = false
    handlePanelFinished(generation)
    return
  }
  startVoiceInputOnce()
}

// No intermediate spinner: the panel owns the whole session now, including the wait for the
// transcript, which it shows as the thinking orb inside the pill.
function handlePanelFinished(generation?: number): void {
  if (generation !== undefined && generation !== dockGeneration) return
  dockGeneration += 1
  expanded.value = false
  panel.value = null
  voiceStartIssued = false
  pendingStop = false
  panelReady = null
  void transport.send(AssistantEvents.voice.closePanel, undefined)
}

function handlePanelClosed(): void {
  dockGeneration += 1
  expanded.value = false
  panel.value = null
  voiceStartIssued = false
  pendingStop = false
  panelReady = null
}

async function handleCommand(payload: AssistantVoiceCommandPayload): Promise<void> {
  const generation = dockGeneration
  if (payload.action === 'stop') {
    pendingStop = true
    const ready = panelReady
    if (ready) await ready
    if (generation !== dockGeneration) return
    if (!expanded.value) {
      pendingStop = false
      return
    }
    pendingStop = false
    if (voiceStartIssued) {
      panel.value?.stopVoiceInput()
    } else {
      handlePanelFinished()
    }
    return
  }

  pendingStop = false
  if (!expanded.value) {
    await handlePanelOpened({ source: payload.source })
    return
  }
  const ready = panelReady
  if (ready) await ready
  if (generation !== dockGeneration || !expanded.value) return
  startVoiceInputOnce()
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
  dockGeneration += 1
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
        :key="dockGeneration"
        ref="panel"
        managed-by-dock
        :generation="dockGeneration"
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

/*
 * The surface grows out of its own footprint and collapses back into it.
 *
 * It used to drift up on the way out at `scale(0.98)`, which is small enough to be invisible:
 * the pill looked like it was fading at full size rather than closing. Both ends now scale from
 * the bottom edge — where the ball sits and where the surface is anchored — so the box reads as
 * shrinking to nothing instead of sliding somewhere.
 */
.voice-dock-surface-enter-active,
.voice-dock-surface-leave-active {
  transform-origin: bottom center;
  transition:
    opacity 170ms ease-out,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.voice-dock-surface-enter-from,
.voice-dock-surface-leave-to {
  opacity: 0;
  transform: scale(0.8);
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

<script lang="ts" setup name="VoiceDock">
import type {
  AssistantVoiceCancelHoldPayload,
  AssistantVoiceCommandPayload
} from '@talex-touch/utils/transport/events/assistant'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FloatingBall from './FloatingBall.vue'
import VoicePanel from './VoicePanel.vue'

type VoicePanelHandle = {
  openPanel: (source?: string) => Promise<void>
  startVoiceInput: () => void
  stopVoiceInput: () => void
  toggleVoiceInput: () => void
  handleCancelHold: (state: AssistantVoiceCancelHoldPayload['state']) => void
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
let disposeCancelHold: (() => void) | null = null
let pendingCancelHold: AssistantVoiceCancelHoldPayload['state'] | null = null

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
  cancelPendingClose()
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
  if (pendingCancelHold !== null) {
    const state = pendingCancelHold
    pendingCancelHold = null
    panel.value?.handleCancelHold(state)
    if (state === 'commit') {
      handlePanelFinished(generation)
      return
    }
  }
  if (pendingStop) {
    pendingStop = false
    handlePanelFinished(generation)
    return
  }
  startVoiceInputOnce()
}

// No intermediate spinner: the panel owns the whole session now, including the wait for the
// transcript, which it shows as the thinking orb inside the pill.
/**
 * How long the close waits for the pill's own leave animation before giving up on it.
 *
 * Longer than the 220ms transition, and only ever reached when `@after-leave` does not arrive —
 * a stubbed transition in tests, or a surface torn down mid-animation.
 */
const SURFACE_CLOSE_FALLBACK_MS = 400
let closeFallbackTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Telling main to collapse is what ends the pill's animation, so it has to wait for it.
 *
 * `closePanel` shrinks the window from 360x148 to the ball's 56x56 immediately. Sent in the
 * same tick as `expanded = false`, that clipped the leaving pill out of existence on the first
 * frame — the shrink was running, inside a window that had already stopped being there to show
 * it. Now the window keeps its size until the surface has finished leaving.
 */
function sendClose(): void {
  if (closeFallbackTimer) {
    clearTimeout(closeFallbackTimer)
    closeFallbackTimer = null
  }
  void transport.send(AssistantEvents.voice.closePanel, undefined)
}

function cancelPendingClose(): void {
  if (!closeFallbackTimer) return
  clearTimeout(closeFallbackTimer)
  closeFallbackTimer = null
}

/** Fires for whichever surface left; only the pill leaving means the dock is closing. */
function handleSurfaceLeft(): void {
  if (expanded.value || !closeFallbackTimer) return
  sendClose()
}

function handlePanelFinished(generation?: number): void {
  if (generation !== undefined && generation !== dockGeneration) return
  dockGeneration += 1
  expanded.value = false
  panel.value = null
  voiceStartIssued = false
  pendingStop = false
  pendingCancelHold = null
  panelReady = null
  cancelPendingClose()
  closeFallbackTimer = setTimeout(sendClose, SURFACE_CLOSE_FALLBACK_MS)
}

function handlePanelClosed(): void {
  // Main collapsed on its own; the window is already the ball's size, so there is nothing left
  // to wait for and nothing left to ask for.
  cancelPendingClose()
  dockGeneration += 1
  expanded.value = false
  panel.value = null
  voiceStartIssued = false
  pendingStop = false
  panelReady = null
  pendingCancelHold = null
}

function handleCancelHold(payload: AssistantVoiceCancelHoldPayload): void {
  if (expanded.value && panel.value && !panelReady) {
    panel.value.handleCancelHold(payload.state)
    return
  }
  pendingCancelHold = payload.state
}

async function handleCommand(payload: AssistantVoiceCommandPayload): Promise<void> {
  if (payload.action === 'cancel') return
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
  voiceStartIssued = true
  if (payload.action === 'toggle') panel.value?.toggleVoiceInput()
  else panel.value?.startVoiceInput()
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
  disposeCancelHold = transport.on(AssistantEvents.voice.cancelHold, (payload) => {
    handleCancelHold(payload)
  })
})

onBeforeUnmount(() => {
  cancelPendingClose()
  dockGeneration += 1
  disposePanelOpened?.()
  disposePanelOpened = null
  disposePanelClosed?.()
  disposePanelClosed = null
  disposeCommand?.()
  disposeCommand = null
  disposeCancelHold?.()
  disposeCancelHold = null
  pendingCancelHold = null
})
</script>

<template>
  <div class="voice-dock-root" :class="{ 'voice-dock-root--expanded': expanded }">
    <Transition name="voice-dock-surface" mode="out-in" @after-leave="handleSurfaceLeft">
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

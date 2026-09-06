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
const confettiCanvas = ref<HTMLCanvasElement | null>(null)
const confettiActive = ref(false)

const PARTICLE_COUNT = 144
const CONFETTI_DURATION_MS = 1400
const CONFETTI_DPR_LIMIT = 2
const particleX = new Float32Array(PARTICLE_COUNT)
const particleY = new Float32Array(PARTICLE_COUNT)
const particleVelocityX = new Float32Array(PARTICLE_COUNT)
const particleVelocityY = new Float32Array(PARTICLE_COUNT)
const particleRotation = new Float32Array(PARTICLE_COUNT)
const particleRotationSpeed = new Float32Array(PARTICLE_COUNT)
const particleSize = new Float32Array(PARTICLE_COUNT)
const particleShape = new Uint8Array(PARTICLE_COUNT)
const particleColor = ['#ff6b35', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#ef476f'] as const

let disposePanelOpened: (() => void) | null = null
let disposePanelClosed: (() => void) | null = null
let disposeCommand: (() => void) | null = null
let animationFrame: number | null = null
let confettiStartedAt = 0

function deterministicUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (salt + 17) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function stopConfetti(): void {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  confettiActive.value = false
  const canvas = confettiCanvas.value
  const context = canvas?.getContext('2d')
  if (canvas && context) {
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }
}

function resizeConfettiCanvas(): void {
  const canvas = confettiCanvas.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), CONFETTI_DPR_LIMIT)
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
  const context = canvas.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function renderConfetti(now: number): void {
  const canvas = confettiCanvas.value
  const context = canvas?.getContext('2d')
  if (!canvas || !context) {
    stopConfetti()
    return
  }

  const elapsed = now - confettiStartedAt
  const progress = Math.min(1, elapsed / CONFETTI_DURATION_MS)
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  context.clearRect(0, 0, width, height)

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    particleX[index] += particleVelocityX[index]
    particleY[index] += particleVelocityY[index]
    particleVelocityY[index] += 0.12
    particleRotation[index] += particleRotationSpeed[index]

    const alpha = Math.max(0, 1 - progress * 1.15)
    if (alpha === 0) continue

    context.save()
    context.globalAlpha = alpha
    context.translate(particleX[index], particleY[index])
    context.rotate(particleRotation[index])
    context.fillStyle =
      particleColor[particleShape[index] % particleColor.length] || particleColor[0]
    context.fillRect(
      -particleSize[index] / 2,
      -particleSize[index] / 2,
      particleSize[index],
      particleSize[index] * (particleShape[index] % 2 === 0 ? 0.55 : 1.35)
    )
    context.restore()
  }

  if (elapsed >= CONFETTI_DURATION_MS) {
    stopConfetti()
    return
  }

  animationFrame = requestAnimationFrame(renderConfetti)
}

function playConfetti(): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  confettiActive.value = true
  void nextTick(() => {
    resizeConfettiCanvas()
    const canvas = confettiCanvas.value
    if (!canvas) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const spread = deterministicUnit(index, 1) - 0.5
      particleX[index] = width * (0.28 + deterministicUnit(index, 2) * 0.44)
      particleY[index] = height * (0.42 + deterministicUnit(index, 3) * 0.1)
      particleVelocityX[index] = spread * 4.8
      particleVelocityY[index] = -(2.8 + deterministicUnit(index, 4) * 4.2)
      particleRotation[index] = deterministicUnit(index, 5) * Math.PI
      particleRotationSpeed[index] = (deterministicUnit(index, 6) - 0.5) * 0.24
      particleSize[index] = 4 + deterministicUnit(index, 7) * 7
      particleShape[index] = index
    }

    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    confettiStartedAt = performance.now()
    animationFrame = requestAnimationFrame(renderConfetti)
  })
}

async function handlePanelOpened(payload?: { source?: string }): Promise<void> {
  expanded.value = true
  await nextTick()
  await panel.value?.openPanel(payload?.source)
}

function handlePanelClosed(): void {
  stopConfetti()
  expanded.value = false
}
async function handleCommand(payload: AssistantVoiceCommandPayload): Promise<void> {
  expanded.value = true
  await nextTick()
  if (payload.action === 'start') panel.value?.startVoiceInput()
  else panel.value?.stopVoiceInput()
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
  stopConfetti()
})
</script>

<template>
  <div class="voice-dock-root" :class="{ 'voice-dock-root--expanded': expanded }">
    <VoicePanel v-if="expanded" ref="panel" managed-by-dock @completed="playConfetti" />
    <FloatingBall v-else />
    <canvas
      v-if="confettiActive"
      ref="confettiCanvas"
      class="voice-dock-confetti"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.voice-dock-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.voice-dock-root--expanded {
  isolation: isolate;
}

.voice-dock-confetti {
  position: absolute;
  inset: 0;
  z-index: 10;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .voice-dock-confetti {
    display: none;
  }
}
</style>

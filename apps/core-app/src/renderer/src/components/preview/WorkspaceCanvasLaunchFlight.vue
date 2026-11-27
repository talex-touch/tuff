<script lang="ts" name="WorkspaceCanvasLaunchFlight" setup>
import { hasWindow } from '@talex-touch/utils/env'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

export interface CanvasLaunchFlightPayload {
  id: number
  label: string
  originX: number
  originY: number
  targetX: number
  targetY: number
  theme: 'light' | 'dark'
}

const props = defineProps<{
  flight: CanvasLaunchFlightPayload | null
}>()

const emit = defineEmits<{
  (event: 'complete', id: number): void
}>()

const pillRef = ref<HTMLElement | null>(null)
const ringRef = ref<HTMLElement | null>(null)

let activePillAnim: Animation | null = null
let activeRingAnim: Animation | null = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function prefersReducedMotion(): boolean {
  return (
    hasWindow() &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function stopAnimations(): void {
  activePillAnim?.cancel()
  activePillAnim = null
  activeRingAnim?.cancel()
  activeRingAnim = null
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
}

function quadBezier(p0: number, p1: number, p2: number, t: number): number {
  const inv = 1 - t
  return inv * inv * p0 + 2 * inv * t * p1 + t * t * p2
}

/** Smooth cubic ease-in-out with an energetic launch impulse and soft capture. */
function easeFlight(t: number): number {
  if (t < 0.45) {
    const u = t / 0.45
    return 0.42 * u * u * (3 - 2 * u)
  }
  const u = (t - 0.45) / 0.55
  return 0.42 + 0.58 * (1 - Math.pow(1 - u, 3))
}

function playFlight(payload: CanvasLaunchFlightPayload): void {
  stopAnimations()
  const pill = pillRef.value
  const ring = ringRef.value
  const finish = (): void => {
    emit('complete', payload.id)
  }

  if (!pill || typeof pill.animate !== 'function') {
    fallbackTimer = setTimeout(finish, prefersReducedMotion() ? 120 : 420)
    return
  }

  if (prefersReducedMotion()) {
    activePillAnim = pill.animate(
      [
        { opacity: 0.95, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(-50%, -58%) scale(0.96)' }
      ],
      { duration: 180, easing: 'ease-out', fill: 'forwards' }
    )
    activePillAnim.onfinish = finish
    return
  }

  // 1. Expanding chromatic shockwave ring from the glass capsule launch origin.
  if (ring && typeof ring.animate === 'function') {
    activeRingAnim = ring.animate(
      [
        {
          opacity: 0.85,
          transform: 'translate(-50%, -50%) scale(0.55)'
        },
        {
          opacity: 0.42,
          transform: 'translate(-50%, -50%) scale(1.9)',
          offset: 0.45
        },
        {
          opacity: 0,
          transform: 'translate(-50%, -50%) scale(3.2)'
        }
      ],
      { duration: 440, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
    )
  }

  // 2. Sampled curved Bezier trajectory from right editor capsule -> left chat stream.
  const dx = payload.targetX - payload.originX
  const dy = payload.targetY - payload.originY
  const arcLift = Math.min(110, Math.max(54, Math.hypot(dx, dy) * 0.22))
  const ctrlX = dx * 0.46
  const ctrlY = Math.min(0, dy * 0.45) - arcLift
  const dirSign = dx < -12 ? -1 : dx > 12 ? 1 : 0

  const steps = 16
  const frames: Keyframe[] = []
  for (let i = 0; i <= steps; i += 1) {
    const rawT = i / steps
    const eased = easeFlight(rawT)
    const x = quadBezier(0, ctrlX, dx, eased)
    const y = quadBezier(0, ctrlY, dy, eased)
    const speedBell = Math.sin(rawT * Math.PI)
    const sx = 1 + speedBell * 0.08 - (rawT > 0.72 ? ((rawT - 0.72) / 0.28) * 0.22 : 0)
    const sy = 1 - speedBell * 0.06 - (rawT > 0.72 ? ((rawT - 0.72) / 0.28) * 0.16 : 0)
    const tilt = dirSign * speedBell * 4.5
    const opacity =
      rawT < 0.08
        ? 0.45 + (rawT / 0.08) * 0.55
        : rawT > 0.74
          ? Math.max(0, 1 - (rawT - 0.74) / 0.26)
          : 1
    const blur = rawT > 0.8 ? ((rawT - 0.8) / 0.2) * 2.5 : 0
    frames.push({
      offset: rawT,
      opacity: Number(opacity.toFixed(3)),
      filter: blur > 0 ? `blur(${blur.toFixed(1)}px)` : 'blur(0px)',
      transform: `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
    })
  }

  activePillAnim = pill.animate(frames, {
    duration: 480,
    easing: 'linear',
    fill: 'forwards'
  })
  activePillAnim.onfinish = finish
}

watch(
  () => props.flight,
  (next) => {
    stopAnimations()
    if (!next) return
    void nextTick(() => playFlight(next))
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopAnimations()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="flight"
      class="WorkspaceCanvasLaunchFlight-Layer"
      :class="`is-${flight.theme}`"
      aria-hidden="true"
      data-testid="file-viewer-launch-flight"
    >
      <div
        ref="ringRef"
        class="WorkspaceCanvasLaunchFlight-Ring"
        :style="{ left: `${flight.originX}px`, top: `${flight.originY}px` }"
      />
      <div
        ref="pillRef"
        class="WorkspaceCanvasLaunchFlight-Pill"
        :style="{ left: `${flight.originX}px`, top: `${flight.originY}px` }"
      >
        <span class="i-ri-sparkling-2-fill WorkspaceCanvasLaunchFlight-Icon" />
        <span class="WorkspaceCanvasLaunchFlight-Label">{{ flight.label }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.WorkspaceCanvasLaunchFlight-Layer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}

.WorkspaceCanvasLaunchFlight-Ring {
  position: fixed;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: conic-gradient(
    from 0deg,
    #38bdf8,
    #818cf8,
    #c959dd,
    #f43f5e,
    #fb923c,
    #34d399,
    #38bdf8
  );
  -webkit-mask: radial-gradient(
    farthest-side,
    transparent calc(100% - 2.5px),
    #000 calc(100% - 1.5px)
  );
  mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 1.5px));
  filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.55));
  will-change: transform, opacity;
}

.WorkspaceCanvasLaunchFlight-Pill {
  position: fixed;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 248px;
  height: 32px;
  padding: 0 13px 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #15171c;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.16),
    0 0 0 1px rgba(56, 189, 248, 0.45),
    0 0 18px rgba(168, 85, 247, 0.24);
  will-change: transform, opacity, filter;

  .WorkspaceCanvasLaunchFlight-Layer.is-dark & {
    background: rgba(22, 25, 34, 0.9);
    color: #f3f5fa;
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(129, 140, 248, 0.52),
      0 0 22px rgba(56, 189, 248, 0.3);
  }
}

.WorkspaceCanvasLaunchFlight-Icon {
  flex: none;
  font-size: 13px;
  color: var(--shell-primary, #38bdf8);
}

.WorkspaceCanvasLaunchFlight-Label {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

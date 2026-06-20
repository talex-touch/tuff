<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'

interface BorderGlowProps {
  className?: string
  edgeSensitivity?: number
  glowColor?: string
  backgroundColor?: string
  borderRadius?: number
  glowRadius?: number
  glowIntensity?: number
  coneSpread?: number
  animated?: boolean
  colors?: string[]
  fillOpacity?: number
  baseBorderOpacity?: number
  baseGlowOpacity?: number
}

interface AnimateOptions {
  start?: number
  end?: number
  duration?: number
  delay?: number
  ease?: (value: number) => number
  onUpdate: (value: number) => void
  onEnd?: () => void
}

const props = withDefaults(defineProps<BorderGlowProps>(), {
  className: '',
  edgeSensitivity: 30,
  glowColor: '40 80 80',
  backgroundColor: '#060010',
  borderRadius: 28,
  glowRadius: 40,
  glowIntensity: 1,
  coneSpread: 25,
  animated: false,
  colors: () => ['#c084fc', '#f472b6', '#38bdf8'],
  fillOpacity: 0.5,
  baseBorderOpacity: 0.32,
  baseGlowOpacity: 0.22,
})

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'] as const
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1] as const

const cardRef = useTemplateRef<HTMLDivElement>('cardRef')
const isHovered = ref(false)
const cursorAngle = ref(45)
const edgeProximity = ref(0)
const sweepActive = ref(false)

function parseHSL(hsl: string): { h: number, s: number, l: number } {
  const match = hsl.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/)
  if (!match)
    return { h: 40, s: 80, l: 80 }

  return {
    h: Number.parseFloat(match[1] ?? '40'),
    s: Number.parseFloat(match[2] ?? '80'),
    l: Number.parseFloat(match[3] ?? '80'),
  }
}

function buildBoxShadow(glowColor: string, intensity: number): string {
  const { h, s, l } = parseHSL(glowColor)
  const base = `${h}deg ${s}% ${l}%`
  const layers: [number, number, number, number, number, boolean][] = [
    [0, 0, 0, 1, 100, true],
    [0, 0, 1, 0, 60, true],
    [0, 0, 3, 0, 50, true],
    [0, 0, 6, 0, 40, true],
    [0, 0, 15, 0, 30, true],
    [0, 0, 25, 2, 20, true],
    [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false],
    [0, 0, 3, 0, 50, false],
    [0, 0, 6, 0, 40, false],
    [0, 0, 15, 0, 30, false],
    [0, 0, 25, 2, 20, false],
    [0, 0, 50, 2, 10, false],
  ]

  return layers
    .map(([x, y, blur, spread, alpha, inset]) => {
      const opacity = Math.min(alpha * intensity, 100)
      return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${opacity}%)`
    })
    .join(', ')
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3
}

function easeInCubic(value: number) {
  return value ** 3
}

function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}: AnimateOptions) {
  if (!hasWindow())
    return

  const startTime = performance.now() + delay

  function tick() {
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    onUpdate(start + (end - start) * ease(progress))

    if (progress < 1)
      requestAnimationFrame(tick)
    else
      onEnd?.()
  }

  window.setTimeout(() => requestAnimationFrame(tick), delay)
}

function buildMeshGradients(colors: string[]): string[] {
  const gradients: string[] = []

  for (let index = 0; index < GRADIENT_POSITIONS.length; index += 1) {
    const colorIndex = COLOR_MAP[index] ?? 0
    const color = colors[Math.min(colorIndex, colors.length - 1)] ?? colors[0] ?? '#c084fc'
    gradients.push(`radial-gradient(at ${GRADIENT_POSITIONS[index]}, ${color} 0px, transparent 50%)`)
  }

  gradients.push(`linear-gradient(${colors[0] ?? '#c084fc'} 0 100%)`)
  return gradients
}

function getCenterOfElement(element: HTMLElement): [number, number] {
  const { width, height } = element.getBoundingClientRect()
  return [width / 2, height / 2]
}

function getEdgeProximity(element: HTMLElement, x: number, y: number) {
  const [centerX, centerY] = getCenterOfElement(element)
  const dx = x - centerX
  const dy = y - centerY
  let kx = Number.POSITIVE_INFINITY
  let ky = Number.POSITIVE_INFINITY

  if (dx !== 0)
    kx = centerX / Math.abs(dx)
  if (dy !== 0)
    ky = centerY / Math.abs(dy)

  return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1)
}

function getCursorAngle(element: HTMLElement, x: number, y: number) {
  const [centerX, centerY] = getCenterOfElement(element)
  const dx = x - centerX
  const dy = y - centerY

  if (dx === 0 && dy === 0)
    return 0

  let degrees = Math.atan2(dy, dx) * (180 / Math.PI) + 90
  if (degrees < 0)
    degrees += 360
  return degrees
}

function handlePointerMove(event: PointerEvent) {
  const card = cardRef.value
  if (!card)
    return

  const rect = card.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  edgeProximity.value = getEdgeProximity(card, x, y)
  cursorAngle.value = getCursorAngle(card, x, y)
}

watch(
  () => props.animated,
  () => {
    if (!props.animated || !hasWindow())
      return

    const angleStart = 110
    const angleEnd = 465
    sweepActive.value = true
    cursorAngle.value = angleStart

    animateValue({ duration: 500, onUpdate: value => (edgeProximity.value = value / 100) })
    animateValue({
      ease: easeInCubic,
      duration: 1500,
      end: 50,
      onUpdate: value => {
        cursorAngle.value = (angleEnd - angleStart) * (value / 100) + angleStart
      },
    })
    animateValue({
      ease: easeOutCubic,
      delay: 1500,
      duration: 2250,
      start: 50,
      end: 100,
      onUpdate: value => {
        cursorAngle.value = (angleEnd - angleStart) * (value / 100) + angleStart
      },
    })
    animateValue({
      ease: easeInCubic,
      delay: 2500,
      duration: 1500,
      start: 100,
      end: 0,
      onUpdate: value => (edgeProximity.value = value / 100),
      onEnd: () => (sweepActive.value = false),
    })
  },
  {
    immediate: true,
  },
)

const colorSensitivity = computed(() => props.edgeSensitivity + 20)
const isVisible = computed(() => isHovered.value || sweepActive.value)
const borderOpacity = computed(() =>
  isVisible.value
    ? Math.max(props.baseBorderOpacity, (edgeProximity.value * 100 - colorSensitivity.value) / (100 - colorSensitivity.value))
    : props.baseBorderOpacity,
)
const glowOpacity = computed(() =>
  isVisible.value
    ? Math.max(props.baseGlowOpacity, (edgeProximity.value * 100 - props.edgeSensitivity) / (100 - props.edgeSensitivity))
    : props.baseGlowOpacity,
)

const meshGradients = computed(() => buildMeshGradients(props.colors))
const borderBackground = computed(() => meshGradients.value.map(gradient => `${gradient} border-box`))
const fillBackground = computed(() => meshGradients.value.map(gradient => `${gradient} padding-box`))
const baseRingBackground = computed(() => [
  `linear-gradient(${props.backgroundColor} 0 100%) padding-box`,
  `conic-gradient(from var(--border-glow-angle), ${props.colors.join(', ')}, ${props.colors[0] ?? '#c084fc'}) border-box`,
].join(', '))
const angle = computed(() => `${cursorAngle.value.toFixed(3)}deg`)
const rootClass = computed(() => ['BorderGlow', props.className].filter(Boolean).join(' '))
</script>

<template>
  <div
    ref="cardRef"
    :class="rootClass"
    :style="{
      background: props.backgroundColor,
      borderRadius: `${props.borderRadius}px`,
    }"
    @pointermove="handlePointerMove"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
  >
    <div
      class="BorderGlow-BaseRing"
      :style="{
        background: baseRingBackground,
      }"
    />

    <div
      class="BorderGlow-Border"
      :style="{
        background: [
          `linear-gradient(${props.backgroundColor} 0 100%) padding-box`,
          'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box',
          ...borderBackground,
        ].join(', '),
        opacity: borderOpacity,
        maskImage: `conic-gradient(from ${angle} at center, black ${props.coneSpread}%, transparent ${props.coneSpread + 15}%, transparent ${100 - props.coneSpread - 15}%, black ${100 - props.coneSpread}%)`,
        WebkitMaskImage: `conic-gradient(from ${angle} at center, black ${props.coneSpread}%, transparent ${props.coneSpread + 15}%, transparent ${100 - props.coneSpread - 15}%, black ${100 - props.coneSpread}%)`,
        transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
      }"
    />

    <div
      class="BorderGlow-Fill"
      :style="{
        background: fillBackground.join(', '),
        maskImage: [
          'linear-gradient(to bottom, black, black)',
          'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
          'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
          `conic-gradient(from ${angle} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
        ].join(', '),
        WebkitMaskImage: [
          'linear-gradient(to bottom, black, black)',
          'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
          'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
          'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
          `conic-gradient(from ${angle} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
        ].join(', '),
        opacity: borderOpacity * props.fillOpacity,
        transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
      }"
    />

    <span
      class="BorderGlow-Outer"
      :style="{
        inset: `-${props.glowRadius}px`,
        maskImage: `conic-gradient(from ${angle} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
        WebkitMaskImage: `conic-gradient(from ${angle} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
        opacity: glowOpacity,
        transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
      }"
    >
      <span
        class="BorderGlow-OuterShadow"
        :style="{
          inset: `${props.glowRadius}px`,
          boxShadow: buildBoxShadow(props.glowColor, props.glowIntensity),
        }"
      />
    </span>

    <div class="BorderGlow-Content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@property --border-glow-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.BorderGlow {
  --border-glow-angle: 0deg;

  position: relative;
  display: grid;
  isolation: isolate;
  border: 1px solid rgba(218, 199, 255, 0.28);
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.2),
    0 0 34px rgba(56, 189, 248, 0.2),
    rgba(0, 0, 0, 0.1) 0 1px 2px,
    rgba(0, 0, 0, 0.1) 0 2px 4px,
    rgba(0, 0, 0, 0.1) 0 4px 8px,
    rgba(0, 0, 0, 0.1) 0 8px 16px,
    rgba(0, 0, 0, 0.1) 0 16px 32px,
    rgba(0, 0, 0, 0.1) 0 32px 64px;
  transform: translate3d(0, 0, 0.01px);
}

.BorderGlow-BaseRing {
  --border-glow-angle: 0deg;

  position: absolute;
  inset: 0;
  z-index: 1;
  border: 2px solid transparent;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0.9;
  box-shadow:
    0 0 0 1px rgba(218, 199, 255, 0.24),
    0 0 28px rgba(139, 92, 246, 0.3),
    0 0 56px rgba(56, 189, 248, 0.18);
  animation: border-glow-spin 9s linear infinite;
}

.BorderGlow-Border,
.BorderGlow-Fill {
  position: absolute;
  inset: 0;
  border: 1px solid transparent;
  border-radius: inherit;
  pointer-events: none;
}

.BorderGlow-Fill {
  z-index: 2;
  mix-blend-mode: soft-light;
  mask-composite: subtract, add, add, add, add, add;
  -webkit-mask-composite: source-out, source-over, source-over, source-over, source-over, source-over;
}

.BorderGlow-Border {
  z-index: 3;
}

.BorderGlow-Outer {
  position: absolute;
  z-index: 4;
  border-radius: inherit;
  pointer-events: none;
  mix-blend-mode: plus-lighter;
}

.BorderGlow-OuterShadow {
  position: absolute;
  border-radius: inherit;
}

.BorderGlow-Content {
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

@keyframes border-glow-spin {
  to {
    --border-glow-angle: 1turn;
  }
}

@media (prefers-reduced-motion: reduce) {
  .BorderGlow-BaseRing {
    animation: none;
  }

  .BorderGlow-Border,
  .BorderGlow-Fill,
  .BorderGlow-Outer {
    transition: none !important;
  }
}
</style>

<script setup lang="ts">
import type { FloatingProps } from './types'
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import { TX_FLOATING_CONTEXT_KEY } from './context'

defineOptions({
  name: 'TxFloating',
})

const props = withDefaults(defineProps<FloatingProps>(), {
  className: '',
  sensitivity: 1,
  easingFactor: 0.05,
  disabled: false,
})

const containerRef = ref<HTMLDivElement | null>(null)
const elementsMap = new Map<
  string,
  {
    element: HTMLDivElement
    depth: number
    currentPosition: { x: number; y: number }
  }
>()

const mousePosition = { x: 0, y: 0 }
let rafId: number | null = null

function updatePosition(x: number, y: number) {
  const container = containerRef.value
  if (container) {
    const rect = container.getBoundingClientRect()
    mousePosition.x = x - rect.left
    mousePosition.y = y - rect.top
    return
  }
  mousePosition.x = x
  mousePosition.y = y
}

function handleMouseMove(event: MouseEvent) {
  updatePosition(event.clientX, event.clientY)
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  updatePosition(touch.clientX, touch.clientY)
}

function registerElement(id: string, element: HTMLDivElement, depth: number) {
  const existing = elementsMap.get(id)
  const currentPosition = existing?.currentPosition ?? { x: 0, y: 0 }
  elementsMap.set(id, {
    element,
    depth,
    currentPosition,
  })
}

function unregisterElement(id: string) {
  elementsMap.delete(id)
}

function resetPositions() {
  elementsMap.forEach((data) => {
    data.currentPosition.x = 0
    data.currentPosition.y = 0
    data.element.style.transform = 'translate3d(0px, 0px, 0)'
  })
}

function animate() {
  if (!props.disabled) {
    elementsMap.forEach((data) => {
      const strength = (data.depth * props.sensitivity) / 20
      const targetX = mousePosition.x * strength
      const targetY = mousePosition.y * strength

      const dx = targetX - data.currentPosition.x
      const dy = targetY - data.currentPosition.y

      data.currentPosition.x += dx * props.easingFactor
      data.currentPosition.y += dy * props.easingFactor

      data.element.style.transform = `translate3d(${data.currentPosition.x}px, ${data.currentPosition.y}px, 0)`
    })
  }

  rafId = requestAnimationFrame(animate)
}

function startListeners() {
  if (!hasWindow())
    return
  window.addEventListener('mousemove', handleMouseMove, { passive: true })
  window.addEventListener('touchmove', handleTouchMove, { passive: true })
  rafId = requestAnimationFrame(animate)
}

function stopListeners() {
  if (!hasWindow())
    return
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('touchmove', handleTouchMove)
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

provide(TX_FLOATING_CONTEXT_KEY, {
  registerElement,
  unregisterElement,
})

watch(() => props.disabled, (disabled) => {
  if (disabled)
    resetPositions()
})

onMounted(startListeners)
onBeforeUnmount(() => {
  stopListeners()
  elementsMap.clear()
})
</script>

<template>
  <div ref="containerRef" class="tx-floating" :class="props.className">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-floating {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>

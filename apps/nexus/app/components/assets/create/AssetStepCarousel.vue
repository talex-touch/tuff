<script setup lang="ts">
import { gsap } from 'gsap'
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  activeKey: string
  direction?: -1 | 1
  duration?: number
  distance?: number
}>(), {
  direction: 1,
  duration: 260,
  distance: 42,
})

const containerRef = ref<HTMLElement | null>(null)
let enterTween: gsap.core.Tween | null = null
let leaveTween: gsap.core.Tween | null = null

function tweenDuration() {
  return Math.max(props.duration, 120) / 1000
}

function tweenDistance() {
  return Math.max(props.distance, 0)
}

function clearEnterTween() {
  if (!enterTween)
    return
  enterTween.kill()
  enterTween = null
}

function clearLeaveTween() {
  if (!leaveTween)
    return
  leaveTween.kill()
  leaveTween = null
}

function onBeforeEnter(el: Element) {
  const node = el as HTMLElement
  gsap.killTweensOf(node)
  gsap.set(node, {
    x: props.direction > 0 ? tweenDistance() : -tweenDistance(),
    opacity: 0,
  })
}

function onEnter(el: Element, done: () => void) {
  const node = el as HTMLElement
  clearEnterTween()
  enterTween = gsap.to(node, {
    x: 0,
    opacity: 1,
    duration: tweenDuration(),
    ease: 'power2.out',
    onComplete: () => {
      enterTween = null
      done()
    },
  })
}

function onBeforeLeave(el: Element) {
  const node = el as HTMLElement
  gsap.killTweensOf(node)
  gsap.set(node, { x: 0, opacity: 1 })
}

function onLeave(el: Element, done: () => void) {
  const node = el as HTMLElement
  clearLeaveTween()
  leaveTween = gsap.to(node, {
    x: props.direction > 0 ? -tweenDistance() : tweenDistance(),
    opacity: 0,
    duration: tweenDuration(),
    ease: 'power2.out',
    onComplete: () => {
      leaveTween = null
      done()
    },
  })
}

function clearNodeStyles(el: Element) {
  gsap.set(el as HTMLElement, { clearProps: 'transform,opacity' })
}

onBeforeUnmount(() => {
  clearEnterTween()
  clearLeaveTween()
  if (containerRef.value)
    gsap.killTweensOf(containerRef.value)
})
</script>

<template>
  <div ref="containerRef" class="AssetStepCarousel">
    <Transition
      mode="out-in"
      :css="false"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-enter="clearNodeStyles"
      @after-leave="clearNodeStyles"
    >
      <div :key="activeKey" class="AssetStepCarousel-Item">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.AssetStepCarousel {
  width: 100%;
  overflow: hidden;
}

.AssetStepCarousel-Item {
  width: 100%;
  will-change: transform, opacity;
}
</style>

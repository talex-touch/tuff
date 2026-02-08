<script setup lang="ts">
import { gsap } from 'gsap'
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  activeKey: string | number
  duration?: number
  distance?: number
  height?: boolean
  mask?: boolean
}>(), {
  duration: 240,
  distance: 32,
  height: true,
  mask: false,
})

const containerRef = ref<HTMLElement | null>(null)
let containerTween: gsap.core.Tween | null = null
let enterTween: gsap.core.Tween | null = null
let leaveTween: gsap.core.Tween | null = null

function slideDistance() {
  return Math.max(props.distance, 0)
}

function slideDuration() {
  return Math.max(props.duration, 120) / 1000
}

function clearContainerTween() {
  if (!containerTween)
    return
  containerTween.kill()
  containerTween = null
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

function lockContainerHeight(height: number) {
  if (!props.height || !containerRef.value)
    return

  clearContainerTween()
  gsap.set(containerRef.value, {
    height: Math.max(height, 1),
    overflow: 'hidden',
  })
}

function animateContainerHeight(nextHeight: number) {
  if (!props.height || !containerRef.value)
    return

  const fromHeight = Math.max(containerRef.value.offsetHeight, 1)
  const toHeight = Math.max(nextHeight, 1)

  if (Math.abs(fromHeight - toHeight) < 1) {
    gsap.set(containerRef.value, { height: toHeight, overflow: 'hidden' })
    return
  }

  clearContainerTween()
  gsap.set(containerRef.value, { height: fromHeight, overflow: 'hidden' })
  containerTween = gsap.to(containerRef.value, {
    height: toHeight,
    duration: slideDuration(),
    ease: 'power2.out',
    overwrite: 'auto',
  })
}

function clearNodeInlineStyles(node: HTMLElement) {
  gsap.set(node, { clearProps: 'transform,opacity,pointer-events' })
}

function onBeforeLeave(el: Element) {
  const node = el as HTMLElement
  lockContainerHeight(node.offsetHeight)
  clearLeaveTween()
  gsap.killTweensOf(node)
  gsap.set(node, {
    x: 0,
    opacity: 1,
  })
}

function onLeave(el: Element, done: () => void) {
  const node = el as HTMLElement
  clearLeaveTween()
  leaveTween = gsap.to(node, {
    x: -slideDistance(),
    opacity: 0,
    duration: slideDuration(),
    ease: 'power2.out',
    onComplete: () => {
      leaveTween = null
      done()
    },
  })
}

function onBeforeEnter(el: Element) {
  const node = el as HTMLElement
  clearEnterTween()
  gsap.killTweensOf(node)
  gsap.set(node, {
    x: slideDistance(),
    opacity: 0,
  })
}

function onEnter(el: Element, done: () => void) {
  const node = el as HTMLElement
  animateContainerHeight(Math.max(node.offsetHeight, node.scrollHeight, 1))

  clearEnterTween()
  enterTween = gsap.to(node, {
    x: 0,
    opacity: 1,
    duration: slideDuration(),
    ease: 'power2.out',
    onComplete: () => {
      enterTween = null
      done()
    },
  })
}

function onAfterEnter(el: Element) {
  clearNodeInlineStyles(el as HTMLElement)

  if (!props.height || !containerRef.value)
    return

  clearContainerTween()
  gsap.set(containerRef.value, { clearProps: 'height,overflow' })
}

function onAfterLeave(el: Element) {
  clearNodeInlineStyles(el as HTMLElement)
}

function onEnterCancelled(el: Element) {
  clearEnterTween()
  clearNodeInlineStyles(el as HTMLElement)
}

function onLeaveCancelled(el: Element) {
  clearLeaveTween()
  clearNodeInlineStyles(el as HTMLElement)
}

onBeforeUnmount(() => {
  clearContainerTween()
  clearEnterTween()
  clearLeaveTween()
  if (containerRef.value)
    gsap.killTweensOf(containerRef.value)
})
</script>

<template>
  <div ref="containerRef" class="sign-step-carousel" :class="{ 'sign-step-carousel--mask': props.mask }">
    <Transition
      mode="out-in"
      :css="false"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-enter="onAfterEnter"
      @after-leave="onAfterLeave"
      @enter-cancelled="onEnterCancelled"
      @leave-cancelled="onLeaveCancelled"
    >
      <div :key="activeKey" class="sign-step-carousel__item">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sign-step-carousel {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.sign-step-carousel__item {
  width: 100%;
  will-change: transform, opacity;
}

.sign-step-carousel--mask .sign-step-carousel__item {
  background: transparent;
}
</style>

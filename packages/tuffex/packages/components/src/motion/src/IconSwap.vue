<script setup lang="ts">
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import { computed, ref } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import { resolveTransition } from '../../liquid/src/spring'
import { useMotionResources } from './composables'
const props = withDefaults(defineProps<{ stateKey: string | number | boolean; enabled?: boolean; duration?: number }>(), { enabled: true, duration: 300 })
const root = ref<HTMLElement | null>(null)
const activity = useMotionActivity(root, () => props.enabled)
const running = new Map<Element, { animation: Animation; done: () => void }>()
const key = computed(() => String(props.stateKey))
function cancel(element: Element) { const item = running.get(element); if (item) { running.delete(element); item.animation.cancel(); item.done() } }
function animate(element: Element, done: () => void, entering: boolean) {
  cancel(element)
  if (!activity.active.value || !('animate' in element)) { done(); return }
  const transition = resolveTransition({ duration: props.duration })
  const small = { opacity: 0, transform: 'scale(.25)', filter: 'blur(4px)' }
  const full = { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }
  const animation = element.animate(entering ? [small, full] : [full, small], { ...transition, fill: 'both' })
  let finished = false
  const finish = () => { if (finished) return; finished = true; running.delete(element); animation.cancel(); done() }
  running.set(element, { animation, done: finish })
  animation.onfinish = finish
}
useMotionResources(() => activity.active.value, () => () => { for (const element of Array.from(running.keys())) cancel(element) })
</script>

<template>
  <span ref="root" class="tx-motion-icon-swap">
    <Transition :css="false" @enter="(el, done) => animate(el, done, true)" @leave="(el, done) => animate(el, done, false)" @enter-cancelled="cancel" @leave-cancelled="cancel">
      <span :key="key" class="tx-motion-icon-swap__item"><slot /></span>
    </Transition>
  </span>
</template>

<style scoped>
.tx-motion-icon-swap { display: inline-grid; align-items: center; justify-items: center; }
.tx-motion-icon-swap__item { grid-area: 1 / 1; display: inline-flex; align-items: center; justify-content: center; }
</style>

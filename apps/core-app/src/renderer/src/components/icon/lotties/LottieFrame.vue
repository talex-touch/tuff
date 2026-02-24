<script name="LottieFrame" setup lang="ts">
import lottie from 'lottie-web'
import type { AnimationItem } from 'lottie-web'

const props = defineProps({
  data: {
    type: Object,
    default: null
  },
  loop: {
    type: Boolean,
    default: true
  }
})
const emit = defineEmits<{
  complete: []
  loaded: [animation: AnimationItem]
}>()
const dom = ref<HTMLElement | null>(null)
let animation: AnimationItem | null = null

function handleComplete(): void {
  emit('complete')
}

onMounted(() => {
  const el = dom.value
  if (!el || !props.data) return

  animation = lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: props.loop,
    autoplay: true,
    animationData: props.data
  })

  animation.resize()
  animation.addEventListener('complete', handleComplete)
  ;(el as HTMLElement & { _lottieFrame?: AnimationItem })._lottieFrame = animation

  emit('loaded', animation)
})

onUnmounted(() => {
  if (!animation) return
  animation.removeEventListener('complete', handleComplete)
  animation.destroy()
  animation = null
})
</script>

<template>
  <div ref="dom" class="LottieFrame-Container" />
</template>

<style lang="scss" scoped></style>

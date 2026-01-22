<script name="LottieFrame" setup>
import lottie from 'lottie-web'

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
const dom = ref()

onMounted(() => {
  const el = dom.value

  const animation = lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: props.loop,
    autoplay: true,
    animationData: props.data
  })

  animation.resize()

  el._lottieFrame = animation
})
</script>

<template>
  <div ref="dom" class="LottieFrame-Container" />
</template>

<style lang="scss" scoped></style>

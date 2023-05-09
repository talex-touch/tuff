<template>
  <div class="LottieFrame-Container" ref="dom">

  </div>
</template>

<script>
export default {
  name: "LottieFrame"
}
</script>

<script setup>
import { onMounted, ref, watchEffect } from 'vue'
import Lottie from 'lottie-web'

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

  const animation = Lottie.loadAnimation({
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

<style lang="scss" scoped>

</style>
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
import { defineProps, onMounted, ref, watchEffect } from 'vue'
import Lottie from 'lottie-web'
import animation from '@assets/lotties/lotties.json'

const dom = ref()

onMounted(() => {
  const el = dom.value

  Lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: animation //'https://assets3.lottiefiles.com/packages/lf20_6jxjxj.json'
  })
})
</script>

<style scoped>

</style>
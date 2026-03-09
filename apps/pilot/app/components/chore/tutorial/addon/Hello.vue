<script lang="ts" setup>
import { Vue3Lottie } from 'vue3-lottie'
import Hello from './animations/Hello.json'
import Features from './Features.vue'

const handleNext: any = inject('handleNext')
</script>

<template>
  <Vue3Lottie :animation-data="Hello" />

  <ButtonArrowButton
    class="delay-join2" @click="handleNext({
      component: null,
      data: {},
    })"
  >
    开始使用
  </ButtonArrowButton>
</template>

<style>
button.delay-join2 {
  opacity: 0;
  pointer-events: none;
  animation: delay-join-frames 1s 2.5s forwards;
}

@keyframes delay-join-frames {
  from {
    opacity: 0;
    pointer-events: none;
  }

  to {
    opacity: 1;
    pointer-events: auto;
  }
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>

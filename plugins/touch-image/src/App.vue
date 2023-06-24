<script setup lang="ts">
import { ref } from 'vue'
const options = ref()

setTimeout(() => {
  window.$regChannel('drop', ({ data }) => {
  console.log('drop', data)
  options.value = data
})
}, 3000)
</script>

<template>
  {{ options }}
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>

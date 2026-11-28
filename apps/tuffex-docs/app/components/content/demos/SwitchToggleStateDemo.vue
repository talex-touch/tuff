<script setup lang="ts">
import { ref } from 'vue'

const firstSwitch = ref(false)
const secondSwitch = ref(true)
</script>

<template>
  <div class="switch-toggle-state-demo">
    <TuffSwitch v-model="firstSwitch" />
    <TuffSwitch v-model="secondSwitch" />
  </div>
</template>

<style scoped>
.switch-toggle-state-demo {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>

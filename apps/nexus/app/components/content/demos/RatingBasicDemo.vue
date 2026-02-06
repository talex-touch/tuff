<script setup lang="ts">
import { ref } from 'vue'

const score = ref(3.5)
</script>

<template>
  <TxRating v-model="score" :precision="0.5" show-text />
</template>

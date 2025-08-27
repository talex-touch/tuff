<template>
  <div>
    <h1>Multi Translate</h1>
    <div>
      <input v-model="query" type="text" placeholder="Enter text to translate">
      <button @click="translate">Translate</button>
    </div>
    <div v-if="result">
      <h2>Result:</h2>
      <pre>{{ result }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')
const result = ref('')

async function translate() {
  // Mock translation
  result.value = `Translated: ${query.value}`
}
</script>
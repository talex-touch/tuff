<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const agents = ref('')
const loading = ref(false)
const selectedId = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxAgentsList
          :agents="agents"
          :loading="loading"
          :selected-id="selectedId"
          @select="(id) => (selectedId = id)"
        />
  </div>
  <div v-else>
        <TxAgentsList
          :agents="agents"
          :loading="loading"
          :selected-id="selectedId"
          @select="(id) => (selectedId = id)"
        />
  </div>
</template>

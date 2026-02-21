<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const agents = ref([
  { id: 'agent-1', name: 'Alex' },
  { id: 'agent-2', name: 'Nova' },
])
const loading = ref(false)
const selectedId = ref<string | null>(null)
const handleSelect = (id: string) => {
  selectedId.value = id
}
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxAgentsList
          :agents="agents"
          :loading="loading"
          :selected-id="selectedId"
          @select="handleSelect"
        />
  </div>
  <div v-else>
        <TxAgentsList
          :agents="agents"
          :loading="loading"
          :selected-id="selectedId"
          @select="handleSelect"
        />
  </div>
</template>

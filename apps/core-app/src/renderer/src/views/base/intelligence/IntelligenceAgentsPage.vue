<script lang="ts" name="IntelligenceAgentsPage" setup>
import type { AgentDescriptor } from '@talex-touch/utils'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import AgentDetail from '~/components/intelligence/agents/AgentDetail.vue'
import AgentsList from '~/components/intelligence/agents/AgentsList.vue'
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()

const agents = ref<AgentDescriptor[]>([])
const selectedAgentId = ref<string | null>(null)
const loading = ref(true)
const searchQuery = ref('')

const selectedAgent = computed(
  () => agents.value.find((a) => a.id === selectedAgentId.value) || null
)

const filteredAgents = computed(() => {
  if (!searchQuery.value.trim()) return agents.value
  const query = searchQuery.value.toLowerCase()
  return agents.value.filter(
    (a) => a.name.toLowerCase().includes(query) || a.description.toLowerCase().includes(query)
  )
})

async function loadAgents() {
  loading.value = true
  try {
    const result = await touchChannel.send('agents:list-all')
    agents.value = result || []
    if (agents.value.length > 0 && !selectedAgentId.value) {
      selectedAgentId.value = agents.value[0].id
    }
  } catch (err) {
    console.error('Failed to load agents:', err)
  } finally {
    loading.value = false
  }
}

function handleSelectAgent(id: string) {
  selectedAgentId.value = id
}

onMounted(() => {
  loadAgents()
})
</script>

<template>
  <ViewTemplate :title="t('intelligence.agents.title')">
    <div class="agents-page">
      <div class="agents-sidebar">
        <div class="sidebar-header">
          <el-input
            v-model="searchQuery"
            :placeholder="t('intelligence.agents.search')"
            prefix-icon="i-carbon-search"
            clearable
          />
        </div>
        <AgentsList
          :agents="filteredAgents"
          :selected-id="selectedAgentId"
          :loading="loading"
          @select="handleSelectAgent"
        />
      </div>

      <div class="agents-content">
        <AgentDetail v-if="selectedAgent" :agent="selectedAgent" />
        <div v-else class="empty-state">
          <div class="i-carbon-bot text-4xl op-30" />
          <p class="mt-2 op-50">
            {{ t('intelligence.agents.select_hint') }}
          </p>
        </div>
      </div>
    </div>
  </ViewTemplate>
</template>

<style lang="scss" scoped>
.agents-page {
  display: flex;
  gap: 1.5rem;
  height: calc(100vh - 180px);
}

.agents-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sidebar-header {
  padding: 0 0.25rem;
}

.agents-content {
  flex: 1;
  min-width: 0;
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 1.5rem;
  overflow: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
}
</style>

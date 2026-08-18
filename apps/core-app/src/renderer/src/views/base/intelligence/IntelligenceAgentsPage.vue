<script lang="ts" name="IntelligenceAgentsPage" setup>
import type { AgentDescriptor } from '@talex-touch/utils'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { useAgentsSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import AgentDetail from '~/components/intelligence/agents/AgentDetail.vue'
import AgentsList from '~/components/intelligence/agents/AgentsList.vue'

const { t } = useI18n()
const agentsSdk = useAgentsSdk()

const agents = ref<AgentDescriptor[]>([])
const selectedAgentId = ref<string | null>(null)
const loading = ref(true)
const searchQuery = ref('')

/**
 * Drives the list's placeholder. Bound to a first-load flag rather than to
 * `loading` so a later refresh leaves the rendered agents in place, and routed
 * through `useDeferredLoading` so a fast reply never flashes a skeleton.
 */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)

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
    const result = await agentsSdk.listAll()
    agents.value = result || []
    if (agents.value.length > 0 && !selectedAgentId.value) {
      selectedAgentId.value = agents.value[0].id
    }
  } catch {
    toast.error(t('intelligence.audit.loadAgentsFailed'))
  } finally {
    loading.value = false
    hasLoaded.value = true
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
  <SettingsPage edge-blur="none" fill flush integrated-drag-region>
    <TuffAsideTemplate
      v-model="searchQuery"
      class="agents-shell flex-1"
      search-id="agent-search"
      :search-placeholder="t('intelligence.agents.search')"
      :clear-label="t('intelligence.search.clear')"
      :main-edge-blur="false"
      window-drag-region
    >
      <template #default>
        <AgentsList
          :agents="filteredAgents"
          :selected-id="selectedAgentId"
          :loading="showSkeleton"
          @select="handleSelectAgent"
        />
      </template>

      <template #main>
        <AgentDetail v-if="selectedAgent" :agent="selectedAgent" />
        <div v-else class="empty-state">
          <div class="i-carbon-bot text-4xl op-30" />
          <p class="mt-2 op-50">
            {{ t('intelligence.agents.select_hint') }}
          </p>
        </div>
      </template>
    </TuffAsideTemplate>
  </SettingsPage>
</template>

<style lang="scss" scoped>
.agents-shell {
  min-height: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--tx-text-color-secondary);
  -webkit-app-region: drag;
}
</style>

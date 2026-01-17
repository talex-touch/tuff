<script lang="ts" name="AgentsList" setup>
import type { AgentDescriptor } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentItem from './AgentItem.vue'

const props = defineProps<{
  agents: AgentDescriptor[]
  selectedId?: string | null
  loading?: boolean
}>()

const emits = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()

const enabledAgents = computed(() => props.agents.filter((a) => a.enabled !== false))
const disabledAgents = computed(() => props.agents.filter((a) => a.enabled === false))
</script>

<template>
  <div class="agents-list">
    <el-skeleton v-if="loading" :rows="4" animated />

    <template v-else-if="agents.length > 0">
      <!-- Enabled Agents -->
      <div v-if="enabledAgents.length > 0" class="agent-group">
        <div class="group-header">
          <span class="i-carbon-checkmark-filled text-green-500" />
          <span>{{ t('intelligence.agents.enabled') }}</span>
          <el-tag size="small" type="success">
            {{ enabledAgents.length }}
          </el-tag>
        </div>
        <div class="group-items">
          <AgentItem
            v-for="agent in enabledAgents"
            :key="agent.id"
            :agent="agent"
            :selected="agent.id === selectedId"
            @click="emits('select', agent.id)"
          />
        </div>
      </div>

      <!-- Disabled Agents -->
      <div v-if="disabledAgents.length > 0" class="agent-group">
        <div class="group-header">
          <span class="i-carbon-close-filled text-gray-400" />
          <span>{{ t('intelligence.agents.disabled') }}</span>
          <el-tag size="small" type="info">
            {{ disabledAgents.length }}
          </el-tag>
        </div>
        <div class="group-items">
          <AgentItem
            v-for="agent in disabledAgents"
            :key="agent.id"
            :agent="agent"
            :selected="agent.id === selectedId"
            @click="emits('select', agent.id)"
          />
        </div>
      </div>
    </template>

    <div v-else class="empty-list">
      <div class="i-carbon-bot text-3xl op-20" />
      <p class="text-sm op-40">
        {{ t('intelligence.agents.empty') }}
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agents-list {
  flex: 1;
  overflow: auto;
}

.agent-group {
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}
</style>

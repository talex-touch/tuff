<script setup lang="ts">
import type { AgentItemProps, AgentsListGroup, AgentsListProps } from './types'
import { computed } from 'vue'
import TxListItemSkeleton from '../../skeleton/src/TxListItemSkeleton.vue'
import TxAgentItem from './TxAgentItem.vue'

defineOptions({
  name: 'TxAgentsList',
})

const props = withDefaults(defineProps<AgentsListProps & {
  agents: AgentItemProps[]
  selectedId?: string | null
}>(), {
  loading: false,
  selectedId: null,
})

const emit = defineEmits<{
  select: [id: string]
}>()

const enabledAgents = computed(() => props.agents.filter(a => !a.disabled))
const disabledAgents = computed(() => props.agents.filter(a => !!a.disabled))

const groups = computed<AgentsListGroup<AgentItemProps>[]>(() => {
  const list: AgentsListGroup<AgentItemProps>[] = []

  if (enabledAgents.value.length) {
    list.push({
      id: 'enabled',
      title: 'Enabled',
      iconClass: 'i-carbon-checkmark-filled',
      items: enabledAgents.value,
      badgeText: enabledAgents.value.length,
    })
  }

  if (disabledAgents.value.length) {
    list.push({
      id: 'disabled',
      title: 'Disabled',
      iconClass: 'i-carbon-close-filled',
      items: disabledAgents.value,
      badgeText: disabledAgents.value.length,
    })
  }

  return list
})
</script>

<template>
  <div class="tx-agents-list">
    <div v-if="loading" class="tx-agents-list__loading">
      <TxListItemSkeleton />
      <TxListItemSkeleton />
      <TxListItemSkeleton />
      <TxListItemSkeleton />
    </div>

    <template v-else-if="agents.length">
      <div v-for="group in groups" :key="group.id" class="tx-agents-list__group">
        <div class="tx-agents-list__group-header">
          <i v-if="group.iconClass" :class="group.iconClass" aria-hidden="true" />
          <span class="tx-agents-list__group-title">{{ group.title }}</span>
          <span class="tx-agents-list__group-badge">{{ group.badgeText }}</span>
        </div>

        <div class="tx-agents-list__items">
          <TxAgentItem
            v-for="agent in group.items"
            :key="agent.id"
            v-bind="agent"
            :selected="agent.id === selectedId"
            @click="emit('select', agent.id)"
          />
        </div>
      </div>
    </template>

    <div v-else class="tx-agents-list__empty">
      <i class="i-carbon-bot" aria-hidden="true" />
      <div class="tx-agents-list__empty-text">
        No agents
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-agents-list {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.tx-agents-list__group {
  margin-bottom: 12px;
}

.tx-agents-list__group:last-child {
  margin-bottom: 0;
}

.tx-agents-list__group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-agents-list__group-badge {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
}

.tx-agents-list__items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-agents-list__loading {
  padding: 8px;
}

.tx-agents-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border-radius: 14px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-lighter, #fafafa);
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-agents-list__empty i {
  font-size: 32px;
  opacity: 0.35;
}

.tx-agents-list__empty-text {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.85;
}
</style>

<script setup lang="ts">
import type { AgentItemProps, AgentsListGroup, AgentsListProps } from './types'
import { computed } from 'vue'
import TxIcon from '../../icon/src/TxIcon.vue'
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
  enabledTitle: 'Enabled',
  disabledTitle: 'Disabled',
  emptyText: 'No agents',
})

const emit = defineEmits<{
  select: [id: string]
}>()

const enabledAgents = computed(() => props.agents.filter(a => !a.disabled))
const disabledAgents = computed(() => props.agents.filter(a => !!a.disabled))

// The group icons are TxIcon built-ins, so the headers draw without an icon collection.
const groups = computed<AgentsListGroup<AgentItemProps>[]>(() => {
  const list: AgentsListGroup<AgentItemProps>[] = []

  if (enabledAgents.value.length) {
    list.push({
      id: 'enabled',
      title: props.enabledTitle,
      iconClass: 'check-circle',
      items: enabledAgents.value,
      badgeText: enabledAgents.value.length,
    })
  }

  if (disabledAgents.value.length) {
    list.push({
      id: 'disabled',
      title: props.disabledTitle,
      iconClass: 'x-circle',
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
          <TxIcon v-if="group.iconClass" :name="group.iconClass" />
          <span class="tx-agents-list__group-title">{{ group.title }}</span>
          <span class="tx-agents-list__group-badge">{{ group.badgeText }}</span>
        </div>

        <div class="tx-agents-list__items" role="listbox" :aria-label="group.title">
          <TxAgentItem
            v-for="agent in group.items"
            :key="agent.id"
            v-bind="agent"
            :selected="agent.id === selectedId"
            @select="emit('select', $event)"
          />
        </div>
      </div>
    </template>

    <div v-else class="tx-agents-list__empty">
      <!-- Carbon `bot`, drawn here so the empty state needs no icon collection -->
      <svg class="tx-agents-list__empty-glyph" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M18 10h2v2h-2zm-6 0h2v2h-2z" />
        <path d="M26 20h-5v-2h1a2 2 0 0 0 2-2v-4h2v-2h-2V8a2 2 0 0 0-2-2h-2V2h-2v4h-4V2h-2v4h-2a2 2 0 0 0-2 2v2H6v2h2v4a2 2 0 0 0 2 2h1v2H6a2 2 0 0 0-2 2v8h2v-8h20v8h2v-8a2 2 0 0 0-2-2M10 8h12v8H10Zm3 10h6v2h-6Z" />
      </svg>
      <div class="tx-agents-list__empty-text">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<style lang="scss">
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
  font-weight: var(--tx-font-weight-bold, 700);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-agents-list__group-badge {
  margin-left: auto;
  font-size: 11px;
  font-weight: var(--tx-font-weight-bold, 700);
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

.tx-agents-list__empty-glyph {
  width: 32px;
  height: 32px;
  fill: currentColor;
  opacity: 0.35;
}

.tx-agents-list__empty-text {
  margin-top: 8px;
  font-size: 13px;
  opacity: 0.85;
}
</style>

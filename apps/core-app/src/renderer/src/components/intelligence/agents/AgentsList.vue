<script lang="ts" name="AgentsList" setup>
import type { AgentDescriptor } from '@talex-touch/utils'
import { TxRowSkeleton, TxSkeleton } from '@talex-touch/tuffex/skeleton'
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

/** Placeholder rows while the first agent list is in flight. */
const SKELETON_ITEMS = 4

const enabledAgents = computed(() => props.agents.filter((a) => a.enabled !== false))
const disabledAgents = computed(() => props.agents.filter((a) => a.enabled === false))
</script>

<template>
  <div class="agents-list">
    <!--
      `:lines="4"` used to stand in here, but four equal bars are shorter than the
      real rows and carry none of their structure, so the list still jumped when
      the agents landed. `AgentItem` is exactly the shape `TxRowSkeleton` models —
      leading icon, title over description, trailing badge — so the primitive is
      reused and only the two metrics that differ from its defaults are pinned.
      The group header is reused as-is; it renders before the fetch either way.
    -->
    <div v-if="loading" class="agent-group is-skeleton" aria-hidden="true">
      <div class="group-header">
        <TxSkeleton variant="rect" :width="12" :height="12" :radius="3" />
        <TxSkeleton :width="64" :height="10" :radius="3" />
      </div>
      <div class="group-items">
        <TxRowSkeleton :rows="SKELETON_ITEMS" leading description trailing />
      </div>
    </div>

    <template v-else-if="agents.length > 0">
      <!-- Enabled Agents -->
      <div v-if="enabledAgents.length > 0" class="agent-group">
        <div class="group-header">
          <span class="i-carbon-checkmark-filled text-green-500" />
          <span>{{ t('intelligence.agents.enabled') }}</span>
          <span class="agent-count-badge success">{{ enabledAgents.length }}</span>
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
          <span class="agent-count-badge info">{{ disabledAgents.length }}</span>
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
  color: var(--tx-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

/*
 * `TxRowSkeleton` defaults to `SettingRow`'s metrics; `AgentItem` is tighter on
 * both axes. Only the two that differ are pinned, so the rest keeps tracking the
 * primitive.
 */
.agent-group.is-skeleton .group-items {
  --tx-skeleton-row-padding-inline: 0.75rem;
  --tx-skeleton-row-gap: 0.75rem;
}

.agent-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;

  &.success {
    background: var(--tx-color-success-light-9);
    color: var(--tx-color-success);
  }

  &.info {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-secondary);
  }
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

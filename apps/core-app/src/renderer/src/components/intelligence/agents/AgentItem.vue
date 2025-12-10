<script lang="ts" name="AgentItem" setup>
import type { AgentDescriptor } from '@talex-touch/utils'

defineProps<{
  agent: AgentDescriptor
  selected?: boolean
}>()

function getAgentIcon(agent: AgentDescriptor): string {
  // Map agent types to icons
  const iconMap: Record<string, string> = {
    file: 'i-carbon-folder',
    search: 'i-carbon-search',
    data: 'i-carbon-data-table',
    workflow: 'i-carbon-flow',
    code: 'i-carbon-code',
    chat: 'i-carbon-chat',
  }

  // Try to match by agent id or name
  for (const [key, icon] of Object.entries(iconMap)) {
    if (agent.id.toLowerCase().includes(key) || agent.name.toLowerCase().includes(key)) {
      return icon
    }
  }

  return 'i-carbon-bot'
}
</script>

<template>
  <div
    class="agent-item"
    :class="{ selected }"
    role="button"
    tabindex="0"
  >
    <div class="agent-icon" :class="getAgentIcon(agent)" />
    <div class="agent-info">
      <div class="agent-name">{{ agent.name }}</div>
      <div class="agent-desc">{{ agent.description }}</div>
    </div>
    <div v-if="agent.capabilities?.length" class="agent-badge">
      <el-tag size="small" type="info">
        {{ agent.capabilities.length }}
      </el-tag>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agent-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--el-fill-color-lighter);

  &:hover {
    background: var(--el-fill-color);
  }

  &.selected {
    background: var(--el-color-primary-light-9);
    border-left: 3px solid var(--el-color-primary);
    padding-left: calc(0.75rem - 3px);
  }
}

.agent-icon {
  font-size: 1.25rem;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-desc {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 0.125rem;
}

.agent-badge {
  flex-shrink: 0;
}
</style>

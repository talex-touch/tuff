<template>
  <div class="plugin-logs">
    <div class="logs-controls">
      <div class="log-filters">
        <button 
          v-for="level in logLevels" 
          :key="level.name"
          class="filter-button"
          :class="{ active: activeLogLevel === level.name }"
          @click="setActiveLogLevel(level.name)"
        >
          <i :class="level.icon" />
          {{ level.label }}
        </button>
      </div>
      <div class="log-actions">
        <button class="action-button-sm" @click="clearLogs" title="Clear logs">
          <i class="i-ri-delete-bin-line" />
        </button>
        <button class="action-button-sm" @click="refreshLogs" title="Refresh logs">
          <i class="i-ri-refresh-line" />
        </button>
      </div>
    </div>

    <div class="glass-card logs-container">
      <div v-if="filteredLogs.length" class="logs-list">
        <div 
          v-for="log in filteredLogs" 
          :key="log.id"
          class="log-entry"
          :class="log.level"
        >
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          <span class="log-level">{{ log.level.toUpperCase() }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
      <div v-else class="empty-logs">
        <i class="i-ri-file-text-line" />
        <p>No {{ activeLogLevel }} logs found</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Logs state
const activeLogLevel = ref('all')
const logLevels = [
  { name: 'all', label: 'All', icon: 'i-ri-list-line' },
  { name: 'error', label: 'Error', icon: 'i-ri-error-warning-line' },
  { name: 'warn', label: 'Warning', icon: 'i-ri-alert-line' },
  { name: 'info', label: 'Info', icon: 'i-ri-information-line' },
  { name: 'debug', label: 'Debug', icon: 'i-ri-bug-line' }
]

// Mock logs data
const logs = ref([
  { id: 1, timestamp: Date.now() - 1000, level: 'info', message: 'Plugin initialized successfully' },
  { id: 2, timestamp: Date.now() - 2000, level: 'debug', message: 'Loading configuration files' },
  { id: 3, timestamp: Date.now() - 3000, level: 'warn', message: 'Deprecated API usage detected' },
  { id: 4, timestamp: Date.now() - 4000, level: 'error', message: 'Failed to connect to external service' },
  { id: 5, timestamp: Date.now() - 5000, level: 'info', message: 'Feature "translation" registered' }
])

const filteredLogs = computed(() => {
  if (activeLogLevel.value === 'all') return logs.value
  return logs.value.filter(log => log.level === activeLogLevel.value)
})

// Logs management
function setActiveLogLevel(level: string) {
  activeLogLevel.value = level
}

function clearLogs() {
  logs.value = []
}

function refreshLogs() {
  console.log('Refreshing logs...')
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<style lang="scss" scoped>
.plugin-logs {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.logs-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.log-filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(var(--el-fill-color-rgb), 0.6);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  border-radius: 8px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.875rem;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.4);
    color: var(--el-color-primary);
  }

  &.active {
    background: rgba(var(--el-color-primary-rgb), 0.1);
    border-color: rgba(var(--el-color-primary-rgb), 0.4);
    color: var(--el-color-primary);
    font-weight: 500;
  }

  i {
    font-size: 1rem;
  }
}

.log-actions {
  display: flex;
  gap: 0.5rem;
}

.action-button-sm {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(var(--el-fill-color-rgb), 0.6);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    transform: scale(1.05);
  }

  i {
    font-size: 1rem;
  }
}

.glass-card {
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  border-radius: 16px;
  padding: 0;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  overflow: hidden;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  }
}

.logs-container {
  max-height: 500px;
  overflow: hidden;
}

.logs-list {
  display: flex;
  flex-direction: column;
  max-height: 500px;
  overflow-y: auto;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.75rem;
  border-bottom: 1px solid rgba(var(--el-border-color-rgb), 0.2);
  border-left: 3px solid transparent;
  transition: all 0.3s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(var(--el-fill-color-rgb), 0.2);
  }

  &.error {
    background: rgba(var(--el-color-danger-rgb), 0.05);
    border-left-color: var(--el-color-danger);
  }

  &.warn {
    background: rgba(var(--el-color-warning-rgb), 0.05);
    border-left-color: var(--el-color-warning);
  }

  &.info {
    background: rgba(var(--el-color-info-rgb), 0.05);
    border-left-color: var(--el-color-info);
  }

  &.debug {
    background: rgba(var(--el-text-color-disabled-rgb), 0.02);
    border-left-color: var(--el-text-color-disabled);
  }
}

.log-time {
  color: var(--el-text-color-secondary);
  min-width: 80px;
}

.log-level {
  color: var(--el-text-color-regular);
  font-weight: 600;
  min-width: 60px;
  text-transform: uppercase;
}

.log-message {
  flex: 1;
  color: var(--el-text-color-primary);
}

.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;

  i {
    font-size: 3rem;
    color: var(--el-text-color-disabled);
    margin-bottom: 1rem;
  }

  p {
    margin: 0;
    color: var(--el-text-color-regular);
  }
}

@media (max-width: 768px) {
  .logs-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .log-filters {
    justify-content: center;
  }

  .log-entry {
    padding: 0.5rem 1rem;
    font-size: 0.6875rem;
  }

  .log-time {
    min-width: 60px;
  }

  .log-level {
    min-width: 50px;
  }
}
</style>
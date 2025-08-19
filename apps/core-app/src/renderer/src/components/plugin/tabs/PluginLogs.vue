<template>
  <div class="PluginLogs w-full space-y-6">
    <!-- Logs Controls -->
    <div class="PluginLogs-Controls flex justify-between items-center gap-4">
      <div class="PluginLogs-Filters flex gap-2 flex-wrap">
        <button
          v-for="level in logLevels"
          :key="level.name"
          class="PluginLogs-FilterButton"
          :class="
            activeLogLevel === level.name
              ? 'bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)] border-[var(--el-color-primary-light-8)]'
              : 'bg-[var(--el-fill-color-light)] text-[var(--el-text-color-regular)] border-[var(--el-border-color-lighter)]'
          "
          @click="setActiveLogLevel(level.name)"
        >
          <i :class="level.icon" class="text-sm" />
          {{ level.label }}
        </button>
      </div>
      <div class="PluginLogs-Actions flex gap-2">
        <button
          class="PluginLogs-ActionButton bg-[var(--el-fill-color-light)] border border-[var(--el-border-color-lighter)] rounded-lg w-9 h-9 flex items-center justify-center text-[var(--el-text-color-regular)]"
          @click="clearLogs"
          title="Clear logs"
        >
          <i class="i-ri-delete-bin-line text-sm" />
        </button>
        <button
          class="PluginLogs-ActionButton bg-[var(--el-fill-color-light)] border border-[var(--el-border-color-lighter)] rounded-lg w-9 h-9 flex items-center justify-center text-[var(--el-text-color-regular)]"
          @click="refreshLogs"
          title="Refresh logs"
        >
          <i class="i-ri-refresh-line text-sm" />
        </button>
      </div>
    </div>

    <!-- Logs Container -->
    <div
      class="PluginLogs-Container bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border border-[var(--el-border-color-lighter)] rounded-2xl overflow-hidden"
    >
      <div v-if="filteredLogs.length" class="PluginLogs-List max-h-96 overflow-y-auto">
        <div
          v-for="log in filteredLogs"
          :key="log.id"
          class="PluginLogs-Entry flex items-center gap-4 px-6 py-3 font-mono text-xs border-b border-[var(--el-border-color-lighter)] border-l-3"
          :class="getLogStyle(log.level)"
        >
          <span class="PluginLogs-Time text-[var(--el-text-color-secondary)] min-w-20">{{
            formatTime(log.timestamp)
          }}</span>
          <span
            class="PluginLogs-Level font-semibold min-w-16 uppercase"
            :class="getLevelColor(log.level)"
            >{{ log.level }}</span
          >
          <span class="PluginLogs-Message flex-1 text-[var(--el-text-color-primary)]">{{
            log.message
          }}</span>
        </div>
      </div>
      <div
        v-else
        class="PluginLogs-Empty flex flex-col items-center justify-center py-16 text-center"
      >
        <i class="i-ri-file-text-line text-4xl text-[var(--el-text-color-disabled)] mb-4" />
        <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)] mb-2">
          No {{ activeLogLevel === 'all' ? '' : activeLogLevel }} logs found
        </h3>
        <p class="text-sm text-[var(--el-text-color-secondary)]">
          Logs will appear here when the plugin generates them.
        </p>
      </div>
    </div>

    <!-- Log Stats -->
    <div class="PluginLogs-Stats grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        class="PluginLogs-StatCard bg-[var(--el-color-danger-light-9)] border border-[var(--el-color-danger-light-8)] rounded-xl p-4 text-center"
      >
        <div class="text-xl font-bold text-[var(--el-color-danger)]">
          {{ getLogCount('error') }}
        </div>
        <div class="text-xs text-[var(--el-color-danger-light-3)]">Errors</div>
      </div>
      <div
        class="PluginLogs-StatCard bg-[var(--el-color-warning-light-9)] border border-[var(--el-color-warning-light-8)] rounded-xl p-4 text-center"
      >
        <div class="text-xl font-bold text-[var(--el-color-warning)]">
          {{ getLogCount('warn') }}
        </div>
        <div class="text-xs text-[var(--el-color-warning-light-3)]">Warnings</div>
      </div>
      <div
        class="PluginLogs-StatCard bg-[var(--el-color-primary-light-9)] border border-[var(--el-color-primary-light-8)] rounded-xl p-4 text-center"
      >
        <div class="text-xl font-bold text-[var(--el-color-primary)]">
          {{ getLogCount('info') }}
        </div>
        <div class="text-xs text-[var(--el-color-primary-light-3)]">Info</div>
      </div>
      <div
        class="PluginLogs-StatCard bg-[var(--el-fill-color)] border border-[var(--el-border-color-lighter)] rounded-xl p-4 text-center"
      >
        <div class="text-xl font-bold text-[var(--el-text-color-secondary)]">
          {{ getLogCount('debug') }}
        </div>
        <div class="text-xs text-[var(--el-text-color-placeholder)]">Debug</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
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
  {
    id: 1,
    timestamp: Date.now() - 1000,
    level: 'info',
    message: 'Plugin initialized successfully'
  },
  { id: 2, timestamp: Date.now() - 2000, level: 'debug', message: 'Loading configuration files' },
  { id: 3, timestamp: Date.now() - 3000, level: 'warn', message: 'Deprecated API usage detected' },
  {
    id: 4,
    timestamp: Date.now() - 4000,
    level: 'error',
    message: 'Failed to connect to external service'
  },
  {
    id: 5,
    timestamp: Date.now() - 5000,
    level: 'info',
    message: 'Feature "translation" registered'
  }
])

const filteredLogs = computed(() => {
  if (activeLogLevel.value === 'all') return logs.value
  return logs.value.filter(log => log.level === activeLogLevel.value)
})

// Helper functions
function getLogCount(level: string): number {
  return logs.value.filter(log => log.level === level).length
}

function getLogStyle(level: string): string {
  const styles: Record<string, string> = {
    error: 'bg-[var(--el-color-danger-light-9)] border-l-[var(--el-color-danger)]',
    warn: 'bg-[var(--el-color-warning-light-9)] border-l-[var(--el-color-warning)]',
    info: 'bg-[var(--el-color-primary-light-9)] border-l-[var(--el-color-primary)]',
    debug: 'bg-[var(--el-fill-color)] border-l-[var(--el-text-color-placeholder)]'
  }
  return styles[level] || ''
}

function getLevelColor(level: string): string {
  const colors: Record<string, string> = {
    error: 'text-[var(--el-color-danger)]',
    warn: 'text-[var(--el-color-warning)]',
    info: 'text-[var(--el-color-primary)]',
    debug: 'text-[var(--el-text-color-secondary)]'
  }
  return colors[level] || 'text-[var(--el-text-color-primary)]'
}

// Logs management
function setActiveLogLevel(level: string): void {
  activeLogLevel.value = level
}

function clearLogs(): void {
  logs.value = []
}

function refreshLogs(): void {
  console.log('Refreshing logs...')
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>

<style lang="scss" scoped>
/* UnoCSS handles most styling, minimal custom styles needed */

.PluginLogs-FilterButton {
  @apply px-3 py-2 rounded-xl text-sm font-medium border transition-colors duration-200 flex items-center gap-2;
}

.PluginLogs-ActionButton {
  @apply transition-all duration-200;

  &:active {
    @apply scale-95;
  }
}

.PluginLogs-Entry {
  &:last-child {
    @apply border-b-0;
  }
}
</style>
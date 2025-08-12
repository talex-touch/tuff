<template>
  <div class="PluginLogs w-full space-y-6">
    <!-- Logs Controls -->
    <div class="PluginLogs-Controls flex justify-between items-center gap-4">
      <div class="PluginLogs-Filters flex gap-2 flex-wrap">
        <button 
          v-for="level in logLevels" 
          :key="level.name"
          class="PluginLogs-FilterButton"
          :class="activeLogLevel === level.name ? 'bg-blue-500/20 text-blue-300 border-blue-400/20' : 'bg-white/5 text-white/60 border-white/10'"
          @click="setActiveLogLevel(level.name)"
        >
          <i :class="level.icon" class="text-sm" />
          {{ level.label }}
        </button>
      </div>
      <div class="PluginLogs-Actions flex gap-2">
        <button class="PluginLogs-ActionButton bg-white/5 border border-white/10 rounded-lg w-9 h-9 flex items-center justify-center text-white/60" @click="clearLogs" title="Clear logs">
          <i class="i-ri-delete-bin-line text-sm" />
        </button>
        <button class="PluginLogs-ActionButton bg-white/5 border border-white/10 rounded-lg w-9 h-9 flex items-center justify-center text-white/60" @click="refreshLogs" title="Refresh logs">
          <i class="i-ri-refresh-line text-sm" />
        </button>
      </div>
    </div>

    <!-- Logs Container -->
    <div class="PluginLogs-Container bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      <div v-if="filteredLogs.length" class="PluginLogs-List max-h-96 overflow-y-auto">
        <div 
          v-for="log in filteredLogs" 
          :key="log.id"
          class="PluginLogs-Entry flex items-center gap-4 px-6 py-3 font-mono text-xs border-b border-white/5 border-l-3"
          :class="getLogStyle(log.level)"
        >
          <span class="PluginLogs-Time text-white/50 min-w-20">{{ formatTime(log.timestamp) }}</span>
          <span class="PluginLogs-Level font-semibold min-w-16 uppercase" :class="getLevelColor(log.level)">{{ log.level }}</span>
          <span class="PluginLogs-Message flex-1 text-white">{{ log.message }}</span>
        </div>
      </div>
      <div v-else class="PluginLogs-Empty flex flex-col items-center justify-center py-16 text-center">
        <i class="i-ri-file-text-line text-4xl text-white/20 mb-4" />
        <h3 class="text-lg font-semibold text-white mb-2">No {{ activeLogLevel === 'all' ? '' : activeLogLevel }} logs found</h3>
        <p class="text-sm text-white/60">Logs will appear here when the plugin generates them.</p>
      </div>
    </div>

    <!-- Log Stats -->
    <div class="PluginLogs-Stats grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="PluginLogs-StatCard bg-red-500/10 border border-red-400/20 rounded-xl p-4 text-center">
        <div class="text-xl font-bold text-red-300">{{ getLogCount('error') }}</div>
        <div class="text-xs text-red-200/60">Errors</div>
      </div>
      <div class="PluginLogs-StatCard bg-yellow-500/10 border border-yellow-400/20 rounded-xl p-4 text-center">
        <div class="text-xl font-bold text-yellow-300">{{ getLogCount('warn') }}</div>
        <div class="text-xs text-yellow-200/60">Warnings</div>
      </div>
      <div class="PluginLogs-StatCard bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 text-center">
        <div class="text-xl font-bold text-blue-300">{{ getLogCount('info') }}</div>
        <div class="text-xs text-blue-200/60">Info</div>
      </div>
      <div class="PluginLogs-StatCard bg-gray-500/10 border border-gray-400/20 rounded-xl p-4 text-center">
        <div class="text-xl font-bold text-gray-300">{{ getLogCount('debug') }}</div>
        <div class="text-xs text-gray-200/60">Debug</div>
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

// Helper functions
function getLogCount(level: string): number {
  return logs.value.filter(log => log.level === level).length
}

function getLogStyle(level: string): string {
  const styles = {
    error: 'bg-red-500/5 border-l-red-400',
    warn: 'bg-yellow-500/5 border-l-yellow-400', 
    info: 'bg-blue-500/5 border-l-blue-400',
    debug: 'bg-gray-500/5 border-l-gray-400'
  }
  return styles[level] || ''
}

function getLevelColor(level: string): string {
  const colors = {
    error: 'text-red-300',
    warn: 'text-yellow-300',
    info: 'text-blue-300', 
    debug: 'text-gray-300'
  }
  return colors[level] || 'text-white'
}

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
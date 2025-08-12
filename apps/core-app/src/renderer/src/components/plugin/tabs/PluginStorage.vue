<template>
  <div class="PluginStorage w-full space-y-6">
    <!-- Storage Overview -->
    <div class="PluginStorage-Overview">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          class="PluginStorage-StatCard bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3"
        >
          <i class="i-ri-database-line text-2xl text-blue-400" />
          <div class="PluginStorage-StatContent">
            <span class="text-xl font-bold text-white">2.4 MB</span>
            <span class="block text-xs text-white/60">Total Storage</span>
          </div>
        </div>
        <div
          class="PluginStorage-StatCard bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3"
        >
          <i class="i-ri-file-line text-2xl text-green-400" />
          <div class="PluginStorage-StatContent">
            <span class="text-xl font-bold text-white">156</span>
            <span class="block text-xs text-white/60">Files</span>
          </div>
        </div>
        <div
          class="PluginStorage-StatCard bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3"
        >
          <i class="i-ri-folder-line text-2xl text-purple-400" />
          <div class="PluginStorage-StatContent">
            <span class="text-xl font-bold text-white">8</span>
            <span class="block text-xs text-white/60">Directories</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage Breakdown -->
    <div
      class="PluginStorage-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
    >
      <div class="PluginStorage-CardHeader flex items-center gap-3 mb-6">
        <i class="i-ri-pie-chart-line text-xl text-blue-400" />
        <h3 class="text-lg font-semibold text-white">Storage Breakdown</h3>
      </div>
      <div class="PluginStorage-Items space-y-3">
        <div
          v-for="item in storageItems"
          :key="item.name"
          class="PluginStorage-Item bg-black/20 rounded-xl p-4 flex items-center justify-between"
        >
          <div class="PluginStorage-ItemInfo flex items-center gap-3">
            <div
              class="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg flex items-center justify-center"
            >
              <i :class="item.icon" class="text-lg" :style="{ color: item.color }" />
            </div>
            <div class="PluginStorage-ItemDetails">
              <span class="block font-medium text-white">{{ item.name }}</span>
              <code class="text-xs text-white/50 bg-black/30 px-2 py-1 rounded mt-1 inline-block">{{
                item.path
              }}</code>
            </div>
          </div>
          <div class="PluginStorage-ItemSize text-right">
            <span class="text-sm font-medium text-white">{{ item.size }}</span>
            <div
              class="PluginStorage-ProgressBar w-20 h-1 bg-white/10 rounded-full mt-1 overflow-hidden"
            >
              <div
                class="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"
                :style="{ width: item.percentage }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage Analysis -->
    <div
      class="PluginStorage-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
    >
      <div class="PluginStorage-CardHeader flex items-center gap-3 mb-6">
        <i class="i-ri-bar-chart-line text-xl text-green-400" />
        <h3 class="text-lg font-semibold text-white">Storage Analysis</h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="PluginStorage-AnalysisItem">
          <h4 class="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
            <i class="i-ri-time-line text-yellow-400" />
            Last Modified
          </h4>
          <div class="space-y-2">
            <div class="text-xs text-white/60">config/settings.json - 2 hours ago</div>
            <div class="text-xs text-white/60">cache/images.db - 1 day ago</div>
            <div class="text-xs text-white/60">logs/app.log - 3 days ago</div>
          </div>
        </div>
        <div class="PluginStorage-AnalysisItem">
          <h4 class="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
            <i class="i-ri-error-warning-line text-red-400" />
            Recommendations
          </h4>
          <div class="space-y-2">
            <div class="text-xs text-white/60">• Clear cache to free up 856 KB</div>
            <div class="text-xs text-white/60">• Archive old logs (30+ days)</div>
            <div class="text-xs text-white/60">• Optimize configuration files</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="PluginStorage-Actions flex flex-wrap gap-3">
      <button
        class="PluginStorage-ActionButton bg-red-500/20 text-red-300 border border-red-400/20 rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="clearCache"
      >
        <i class="i-ri-delete-bin-line" />
        Clear Cache
      </button>
      <button
        class="PluginStorage-ActionButton bg-white/10 text-white border border-white/20 rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="openDataFolder"
      >
        <i class="i-ri-folder-open-line" />
        Open Data Folder
      </button>
      <button
        class="PluginStorage-ActionButton bg-white/10 text-white border border-white/20 rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="exportData"
      >
        <i class="i-ri-download-line" />
        Export Data
      </button>
      <button
        class="PluginStorage-ActionButton bg-blue-500/20 text-blue-300 border border-blue-400/20 rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="optimizeStorage"
      >
        <i class="i-ri-magic-line" />
        Optimize Storage
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Storage items with enhanced data
const storageItems = [
  {
    name: 'Configuration',
    path: 'config/',
    size: '1.2 MB',
    percentage: '50%',
    icon: 'i-ri-settings-line',
    color: '#3b82f6'
  },
  {
    name: 'Cache',
    path: 'cache/',
    size: '856 KB',
    percentage: '35%',
    icon: 'i-ri-image-line',
    color: '#10b981'
  },
  {
    name: 'Logs',
    path: 'logs/',
    size: '384 KB',
    percentage: '12%',
    icon: 'i-ri-file-text-line',
    color: '#f59e0b'
  },
  {
    name: 'Data',
    path: 'data/',
    size: '128 KB',
    percentage: '3%',
    icon: 'i-ri-database-line',
    color: '#8b5cf6'
  }
]

// Storage management functions
function clearCache() {
  console.log('Clearing cache...')
  // TODO: Implement actual cache clearing
}

function openDataFolder() {
  console.log('Opening data folder...')
  // TODO: Open data folder in file explorer
}

function exportData() {
  console.log('Exporting data...')
  // TODO: Export plugin data
}

function optimizeStorage() {
  console.log('Optimizing storage...')
  // TODO: Run storage optimization
}
</script>

<style lang="scss" scoped>
/* UnoCSS handles most styling, minimal custom styles needed */

.PluginStorage-ProgressBar {
  transition: width 0.3s ease;
}

.PluginStorage-ActionButton {
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.98);
  }
}
</style>

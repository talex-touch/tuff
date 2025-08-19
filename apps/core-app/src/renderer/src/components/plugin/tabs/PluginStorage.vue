<template>
  <div class="PluginStorage w-full space-y-6">
    <!-- Storage Overview -->
    <div class="PluginStorage-Overview">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          value="2.4 MB"
          label="Total Storage"
          icon-class="i-ri-database-line text-6xl text-[var(--el-color-primary)]"
        />
        <StatCard
          value="156"
          label="Files"
          icon-class="i-ri-file-line text-6xl text-[var(--el-color-success)]"
        />
        <StatCard
          value="8"
          label="Directories"
          icon-class="i-ri-folder-line text-6xl text-[var(--el-color-info)]"
        />
      </div>
    </div>

    <!-- Storage Breakdown -->
    <div
      class="PluginStorage-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border-[var(--el-border-color-lighter)] rounded-2xl p-6"
    >
      <div class="PluginStorage-CardHeader flex items-center gap-3 mb-6">
        <i class="i-ri-pie-chart-line text-xl text-[var(--el-color-primary)]" />
        <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">
          Storage Breakdown
        </h3>
      </div>
      <div class="PluginStorage-Items space-y-3">
        <div
          v-for="item in storageItems"
          :key="item.name"
          class="PluginStorage-Item bg-[var(--el-fill-color-darker)] rounded-xl p-4 flex items-center justify-between"
        >
          <div class="PluginStorage-ItemInfo flex items-center gap-3">
            <div
              class="w-10 h-10 bg-gradient-to-br from-[var(--el-color-primary-light-9)] to-[var(--el-color-info-light-9)] rounded-lg flex items-center justify-center"
            >
              <i :class="item.icon" class="text-lg" :style="{ color: item.color }" />
            </div>
            <div class="PluginStorage-ItemDetails">
              <span class="block font-medium text-[var(--el-text-color-primary)]">{{
                item.name
              }}</span>
              <code
                class="text-xs text-[var(--el-text-color-secondary)] bg-[var(--el-fill-color-darker)] px-2 py-1 rounded mt-1 inline-block"
                >{{ item.path }}</code
              >
            </div>
          </div>
          <div class="PluginStorage-ItemSize text-right">
            <span class="text-sm font-medium text-[var(--el-text-color-primary)]">{{
              item.size
            }}</span>
            <div
              class="PluginStorage-ProgressBar w-20 h-1 bg-[var(--el-fill-color)] rounded-full mt-1 overflow-hidden"
            >
              <div
                class="h-full bg-gradient-to-r from-[var(--el-color-primary)] to-[var(--el-color-info)] rounded-full"
                :style="{ width: item.percentage }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage Analysis -->
    <div
      class="PluginStorage-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border-[var(--el-border-color-lighter)] rounded-2xl p-6"
    >
      <div class="PluginStorage-CardHeader flex items-center gap-3 mb-6">
        <i class="i-ri-bar-chart-line text-xl text-[var(--el-color-success)]" />
        <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">
          Storage Analysis
        </h3>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="PluginStorage-AnalysisItem">
          <h4
            class="text-sm font-medium text-[var(--el-text-color-regular)] mb-3 flex items-center gap-2"
          >
            <i class="i-ri-time-line text-[var(--el-color-warning)]" />
            Last Modified
          </h4>
          <div class="space-y-2">
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              config/settings.json - 2 hours ago
            </div>
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              cache/images.db - 1 day ago
            </div>
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              logs/app.log - 3 days ago
            </div>
          </div>
        </div>
        <div class="PluginStorage-AnalysisItem">
          <h4
            class="text-sm font-medium text-[var(--el-text-color-regular)] mb-3 flex items-center gap-2"
          >
            <i class="i-ri-error-warning-line text-[var(--el-color-danger)]" />
            Recommendations
          </h4>
          <div class="space-y-2">
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              • Clear cache to free up 856 KB
            </div>
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              • Archive old logs (30+ days)
            </div>
            <div class="text-xs text-[var(--el-text-color-secondary)]">
              • Optimize configuration files
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="PluginStorage-Actions flex flex-wrap gap-3">
      <button
        class="PluginStorage-ActionButton bg-[var(--el-color-danger-light-9)] text-[var(--el-color-danger)] border border-[var(--el-color-danger-light-8)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="clearCache"
      >
        <i class="i-ri-delete-bin-line" />
        Clear Cache
      </button>
      <button
        class="PluginStorage-ActionButton bg-[var(--el-fill-color-light)] text-[var(--el-text-color-primary)] border border-[var(--el-border-color-lighter)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="openDataFolder"
      >
        <i class="i-ri-folder-open-line" />
        Open Data Folder
      </button>
      <button
        class="PluginStorage-ActionButton bg-[var(--el-fill-color-light)] text-[var(--el-text-color-primary)] border border-[var(--el-border-color-lighter)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="exportData"
      >
        <i class="i-ri-download-line" />
        Export Data
      </button>
      <button
        class="PluginStorage-ActionButton bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)] border border-[var(--el-color-primary-light-8)] rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2"
        @click="optimizeStorage"
      >
        <i class="i-ri-magic-line" />
        Optimize Storage
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import StatCard from '../../base/card/StatCard.vue'

// Storage items with enhanced data
const storageItems = [
  {
    name: 'Configuration',
    path: 'config/',
    size: '1.2 MB',
    percentage: '50%',
    icon: 'i-ri-settings-line',
    color: 'var(--el-color-primary)'
  },
  {
    name: 'Cache',
    path: 'cache/',
    size: '856 KB',
    percentage: '35%',
    icon: 'i-ri-image-line',
    color: 'var(--el-color-success)'
  },
  {
    name: 'Logs',
    path: 'logs/',
    size: '384 KB',
    percentage: '12%',
    icon: 'i-ri-file-text-line',
    color: 'var(--el-color-warning)'
  },
  {
    name: 'Data',
    path: 'data/',
    size: '128 KB',
    percentage: '3%',
    icon: 'i-ri-database-line',
    color: 'var(--el-color-info)'
  }
]

// Storage management functions
function clearCache(): void {
  console.log('Clearing cache...')
  // TODO: Implement actual cache clearing
}

function openDataFolder(): void {
  console.log('Opening data folder...')
  // TODO: Open data folder in file explorer
}

function exportData(): void {
  console.log('Exporting data...')
  // TODO: Export plugin data
}

function optimizeStorage(): void {
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

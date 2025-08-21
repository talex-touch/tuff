<template>
  <div class="PluginDetails w-full">
    <div class="PluginDetails-Grid grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Basic Information -->
      <div
        class="PluginDetails-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border border-[var(--el-border-color-lighter)] rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-information-line text-xl text-[var(--el-color-primary)]" />
          <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">
            Basic Information
          </h3>
        </div>
        <div class="PluginDetails-List space-y-4">
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-[var(--el-border-color-lighter)]"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Plugin ID</span
            >
            <div class="PluginDetails-ValueWithCopy flex items-center gap-2">
              <code
                class="PluginDetails-Value bg-[var(--el-fill-color-darker)] text-[var(--el-text-color-primary)] text-xs px-2 py-1 rounded border border-[var(--el-border-color-lighter)]"
                >{{ plugin.name }}</code
              >
              <button
                class="PluginDetails-CopyButton w-6 h-6 bg-[var(--el-fill-color-light)] border border-[var(--el-border-color-lighter)] rounded flex items-center justify-center transition-colors"
                :class="
                  copyState.pluginId
                    ? 'bg-[var(--el-color-success-light-9)] border-[var(--el-color-success-light-8)] text-[var(--el-color-success)]'
                    : 'text-[var(--el-text-color-secondary)]'
                "
                @click="copyToClipboard(plugin.name, 'pluginId')"
                title="Copy plugin ID"
              >
                <i
                  :class="copyState.pluginId ? 'i-ri-check-line' : 'i-ri-file-copy-line'"
                  class="text-xs"
                />
              </button>
            </div>
          </div>
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-[var(--el-border-color-lighter)]"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Version</span
            >
            <span
              class="PluginDetails-Value text-sm font-semibold text-[var(--el-color-success)]"
              >{{ plugin.version }}</span
            >
          </div>
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-[var(--el-border-color-lighter)]"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Mode</span
            >
            <span
              v-if="plugin.dev?.enable"
              class="PluginDetails-Value text-sm font-medium text-[var(--el-color-primary)]"
              >Development</span
            >
            <span
              v-else
              class="PluginDetails-Value text-sm font-medium text-[var(--el-color-success)]"
              >Production</span
            >
          </div>
          <div
            v-if="plugin.dev?.address"
            class="PluginDetails-Row flex justify-between items-center py-3"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Dev Address</span
            >
            <a
              :href="plugin.dev.address"
              class="PluginDetails-Link text-sm text-[var(--el-color-primary)] flex items-center gap-1"
              target="_blank"
            >
              {{ plugin.dev.address }}
              <i class="i-ri-external-link-line text-xs" />
            </a>
          </div>
        </div>
      </div>

      <!-- Configuration -->
      <div
        class="PluginDetails-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border border-[var(--el-border-color-lighter)] rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-settings-3-line text-xl text-[var(--el-color-info)]" />
          <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">Configuration</h3>
        </div>
        <div class="PluginDetails-List space-y-4">
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-[var(--el-border-color-lighter)]"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Auto Start</span
            >
            <div class="PluginDetails-Toggle flex items-center gap-2">
              <div class="w-2 h-2 bg-[var(--el-color-success)] rounded-full animate-pulse" />
              <span class="text-sm text-[var(--el-color-success)]">Enabled</span>
            </div>
          </div>
          <div class="PluginDetails-Row flex justify-between items-center py-3">
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Hot Reload</span
            >
            <div class="PluginDetails-Toggle flex items-center gap-2">
              <div
                class="w-2 h-2 rounded-full"
                :class="
                  plugin.dev?.enable
                    ? 'bg-[var(--el-color-success)] animate-pulse'
                    : 'bg-[var(--el-text-color-placeholder)]'
                "
              />
              <span
                class="text-sm"
                :class="
                  plugin.dev?.enable
                    ? 'text-[var(--el-color-success)]'
                    : 'text-[var(--el-text-color-placeholder)]'
                "
                >{{ plugin.dev?.enable ? 'Enabled' : 'Disabled' }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- File System -->
      <div
        class="PluginDetails-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border border-[var(--el-border-color-lighter)] rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-folder-line text-xl text-[var(--el-color-warning)]" />
          <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">File System</h3>
        </div>
        <div class="PluginDetails-List space-y-4">
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-[var(--el-border-color-lighter)]"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Plugin Path</span
            >
            <code
              class="PluginDetails-Value bg-[var(--el-fill-color-darker)] text-[var(--el-text-color-primary)] text-xs px-2 py-1 rounded border border-[var(--el-border-color-lighter)] max-w-40 truncate"
              >~/plugins/{{ plugin.name }}</code
            >
          </div>
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-[var(--el-border-color-lighter)]"
          >
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Data Directory</span
            >
            <code
              class="PluginDetails-Value bg-[var(--el-fill-color-darker)] text-[var(--el-text-color-primary)] text-xs px-2 py-1 rounded border border-[var(--el-border-color-lighter)] max-w-40 truncate"
              >~/data/{{ plugin.name }}</code
            >
          </div>
          <div class="PluginDetails-Row flex justify-between items-center py-3">
            <span
              class="PluginDetails-Label text-sm font-medium text-[var(--el-text-color-regular)]"
              >Cache Size</span
            >
            <span class="PluginDetails-Value text-sm text-[var(--el-text-color-primary)]"
              >2.4 MB</span
            >
          </div>
        </div>
      </div>

      <!-- Performance -->
      <div
        class="PluginDetails-Card bg-[var(--el-bg-color-overlay)] backdrop-blur-xl border border-[var(--el-border-color-lighter)] rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-time-line text-xl text-[var(--el-color-success)]" />
          <h3 class="text-lg font-semibold text-[var(--el-text-color-primary)]">Performance</h3>
        </div>
        <div class="PluginDetails-Metrics space-y-3">
          <div
            class="PluginDetails-Metric bg-[var(--el-fill-color-darker)] rounded-xl p-4 flex justify-between items-center"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 bg-[var(--el-color-primary-light-9)] rounded-lg flex items-center justify-center"
              >
                <i class="i-ri-timer-line text-[var(--el-color-primary)] text-sm" />
              </div>
              <span class="PluginDetails-MetricLabel text-sm text-[var(--el-text-color-regular)]"
                >Load Time</span
              >
            </div>
            <span
              class="PluginDetails-MetricValue text-sm font-semibold text-[var(--el-text-color-primary)]"
              >156ms</span
            >
          </div>
          <div
            class="PluginDetails-Metric bg-[var(--el-fill-color-darker)] rounded-xl p-4 flex justify-between items-center"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 bg-[var(--el-color-info-light-9)] rounded-lg flex items-center justify-center"
              >
                <i class="i-ri-ram-line text-[var(--el-color-info)] text-sm" />
              </div>
              <span class="PluginDetails-MetricLabel text-sm text-[var(--el-text-color-regular)]"
                >Memory Usage</span
              >
            </div>
            <span
              class="PluginDetails-MetricValue text-sm font-semibold text-[var(--el-text-color-primary)]"
              >8.2 MB</span
            >
          </div>
          <div
            class="PluginDetails-Metric bg-[var(--el-fill-color-darker)] rounded-xl p-4 flex justify-between items-center"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-8 h-8 bg-[var(--el-color-success-light-9)] rounded-lg flex items-center justify-center"
              >
                <i class="i-ri-cpu-line text-[var(--el-color-success)] text-sm" />
              </div>
              <span class="PluginDetails-MetricLabel text-sm text-[var(--el-text-color-regular)]"
                >CPU Usage</span
              >
            </div>
            <span
              class="PluginDetails-MetricValue text-sm font-semibold text-[var(--el-text-color-primary)]"
              >0.3%</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'

// Props
defineProps<{
  plugin: ITouchPlugin
}>()

// Copy states
const copyState = ref({
  pluginId: false
})

// Copy functionality
async function copyToClipboard(text: string, type: keyof typeof copyState.value): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copyState.value[type] = true
    setTimeout(() => {
      copyState.value[type] = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}
</script>

<style lang="scss" scoped>
/* UnoCSS handles most styling, minimal custom styles needed */

.PluginDetails-Row:last-child {
  @apply border-b-0;
}

.PluginDetails-Toggle .animate-pulse {
  animation: pulse 2s infinite;
}

.PluginDetails-CopyButton {
  @apply transition-all duration-200;

  &:active {
    @apply scale-95;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>

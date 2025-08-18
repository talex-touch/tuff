<template>
  <div class="PluginDetails w-full">
    <div class="PluginDetails-Grid grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Basic Information -->
      <div
        class="PluginDetails-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-information-line text-xl text-blue-400" />
          <h3 class="text-lg font-semibold text-white">Basic Information</h3>
        </div>
        <div class="PluginDetails-List space-y-4">
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-white/10"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Plugin ID</span>
            <div class="PluginDetails-ValueWithCopy flex items-center gap-2">
              <code
                class="PluginDetails-Value bg-black/30 text-white text-xs px-2 py-1 rounded border border-white/20"
                >{{ plugin.name }}</code
              >
              <button
                class="PluginDetails-CopyButton w-6 h-6 bg-white/10 border border-white/20 rounded flex items-center justify-center transition-colors"
                :class="
                  copyState.pluginId
                    ? 'bg-green-500/20 border-green-400/20 text-green-300'
                    : 'text-white/60'
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
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-white/10"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Version</span>
            <span class="PluginDetails-Value text-sm font-semibold text-green-300">{{
              plugin.version
            }}</span>
          </div>
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-white/10"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Mode</span>
            <span
              v-if="plugin.dev?.enable"
              class="PluginDetails-Value text-sm font-medium text-blue-300"
              >Development</span
            >
            <span v-else class="PluginDetails-Value text-sm font-medium text-green-300"
              >Production</span
            >
          </div>
          <div
            v-if="plugin.dev?.address"
            class="PluginDetails-Row flex justify-between items-center py-3"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Dev Address</span>
            <a
              :href="plugin.dev.address"
              class="PluginDetails-Link text-sm text-blue-300 flex items-center gap-1"
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
        class="PluginDetails-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-settings-3-line text-xl text-purple-400" />
          <h3 class="text-lg font-semibold text-white">Configuration</h3>
        </div>
        <div class="PluginDetails-List space-y-4">
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-white/10"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Auto Start</span>
            <div class="PluginDetails-Toggle flex items-center gap-2">
              <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span class="text-sm text-green-300">Enabled</span>
            </div>
          </div>
          <div class="PluginDetails-Row flex justify-between items-center py-3">
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Hot Reload</span>
            <div class="PluginDetails-Toggle flex items-center gap-2">
              <div
                class="w-2 h-2 rounded-full"
                :class="plugin.dev?.enable ? 'bg-green-400 animate-pulse' : 'bg-gray-400'"
              />
              <span
                class="text-sm"
                :class="plugin.dev?.enable ? 'text-green-300' : 'text-gray-400'"
                >{{ plugin.dev?.enable ? 'Enabled' : 'Disabled' }}</span
              >
            </div>
          </div>
        </div>
      </div>

      <!-- File System -->
      <div
        class="PluginDetails-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-folder-line text-xl text-orange-400" />
          <h3 class="text-lg font-semibold text-white">File System</h3>
        </div>
        <div class="PluginDetails-List space-y-4">
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-white/10"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Plugin Path</span>
            <code
              class="PluginDetails-Value bg-black/30 text-white text-xs px-2 py-1 rounded border border-white/20 max-w-40 truncate"
              >~/plugins/{{ plugin.name }}</code
            >
          </div>
          <div
            class="PluginDetails-Row flex justify-between items-center py-3 border-b border-white/10"
          >
            <span class="PluginDetails-Label text-sm font-medium text-white/70"
              >Data Directory</span
            >
            <code
              class="PluginDetails-Value bg-black/30 text-white text-xs px-2 py-1 rounded border border-white/20 max-w-40 truncate"
              >~/data/{{ plugin.name }}</code
            >
          </div>
          <div class="PluginDetails-Row flex justify-between items-center py-3">
            <span class="PluginDetails-Label text-sm font-medium text-white/70">Cache Size</span>
            <span class="PluginDetails-Value text-sm text-white">2.4 MB</span>
          </div>
        </div>
      </div>

      <!-- Performance -->
      <div
        class="PluginDetails-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
      >
        <div class="PluginDetails-CardHeader flex items-center gap-3 mb-6">
          <i class="i-ri-time-line text-xl text-green-400" />
          <h3 class="text-lg font-semibold text-white">Performance</h3>
        </div>
        <div class="PluginDetails-Metrics space-y-3">
          <div
            class="PluginDetails-Metric bg-black/20 rounded-xl p-4 flex justify-between items-center"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <i class="i-ri-timer-line text-blue-400 text-sm" />
              </div>
              <span class="PluginDetails-MetricLabel text-sm text-white/70">Load Time</span>
            </div>
            <span class="PluginDetails-MetricValue text-sm font-semibold text-white">156ms</span>
          </div>
          <div
            class="PluginDetails-Metric bg-black/20 rounded-xl p-4 flex justify-between items-center"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <i class="i-ri-ram-line text-purple-400 text-sm" />
              </div>
              <span class="PluginDetails-MetricLabel text-sm text-white/70">Memory Usage</span>
            </div>
            <span class="PluginDetails-MetricValue text-sm font-semibold text-white">8.2 MB</span>
          </div>
          <div
            class="PluginDetails-Metric bg-black/20 rounded-xl p-4 flex justify-between items-center"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                <i class="i-ri-cpu-line text-green-400 text-sm" />
              </div>
              <span class="PluginDetails-MetricLabel text-sm text-white/70">CPU Usage</span>
            </div>
            <span class="PluginDetails-MetricValue text-sm font-semibold text-white">0.3%</span>
          </div>
        </div>
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

// Copy states
const copyState = ref({
  pluginId: false
})

// Copy functionality
async function copyToClipboard(text: string, type: string) {
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

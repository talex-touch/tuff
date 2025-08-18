<template>
  <div class="PluginFeature w-full">
    <!-- Stats Header -->
    <div class="PluginFeature-Header mb-6">
      <div class="grid grid-cols-2 gap-4">
        <div
          class="PluginFeature-StatCard bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3"
        >
          <i class="i-ri-function-line text-2xl text-blue-400" />
          <div class="PluginFeature-StatInfo">
            <span class="text-2xl font-bold text-white">{{ plugin.features?.length || 0 }}</span>
            <span class="block text-xs text-white/60">Features</span>
          </div>
        </div>
        <div
          class="PluginFeature-StatCard bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-center gap-3"
        >
          <i class="i-ri-terminal-line text-2xl text-green-400" />
          <div class="PluginFeature-StatInfo">
            <span class="text-2xl font-bold text-white">{{ totalCommands }}</span>
            <span class="block text-xs text-white/60">Commands</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Features Grid -->
    <div
      v-if="plugin.features?.length"
      class="PluginFeature-Grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <div
        v-for="feature in plugin.features"
        :key="feature.id"
        class="PluginFeature-Card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 cursor-pointer"
        @click="showFeatureDetails(feature)"
      >
        <div class="PluginFeature-CardHeader flex items-start justify-between mb-4">
          <div
            class="PluginFeature-CardIcon w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center"
          >
            <i :class="feature.icon || 'i-ri-function-line'" class="text-white text-xl" />
          </div>
          <div
            class="PluginFeature-Badge bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-lg border border-blue-400/20"
          >
            {{ feature.commands.length }}
          </div>
        </div>

        <div class="PluginFeature-CardContent">
          <h3 class="PluginFeature-CardTitle text-lg font-semibold text-white mb-2">
            {{ feature.name }}
          </h3>
          <p class="PluginFeature-CardDesc text-sm text-white/70 line-clamp-2 mb-4">
            {{ feature.desc }}
          </p>

          <div class="PluginFeature-CommandsList space-y-2">
            <div
              v-for="(command, index) in feature.commands.slice(0, 2)"
              :key="index"
              class="PluginFeature-CommandItem bg-black/20 rounded-lg p-2 text-xs flex items-center justify-between"
            >
              <code class="text-yellow-300">{{ getCommandName(command, feature) }}</code>
              <span v-if="getCommandShortcut(command, feature)" class="text-white/50 text-xs">{{
                getCommandShortcut(command, feature)
              }}</span>
            </div>
            <div v-if="feature.commands.length > 2" class="text-xs text-white/50 text-center py-1">
              +{{ feature.commands.length - 2 }} more commands
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="PluginFeature-EmptyState flex flex-col items-center justify-center py-16 text-center"
    >
      <div
        class="PluginFeature-EmptyIcon w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mb-6"
      >
        <i class="i-ri-function-line text-4xl text-white/30" />
      </div>
      <h3 class="text-xl font-semibold text-white mb-2">No Features Available</h3>
      <p class="text-white/60">This plugin doesn't expose any features yet.</p>
    </div>

    <!-- Feature Detail Drawer -->
    <ElDrawer
      v-model="showDrawer"
      title="Feature Details"
      direction="rtl"
      size="50%"
      :before-close="handleDrawerClose"
    >
      <template #header>
        <div class="flex items-center gap-4 py-2">
          <div
            class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center"
          >
            <i :class="selectedFeature?.icon || 'i-ri-function-line'" class="text-white text-lg" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              {{ selectedFeature?.name }}
            </h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">{{ selectedFeature?.desc }}</p>
          </div>
        </div>
      </template>

      <div v-if="selectedFeature" class="PluginFeature-DrawerContent px-4">
        <!-- Feature Overview -->
        <div class="PluginFeature-Overview mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-information-line text-blue-500" />
            Overview
          </h3>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Feature ID:</span>
              <code class="text-sm bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{{
                selectedFeature.id
              }}</code>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Commands Count:</span>
              <span class="text-sm font-medium">{{ selectedFeature.commands.length }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Feature Type:</span>
              <span
                class="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded"
                >{{ selectedFeature.type || 'Standard' }}</span
              >
            </div>
          </div>
        </div>

        <!-- Commands Section -->
        <div class="PluginFeature-Commands mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-terminal-line text-green-500" />
            Commands ({{ selectedFeature.commands.length }})
          </h3>
          <div class="space-y-4">
            <div
              v-for="(command, index) in selectedFeature.commands"
              :key="index"
              class="PluginFeature-CommandDetail bg-gray-50 dark:bg-gray-800 rounded-xl p-4"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <i class="i-ri-terminal-line text-yellow-600 dark:text-yellow-400 text-sm" />
                  </div>
                  <div>
                    <h4 class="font-semibold text-gray-900 dark:text-white">
                      {{ getCommandName(command, selectedFeature) }}
                    </h4>
                    <p
                      v-if="getCommandDesc(command, selectedFeature)"
                      class="text-sm text-gray-600 dark:text-gray-400"
                    >
                      {{ getCommandDesc(command, selectedFeature) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    v-if="getCommandShortcut(command, selectedFeature)"
                    class="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-1 rounded border"
                  >
                    {{ getCommandShortcut(command, selectedFeature) }}
                  </span>
                  <span
                    class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded"
                  >
                    {{ command.type }}
                  </span>
                </div>
              </div>

              <!-- Command JSON -->
              <div class="mt-3">
                <ElCollapse>
                  <ElCollapseItem title="View JSON" :name="index">
                    <div class="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                      <pre class="text-xs text-gray-300">{{
                        JSON.stringify(command, null, 2)
                      }}</pre>
                    </div>
                  </ElCollapseItem>
                </ElCollapse>
              </div>
            </div>
          </div>
        </div>

        <!-- Raw Feature JSON -->
        <div class="PluginFeature-RawJson">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-code-line text-purple-500" />
            Raw Feature Data
          </h3>
          <ElCollapse>
            <ElCollapseItem title="View Complete Feature JSON" name="feature-json">
              <div class="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre class="text-xs text-gray-300">{{
                  JSON.stringify(selectedFeature, null, 2)
                }}</pre>
              </div>
            </ElCollapseItem>
          </ElCollapse>
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<script lang="ts" setup>
import type { ITouchPlugin, IFeatureCommand } from '@talex-touch/utils/plugin'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Features state
const totalCommands = computed(
  () => props.plugin.features?.reduce((total, feature) => total + feature.commands.length, 0) || 0
)

// Drawer state
const showDrawer = ref(false)
const selectedFeature = ref<any>(null)

// Helper functions to extract command properties
function getCommandName(command: IFeatureCommand, feature: any): string {
  // Try to get name from feature structure if it exists
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].name || command.type
  }
  return command.type
}

function getCommandShortcut(command: IFeatureCommand, feature: any): string | undefined {
  // Try to get shortcut from feature structure if it exists
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].shortcut
  }
  return undefined
}

function getCommandDesc(command: IFeatureCommand, feature: any): string | undefined {
  // Try to get description from feature structure if it exists
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].desc
  }
  return undefined
}

// Feature details management
function showFeatureDetails(feature: any): void {
  selectedFeature.value = feature
  showDrawer.value = true
}

function handleDrawerClose(): void {
  showDrawer.value = false
  selectedFeature.value = null
}
</script>

<style lang="scss" scoped>
/* UnoCSS handles most styling, minimal custom styles needed */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.PluginFeature-Modal {
  animation: fadeIn 0.2s ease-out;
}

.PluginFeature-ModalContent {
  animation: slideUp 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

pre {
  font-family:
    'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}
</style>

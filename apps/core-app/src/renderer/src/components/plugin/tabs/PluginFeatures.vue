<template>
  <div class="PluginFeature w-full">
    <!-- Stats Header -->
    <div class="PluginFeature-Header mb-6">
      <div class="grid grid-cols-2 gap-4">
        <StatCard
          :value="plugin.features?.length || 0"
          label="Features"
          icon-class="i-ri-function-line text-6xl text-blue-500"
        />
        <StatCard
          :value="totalCommands"
          label="Commands"
          icon-class="i-ri-terminal-box-line text-6xl text-[var(--el-color-success)]"
        />
      </div>
    </div>

    <!-- Features Grid -->
    <GridLayout v-if="plugin.features?.length">
      <FeatureCard
        v-for="feature in plugin.features"
        :key="feature.id"
        :feature="feature"
        @click="showFeatureDetails(feature)"
      />
    </GridLayout>

    <!-- Empty State -->
    <div
      v-else
      class="PluginFeature-EmptyState flex flex-col items-center justify-center py-16 text-center"
    >
      <div
        class="PluginFeature-EmptyIcon w-20 h-20 bg-[var(--el-bg-color-overlay)] rounded-2xl flex items-center justify-center mb-6"
      >
        <i class="i-ri-function-line text-4xl text-[var(--el-text-color-disabled)]" />
      </div>
      <h3 class="text-xl font-semibold text-[var(--el-text-color-primary)] mb-2">
        No Features Available
      </h3>
      <p class="text-[var(--el-text-color-secondary)]">
        This plugin doesn't expose any features yet.
      </p>
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
            class="w-10 h-10 bg-gradient-to-br from-[var(--el-color-primary)] to-[var(--el-color-primary-light-3)] rounded-xl flex items-center justify-center"
          >
            <i
              :class="selectedFeature?.icon || 'i-ri-function-line'"
              class="text-[var(--el-color-white)] text-lg"
            />
          </div>
          <div>
            <h2 class="text-xl font-bold text-[var(--el-text-color-primary)]">
              {{ selectedFeature?.name }}
            </h2>
            <p class="text-sm text-[var(--el-text-color-regular)]">{{ selectedFeature?.desc }}</p>
          </div>
        </div>
      </template>

      <div v-if="selectedFeature" class="PluginFeature-DrawerContent px-4">
        <!-- Feature Overview -->
        <div class="PluginFeature-Overview mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-information-line text-[var(--el-color-primary)]" />
            Overview
          </h3>
          <div class="bg-[var(--el-fill-color-lighter)] rounded-xl p-4 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">Feature ID:</span>
              <code class="text-sm bg-[var(--el-fill-color)] px-2 py-1 rounded">{{
                selectedFeature.id
              }}</code>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">Commands Count:</span>
              <span class="text-sm font-medium">{{ selectedFeature.commands.length }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">Feature Type:</span>
              <span
                class="text-sm bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)] px-2 py-1 rounded"
                >{{ selectedFeature.type || 'Standard' }}</span
              >
            </div>
          </div>
        </div>

        <!-- Commands Section -->
        <div class="PluginFeature-Commands mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-terminal-line text-[var(--el-color-success)]" />
            Commands ({{ selectedFeature.commands.length }})
          </h3>
          <div class="space-y-4">
            <div
              v-for="(command, index) in selectedFeature.commands"
              :key="index"
              class="PluginFeature-CommandDetail bg-[var(--el-fill-color-lighter)] rounded-xl p-4"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 bg-[var(--el-color-warning-light-9)] rounded-lg flex items-center justify-center"
                  >
                    <i class="i-ri-terminal-line text-[var(--el-color-warning)] text-sm" />
                  </div>
                  <div>
                    <h4 class="font-semibold text-[var(--el-text-color-primary)]">
                      {{ getCommandName(command, selectedFeature) }}
                    </h4>
                    <p
                      v-if="getCommandDesc(command, selectedFeature)"
                      class="text-sm text-[var(--el-text-color-regular)]"
                    >
                      {{ getCommandDesc(command, selectedFeature) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    v-if="getCommandShortcut(command, selectedFeature)"
                    class="bg-[var(--el-fill-color)] text-[var(--el-text-color-regular)] text-xs px-2 py-1 rounded border"
                  >
                    {{ getCommandShortcut(command, selectedFeature) }}
                  </span>
                  <span
                    class="bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)] text-xs px-2 py-1 rounded"
                  >
                    {{ command.type }}
                  </span>
                </div>
              </div>

              <!-- Command JSON -->
              <div class="mt-3">
                <ElCollapse>
                  <ElCollapseItem title="View JSON" :name="index">
                    <div class="bg-[var(--el-bg-color-page)] rounded-lg p-4 overflow-x-auto">
                      <pre class="text-xs text-[var(--el-text-color-secondary)]">{{
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
            <i class="i-ri-code-line text-[var(--el-color-info)]" />
            Raw Feature Data
          </h3>
          <ElCollapse>
            <ElCollapseItem title="View Complete Feature JSON" name="feature-json">
              <div class="bg-[var(--el-bg-color-page)] rounded-lg p-4 overflow-x-auto">
                <pre class="text-xs text-[var(--el-text-color-secondary)]">{{
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
import StatCard from '../../base/card/StatCard.vue'
import GridLayout from '../../base/layout/GridLayout.vue'
import FeatureCard from '../FeatureCard.vue'

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
const selectedFeature = ref<any | null>(null)

// Helper functions for drawer content
function getCommandName(command: IFeatureCommand, feature: any): string {
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].name || command.type
  }
  return command.type
}

function getCommandShortcut(command: IFeatureCommand, feature: any): string | undefined {
  if (feature.commandsData && feature.commandsData[command.type]) {
    return feature.commandsData[command.type].shortcut
  }
  return undefined
}

function getCommandDesc(command: IFeatureCommand, feature: any): string | undefined {
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
pre {
  font-family:
    'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}
</style>

<script lang="ts" setup>
import type { IFeatureCommand, ITouchPlugin } from '@talex-touch/utils/plugin'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import StatCard from '../../base/card/StatCard.vue'
import GridLayout from '../../base/layout/GridLayout.vue'
import FeatureCard from '../FeatureCard.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// Features state - with defensive checks
const features = computed(() => props.plugin?.features || [])

const totalCommands = computed(() =>
  features.value.reduce((total, feature) => total + (feature.commands?.length || 0), 0),
)

const { t } = useI18n()

// Drawer state
const showDrawer = ref(false)
const selectedFeature = ref<any | null>(null)

// Helper function to get icon for input type
function getInputTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    text: 'i-ri-text',
    image: 'i-ri-image-line',
    files: 'i-ri-file-copy-line',
    html: 'i-ri-code-line',
  }
  return icons[type] || 'i-ri-question-line'
}

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

<template>
  <div class="PluginFeature w-full">
    <!-- Stats Header -->
    <div class="PluginFeature-Header mb-6">
      <div class="grid grid-cols-2 gap-4">
        <StatCard
          :value="plugin.features?.length || 0"
          :label="t('plugin.features.stats.features')"
          icon-class="i-ri-function-line text-6xl text-blue-500"
        />
        <StatCard
          :value="totalCommands"
          :label="t('plugin.features.stats.commands')"
          icon-class="i-ri-terminal-box-line text-6xl text-[var(--el-color-success)]"
        />
      </div>
    </div>

    <!-- Features Grid -->
    <GridLayout v-if="plugin?.features?.length && features.length">
      <FeatureCard
        v-for="feature in features"
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
        {{ t('plugin.features.empty.title') }}
      </h3>
      <p class="text-[var(--el-text-color-secondary)]">
        {{ t('plugin.features.empty.subtitle') }}
      </p>
    </div>

    <!-- Feature Detail Drawer -->
    <ElDrawer
      v-model="showDrawer"
      :title="t('plugin.features.drawer.title')"
      direction="rtl"
      size="50%"
      :before-close="handleDrawerClose"
    >
      <template #header>
        <div class="flex items-center gap-4 py-2">
          <div
            class="w-10 h-10 bg-gradient-to-br from-[var(--el-color-primary)] to-[var(--el-color-primary-light-3)] rounded-xl flex items-center justify-center overflow-hidden"
          >
            <TuffIcon
              v-if="selectedFeature?.icon"
              :icon="selectedFeature.icon"
              :alt="selectedFeature.name"
              :size="24"
              class="text-[var(--el-color-white)]"
            />
            <i v-else class="i-ri-function-line text-[var(--el-color-white)] text-lg" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-[var(--el-text-color-primary)]">
              {{ selectedFeature?.name }}
            </h2>
            <p class="text-sm text-[var(--el-text-color-regular)]">
              {{ selectedFeature?.desc }}
            </p>
          </div>
        </div>
      </template>

      <div v-if="selectedFeature" class="PluginFeature-DrawerContent px-4">
        <!-- Feature Overview -->
        <div class="PluginFeature-Overview mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-information-line text-[var(--el-color-primary)]" />
            {{ t('plugin.features.drawer.overview') }}
          </h3>
          <div class="bg-[var(--el-fill-color-lighter)] rounded-xl p-4 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.drawer.featureId') }}
              </span>
              <code class="text-sm bg-[var(--el-fill-color)] px-2 py-1 rounded">{{
                selectedFeature.id
              }}</code>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.drawer.commandsCount') }}
              </span>
              <span class="text-sm font-medium">{{ selectedFeature.commands.length }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.drawer.featureType') }}
              </span>
              <span
                class="text-sm bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)] px-2 py-1 rounded"
              >{{ selectedFeature.type || t('plugin.features.drawer.standardType') }}</span>
            </div>
            <div v-if="selectedFeature.acceptedInputTypes" class="flex justify-between items-start">
              <span class="text-sm text-[var(--el-text-color-regular)]"> 支持的输入类型 </span>
              <div class="flex flex-wrap gap-1 justify-end max-w-[60%]">
                <span
                  v-for="inputType in selectedFeature.acceptedInputTypes"
                  :key="inputType"
                  class="text-xs bg-[var(--el-color-success-light-9)] text-[var(--el-color-success)] px-2 py-1 rounded"
                >
                  <i :class="getInputTypeIcon(inputType)" class="mr-1" />
                  {{ inputType }}
                </span>
              </div>
            </div>
            <div v-else class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]"> 支持的输入类型 </span>
              <span class="text-xs text-[var(--el-text-color-secondary)]">
                <i class="i-ri-text mr-1" />
                text (默认)
              </span>
            </div>
            <div
              v-if="selectedFeature.priority !== undefined"
              class="flex justify-between items-center"
            >
              <span class="text-sm text-[var(--el-text-color-regular)]"> 优先级 </span>
              <span class="text-sm font-medium">{{ selectedFeature.priority }}</span>
            </div>
          </div>
        </div>

        <!-- Commands Section -->
        <div class="PluginFeature-Commands mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-terminal-line text-[var(--el-color-success)]" />
            {{
              t('plugin.features.drawer.commandsTitle', { count: selectedFeature.commands.length })
            }}
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
                  <ElCollapseItem :title="t('plugin.features.drawer.viewJson')" :name="index">
                    <div class="bg-[var(--el-bg-color-page)] rounded-lg p-4">
                      <TouchScroll native no-padding direction="horizontal">
                        <pre class="text-xs text-[var(--el-text-color-secondary)]">{{
                          JSON.stringify(command, null, 2)
                        }}</pre>
                      </TouchScroll>
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
            {{ t('plugin.features.drawer.rawData') }}
          </h3>
          <ElCollapse>
            <ElCollapseItem :title="t('plugin.features.drawer.viewFullJson')" name="feature-json">
              <div class="bg-[var(--el-bg-color-page)] rounded-lg p-4">
                <TouchScroll native no-padding direction="horizontal">
                  <pre class="text-xs text-[var(--el-text-color-secondary)]">{{
                    JSON.stringify(selectedFeature, null, 2)
                  }}</pre>
                </TouchScroll>
              </div>
            </ElCollapseItem>
          </ElCollapse>
        </div>
      </div>
    </ElDrawer>
  </div>
</template>

<style lang="scss" scoped>
pre {
  font-family:
    'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}
</style>

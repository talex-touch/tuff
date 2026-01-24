<script lang="ts" setup>
import type { IFeatureCommand, IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { TxButton } from '@talex-touch/tuffex'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffIcon from '~/components/base/TuffIcon.vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'
import StatCard from '../../base/card/StatCard.vue'
import GridLayout from '../../base/layout/GridLayout.vue'
import FeatureCard from '../FeatureCard.vue'

interface FeatureCommandData {
  name?: string
  shortcut?: string
  desc?: string
}

type PluginFeatureWithCommandsData = IPluginFeature & {
  commandsData?: Partial<Record<IFeatureCommand['type'], FeatureCommandData>>
}

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

const supportedWidgetExtensions = ['.vue', '.tsx', '.jsx', '.ts', '.js']

const widgetTemplate = [
  '<template>',
  '  <div class="widget-root">',
  '    <h3>Widget Title</h3>',
  '    <p>Start building your widget here.</p>',
  '  </div>',
  '</template>',
  '',
  '<script setup lang="ts">',
  "// Example: import { ref } from 'vue'",
  '</scr' + 'ipt>',
  '',
  '<style scoped>',
  '.widget-root {',
  '  padding: 12px;',
  '}',
  '</style>',
  ''
].join('\n')

// Features state - with defensive checks
const features = computed<PluginFeatureWithCommandsData[]>(() => props.plugin?.features || [])

const totalCommands = computed(() =>
  features.value.reduce((total, feature) => total + (feature.commands?.length || 0), 0)
)

const { t } = useI18n()
const isPluginDev = computed(() => Boolean(props.plugin?.dev?.enable))

// Drawer state
const showDrawer = ref(false)
const selectedFeature = ref<PluginFeatureWithCommandsData | null>(null)
const widgetPathInput = ref('')
const widgetCodeInput = ref(widgetTemplate)
const isSavingWidget = ref(false)
const widgetDragActive = ref(false)

// Helper function to get icon for input type
function getInputTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    text: 'i-ri-text',
    image: 'i-ri-image-line',
    files: 'i-ri-file-copy-line',
    html: 'i-ri-code-line'
  }
  return icons[type] || 'i-ri-question-line'
}

// Helper functions for drawer content
function getCommandName(command: IFeatureCommand, feature: PluginFeatureWithCommandsData): string {
  const data = feature.commandsData?.[command.type]
  if (data?.name) return data.name
  return command.type
}

function getCommandShortcut(
  command: IFeatureCommand,
  feature: PluginFeatureWithCommandsData
): string | undefined {
  return feature.commandsData?.[command.type]?.shortcut
}

function getCommandDesc(
  command: IFeatureCommand,
  feature: PluginFeatureWithCommandsData
): string | undefined {
  return feature.commandsData?.[command.type]?.desc
}

// Feature details management
function showFeatureDetails(feature: PluginFeatureWithCommandsData): void {
  selectedFeature.value = feature
  showDrawer.value = true
  widgetPathInput.value = getWidgetPath(feature) || ''
  widgetCodeInput.value = widgetTemplate
  widgetDragActive.value = false
}

function handleDrawerClose(): void {
  showDrawer.value = false
  selectedFeature.value = null
  widgetPathInput.value = ''
  widgetCodeInput.value = widgetTemplate
  widgetDragActive.value = false
}

function isWidgetFeature(feature?: PluginFeatureWithCommandsData | null): boolean {
  return feature?.interaction?.type === 'widget'
}

function getWidgetPath(feature?: PluginFeatureWithCommandsData | null): string | null {
  const raw = feature?.interaction?.path
  return typeof raw === 'string' && raw.trim().length ? raw.trim() : null
}

function getWidgetExtension(pathValue?: string | null): string | null {
  if (!pathValue) return null
  const normalized = pathValue.split('?')[0].split('#')[0]
  const ext = normalized.includes('.') ? `.${normalized.split('.').pop()}` : null
  return ext ? ext.toLowerCase() : null
}

function getWidgetId(feature?: PluginFeatureWithCommandsData | null): string | null {
  if (!feature) return null
  return `${props.plugin.name}::${feature.id}`
}

function resolveWidgetDisplayPath(feature?: PluginFeatureWithCommandsData | null): string {
  const raw = getWidgetPath(feature)
  if (!raw) return t('plugin.features.widget.missingPath')
  return raw
}

function resolveWidgetSourceUrl(feature?: PluginFeatureWithCommandsData | null): string | null {
  if (
    !feature ||
    !props.plugin.dev?.enable ||
    !props.plugin.dev?.source ||
    !props.plugin.dev?.address
  ) {
    return null
  }
  const rawPath = getWidgetPath(feature)
  if (!rawPath) return null
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const trimmed = normalized.replace(/^widgets\//, '')
  if (!trimmed) return null
  const withExt = getWidgetExtension(trimmed) ? trimmed : `${trimmed}.vue`
  const base = props.plugin.dev?.address
  try {
    return new URL(`widgets/${withExt}`, base).toString()
  } catch {
    return null
  }
}

function handleWidgetDragOver(): void {
  widgetDragActive.value = true
}

function handleWidgetDragLeave(): void {
  widgetDragActive.value = false
}

async function handleWidgetDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  widgetDragActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const ext = getWidgetExtension(file.name)
  if (!ext || !supportedWidgetExtensions.includes(ext)) {
    ElMessage.error(t('plugin.features.widget.invalidFileType'))
    return
  }
  widgetPathInput.value = file.name
  widgetCodeInput.value = await file.text()
}

async function saveWidgetSource(): Promise<void> {
  if (!selectedFeature.value || isSavingWidget.value) return
  const pathValue = widgetPathInput.value.trim()
  if (!pathValue) {
    ElMessage.warning(t('plugin.features.widget.pathRequired'))
    return
  }
  if (!widgetCodeInput.value.trim()) {
    ElMessage.warning(t('plugin.features.widget.sourceRequired'))
    return
  }
  const ext = getWidgetExtension(pathValue)
  if (ext && !supportedWidgetExtensions.includes(ext)) {
    ElMessage.error(t('plugin.features.widget.invalidExtension'))
    return
  }

  isSavingWidget.value = true
  try {
    const result = await pluginSDK.saveWidgetFile(
      props.plugin.name,
      pathValue,
      widgetCodeInput.value,
      { overwrite: true }
    )
    if (result.success) {
      widgetPathInput.value = result.relativePath || pathValue
      const manifest = await pluginSDK.getManifest(props.plugin.name)
      if (manifest && Array.isArray(manifest.features)) {
        const featuresData = manifest.features as Array<Record<string, unknown>>
        const target = featuresData.find((item) => item?.id === selectedFeature.value?.id)
        if (target) {
          const interaction = (target.interaction as Record<string, unknown>) || {}
          interaction.type = 'widget'
          interaction.path = result.relativePath || pathValue
          target.interaction = interaction
          const saved = await pluginSDK.saveManifest(props.plugin.name, manifest, true)
          if (!saved) {
            ElMessage.warning(t('plugin.features.widget.savedButManifestFailed'))
          }
        } else {
          ElMessage.warning(t('plugin.features.widget.savedButManifestFailed'))
        }
      } else {
        ElMessage.warning(t('plugin.features.widget.savedButManifestFailed'))
      }
      ElMessage.success(t('plugin.features.widget.saveSuccess'))
    } else {
      const fallback = t('plugin.features.widget.saveFailed')
      const message =
        result.error && result.error !== 'SAVE_WIDGET_FILE_FAILED' ? result.error : fallback
      ElMessage.error(message)
    }
  } catch (error) {
    console.error('Failed to save widget source:', error)
    ElMessage.error(t('plugin.features.widget.saveFailed'))
  } finally {
    isSavingWidget.value = false
  }
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
      append-to-body
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
                >{{
                  selectedFeature.interaction?.type || t('plugin.features.drawer.standardType')
                }}</span
              >
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

        <!-- Widget Section -->
        <div v-if="isWidgetFeature(selectedFeature)" class="PluginFeature-Widget mb-8">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="i-ri-layout-2-line text-[var(--el-color-warning)]" />
            {{ t('plugin.features.widget.title') }}
          </h3>
          <div class="bg-[var(--el-fill-color-lighter)] rounded-xl p-4 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.widget.widgetId') }}
              </span>
              <code class="text-sm bg-[var(--el-fill-color)] px-2 py-1 rounded">
                {{ getWidgetId(selectedFeature) }}
              </code>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.widget.path') }}
              </span>
              <code class="text-sm bg-[var(--el-fill-color)] px-2 py-1 rounded">
                {{ resolveWidgetDisplayPath(selectedFeature) }}
              </code>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.widget.extension') }}
              </span>
              <span class="text-sm font-medium">
                {{
                  getWidgetExtension(getWidgetPath(selectedFeature)) ||
                  t('plugin.features.widget.extensionDefault')
                }}
              </span>
            </div>
            <div
              v-if="resolveWidgetSourceUrl(selectedFeature)"
              class="flex justify-between items-center"
            >
              <span class="text-sm text-[var(--el-text-color-regular)]">
                {{ t('plugin.features.widget.devSource') }}
              </span>
              <code
                class="text-xs bg-[var(--el-fill-color)] px-2 py-1 rounded break-all text-right"
              >
                {{ resolveWidgetSourceUrl(selectedFeature) }}
              </code>
            </div>
          </div>

          <div v-if="isPluginDev" class="PluginFeature-WidgetEditor mt-4">
            <div class="text-sm text-[var(--el-text-color-secondary)] mb-3">
              {{ t('plugin.features.widget.devHint') }}
            </div>
            <div class="space-y-3">
              <div>
                <div class="text-xs text-[var(--el-text-color-regular)] mb-1">
                  {{ t('plugin.features.widget.pathInput') }}
                </div>
                <el-input
                  v-model="widgetPathInput"
                  size="small"
                  :placeholder="t('plugin.features.widget.pathPlaceholder')"
                />
              </div>
              <div>
                <div class="text-xs text-[var(--el-text-color-regular)] mb-1">
                  {{ t('plugin.features.widget.sourceInput') }}
                </div>
                <div
                  class="WidgetDropZone mb-2"
                  :class="{ active: widgetDragActive }"
                  @dragenter.prevent="handleWidgetDragOver"
                  @dragover.prevent="handleWidgetDragOver"
                  @dragleave.prevent="handleWidgetDragLeave"
                  @drop.prevent="handleWidgetDrop"
                >
                  <div class="flex items-center justify-between">
                    <div class="text-xs text-[var(--el-text-color-secondary)]">
                      {{ t('plugin.features.widget.dragHint') }}
                    </div>
                    <div class="text-xs text-[var(--el-text-color-placeholder)]">
                      {{ supportedWidgetExtensions.join(', ') }}
                    </div>
                  </div>
                </div>
                <el-input
                  v-model="widgetCodeInput"
                  type="textarea"
                  :rows="10"
                  resize="vertical"
                  :placeholder="t('plugin.features.widget.sourcePlaceholder')"
                />
              </div>
              <div class="flex items-center justify-between">
                <div class="text-xs text-[var(--el-text-color-secondary)]">
                  {{ t('plugin.features.widget.extensionsHint') }}
                </div>
                <TxButton
                  variant="flat"
                  type="primary"
                  size="sm"
                  :loading="isSavingWidget"
                  :disabled="isSavingWidget"
                  @click="saveWidgetSource"
                >
                  <i v-if="isSavingWidget" class="i-ri-loader-4-line animate-spin" />
                  <i v-else class="i-ri-save-3-line" />
                  <span class="ml-1">{{ t('plugin.features.widget.save') }}</span>
                </TxButton>
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-[var(--el-text-color-secondary)] mt-3">
            {{ t('plugin.features.widget.devOnly') }}
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

.WidgetDropZone {
  border: 1px dashed var(--el-border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  cursor: copy;

  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
}
</style>

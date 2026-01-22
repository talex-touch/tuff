<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { TxButton } from '@talex-touch/tuffex'
import { ElMessage } from 'element-plus'
import { onMounted, reactive, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()
const plugin = toRef(props, 'plugin')

const { t } = useI18n()

// Development settings (editable)
const devSettings = reactive({
  enable: false,
  address: '',
  source: false,
  autoStart: true
})

// Track if settings have been modified
const hasChanges = ref(false)
const isSaving = ref(false)

// Plugin paths
const pluginPaths = ref<{
  pluginPath: string
  dataPath: string
  configPath: string
  logsPath: string
  tempPath: string
} | null>(null)

// Manifest data
const manifestData = ref<Record<string, unknown> | null>(null)
const manifestLoading = ref(false)
const manifestError = ref<string | null>(null)

// Performance data
const performanceData = ref<{
  storage: {
    totalSize: number
    fileCount: number
    dirCount: number
    maxSize: number
    usagePercent: number
  }
  performance: {
    loadTime: number
    memoryUsage: number
    cpuUsage: number
    lastActiveTime: number
  }
} | null>(null)

// Initialize dev settings from plugin
function initDevSettings(): void {
  devSettings.enable = plugin.value.dev?.enable ?? false
  devSettings.address = plugin.value.dev?.address ?? ''
  devSettings.source = plugin.value.dev?.source ?? false
  hasChanges.value = false
}

// Watch for changes in dev settings
watch(
  devSettings,
  () => {
    const original = plugin.value.dev
    hasChanges.value =
      devSettings.enable !== (original?.enable ?? false) ||
      devSettings.address !== (original?.address ?? '') ||
      devSettings.source !== (original?.source ?? false)
  },
  { deep: true }
)

// Load plugin paths
async function loadPaths(): Promise<void> {
  pluginPaths.value = await pluginSDK.getPaths(plugin.value.name)
}

// Load performance data
async function loadPerformance(): Promise<void> {
  performanceData.value = await pluginSDK.getPerformance(plugin.value.name)
}

function pickString(key: string): string {
  const value = manifestData.value?.[key]
  if (typeof value !== 'string') return ''
  return value
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

const manifestSummary = computed(() => {
  const description = pickString('description') || pickString('desc') || plugin.value.desc || ''
  const id = pickString('id') || pickString('pluginId')
  const author = pickString('author')
  const main = pickString('main')
  const pluginExtras = plugin.value as { category?: string; features?: unknown[] }
  const category = pickString('category') || pluginExtras.category || ''

  const rawFeatures = manifestData.value?.features
  const featureCount = Array.isArray(rawFeatures)
    ? rawFeatures.length
    : (pluginExtras.features?.length ?? 0)

  const rawPermissions = manifestData.value?.permissions
  let required: string[] = []
  let optional: string[] = []

  if (Array.isArray(rawPermissions)) {
    required = pickStringArray(rawPermissions)
  } else if (rawPermissions && typeof rawPermissions === 'object') {
    const obj = rawPermissions as Record<string, unknown>
    required = pickStringArray(obj.required)
    optional = pickStringArray(obj.optional)
  }

  return {
    id,
    author,
    category,
    description,
    main,
    featureCount,
    permissions: { required, optional }
  }
})

async function loadManifest(): Promise<void> {
  manifestLoading.value = true
  try {
    manifestData.value = await pluginSDK.getManifest(plugin.value.name)
    manifestError.value = null
  } catch (error) {
    manifestData.value = null
    manifestError.value = error instanceof Error ? error.message : String(error)
  } finally {
    manifestLoading.value = false
  }
}

// Save dev settings
async function saveDevSettings(): Promise<void> {
  if (isSaving.value) return

  isSaving.value = true
  try {
    const manifest = await pluginSDK.getManifest(plugin.value.name)
    if (!manifest) {
      ElMessage.error(t('plugin.details.saveError'))
      return
    }

    // Update dev settings in manifest
    manifest.dev = {
      enable: devSettings.enable,
      address: devSettings.address,
      source: devSettings.source
    }

    const success = await pluginSDK.saveManifest(plugin.value.name, manifest, true)
    if (success) {
      ElMessage.success(t('plugin.details.saveSuccess'))
      hasChanges.value = false
      loadManifest()
    } else {
      ElMessage.error(t('plugin.details.saveError'))
    }
  } catch (error) {
    console.error('Failed to save dev settings:', error)
    ElMessage.error(t('plugin.details.saveError'))
  } finally {
    isSaving.value = false
  }
}

// Open path in file explorer
async function openPath(pathType: 'plugin' | 'data' | 'config' | 'logs' | 'temp'): Promise<void> {
  await pluginSDK.openPath(plugin.value.name, pathType)
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}

// Format milliseconds
function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// Format SDK version (YYMMDD -> YYYY-MM-DD)
function formatSdkVersion(sdkapi: number): string {
  const str = String(sdkapi)
  if (str.length !== 6) return str
  const year = `20${str.slice(0, 2)}`
  const month = str.slice(2, 4)
  const day = str.slice(4, 6)
  return `${year}-${month}-${day}`
}

// Shorten path for display
function shortenPath(fullPath: string): string {
  if (!fullPath) return ''
  const parts = fullPath.split(/[/\\]/)
  if (parts.length <= 3) return fullPath
  return `.../${parts.slice(-2).join('/')}`
}

// Initialize on mount
onMounted(() => {
  initDevSettings()
  loadPaths()
  loadPerformance()
  loadManifest()
})

// Re-initialize when plugin changes
watch(
  () => plugin.value.name,
  () => {
    initDevSettings()
    loadPaths()
    loadPerformance()
    loadManifest()
  }
)
</script>

<template>
  <div class="PluginDetails w-full space-y-4">
    <!-- 1. Basic Information -->
    <TuffGroupBlock
      :name="t('plugin.details.basicInfo')"
      :description="manifestSummary.description || t('plugin.details.noDescription')"
      default-icon="i-carbon-information"
      active-icon="i-carbon-information-filled"
      memory-name="plugin-details-basic"
    >
      <TuffBlockLine :title="t('plugin.details.pluginId')">
        <template #description>
          <code class="text-xs bg-[var(--el-fill-color-darker)] px-2 py-0.5 rounded">{{
            plugin.name
          }}</code>
        </template>
      </TuffBlockLine>
      <TuffBlockLine :title="t('plugin.details.version')">
        <template #description>
          <span class="text-[var(--el-color-success)] font-semibold">v{{ plugin.version }}</span>
        </template>
      </TuffBlockLine>
      <TuffBlockLine title="SDK API">
        <template #description>
          <span v-if="plugin.sdkapi" class="font-mono text-xs">
            {{ plugin.sdkapi }}
            <span class="text-[var(--el-text-color-secondary)] ml-1">
              ({{ formatSdkVersion(plugin.sdkapi) }})
            </span>
          </span>
          <span v-else class="text-[var(--el-color-warning)]">未声明</span>
        </template>
      </TuffBlockLine>
      <TuffBlockLine :title="t('plugin.details.mode')">
        <template #description>
          <span
            :class="
              plugin.dev?.enable
                ? 'text-[var(--el-color-primary)]'
                : 'text-[var(--el-color-success)]'
            "
            class="font-medium"
          >
            {{
              plugin.dev?.enable ? t('plugin.details.development') : t('plugin.details.production')
            }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockSlot
        title="manifest.json"
        description="插件清单（只读展示）"
        default-icon="i-carbon-document"
      >
        <TxButton variant="flat" :disabled="manifestLoading" @click="loadManifest">
          <i v-if="manifestLoading" class="i-ri-loader-4-line animate-spin" />
          <i v-else class="i-ri-refresh-line" />
          <span>{{ manifestLoading ? '刷新中...' : '刷新' }}</span>
        </TxButton>
      </TuffBlockSlot>

      <TuffBlockLine v-if="manifestSummary.id" title="ID">
        <template #description>
          <code class="text-xs bg-[var(--el-fill-color-darker)] px-2 py-0.5 rounded">{{
            manifestSummary.id
          }}</code>
        </template>
      </TuffBlockLine>
      <TuffBlockLine v-if="manifestSummary.author" title="Author">
        <template #description>
          <span class="text-sm">{{ manifestSummary.author }}</span>
        </template>
      </TuffBlockLine>
      <TuffBlockLine v-if="manifestSummary.category" title="Category">
        <template #description>
          <span class="text-sm">{{ manifestSummary.category }}</span>
        </template>
      </TuffBlockLine>
      <TuffBlockLine title="Description" :description="manifestSummary.description || '--'" />
      <TuffBlockLine v-if="manifestSummary.main" title="Main">
        <template #description>
          <code class="text-xs bg-[var(--el-fill-color-darker)] px-2 py-0.5 rounded">{{
            manifestSummary.main
          }}</code>
        </template>
      </TuffBlockLine>
      <TuffBlockLine title="Features">
        <template #description>
          <span class="text-sm font-semibold">{{ manifestSummary.featureCount }}</span>
        </template>
      </TuffBlockLine>
      <TuffBlockLine
        v-if="
          manifestSummary.permissions.required.length || manifestSummary.permissions.optional.length
        "
        title="Permissions"
      >
        <template #description>
          <div class="flex flex-col gap-1">
            <div v-if="manifestSummary.permissions.required.length">
              <span class="text-[var(--el-color-danger)] font-semibold">Required</span>：
              <span>{{ manifestSummary.permissions.required.join(', ') }}</span>
            </div>
            <div v-if="manifestSummary.permissions.optional.length">
              <span class="text-[var(--el-color-warning)] font-semibold">Optional</span>：
              <span>{{ manifestSummary.permissions.optional.join(', ') }}</span>
            </div>
          </div>
        </template>
      </TuffBlockLine>
      <TuffBlockLine v-if="manifestError" title="Error">
        <template #description>
          <span class="text-[var(--el-color-danger)] text-xs">{{ manifestError }}</span>
        </template>
      </TuffBlockLine>
    </TuffGroupBlock>

    <!-- 2. Development Settings (Editable) -->
    <TuffGroupBlock
      :name="t('plugin.details.devSettings')"
      :description="t('plugin.details.devSettingsDesc')"
      default-icon="i-carbon-code"
      active-icon="i-carbon-code"
      memory-name="plugin-details-dev"
    >
      <TuffBlockSlot
        :title="t('plugin.details.save')"
        :description="t('plugin.details.saveDesc')"
        default-icon="i-ri-save-line"
        active-icon="i-ri-save-line"
      >
        <TxButton variant="flat" :disabled="!hasChanges || isSaving" @click="saveDevSettings">
          <i v-if="isSaving" class="i-ri-loader-4-line animate-spin" />
          <i v-else class="i-ri-save-line" />
          <span>{{ isSaving ? t('plugin.details.saving') : t('plugin.details.save') }}</span>
        </TxButton>
      </TuffBlockSlot>

      <TuffBlockSwitch
        v-model="devSettings.autoStart"
        :title="t('plugin.details.autoStart')"
        :description="t('plugin.details.autoStartDesc')"
        default-icon="i-carbon-play-filled-alt"
        active-icon="i-carbon-play-filled-alt"
      />
      <TuffBlockSwitch
        v-model="devSettings.enable"
        :title="t('plugin.details.hotReload')"
        :description="t('plugin.details.hotReloadDesc')"
        default-icon="i-carbon-restart"
        active-icon="i-carbon-restart"
      />
      <TuffBlockInput
        v-model="devSettings.address"
        :title="t('plugin.details.devAddress')"
        :description="t('plugin.details.devAddressDesc')"
        :placeholder="t('plugin.details.devAddressPlaceholder')"
        :disabled="!devSettings.enable"
        default-icon="i-carbon-link"
        active-icon="i-carbon-link"
      />
      <TuffBlockSwitch
        v-model="devSettings.source"
        :title="t('plugin.details.sourceMode')"
        :description="t('plugin.details.sourceModeDesc')"
        :disabled="!devSettings.enable"
        default-icon="i-carbon-document-download"
        active-icon="i-carbon-document-download"
      />
    </TuffGroupBlock>

    <!-- 3. Performance -->
    <TuffGroupBlock
      :name="t('plugin.details.performance')"
      :description="t('plugin.details.performanceDesc')"
      default-icon="i-carbon-meter"
      active-icon="i-carbon-meter-alt"
      memory-name="plugin-details-perf"
    >
      <TuffBlockSlot
        :title="t('plugin.details.loadTime')"
        :description="t('plugin.details.loadTimeDesc')"
        default-icon="i-carbon-timer"
      >
        <span class="text-sm font-semibold text-[var(--el-color-primary)]">
          {{ performanceData ? formatMs(performanceData.performance.loadTime) : '--' }}
        </span>
      </TuffBlockSlot>
      <TuffBlockSlot
        :title="t('plugin.details.memoryUsage')"
        :description="t('plugin.details.memoryUsageDesc')"
        default-icon="i-carbon-chip"
      >
        <span class="text-sm font-semibold text-[var(--el-color-info)]">
          {{ performanceData ? formatBytes(performanceData.performance.memoryUsage) : '--' }}
        </span>
      </TuffBlockSlot>
      <TuffBlockSlot
        :title="t('plugin.details.storageUsage')"
        :description="t('plugin.details.storageUsageDesc')"
        default-icon="i-carbon-data-base"
      >
        <div class="flex items-center gap-2">
          <div class="w-24 h-2 bg-[var(--el-fill-color)] rounded-full overflow-hidden">
            <div
              v-if="performanceData"
              class="h-full rounded-full transition-all duration-300"
              :class="
                performanceData.storage.usagePercent > 80
                  ? 'bg-[var(--el-color-danger)]'
                  : 'bg-[var(--el-color-primary)]'
              "
              :style="{ width: `${performanceData.storage.usagePercent}%` }"
            />
          </div>
          <span class="text-xs text-[var(--el-text-color-secondary)]">
            {{ performanceData ? `${performanceData.storage.usagePercent.toFixed(1)}%` : '--' }}
          </span>
        </div>
      </TuffBlockSlot>
      <TuffBlockLine :title="t('plugin.details.fileCount')">
        <template #description>
          <span class="font-semibold">
            {{
              performanceData
                ? `${performanceData.storage.fileCount} ${t('plugin.details.files')}`
                : '--'
            }}
          </span>
        </template>
      </TuffBlockLine>
    </TuffGroupBlock>

    <!-- 4. Configuration & Paths -->
    <TuffGroupBlock
      :name="t('plugin.details.configuration')"
      :description="t('plugin.details.configurationDesc')"
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder-open"
      memory-name="plugin-details-config"
    >
      <TuffBlockSlot
        :title="t('plugin.details.pluginPath')"
        default-icon="i-carbon-folder-details"
        @click="openPath('plugin')"
      >
        <template #label>
          <div class="flex flex-col">
            <span class="text-sm font-medium">{{ t('plugin.details.pluginPath') }}</span>
            <code
              class="text-xs text-[var(--el-text-color-secondary)] truncate max-w-48"
              :title="pluginPaths?.pluginPath"
            >
              {{ pluginPaths ? shortenPath(pluginPaths.pluginPath) : '...' }}
            </code>
          </div>
        </template>
        <i
          class="i-carbon-folder-open text-lg text-[var(--el-color-primary)] cursor-pointer hover:scale-110 transition-transform"
        />
      </TuffBlockSlot>
      <TuffBlockSlot
        :title="t('plugin.details.dataDirectory')"
        default-icon="i-carbon-data-base"
        @click="openPath('data')"
      >
        <template #label>
          <div class="flex flex-col">
            <span class="text-sm font-medium">{{ t('plugin.details.dataDirectory') }}</span>
            <code
              class="text-xs text-[var(--el-text-color-secondary)] truncate max-w-48"
              :title="pluginPaths?.dataPath"
            >
              {{ pluginPaths ? shortenPath(pluginPaths.dataPath) : '...' }}
            </code>
          </div>
        </template>
        <i
          class="i-carbon-folder-open text-lg text-[var(--el-color-primary)] cursor-pointer hover:scale-110 transition-transform"
        />
      </TuffBlockSlot>
      <TuffBlockSlot
        :title="t('plugin.details.configDirectory')"
        default-icon="i-carbon-settings"
        @click="openPath('config')"
      >
        <template #label>
          <div class="flex flex-col">
            <span class="text-sm font-medium">{{ t('plugin.details.configDirectory') }}</span>
            <code
              class="text-xs text-[var(--el-text-color-secondary)] truncate max-w-48"
              :title="pluginPaths?.configPath"
            >
              {{ pluginPaths ? shortenPath(pluginPaths.configPath) : '...' }}
            </code>
          </div>
        </template>
        <i
          class="i-carbon-folder-open text-lg text-[var(--el-color-primary)] cursor-pointer hover:scale-110 transition-transform"
        />
      </TuffBlockSlot>
      <TuffBlockSlot
        :title="t('plugin.details.logsDirectory')"
        default-icon="i-carbon-document"
        @click="openPath('logs')"
      >
        <template #label>
          <div class="flex flex-col">
            <span class="text-sm font-medium">{{ t('plugin.details.logsDirectory') }}</span>
            <code
              class="text-xs text-[var(--el-text-color-secondary)] truncate max-w-48"
              :title="pluginPaths?.logsPath"
            >
              {{ pluginPaths ? shortenPath(pluginPaths.logsPath) : '...' }}
            </code>
          </div>
        </template>
        <i
          class="i-carbon-folder-open text-lg text-[var(--el-color-primary)] cursor-pointer hover:scale-110 transition-transform"
        />
      </TuffBlockSlot>
    </TuffGroupBlock>
  </div>
</template>

<style lang="scss" scoped>
/* Minimal custom styles - Tuff components handle most styling */
</style>

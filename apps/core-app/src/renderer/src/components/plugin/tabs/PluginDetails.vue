<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { ShortcutWarning, ShortcutWithStatus } from '~/modules/channel/main/shortcon'
import { TxButton, TxCodeEditor, TxEmpty, TxTag } from '@talex-touch/tuffex'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { toast } from 'vue-sonner'
import { onMounted, reactive, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const plugin = toRef(props, 'plugin')
const { t } = useI18n()
const { startupInfo } = useStartupInfo()

interface DevSettingsForm {
  enable: boolean
  address: string
  source: boolean
  autoStart: boolean
}

const manifestData = ref<Record<string, unknown> | null>(null)
const devSettingsLoading = ref(false)
const isSaving = ref(false)
const devSettings = reactive<DevSettingsForm>({
  enable: false,
  address: '',
  source: false,
  autoStart: true
})
const originalDevSettings = ref<DevSettingsForm | null>(null)

function pickString(key: string): string {
  const value = manifestData.value?.[key]
  if (typeof value !== 'string') return ''
  return value
}

const pluginDescription = computed(
  () =>
    pickString('description') ||
    pickString('desc') ||
    plugin.value.desc ||
    t('plugin.details.noDescription')
)

const pluginId = computed(() => pickString('id') || pickString('pluginId') || plugin.value.name)
const pluginName = computed(() => pickString('name') || plugin.value.name)
const hasDevSettings = computed(() => Boolean(plugin.value.dev?.enable))
const isAppDev = computed(() => startupInfo.value?.isDev === true)
const canViewManifestJson = computed(() => hasDevSettings.value || isAppDev.value)
const manifestJsonText = computed(() =>
  manifestData.value ? JSON.stringify(manifestData.value, null, 2) : ''
)
const shortcutsLoading = ref(false)
const shortcuts = ref<ShortcutWithStatus[]>([])
const manifestDialogVisible = ref(false)
const manifestDialogSource = ref<HTMLElement | null>(null)

const hasDevChanges = computed(() => {
  const original = originalDevSettings.value
  if (!original) return false
  return (
    devSettings.enable !== original.enable ||
    devSettings.address !== original.address ||
    devSettings.source !== original.source ||
    devSettings.autoStart !== original.autoStart
  )
})

const pluginShortcuts = computed(() =>
  shortcuts.value
    .filter(
      (shortcut) =>
        shortcut.type === ShortcutType.RENDERER && shortcut.meta?.author === plugin.value.name
    )
    .sort((a, b) => a.accelerator.localeCompare(b.accelerator))
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readFallbackDevSettings(): DevSettingsForm {
  const rawDev: Record<string, unknown> = isRecord(plugin.value.dev) ? plugin.value.dev : {}
  return {
    enable: Boolean(plugin.value.dev?.enable),
    address: plugin.value.dev?.address ?? '',
    source: Boolean(plugin.value.dev?.source),
    autoStart: typeof rawDev.autoStart === 'boolean' ? rawDev.autoStart : true
  }
}

function readManifestDevSettings(rawDev: unknown): DevSettingsForm {
  const fallback = readFallbackDevSettings()
  if (!isRecord(rawDev)) return fallback

  return {
    enable: typeof rawDev.enable === 'boolean' ? rawDev.enable : fallback.enable,
    address: typeof rawDev.address === 'string' ? rawDev.address : fallback.address,
    source: typeof rawDev.source === 'boolean' ? rawDev.source : fallback.source,
    autoStart: typeof rawDev.autoStart === 'boolean' ? rawDev.autoStart : fallback.autoStart
  }
}

function applyDevSettings(settings: DevSettingsForm): void {
  devSettings.enable = settings.enable
  devSettings.address = settings.address
  devSettings.source = settings.source
  devSettings.autoStart = settings.autoStart
}

function getShortcutTitle(shortcut: ShortcutWithStatus): string {
  const meta = shortcut.meta as { description?: string; shortcutId?: string } | undefined
  return meta?.description || meta?.shortcutId || shortcut.id
}

function getShortcutStatusLabel(shortcut: ShortcutWithStatus): string | null {
  const status = shortcut.status
  if (!status || status.state === 'active') {
    return null
  }
  if (status.state === 'conflict') {
    return status.reason === 'conflict-system'
      ? t('plugin.permissions.shortcuts.status.conflictSystem')
      : t('plugin.permissions.shortcuts.status.conflictPlugin')
  }
  if (status.reason === 'invalid') {
    return t('plugin.permissions.shortcuts.status.invalid')
  }
  return t('plugin.permissions.shortcuts.status.unavailable')
}

function getShortcutStatusTagColor(shortcut: ShortcutWithStatus): string {
  const status = shortcut.status
  if (!status || status.state === 'active') return 'var(--tx-color-info)'
  if (status.state === 'conflict') return 'var(--tx-color-danger)'
  return 'var(--tx-color-warning)'
}

function getShortcutWarningLabel(warning: ShortcutWarning): string {
  switch (warning) {
    case 'permission-missing':
      return t('plugin.permissions.shortcuts.warning.permissionMissing')
    case 'sdk-legacy':
      return t('plugin.permissions.shortcuts.warning.legacySdk')
    case 'missing-description':
      return t('plugin.permissions.shortcuts.warning.missingDescription')
    default:
      return warning
  }
}

async function loadDetails(): Promise<void> {
  const fallback = readFallbackDevSettings()
  applyDevSettings(fallback)
  originalDevSettings.value = { ...fallback }

  devSettingsLoading.value = true
  try {
    const manifest = await pluginSDK.getManifest(plugin.value.name)
    manifestData.value = manifest
    if (!manifest) return

    const resolved = readManifestDevSettings(manifest.dev)
    applyDevSettings(resolved)
    originalDevSettings.value = { ...resolved }
  } catch (error) {
    manifestData.value = null
    console.error('[PluginDetails] Failed to load details:', error)
  } finally {
    devSettingsLoading.value = false
  }
}

async function loadShortcuts() {
  shortcutsLoading.value = true
  try {
    shortcuts.value = await shortconApi.getAll()
  } catch (e) {
    console.error('Failed to load shortcuts:', e)
  } finally {
    shortcutsLoading.value = false
  }
}

async function updatePluginShortcut(id: string, newAccelerator: string): Promise<void> {
  if (!id || !newAccelerator) return
  const target = shortcuts.value.find((item) => item.id === id)
  const previousValue = target?.accelerator

  if (target) {
    target.accelerator = newAccelerator
  }

  const success = await shortconApi.update(id, newAccelerator)
  if (!success && target && previousValue) {
    target.accelerator = previousValue
  }
  await loadShortcuts()
}

async function copyPluginId(): Promise<void> {
  try {
    await navigator.clipboard.writeText(pluginId.value)
    toast.success(t('plugin.details.copyPluginIdSuccess'))
  } catch {
    toast.error(t('plugin.details.copyPluginIdFailed'))
  }
}

async function saveDevSettings(): Promise<void> {
  if (!hasDevSettings.value || isSaving.value || devSettingsLoading.value || !hasDevChanges.value) {
    return
  }

  isSaving.value = true
  try {
    const latestManifest = manifestData.value ?? (await pluginSDK.getManifest(plugin.value.name))
    if (!latestManifest) {
      toast.error(t('plugin.details.saveError'))
      return
    }

    const nextManifest: Record<string, unknown> = { ...latestManifest }
    const currentDev = isRecord(nextManifest.dev) ? nextManifest.dev : {}

    nextManifest.dev = {
      ...currentDev,
      enable: devSettings.enable,
      address: devSettings.address.trim(),
      source: devSettings.source,
      autoStart: devSettings.autoStart
    }

    const success = await pluginSDK.saveManifest(plugin.value.name, nextManifest, true)
    if (!success) {
      toast.error(t('plugin.details.saveError'))
      return
    }

    manifestData.value = nextManifest
    originalDevSettings.value = {
      enable: devSettings.enable,
      address: devSettings.address.trim(),
      source: devSettings.source,
      autoStart: devSettings.autoStart
    }
    devSettings.address = devSettings.address.trim()
    toast.success(t('plugin.details.saveSuccess'))
  } catch (error) {
    console.error('[PluginDetails] Failed to save dev settings:', error)
    toast.error(t('plugin.details.saveError'))
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  void loadDetails()
  void loadShortcuts()
})

watch(
  () => plugin.value.name,
  () => {
    manifestData.value = null
    originalDevSettings.value = null
    manifestDialogVisible.value = false
    manifestDialogSource.value = null
    void loadDetails()
    void loadShortcuts()
  }
)

function openManifestDialog(event: MouseEvent): void {
  if (!canViewManifestJson.value) return
  if (event.currentTarget instanceof HTMLElement) {
    manifestDialogSource.value = event.currentTarget
  }
  manifestDialogVisible.value = true
}
</script>

<template>
  <div class="PluginDetails w-full space-y-4">
    <TuffGroupBlock
      :name="t('plugin.details.basicInfo')"
      :description="''"
      default-icon="i-carbon-information"
      active-icon="i-carbon-information-filled"
      memory-name="plugin-details-basic"
    >
      <TuffBlockLine
        :title="t('plugin.details.pluginId')"
        link
        class="PluginDetails-CopyLine"
        @click="copyPluginId"
      >
        <template #description>
          <span class="PluginDetails-CopyValue">{{ pluginId }}</span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('plugin.details.pluginName')">
        <template #description>
          <span class="font-medium">{{ pluginName }}</span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('plugin.details.description')" :description="pluginDescription" />

      <TuffBlockSwitch
        v-if="hasDevSettings"
        v-model="devSettings.autoStart"
        :loading="devSettingsLoading"
        :title="t('plugin.details.autoStart')"
        :description="t('plugin.details.autoStartDesc')"
        default-icon="i-carbon-play-filled-alt"
        active-icon="i-carbon-play-filled-alt"
      />

      <TuffBlockSlot
        v-if="canViewManifestJson"
        :title="t('plugin.details.manifestJson')"
        :description="t('plugin.details.manifestJsonDesc')"
        default-icon="i-carbon-document"
        active-icon="i-carbon-document"
      >
        <template #tags>
          <span v-if="!hasDevSettings && isAppDev" class="PluginDetails-DevOnlyTag">
            {{ t('plugin.details.devOnlyTag') }}
          </span>
        </template>
        <TxButton variant="flat" @click="openManifestDialog">
          <i class="i-ri-file-code-line" />
          <span>{{ t('plugin.details.viewManifestJson') }}</span>
        </TxButton>
      </TuffBlockSlot>
    </TuffGroupBlock>

    <TuffGroupBlock
      class="PluginDetails-ShortcutGroup"
      :name="t('plugin.permissions.shortcuts.title')"
      :description="t('plugin.permissions.shortcuts.desc')"
      default-icon="i-carbon-keyboard"
      active-icon="i-carbon-keyboard"
      memory-name="plugin-details-shortcuts"
    >
      <div v-if="shortcutsLoading" class="PluginShortcuts-Loading">
        {{ t('plugin.permissions.shortcuts.loading') }}
      </div>
      <TxEmpty
        v-else-if="pluginShortcuts.length === 0"
        :title="t('plugin.permissions.shortcuts.empty')"
        compact
      />
      <div v-else class="PluginShortcuts-List">
        <div v-for="shortcut in pluginShortcuts" :key="shortcut.id" class="PluginShortcuts-Item">
          <div class="PluginShortcuts-Info">
            <div class="PluginShortcuts-Title">
              {{ getShortcutTitle(shortcut) }}
            </div>
            <div v-if="getShortcutStatusLabel(shortcut)" class="PluginShortcuts-Status">
              <TxTag :color="getShortcutStatusTagColor(shortcut)" size="sm">
                {{ getShortcutStatusLabel(shortcut) }}
              </TxTag>
            </div>
            <div v-if="(shortcut.status?.warnings || []).length" class="PluginShortcuts-Warnings">
              <TxTag
                v-for="warning in shortcut.status?.warnings || []"
                :key="warning"
                color="var(--tx-color-warning)"
                size="sm"
              >
                {{ getShortcutWarningLabel(warning) }}
              </TxTag>
            </div>
          </div>
          <FlatKeyInput
            :model-value="shortcut.accelerator"
            @update:model-value="(newValue) => updatePluginShortcut(shortcut.id, String(newValue))"
          />
        </div>
      </div>
    </TuffGroupBlock>

    <TuffGroupBlock
      v-if="hasDevSettings"
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
        <TxButton
          variant="flat"
          :loading="isSaving"
          :disabled="!hasDevChanges || isSaving || devSettingsLoading"
          @click="saveDevSettings"
        >
          <i v-if="!isSaving && !devSettingsLoading" class="i-ri-save-line" />
          <span>
            {{
              isSaving
                ? t('plugin.details.saving')
                : devSettingsLoading
                  ? t('plugin.details.devSettingsLoading')
                  : t('plugin.details.save')
            }}
          </span>
        </TxButton>
      </TuffBlockSlot>
      <TuffBlockSwitch
        v-model="devSettings.enable"
        :loading="devSettingsLoading"
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
        :disabled="devSettingsLoading || !devSettings.enable"
        default-icon="i-carbon-link"
        active-icon="i-carbon-link"
      />
      <TuffBlockSwitch
        v-model="devSettings.source"
        :loading="devSettingsLoading"
        :title="t('plugin.details.sourceMode')"
        :description="t('plugin.details.sourceModeDesc')"
        :disabled="!devSettings.enable"
        default-icon="i-carbon-document-download"
        active-icon="i-carbon-document-download"
      />
    </TuffGroupBlock>

    <FlipDialog
      v-model="manifestDialogVisible"
      :reference="manifestDialogSource"
      :header-title="t('plugin.details.manifestJson')"
      :header-desc="t('plugin.details.manifestJsonDesc')"
      size="lg"
    >
      <template #default>
        <div class="PluginManifest-Panel">
          <div class="PluginManifest-EditorWrap">
            <TxCodeEditor
              :model-value="manifestJsonText || t('plugin.details.manifestJsonEmpty')"
              language="json"
              :read-only="true"
              :line-numbers="true"
              :line-wrapping="true"
              :lint="false"
              :search="true"
              :completion="false"
              theme="auto"
              class="PluginManifest-Editor"
            />
          </div>
        </div>
      </template>
    </FlipDialog>
  </div>
</template>

<style lang="scss" scoped>
:deep(.PluginDetails-CopyLine.link:hover) {
  text-decoration: none;
}

:deep(.PluginDetails-CopyLine .TBlockLine-LinkSlot) {
  width: 100%;
}

.PluginDetails-CopyValue {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

:deep(.PluginDetails-CopyLine.link:hover .PluginDetails-CopyValue) {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.PluginDetails-DevOnlyTag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-warning) 18%, transparent);
  color: var(--tx-color-warning);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.PluginShortcuts-Loading {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  padding: 6px 0;
}

.PluginShortcuts-List {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.PluginShortcuts-Item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--tx-border-color-light);
}

.PluginShortcuts-Item:last-child {
  border-bottom: none;
}

.PluginShortcuts-Info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.PluginShortcuts-Title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.PluginShortcuts-Status,
.PluginShortcuts-Warnings {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.PluginDetails-ShortcutGroup :deep(.tx-empty-state--card) {
  border-radius: 0 !important;
}

.PluginManifest-Panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.PluginManifest-EditorWrap {
  flex: 1;
  min-height: 0;
  padding: 14px 18px 18px;
}

.PluginManifest-Editor {
  height: 100%;
  min-height: 0;
}
</style>

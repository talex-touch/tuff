<!--
  SettingTools Component

  Displays utility settings in the settings page.
  Allows users to configure shortcuts, auto-paste, auto-clear, and auto-hide features.
-->
<script setup lang="ts" name="SettingTools">
import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'

import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { TxButton, TxInput, TxSelectItem } from '@talex-touch/tuffex'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import ShortcutDialog from '~/views/base/settings/components/ShortcutDialog.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { appSetting } from '~/modules/channel/storage'
import type { SaveState, ShortcutRowBase } from './components/shortcut-dialog.types'

const { t } = useI18n()

const isMac = process.platform === 'darwin'

const shortcuts = ref<ShortcutWithStatus[] | null>(null)
const systemShortcuts = computed(() =>
  (shortcuts.value || []).filter((shortcut) => isSystemShortcut(shortcut))
)
const shortcutsLoading = computed(() => shortcuts.value === null)
const shortcutsDialogVisible = ref(false)
const shortcutsDialogSource = ref<HTMLElement | null>(null)
const shortcutSearch = ref('')
const saveStateMap = reactive(new Map<string, SaveState>())
const saveRunIdMap = new Map<string, number>()
const saveTimers = new Map<string, number>()
const initialShortcutSnapshot = ref(new Map<string, { accelerator: string; enabled: boolean }>())

const AUTO_PASTE_TIME_OPTIONS = [-1, 0, 1, 3, 5, 10, 15, 30, 60, 120, 180, 300] as const
const AUTO_CLEAR_TIME_OPTIONS = [-1, 0, 1, 3, 5, 10, 15, 30, 60, 120, 180, 300] as const
const CLIPBOARD_POLLING_INTERVAL_OPTIONS = [1, 3, 5, 10, 15, -1] as const
const LOW_BATTERY_POLLING_INTERVAL_OPTIONS = [10, 15] as const

function parseSelectNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeSelectNumber(
  value: unknown,
  allowedValues: readonly number[],
  fallback: number
): number {
  const parsed = parseSelectNumber(value)
  if (parsed === null) return fallback
  if (allowedValues.includes(parsed)) return parsed

  let nearest = allowedValues[0]
  let nearestDistance = Math.abs(parsed - nearest)
  for (let i = 1; i < allowedValues.length; i++) {
    const candidate = allowedValues[i]
    const distance = Math.abs(parsed - candidate)
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return nearest
}

function ensureClipboardPollingSettings(): void {
  if (!appSetting.tools || typeof appSetting.tools !== 'object') {
    appSetting.tools = {
      autoPaste: {
        enable: true,
        time: 5
      },
      autoHide: true,
      autoClear: 300,
      clipboardPolling: {
        interval: 3,
        lowBatteryPolicy: {
          enable: true,
          interval: 10
        }
      }
    }
  }

  const tools = appSetting.tools as {
    autoPaste?: {
      enable?: boolean
      time?: unknown
    } | null
    autoClear?: unknown
    clipboardPolling?: {
      interval?: unknown
      lowBatteryPolicy?: {
        enable?: boolean
        interval?: unknown
      }
    }
  }

  if (!tools.autoPaste || typeof tools.autoPaste !== 'object') {
    tools.autoPaste = {
      enable: true,
      time: 5
    }
  }
  tools.autoPaste.time = normalizeSelectNumber(tools.autoPaste.time, AUTO_PASTE_TIME_OPTIONS, 5)
  tools.autoPaste.enable = tools.autoPaste.time !== -1

  tools.autoClear = normalizeSelectNumber(tools.autoClear, AUTO_CLEAR_TIME_OPTIONS, 300)

  if (!tools.clipboardPolling || typeof tools.clipboardPolling !== 'object') {
    tools.clipboardPolling = {
      interval: 3,
      lowBatteryPolicy: {
        enable: true,
        interval: 10
      }
    }
    return
  }

  const polling = tools.clipboardPolling
  polling.interval = normalizeSelectNumber(polling.interval, CLIPBOARD_POLLING_INTERVAL_OPTIONS, 3)

  if (!polling.lowBatteryPolicy || typeof polling.lowBatteryPolicy !== 'object') {
    polling.lowBatteryPolicy = {
      enable: true,
      interval: 10
    }
    return
  }

  if (typeof polling.lowBatteryPolicy.enable !== 'boolean') {
    polling.lowBatteryPolicy.enable = true
  }
  polling.lowBatteryPolicy.interval = normalizeSelectNumber(
    polling.lowBatteryPolicy.interval,
    LOW_BATTERY_POLLING_INTERVAL_OPTIONS,
    10
  )
}

const clipboardPollingLowBatteryDisabled = computed(
  () => appSetting.tools.clipboardPolling?.lowBatteryPolicy?.enable === false
)

async function refreshShortcuts(): Promise<void> {
  shortcuts.value = await shortconApi.getAll()
}

onMounted(async () => {
  ensureClipboardPollingSettings()
  await refreshShortcuts()
})

watch(
  () => appSetting.tools,
  () => {
    ensureClipboardPollingSettings()
  },
  { deep: false, immediate: true }
)

watch(
  () => appSetting.tools?.autoPaste?.time,
  (time) => {
    if (!appSetting.tools?.autoPaste) return
    appSetting.tools.autoPaste.enable = time !== -1
  },
  { immediate: true }
)

async function updateShortcut(id: string, newAccelerator: string): Promise<void> {
  if (!id || !newAccelerator) return
  const shortcutList = shortcuts.value
  const target = shortcutList?.find((item) => item.id === id)
  const previousValue = target?.accelerator

  if (target) {
    target.accelerator = newAccelerator
  }

  const success = await saveShortcut(id, { accelerator: newAccelerator })
  if (!success && target && previousValue) {
    target.accelerator = previousValue
  }
  await refreshShortcuts()
}

async function updateShortcutEnabled(id: string, enabled: boolean): Promise<void> {
  const shortcutList = shortcuts.value
  const target = shortcutList?.find((item) => item.id === id)
  const previousEnabled = target?.meta?.enabled ?? true
  if (target) {
    target.meta.enabled = enabled
  }
  const success = await saveShortcut(id, { enabled })
  if (!success && target) {
    target.meta.enabled = previousEnabled
  }
  await refreshShortcuts()
}

function setRowSaveState(id: string, state: SaveState): void {
  saveStateMap.set(id, state)
  const existingTimer = saveTimers.get(id)
  if (existingTimer) {
    window.clearTimeout(existingTimer)
    saveTimers.delete(id)
  }
  if (state === 'success' || state === 'error') {
    const timeout = window.setTimeout(
      () => {
        saveStateMap.delete(id)
        saveTimers.delete(id)
      },
      state === 'success' ? 1600 : 2600
    )
    saveTimers.set(id, timeout)
  }
}

function getRowSaveState(id: string): SaveState | undefined {
  return saveStateMap.get(id)
}

function getRowSaveText(id: string): string {
  const state = getRowSaveState(id)
  if (state === 'saving') {
    return t('settingTools.shortcutsDialog.saving')
  }
  if (state === 'success') {
    return t('settingTools.shortcutsDialog.saveSuccess')
  }
  if (state === 'error') {
    return t('settingTools.shortcutsDialog.saveFailed')
  }
  return ''
}

async function saveShortcut(
  id: string,
  payload: { accelerator?: string; enabled?: boolean }
): Promise<boolean> {
  const nextRunId = (saveRunIdMap.get(id) ?? 0) + 1
  saveRunIdMap.set(id, nextRunId)
  setRowSaveState(id, 'saving')
  if (saveRunIdMap.get(id) !== nextRunId) return false
  try {
    const success = await shortconApi.update(id, payload.accelerator, payload.enabled)
    if (saveRunIdMap.get(id) !== nextRunId) return success
    if (!success) {
      setRowSaveState(id, 'error')
      toast.error(t('settingTools.shortcutsDialog.saveFailed'))
      return false
    }
    setRowSaveState(id, 'success')
    return true
  } catch (error) {
    if (saveRunIdMap.get(id) !== nextRunId) return false
    setRowSaveState(id, 'error')
    toast.error(t('settingTools.shortcutsDialog.saveFailed'))
    return false
  }
}

function getShortcutLabel(id: string): string {
  const normalized = id.replace(/[.:\-]/g, '_')
  const key = `settingTools.shortcutLabels.${normalized}`
  const translated = t(key)
  return translated === key ? id : translated
}

function isSystemShortcut(shortcut: ShortcutWithStatus): boolean {
  if (shortcut.type === ShortcutType.MAIN || shortcut.type === ShortcutType.TRIGGER) {
    return true
  }
  return shortcut.meta?.author === 'system'
}

function isShortcutEnabled(shortcut: ShortcutWithStatus): boolean {
  return shortcut.meta?.enabled !== false
}

function isTriggerShortcut(shortcut: ShortcutWithStatus): boolean {
  return shortcut.type === ShortcutType.TRIGGER
}

function getShortcutSourceLabel(shortcut: ShortcutWithStatus): string {
  if (isSystemShortcut(shortcut)) {
    return t('settingTools.shortcutsDialog.sourceSystem')
  }
  const author = shortcut.meta?.author
  if (author) {
    return t('settingTools.shortcutsDialog.sourcePlugin', { name: author })
  }
  return t('settingTools.shortcutsDialog.sourceUnknown')
}

function getShortcutStatusText(shortcut: ShortcutWithStatus): string | null {
  if (shortcut.meta?.enabled === false || shortcut.status?.state === 'disabled') {
    return t('settingTools.shortcutsDialog.statusDisabled')
  }
  const status = shortcut.status
  if (!status || status.state === 'active') {
    return null
  }
  if (status.state === 'conflict') {
    return status.reason === 'conflict-system'
      ? t('settingTools.shortcutStatus.conflictSystem')
      : t('settingTools.shortcutStatus.conflictPlugin')
  }
  if (status.reason === 'invalid') {
    return t('settingTools.shortcutStatus.invalid')
  }
  return t('settingTools.shortcutStatus.unavailable')
}

function getSpotlightHint(shortcut: ShortcutWithStatus): string | null {
  if (isTriggerShortcut(shortcut)) return null
  if (!isShortcutEnabled(shortcut)) return null
  if (!isMac) return null
  const status = shortcut.status
  if (!status || status.state !== 'unavailable') return null
  if (status.reason !== 'register-failed' && status.reason !== 'register-error') return null
  if (shortcut.accelerator.includes('Command') && shortcut.accelerator.includes('Space')) {
    return t('settingTools.shortcutStatus.spotlightHint')
  }
  return null
}

function getShortcutTriggerLabel(shortcut: ShortcutWithStatus): string {
  if (shortcut.id === 'core.omniPanel.mouseLongPress') {
    return t('settingTools.shortcutsDialog.triggerMouseRightLongPress')
  }
  return shortcut.accelerator
}

const filteredShortcuts = computed(() => {
  const query = shortcutSearch.value.trim().toLowerCase()
  if (!query) {
    return systemShortcuts.value
  }
  return systemShortcuts.value.filter((shortcut) => {
    const label = getShortcutLabel(shortcut.id).toLowerCase()
    const triggerText = getShortcutTriggerLabel(shortcut).toLowerCase()
    const source = getShortcutSourceLabel(shortcut).toLowerCase()
    return (
      label.includes(query) ||
      shortcut.id.toLowerCase().includes(query) ||
      triggerText.includes(query) ||
      source.includes(query)
    )
  })
})

const shortcutRows = computed<ShortcutRowBase[]>(() =>
  filteredShortcuts.value.map((shortcut) => {
    const label = getShortcutLabel(shortcut.id)
    const isTrigger = isTriggerShortcut(shortcut)
    return {
      shortcut,
      label,
      desc: t(isTrigger ? 'settingTools.triggerDesc' : 'settingTools.shortcutDesc', {
        shortcut: label
      }),
      sourceLabel: getShortcutSourceLabel(shortcut),
      statusText: getShortcutStatusText(shortcut),
      spotlightHint: getSpotlightHint(shortcut),
      saveState: getRowSaveState(shortcut.id),
      saveText: getRowSaveText(shortcut.id),
      isEnabled: isShortcutEnabled(shortcut),
      inputMode: isTrigger ? 'trigger' : 'keyboard',
      triggerLabel: getShortcutTriggerLabel(shortcut)
    }
  })
)

function openShortcutsDialog(event: MouseEvent): void {
  shortcutsDialogSource.value =
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  shortcutsDialogVisible.value = true
}

async function resetShortcutChanges(): Promise<void> {
  const snapshot = initialShortcutSnapshot.value
  const current = shortcuts.value || []
  const tasks: Promise<boolean>[] = []
  for (const shortcut of current) {
    const original = snapshot.get(shortcut.id)
    if (!original) continue
    const enabled = isShortcutEnabled(shortcut)
    if (shortcut.accelerator !== original.accelerator || enabled !== original.enabled) {
      tasks.push(
        saveShortcut(shortcut.id, {
          accelerator: original.accelerator,
          enabled: original.enabled
        })
      )
    }
  }
  if (tasks.length > 0) {
    await Promise.all(tasks)
  }
  await refreshShortcuts()
}

watch(shortcutsDialogVisible, (visible) => {
  if (!visible) return
  shortcutSearch.value = ''
  saveStateMap.clear()
  saveRunIdMap.clear()
  for (const timer of saveTimers.values()) {
    window.clearTimeout(timer)
  }
  saveTimers.clear()
  const snapshot = new Map<string, { accelerator: string; enabled: boolean }>()
  for (const shortcut of systemShortcuts.value) {
    snapshot.set(shortcut.id, {
      accelerator: shortcut.accelerator,
      enabled: isShortcutEnabled(shortcut)
    })
  }
  initialShortcutSnapshot.value = snapshot
})
</script>

<!--
  SettingTools Component Template

  Displays utility settings in a structured layout with switches, slots, and selects.
-->
<template>
  <!-- Utilities group block -->
  <TuffGroupBlock
    :name="t('settingTools.groupTitle')"
    :description="t('settingTools.groupDesc')"
    default-icon="i-carbon-app-switcher"
    active-icon="i-carbon-application"
    memory-name="setting-tools"
  >
    <!-- Custom CoreBox Placeholder -->
    <TuffBlockInput
      v-model="appSetting.coreBox.customPlaceholder"
      :title="t('settingTools.customPlaceholder')"
      :description="t('settingTools.customPlaceholderDesc')"
      default-icon="i-carbon-text-short-paragraph"
      active-icon="i-carbon-text-short-paragraph"
    >
      <template #control>
        <TxInput
          v-model="appSetting.coreBox.customPlaceholder"
          class="SettingTools-PlaceholderInput"
          :placeholder="t('boxInput.placeholder')"
          clearable
        />
      </template>
    </TuffBlockInput>

    <!-- Beginner usage guide switch -->
    <TuffBlockSwitch
      v-model="appSetting.beginner.init"
      :title="t('settingTools.usage')"
      :description="t('settingTools.usageDesc')"
      default-icon="i-carbon-book"
      active-icon="i-carbon-book"
    />

    <!-- Shortcut manager -->
    <TuffBlockSlot
      :title="t('settingTools.shortcutsTitle')"
      :description="t('settingTools.shortcutsDesc')"
      default-icon="i-carbon-keyboard"
      active-icon="i-carbon-keyboard"
      class="ShortcutEntry"
      :class="{ 'ShortcutEntry--hidden': shortcutsDialogVisible }"
    >
      <div class="ShortcutSummary">
        {{ t('settingTools.shortcutsCount', { count: systemShortcuts.length }) }}
      </div>
      <TxButton variant="flat" type="primary" @click.stop="openShortcutsDialog">
        {{ t('settingTools.shortcutsAction') }}
      </TxButton>
    </TuffBlockSlot>

    <!-- Auto paste time selection -->
    <TuffBlockSelect
      v-model="appSetting.tools.autoPaste.time"
      :title="t('settingTools.autoPaste')"
      :description="t('settingTools.autoPasteDesc')"
      default-icon="i-carbon-copy"
      active-icon="i-carbon-copy"
    >
      <TxSelectItem :value="-1">
        {{ t('settingTools.disabled') }}
      </TxSelectItem>
      <TxSelectItem :value="0">
        {{ t('settingTools.noLimit') }}
      </TxSelectItem>
      <TxSelectItem :value="1"> 1 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="3"> 3 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="5"> 5 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="10"> 10 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="15"> 15 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="30"> 30 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="60"> 1 {{ t('settingTools.min') }} </TxSelectItem>
      <TxSelectItem :value="120"> 2 {{ t('settingTools.min') }} </TxSelectItem>
      <TxSelectItem :value="180"> 3 {{ t('settingTools.min') }} </TxSelectItem>
      <TxSelectItem :value="300"> 5 {{ t('settingTools.min') }} </TxSelectItem>
    </TuffBlockSelect>

    <!-- Auto clear time selection -->
    <TuffBlockSelect
      v-model="appSetting.tools.autoClear"
      :title="t('settingTools.autoClear')"
      :description="t('settingTools.autoClearDesc')"
      default-icon="i-carbon-erase"
      active-icon="i-carbon-erase"
    >
      <TxSelectItem :value="-1">
        {{ t('settingTools.disabled') }}
      </TxSelectItem>
      <TxSelectItem :value="0">
        {{ t('settingTools.noLimit') }}
      </TxSelectItem>
      <TxSelectItem :value="1"> 1 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="3"> 3 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="5"> 5 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="10"> 10 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="15"> 15 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="30"> 30 {{ t('settingTools.sec') }} </TxSelectItem>
      <TxSelectItem :value="60"> 1 {{ t('settingTools.min') }} </TxSelectItem>
      <TxSelectItem :value="120"> 2 {{ t('settingTools.min') }} </TxSelectItem>
      <TxSelectItem :value="180"> 3 {{ t('settingTools.min') }} </TxSelectItem>
      <TxSelectItem :value="300"> 5 {{ t('settingTools.min') }} </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockSelect
      v-model="appSetting.tools.clipboardPolling.interval"
      :title="t('settingTools.clipboardPollingInterval')"
      :description="t('settingTools.clipboardPollingIntervalDesc')"
      default-icon="i-carbon-timer"
      active-icon="i-carbon-timer"
    >
      <TxSelectItem :value="1">1 {{ t('settingTools.sec') }}</TxSelectItem>
      <TxSelectItem :value="3">3 {{ t('settingTools.sec') }}</TxSelectItem>
      <TxSelectItem :value="5">5 {{ t('settingTools.sec') }}</TxSelectItem>
      <TxSelectItem :value="10">10 {{ t('settingTools.sec') }}</TxSelectItem>
      <TxSelectItem :value="15">15 {{ t('settingTools.sec') }}</TxSelectItem>
      <TxSelectItem :value="-1">{{ t('settingTools.never') }}</TxSelectItem>
    </TuffBlockSelect>

    <template v-if="appSetting?.dev?.advancedSettings">
      <TuffBlockSwitch
        v-model="appSetting.tools.clipboardPolling.lowBatteryPolicy.enable"
        :title="t('settingTools.clipboardPollingLowBattery')"
        :description="t('settingTools.clipboardPollingLowBatteryDesc')"
        default-icon="i-carbon-battery-charging"
        active-icon="i-carbon-battery-charging"
      />

      <TuffBlockSelect
        v-model="appSetting.tools.clipboardPolling.lowBatteryPolicy.interval"
        :title="t('settingTools.clipboardPollingLowBatteryInterval')"
        :description="t('settingTools.clipboardPollingLowBatteryIntervalDesc')"
        default-icon="i-carbon-battery-empty"
        active-icon="i-carbon-battery-empty"
        :disabled="clipboardPollingLowBatteryDisabled"
      >
        <TxSelectItem :value="10">10 {{ t('settingTools.sec') }}</TxSelectItem>
        <TxSelectItem :value="15">15 {{ t('settingTools.sec') }}</TxSelectItem>
      </TuffBlockSelect>
    </template>

    <!-- Auto hide switch -->
    <TuffBlockSwitch
      v-model="appSetting.tools.autoHide"
      :title="t('settingTools.autoHide')"
      :description="t('settingTools.autoHideDesc')"
      default-icon="i-carbon-view-off"
      active-icon="i-carbon-view-off"
    />

    <!-- Recommendation Enabled switch -->
    <TuffBlockSwitch
      v-model="appSetting.recommendation.enabled"
      :title="t('settingTools.recommendationEnabled')"
      :description="t('settingTools.recommendationEnabledDesc')"
      default-icon="i-carbon-star"
      active-icon="i-carbon-star-filled"
    />

    <!-- Recommendation Show Reason switch -->
    <TuffBlockSwitch
      v-model="appSetting.recommendation.showReason"
      :title="t('settingTools.recommendationShowReason')"
      :description="t('settingTools.recommendationShowReasonDesc')"
      default-icon="i-carbon-information"
      active-icon="i-carbon-information-filled"
    />

    <!-- Recommendation Max Items select -->
    <TuffBlockSelect
      v-model="appSetting.recommendation.maxItems"
      :title="t('settingTools.recommendationMaxItems')"
      :description="t('settingTools.recommendationMaxItemsDesc')"
      default-icon="i-carbon-list"
      active-icon="i-carbon-list"
    >
      <TxSelectItem :value="5"> 5 </TxSelectItem>
      <TxSelectItem :value="10"> 10 </TxSelectItem>
      <TxSelectItem :value="15"> 15 </TxSelectItem>
      <TxSelectItem :value="20"> 20 </TxSelectItem>
    </TuffBlockSelect>
  </TuffGroupBlock>

  <ShortcutDialog
    v-model="shortcutsDialogVisible"
    v-model:search="shortcutSearch"
    :source="shortcutsDialogSource"
    :loading="shortcutsLoading"
    :rows="shortcutRows"
    @reset="resetShortcutChanges"
    @update-accelerator="(id, value) => updateShortcut(id, value)"
    @update-enabled="(id, value) => updateShortcutEnabled(id, value)"
  />
</template>

<style scoped>
.SettingTools-PlaceholderInput {
  width: min(360px, 100%);
}

.ShortcutSummary {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.ShortcutEntry {
  transition: opacity 0.2s ease;
}

.ShortcutEntry--hidden {
  opacity: 0;
  pointer-events: none;
}
</style>

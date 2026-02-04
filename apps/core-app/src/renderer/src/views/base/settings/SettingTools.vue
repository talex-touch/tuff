<!--
  SettingTools Component

  Displays utility settings in the settings page.
  Allows users to configure shortcuts, auto-paste, auto-clear, and auto-hide features.
-->
<script setup lang="ts" name="SettingTools">
import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'

import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatKeyInput from '~/components/base/input/FlatKeyInput.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TSwitch from '~/components/base/switch/TSwitch.vue'
import TouchScroll from '~/components/base/TouchScroll.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'

import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { appSetting } from '~/modules/channel/storage'

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
type SaveState = 'saving' | 'success' | 'error'
const saveStateMap = reactive(new Map<string, SaveState>())
const saveRunIdMap = new Map<string, number>()
const saveTimers = new Map<string, number>()
const initialShortcutSnapshot = ref(new Map<string, { accelerator: string; enabled: boolean }>())

const FLIP_DURATION = 420
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.1

async function refreshShortcuts(): Promise<void> {
  shortcuts.value = await shortconApi.getAll()
}

onMounted(async () => {
  await refreshShortcuts()
})

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
  try {
    const success = await shortconApi.update(id, payload.accelerator, payload.enabled)
    if (saveRunIdMap.get(id) !== nextRunId) return success
    if (!success) {
      setRowSaveState(id, 'error')
      ElMessage.error(t('settingTools.shortcutsDialog.saveFailed'))
      return false
    }
    setRowSaveState(id, 'success')
    return true
  } catch (error) {
    if (saveRunIdMap.get(id) !== nextRunId) return false
    setRowSaveState(id, 'error')
    ElMessage.error(t('settingTools.shortcutsDialog.saveFailed'))
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
  if (shortcut.type === ShortcutType.MAIN) {
    return true
  }
  return shortcut.meta?.author === 'system'
}

function isShortcutEnabled(shortcut: ShortcutWithStatus): boolean {
  return shortcut.meta?.enabled !== false
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

const filteredShortcuts = computed(() => {
  const query = shortcutSearch.value.trim().toLowerCase()
  if (!query) {
    return systemShortcuts.value
  }
  return systemShortcuts.value.filter((shortcut) => {
    const label = getShortcutLabel(shortcut.id).toLowerCase()
    const accelerator = shortcut.accelerator?.toLowerCase() ?? ''
    const source = getShortcutSourceLabel(shortcut).toLowerCase()
    return (
      label.includes(query) ||
      shortcut.id.toLowerCase().includes(query) ||
      accelerator.includes(query) ||
      source.includes(query)
    )
  })
})

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
    <TuffBlockSlot
      :title="t('settingTools.customPlaceholder')"
      :description="t('settingTools.customPlaceholderDesc')"
      default-icon="i-carbon-text-short-paragraph"
      active-icon="i-carbon-text-short-paragraph"
    >
      <input
        v-model="appSetting.coreBox.customPlaceholder"
        type="text"
        class="TuffBlockInput"
        :placeholder="t('boxInput.placeholder')"
      />
    </TuffBlockSlot>

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
      <TSelectItem :model-value="-1">
        {{ t('settingTools.disabled') }}
      </TSelectItem>
      <TSelectItem :model-value="0">
        {{ t('settingTools.noLimit') }}
      </TSelectItem>
      <TSelectItem :model-value="15"> 15 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="30"> 30 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="60"> 1 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="180"> 3 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="300"> 5 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="600"> 10 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="750"> 15 {{ t('settingTools.min') }} </TSelectItem>
    </TuffBlockSelect>

    <!-- Auto clear time selection -->
    <TuffBlockSelect
      v-model="appSetting.tools.autoClear"
      :title="t('settingTools.autoClear')"
      :description="t('settingTools.autoClearDesc')"
      default-icon="i-carbon-erase"
      active-icon="i-carbon-erase"
    >
      <TSelectItem :model-value="-1">
        {{ t('settingTools.disabled') }}
      </TSelectItem>
      <TSelectItem :model-value="0">
        {{ t('settingTools.noLimit') }}
      </TSelectItem>
      <TSelectItem :model-value="15"> 15 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="30"> 30 {{ t('settingTools.sec') }} </TSelectItem>
      <TSelectItem :model-value="60"> 1 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="180"> 3 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="300"> 5 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="600"> 10 {{ t('settingTools.min') }} </TSelectItem>
      <TSelectItem :model-value="750"> 15 {{ t('settingTools.min') }} </TSelectItem>
    </TuffBlockSelect>

    <!-- Auto hide switch -->
    <TuffBlockSwitch
      v-model="appSetting.tools.autoHide"
      :title="t('settingTools.autoHide')"
      :description="t('settingTools.autoHideDesc')"
      default-icon="i-carbon-view-off"
      active-icon="i-carbon-view-off"
    />

    <!-- Dashboard switch -->
    <TuffBlockSwitch
      v-model="appSetting.dashboard.enable"
      :title="t('settingTools.dashboard')"
      :description="t('settingTools.dashboardDesc')"
      default-icon="i-carbon-dashboard"
      active-icon="i-carbon-dashboard"
    />

    <!-- Search Engine Logs switch -->
    <TuffBlockSwitch
      v-model="appSetting.searchEngine.logsEnabled"
      :title="t('settingTools.searchEngineLogs')"
      :description="t('settingTools.searchEngineLogsDesc')"
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt"
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
      <TSelectItem :model-value="5"> 5 </TSelectItem>
      <TSelectItem :model-value="10"> 10 </TSelectItem>
      <TSelectItem :model-value="15"> 15 </TSelectItem>
      <TSelectItem :model-value="20"> 20 </TSelectItem>
    </TuffBlockSelect>
  </TuffGroupBlock>

  <Teleport to="body">
    <TxFlipOverlay
      v-model="shortcutsDialogVisible"
      :source="shortcutsDialogSource"
      :duration="FLIP_DURATION"
      :rotate-x="FLIP_ROTATE_X"
      :rotate-y="FLIP_ROTATE_Y"
      :speed-boost="FLIP_SPEED_BOOST"
      transition-name="ShortcutDialog-Mask"
      mask-class="ShortcutDialog-Mask"
      card-class="ShortcutDialog-Card"
    >
      <template #default="{ close }">
        <div class="ShortcutDialog">
          <div class="ShortcutDialog-Header">
            <div class="ShortcutDialog-TitleBlock">
              <div class="ShortcutDialog-Title">
                {{ t('settingTools.shortcutsDialog.title') }}
              </div>
              <div class="ShortcutDialog-Subtitle">
                {{ t('settingTools.shortcutsDialog.desc') }}
              </div>
            </div>
            <div class="ShortcutDialog-Search">
              <i class="i-carbon-search" />
              <input
                v-model="shortcutSearch"
                type="text"
                :placeholder="t('settingTools.shortcutsDialog.searchPlaceholder')"
              />
            </div>
          </div>

          <div class="ShortcutDialog-Table">
            <div class="ShortcutDialog-TableHeader">
              <div>{{ t('settingTools.shortcutsDialog.columns.name') }}</div>
              <div>{{ t('settingTools.shortcutsDialog.columns.source') }}</div>
              <div>{{ t('settingTools.shortcutsDialog.columns.id') }}</div>
              <div>{{ t('settingTools.shortcutsDialog.columns.key') }}</div>
              <div>{{ t('settingTools.shortcutsDialog.columns.enabled') }}</div>
              <div>{{ t('settingTools.shortcutsDialog.columns.status') }}</div>
            </div>
            <TouchScroll no-padding class="ShortcutDialog-TableBody">
              <div v-if="shortcutsLoading" class="ShortcutDialog-Empty">
                {{ t('settingTools.shortcutsDialog.loading') }}
              </div>
              <div v-else-if="filteredShortcuts.length === 0" class="ShortcutDialog-Empty">
                {{ t('settingTools.shortcutsDialog.empty') }}
              </div>
              <div v-else class="ShortcutDialog-Rows">
                <div
                  v-for="shortcut in filteredShortcuts"
                  :key="shortcut.id"
                  class="ShortcutDialog-Row"
                >
                  <div class="ShortcutDialog-Name">
                    <div class="ShortcutDialog-Label">
                      {{ getShortcutLabel(shortcut.id) }}
                    </div>
                    <div class="ShortcutDialog-Desc">
                      {{
                        t('settingTools.shortcutDesc', { shortcut: getShortcutLabel(shortcut.id) })
                      }}
                    </div>
                  </div>
                  <div class="ShortcutDialog-Source">
                    {{ getShortcutSourceLabel(shortcut) }}
                  </div>
                  <div class="ShortcutDialog-Id">
                    {{ shortcut.id }}
                  </div>
                  <div class="ShortcutDialog-Key">
                    <FlatKeyInput
                      :model-value="shortcut.accelerator"
                      @update:model-value="
                        (newValue) => updateShortcut(shortcut.id, String(newValue))
                      "
                    />
                  </div>
                  <div class="ShortcutDialog-Enabled">
                    <TSwitch
                      :model-value="isShortcutEnabled(shortcut)"
                      @update:model-value="
                        (value) => updateShortcutEnabled(shortcut.id, Boolean(value))
                      "
                    />
                  </div>
                  <div class="ShortcutDialog-Status">
                    <div
                      class="ShortcutDialog-StatusText"
                      :class="[
                        getRowSaveState(shortcut.id) ? `is-${getRowSaveState(shortcut.id)}` : '',
                        {
                          active: !getRowSaveState(shortcut.id) && !getShortcutStatusText(shortcut),
                          disabled: !getRowSaveState(shortcut.id) && !isShortcutEnabled(shortcut)
                        }
                      ]"
                    >
                      <template v-if="getRowSaveState(shortcut.id)">
                        <i
                          v-if="getRowSaveState(shortcut.id) === 'saving'"
                          class="i-ri-loader-4-line animate-spin"
                        />
                        <i
                          v-else-if="getRowSaveState(shortcut.id) === 'success'"
                          class="i-ri-checkbox-circle-fill"
                        />
                        <i
                          v-else-if="getRowSaveState(shortcut.id) === 'error'"
                          class="i-ri-error-warning-line"
                        />
                        <span>{{ getRowSaveText(shortcut.id) }}</span>
                      </template>
                      <template v-else>
                        {{
                          getShortcutStatusText(shortcut) ||
                          t('settingTools.shortcutsDialog.statusActive')
                        }}
                      </template>
                    </div>
                    <div
                      v-if="!getRowSaveState(shortcut.id) && getSpotlightHint(shortcut)"
                      class="ShortcutStatusHint"
                    >
                      {{ getSpotlightHint(shortcut) }}
                    </div>
                  </div>
                </div>
              </div>
            </TouchScroll>
          </div>

          <div class="ShortcutDialog-Footer">
            <div class="ShortcutDialog-Count">
              {{ t('settingTools.shortcutsDialog.count', { count: filteredShortcuts.length }) }}
            </div>
            <div class="ShortcutDialog-FooterActions">
              <TxButton variant="flat" @click="resetShortcutChanges">
                {{ t('settingTools.shortcutsDialog.reset') }}
              </TxButton>
              <TxButton variant="flat" type="primary" @click="close">
                {{ t('settingTools.shortcutsDialog.close') }}
              </TxButton>
            </div>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style scoped>
.TuffBlockInput {
  width: 200px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
  font-size: 13px;
  outline: none;
  transition: all 0.2s ease;
}

.TuffBlockInput:focus {
  border-color: var(--el-color-primary);
  background: var(--el-bg-color);
  box-shadow: 0 0 0 2px rgba(var(--el-color-primary-rgb, 64, 158, 255), 0.1);
}

.TuffBlockInput::placeholder {
  color: var(--el-text-color-placeholder);
  opacity: 0.7;
}

.ShortcutStatusHint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ShortcutSummary {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ShortcutEntry {
  transition: opacity 0.2s ease;
}

.ShortcutEntry--hidden {
  opacity: 0;
  pointer-events: none;
}

:global(.ShortcutDialog-Mask) {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

:global(.ShortcutDialog-Mask-enter-active),
:global(.ShortcutDialog-Mask-leave-active) {
  transition: opacity 200ms ease;
}

:global(.ShortcutDialog-Mask-enter-from),
:global(.ShortcutDialog-Mask-leave-to) {
  opacity: 0;
}

:global(.ShortcutDialog-Card) {
  width: min(980px, 92vw);
  height: min(720px, 86vh);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.ShortcutDialog {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ShortcutDialog-Header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ShortcutDialog-TitleBlock {
  min-width: 180px;
}

.ShortcutDialog-Title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ShortcutDialog-Subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-Search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  min-width: 220px;
}

.ShortcutDialog-Search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.ShortcutDialog-Table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.ShortcutDialog-TableHeader {
  display: grid;
  grid-template-columns: 1.6fr 0.9fr 1.1fr 1fr 0.6fr 0.9fr;
  gap: 16px;
  padding: 12px 24px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ShortcutDialog-TableBody {
  flex: 1;
}

.ShortcutDialog-Empty {
  padding: 40px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-Rows {
  display: flex;
  flex-direction: column;
}

.ShortcutDialog-Row {
  display: grid;
  grid-template-columns: 1.6fr 0.9fr 1.1fr 1fr 0.6fr 0.9fr;
  gap: 16px;
  padding: 16px 24px;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.ShortcutDialog-Row:last-child {
  border-bottom: none;
}

.ShortcutDialog-Label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ShortcutDialog-Desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-Id {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.ShortcutDialog-Source {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-Enabled {
  display: flex;
  justify-content: flex-start;
}

.ShortcutDialog-StatusText {
  font-size: 12px;
  color: var(--el-color-danger);
}

.ShortcutDialog-StatusText.active {
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-StatusText.disabled {
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-StatusText.is-saving,
.ShortcutDialog-StatusText.is-success,
.ShortcutDialog-StatusText.is-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ShortcutDialog-StatusText.is-saving {
  color: var(--el-text-color-secondary);
}

.ShortcutDialog-StatusText.is-success {
  color: var(--el-color-success);
}

.ShortcutDialog-StatusText.is-error {
  color: var(--el-color-danger);
}

.ShortcutDialog-Footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.ShortcutDialog-FooterActions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ShortcutDialog-Count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

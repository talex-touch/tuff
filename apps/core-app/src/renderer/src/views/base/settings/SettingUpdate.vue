<script setup lang="ts" name="SettingUpdate">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { AppPreviewChannel, type UpdateSettings } from '@talex-touch/utils'
import FlatButton from '@comp/base/button/FlatButton.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import { useApplicationUpgrade } from '~/modules/hooks/useUpdate'
import { useAppState } from '~/modules/hooks/useAppStates'
import { getBuildInfo } from '~/utils/build-info'

const { t } = useI18n()
const buildInfo = getBuildInfo()
const buildChannel = normalizeBuildChannel(buildInfo.channel)
const isSnapshotBuild = buildChannel === AppPreviewChannel.SNAPSHOT

const { appStates } = useAppState()
const {
  checkApplicationUpgrade,
  getUpdateSettings,
  updateSettings,
  clearUpdateCache,
  getUpdateStatus
} = useApplicationUpgrade()

const settings = ref<UpdateSettings | null>(null)
const selectedChannel = ref<AppPreviewChannel>(AppPreviewChannel.RELEASE)
const selectedFrequency = ref<UpdateSettings['frequency']>('everyday')
const lastCheck = ref<number | null>(null)

const fetching = ref(false)
const channelSaving = ref(false)
const frequencySaving = ref(false)
const manualChecking = ref(false)
const clearingCache = ref(false)
const lastResultMessage = ref<string>('')

const channelOptions = computed(() => {
  const base = [
    { value: AppPreviewChannel.RELEASE, label: t('settings.settingUpdate.channels.release') },
    { value: AppPreviewChannel.BETA, label: t('settings.settingUpdate.channels.beta') },
    { value: AppPreviewChannel.SNAPSHOT, label: t('settings.settingUpdate.channels.snapshot') }
  ]

  return isSnapshotBuild ? base.filter((item) => item.value === AppPreviewChannel.SNAPSHOT) : base
})

const frequencyOptions = computed(() => [
  { value: 'everyday', label: t('settings.settingUpdate.frequency.everyday') },
  { value: '1day', label: t('settings.settingUpdate.frequency.daily') },
  { value: '3day', label: t('settings.settingUpdate.frequency.every3days') },
  { value: '7day', label: t('settings.settingUpdate.frequency.weekly') },
  { value: '1month', label: t('settings.settingUpdate.frequency.monthly') },
  { value: 'never', label: t('settings.settingUpdate.frequency.never') }
])

const channelSelectDisabled = computed(() => fetching.value || channelSaving.value || isSnapshotBuild)
const frequencySelectDisabled = computed(() => fetching.value || frequencySaving.value)

const statusDescription = computed(() => {
  if (fetching.value) return t('settings.settingUpdate.status.loading')
  if (!lastCheck.value) return t('settings.settingUpdate.status.never')

  return t('settings.settingUpdate.status.lastChecked', {
    time: formatTimestamp(lastCheck.value)
  })
})

const updateStateMessage = computed(() => {
  if (appStates.hasUpdate) return t('settings.settingUpdate.status.updateAvailable')
  if (appStates.noUpdateAvailable) return t('settings.settingUpdate.status.upToDate')
  return ''
})

onMounted(async () => {
  await loadSettings()
})

async function loadSettings(): Promise<void> {
  fetching.value = true
  try {
    const fetched = await getUpdateSettings()
    settings.value = fetched
    selectedChannel.value = fetched.updateChannel
    selectedFrequency.value = fetched.frequency
    lastCheck.value = fetched.lastCheckedAt ?? null
  } catch (error) {
    console.error('[SettingUpdate] Failed to load settings:', error)
    ElMessage.error(t('settings.settingUpdate.messages.loadFailed'))
  } finally {
    fetching.value = false
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const status = await getUpdateStatus()
    lastCheck.value = (status as any).lastCheck ?? null
  } catch (error) {
    console.warn('[SettingUpdate] Failed to refresh status:', error)
  }
}

async function handleChannelChange(value: AppPreviewChannel): Promise<void> {
  if (!settings.value || channelSaving.value) return

  const previous = selectedChannel.value
  selectedChannel.value = value
  channelSaving.value = true
  try {
    await updateSettings({ updateChannel: value })
    settings.value.updateChannel = value
    ElMessage.success(t('settings.settingUpdate.messages.channelSaved'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to update channel:', error)
    selectedChannel.value = previous
    ElMessage.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    channelSaving.value = false
  }
}

async function handleFrequencyChange(value: UpdateSettings['frequency']): Promise<void> {
  if (!settings.value || frequencySaving.value) return

  const previous = selectedFrequency.value
  selectedFrequency.value = value
  frequencySaving.value = true
  try {
    await updateSettings({ frequency: value })
    settings.value.frequency = value
    ElMessage.success(t('settings.settingUpdate.messages.frequencySaved'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to update frequency:', error)
    selectedFrequency.value = previous
    ElMessage.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    frequencySaving.value = false
  }
}

async function handleManualCheck(): Promise<void> {
  manualChecking.value = true
  try {
    const result = await checkApplicationUpgrade(true)
    await refreshStatus()
    updateLastResultMessage(result)
    if (result?.hasUpdate && result.release) {
      ElMessage.success(
        t('settings.settingUpdate.messages.manualCheckFound', {
          version: result.release.tag_name
        })
      )
    } else if (result?.error) {
      ElMessage.warning(
        t('settings.settingUpdate.messages.manualCheckFailedWithReason', {
          reason: result.error
        })
      )
    } else if (result?.release) {
      ElMessage.success(
        t('settings.settingUpdate.messages.manualCheckNoUpdate', {
          version: result.release.tag_name
        })
      )
    } else {
      ElMessage.success(t('settings.settingUpdate.messages.manualCheckStarted'))
    }
  } catch (error) {
    console.error('[SettingUpdate] Manual update check failed:', error)
    ElMessage.error(t('settings.settingUpdate.messages.manualCheckFailed'))
  } finally {
    manualChecking.value = false
  }
}

async function handleClearCache(): Promise<void> {
  clearingCache.value = true
  try {
    await clearUpdateCache()
    ElMessage.success(t('settings.settingUpdate.messages.cacheCleared'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to clear cache:', error)
    ElMessage.error(t('settings.settingUpdate.messages.cacheClearFailed'))
  } finally {
    clearingCache.value = false
  }
}

function normalizeBuildChannel(channel?: string): AppPreviewChannel {
  const normalized = (channel || '').toUpperCase()
  if (normalized === AppPreviewChannel.SNAPSHOT) return AppPreviewChannel.SNAPSHOT
  if (normalized === AppPreviewChannel.BETA) return AppPreviewChannel.BETA
  return AppPreviewChannel.RELEASE
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString()
}

function updateLastResultMessage(result?: Awaited<ReturnType<typeof checkApplicationUpgrade>>): void {
  if (!result) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckFailed')
    return
  }
  if (result.hasUpdate && result.release) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckFound', {
      version: result.release.tag_name
    })
    return
  }
  if (result.error) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckFailedWithReason', {
      reason: result.error
    })
    return
  }
  if (result.release) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckNoUpdate', {
      version: result.release.tag_name
    })
    return
  }
  lastResultMessage.value = ''
}
</script>

<template>
  <tuff-group-block
    :name="t('settings.settingUpdate.groupTitle')"
    :description="t('settings.settingUpdate.groupDesc')"
    default-icon="i-carbon-update-now"
    active-icon="i-carbon-upgrade"
    memory-name="setting-update"
  >
    <tuff-block-select
      v-model="selectedChannel"
      :title="t('settings.settingUpdate.channelTitle')"
      :description="
        isSnapshotBuild
          ? t('settings.settingUpdate.channelSnapshotLocked')
          : t('settings.settingUpdate.channelDesc')
      "
      default-icon="i-carbon-software"
      active-icon="i-carbon-software-resource"
      :disabled="channelSelectDisabled"
      @update:model-value="(value) => handleChannelChange(value as AppPreviewChannel)"
    >
      <t-select-item
        v-for="item in channelOptions"
        :key="item.value"
        :model-value="item.value"
      >
        {{ item.label }}
      </t-select-item>
    </tuff-block-select>

    <tuff-block-select
      v-model="selectedFrequency"
      :title="t('settings.settingUpdate.frequencyTitle')"
      :description="t('settings.settingUpdate.frequencyDesc')"
      default-icon="i-carbon-reminder"
      active-icon="i-carbon-reminder-medical"
      :disabled="frequencySelectDisabled"
      @update:model-value="(value) => handleFrequencyChange(value as UpdateSettings['frequency'])"
    >
      <t-select-item
        v-for="freq in frequencyOptions"
        :key="freq.value"
        :model-value="freq.value"
      >
        {{ freq.label }}
      </t-select-item>
    </tuff-block-select>

    <tuff-block-slot
      :title="t('settings.settingUpdate.statusTitle')"
      :description="statusDescription"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <div class="status-message" v-if="updateStateMessage">
        {{ updateStateMessage }}
      </div>
      <div class="status-message" v-if="lastResultMessage">
        {{ lastResultMessage }}
      </div>
    </tuff-block-slot>

    <tuff-block-slot
      :title="t('settings.settingUpdate.actionsTitle')"
      :description="t('settings.settingUpdate.actionsDesc')"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
    >
      <FlatButton type="primary" :loading="manualChecking" @click="handleManualCheck">
        {{ t('settings.settingUpdate.actions.manualCheck') }}
      </FlatButton>
      <FlatButton :loading="clearingCache" @click="handleClearCache">
        {{ t('settings.settingUpdate.actions.clearCache') }}
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style scoped>
.status-message {
  font-size: 13px;
  color: var(--el-color-info);
}
</style>

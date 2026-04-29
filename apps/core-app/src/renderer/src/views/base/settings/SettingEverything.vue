<script setup lang="ts" name="SettingEverything">
import { TxButton } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { toast } from 'vue-sonner'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type EverythingHealthState,
  everythingStatusEvent,
  everythingTestEvent,
  everythingToggleEvent,
  type EverythingBackendType,
  type EverythingStatusResponse
} from '../../../../../shared/events/everything'
import {
  resolveEverythingStatusColor,
  resolveEverythingStatusTextKey,
  shouldShowEverythingInstallGuide,
  shouldShowEverythingToggle
} from './setting-everything-state'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'

const { t } = useI18n()
const transport = useTuffTransport()
const settingEverythingLog = createRendererLogger('SettingEverything')

const everythingStatus = ref<EverythingStatusResponse | null>(null)
const isChecking = ref(false)
const isTesting = ref(false)

function mapBackendLabel(backend: EverythingBackendType): string {
  if (backend === 'sdk-napi') return t('settings.settingEverything.backendSdk')
  if (backend === 'cli') return t('settings.settingEverything.backendCli')
  return t('settings.settingEverything.backendUnavailable')
}

function mapHealthLabel(health: EverythingHealthState): string {
  if (health === 'healthy') return t('settings.settingEverything.healthHealthy')
  if (health === 'degraded') return t('settings.settingEverything.healthDegraded')
  return t('settings.settingEverything.healthUnsupported')
}

let statusCheckInterval: NodeJS.Timeout | null = null

async function checkStatus(refresh = false) {
  if (isChecking.value) return

  isChecking.value = true
  try {
    const status = await transport.send(everythingStatusEvent, {
      refresh
    })
    everythingStatus.value = status
  } catch (error) {
    settingEverythingLog.error('Failed to get status', error)
  } finally {
    isChecking.value = false
  }
}

async function toggleEverything() {
  if (!everythingStatus.value) return

  const newEnabled = !everythingStatus.value.enabled

  try {
    await transport.send(everythingToggleEvent, { enabled: newEnabled })
    everythingStatus.value = {
      ...everythingStatus.value,
      enabled: newEnabled
    }
    await checkStatus(newEnabled)

    toast.success(
      newEnabled
        ? t('settings.settingEverything.enabledSuccess')
        : t('settings.settingEverything.disabledSuccess')
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    settingEverythingLog.error('Failed to toggle', error)
    toast.error(
      t('settings.settingEverything.toggleFailed', {
        error: message
      })
    )
  }
}

async function testSearch() {
  if (isTesting.value) return

  isTesting.value = true
  try {
    const result = await transport.send(everythingTestEvent)

    if (result.success) {
      toast.success(
        t('settings.settingEverything.testSuccess', {
          count: result.resultCount,
          duration: result.duration
        })
      )
    } else {
      toast.error(
        t('settings.settingEverything.testFailed', {
          error: result.error || 'Unknown error'
        })
      )
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    settingEverythingLog.error('Test search failed', error)
    toast.error(
      t('settings.settingEverything.testFailed', {
        error: message
      })
    )
  } finally {
    isTesting.value = false
  }
}

function openEverythingDownload() {
  window.open('https://www.voidtools.com/', '_blank')
}

function openCLIDownload() {
  window.open('https://www.voidtools.com/support/everything/command_line_interface/', '_blank')
}

const statusText = computed(() => {
  return t(resolveEverythingStatusTextKey(everythingStatus.value))
})

const statusColor = computed(() => {
  return resolveEverythingStatusColor(everythingStatus.value)
})

const showInstallGuide = computed(() => {
  return shouldShowEverythingInstallGuide(everythingStatus.value)
})

const showToggle = computed(() => {
  return shouldShowEverythingToggle(everythingStatus.value)
})

const backendText = computed(() => {
  if (!everythingStatus.value) return '-'
  return mapBackendLabel(everythingStatus.value.backend)
})

const fallbackChainText = computed(() => {
  if (!everythingStatus.value?.fallbackChain || everythingStatus.value.fallbackChain.length === 0) {
    return '-'
  }
  return everythingStatus.value.fallbackChain.map((item) => mapBackendLabel(item)).join(' → ')
})

const healthText = computed(() => {
  if (!everythingStatus.value) return '-'
  return mapHealthLabel(everythingStatus.value.health)
})

const lastCheckedText = computed(() => {
  if (!everythingStatus.value?.lastChecked) return t('settings.settingEverything.neverChecked')

  const now = Date.now()
  const diff = now - everythingStatus.value.lastChecked
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)

  if (minutes < 1) return t('settings.settingEverything.justNow')
  if (minutes === 1) return t('settings.settingEverything.oneMinuteAgo')
  if (minutes < 60) return t('settings.settingEverything.minutesAgo', { minutes })

  const hours = Math.floor(minutes / 60)
  if (hours === 1) return t('settings.settingEverything.oneHourAgo')
  return t('settings.settingEverything.hoursAgo', { hours })
})

onMounted(async () => {
  await checkStatus(true)

  statusCheckInterval = setInterval(() => {
    checkStatus()
  }, 30000)
})

onUnmounted(() => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
    statusCheckInterval = null
  }
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.settingEverything.groupTitle')"
    :description="t('settings.settingEverything.groupDesc')"
    default-icon="i-carbon-search-advanced"
    active-icon="i-carbon-search-advanced"
    memory-name="setting-everything"
  >
    <TuffBlockSlot
      :title="t('settings.settingEverything.statusTitle')"
      :description="statusText"
      :active="everythingStatus?.enabled && everythingStatus?.available"
      default-icon="i-carbon-ai-status"
      active-icon="i-carbon-ai-status-complete"
    >
      <div class="status-badge" :class="[statusColor]">
        {{ statusText }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus?.available"
      :title="t('settings.settingEverything.versionTitle')"
      :description="everythingStatus.esPath || t('settings.settingEverything.pathUnknown')"
      default-icon="i-carbon-information"
      active-icon="i-carbon-information"
    >
      <div class="version-info">
        {{ everythingStatus.version || t('settings.settingEverything.versionUnknown') }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.backendTitle')"
      :description="t('settings.settingEverything.backendDesc')"
      default-icon="i-carbon-data-view"
      active-icon="i-carbon-data-view"
    >
      <div class="version-info">
        {{ backendText }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.healthTitle')"
      :description="everythingStatus.healthReason || t('settings.settingEverything.healthDesc')"
      default-icon="i-carbon-pulse"
      active-icon="i-carbon-pulse"
    >
      <div class="version-info">
        {{ healthText }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.fallbackChainTitle')"
      :description="t('settings.settingEverything.fallbackChainDesc')"
      default-icon="i-carbon-flow-stream"
      active-icon="i-carbon-flow-stream"
    >
      <div class="version-info">
        {{ fallbackChainText }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="showToggle"
      :title="t('settings.settingEverything.enableTitle')"
      :description="t('settings.settingEverything.enableDesc')"
      default-icon="i-carbon-power"
      active-icon="i-carbon-power"
    >
      <TxButton
        variant="flat"
        :type="!everythingStatus?.enabled ? 'primary' : undefined"
        @click="toggleEverything"
      >
        {{
          everythingStatus?.enabled
            ? t('settings.settingEverything.disable')
            : t('settings.settingEverything.enable')
        }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="showToggle && everythingStatus?.enabled"
      :title="t('settings.settingEverything.testTitle')"
      :description="t('settings.settingEverything.testDesc')"
      default-icon="i-carbon-test-tool"
      active-icon="i-carbon-test-tool"
    >
      <TxButton variant="flat" :disabled="isTesting" @click="testSearch">
        {{
          isTesting
            ? t('settings.settingEverything.testing')
            : t('settings.settingEverything.testNow')
        }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="showInstallGuide"
      :title="t('settings.settingEverything.installTitle')"
      :description="t('settings.settingEverything.installDesc')"
      default-icon="i-carbon-download"
      active-icon="i-carbon-download"
    >
      <div class="install-buttons">
        <TxButton variant="flat" type="primary" @click="openEverythingDownload">
          {{ t('settings.settingEverything.downloadEverything') }}
        </TxButton>
        <TxButton variant="flat" @click="openCLIDownload">
          {{ t('settings.settingEverything.downloadCLI') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus?.error"
      :title="t('settings.settingEverything.errorTitle')"
      :description="everythingStatus.error"
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt"
    >
      <div class="error-message">
        {{ everythingStatus.error }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus?.lastBackendError"
      :title="t('settings.settingEverything.backendErrorTitle')"
      :description="everythingStatus.lastBackendError"
      default-icon="i-carbon-warning-alt-inverted"
      active-icon="i-carbon-warning-alt-inverted"
    >
      <div class="error-message">
        {{ everythingStatus.lastBackendError }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.lastCheckedTitle')"
      :description="lastCheckedText"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <TxButton variant="flat" :disabled="isChecking" @click="checkStatus(true)">
        {{
          isChecking
            ? t('settings.settingEverything.checking')
            : t('settings.settingEverything.checkNow')
        }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.1);
}

.version-info {
  font-size: 12px;
  color: var(--tuff-text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

.install-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.error-message {
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
  word-break: break-word;
}
</style>

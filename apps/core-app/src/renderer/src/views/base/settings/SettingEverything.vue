<script setup lang="ts" name="SettingEverything">
import { TxButton } from '@talex-touch/tuffex/button'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { toast } from 'vue-sonner'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type EverythingHealthState,
  everythingInstallStartEvent,
  everythingInstallStatusEvent,
  everythingSetCliPathEvent,
  everythingStatusEvent,
  everythingTestEvent,
  everythingToggleEvent,
  type EverythingInstallPhase,
  type EverythingInstallStatusResponse,
  type EverythingBackendType,
  type EverythingDiagnosticStage,
  type EverythingStatusResponse
} from '../../../../../shared/events/everything'
import {
  getEverythingDiagnosticStages,
  resolveEverythingStatusColor,
  resolveEverythingStatusTextKey,
  shouldShowEverythingInstallGuide,
  shouldShowEverythingDiagnostics,
  shouldShowEverythingToggle
} from './setting-everything-state'
import {
  buildEverythingDiagnosticEvidenceFilename,
  buildEverythingDiagnosticEvidencePayload,
  formatEverythingDiagnosticEvidenceJson
} from './everything-diagnostic-evidence'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import { createRendererLogger } from '~/utils/renderer-log'

const { t } = useI18n()
const transport = useTuffTransport()
const settingEverythingLog = createRendererLogger('SettingEverything')

const openFileEvent = defineRawEvent<
  {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: string[]
  },
  { filePaths?: string[] }
>('dialog:open-file')

const everythingStatus = ref<EverythingStatusResponse | null>(null)
const everythingInstallStatus = ref<EverythingInstallStatusResponse | null>(null)
const isChecking = ref(false)
const isTesting = ref(false)
const isSavingCliPath = ref(false)
const isStartingInstall = ref(false)
const installDialogVisible = ref(false)
const installDialogSource = ref<HTMLElement | null>(null)
const installAdvancedDialogVisible = ref(false)
const installAdvancedDialogSource = ref<HTMLElement | null>(null)
const diagnosticsDialogVisible = ref(false)
const diagnosticsDialogSource = ref<HTMLElement | null>(null)
const lastHandledInstallTerminalJob = ref<string | null>(null)

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

function mapDiagnosticStageLabel(stage: EverythingDiagnosticStage): string {
  if (stage === 'sdk-load') return t('settings.settingEverything.diagnosticSdkLoad')
  if (stage === 'sdk-query') return t('settings.settingEverything.diagnosticSdkQuery')
  if (stage === 'cli-detect') return t('settings.settingEverything.diagnosticCliDetect')
  return t('settings.settingEverything.diagnosticCliQuery')
}

function mapInstallPhaseLabel(phase: EverythingInstallPhase): string {
  return t(`settings.settingEverything.installPhase.${phase}`)
}

let statusCheckInterval: NodeJS.Timeout | null = null
let installStatusCheckInterval: NodeJS.Timeout | null = null

function resolveActionSource(event: MouseEvent): HTMLElement | null {
  return event.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

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

async function checkInstallStatus() {
  try {
    everythingInstallStatus.value = await transport.send(everythingInstallStatusEvent)
    if (isInstallActive.value) {
      ensureInstallStatusPolling()
    }
  } catch (error) {
    settingEverythingLog.error('Failed to get Everything install status', error)
  }
}

function ensureInstallStatusPolling() {
  if (installStatusCheckInterval) return

  installStatusCheckInterval = setInterval(() => {
    if (!isInstallActive.value) {
      stopInstallStatusPolling()
      return
    }
    checkInstallStatus()
  }, 1000)
}

function stopInstallStatusPolling() {
  if (!installStatusCheckInterval) return
  clearInterval(installStatusCheckInterval)
  installStatusCheckInterval = null
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

async function saveCliPath(path: string | null) {
  if (isSavingCliPath.value) return

  isSavingCliPath.value = true
  try {
    const result = await transport.send(everythingSetCliPathEvent, { path })
    everythingStatus.value = result.status
    toast.success(
      path
        ? t('settings.settingEverything.cliPathSaved')
        : t('settings.settingEverything.cliPathCleared')
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    settingEverythingLog.error('Failed to save Everything CLI path', error)
    toast.error(
      t('settings.settingEverything.cliPathSaveFailed', {
        error: message
      })
    )
  } finally {
    isSavingCliPath.value = false
  }
}

async function selectCliPath() {
  try {
    const defaultPath = everythingStatus.value?.configuredCliPath || everythingStatus.value?.esPath
    const result = await transport.send(openFileEvent, {
      title: t('settings.settingEverything.cliPathSelect'),
      defaultPath: defaultPath || undefined,
      buttonLabel: t('common.confirm'),
      properties: ['openFile'],
      filters: [
        {
          name: t('settings.settingEverything.cliPathFileFilter'),
          extensions: ['exe']
        }
      ]
    })

    const selected = result.filePaths?.[0]
    if (selected) {
      await saveCliPath(selected)
    }
  } catch (error) {
    settingEverythingLog.error('Failed to select Everything CLI path', error)
    toast.error(t('settings.settingEverything.cliPathSelectFailed'))
  }
}

async function clearCliPath() {
  await saveCliPath(null)
}

function openEverythingDownload() {
  window.open('https://www.voidtools.com/', '_blank')
}

function openCLIDownload() {
  window.open('https://www.voidtools.com/support/everything/command_line_interface/', '_blank')
}

function openInstallDialog(event: MouseEvent): void {
  installDialogSource.value = resolveActionSource(event)
  installDialogVisible.value = true
}

function openInstallAdvancedDialog(event: MouseEvent): void {
  installAdvancedDialogSource.value = resolveActionSource(event)
  installAdvancedDialogVisible.value = true
  checkInstallStatus()
}

function openDiagnosticsDialog(event: MouseEvent): void {
  diagnosticsDialogSource.value = resolveActionSource(event)
  diagnosticsDialogVisible.value = true
}

async function startEverythingInstall(): Promise<void> {
  if (isStartingInstall.value || isInstallActive.value) return

  isStartingInstall.value = true
  try {
    const result = await transport.send(everythingInstallStartEvent)
    everythingInstallStatus.value = result.status

    if (!result.success || result.status.phase === 'unsupported') {
      toast.error(result.status.error || t('settings.settingEverything.installUnsupported'))
      return
    }

    toast.success(t('settings.settingEverything.installStarted'))
    ensureInstallStatusPolling()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    settingEverythingLog.error('Failed to start Everything install', error)
    toast.error(t('settings.settingEverything.installStartFailed', { error: message }))
  } finally {
    isStartingInstall.value = false
  }
}

async function refreshInstallAndStatusAfterTerminalPhase() {
  const phase = everythingInstallStatus.value?.phase
  if (phase === 'completed') {
    toast.success(t('settings.settingEverything.installCompleted'))
    await checkStatus(true)
  } else if (phase === 'failed') {
    toast.error(
      t('settings.settingEverything.installFailed', {
        error: everythingInstallStatus.value?.error || '-'
      })
    )
  }
}

function buildCurrentEverythingEvidence() {
  if (!everythingStatus.value) return null

  return buildEverythingDiagnosticEvidencePayload({
    status: everythingStatus.value
  })
}

async function copyEverythingEvidence() {
  const payload = buildCurrentEverythingEvidence()
  if (!payload) {
    toast.error(t('settings.settingEverything.evidenceMissing'))
    return
  }

  try {
    await navigator.clipboard.writeText(formatEverythingDiagnosticEvidenceJson(payload))
    toast.success(t('settings.settingEverything.evidenceCopied'))
  } catch (error) {
    settingEverythingLog.error('Failed to copy Everything diagnostic evidence', error)
    toast.error(t('settings.settingEverything.evidenceCopyFailed'))
  }
}

function saveEverythingEvidence() {
  const payload = buildCurrentEverythingEvidence()
  if (!payload) {
    toast.error(t('settings.settingEverything.evidenceMissing'))
    return
  }

  const blob = new Blob([formatEverythingDiagnosticEvidenceJson(payload)], {
    type: 'application/json;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = buildEverythingDiagnosticEvidenceFilename(payload)
  link.click()
  URL.revokeObjectURL(url)
  toast.success(t('settings.settingEverything.evidenceSaved'))
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

const showDiagnostics = computed(() => {
  return shouldShowEverythingDiagnostics(everythingStatus.value)
})

const diagnosticStages = computed(() => {
  return getEverythingDiagnosticStages(everythingStatus.value)
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

const configuredCliPathText = computed(() => {
  return everythingStatus.value?.configuredCliPath || '-'
})

const activeCliPathText = computed(() => {
  return everythingStatus.value?.esPath || '-'
})

const cliPathDescription = computed(() => {
  return everythingStatus.value?.configuredCliPath
    ? t('settings.settingEverything.cliPathDesc')
    : t('settings.settingEverything.cliPathAutoDesc')
})

const cliPathSummaryText = computed(() => {
  if (everythingStatus.value?.esPath) return everythingStatus.value.esPath
  if (everythingStatus.value?.configuredCliPath) return everythingStatus.value.configuredCliPath
  return t('settings.settingEverything.pathUnknown')
})

const healthText = computed(() => {
  if (!everythingStatus.value) return '-'
  return mapHealthLabel(everythingStatus.value.health)
})

const backendSummaryText = computed(() => {
  if (!everythingStatus.value) return '-'
  return `${backendText.value} / ${healthText.value}`
})

const diagnosticSummary = computed(() => {
  const stages = diagnosticStages.value
  if (stages.length === 0) return t('settings.settingEverything.diagnosticsEmpty')

  const failedCount = stages.filter((stage) => {
    return everythingStatus.value?.diagnostics?.stages[stage]?.status === 'failed'
  }).length

  return failedCount > 0
    ? t('settings.settingEverything.diagnosticsFailed', { count: failedCount })
    : t('settings.settingEverything.diagnosticsHealthy')
})

const backendAttemptEntries = computed(() => {
  return Object.entries(everythingStatus.value?.backendAttemptErrors ?? {})
})

const hasDiagnosticsDetail = computed(() => {
  return Boolean(everythingStatus.value)
})

const isInstallActive = computed(() => {
  const phase = everythingInstallStatus.value?.phase
  return Boolean(phase && !['idle', 'completed', 'failed', 'unsupported'].includes(phase))
})

const installPhaseText = computed(() => {
  return mapInstallPhaseLabel(everythingInstallStatus.value?.phase || 'idle')
})

const installProgressText = computed(() => {
  const progress = everythingInstallStatus.value?.progress
  return typeof progress === 'number' ? `${Math.round(progress)}%` : '-'
})

const installPrimaryButtonText = computed(() => {
  if (isStartingInstall.value) return t('settings.settingEverything.installStarting')
  if (isInstallActive.value) return installPhaseText.value
  return t('settings.settingEverything.installOneClick')
})

const installStatusMessage = computed(() => {
  return (
    everythingInstallStatus.value?.message || t('settings.settingEverything.installOneClickDesc')
  )
})

const installTaskIdText = computed(() => {
  const taskIds = everythingInstallStatus.value?.taskIds
  if (!taskIds) return '-'

  return [taskIds.everything, taskIds.cli].filter(Boolean).join(' / ') || '-'
})

const installErrorText = computed(() => {
  return everythingInstallStatus.value?.error || '-'
})

const installAssets = computed(() => {
  return everythingInstallStatus.value?.assets ?? []
})

const diagnosticsDialogDescription = computed(() => {
  return (
    everythingStatus.value?.healthReason ||
    everythingStatus.value?.lastBackendError ||
    diagnosticSummary.value
  )
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
  await checkInstallStatus()

  statusCheckInterval = setInterval(() => {
    checkStatus()
  }, 30000)
})

onUnmounted(() => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
    statusCheckInterval = null
  }
  stopInstallStatusPolling()
})

watch(
  () => everythingInstallStatus.value?.phase,
  async (phase) => {
    const jobId = everythingInstallStatus.value?.jobId
    if (!jobId || !phase || !['completed', 'failed'].includes(phase)) return
    if (lastHandledInstallTerminalJob.value === jobId) return

    lastHandledInstallTerminalJob.value = jobId
    stopInstallStatusPolling()
    await refreshInstallAndStatusAfterTerminalPhase()
  }
)
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
      :description="t('settings.settingEverything.statusDesc')"
      :active="everythingStatus?.enabled && everythingStatus?.available"
      default-icon="i-carbon-ai-status"
      active-icon="i-carbon-ai-status-complete"
    >
      <div class="status-badge" :class="[statusColor]">
        {{ statusText }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.backendSummaryTitle')"
      :description="
        everythingStatus.healthReason || t('settings.settingEverything.backendSummaryDesc')
      "
      default-icon="i-carbon-data-view"
      active-icon="i-carbon-data-view"
    >
      <div class="summary-actions">
        <div class="version-info">
          {{ backendSummaryText }}
        </div>
        <TxButton
          v-if="hasDiagnosticsDetail"
          variant="flat"
          size="sm"
          @click="openDiagnosticsDialog"
        >
          {{ t('settings.settingEverything.viewDiagnostics') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.cliPathTitle')"
      :description="cliPathDescription"
      default-icon="i-carbon-terminal"
      active-icon="i-carbon-terminal"
    >
      <div class="cli-path-panel">
        <code>{{ cliPathSummaryText }}</code>
        <div class="compact-actions">
          <TxButton variant="flat" size="sm" :disabled="isSavingCliPath" @click="selectCliPath">
            {{ t('settings.settingEverything.cliPathSelect') }}
          </TxButton>
          <TxButton
            v-if="everythingStatus.configuredCliPath"
            variant="flat"
            size="sm"
            :disabled="isSavingCliPath"
            @click="clearCliPath"
          >
            {{ t('settings.settingEverything.cliPathClear') }}
          </TxButton>
        </div>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="everythingStatus"
      :title="t('settings.settingEverything.actionsTitle')"
      :description="t('settings.settingEverything.actionsDesc', { time: lastCheckedText })"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
    >
      <div class="action-strip">
        <TxButton
          variant="flat"
          size="sm"
          :type="showInstallGuide ? 'primary' : undefined"
          @click="openInstallDialog"
        >
          {{ t('settings.settingEverything.openInstallGuide') }}
        </TxButton>
        <TxButton variant="flat" size="sm" :disabled="isChecking" @click="checkStatus(true)">
          {{
            isChecking
              ? t('settings.settingEverything.checking')
              : t('settings.settingEverything.checkNow')
          }}
        </TxButton>
        <TxButton
          v-if="showToggle && everythingStatus.enabled"
          variant="flat"
          size="sm"
          :disabled="isTesting"
          @click="testSearch"
        >
          {{
            isTesting
              ? t('settings.settingEverything.testing')
              : t('settings.settingEverything.testNow')
          }}
        </TxButton>
        <TxButton
          v-if="showToggle"
          variant="flat"
          size="sm"
          :type="!everythingStatus.enabled ? 'primary' : undefined"
          @click="toggleEverything"
        >
          {{
            everythingStatus.enabled
              ? t('settings.settingEverything.disable')
              : t('settings.settingEverything.enable')
          }}
        </TxButton>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <FlipDialog
    v-model="installDialogVisible"
    :reference="installDialogSource"
    :header-title="t('settings.settingEverything.installDialogTitle')"
    :header-desc="t('settings.settingEverything.installOneClickDesc')"
    card-class="everything-flip-dialog"
    size="lg"
  >
    <template #default>
      <div class="everything-dialog everything-install-dialog">
        <div class="install-recommend-card">
          <div class="install-recommend-icon">
            <span class="i-carbon-cloud-download" />
          </div>
          <div class="install-recommend-content">
            <div class="install-recommend-title">
              {{ t('settings.settingEverything.installOneClickTitle') }}
            </div>
            <div class="install-recommend-desc">
              {{ installStatusMessage }}
            </div>
            <div class="install-recommend-tags">
              <span>{{ t('settings.settingEverything.installAutoTagPortable') }}</span>
              <span>{{ t('settings.settingEverything.installAutoTagNoAdmin') }}</span>
              <span>{{ t('settings.settingEverything.installAutoTagPath') }}</span>
            </div>
          </div>
        </div>

        <div v-if="everythingInstallStatus?.jobId" class="install-status-panel">
          <div class="install-status-main">
            <span>{{ installPhaseText }}</span>
            <strong>{{ installProgressText }}</strong>
          </div>
          <div class="install-progress-track">
            <div
              class="install-progress-fill"
              :style="{ width: `${everythingInstallStatus.progress || 0}%` }"
            />
          </div>
          <div v-if="everythingInstallStatus.error" class="error-message">
            {{ everythingInstallStatus.error }}
          </div>
        </div>

        <div class="install-primary-actions">
          <TxButton
            variant="flat"
            type="primary"
            :disabled="isStartingInstall || isInstallActive"
            @click="startEverythingInstall"
          >
            {{ installPrimaryButtonText }}
          </TxButton>
          <TxButton variant="flat" @click="openInstallAdvancedDialog">
            {{ t('settings.settingEverything.installAdvancedShow') }}
          </TxButton>
        </div>
      </div>
    </template>
  </FlipDialog>

  <FlipDialog
    v-model="installAdvancedDialogVisible"
    :reference="installAdvancedDialogSource"
    :header-title="t('settings.settingEverything.installAdvancedTitle')"
    :header-desc="t('settings.settingEverything.installAdvancedDesc')"
    card-class="everything-flip-dialog"
    size="lg"
  >
    <template #header-actions>
      <TxButton variant="flat" size="sm" :disabled="isChecking" @click="checkInstallStatus">
        {{ t('settings.settingEverything.installRefreshStatus') }}
      </TxButton>
    </template>

    <template #default>
      <div class="everything-dialog">
        <div class="dialog-section">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.installStatusTitle') }}
          </div>
          <div class="diagnostic-grid">
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.installPhaseTitle') }}</span>
              <strong>{{ installPhaseText }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.installProgressTitle') }}</span>
              <strong>{{ installProgressText }}</strong>
            </div>
            <div class="diagnostic-card diagnostic-card--wide">
              <span>{{ t('settings.settingEverything.installTaskIdsTitle') }}</span>
              <strong>{{ installTaskIdText }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.installTargetDirTitle') }}</span>
              <strong>{{ everythingInstallStatus?.installDir || '-' }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.installCliDirTitle') }}</span>
              <strong>{{ everythingInstallStatus?.cliDir || '-' }}</strong>
            </div>
            <div class="diagnostic-card diagnostic-card--wide">
              <span>{{ t('settings.settingEverything.activeCliPath') }}</span>
              <strong>{{ activeCliPathText }}</strong>
            </div>
            <div class="diagnostic-card diagnostic-card--wide">
              <span>{{ t('settings.settingEverything.installCliPathTitle') }}</span>
              <strong>{{ everythingInstallStatus?.cliPath || '-' }}</strong>
            </div>
            <div class="diagnostic-card diagnostic-card--wide">
              <span>{{ t('settings.settingEverything.installPathPolicyTitle') }}</span>
              <strong>{{ t('settings.settingEverything.installPathPolicyDesc') }}</strong>
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.installAssetsTitle') }}
          </div>
          <div class="install-assets-list">
            <div v-for="asset in installAssets" :key="asset.type" class="install-asset-row">
              <div>
                <strong>{{ asset.filename }}</strong>
                <code>{{ asset.url }}</code>
              </div>
              <code>{{ asset.sha256 }}</code>
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.installManualLinksTitle') }}
          </div>
          <div class="install-buttons">
            <TxButton variant="flat" @click="openEverythingDownload">
              {{ t('settings.settingEverything.downloadEverything') }}
            </TxButton>
            <TxButton variant="flat" @click="openCLIDownload">
              {{ t('settings.settingEverything.downloadCLI') }}
            </TxButton>
          </div>
        </div>

        <div v-if="everythingInstallStatus?.error" class="dialog-section">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.errorTitle') }}
          </div>
          <div class="error-message">
            {{ installErrorText }}
          </div>
        </div>
      </div>
    </template>
  </FlipDialog>

  <FlipDialog
    v-model="diagnosticsDialogVisible"
    :reference="diagnosticsDialogSource"
    :header-title="t('settings.settingEverything.diagnosticsTitle')"
    :header-desc="diagnosticsDialogDescription"
    card-class="everything-flip-dialog"
    size="lg"
  >
    <template #header-actions>
      <TxButton variant="flat" size="sm" @click="copyEverythingEvidence">
        {{ t('settings.settingEverything.copyEvidence') }}
      </TxButton>
      <TxButton variant="flat" size="sm" @click="saveEverythingEvidence">
        {{ t('settings.settingEverything.saveEvidence') }}
      </TxButton>
      <TxButton variant="flat" size="sm" :disabled="isChecking" @click="checkStatus(true)">
        {{
          isChecking
            ? t('settings.settingEverything.checking')
            : t('settings.settingEverything.checkNow')
        }}
      </TxButton>
    </template>

    <template #default>
      <div class="everything-dialog">
        <div class="dialog-section">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.backendSummaryTitle') }}
          </div>
          <div class="diagnostic-grid">
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.backendTitle') }}</span>
              <strong>{{ backendText }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.healthTitle') }}</span>
              <strong>{{ healthText }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.versionTitle') }}</span>
              <strong>
                {{ everythingStatus?.version || t('settings.settingEverything.versionUnknown') }}
              </strong>
            </div>
            <div class="diagnostic-card diagnostic-card--wide">
              <span>{{ t('settings.settingEverything.fallbackChainTitle') }}</span>
              <strong>{{ fallbackChainText }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.configuredCliPath') }}</span>
              <strong>{{ configuredCliPathText }}</strong>
            </div>
            <div class="diagnostic-card">
              <span>{{ t('settings.settingEverything.activeCliPath') }}</span>
              <strong>{{ activeCliPathText }}</strong>
            </div>
          </div>
        </div>

        <div v-if="showDiagnostics" class="dialog-section">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.diagnosticsTitle') }}
          </div>
          <div class="diagnostics-list diagnostics-list--dialog">
            <div v-for="stage in diagnosticStages" :key="stage" class="diagnostic-row">
              <span class="diagnostic-stage">{{ mapDiagnosticStageLabel(stage) }}</span>
              <span
                class="diagnostic-status"
                :class="[
                  everythingStatus?.diagnostics?.stages[stage]?.status === 'success'
                    ? 'text-green-500'
                    : 'text-red-500'
                ]"
              >
                {{ everythingStatus?.diagnostics?.stages[stage]?.status || '-' }}
              </span>
              <span class="diagnostic-duration">
                {{ everythingStatus?.diagnostics?.stages[stage]?.duration ?? '-' }}ms
              </span>
            </div>
          </div>
        </div>

        <div
          v-if="
            everythingStatus?.error ||
            everythingStatus?.lastBackendError ||
            backendAttemptEntries.length > 0
          "
          class="dialog-section"
        >
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.errorTitle') }}
          </div>
          <div v-if="everythingStatus?.error" class="error-message">
            {{ everythingStatus.error }}
          </div>
          <div v-if="everythingStatus?.lastBackendError" class="error-message">
            {{ everythingStatus.lastBackendError }}
          </div>
          <div v-if="backendAttemptEntries.length > 0" class="backend-attempt-list">
            <div v-for="[target, error] in backendAttemptEntries" :key="target" class="attempt-row">
              <code>{{ target }}</code>
              <span>{{ error }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </FlipDialog>
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

.install-primary-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.compact-actions,
.action-strip {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.action-strip {
  min-width: min(460px, 54vw);
}

.summary-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.cli-path-panel {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 280px;
  max-width: 520px;

  code {
    min-width: 0;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tuff-text-primary);
    font-family: 'JetBrains Mono', monospace;
  }
}

.diagnostics-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;

  &--dialog {
    min-width: 0;
  }
}

.diagnostic-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.diagnostic-stage,
.diagnostic-duration {
  color: var(--tuff-text-secondary);
}

.diagnostic-status {
  font-family: 'JetBrains Mono', monospace;
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

:deep(.everything-flip-dialog.FlipDialog-Card) {
  .TxFlipOverlay-Header {
    padding: 20px 22px 12px;
  }

  .TxFlipOverlay-Body {
    padding: 0 22px 22px;
    box-sizing: border-box;
  }
}

.everything-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(720px, calc(100vw - 84px));
  min-width: 0;
  box-sizing: border-box;
}

.everything-install-dialog {
  gap: 14px;
}

.install-recommend-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(59, 130, 246, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.16), rgba(34, 197, 94, 0.08)),
    rgba(255, 255, 255, 0.04);
}

.install-recommend-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.16);
  color: #60a5fa;
  font-size: 20px;
}

.install-recommend-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.install-recommend-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tuff-text-primary);
}

.install-recommend-desc {
  font-size: 12px;
  line-height: 1.55;
  color: var(--tuff-text-secondary);
}

.install-recommend-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  span {
    padding: 3px 7px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--tuff-text-secondary);
    font-size: 11px;
  }
}

.install-status-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
}

.install-status-main {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--tuff-text-secondary);

  strong {
    color: var(--tuff-text-primary);
    font-family: 'JetBrains Mono', monospace;
  }
}

.install-progress-track {
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.install-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #3b82f6, #22c55e);
  transition: width 180ms ease;
}

.dialog-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dialog-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tuff-text-primary);
}

.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.diagnostic-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);

  span {
    font-size: 12px;
    color: var(--tuff-text-secondary);
  }

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--tuff-text-primary);
  }

  &--wide {
    grid-column: 1 / -1;
  }
}

.backend-attempt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-assets-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.install-asset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 0.46fr);
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);

  div {
    min-width: 0;
  }

  strong,
  code {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  strong {
    margin-bottom: 4px;
    color: var(--tuff-text-primary);
    font-size: 12px;
  }

  code {
    color: var(--tuff-text-secondary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.45;
  }
}

.attempt-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.32fr) minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;

  code,
  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  code {
    color: var(--tuff-text-primary);
    font-family: 'JetBrains Mono', monospace;
  }

  span {
    color: var(--tuff-text-secondary);
  }
}

@media (max-width: 767px) {
  :deep(.everything-flip-dialog.FlipDialog-Card) {
    .TxFlipOverlay-Header {
      padding: 16px 16px 10px;
    }

    .TxFlipOverlay-Body {
      padding: 0 16px 16px;
    }
  }

  .everything-dialog {
    width: min(100%, calc(100vw - 52px));
  }

  .install-recommend-card {
    grid-template-columns: 1fr;
  }

  .install-primary-actions,
  .diagnostic-grid,
  .install-asset-row,
  .attempt-row {
    grid-template-columns: 1fr;
  }

  .install-primary-actions {
    align-items: stretch;

    :deep(.TxButton) {
      justify-content: center;
    }
  }
}
</style>

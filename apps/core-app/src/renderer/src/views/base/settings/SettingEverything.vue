<script setup lang="ts" name="SettingEverything">
import { TxButton } from '@talex-touch/tuffex/button'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { toast } from 'vue-sonner'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type EverythingHealthState,
  everythingSetCliPathEvent,
  everythingStatusEvent,
  everythingTestEvent,
  everythingToggleEvent,
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

const EVERYTHING_INSTALL_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$base=Join-Path $env:LOCALAPPDATA 'Tuff\\Everything'",
  "$cliDir=Join-Path $env:LOCALAPPDATA 'Tuff\\EverythingCLI'",
  "$tmp=Join-Path $env:TEMP 'tuff-everything-install'",
  "$expectedHashes=@{'Everything-1.4.1.1032.x64.zip'='698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c';'Everything-1.4.1.1032.x86.zip'='156db5beb747d69470518a7b9b55af11efc4d3285ddb7cc013c0cc13ced5f237';'Everything-1.4.1.1032.ARM64.zip'='23dca1a64574bf30c9988bbaf5f1d201a0ec7ee9a15e12270ae92a52183cccc8';'ES-1.1.0.30.x64.zip'='30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268';'ES-1.1.0.30.x86.zip'='7e9f04cb92e9eb0440655a395537b204e98e3accd5335e610649d323b15f5117';'ES-1.1.0.30.ARM64.zip'='af5f02b29d6e91b7e70d3b6809bbfe931af671d981e060ecb4f015c30f9697b9'}",
  "function Assert-ExpectedHash($file,$path){$expected=$expectedHashes[$file];if(-not $expected){throw ('Missing expected hash for ' + $file)};$actual=(Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant();if($actual -ne $expected){throw ('Hash mismatch for ' + $file + ': expected ' + $expected + ', got ' + $actual)}}",
  'New-Item -ItemType Directory -Force -Path $base,$cliDir,$tmp | Out-Null',
  "$arch=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'ARM64'}elseif($env:PROCESSOR_ARCHITECTURE -eq 'x86' -and -not $env:PROCESSOR_ARCHITEW6432){'x86'}else{'x64'}",
  "$everythingFile=if($arch -eq 'ARM64'){'Everything-1.4.1.1032.ARM64.zip'}elseif($arch -eq 'x86'){'Everything-1.4.1.1032.x86.zip'}else{'Everything-1.4.1.1032.x64.zip'}",
  "$cliFile=if($arch -eq 'ARM64'){'ES-1.1.0.30.ARM64.zip'}elseif($arch -eq 'x86'){'ES-1.1.0.30.x86.zip'}else{'ES-1.1.0.30.x64.zip'}",
  '$everythingZip=Join-Path $tmp $everythingFile',
  '$cliZip=Join-Path $tmp $cliFile',
  "Invoke-WebRequest ('https://www.voidtools.com/' + $everythingFile) -UseBasicParsing -OutFile $everythingZip",
  "Invoke-WebRequest ('https://www.voidtools.com/' + $cliFile) -UseBasicParsing -OutFile $cliZip",
  'Assert-ExpectedHash $everythingFile $everythingZip',
  'Assert-ExpectedHash $cliFile $cliZip',
  'Expand-Archive -Path $everythingZip -DestinationPath $base -Force',
  'Expand-Archive -Path $cliZip -DestinationPath $cliDir -Force',
  "$everythingExe=Join-Path $base 'Everything.exe'",
  "$esExe=Join-Path $cliDir 'es.exe'",
  "$userPath=[Environment]::GetEnvironmentVariable('Path','User')",
  "$parts=@(); if($userPath){$parts=$userPath -split ';' | Where-Object { $_ }}",
  "if($parts -notcontains $cliDir){[Environment]::SetEnvironmentVariable('Path', (($parts + $cliDir) -join ';'), 'User')}",
  "$env:Path += ';' + $cliDir",
  "Start-Process -FilePath $everythingExe -ArgumentList '-startup'",
  'Start-Sleep -Seconds 2',
  '& $esExe -v',
  "Write-Host 'Everything portable and es.exe are verified and ready. Return to Tuff and click Check Now.'"
].join('; ')
const EVERYTHING_INSTALL_COMMAND = EVERYTHING_INSTALL_SCRIPT

const everythingStatus = ref<EverythingStatusResponse | null>(null)
const isChecking = ref(false)
const isTesting = ref(false)
const isSavingCliPath = ref(false)
const installDialogVisible = ref(false)
const installDialogSource = ref<HTMLElement | null>(null)
const installAdvancedVisible = ref(false)
const diagnosticsDialogVisible = ref(false)
const diagnosticsDialogSource = ref<HTMLElement | null>(null)

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

let statusCheckInterval: NodeJS.Timeout | null = null

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

function openInstallDialog(event: MouseEvent) {
  installDialogSource.value = resolveActionSource(event)
  installAdvancedVisible.value = false
  installDialogVisible.value = true
}

function openDiagnosticsDialog(event: MouseEvent) {
  diagnosticsDialogSource.value = resolveActionSource(event)
  diagnosticsDialogVisible.value = true
}

async function copyEverythingInstallCommand() {
  try {
    await navigator.clipboard.writeText(EVERYTHING_INSTALL_COMMAND)
    toast.success(t('settings.settingEverything.installCommandCopied'))
  } catch (error) {
    settingEverythingLog.error('Failed to copy Everything install command', error)
    toast.error(t('settings.settingEverything.installCommandCopyFailed'))
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
    :header-desc="t('settings.settingEverything.installCommandDesc')"
    card-class="everything-flip-dialog"
    size="lg"
  >
    <template #default>
      <div class="everything-dialog">
        <div class="install-recommend-card">
          <div class="install-recommend-icon">
            <span class="i-carbon-shield-check" />
          </div>
          <div class="install-recommend-content">
            <div class="install-recommend-title">
              {{ t('settings.settingEverything.installAutoTitle') }}
            </div>
            <div class="install-recommend-desc">
              {{ t('settings.settingEverything.installAutoDesc') }}
            </div>
            <div class="install-recommend-tags">
              <span>{{ t('settings.settingEverything.installAutoTagPortable') }}</span>
              <span>{{ t('settings.settingEverything.installAutoTagNoAdmin') }}</span>
              <span>{{ t('settings.settingEverything.installAutoTagOfficial') }}</span>
            </div>
          </div>
        </div>

        <div class="install-primary-actions">
          <TxButton variant="flat" type="primary" @click="copyEverythingInstallCommand">
            {{ t('settings.settingEverything.installAutoCopy') }}
          </TxButton>
          <TxButton variant="flat" @click="installAdvancedVisible = !installAdvancedVisible">
            {{
              installAdvancedVisible
                ? t('settings.settingEverything.installAdvancedHide')
                : t('settings.settingEverything.installAdvancedShow')
            }}
          </TxButton>
        </div>

        <div v-if="installAdvancedVisible" class="dialog-section install-advanced">
          <div class="dialog-section-title">
            {{ t('settings.settingEverything.installAdvancedTitle') }}
          </div>
          <div class="install-buttons">
            <TxButton variant="flat" @click="openEverythingDownload">
              {{ t('settings.settingEverything.downloadEverything') }}
            </TxButton>
            <TxButton variant="flat" @click="openCLIDownload">
              {{ t('settings.settingEverything.downloadCLI') }}
            </TxButton>
          </div>

          <div class="dialog-section">
            <div class="dialog-section-title">
              {{ t('settings.settingEverything.installCommandTitle') }}
            </div>
            <pre class="install-command-code"><code>{{ EVERYTHING_INSTALL_COMMAND }}</code></pre>
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
    padding: 18px 20px 12px;
  }

  .TxFlipOverlay-Body {
    padding: 0 20px 20px;
    box-sizing: border-box;
  }
}

.everything-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: min(680px, calc(100vw - 64px));
  box-sizing: border-box;
}

.install-recommend-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(59, 130, 246, 0.28);
  border-radius: 12px;
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
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--tuff-text-secondary);
    font-size: 11px;
  }
}

.install-advanced {
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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

.install-command-code {
  max-height: 220px;
  margin: 0;
  padding: 12px;
  overflow: hidden auto;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--tuff-text-primary);
  font-size: 11px;
  line-height: 1.6;
  font-family: 'JetBrains Mono', monospace;
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
    min-width: 0;
  }

  .install-recommend-card {
    grid-template-columns: 1fr;
  }

  .diagnostic-grid,
  .attempt-row {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { requestJson } from '~/utils/request'

defineI18nRoute(false)

const { t } = useI18n()
const toast = useToast()
const { signOut } = useNexusAuth()

type ExportJobStatus = 'idle' | 'starting' | 'queued' | 'running' | 'succeeded' | 'failed' | 'expired'

interface PrivacyExportJobCreateResponse {
  jobId: string
  status: Exclude<ExportJobStatus, 'idle' | 'starting'>
  expiresAt?: string
}

interface PrivacyExportJobStatusResponse extends PrivacyExportJobCreateResponse {
  error?: string | null
  downloadUrl?: string | null
}

interface AccountDeletionTermsSessionResponse {
  sessionId: string
  startedAt: string
  earliestConfirmAt: string
  expiresAt: string
  termsVersion: string
  minReadSeconds: number
  confirmPhrase: string
}

const loading = ref(false)
const securityLoading = ref(false)
const securityConfirmOpen = ref(false)
const exportStatus = ref<ExportJobStatus>('idle')
const exportJobId = ref<string | null>(null)
const exportDownloadUrl = ref<string | null>(null)
const exportError = ref<string | null>(null)
const exportPollTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const deletionDialogOpen = ref(false)
const deletionSessionLoading = ref(false)
const deletionSubmitting = ref(false)
const deletionSession = ref<AccountDeletionTermsSessionResponse | null>(null)
const deletionConfirmPhrase = ref('')
const deletionRemainingSeconds = ref(0)
const deletionError = ref<string | null>(null)
const deletionCountdownTimer = ref<ReturnType<typeof setInterval> | null>(null)

const privacySettings = ref({
  analytics: true,
  crashReports: true,
  usageData: false,
  personalization: true,
})

const securitySettings = ref({
  allowCliIpMismatch: false,
})

const securityConfirmButtons = computed<DialogButton[]>(() => [
  {
    content: t('common.cancel', '取消'),
    type: 'info',
    onClick: () => true,
  },
  {
    content: t('dashboard.privacy.cliIpMismatchConfirmEnable', '确认开启'),
    type: 'warning',
    onClick: async () => persistSecuritySettings(true),
  },
])

const exportDescription = computed(() => {
  if (exportStatus.value === 'starting')
    return t('dashboard.privacy.exportStarting', '正在创建导出任务…')
  if (exportStatus.value === 'queued' || exportStatus.value === 'running')
    return t('dashboard.privacy.exportPreparing', '导出任务正在后台准备，完成后会自动下载。')
  if (exportStatus.value === 'succeeded')
    return t('dashboard.privacy.exportReady', '导出已准备好，点击可再次下载。')
  if (exportStatus.value === 'failed')
    return exportError.value || t('dashboard.privacy.exportFailed', '导出失败，请稍后重试。')
  if (exportStatus.value === 'expired')
    return t('dashboard.privacy.exportExpired', '导出文件已过期，请重新创建。')
  return t('dashboard.privacy.exportDataDesc', '创建后台任务，准备完成后下载 JSON 附件。')
})

const exportActiveIcon = computed(() => {
  if (exportStatus.value === 'queued' || exportStatus.value === 'running' || exportStatus.value === 'starting')
    return 'i-carbon-progress-bar'
  if (exportStatus.value === 'succeeded')
    return 'i-carbon-document-download'
  if (exportStatus.value === 'failed' || exportStatus.value === 'expired')
    return 'i-carbon-warning-alt'
  return 'i-carbon-download'
})

const deletionConfirmPhraseExpected = computed(() => deletionSession.value?.confirmPhrase || 'DELETE_MY_DATA')
const deletionCanSubmit = computed(() => {
  return Boolean(
    deletionSession.value
    && deletionRemainingSeconds.value <= 0
    && deletionConfirmPhrase.value.trim() === deletionConfirmPhraseExpected.value
    && !deletionSessionLoading.value
    && !deletionSubmitting.value,
  )
})
const deletionCountdownText = computed(() => {
  if (deletionRemainingSeconds.value > 0)
    return t('dashboard.privacy.deleteReadCountdown', { seconds: deletionRemainingSeconds.value })
  return t('dashboard.privacy.deleteReadComplete', '已满足阅读时间，可以提交确认。')
})
const deletionTerms = computed(() => [
  t('dashboard.privacy.deleteTermsCooldown', '提交后账号会进入 30 天冷静期，不会立即硬删除数据。'),
  t('dashboard.privacy.deleteTermsAccess', '冷静期内当前会话、App Token、API Key 和设备授权会被撤销或拒绝访问。'),
  t('dashboard.privacy.deleteTermsRecovery', '30 天内重新登录会自动取消注销并恢复账号；超过 30 天后将进入最终停用、脱敏和凭据吊销流程。'),
  t('dashboard.privacy.deleteTermsExportReminder', '请先导出需要保留的数据，再继续注销。'),
])

async function saveSettings() {
  const previous = { ...privacySettings.value }
  loading.value = true
  try {
    const data = await requestJson<{ settings?: typeof privacySettings.value }>('/api/dashboard/privacy-settings', {
      method: 'PATCH',
      body: privacySettings.value,
    })
    privacySettings.value = { ...privacySettings.value, ...(data.settings ?? {}) }
    toast.success(t('dashboard.privacy.privacySaved', '隐私设置已保存'))
  }
  catch (error) {
    privacySettings.value = previous
    console.error('Failed to save privacy settings:', error)
    toast.error(t('dashboard.privacy.privacySaveFailed', '隐私设置保存失败'))
  }
  finally {
    loading.value = false
  }
}

async function loadSettings() {
  loading.value = true
  try {
    const data = await requestJson<{ settings?: typeof privacySettings.value }>('/api/dashboard/privacy-settings')
    privacySettings.value = { ...privacySettings.value, ...(data.settings ?? {}) }
  }
  catch (error) {
    console.error('Failed to load privacy settings:', error)
  }
  finally {
    loading.value = false
  }
}

async function loadSecuritySettings() {
  securityLoading.value = true
  try {
    const data = await requestJson<{ settings?: { allowCliIpMismatch?: boolean } }>('/api/dashboard/security-settings')
    securitySettings.value.allowCliIpMismatch = data.settings?.allowCliIpMismatch ?? false
  }
  catch (error) {
    console.error('Failed to load security settings:', error)
  }
  finally {
    securityLoading.value = false
  }
}

async function persistSecuritySettings(nextValue: boolean): Promise<boolean> {
  securityLoading.value = true
  try {
    const data = await requestJson<{ settings?: { allowCliIpMismatch?: boolean } }>('/api/dashboard/security-settings', {
      method: 'PATCH',
      body: { allowCliIpMismatch: nextValue },
    })
    securitySettings.value.allowCliIpMismatch = data.settings?.allowCliIpMismatch ?? false
    toast.success(
      t('dashboard.privacy.securitySaved', '安全设置已保存'),
      securitySettings.value.allowCliIpMismatch
        ? t('dashboard.privacy.cliIpMismatchEnabled', 'CLI 跨 IP 授权已开启，请仅在必要时使用。')
        : t('dashboard.privacy.cliIpMismatchDisabled', 'CLI 跨 IP 授权已关闭。'),
    )
    return true
  }
  catch (error) {
    securitySettings.value.allowCliIpMismatch = !nextValue
    console.error('Failed to save security settings:', error)
    toast.error(t('dashboard.privacy.securitySaveFailed', '安全设置保存失败'))
    return false
  }
  finally {
    securityLoading.value = false
  }
}

function closeSecurityConfirm() {
  securityConfirmOpen.value = false
}

async function saveSecuritySettings(nextValue: boolean) {
  if (nextValue) {
    securitySettings.value.allowCliIpMismatch = false
    securityConfirmOpen.value = true
    return
  }

  await persistSecuritySettings(false)
}

function readErrorMessage(errorValue: unknown, fallback: string): string {
  const candidate = errorValue as { data?: { statusMessage?: unknown, message?: unknown }, message?: unknown } | null
  const statusMessage = candidate?.data?.statusMessage
  if (typeof statusMessage === 'string' && statusMessage)
    return statusMessage
  const dataMessage = candidate?.data?.message
  if (typeof dataMessage === 'string' && dataMessage)
    return dataMessage
  const message = candidate?.message
  return typeof message === 'string' && message ? message : fallback
}

function clearExportPollTimer() {
  if (!exportPollTimer.value)
    return
  clearTimeout(exportPollTimer.value)
  exportPollTimer.value = null
}

function triggerExportDownload(url: string) {
  if (!import.meta.client)
    return
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function scheduleExportPoll(jobId: string) {
  clearExportPollTimer()
  exportPollTimer.value = setTimeout(() => {
    void pollPrivacyExportJob(jobId)
  }, 2000)
}

async function pollPrivacyExportJob(jobId: string) {
  if (exportJobId.value !== jobId)
    return

  try {
    const data = await requestJson<PrivacyExportJobStatusResponse>(`/api/dashboard/privacy-export-jobs/${encodeURIComponent(jobId)}`)
    if (exportJobId.value !== jobId)
      return
    exportStatus.value = data.status
    exportDownloadUrl.value = data.downloadUrl ?? exportDownloadUrl.value
    exportError.value = data.error ?? null

    if (data.status === 'succeeded' && data.downloadUrl) {
      clearExportPollTimer()
      triggerExportDownload(data.downloadUrl)
      toast.success(t('dashboard.privacy.exportDownloaded', '导出文件已开始下载'))
      return
    }

    if (data.status === 'failed' || data.status === 'expired') {
      clearExportPollTimer()
      toast.error(t('dashboard.privacy.exportFailed', '导出失败，请稍后重试。'), exportDescription.value)
      return
    }

    scheduleExportPoll(jobId)
  }
  catch (error) {
    exportStatus.value = 'failed'
    exportError.value = readErrorMessage(error, t('dashboard.privacy.exportFailed', '导出失败，请稍后重试。'))
    clearExportPollTimer()
    toast.error(t('dashboard.privacy.exportFailed', '导出失败，请稍后重试。'), exportError.value)
  }
}

async function startPrivacyExport() {
  if (exportStatus.value === 'starting' || exportStatus.value === 'queued' || exportStatus.value === 'running')
    return
  if (exportStatus.value === 'succeeded' && exportDownloadUrl.value) {
    triggerExportDownload(exportDownloadUrl.value)
    return
  }

  exportStatus.value = 'starting'
  exportError.value = null
  exportDownloadUrl.value = null
  clearExportPollTimer()
  try {
    const data = await requestJson<PrivacyExportJobCreateResponse>('/api/dashboard/privacy-export-jobs', {
      method: 'POST',
    })
    exportJobId.value = data.jobId
    exportStatus.value = data.status
    await pollPrivacyExportJob(data.jobId)
  }
  catch (error) {
    exportStatus.value = 'failed'
    exportError.value = readErrorMessage(error, t('dashboard.privacy.exportFailed', '导出失败，请稍后重试。'))
    toast.error(t('dashboard.privacy.exportFailed', '导出失败，请稍后重试。'), exportError.value)
  }
}

function clearDeletionCountdownTimer() {
  if (!deletionCountdownTimer.value)
    return
  clearInterval(deletionCountdownTimer.value)
  deletionCountdownTimer.value = null
}

function updateDeletionCountdown() {
  const earliestConfirmAt = deletionSession.value?.earliestConfirmAt
  if (!earliestConfirmAt) {
    deletionRemainingSeconds.value = 0
    return
  }

  const remainingMs = Date.parse(earliestConfirmAt) - Date.now()
  deletionRemainingSeconds.value = Math.max(0, Math.ceil(remainingMs / 1000))
  if (deletionRemainingSeconds.value <= 0)
    clearDeletionCountdownTimer()
}

function startDeletionCountdown() {
  clearDeletionCountdownTimer()
  updateDeletionCountdown()
  deletionCountdownTimer.value = setInterval(updateDeletionCountdown, 1000)
}

function closeDeletionDialog() {
  if (deletionSubmitting.value)
    return
  deletionDialogOpen.value = false
  clearDeletionCountdownTimer()
}

async function openDeletionDialog() {
  deletionDialogOpen.value = true
  deletionSessionLoading.value = true
  deletionSession.value = null
  deletionConfirmPhrase.value = ''
  deletionError.value = null
  clearDeletionCountdownTimer()

  try {
    deletionSession.value = await requestJson<AccountDeletionTermsSessionResponse>('/api/dashboard/account-deletion/terms-session', {
      method: 'POST',
    })
    startDeletionCountdown()
  }
  catch (error) {
    deletionError.value = readErrorMessage(error, t('dashboard.privacy.deleteTermsLoadFailed', '注销条款会话创建失败，请稍后重试。'))
    toast.error(t('dashboard.privacy.deleteTermsLoadFailed', '注销条款会话创建失败，请稍后重试。'), deletionError.value)
  }
  finally {
    deletionSessionLoading.value = false
  }
}

async function submitDeletion() {
  if (!deletionSession.value || deletionSubmitting.value)
    return

  deletionSubmitting.value = true
  deletionError.value = null
  try {
    await requestJson('/api/dashboard/account-deletion', {
      method: 'POST',
      body: {
        sessionId: deletionSession.value.sessionId,
        confirm: deletionConfirmPhrase.value.trim(),
      },
    })
    toast.success(t('dashboard.privacy.deleteSubmitted', '账号已进入 30 天注销冷静期'))
    await signOut({ callbackUrl: '/sign-in', redirect: true })
  }
  catch (error) {
    const remainingSeconds = (error as { data?: { data?: { remainingSeconds?: unknown } } } | null)?.data?.data?.remainingSeconds
    if (typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds))
      deletionRemainingSeconds.value = Math.max(1, Math.ceil(remainingSeconds))
    deletionError.value = readErrorMessage(error, t('dashboard.privacy.deleteSubmitFailed', '注销提交失败，请稍后重试。'))
    toast.error(t('dashboard.privacy.deleteSubmitFailed', '注销提交失败，请稍后重试。'), deletionError.value)
  }
  finally {
    deletionSubmitting.value = false
  }
}

onMounted(() => {
  loadSettings()
  void loadSecuritySettings()
})

onUnmounted(() => {
  clearExportPollTimer()
  clearDeletionCountdownTimer()
})
</script>

<template>
  <div class="privacy-page space-y-5">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.privacy.title', '隐私设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.privacy.description', '控制您的数据如何被收集和使用') }}
      </p>
    </header>

    <!-- Data Collection Settings -->
    <TxGroupBlock
      :name="t('dashboard.privacy.accountPreferences', '账号隐私偏好')"
      :description="t('dashboard.privacy.accountPreferencesDesc', '保存到您的账号并在已登录设备间同步。')"
      default-icon="i-carbon-data-vis-1"
      active-icon="i-carbon-data-vis-1"
      memory-name="dashboard-privacy-account-preferences"
    >
      <TxBlockSwitch
        v-model="privacySettings.analytics"
        :title="t('dashboard.privacy.analytics', '使用分析')"
        :description="t('dashboard.privacy.analyticsDesc', '帮助我们了解功能使用情况')"
        default-icon="i-carbon-chart-bar"
        active-icon="i-carbon-chart-bar"
        :loading="loading"
        @change="saveSettings"
      />

      <TxBlockSwitch
        v-model="privacySettings.crashReports"
        :title="t('dashboard.privacy.crashReports', '崩溃报告')"
        :description="t('dashboard.privacy.crashReportsDesc', '自动发送崩溃信息以改进稳定性')"
        default-icon="i-carbon-warning"
        active-icon="i-carbon-warning-filled"
        :loading="loading"
        @change="saveSettings"
      />

      <TxBlockSwitch
        v-model="privacySettings.usageData"
        :title="t('dashboard.privacy.usageData', '详细使用数据')"
        :description="t('dashboard.privacy.usageDataDesc', '包含搜索历史和使用习惯（可选）')"
        default-icon="i-carbon-data-vis-1"
        active-icon="i-carbon-data-vis-1"
        :loading="loading"
        @change="saveSettings"
      />

      <TxBlockSwitch
        v-model="privacySettings.personalization"
        :title="t('dashboard.privacy.personalization', '个性化推荐')"
        :description="t('dashboard.privacy.personalizationDesc', '基于使用习惯提供个性化体验')"
        default-icon="i-carbon-user-favorite"
        active-icon="i-carbon-user-favorite"
        :loading="loading"
        @change="saveSettings"
      />
    </TxGroupBlock>

    <!-- Security Settings -->
    <TxGroupBlock
      :name="t('dashboard.privacy.security', '安全设置')"
      :description="t('dashboard.privacy.securityDesc', '管理登录与设备授权相关的安全策略')"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
      memory-name="dashboard-privacy-security"
    >
      <TxBlockSlot
        class="privacy-security-slot"
        default-icon="i-carbon-terminal"
        active-icon="i-carbon-terminal"
        :active="securitySettings.allowCliIpMismatch"
        :disabled="securityLoading"
      >
        <template #label>
          <div class="privacy-slot-label">
            <p class="privacy-slot-title">
              {{ t('dashboard.privacy.allowCliIpMismatch', '允许 CLI 跨 IP 授权') }}
            </p>
            <p class="privacy-slot-desc">
              {{ t('dashboard.privacy.allowCliIpMismatchDesc', '开启后，当 CLI 发起授权的 IP 与浏览器确认授权的 IP 不一致时仍可继续，但授权页会提示风险警告。') }}
            </p>
            <p class="privacy-slot-warning">
              {{ t('dashboard.privacy.allowCliIpMismatchWarning', '请勿随意开启：仅在代理、隧道、远程开发等明确可信场景下临时使用，用完建议关闭。') }}
            </p>
          </div>
        </template>
        <TuffSwitch v-model="securitySettings.allowCliIpMismatch" :disabled="securityLoading || securityConfirmOpen" @change="saveSecuritySettings" />
      </TxBlockSlot>
    </TxGroupBlock>

    <!-- Data Management -->
    <TxGroupBlock
      :name="t('dashboard.privacy.dataManagement', '数据管理')"
      default-icon="i-carbon-cloud-data-ops"
      active-icon="i-carbon-cloud-data-ops"
      memory-name="dashboard-privacy-data-management"
    >
      <TxBlockSwitch
        :model-value="false"
        guidance
        :title="t('dashboard.privacy.exportData', '导出我的数据')"
        :description="exportDescription"
        :default-icon="exportActiveIcon"
        :disabled="exportStatus === 'starting' || exportStatus === 'queued' || exportStatus === 'running'"
        @click="startPrivacyExport"
      />

      <TxBlockSwitch
        class="privacy-danger-row"
        :model-value="false"
        guidance
        :title="t('dashboard.privacy.deleteData', '删除我的数据')"
        :description="t('dashboard.privacy.deleteDataDesc', '进入 30 天注销冷静期；30 天内重新登录会自动取消注销。')"
        default-icon="i-carbon-trash-can"
        active-icon="i-carbon-trash-can"
        @click="openDeletionDialog"
      />
    </TxGroupBlock>

    <!-- Privacy Policy -->
    <TxGroupBlock
      :name="t('dashboard.privacy.learnMore', '了解更多')"
      default-icon="i-carbon-document"
      active-icon="i-carbon-document"
      memory-name="dashboard-privacy-learn-more"
    >
      <NuxtLink to="/protocol" class="privacy-link-row">
        <TxBlockSwitch
          :model-value="false"
          guidance
          :title="t('dashboard.privacy.privacyPolicy', '隐私政策')"
          description=""
          default-icon="i-carbon-policy"
        />
      </NuxtLink>

      <NuxtLink to="/license" class="privacy-link-row">
        <TxBlockSwitch
          :model-value="false"
          guidance
          :title="t('dashboard.privacy.termsOfService', '服务条款')"
          description=""
          default-icon="i-carbon-license"
        />
      </NuxtLink>
    </TxGroupBlock>

    <TxBottomDialog
      v-if="securityConfirmOpen"
      :title="t('dashboard.privacy.allowCliIpMismatch', '允许 CLI 跨 IP 授权')"
      :message="t('dashboard.privacy.cliIpMismatchConfirm', '允许 CLI 跨 IP 授权会降低授权来源校验强度。仅在代理、隧道或远程开发导致 IP 不一致时临时开启，确认继续？')"
      :btns="securityConfirmButtons"
      :close="closeSecurityConfirm"
      icon="i-carbon-warning-filled"
    />

    <Teleport to="body">
      <div
        v-if="deletionDialogOpen"
        class="privacy-deletion-modal"
        role="dialog"
        aria-modal="true"
        @click.self="closeDeletionDialog"
      >
        <section class="privacy-deletion-panel" aria-labelledby="privacy-deletion-title">
          <header class="privacy-deletion-header">
            <div>
              <p class="privacy-deletion-kicker">
                {{ t('dashboard.privacy.deleteTermsKicker', '账号注销条款') }}
              </p>
              <h2 id="privacy-deletion-title" class="privacy-deletion-title">
                {{ t('dashboard.privacy.deleteTermsTitle', '确认注销账号') }}
              </h2>
            </div>
            <TxButton
              variant="bare"
              circle
              size="mini"
              icon="i-carbon-close"
              :disabled="deletionSubmitting"
              :aria-label="t('common.close', '关闭')"
              @click="closeDeletionDialog"
            />
          </header>

          <div class="privacy-deletion-body">
            <p class="privacy-deletion-intro">
              {{ t('dashboard.privacy.deleteTermsIntro', '请完整阅读以下条款。后端会按服务端时间强制校验至少 30 秒阅读时间，前端倒计时仅用于提示。') }}
            </p>

            <div v-if="deletionSessionLoading" class="privacy-deletion-loading">
              <span class="i-ri-loader-4-line animate-spin" aria-hidden="true" />
              <span>{{ t('dashboard.privacy.deleteTermsLoading', '正在创建阅读会话…') }}</span>
            </div>

            <template v-else>
              <div v-if="deletionSession" class="privacy-deletion-meta">
                <span>{{ t('dashboard.privacy.deleteTermsVersion', '条款版本') }}: {{ deletionSession.termsVersion }}</span>
                <span>{{ t('dashboard.privacy.deleteTermsMinRead', '最短阅读') }}: {{ deletionSession.minReadSeconds }}s</span>
              </div>

              <ul class="privacy-deletion-terms">
                <li v-for="term in deletionTerms" :key="term">
                  {{ term }}
                </li>
              </ul>

              <div class="privacy-deletion-countdown" :class="{ 'is-ready': deletionRemainingSeconds <= 0 }">
                <span class="i-carbon-time" aria-hidden="true" />
                <span>{{ deletionCountdownText }}</span>
              </div>

              <label class="privacy-deletion-confirm">
                <span>{{ t('dashboard.privacy.deleteConfirmPhraseLabel', '确认短语') }}</span>
                <input
                  v-model="deletionConfirmPhrase"
                  class="privacy-deletion-input"
                  :placeholder="deletionConfirmPhraseExpected"
                  :disabled="!deletionSession || deletionSubmitting"
                  autocomplete="off"
                >
              </label>

              <p class="privacy-deletion-phrase">
                {{ t('dashboard.privacy.deleteConfirmPhraseHint', '请输入 DELETE_MY_DATA 以确认继续。') }}
              </p>
            </template>

            <p v-if="deletionError" class="privacy-deletion-error">
              {{ deletionError }}
            </p>
          </div>

          <footer class="privacy-deletion-actions">
            <TxButton variant="secondary" :disabled="deletionSubmitting" @click="closeDeletionDialog">
              {{ t('common.cancel', '取消') }}
            </TxButton>
            <TxButton
              variant="danger"
              :disabled="!deletionCanSubmit"
              :loading="deletionSubmitting"
              icon="i-carbon-trash-can"
              @click="submitDeletion"
            >
              {{ deletionSubmitting ? t('dashboard.privacy.deleteSubmitting', '正在提交…') : t('dashboard.privacy.deleteConfirmAction', '确认注销') }}
            </TxButton>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.privacy-page :deep(.tx-group-block) {
  margin-bottom: 0;
}

.privacy-page :deep(.tx-block-slot__description) {
  min-height: 0;
}

.privacy-security-slot {
  min-height: 104px;
  height: auto;
  padding-top: 12px;
  padding-bottom: 12px;
}

.privacy-slot-label {
  min-width: 0;
  padding-right: 16px;
}

.privacy-slot-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.privacy-slot-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-text-color-secondary);
}

.privacy-slot-warning {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--tx-color-warning);
}

.privacy-link-row {
  display: block;
  color: inherit;
  text-decoration: none;
}

.privacy-danger-row {
  --tx-text-color-primary: var(--tx-color-danger);
  --tx-text-color-secondary: var(--tx-color-danger);
}

.privacy-danger-row :deep(.tx-block-slot__title),
.privacy-danger-row :deep(.tx-block-slot__description),
.privacy-danger-row :deep(.tuff-icon),
.privacy-danger-row :deep(.tx-block-switch__guidance) {
  color: var(--tx-color-danger);
}

.privacy-deletion-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 42%);
  backdrop-filter: blur(10px);
}

.privacy-deletion-panel {
  width: min(560px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 12px;
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 24px 80px rgb(0 0 0 / 24%);
}

.privacy-deletion-header,
.privacy-deletion-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
}

.privacy-deletion-header {
  border-bottom: 1px solid var(--tx-border-color-lighter, rgb(0 0 0 / 8%));
}

.privacy-deletion-actions {
  border-top: 1px solid var(--tx-border-color-lighter, rgb(0 0 0 / 8%));
}

.privacy-deletion-kicker {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--tx-color-danger);
}

.privacy-deletion-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.privacy-deletion-body {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
}

.privacy-deletion-intro,
.privacy-deletion-phrase {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tx-text-color-secondary);
}

.privacy-deletion-loading,
.privacy-deletion-countdown {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--tx-fill-color-light, rgb(0 0 0 / 4%));
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
}

.privacy-deletion-countdown.is-ready {
  color: var(--tx-color-success);
}

.privacy-deletion-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.privacy-deletion-meta span {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light, rgb(0 0 0 / 4%));
}

.privacy-deletion-terms {
  display: grid;
  gap: 10px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.privacy-deletion-terms li {
  position: relative;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tx-text-color-primary);
}

.privacy-deletion-terms li::before {
  content: '';
  position: absolute;
  top: 0.74em;
  left: 2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tx-color-danger);
}

.privacy-deletion-confirm {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.privacy-deletion-input {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--tx-border-color, rgb(0 0 0 / 12%));
  border-radius: 8px;
  padding: 0 12px;
  background: var(--tx-bg-color-overlay, #fff);
  color: var(--tx-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  outline: none;
}

.privacy-deletion-input:focus {
  border-color: var(--tx-color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-danger) 16%, transparent);
}

.privacy-deletion-phrase {
  margin-top: 8px;
}

.privacy-deletion-error {
  margin: 14px 0 0;
  color: var(--tx-color-danger);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .privacy-deletion-modal {
    align-items: flex-end;
    padding: 12px;
  }

  .privacy-deletion-panel {
    max-height: calc(100vh - 24px);
  }

  .privacy-deletion-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>

<script setup lang="ts">
import type { DialogButton } from '@talex-touch/tuffex/dialog'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { computed, ref } from 'vue'
import { requestJson } from '~/utils/request'

defineI18nRoute(false)

const { t } = useI18n()
const toast = useToast()

const loading = ref(false)
const securityLoading = ref(false)
const securityConfirmOpen = ref(false)

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

onMounted(() => {
  loadSettings()
  void loadSecuritySettings()
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
        description=""
        default-icon="i-carbon-download"
      />

      <TxBlockSwitch
        class="privacy-danger-row"
        :model-value="false"
        guidance
        :title="t('dashboard.privacy.deleteData', '删除我的数据')"
        description=""
        default-icon="i-carbon-trash-can"
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

.privacy-danger-row :deep(.tx-block-slot__title),
.privacy-danger-row :deep(.tx-block-slot__description),
.privacy-danger-row :deep(.tuff-icon) {
  color: var(--tx-color-danger);
}
</style>

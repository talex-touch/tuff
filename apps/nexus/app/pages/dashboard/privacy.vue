<script setup lang="ts">
import { ref } from 'vue'

defineI18nRoute(false)

const { t } = useI18n()

const loading = ref(false)
const PRIVACY_STORAGE_KEY = 'tuff_privacy_settings'

const privacySettings = ref({
  analytics: true,
  crashReports: true,
  usageData: false,
  personalization: true,
})

async function saveSettings() {
  loading.value = true
  try {
    if (import.meta.client) {
      window.localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(privacySettings.value))
    }
  }
  catch (error) {
    console.error('Failed to save privacy settings:', error)
  }
  finally {
    loading.value = false
  }
}

async function loadSettings() {
  try {
    if (import.meta.client) {
      const raw = window.localStorage.getItem(PRIVACY_STORAGE_KEY)
      if (!raw)
        return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        privacySettings.value = { ...privacySettings.value, ...(parsed as any) }
      }
    }
  }
  catch (error) {
    console.error('Failed to load privacy settings:', error)
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="space-y-8">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.privacy.title', '隐私设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.privacy.description', '控制您的数据如何被收集和使用') }}
      </p>
    </header>

    <!-- Data Collection Settings -->
    <section class="apple-card-lg p-6">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.privacy.dataCollection', '数据收集') }}
      </h2>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.privacy.dataCollectionDesc', '选择您允许我们收集的数据类型') }}
      </p>

      <div class="mt-6 space-y-4">
        <!-- Analytics -->
        <label class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
          <div class="flex items-center gap-3">
            <span class="i-carbon-chart-bar text-xl text-black/70 dark:text-white/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-white">
                {{ t('dashboard.privacy.analytics', '使用分析') }}
              </p>
              <p class="text-xs text-black/60 dark:text-white/60">
                {{ t('dashboard.privacy.analyticsDesc', '帮助我们了解功能使用情况') }}
              </p>
            </div>
          </div>
          <TuffSwitch v-model="privacySettings.analytics" @change="saveSettings" />
        </label>

        <!-- Crash Reports -->
        <label class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
          <div class="flex items-center gap-3">
            <span class="i-carbon-warning text-xl text-black/70 dark:text-white/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-white">
                {{ t('dashboard.privacy.crashReports', '崩溃报告') }}
              </p>
              <p class="text-xs text-black/60 dark:text-white/60">
                {{ t('dashboard.privacy.crashReportsDesc', '自动发送崩溃信息以改进稳定性') }}
              </p>
            </div>
          </div>
          <TuffSwitch v-model="privacySettings.crashReports" @change="saveSettings" />
        </label>

        <!-- Usage Data -->
        <label class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
          <div class="flex items-center gap-3">
            <span class="i-carbon-data-vis-1 text-xl text-black/70 dark:text-white/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-white">
                {{ t('dashboard.privacy.usageData', '详细使用数据') }}
              </p>
              <p class="text-xs text-black/60 dark:text-white/60">
                {{ t('dashboard.privacy.usageDataDesc', '包含搜索历史和使用习惯（可选）') }}
              </p>
            </div>
          </div>
          <TuffSwitch v-model="privacySettings.usageData" @change="saveSettings" />
        </label>

        <!-- Personalization -->
        <label class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
          <div class="flex items-center gap-3">
            <span class="i-carbon-user-favorite text-xl text-black/70 dark:text-white/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-white">
                {{ t('dashboard.privacy.personalization', '个性化推荐') }}
              </p>
              <p class="text-xs text-black/60 dark:text-white/60">
                {{ t('dashboard.privacy.personalizationDesc', '基于使用习惯提供个性化体验') }}
              </p>
            </div>
          </div>
          <TuffSwitch v-model="privacySettings.personalization" @change="saveSettings" />
        </label>
      </div>
    </section>

    <!-- Data Management -->
    <section class="apple-card-lg p-6">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.privacy.dataManagement', '数据管理') }}
      </h2>

      <div class="mt-4 space-y-3">
        <TxButton variant="bare" block native-type="button" class="w-full flex items-center justify-between rounded-2xl bg-black/[0.02] text-left text-sm text-black font-medium transition dark:bg-white/[0.03] hover:bg-black/[0.04] dark:text-white">
          <div class="flex items-center gap-3">
            <span class="i-carbon-download text-lg" />
            {{ t('dashboard.privacy.exportData', '导出我的数据') }}
          </div>
          <span class="i-carbon-arrow-right text-base opacity-50" />
        </TxButton>

        <TxButton variant="bare" block native-type="button" class="w-full flex items-center justify-between rounded-2xl bg-red-500/5 text-left text-sm text-red-600 font-medium transition hover:bg-red-500/10 dark:text-red-400">
          <div class="flex items-center gap-3">
            <span class="i-carbon-trash-can text-lg" />
            {{ t('dashboard.privacy.deleteData', '删除我的数据') }}
          </div>
          <span class="i-carbon-arrow-right text-base opacity-50" />
        </TxButton>
      </div>
    </section>

    <!-- Privacy Policy -->
    <section class="apple-card-lg p-6">
      <h2 class="apple-heading-sm">
        {{ t('dashboard.privacy.learnMore', '了解更多') }}
      </h2>
      <div class="grid grid-cols-1 mt-4 gap-3 text-sm sm:grid-cols-2">
        <NuxtLink
          to="/protocol"
          class="flex items-center justify-between border border-black/[0.06] rounded-2xl bg-black/[0.02] px-4 py-3 text-black font-medium no-underline transition dark:border-white/[0.08] hover:border-black/[0.12] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:text-white"
        >
          {{ t('dashboard.privacy.privacyPolicy', '隐私政策') }}
          <span class="i-carbon-arrow-right text-base" />
        </NuxtLink>
        <NuxtLink
          to="/license"
          class="flex items-center justify-between border border-black/[0.06] rounded-2xl bg-black/[0.02] px-4 py-3 text-black font-medium no-underline transition dark:border-white/[0.08] hover:border-black/[0.12] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:text-white"
        >
          {{ t('dashboard.privacy.termsOfService', '服务条款') }}
          <span class="i-carbon-arrow-right text-base" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

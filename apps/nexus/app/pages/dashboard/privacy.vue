<script setup lang="ts">
import { ref } from 'vue'

defineI18nRoute(false)

const { t } = useI18n()

const loading = ref(false)

interface PrivacySettings {
  analytics: boolean
  crashReports: boolean
  usageData: boolean
  personalization: boolean
}

const privacySettings = ref<PrivacySettings>({
  analytics: true,
  crashReports: true,
  usageData: false,
  personalization: true,
})

type PrivacySettingKey = keyof PrivacySettings

function toggleSetting(key: PrivacySettingKey) {
  if (loading.value)
    return
  privacySettings.value[key] = !privacySettings.value[key]
  saveSettings()
}

async function saveSettings() {
  loading.value = true
  try {
    await $fetch('/api/sync/push', {
      method: 'POST',
      body: {
        items: [
          {
            namespace: 'preferences',
            key: 'privacy',
            value: privacySettings.value,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    })
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
    const items = await $fetch<Array<{ namespace: string, key: string, value: any }>>('/api/sync/pull')
    const item = items.find(entry => entry.namespace === 'preferences' && entry.key === 'privacy')
    if (item?.value) {
      privacySettings.value = { ...privacySettings.value, ...item.value }
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
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.privacy.title', '隐私设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.privacy.description', '控制您的数据如何被收集和使用') }}
      </p>
    </header>

    <!-- Data Collection Settings -->
    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.privacy.dataCollection', '数据收集') }}
      </h2>
      <p class="mt-1 text-sm text-black/60 dark:text-light/60">
        {{ t('dashboard.privacy.dataCollectionDesc', '选择您允许我们收集的数据类型') }}
      </p>

      <div class="mt-6 space-y-4">
        <!-- Analytics -->
        <label
          class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-dark/5 dark:hover:bg-light/5"
          @click="toggleSetting('analytics')"
        >
          <div class="flex items-center gap-3">
            <span class="i-carbon-chart-bar text-xl text-black/70 dark:text-light/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-light">
                {{ t('dashboard.privacy.analytics', '使用分析') }}
              </p>
              <p class="text-xs text-black/60 dark:text-light/60">
                {{ t('dashboard.privacy.analyticsDesc', '帮助我们了解功能使用情况') }}
              </p>
            </div>
          </div>
          <TuffSwitch
            v-model="privacySettings.analytics"
            size="small"
            :disabled="loading"
            @change="saveSettings"
            @click.stop
          />
        </label>

        <!-- Crash Reports -->
        <label
          class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-dark/5 dark:hover:bg-light/5"
          @click="toggleSetting('crashReports')"
        >
          <div class="flex items-center gap-3">
            <span class="i-carbon-warning text-xl text-black/70 dark:text-light/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-light">
                {{ t('dashboard.privacy.crashReports', '崩溃报告') }}
              </p>
              <p class="text-xs text-black/60 dark:text-light/60">
                {{ t('dashboard.privacy.crashReportsDesc', '自动发送崩溃信息以改进稳定性') }}
              </p>
            </div>
          </div>
          <TuffSwitch
            v-model="privacySettings.crashReports"
            size="small"
            :disabled="loading"
            @change="saveSettings"
            @click.stop
          />
        </label>

        <!-- Usage Data -->
        <label
          class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-dark/5 dark:hover:bg-light/5"
          @click="toggleSetting('usageData')"
        >
          <div class="flex items-center gap-3">
            <span class="i-carbon-data-vis-1 text-xl text-black/70 dark:text-light/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-light">
                {{ t('dashboard.privacy.usageData', '详细使用数据') }}
              </p>
              <p class="text-xs text-black/60 dark:text-light/60">
                {{ t('dashboard.privacy.usageDataDesc', '包含搜索历史和使用习惯（可选）') }}
              </p>
            </div>
          </div>
          <TuffSwitch
            v-model="privacySettings.usageData"
            size="small"
            :disabled="loading"
            @change="saveSettings"
            @click.stop
          />
        </label>

        <!-- Personalization -->
        <label
          class="flex cursor-pointer items-center justify-between rounded-2xl p-4 transition hover:bg-dark/5 dark:hover:bg-light/5"
          @click="toggleSetting('personalization')"
        >
          <div class="flex items-center gap-3">
            <span class="i-carbon-user-favorite text-xl text-black/70 dark:text-light/70" />
            <div>
              <p class="text-sm text-black font-medium dark:text-light">
                {{ t('dashboard.privacy.personalization', '个性化推荐') }}
              </p>
              <p class="text-xs text-black/60 dark:text-light/60">
                {{ t('dashboard.privacy.personalizationDesc', '基于使用习惯提供个性化体验') }}
              </p>
            </div>
          </div>
          <TuffSwitch
            v-model="privacySettings.personalization"
            size="small"
            :disabled="loading"
            @change="saveSettings"
            @click.stop
          />
        </label>
      </div>
    </section>

    <!-- Data Management -->
    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.privacy.dataManagement', '数据管理') }}
      </h2>

      <div class="mt-4 space-y-3">
        <button
          class="w-full flex items-center justify-between border border-primary/15 rounded-2xl bg-dark/5 px-4 py-3 text-left text-sm text-black font-medium transition dark:border-light/15 hover:border-primary/30 dark:bg-light/10 hover:bg-light/5 dark:text-light"
        >
          <div class="flex items-center gap-3">
            <span class="i-carbon-download text-lg" />
            {{ t('dashboard.privacy.exportData', '导出我的数据') }}
          </div>
          <span class="i-carbon-arrow-right text-base opacity-50" />
        </button>

        <button
          class="w-full flex items-center justify-between border border-red-500/20 rounded-2xl bg-red-500/5 px-4 py-3 text-left text-sm text-red-600 font-medium transition hover:border-red-500/40 hover:bg-red-500/10 dark:text-red-400"
        >
          <div class="flex items-center gap-3">
            <span class="i-carbon-trash-can text-lg" />
            {{ t('dashboard.privacy.deleteData', '删除我的数据') }}
          </div>
          <span class="i-carbon-arrow-right text-base opacity-50" />
        </button>
      </div>
    </section>

    <!-- Privacy Policy -->
    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.privacy.learnMore', '了解更多') }}
      </h2>
      <div class="grid grid-cols-1 mt-4 gap-3 text-sm sm:grid-cols-2">
        <NuxtLink
          to="/protocol"
          class="flex items-center justify-between border border-primary/15 rounded-2xl bg-dark/5 px-4 py-3 text-black font-medium no-underline transition dark:border-light/15 hover:border-primary/30 dark:bg-light/10 hover:bg-light/5 dark:text-light"
        >
          {{ t('dashboard.privacy.privacyPolicy', '隐私政策') }}
          <span class="i-carbon-arrow-right text-base" />
        </NuxtLink>
        <NuxtLink
          to="/license"
          class="flex items-center justify-between border border-primary/15 rounded-2xl bg-dark/5 px-4 py-3 text-black font-medium no-underline transition dark:border-light/15 hover:border-primary/30 dark:bg-light/10 hover:bg-light/5 dark:text-light"
        >
          {{ t('dashboard.privacy.termsOfService', '服务条款') }}
          <span class="i-carbon-arrow-right text-base" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

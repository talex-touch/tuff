<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { groupedSettingNavigation, type SettingNavItem } from '~/modules/settings/categories'
import { appSetting } from '~/modules/storage/app-storage'

const { t } = useI18n()
const route = useRoute()

const currentCategory = ref(
  (typeof route.query.category === 'string' && route.query.category) || 'overview'
)

watch(
  () => route.query.category,
  (cat) => {
    if (typeof cat === 'string' && cat) {
      currentCategory.value = cat
    }
  }
)
const navGroups = computed(() => groupedSettingNavigation(Boolean(appSetting?.dev?.developerMode)))

const CategoryOverview = defineAsyncComponent(
  () => import('../settings/categories/SettingOverviewPage.vue')
)
const CategoryGeneral = defineAsyncComponent(
  () => import('../settings/categories/SettingGeneralPage.vue')
)
const CategoryAppearance = defineAsyncComponent(
  () => import('../settings/categories/SettingAppearancePage.vue')
)
const CategoryIntelligence = defineAsyncComponent(
  () => import('../settings/categories/SettingIntelligencePage.vue')
)
const CategoryChannels = defineAsyncComponent(
  () => import('../intelligence/IntelligenceChannelsPage.vue')
)
const CategoryVoice = defineAsyncComponent(
  () => import('../intelligence/IntelligenceVoicePage.vue')
)
const CategoryPrompts = defineAsyncComponent(
  () => import('../intelligence/IntelligencePromptsPage.vue')
)
const CategoryAgents = defineAsyncComponent(
  () => import('../intelligence/IntelligenceAgentsPage.vue')
)
const CategoryPlugins = defineAsyncComponent(
  () => import('../settings/categories/SettingPluginsPage.vue')
)
const CategoryFileIndex = defineAsyncComponent(
  () => import('../settings/categories/SettingFileIndexPage.vue')
)
const CategoryUpdate = defineAsyncComponent(
  () => import('../settings/categories/SettingUpdatePage.vue')
)
const CategoryNetwork = defineAsyncComponent(
  () => import('../settings/categories/SettingNetworkPage.vue')
)
const CategoryDownload = defineAsyncComponent(
  () => import('../settings/categories/SettingDownloadPage.vue')
)
const CategoryStorage = defineAsyncComponent(
  () => import('../settings/categories/SettingStoragePage.vue')
)
const CategoryPerformance = defineAsyncComponent(
  () => import('../settings/categories/SettingPerformancePage.vue')
)
const CategoryAbout = defineAsyncComponent(
  () => import('../settings/categories/SettingAboutPage.vue')
)

const categoryComponents: Record<string, unknown> = {
  overview: CategoryOverview,
  general: CategoryGeneral,
  appearance: CategoryAppearance,
  intelligence: CategoryIntelligence,
  'intelligence-channels': CategoryChannels,
  'intelligence-voice': CategoryVoice,
  'intelligence-prompts': CategoryPrompts,
  'intelligence-agents': CategoryAgents,
  plugins: CategoryPlugins,
  'file-index': CategoryFileIndex,
  update: CategoryUpdate,
  network: CategoryNetwork,
  download: CategoryDownload,
  'storage-usage': CategoryStorage,
  performance: CategoryPerformance,
  about: CategoryAbout
}

const activeComponent = computed(
  () => categoryComponents[currentCategory.value] || CategoryOverview
)

function selectCategory(item: SettingNavItem): void {
  currentCategory.value = item.key
}
</script>

<template>
  <div class="flex h-full w-full overflow-hidden text-[var(--tx-text-color-primary)]">
    <!-- 内部设置侧边分类导航 -->
    <aside
      class="flex w-52 flex-none flex-col gap-5 border-r border-[var(--tx-border-color-light)] bg-[var(--tx-fill-color-lighter)]/40 px-3 py-5 overflow-y-auto select-none"
      :aria-label="t('shell.setting')"
    >
      <div v-for="group in navGroups" :key="group.group" class="flex flex-col gap-1">
        <span class="px-2 text-xs font-medium text-[var(--tx-text-color-regular)] tracking-wider">
          {{ t(`settingsNav.group.${group.group}`) }}
        </span>
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors text-left cursor-pointer outline-none"
          :class="
            currentCategory === item.key
              ? 'bg-[var(--tx-color-primary-light-9)] text-[var(--tx-color-primary)] font-semibold shadow-2xs'
              : 'text-[var(--tx-text-color-secondary)] hover:bg-[var(--tx-fill-color-light)] hover:text-[var(--tx-text-color-primary)]'
          "
          @click="selectCategory(item)"
        >
          <span
            class="inline-flex h-4 w-4 flex-none text-sm"
            :class="item.icon"
            aria-hidden="true"
          />
          <span class="truncate">{{ t(item.labelKey) }}</span>
          <span
            v-if="item.beta"
            class="ml-auto rounded-full bg-[var(--tx-color-primary-light-8)] px-1.5 py-0.2 text-[10px] text-[var(--tx-color-primary)]"
          >
            {{ t('settings.platformTags.beta') }}
          </span>
        </button>
      </div>
    </aside>

    <!-- 设置主内容区 -->
    <main class="relative flex-1 min-w-0 h-full overflow-y-auto">
      <KeepAlive>
        <component :is="activeComponent" :key="currentCategory" />
      </KeepAlive>
    </main>
  </div>
</template>

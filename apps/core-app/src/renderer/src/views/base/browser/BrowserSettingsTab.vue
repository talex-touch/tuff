<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { groupedSettingNavigation, type SettingNavItem } from '~/modules/settings/categories'
import { appSetting } from '~/modules/storage/app-storage'
import { themeStyle } from '~/modules/storage/theme-style'

const { t } = useI18n()
const route = useRoute()
const mainRef = ref<HTMLElement | null>(null)
const paneDirection = ref<'down' | 'up'>('down')

const currentCategory = ref(
  (typeof route.query.category === 'string' && route.query.category) || 'overview'
)

const navGroups = computed(() => groupedSettingNavigation(Boolean(appSetting?.dev?.developerMode)))
const navOrder = computed(() =>
  navGroups.value.flatMap((group) => group.items.map((item) => item.key))
)

function switchCategory(nextKey: string): void {
  if (!nextKey || nextKey === currentCategory.value) return
  const prevIndex = navOrder.value.indexOf(currentCategory.value)
  const nextIndex = navOrder.value.indexOf(nextKey)
  if (prevIndex >= 0 && nextIndex >= 0) {
    paneDirection.value = nextIndex < prevIndex ? 'up' : 'down'
  }
  currentCategory.value = nextKey
}

watch(
  () => route.query.category,
  (cat) => {
    if (typeof cat === 'string' && cat) {
      switchCategory(cat)
    }
  }
)

const paneTransitionName = computed(() => {
  const style = themeStyle.value?.theme?.transition?.route ?? 'slide'
  if (style === 'fade') return 'settings-pane-fade'
  if (style === 'zoom') return 'settings-pane-zoom'
  return paneDirection.value === 'up' ? 'settings-pane-up' : 'settings-pane-down'
})

function resetMainScroll(): void {
  if (mainRef.value) mainRef.value.scrollTop = 0
}

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
  switchCategory(item.key)
}
</script>

<template>
  <div class="flex h-full w-full overflow-hidden text-[var(--tx-text-color-primary)]">
    <!-- 内部设置侧边分类导航 -->
    <aside class="BrowserSettingsTab-Aside select-none" :aria-label="t('shell.setting')">
      <div v-for="group in navGroups" :key="group.group" class="BrowserSettingsTab-Group">
        <span class="BrowserSettingsTab-GroupLabel">
          {{ t(`settingsNav.group.${group.group}`) }}
        </span>
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          class="BrowserSettingsTab-NavItem"
          :class="{ 'is-active': currentCategory === item.key }"
          :aria-current="currentCategory === item.key ? 'page' : undefined"
          @click="selectCategory(item)"
        >
          <span class="BrowserSettingsTab-NavIcon" :class="item.icon" aria-hidden="true" />
          <span class="truncate">{{ t(item.labelKey) }}</span>
          <span v-if="item.beta" class="BrowserSettingsTab-Badge">
            {{ t('settings.platformTags.beta') }}
          </span>
        </button>
      </div>
    </aside>

    <!-- 设置主内容区 -->
    <main ref="mainRef" class="relative flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden">
      <Transition :name="paneTransitionName" mode="out-in" @before-enter="resetMainScroll">
        <KeepAlive>
          <component :is="activeComponent" :key="currentCategory" />
        </KeepAlive>
      </Transition>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.BrowserSettingsTab-Aside {
  display: flex;
  flex: 0 0 220px;
  flex-direction: column;
  gap: 16px;
  width: 220px;
  padding: 16px 12px 20px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  border-right: 1px solid var(--shell-border, var(--tx-border-color-light));
  background: color-mix(in srgb, var(--tx-fill-color-lighter) 45%, transparent);
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 2px;
  }

  &:hover {
    scrollbar-color: var(--shell-border-strong, var(--tx-border-color)) transparent;

    &::-webkit-scrollbar-thumb {
      background: var(--shell-border-strong, var(--tx-border-color));
    }
  }
}

.BrowserSettingsTab-Group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.BrowserSettingsTab-GroupLabel {
  padding: 0 10px 4px;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-caption, 11px);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.04em;
}

.BrowserSettingsTab-NavItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--shell-radius-md, 10px);
  background: transparent;
  color: var(--shell-text-regular, var(--tx-text-color-regular));
  font-family: inherit;
  font-size: var(--shell-fs-body, 13px);
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  outline: none;

  @supports (corner-shape: superellipse(2)) {
    border-radius: calc(var(--shell-radius-md, 10px) * var(--tx-corner-smooth-scale, 1.6));
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }

  &:hover:not(.is-active) {
    background: var(--shell-surface-2, var(--tx-fill-color-light));
    color: var(--shell-text-primary, var(--tx-text-color-primary));
  }

  &.is-active {
    background: var(--shell-primary-soft, var(--tx-color-primary-light-9));
    color: var(--shell-primary, var(--tx-color-primary));
    font-weight: 500;
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.BrowserSettingsTab-NavIcon {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  font-size: 16px;
  opacity: 0.85;

  .BrowserSettingsTab-NavItem:hover &,
  .BrowserSettingsTab-NavItem.is-active & {
    opacity: 1;
  }
}

.BrowserSettingsTab-Badge {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--tx-color-primary-light-8);
  color: var(--tx-color-primary);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
}

.settings-pane-down-enter-active,
.settings-pane-up-enter-active,
.settings-pane-fade-enter-active,
.settings-pane-zoom-enter-active {
  transition:
    opacity 170ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 190ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  will-change: opacity, transform;
}

.settings-pane-down-leave-active,
.settings-pane-up-leave-active,
.settings-pane-fade-leave-active,
.settings-pane-zoom-leave-active {
  transition:
    opacity 110ms ease,
    transform 110ms ease;
  will-change: opacity, transform;
}

.settings-pane-down-enter-from {
  opacity: 0;
  transform: translate3d(0, 12px, 0);
}

.settings-pane-down-leave-to {
  opacity: 0;
  transform: translate3d(0, -8px, 0);
}

.settings-pane-up-enter-from {
  opacity: 0;
  transform: translate3d(0, -12px, 0);
}

.settings-pane-up-leave-to {
  opacity: 0;
  transform: translate3d(0, 8px, 0);
}

.settings-pane-fade-enter-from,
.settings-pane-fade-leave-to {
  opacity: 0;
}

.settings-pane-zoom-enter-from {
  opacity: 0;
  transform: scale(0.988);
}

.settings-pane-zoom-leave-to {
  opacity: 0;
  transform: scale(1.01);
}

@media (prefers-reduced-motion: reduce) {
  .settings-pane-down-enter-active,
  .settings-pane-down-leave-active,
  .settings-pane-up-enter-active,
  .settings-pane-up-leave-active,
  .settings-pane-fade-enter-active,
  .settings-pane-fade-leave-active,
  .settings-pane-zoom-enter-active,
  .settings-pane-zoom-leave-active {
    transition: none;
  }
}
</style>

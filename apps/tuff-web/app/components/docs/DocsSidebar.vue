<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import {
  getCachedDocsNavigation,
  loadDocsNavigation,
  type DocsSectionKey,
  type TuffWebLocaleNavigation,
} from '~/composables/useDocsNavigation'
import { prefetchDocPage } from '~/composables/useWebCurrentDoc'
import { parseDocsRoute, type SupportedLocale } from '~/utils/web-route'

const route = useRoute()
const { t } = useI18n()

const parsedRoute = computed(() => parseDocsRoute(route.path))
const docsLocale = computed<SupportedLocale>(() => parsedRoute.value.locale)
const isZh = computed(() => docsLocale.value === 'zh')
const activeSlug = computed(() => parsedRoute.value.slug)

const activeSectionKey = computed<DocsSectionKey>(() => (
  parsedRoute.value.section === 'guide' ? 'guide' : 'dev'
))

const navigation = shallowRef<TuffWebLocaleNavigation | null>(
  getCachedDocsNavigation(docsLocale.value),
)

const collapsedGroups = ref<Record<string, boolean>>({})

async function ensureNavigationLoaded(locale: SupportedLocale) {
  navigation.value = await loadDocsNavigation(locale)
}

watch(
  docsLocale,
  (nextLocale, prevLocale) => {
    if (nextLocale !== prevLocale)
      void ensureNavigationLoaded(nextLocale)
  },
)

if (!navigation.value)
  await ensureNavigationLoaded(docsLocale.value)

const currentSection = computed(() => {
  const sections = navigation.value?.sections ?? []
  return sections.find(s => s.key === activeSectionKey.value) ?? sections[0] ?? null
})

function isGroupExpanded(groupKey: string) {
  return !collapsedGroups.value[groupKey]
}

function toggleGroup(groupKey: string) {
  collapsedGroups.value = {
    ...collapsedGroups.value,
    [groupKey]: !collapsedGroups.value[groupKey],
  }
}

function isItemActive(slug: string) {
  return activeSlug.value === slug
}

const sectionTabs = computed(() => [
  {
    key: 'guide' as const,
    label: t('nav.tutorial', isZh.value ? '使用指南' : 'Guide'),
    to: `/${docsLocale.value}/docs/guide/start`,
    slug: 'guide/start',
    icon: 'i-carbon-book',
  },
  {
    key: 'dev' as const,
    label: t('nav.developer', isZh.value ? '开发文档' : 'Developer'),
    to: `/${docsLocale.value}/docs/dev`,
    slug: 'dev',
    icon: 'i-carbon-code',
  },
])

const tuffexHref = computed(() => `/tuffex/${docsLocale.value}`)
</script>

<template>
  <nav class="web-sidebar" :aria-label="isZh ? '文档导航' : 'Documentation navigation'">
    <div class="web-sidebar__tabs">
      <NuxtLink
        v-for="tab in sectionTabs"
        :key="tab.key"
        :to="tab.to"
        class="web-sidebar__tab"
        :class="{ 'is-active': activeSectionKey === tab.key }"
        @pointerenter="prefetchDocPage(docsLocale, tab.slug)"
        @focus="prefetchDocPage(docsLocale, tab.slug)"
      >
        <span :class="tab.icon" aria-hidden="true" />
        <span>{{ tab.label }}</span>
      </NuxtLink>
    </div>

    <div v-if="currentSection" class="web-sidebar__body">
      <ul v-if="currentSection.standalone.length" class="web-sidebar__list web-sidebar__list--root">
        <li v-for="item in currentSection.standalone" :key="item.path">
          <NuxtLink
            :to="item.path"
            class="web-sidebar__link"
            :class="{ 'is-active': isItemActive(item.slug) }"
            :aria-current="isItemActive(item.slug) ? 'page' : undefined"
            @pointerenter="prefetchDocPage(docsLocale, item.slug)"
            @focus="prefetchDocPage(docsLocale, item.slug)"
          >
            <span>{{ item.title }}</span>
          </NuxtLink>
        </li>
      </ul>

      <section
        v-for="group in currentSection.groups"
        :key="group.key"
        class="web-sidebar__group"
      >
        <button
          type="button"
          class="web-sidebar__group-btn"
          :aria-expanded="isGroupExpanded(group.key)"
          @click="toggleGroup(group.key)"
        >
          <span>{{ group.title }}</span>
          <span
            class="i-carbon-chevron-down web-sidebar__chevron"
            :class="{ 'is-collapsed': !isGroupExpanded(group.key) }"
            aria-hidden="true"
          />
        </button>

        <ul v-show="isGroupExpanded(group.key)" class="web-sidebar__list">
          <li v-for="item in group.items" :key="item.path">
            <NuxtLink
              :to="item.path"
              class="web-sidebar__link"
              :class="{ 'is-active': isItemActive(item.slug) }"
              :aria-current="isItemActive(item.slug) ? 'page' : undefined"
              @pointerenter="prefetchDocPage(docsLocale, item.slug)"
              @focus="prefetchDocPage(docsLocale, item.slug)"
            >
              <span>{{ item.title }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>

    <div class="web-sidebar__footer">
      <a :href="tuffexHref" class="web-sidebar__external">
        <span class="i-carbon-cube" aria-hidden="true" />
        <span>{{ isZh ? 'TuffEx 组件库文档' : 'TuffEx UI Components' }}</span>
        <span class="i-carbon-arrow-up-right ml-auto" aria-hidden="true" />
      </a>
    </div>
  </nav>
</template>

<style scoped>
.web-sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
}

.web-sidebar__tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: 12px;
  background: var(--docs-surface-subtle, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--docs-border-light, #ebeef5);
}

.web-sidebar__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  border-radius: 9px;
  color: var(--docs-muted);
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
}

.web-sidebar__tab:hover {
  color: var(--docs-ink);
}

.web-sidebar__tab.is-active {
  background: var(--docs-surface, #ffffff);
  box-shadow: inset 0 0 0 1px var(--docs-border-light, #ebeef5);
  color: var(--docs-ink);
  font-weight: 600;
}

.web-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.web-sidebar__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.web-sidebar__group-btn {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--docs-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.web-sidebar__group-btn:hover {
  background: var(--docs-surface-subtle);
}

.web-sidebar__chevron {
  font-size: 13px;
  color: var(--docs-muted);
  transition: transform 160ms ease;
}

.web-sidebar__chevron.is-collapsed {
  transform: rotate(-90deg);
}

.web-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.web-sidebar__link {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--docs-muted);
  font-size: 13px;
  line-height: 1.4;
  text-decoration: none;
}

.web-sidebar__link:hover {
  background: var(--docs-surface-subtle);
  color: var(--docs-ink);
}

.web-sidebar__link.is-active {
  background: color-mix(in srgb, var(--docs-accent, #409eff) 11%, transparent);
  color: var(--docs-accent, #409eff);
  font-weight: 600;
}

.web-sidebar__footer {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--docs-border-light);
}

.web-sidebar__external {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink-regular);
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: none;
}

.web-sidebar__external:hover {
  color: var(--docs-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--docs-accent) 40%, transparent);
}
</style>

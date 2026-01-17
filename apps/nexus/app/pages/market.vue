<script setup lang="ts">
import type {
  FilterCategory,
  MarketplacePluginDetail,
  MarketplacePluginSummary,
} from '~/types/marketplace'
import { computed, reactive, ref } from 'vue'
import MarketItem from '~/components/market/MarketItem.vue'
import MarketSearch from '~/components/market/MarketSearch.vue'
import Button from '~/components/ui/Button.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import Modal from '~/components/ui/Modal.vue'
import StatusBadge from '~/components/ui/StatusBadge.vue'
import Tag from '~/components/ui/Tag.vue'
import { useMarketCategories } from '~/composables/useMarketCategories'
import { useMarketFormatters } from '~/composables/useMarketFormatters'

definePageMeta({
  layout: 'marketplace',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()

const filters = reactive({
  search: '',
  category: 'all' as FilterCategory,
})

const selectedSlug = ref<string | null>(null)
const selectedPlugin = ref<MarketplacePluginDetail | null>(null)
const detailPending = ref(false)
const detailError = ref<string | null>(null)

const {
  data: pluginsPayload,
  pending: pluginsPending,
} = await useAsyncData('market-plugins', () =>
  $fetch<{ plugins: MarketplacePluginSummary[] }>('/api/market/plugins'))

const { resolveCategoryLabel, matchesCategory } = useMarketCategories()
const { formatDate, formatInstalls, formatPackageSize } = useMarketFormatters()

const allPlugins = computed(() => (pluginsPayload.value?.plugins ?? []).filter(plugin => plugin.latestVersion))

const totalPlugins = computed(() => allPlugins.value.length)

const normalizedSearch = computed(() => filters.search.trim().toLowerCase())

async function openPluginDetail(plugin: MarketplacePluginSummary) {
  selectedSlug.value = plugin.slug
  selectedPlugin.value = null
  detailPending.value = true
  detailError.value = null
  try {
    const response = await $fetch<{ plugin: MarketplacePluginDetail }>(`/api/market/plugins/${plugin.slug}`)
    selectedPlugin.value = response.plugin
  }
  catch (error: unknown) {
    detailError.value = error instanceof Error ? error.message : t('market.detail.error', 'Unable to load plugin details.')
  }
  finally {
    detailPending.value = false
  }
}

function closePluginDetail() {
  selectedSlug.value = null
  selectedPlugin.value = null
  detailError.value = null
}

function openExternal(url: string) {
  if (import.meta.client)
    window.open(url, '_blank', 'noopener')
}

const filteredPlugins = computed(() => {
  const query = normalizedSearch.value

  return allPlugins.value.filter((plugin) => {
    if (!matchesCategory(plugin.category, filters.category))
      return false

    if (!query.length)
      return true

    const categoryLabel = resolveCategoryLabel(plugin.category)
    const haystack = [
      plugin.name,
      plugin.summary,
      plugin.latestVersion?.version ?? '',
      plugin.latestVersion?.channel ?? '',
      plugin.author?.name ?? '',
      categoryLabel,
      plugin.badges.join(' '),
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

const hasResults = computed(() => filteredPlugins.value.length > 0)
const hasPlugins = computed(() => totalPlugins.value > 0)

const resultSummary = computed(() => {
  const total = totalPlugins.value
  const count = filteredPlugins.value.length

  if (!total)
    return t('market.results.none')

  if (count === total)
    return t('market.results.count', { count })

  return t('market.results.filtered', { count, total })
})

const pageTitle = computed(() => `${t('nav.market')} · Tuff Nexus`)
const pageDescription = computed(() => t('market.hero.subtitle'))

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: pageDescription,
  ogDescription: pageDescription,
})
</script>

<template>
  <section class="relative mx-auto max-w-6xl w-full flex flex-col gap-8 px-24 py-20 lg:px-12 sm:px-6">
    <MarketSearch v-model:filter="filters.category" v-model="filters.search" class="w-full">
      <template #result>
        {{ resultSummary }}
      </template>
    </MarketSearch>

    <div
      v-if="pluginsPending"
      class="flex items-center justify-center gap-3 border border-primary/20 rounded-3xl border-dashed bg-dark/5 px-6 py-12 text-sm text-black/70 dark:border-light/20 dark:bg-light/5 dark:text-light/70"
    >
      <span class="i-carbon-circle-dash animate-spin text-base" aria-hidden="true" />
      <span>{{ t('dashboard.sections.plugins.loading') }}</span>
    </div>

    <div v-else>
      <div
        v-if="!hasPlugins"
        class="border border-primary/10 rounded-3xl bg-white/80 px-6 py-12 text-center text-sm text-black/70 shadow-sm dark:border-light/15 dark:bg-dark/30 dark:text-light/80"
      >
        {{ t('market.results.none') }}
      </div>
      <div
        v-else-if="!hasResults"
        class="border border-primary/10 rounded-3xl bg-white/80 px-6 py-12 text-center text-sm text-black/70 shadow-sm dark:border-light/15 dark:bg-dark/30 dark:text-light/80"
      >
        {{ t('market.results.empty') }}
      </div>
      <div
        v-else
        class="grid gap-4 md:grid-cols-1 xl:grid-cols-2"
      >
        <MarketItem
          v-for="plugin in filteredPlugins"
          :key="plugin.id"
          :plugin="plugin"
          @view-detail="openPluginDetail"
        />
      </div>
    </div>
    <Modal
      :model-value="Boolean(selectedSlug)"
      width="860px"
      @update:model-value="(v) => {
        if (!v)
          closePluginDetail()
      }"
      @close="closePluginDetail"
    >
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-black dark:text-light">
              {{ t('market.detail.title', 'Plugin Details') }}
            </h2>
            <p class="text-xs text-black/50 dark:text-light/60">
              {{ selectedPlugin?.name || '' }}
            </p>
          </div>
          <FlatButton @click="closePluginDetail">
            <span class="i-carbon-close text-lg" aria-hidden="true" />
          </FlatButton>
        </div>
      </template>
      <div v-if="detailPending" class="flex items-center justify-center gap-3 py-16 text-sm text-black/70 dark:text-light/70">
        <span class="i-carbon-circle-dash animate-spin text-base" aria-hidden="true" />
        <span>{{ t('market.detail.loading') }}</span>
      </div>
      <div v-else-if="detailError" class="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
        {{ detailError }}
      </div>
      <div v-else-if="selectedPlugin" class="space-y-6">
        <header class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-2xl text-black font-semibold dark:text-light">
              {{ selectedPlugin.name }}
            </h2>
            <Tag :label="resolveCategoryLabel(selectedPlugin.category)" size="sm" icon="i-carbon-tag" />
            <Tag
              v-if="selectedPlugin.isOfficial"
              :label="t('market.badges.official')"
              size="sm"
              icon="i-carbon-certificate"
            />
          </div>
          <p class="text-sm text-black/70 dark:text-light/80">
            {{ selectedPlugin.summary }}
          </p>
          <p
            v-if="selectedPlugin.author?.name"
            class="text-xs text-black/50 dark:text-light/60"
          >
            {{ t('market.detail.author', { name: selectedPlugin.author.name }) }}
          </p>
          <div class="flex flex-wrap gap-2 text-xs text-black/60 dark:text-light/60">
            <Tag :label="t('dashboard.sections.plugins.stats.installs', { count: formatInstalls(selectedPlugin.installs) })" size="sm" icon="i-carbon-user-multiple" />
            <Tag
              v-if="selectedPlugin.latestVersion"
              :label="`v${selectedPlugin.latestVersion.version}`"
              size="sm"
              icon="i-carbon-cube"
            />
            <Tag
              v-if="selectedPlugin.latestVersion"
              :label="formatDate(selectedPlugin.latestVersion.createdAt)"
              size="sm"
              icon="i-carbon-time"
            />
          </div>
          <div
            v-if="selectedPlugin.badges?.length"
            class="flex flex-wrap gap-2"
          >
            <Tag v-for="badge in selectedPlugin.badges" :key="badge" :label="badge" size="sm" icon="i-carbon-tag" />
          </div>
        </header>

        <section>
          <h3 class="text-sm text-black/70 font-semibold tracking-wide uppercase dark:text-light/70">
            {{ t('market.detail.readme') }}
          </h3>
          <div v-if="selectedPlugin.readmeMarkdown" class="mt-3 max-w-none prose prose-sm dark:prose-invert">
            <ContentRendererMarkdown :value="selectedPlugin.readmeMarkdown" />
          </div>
          <p v-else class="mt-3 text-sm text-black/60 dark:text-light/60">
            {{ t('market.detail.noReadme') }}
          </p>
        </section>

        <section>
          <h3 class="text-sm text-black/70 font-semibold tracking-wide uppercase dark:text-light/70">
            {{ t('market.detail.versions') }}
          </h3>
          <div
            v-if="selectedPlugin.versions?.length"
            class="mt-3 space-y-3"
          >
            <article
              v-for="version in selectedPlugin.versions"
              :key="version.id"
              class="border border-primary/10 rounded-2xl bg-white/80 p-4 text-sm text-black/70 dark:border-light/20 dark:bg-dark/70 dark:text-light/80"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-black font-semibold dark:text-light">
                  <span>v{{ version.version }}</span>
                  <StatusBadge :text="version.channel" status="info" size="sm" />
                </div>
                <span class="text-xs text-black/50 dark:text-light/60">
                  {{ formatDate(version.createdAt) }} · {{ formatPackageSize(version.packageSize) }}
                </span>
              </div>
              <p v-if="version.changelog" class="mt-2 text-sm text-black/70 leading-relaxed dark:text-light/70">
                {{ version.changelog }}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Button size="small" @click="openExternal(version.packageUrl)">
                  <span class="i-carbon-download text-sm" aria-hidden="true" />
                  {{ t('market.detail.download') }}
                </Button>
                <Tag :label="`${version.signature.slice(0, 12)}…`" size="sm" icon="i-carbon-hash" />
              </div>
            </article>
          </div>
          <p v-else class="mt-3 text-sm text-black/60 dark:text-light/60">
            {{ t('market.detail.noVersions') }}
          </p>
        </section>
      </div>
    </Modal>
  </section>
</template>

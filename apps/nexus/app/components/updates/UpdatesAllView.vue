<script setup lang="ts">
import { computed, ref } from 'vue'

interface LocalizedText {
  zh: string
  en: string
}

interface DashboardUpdate {
  id: string
  type: 'news' | 'release' | 'announcement' | 'config' | 'data'
  scope: 'web' | 'system' | 'both'
  channels: string[]
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
}

type UpdateTypeFilter = 'all' | DashboardUpdate['type']
type TimeFilter = 'all' | '7d' | '30d' | '90d' | '365d'

const props = defineProps<{
  updates: DashboardUpdate[]
}>()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const updateTypeFilters: UpdateTypeFilter[] = ['all', 'news', 'release', 'announcement', 'config', 'data']
const timeFilters: TimeFilter[] = ['all', '7d', '30d', '90d', '365d']

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeUpdateTypeFilter(value: unknown): UpdateTypeFilter {
  const raw = firstQueryValue(value)
  return typeof raw === 'string' && updateTypeFilters.includes(raw as UpdateTypeFilter)
    ? raw as UpdateTypeFilter
    : 'all'
}

function normalizeTimeFilter(value: unknown): TimeFilter {
  const raw = firstQueryValue(value)
  return typeof raw === 'string' && timeFilters.includes(raw as TimeFilter)
    ? raw as TimeFilter
    : 'all'
}

const selectedType = ref<UpdateTypeFilter>(normalizeUpdateTypeFilter(route.query.type))
const selectedTime = ref<TimeFilter>(normalizeTimeFilter(route.query.time))
const searchQuery = ref(typeof firstQueryValue(route.query.q) === 'string' ? firstQueryValue(route.query.q) as string : '')

const isZh = computed(() => locale.value.startsWith('zh'))
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
const UPDATE_NEWS_TAG_COLOR = 'var(--tx-text-color-secondary)'

const updateItems = computed<DashboardUpdate[]>(() => props.updates ?? [])

const typeOptions = computed(() => updateTypeFilters.map(type => ({
  value: type,
  label: type === 'all' ? t('updates.all.filters.typeAll') : updateTypeLabelByType(type),
})))

const timeOptions = computed(() => timeFilters.map(time => ({
  value: time,
  label: t(`updates.all.filters.time.${time}`),
})))

const filteredUpdates = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return updateItems.value
    .filter(update => selectedType.value === 'all' || update.type === selectedType.value)
    .filter(update => matchesTimeFilter(update.timestamp))
    .filter(update => matchesSearchQuery(update, query))
    .slice()
    .sort((a, b) => getTimestamp(b.timestamp) - getTimestamp(a.timestamp))
})

const hasActiveFilters = computed(() => {
  return selectedType.value !== 'all' || selectedTime.value !== 'all' || searchQuery.value.trim().length > 0
})

const resultCountLabel = computed(() => t('updates.all.resultCount', { count: filteredUpdates.value.length }))

function resolveUpdateText(text: LocalizedText) {
  if (isZh.value)
    return text.zh || text.en
  return text.en || text.zh
}

function getTimestamp(dateString: string) {
  const parsed = new Date(dateString).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function formatReleaseDate(dateString: string) {
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return t('updates.latest.releaseDateFallback')
  return dateFormatter.value.format(parsed)
}

function timeFilterDays(filter: TimeFilter) {
  if (filter === '7d')
    return 7
  if (filter === '30d')
    return 30
  if (filter === '90d')
    return 90
  if (filter === '365d')
    return 365
  return null
}

function matchesTimeFilter(timestamp: string) {
  const days = timeFilterDays(selectedTime.value)
  if (!days)
    return true

  const parsed = getTimestamp(timestamp)
  if (!parsed)
    return false

  return parsed >= Date.now() - days * 24 * 60 * 60 * 1000
}

function matchesSearchQuery(update: DashboardUpdate, query: string) {
  if (!query)
    return true

  const haystack = [
    update.title.zh,
    update.title.en,
    update.summary.zh,
    update.summary.en,
    update.releaseTag ?? '',
    update.type,
    ...update.tags,
  ].join(' ').toLowerCase()

  return haystack.includes(query)
}

function updateTypeLabelByType(type: UpdateTypeFilter) {
  if (type === 'release')
    return t('updates.news.typeRelease')
  if (type === 'announcement')
    return t('updates.news.typeAnnouncement')
  if (type === 'config')
    return t('updates.news.typeConfig')
  if (type === 'data')
    return t('updates.news.typeData')
  if (type === 'news')
    return t('updates.news.typeNews')
  return t('updates.all.filters.typeAll')
}

function updateTypeLabel(update: DashboardUpdate) {
  return updateTypeLabelByType(update.type)
}

function updateTypeIcon(type: DashboardUpdate['type']) {
  if (type === 'release')
    return 'i-carbon-version-major'
  if (type === 'announcement')
    return 'i-carbon-bullhorn'
  if (type === 'config')
    return 'i-carbon-settings'
  if (type === 'data')
    return 'i-carbon-data-table'
  return 'i-carbon-notification'
}

function updateTypeTagColor(type: DashboardUpdate['type']) {
  if (type === 'release')
    return 'var(--tx-color-primary)'
  if (type === 'announcement')
    return 'var(--tx-color-warning)'
  if (type === 'config')
    return 'var(--tx-color-success)'
  if (type === 'data')
    return 'var(--tx-color-primary)'
  return UPDATE_NEWS_TAG_COLOR
}

function openUpdateLink(link?: string) {
  if (!link)
    return
  if (/^https?:\/\//i.test(link)) {
    if (import.meta.client)
      window.open(link, '_blank', 'noopener')
    return
  }
  router.push(link)
}

function resetFilters() {
  selectedType.value = 'all'
  selectedTime.value = 'all'
  searchQuery.value = ''
}
</script>

<template>
  <main class="UpdatesAllPage min-h-screen bg-white text-gray-900 dark:bg-[#05050a] dark:text-white">
    <section class="mx-auto max-w-5xl w-full px-6 py-14 md:px-10 lg:py-18">
      <NuxtLink to="/updates" class="UpdatesAllBackLink">
        <span class="i-carbon-arrow-left text-base" />
        <span>{{ t('updates.all.back') }}</span>
      </NuxtLink>

      <header class="UpdatesAllHeader">
        <div>
          <p class="UpdatesAllEyebrow">
            {{ t('updates.news.latestHint') }}
          </p>
          <h1 class="UpdatesAllTitle">
            {{ t('updates.all.title') }}
          </h1>
          <p class="UpdatesAllSubtitle">
            {{ t('updates.all.subtitle') }}
          </p>
        </div>
        <TxTag :label="resultCountLabel" color="var(--tx-color-primary)" />
      </header>

      <section class="UpdatesAllFilters" :aria-label="t('updates.all.filters.label')">
        <TxSearchInput
          v-model="searchQuery"
          class="UpdatesAllSearch"
          :placeholder="t('updates.all.filters.searchPlaceholder')"
        />

        <TuffSelect v-model="selectedType" class="UpdatesAllSelect" :placeholder="t('updates.all.filters.type')">
          <TuffSelectItem
            v-for="option in typeOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </TuffSelect>

        <TuffSelect v-model="selectedTime" class="UpdatesAllSelect" :placeholder="t('updates.all.filters.timeLabel')">
          <TuffSelectItem
            v-for="option in timeOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </TuffSelect>

        <TxButton
          v-if="hasActiveFilters"
          variant="bare"
          native-type="button"
          class="UpdatesAllReset"
          @click="resetFilters"
        >
          <span class="i-carbon-reset text-sm" />
          <span>{{ t('updates.all.filters.reset') }}</span>
        </TxButton>
      </section>

      <div v-if="filteredUpdates.length > 0" class="UpdatesAllList">
        <TxCardItem
          v-for="update in filteredUpdates"
          :key="update.id"
          class="UpdatesAllItem"
          :title="resolveUpdateText(update.title)"
          :icon-class="updateTypeIcon(update.type)"
          :role="update.link ? 'link' : 'article'"
          :clickable="Boolean(update.link)"
          @click="openUpdateLink(update.link)"
        >
          <template #subtitle>
            <div class="UpdatesAllMeta">
              <span>{{ formatReleaseDate(update.timestamp) }}</span>
              <TxTag size="sm" :label="updateTypeLabel(update)" :color="updateTypeTagColor(update.type)" />
              <TxTag
                v-for="tag in update.tags.slice(0, 3)"
                :key="tag"
                size="sm"
                :label="tag"
                :color="UPDATE_NEWS_TAG_COLOR"
              />
            </div>
          </template>

          <template #description>
            <p class="UpdatesAllSummary">
              {{ resolveUpdateText(update.summary) }}
            </p>
          </template>
        </TxCardItem>
      </div>

      <TxNoData
        v-else
        class="UpdatesAllEmpty"
        :title="t('updates.all.empty')"
        :description="t('updates.all.emptyDescription')"
        icon="i-carbon-search-locate"
        surface="card"
        size="large"
      />
    </section>
  </main>
</template>

<style scoped>
.UpdatesAllBackLink {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, rgb(107, 114, 128));
  font-size: 13px;
  font-weight: 600;
  transition: color 0.18s ease;
}

.UpdatesAllBackLink:hover {
  color: var(--tx-color-primary, rgb(59, 130, 246));
}

.UpdatesAllHeader {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-top: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color-light, rgba(148, 163, 184, 0.36)) 72%, transparent);
}

.UpdatesAllEyebrow {
  margin: 0 0 10px;
  color: var(--tx-color-primary, rgb(59, 130, 246));
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.UpdatesAllTitle {
  margin: 0;
  color: var(--tx-text-color-primary, rgb(17, 24, 39));
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}

.UpdatesAllSubtitle {
  max-width: 620px;
  margin: 14px 0 0;
  color: var(--tx-text-color-secondary, rgb(107, 114, 128));
  font-size: 15px;
  line-height: 1.7;
}

.UpdatesAllFilters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(160px, 190px) minmax(160px, 190px) auto;
  gap: 12px;
  margin-top: 24px;
  align-items: center;
}

.UpdatesAllSearch,
.UpdatesAllSelect {
  min-width: 0;
}

.UpdatesAllReset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  border-radius: 12px;
  color: var(--tx-text-color-secondary, rgb(107, 114, 128));
  font-size: 12px;
  font-weight: 700;
  padding: 0 10px;
  white-space: nowrap;
}

.UpdatesAllList {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.UpdatesAllItem {
  --tx-card-item-padding: 18px;
  --tx-card-item-radius: 18px;
  border-color: color-mix(in srgb, var(--tx-border-color-light, rgba(148, 163, 184, 0.36)) 62%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light, rgb(248, 250, 252)) 72%, transparent);
}

.UpdatesAllItem:hover {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, rgb(255, 255, 255)) 86%, transparent);
}

.UpdatesAllItem :deep(.tx-card-item__title) {
  color: var(--tx-text-color-primary, rgb(17, 24, 39));
  font-size: 16px;
  line-height: 1.35;
}

.UpdatesAllMeta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, rgb(107, 114, 128));
  font-size: 12px;
}

.UpdatesAllSummary {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: color-mix(in srgb, var(--tx-text-color-secondary, rgb(75, 85, 99)) 94%, transparent);
  font-size: 14px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.UpdatesAllEmpty {
  margin-top: 24px;
}

:global(.dark) .UpdatesAllTitle,
:global([data-theme='dark']) .UpdatesAllTitle,
:global(.dark) .UpdatesAllItem :deep(.tx-card-item__title),
:global([data-theme='dark']) .UpdatesAllItem :deep(.tx-card-item__title) {
  color: rgb(248, 250, 252);
}

@media (max-width: 860px) {
  .UpdatesAllHeader {
    align-items: flex-start;
    flex-direction: column;
  }

  .UpdatesAllFilters {
    grid-template-columns: 1fr 1fr;
  }

  .UpdatesAllSearch {
    grid-column: 1 / -1;
  }
}

@media (max-width: 560px) {
  .UpdatesAllFilters {
    grid-template-columns: 1fr;
  }

  .UpdatesAllReset {
    width: 100%;
  }
}
</style>

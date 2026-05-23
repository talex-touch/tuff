<script setup lang="ts">
import type { AppRelease, ReleaseChannel } from '~/composables/useReleases'
import type { ReleaseChannelId } from '~/data/updates'
import { computed, ref, watch } from 'vue'
import GrainGradientHeroSection from '~/components/ui/GrainGradientHeroSection.vue'
import UpdatesAllView from '~/components/updates/UpdatesAllView.vue'
import { detectArch, detectPlatform, findAssetForPlatform, formatFileSize, getArchLabel, getPlatformLabel, resolveReleaseNotesHtml } from '~/composables/useReleases'
import { mapApiChannelToLocal, mapLocalChannelToApi, releaseChannels } from '~/data/updates'
import { requestJson } from '~/utils/request'

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

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'page-slide',
    mode: 'out-in',
  },
})

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const { releases, loading, fetchReleases } = useReleases()
const { data: updatesPayload } = await useAsyncData('public-updates', () =>
  requestJson<{ updates: DashboardUpdate[] }>('/api/updates'),
)
const channelIds = releaseChannels.map(channel => channel.id)

// Detect user's platform
const userPlatform = ref(detectPlatform())
const userArch = ref(detectArch())
const downloadsSectionRef = ref<HTMLElement | null>(null)

onMounted(() => {
  userPlatform.value = detectPlatform()
  userArch.value = detectArch()
})

function isSameQuery(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length)
    return false
  return keysA.every(key => a[key] === b[key])
}

function buildChannelQuery(channel: ReleaseChannelId) {
  const { channel: _channel, history: _history, ...rest } = route.query
  return channel === 'release' ? rest : { ...rest, channel }
}

function resolveChannel(value: unknown): ReleaseChannelId {
  if (typeof value === 'string' && channelIds.includes(value as ReleaseChannelId))
    return value as ReleaseChannelId
  return 'release'
}

const selectedChannel = ref<ReleaseChannelId>(resolveChannel(route.query.channel))
const historyExpanded = ref(route.query.history === '1')

watch(
  () => route.query.channel,
  (channel) => {
    selectedChannel.value = resolveChannel(channel)
  },
)

watch(selectedChannel, async (channel) => {
  const nextQuery = buildChannelQuery(channel)

  if (!isSameQuery(nextQuery, route.query))
    await router.replace({ query: nextQuery })

  historyExpanded.value = false

  // Fetch releases for the selected channel
  await fetchReleases({
    channel: mapLocalChannelToApi(channel) as ReleaseChannel,
    status: 'published',
    includeAssets: true,
  })
})

// Initial fetch
onMounted(async () => {
  await fetchReleases({
    channel: mapLocalChannelToApi(selectedChannel.value) as ReleaseChannel,
    status: 'published',
    includeAssets: true,
  })
})

const channelOptions = computed(() =>
  releaseChannels.map(channel => ({
    id: channel.id,
    icon: channel.icon,
    badge: t(channel.badgeKey),
    label: t(channel.labelKey),
    description: t(channel.descriptionKey),
    meta: t(channel.metaKey),
  })),
)

// Use API releases data
const filteredReleases = computed(() => {
  return releases.value
    .filter(r => mapApiChannelToLocal(r.channel) === selectedChannel.value)
    .slice()
    .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
})

const latestRelease = computed<AppRelease | null>(() => filteredReleases.value[0] ?? null)
const historyReleases = computed(() => filteredReleases.value.slice(1))

const hasHistory = computed(() => historyReleases.value.length > 0)

// Get download asset for user's platform
const primaryDownload = computed(() => {
  if (!latestRelease.value?.assets)
    return null
  return findAssetForPlatform(latestRelease.value.assets, userPlatform.value, userArch.value)
})

// Get all downloads for the latest release
const allDownloads = computed(() => {
  if (!latestRelease.value?.assets)
    return []
  return latestRelease.value.assets
})

const latestReleaseNotes = computed(() => {
  if (!latestRelease.value)
    return ''
  return resolveReleaseNotesHtml(
    latestRelease.value.notesHtml,
    latestRelease.value.notes,
    locale.value,
  )
})

const updateItems = computed<DashboardUpdate[]>(() => updatesPayload.value?.updates ?? [])
const isAllUpdatesView = computed(() => route.path === '/updates/all' || route.query.view === 'all')
const selectedNewsTab = ref<'release' | 'announcement'>('release')
const featuredUpdateLimit = 6
const releaseUpdates = computed(() => updateItems.value.filter(update => update.type !== 'announcement').slice(0, featuredUpdateLimit))
const announcementUpdates = computed(() => updateItems.value.filter(update => update.type === 'announcement').slice(0, featuredUpdateLimit))
const activeNewsList = computed(() => selectedNewsTab.value === 'announcement' ? announcementUpdates.value : releaseUpdates.value)
const hasUpdateList = computed(() => activeNewsList.value.length > 0)
const isZh = computed(() => locale.value.startsWith('zh'))
const UPDATE_RELEASE_TAG_COLOR = 'var(--tx-color-primary)'
const UPDATE_NEWS_TAG_COLOR = 'var(--tx-text-color-secondary)'
const UPDATE_CRITICAL_TAG_COLOR = 'var(--tx-color-danger)'

function resolveUpdateText(text: LocalizedText) {
  if (isZh.value)
    return text.zh || text.en
  return text.en || text.zh
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

function scrollToDownloads() {
  if (!import.meta.client || !downloadsSectionRef.value)
    return

  const targetTop = Math.max(
    0,
    downloadsSectionRef.value.getBoundingClientRect().top + window.scrollY - 88,
  )

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, targetTop)
    return
  }

  const initialTop = window.scrollY
  window.scrollTo({ top: targetTop, behavior: 'smooth' })

  window.setTimeout(() => {
    if (Math.abs(window.scrollY - initialTop) < 2)
      window.scrollTo(0, targetTop)
  }, 120)
}

function updateTypeLabel(update: DashboardUpdate) {
  if (update.type === 'release')
    return t('updates.news.typeRelease')
  if (update.type === 'announcement')
    return t('updates.news.typeAnnouncement')
  if (update.type === 'config')
    return t('updates.news.typeConfig')
  if (update.type === 'data')
    return t('updates.news.typeData')
  return t('updates.news.typeNews')
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

watch(historyExpanded, (expanded) => {
  const nextQuery = expanded
    ? { ...route.query, history: '1' }
    : (() => {
        const { history: _history, ...rest } = route.query
        return rest
      })()

  if (!isSameQuery(nextQuery, route.query))
    router.replace({ query: nextQuery })
})

watch(
  () => route.query.history,
  (historyValue) => {
    historyExpanded.value = historyValue === '1'
  },
)

const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))

function formatReleaseDate(dateString: string) {
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return t('updates.latest.releaseDateFallback')
  return dateFormatter.value.format(parsed)
}

function channelLabel(id: ReleaseChannelId) {
  const channel = channelOptions.value.find(option => option.id === id)
  return channel ? channel.label : id
}

function getDownloadLabel(asset: { platform: string, arch: string }) {
  return `${getPlatformLabel(asset.platform as any)} (${getArchLabel(asset.arch as any)})`
}
</script>

<template>
  <UpdatesAllView v-if="isAllUpdatesView" :updates="updateItems" />

  <main v-else class="updates-page relative min-h-screen overflow-hidden bg-[#05050a]">
    <GrainGradientHeroSection
      :eyebrow="t('updates.badge')"
      :title="t('updates.title')"
      :subtitle="t('updates.subtitle')"
      :cta-label="t('updates.heroCta')"
      cta-icon="i-carbon-download"
      @cta="scrollToDownloads"
    />

    <section
      id="updates-downloads"
      ref="downloadsSectionRef"
      class="updates-content relative z-1 mx-auto w-full scroll-mt-28 flex flex-col gap-10 bg-white px-6 py-16 text-gray-900 md:px-12 lg:px-24 dark:bg-[#05050a] dark:text-white"
    >
      <div class="mx-auto max-w-2xl w-full animate-fade-in-up" style="animation-delay: 60ms;">
        <TxRadioGroup
          v-model="selectedChannel"
          type="button"
          indicator-variant="blur"
          :update-on-settled="false"
          class="updates-channel-radio-group"
        >
          <TxRadio
            v-for="option in channelOptions"
            :key="option.id"
            :value="option.id"
            class="updates-channel-radio"
          >
            <span :class="option.icon" class="updates-channel-radio__icon" />
            <span>{{ option.badge }}</span>
          </TxRadio>
        </TxRadioGroup>
      </div>

      <section class="mx-auto max-w-4xl w-full animate-fade-in-up" style="animation-delay: 100ms;">
        <div class="UpdateNewsSection">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t('updates.news.title') }}
              </h2>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ t('updates.news.subtitle') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="hidden text-xs text-gray-400 sm:inline dark:text-gray-500">
                {{ t('updates.news.latestHint') }}
              </span>
              <NuxtLink
                to="/updates?view=all"
                class="UpdateNewsViewAllBtn"
              >
                <span>{{ t('updates.news.viewAll') }}</span>
                <span class="i-carbon-arrow-right text-sm" />
              </NuxtLink>
            </div>
          </div>

          <div class="mt-3 flex items-center gap-2">
            <TxButton
              variant="bare"
              native-type="button"
              class="news-tab-btn"
              :class="{ 'news-tab-btn--active': selectedNewsTab === 'release' }"
              @click="selectedNewsTab = 'release'"
            >
              {{ t('updates.news.typeNews') }}
            </TxButton>
            <TxButton
              variant="bare"
              native-type="button"
              class="news-tab-btn"
              :class="{ 'news-tab-btn--active': selectedNewsTab === 'announcement' }"
              @click="selectedNewsTab = 'announcement'"
            >
              {{ t('updates.news.typeAnnouncement') }}
            </TxButton>
          </div>

          <div v-if="hasUpdateList" class="UpdateNewsCarousel mt-4">
            <TxEdgeFadeMask axis="horizontal" :size="48" class="UpdateNewsScroller">
              <div class="UpdateNewsTrack">
                <TxCardItem
                  v-for="update in activeNewsList"
                  :key="update.id"
                  class="UpdateNewsItem UpdateNewsItem--carousel"
                  :title="resolveUpdateText(update.title)"
                  :icon-class="updateTypeIcon(update.type)"
                  :role="update.link ? 'link' : 'article'"
                  :clickable="Boolean(update.link)"
                  @click="openUpdateLink(update.link)"
                >
                  <template #subtitle>
                    <div class="UpdateNewsMeta">
                      <span>{{ formatReleaseDate(update.timestamp) }}</span>
                      <TxTag size="sm" :label="updateTypeLabel(update)" :color="updateTypeTagColor(update.type)" />
                      <TxTag
                        v-for="tag in update.tags.slice(0, 2)"
                        :key="tag"
                        size="sm"
                        :label="tag"
                        :color="UPDATE_NEWS_TAG_COLOR"
                      />
                    </div>
                  </template>

                  <template #description>
                    <p class="UpdateNewsSummary">
                      {{ resolveUpdateText(update.summary) }}
                    </p>
                  </template>
                </TxCardItem>
              </div>
            </TxEdgeFadeMask>
          </div>
          <TxNoData
            v-else
            class="UpdateNewsEmpty"
            :title="t('updates.news.empty')"
            description=""
            icon="i-carbon-notification-off"
            align="start"
            size="small"
          />
        </div>
      </section>

      <!-- Loading State -->
      <Transition name="fade" mode="out-in">
        <div
          v-if="loading"
          key="loading"
          class="mx-auto max-w-3xl w-full flex flex-col items-center gap-4 rounded-2xl bg-gray-50 px-8 py-12 text-center dark:bg-gray-800/50"
        >
          <TxSpinner :size="26" />
          <p class="text-gray-500 dark:text-gray-400">
            {{ t('updates.loading') }}
          </p>
          <div class="UpdateLoadingSkeleton">
            <TxSkeleton :loading="true" :lines="2" />
            <TxSkeleton :loading="true" :lines="2" />
          </div>
        </div>

        <!-- Latest Release Card -->
        <div
          v-else-if="latestRelease"
          key="content"
          class="mx-auto max-w-3xl w-full animate-fade-in-up"
          style="animation-delay: 200ms;"
        >
          <TxCard
            :id="latestRelease.tag"
            class="release-card"
            background="glass"
            shadow="soft"
            :padding="28"
            :radius="16"
          >
            <!-- Release Header -->
            <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div class="flex flex-col gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <TxTag :label="t('updates.latest.heading')" :color="UPDATE_RELEASE_TAG_COLOR" />
                  <TxTag :label="channelLabel(mapApiChannelToLocal(latestRelease.channel))" :color="UPDATE_NEWS_TAG_COLOR" />
                  <TxTag
                    v-if="latestRelease.isCritical"
                    icon="i-carbon-warning-filled"
                    :label="t('updates.latest.critical')"
                    :color="UPDATE_CRITICAL_TAG_COLOR"
                  />
                </div>
                <h2 class="text-2xl font-bold text-gray-900 md:text-3xl dark:text-white">
                  {{ latestRelease.name || latestRelease.tag }}
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ t('updates.latest.releaseDate', { date: formatReleaseDate(latestRelease.publishedAt || latestRelease.createdAt) }) }}
                </p>
              </div>
            </div>

            <!-- Release Notes -->
            <div
              v-if="latestReleaseNotes"
              class="prose prose-sm prose-gray mb-6 max-w-none dark:prose-invert"
              v-html="latestReleaseNotes"
            />

            <!-- Download Buttons -->
            <div class="flex flex-wrap items-center gap-3">
              <a
                v-if="primaryDownload"
                :href="primaryDownload.downloadUrl"
                target="_blank"
                rel="noopener"
                class="download-btn inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                <span class="i-carbon-download text-base" />
                {{ t('updates.downloads.downloadFor') }} {{ getDownloadLabel(primaryDownload) }}
                <span v-if="primaryDownload.size" class="text-xs opacity-70">({{ formatFileSize(primaryDownload.size) }})</span>
              </a>

              <div v-if="allDownloads.length > 1" class="relative group">
                <TxButton variant="bare" native-type="button" class="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700">
                  <span class="i-carbon-overflow-menu-horizontal text-base" />
                  {{ t('updates.downloads.otherPlatforms') }}
                </TxButton>
                <div class="absolute left-0 top-full z-10 mt-2 hidden min-w-48 flex-col rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg group-hover:flex dark:border-gray-700 dark:bg-gray-800">
                  <a
                    v-for="asset in allDownloads"
                    :key="asset.id"
                    :href="asset.downloadUrl"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <span class="i-carbon-download text-base" />
                    <span>{{ getDownloadLabel(asset) }}</span>
                    <span v-if="asset.size" class="ml-auto text-xs text-gray-400">{{ formatFileSize(asset.size) }}</span>
                  </a>
                </div>
              </div>
            </div>
          </TxCard>
        </div>

        <!-- Empty State -->
        <div
          v-else
          key="empty"
          class="mx-auto max-w-3xl w-full"
        >
          <TxNoData
            :title="t('updates.empty')"
            description=""
            icon="i-carbon-incomplete"
            surface="card"
            size="large"
          />
        </div>
      </Transition>

      <!-- Release History -->
      <div
        v-if="filteredReleases.length > 1"
        class="mx-auto max-w-3xl w-full animate-fade-in-up"
        style="animation-delay: 300ms;"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t('updates.table.title') }}
          </h3>
          <TxButton v-if="hasHistory" variant="bare" native-type="button" class="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" @click="historyExpanded = !historyExpanded">
            <span :class="historyExpanded ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" class="text-base transition-transform duration-200" />
            {{ historyExpanded ? t('updates.table.hideLabel') : t('updates.table.toggleLabel') }}
          </TxButton>
        </div>

        <Transition name="slide-fade">
          <div
            v-if="historyExpanded"
            class="ReleaseHistoryList"
          >
            <TxCardItem
              v-for="release in historyReleases"
              :id="release.tag"
              :key="release.tag"
              class="ReleaseHistoryItem release-row"
              role="article"
              icon-class="i-carbon-version-major"
            >
              <template #title>
                <div class="ReleaseHistoryTitle">
                  <span class="truncate">
                    {{ release.name || release.tag }}
                  </span>
                  <TxTag
                    v-if="release.isCritical"
                    size="sm"
                    :label="t('updates.latest.critical')"
                    :color="UPDATE_CRITICAL_TAG_COLOR"
                  />
                </div>
              </template>

              <template #subtitle>
                <span>{{ formatReleaseDate(release.publishedAt || release.createdAt) }}</span>
              </template>

              <template #right>
                <div class="flex items-center gap-2 shrink-0">
                  <a
                    v-for="asset in (release.assets || []).slice(0, 1)"
                    :key="asset.id"
                    :href="asset.downloadUrl"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    <span class="i-carbon-download text-sm" />
                    {{ getDownloadLabel(asset) }}
                  </a>
                </div>
              </template>
            </TxCardItem>
          </div>
        </Transition>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* Animations */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.4s ease-out both;
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out both;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.ReleaseHistoryList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.UpdateNewsCarousel {
  position: relative;
  margin-inline: -2px;
}

.UpdateNewsScroller {
  height: 196px;
}

.UpdateNewsScroller :deep(.tx-edge-fade-mask__viewport) {
  scrollbar-width: none;
}

.UpdateNewsScroller :deep(.tx-edge-fade-mask__viewport::-webkit-scrollbar) {
  display: none;
}

.UpdateNewsTrack {
  display: flex;
  width: max-content;
  height: 100%;
  align-items: stretch;
  gap: 12px;
  padding: 2px 2px 12px;
}

.UpdateNewsSection {
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-light, rgba(148, 163, 184, 0.36)) 72%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color-light, rgba(148, 163, 184, 0.36)) 72%, transparent);
  padding: 24px 0;
}

.UpdateNewsItem,
.ReleaseHistoryItem {
  border-color: color-mix(in srgb, var(--tx-border-color-light, rgba(148, 163, 184, 0.36)) 62%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light, rgb(248, 250, 252)) 72%, transparent);
}

.UpdateNewsItem--carousel {
  flex: 0 0 min(82vw, 360px);
  height: calc(100% - 2px);
  --tx-card-item-padding: 16px;
  --tx-card-item-radius: 18px;
}

.UpdateNewsItem--carousel :deep(.tx-card-item__title) {
  display: -webkit-box;
  overflow: hidden;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 15px;
  line-height: 1.35;
}

.UpdateNewsItem--carousel :deep(.tx-card-item__desc) {
  margin-top: 10px;
}

.UpdateNewsItem:hover,
.ReleaseHistoryItem:hover {
  background: color-mix(in srgb, var(--tx-bg-color-overlay, rgb(255, 255, 255)) 86%, transparent);
}

.UpdateNewsMeta,
.ReleaseHistoryTitle {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.UpdateNewsMeta {
  color: var(--tx-text-color-secondary, rgb(107, 114, 128));
  font-size: 12px;
}

.UpdateNewsSummary {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: color-mix(in srgb, var(--tx-text-color-secondary, rgb(75, 85, 99)) 94%, transparent);
  font-size: 14px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.UpdateNewsViewAllBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  color: var(--tx-color-primary, rgb(59, 130, 246));
  font-size: 12px;
  font-weight: 700;
  padding: 5px 10px;
}

.UpdateNewsEmpty {
  margin-top: 16px;
  padding: 4px 0;
}

.UpdateLoadingSkeleton {
  display: grid;
  width: min(100%, 420px);
  gap: 12px;
}

.updates-channel-radio-group {
  width: 100%;
  display: flex !important;
  flex-wrap: nowrap !important;
  padding: 6px !important;
  gap: 8px !important;
  border-radius: 18px !important;
  border-color: color-mix(in srgb, var(--tx-color-primary, rgb(59, 130, 246)) 24%, transparent) !important;
  background: color-mix(in srgb, var(--tx-color-primary, rgb(59, 130, 246)) 11%, rgba(15, 23, 42, 0.72)) !important;
}

.updates-channel-radio-group :deep(.tx-radio) {
  flex: 1 1 0 !important;
  min-width: 0;
  height: 44px;
  justify-content: flex-start;
  gap: 10px;
  border-radius: 14px;
  padding: 0 16px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, rgb(148, 163, 184)) 82%, transparent);
  font-size: 14px;
  font-weight: 700;
}

.updates-channel-radio-group :deep(.tx-radio.is-checked) {
  color: var(--tx-text-color-primary, rgb(248, 250, 252));
}

.updates-channel-radio__icon {
  flex: 0 0 auto;
  font-size: 16px;
}

.news-tab-btn {
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--tx-text-color-secondary, rgb(107, 114, 128));
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
}
.news-tab-btn--active {
  background: color-mix(in srgb, var(--tx-color-primary, rgb(59, 130, 246)) 14%, transparent);
  border-color: color-mix(in srgb, var(--tx-color-primary, rgb(59, 130, 246)) 32%, transparent);
  color: var(--tx-color-primary, rgb(59, 130, 246));
}

/* Release card hover effect */
.release-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.release-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1);
}

:root.dark .release-card:hover {
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.3);
}

/* Download button pulse on hover */
.download-btn {
  position: relative;
  overflow: hidden;
}

.download-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}

.download-btn:hover::after {
  transform: translateX(100%);
}

/* Release row stagger animation */
.release-row {
  animation: fade-in-up 0.3s ease-out both;
}

.release-row:nth-child(1) { animation-delay: 0ms; }
.release-row:nth-child(2) { animation-delay: 50ms; }
.release-row:nth-child(3) { animation-delay: 100ms; }
.release-row:nth-child(4) { animation-delay: 150ms; }
.release-row:nth-child(5) { animation-delay: 200ms; }
</style>

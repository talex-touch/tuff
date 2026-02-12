<script setup lang="ts">
import type { AppRelease, ReleaseChannel } from '~/composables/useReleases'
import type { ReleaseChannelId } from '~/data/updates'
import { computed, ref, watch } from 'vue'
import { detectArch, detectPlatform, findAssetForPlatform, formatFileSize, getArchLabel, getPlatformLabel, resolveReleaseNotesHtml } from '~/composables/useReleases'
import { mapApiChannelToLocal, mapLocalChannelToApi, releaseChannels } from '~/data/updates'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'page-slide',
    mode: 'out-in',
  },
})

// Color mode
const colorMode = useColorMode()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const { releases, loading, fetchReleases } = useReleases()
const channelIds = releaseChannels.map(channel => channel.id)

// Detect user's platform
const userPlatform = ref(detectPlatform())
const userArch = ref(detectArch())

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

function resolveChannel(value: unknown): ReleaseChannelId {
  if (typeof value === 'string' && channelIds.includes(value as ReleaseChannelId))
    return value as ReleaseChannelId
  return 'release'
}

const selectedChannel = ref<ReleaseChannelId>(resolveChannel(route.query.channel))
const historyExpanded = ref(false)

watch(
  () => route.query.channel,
  (channel) => {
    selectedChannel.value = resolveChannel(channel)
  },
)

watch(selectedChannel, async (channel) => {
  historyExpanded.value = false
  const nextQuery = channel === 'release'
    ? (() => {
        const { channel: _channel, ...rest } = route.query
        return rest
      })()
    : { ...route.query, channel }

  if (!isSameQuery(nextQuery, route.query))
    router.replace({ query: nextQuery })

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
  <section class="updates-page relative mx-auto min-h-screen w-full flex flex-col gap-10 px-6 py-20 md:px-12 lg:px-24">
    <!-- Header -->
    <header class="mx-auto max-w-4xl w-full flex flex-col gap-4 text-center animate-fade-in">
      <span class="mx-auto inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium tracking-wider text-gray-600 uppercase dark:bg-gray-800 dark:text-gray-300">
        {{ t('updates.badge') }}
      </span>
      <h1 class="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl dark:text-white">
        {{ t('updates.title') }}
      </h1>
      <p class="mx-auto max-w-xl text-gray-600 dark:text-gray-400">
        {{ t('updates.subtitle') }}
      </p>
    </header>

    <!-- Channel Selector -->
    <div class="mx-auto max-w-2xl w-full animate-fade-in-up" style="animation-delay: 100ms;">
      <div class="flex gap-2 rounded-xl bg-gray-100 p-1.5 dark:bg-gray-800/80">
        <TxButton v-for="option in channelOptions" :key="option.id" variant="bare" native-type="button" class="channel-tab flex-1 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-300" :class="selectedChannel === option.id ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'" @click="selectedChannel = option.id">
          <span :class="option.icon" class="text-base" />
          <span>{{ option.badge }}</span>
        </TxButton>
      </div>
    </div>

    <!-- Loading State -->
    <Transition name="fade" mode="out-in">
      <div
        v-if="loading"
        key="loading"
        class="mx-auto max-w-3xl w-full flex flex-col items-center gap-4 rounded-2xl bg-gray-50 px-8 py-16 text-center dark:bg-gray-800/50"
      >
        <span class="i-carbon-circle-dash animate-spin text-2xl text-gray-400" />
        <p class="text-gray-500 dark:text-gray-400">
          {{ t('updates.loading') || 'Loading releases...' }}
        </p>
      </div>

      <!-- Latest Release Card -->
      <div
        v-else-if="latestRelease"
        key="content"
        class="mx-auto max-w-3xl w-full animate-fade-in-up"
        style="animation-delay: 200ms;"
      >
        <div class="release-card rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8 dark:border-gray-700 dark:bg-gray-800/80">
          <!-- Release Header -->
          <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {{ t('updates.latest.heading') }}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ channelLabel(mapApiChannelToLocal(latestRelease.channel)) }}
                </span>
                <span
                  v-if="latestRelease.isCritical"
                  class="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                >
                  <span class="i-carbon-warning-filled text-xs" />
                  Critical
                </span>
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
              {{ t('updates.downloads.downloadFor') || 'Download for' }} {{ getDownloadLabel(primaryDownload) }}
              <span v-if="primaryDownload.size" class="text-xs opacity-70">({{ formatFileSize(primaryDownload.size) }})</span>
            </a>

            <div v-if="allDownloads.length > 1" class="relative group">
              <TxButton variant="bare" native-type="button" class="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700">
                <span class="i-carbon-overflow-menu-horizontal text-base" />
                {{ t('updates.downloads.otherPlatforms') || 'Other platforms' }}
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
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else
        key="empty"
        class="mx-auto max-w-3xl w-full flex flex-col items-center gap-4 rounded-2xl bg-gray-50 px-8 py-16 text-center dark:bg-gray-800/50"
      >
        <span class="i-carbon-incomplete text-3xl text-gray-400" />
        <p class="text-gray-500 dark:text-gray-400">
          {{ t('updates.empty') }}
        </p>
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
          class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/80"
        >
          <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <div
              v-for="release in historyReleases"
              :key="release.tag"
              class="release-row flex items-center justify-between gap-4 p-4 transition hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900 truncate dark:text-white">
                      {{ release.name || release.tag }}
                    </span>
                    <span
                      v-if="release.isCritical"
                      class="shrink-0 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    >
                      Critical
                    </span>
                  </div>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatReleaseDate(release.publishedAt || release.createdAt) }}
                  </span>
                </div>
              </div>
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
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </section>
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

/* Channel tab indicator animation */
.channel-tab {
  position: relative;
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

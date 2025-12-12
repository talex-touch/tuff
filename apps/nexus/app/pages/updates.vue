<script setup lang="ts">
import type { ReleaseChannelId } from '~/data/updates'
import { computed, ref, watch } from 'vue'
import { mapApiChannelToLocal, mapLocalChannelToApi, releaseChannels } from '~/data/updates'
import type { AppRelease, ReleaseChannel } from '~/composables/useReleases'
import { detectArch, detectPlatform, findAssetForPlatform, formatFileSize, getArchLabel, getPlatformLabel } from '~/composables/useReleases'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

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
  const nextQuery = channel === 'release' ? { ...route.query } : { ...route.query, channel }

  if (channel === 'release' && route.query.channel)
    delete nextQuery.channel

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

watch(historyExpanded, (expanded) => {
  const nextQuery = expanded
    ? { ...route.query, history: '1' }
    : { ...route.query }

  if (!expanded && nextQuery.history)
    delete nextQuery.history

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
  <section class="relative mx-auto min-h-screen w-full flex flex-col gap-12 px-24 py-24 lg:px-12 sm:px-6 sm:py-20">
    <div class="mx-auto max-w-5xl w-full flex flex-col gap-6 text-center">
      <p class="mx-auto inline-flex items-center gap-2 border border-primary/15 rounded-full bg-dark/5 px-4 py-1 text-xs text-black/70 font-semibold tracking-[0.32em] uppercase dark:border-light/20 dark:bg-light/15 dark:text-light/80">
        {{ t('updates.badge') }}
      </p>
      <h1 class="text-4xl text-black font-semibold tracking-tight sm:text-5xl dark:text-light">
        {{ t('updates.title') }}
      </h1>
      <p class="mx-auto max-w-2xl text-base text-black/70 dark:text-light/80">
        {{ t('updates.subtitle') }}
      </p>
    </div>

    <div class="mx-auto max-w-5xl w-full flex flex-col gap-4">
      <p class="text-xs text-black/60 font-semibold tracking-[0.28em] uppercase dark:text-light/60">
        {{ t('updates.channelSelector.label') }}
      </p>
      <div class="grid gap-4 sm:grid-cols-2">
        <button
          v-for="option in channelOptions"
          :key="option.id"
          type="button"
          class="group flex flex-col gap-4 border border-primary/15 rounded-3xl bg-white/70 p-6 text-left shadow-[0_24px_80px_rgba(17,35,85,0.12)] transition duration-200 dark:border-light/20 dark:bg-dark/40 dark:text-light dark:shadow-[0_24px_80px_rgba(5,9,25,0.45)] hover:shadow-[0_30px_110px_rgba(17,35,85,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:-translate-y-1 dark:hover:shadow-[0_30px_120px_rgba(5,9,25,0.55)]"
          :class="selectedChannel === option.id ? 'border-primary/50 bg-dark/5 dark:border-light/60 dark:bg-light/10' : ''"
          @click="selectedChannel = option.id"
        >
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-2 border border-primary/15 rounded-full bg-dark/10 px-3 py-1 text-[11px] text-black/70 font-semibold tracking-[0.3em] uppercase dark:border-light/20 dark:bg-light/15 dark:text-light/70">
              <span :class="option.icon" class="text-base" aria-hidden="true" />
              {{ option.badge }}
            </span>
            <span
              v-if="selectedChannel === option.id"
              class="i-carbon-checkbox-checked text-xl text-black dark:text-light"
              aria-hidden="true"
            />
            <span
              v-else
              class="i-carbon-checkbox text-xl text-black/40 dark:text-light/40"
              aria-hidden="true"
            />
          </div>
          <div class="space-y-2">
            <h2 class="text-xl text-black font-semibold dark:text-light">
              {{ option.label }}
            </h2>
            <p class="text-sm text-black/70 dark:text-light/70">
              {{ option.description }}
            </p>
          </div>
          <p class="text-xs text-black/50 font-medium tracking-[0.24em] uppercase dark:text-light/60">
            {{ option.meta }}
          </p>
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="mx-auto max-w-4xl w-full flex flex-col items-center gap-4 border border-primary/15 rounded-[32px] bg-dark/5 px-8 py-16 text-center text-black/70 dark:border-light/15 dark:bg-light/10 dark:text-light/70"
    >
      <span class="i-carbon-circle-dash animate-spin text-3xl" aria-hidden="true" />
      <p>{{ t('updates.loading') || 'Loading releases...' }}</p>
    </div>

    <div
      v-else-if="latestRelease"
      class="grid mx-auto max-w-5xl w-full gap-6 border border-primary/10 rounded-[36px] bg-white/80 p-10 shadow-[0_40px_130px_rgba(17,35,85,0.15)] lg:grid-cols-[1.15fr_0.85fr] dark:border-light/15 dark:bg-dark/40 sm:p-8 dark:text-light/90 dark:shadow-[0_40px_120px_rgba(5,9,25,0.55)]"
    >
      <article class="flex flex-col gap-6">
        <header class="flex flex-col gap-2">
          <div class="flex items-center gap-3 text-sm text-black/70 dark:text-light/70">
            <span class="inline-flex items-center gap-2 border border-primary/20 rounded-full bg-dark/10 px-3 py-1 text-[11px] text-black/70 font-semibold tracking-[0.3em] uppercase dark:border-light/20 dark:bg-light/10 dark:text-light/70">
              {{ t('updates.latest.heading') }}
            </span>
            <span class="text-xs text-black/50 font-medium tracking-[0.24em] uppercase dark:text-light/60">
              {{ channelLabel(mapApiChannelToLocal(latestRelease.channel)) }}
            </span>
            <span
              v-if="latestRelease.isCritical"
              class="inline-flex items-center gap-1 border border-red-500/30 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-600 font-semibold tracking-[0.2em] uppercase dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400"
            >
              <span class="i-carbon-warning-filled text-xs" aria-hidden="true" />
              Critical
            </span>
          </div>
          <h2 class="text-3xl text-black font-semibold dark:text-light">
            {{ latestRelease.name || latestRelease.tag }}
          </h2>
          <p class="text-sm text-black/50 font-medium tracking-[0.24em] uppercase dark:text-light/60">
            {{ t('updates.latest.releaseDate', { date: formatReleaseDate(latestRelease.publishedAt || latestRelease.createdAt) }) }}
          </p>
        </header>

        <div v-if="latestRelease.notes" class="prose prose-sm max-w-none text-black/80 dark:text-light/80" v-html="latestRelease.notesHtml || latestRelease.notes" />

        <div class="flex flex-wrap items-center gap-3">
          <a
            v-if="primaryDownload"
            :href="primaryDownload.downloadUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 rounded-full bg-dark px-5 py-2.5 text-sm text-white font-semibold shadow-[0_18px_40px_rgba(12,32,98,0.35)] transition dark:bg-light hover:bg-dark/90 dark:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 hover:-translate-y-0.5 dark:hover:bg-light/90"
          >
            <span class="i-carbon-download text-base" aria-hidden="true" />
            {{ t('updates.downloads.downloadFor') || 'Download for' }} {{ getDownloadLabel(primaryDownload) }}
            <span v-if="primaryDownload.size" class="text-xs opacity-70">({{ formatFileSize(primaryDownload.size) }})</span>
          </a>

          <div v-if="allDownloads.length > 1" class="relative group">
            <button
              type="button"
              class="inline-flex items-center gap-2 border border-primary/20 rounded-full px-4 py-2.5 text-sm text-black font-semibold transition dark:border-light/25 hover:border-primary/50 hover:bg-dark/5 dark:text-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:border-light/60 dark:hover:bg-light/10"
            >
              <span class="i-carbon-overflow-menu-horizontal text-base" aria-hidden="true" />
              {{ t('updates.downloads.otherPlatforms') || 'Other platforms' }}
            </button>
            <div class="absolute left-0 top-full z-10 mt-2 hidden min-w-48 flex-col border border-primary/15 rounded-2xl bg-white p-2 shadow-lg group-hover:flex dark:border-light/20 dark:bg-dark">
              <a
                v-for="asset in allDownloads"
                :key="asset.id"
                :href="asset.downloadUrl"
                target="_blank"
                rel="noopener"
                class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-black/80 transition hover:bg-dark/5 dark:text-light/80 dark:hover:bg-light/10"
              >
                <span class="i-carbon-download text-base" aria-hidden="true" />
                <span>{{ getDownloadLabel(asset) }}</span>
                <span v-if="asset.size" class="ml-auto text-xs text-black/50 dark:text-light/50">{{ formatFileSize(asset.size) }}</span>
              </a>
            </div>
          </div>
        </div>
      </article>

      <aside class="h-full flex flex-col justify-between gap-6 border border-primary/10 rounded-[28px] bg-dark/5 p-6 text-sm text-black/70 dark:border-light/15 dark:bg-light/10 dark:text-light/70">
        <div class="space-y-4">
          <h3 class="text-base text-black font-semibold dark:text-light">
            {{ t('updates.channelSummary.title') }}
          </h3>
          <p class="text-sm">
            {{ t('updates.channelSummary.description', { channel: channelLabel(selectedChannel) }) }}
          </p>
        </div>
        <div class="text-xs text-black/60 space-y-2 dark:text-light/60">
          <p>{{ t('updates.channelSummary.refreshHint') }}</p>
          <p>{{ t('updates.channelSummary.feedback') }}</p>
        </div>
      </aside>
    </div>

    <div
      v-else
      class="mx-auto max-w-4xl w-full flex flex-col items-center gap-4 border border-primary/15 rounded-[32px] bg-dark/5 px-8 py-16 text-center text-black/70 dark:border-light/15 dark:bg-light/10 dark:text-light/70"
    >
      <span class="i-carbon-incomplete text-3xl" aria-hidden="true" />
      <p>{{ t('updates.empty') }}</p>
    </div>

    <div
      v-if="filteredReleases.length"
      class="mx-auto max-w-5xl w-full flex flex-col gap-4"
    >
      <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="text-xl text-black font-semibold dark:text-light">
            {{ t('updates.table.title') }}
          </h3>
          <p class="text-sm text-black/70 dark:text-light/70">
            {{ t('updates.table.description', { channel: channelLabel(selectedChannel) }) }}
          </p>
        </div>
        <button
          v-if="hasHistory"
          type="button"
          class="inline-flex items-center gap-2 border border-primary/20 rounded-full px-4 py-2 text-sm text-black font-semibold transition dark:border-light/25 hover:border-primary/50 hover:bg-dark/5 dark:text-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:border-light/60 dark:hover:bg-light/10"
          @click="historyExpanded = !historyExpanded"
        >
          <span :class="historyExpanded ? 'i-carbon-collapse-all' : 'i-carbon-expand-all'" class="text-base" aria-hidden="true" />
          {{ historyExpanded ? t('updates.table.hideLabel') : t('updates.table.toggleLabel') }}
        </button>
      </div>

      <transition name="fade">
        <div
          v-if="historyExpanded"
          class="overflow-hidden border border-primary/10 rounded-[28px] bg-white/70 shadow-[0_32px_110px_rgba(17,35,85,0.12)] dark:border-light/15 dark:bg-dark/40 dark:shadow-[0_32px_110px_rgba(5,9,25,0.45)]"
        >
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm text-black/80 divide-y divide-primary/10 dark:text-light/80 dark:divide-light/15">
              <thead class="text-xs text-black/50 tracking-[0.28em] uppercase dark:text-light/60">
                <tr>
                  <th scope="col" class="px-6 py-4">
                    {{ t('updates.table.columns.version') }}
                  </th>
                  <th scope="col" class="px-6 py-4">
                    {{ t('updates.table.columns.date') }}
                  </th>
                  <th scope="col" class="px-6 py-4">
                    {{ t('updates.table.columns.summary') || 'Summary' }}
                  </th>
                  <th scope="col" class="px-6 py-4 text-right">
                    {{ t('updates.table.columns.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-primary/10 dark:divide-light/10">
                <tr
                  v-for="release in filteredReleases"
                  :key="release.tag"
                  class="transition hover:bg-dark/5 dark:hover:bg-light/10"
                >
                  <td class="px-6 py-4 text-black font-semibold dark:text-light">
                    {{ release.name || release.tag }}
                    <span
                      v-if="release === latestRelease"
                      class="ml-2 inline-flex items-center rounded-full bg-dark/10 px-2 py-0.5 text-[11px] text-black/70 font-semibold tracking-[0.3em] uppercase dark:bg-light/10 dark:text-light/70"
                    >
                      {{ t('updates.table.latestBadge') }}
                    </span>
                    <span
                      v-if="release.isCritical"
                      class="ml-2 inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-600 font-semibold tracking-[0.2em] uppercase dark:bg-red-400/10 dark:text-red-400"
                    >
                      Critical
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-black/70 dark:text-light/70">
                    {{ formatReleaseDate(release.publishedAt || release.createdAt) }}
                  </td>
                  <td class="px-6 py-4 text-sm text-black/70 dark:text-light/70 max-w-xs truncate">
                    {{ release.notes?.substring(0, 100) }}{{ release.notes?.length > 100 ? '...' : '' }}
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="inline-flex flex-col items-end gap-2">
                      <a
                        v-for="asset in (release.assets || []).slice(0, 2)"
                        :key="asset.id"
                        :href="asset.downloadUrl"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex items-center gap-1.5 text-xs text-black/70 font-semibold tracking-[0.28em] uppercase transition dark:text-light/70 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:text-light"
                      >
                        <span class="i-carbon-download text-sm" aria-hidden="true" />
                        {{ getDownloadLabel(asset) }}
                      </a>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

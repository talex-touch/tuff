<script setup lang="ts">
import type { ReleaseChannelId, ReleaseEntryDefinition } from '~/data/updates'
import { computed, ref, watch } from 'vue'
import { releaseChannels, releaseEntries } from '~/data/updates'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

const { t, tm, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const channelIds = releaseChannels.map(channel => channel.id)

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

watch(selectedChannel, (channel) => {
  historyExpanded.value = false
  const nextQuery = channel === 'release' ? { ...route.query } : { ...route.query, channel }

  if (channel === 'release' && route.query.channel)
    delete nextQuery.channel

  if (!isSameQuery(nextQuery, route.query))
    router.replace({ query: nextQuery })
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

const filteredEntries = computed(() => {
  return releaseEntries
    .filter(entry => entry.channel === selectedChannel.value)
    .slice()
    .sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime())
})

const latestEntry = computed<ReleaseEntryDefinition | null>(() => filteredEntries.value[0] ?? null)
const historyEntries = computed(() => filteredEntries.value.slice(1))

const hasHistory = computed(() => historyEntries.value.length > 0)

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

function entrySummary(key: string) {
  return t(`updates.entries.${key}.summary`)
}

function entryHighlights(key: string) {
  const highlights = tm(`updates.entries.${key}.highlights`)
  return Array.isArray(highlights) ? (highlights as string[]) : []
}

function channelLabel(id: ReleaseChannelId) {
  const channel = channelOptions.value.find(option => option.id === id)
  return channel ? channel.label : id
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
      v-if="latestEntry"
      class="grid mx-auto max-w-5xl w-full gap-6 border border-primary/10 rounded-[36px] bg-white/80 p-10 shadow-[0_40px_130px_rgba(17,35,85,0.15)] lg:grid-cols-[1.15fr_0.85fr] dark:border-light/15 dark:bg-dark/40 sm:p-8 dark:text-light/90 dark:shadow-[0_40px_120px_rgba(5,9,25,0.55)]"
    >
      <article class="flex flex-col gap-6">
        <header class="flex flex-col gap-2">
          <div class="flex items-center gap-3 text-sm text-black/70 dark:text-light/70">
            <span class="inline-flex items-center gap-2 border border-primary/20 rounded-full bg-dark/10 px-3 py-1 text-[11px] text-black/70 font-semibold tracking-[0.3em] uppercase dark:border-light/20 dark:bg-light/10 dark:text-light/70">
              {{ t('updates.latest.heading') }}
            </span>
            <span class="text-xs text-black/50 font-medium tracking-[0.24em] uppercase dark:text-light/60">
              {{ channelLabel(latestEntry.channel) }}
            </span>
          </div>
          <h2 class="text-3xl text-black font-semibold dark:text-light">
            {{ latestEntry.version }}
          </h2>
          <p class="text-sm text-black/50 font-medium tracking-[0.24em] uppercase dark:text-light/60">
            {{ t('updates.latest.releaseDate', { date: formatReleaseDate(latestEntry.releasedAt) }) }}
          </p>
        </header>
        <p class="text-base text-black/80 dark:text-light/80">
          {{ entrySummary(latestEntry.key) }}
        </p>
        <div class="space-y-3">
          <h3 class="text-sm text-black/50 font-semibold tracking-[0.3em] uppercase dark:text-light/60">
            {{ t('updates.latest.highlightsHeading') }}
          </h3>
          <ul class="space-y-3">
            <li
              v-for="highlight in entryHighlights(latestEntry.key)"
              :key="highlight"
              class="flex items-start gap-3 border border-primary/10 rounded-2xl bg-dark/5 p-3 text-sm text-black/80 dark:border-light/10 dark:bg-light/10 dark:text-light/80"
            >
              <span class="i-carbon-dot-mark text-base text-black/60 dark:text-light/60" aria-hidden="true" />
              <span>{{ highlight }}</span>
            </li>
          </ul>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NuxtLink
            :to="latestEntry.notesPath"
            class="inline-flex items-center gap-2 rounded-full bg-dark px-5 py-2.5 text-sm text-white font-semibold shadow-[0_18px_40px_rgba(12,32,98,0.35)] transition dark:bg-light hover:bg-dark/90 dark:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 hover:-translate-y-0.5 dark:hover:bg-light/90"
          >
            <span class="i-carbon-document-view text-base" aria-hidden="true" />
            {{ t('updates.latest.notesCta') }}
          </NuxtLink>
          <a
            v-for="download in latestEntry.downloads"
            :key="download.id"
            :href="download.href"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 border border-primary/20 rounded-full px-5 py-2.5 text-sm text-black font-semibold transition dark:border-light/25 hover:border-primary/50 hover:bg-dark/5 dark:text-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:-translate-y-0.5 dark:hover:border-light/60 dark:hover:bg-light/10"
          >
            <span class="i-carbon-download text-base" aria-hidden="true" />
            {{ t(download.labelKey) }}
          </a>
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
      v-if="filteredEntries.length"
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
                    {{ t('updates.table.columns.summary') }}
                  </th>
                  <th scope="col" class="px-6 py-4 text-right">
                    {{ t('updates.table.columns.actions') }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-primary/10 dark:divide-light/10">
                <tr
                  v-for="entry in filteredEntries"
                  :key="entry.version"
                  class="transition hover:bg-dark/5 dark:hover:bg-light/10"
                >
                  <td class="px-6 py-4 text-black font-semibold dark:text-light">
                    {{ entry.version }}
                    <span
                      v-if="entry === latestEntry"
                      class="ml-2 inline-flex items-center rounded-full bg-dark/10 px-2 py-0.5 text-[11px] text-black/70 font-semibold tracking-[0.3em] uppercase dark:bg-light/10 dark:text-light/70"
                    >
                      {{ t('updates.table.latestBadge') }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-black/70 dark:text-light/70">
                    {{ formatReleaseDate(entry.releasedAt) }}
                  </td>
                  <td class="px-6 py-4 text-sm text-black/70 dark:text-light/70">
                    <ul class="list-disc pl-4 space-y-1">
                      <li
                        v-for="highlight in entryHighlights(entry.key).slice(0, 2)"
                        :key="highlight"
                      >
                        {{ highlight }}
                      </li>
                    </ul>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="inline-flex flex-col items-end gap-2">
                      <NuxtLink
                        :to="entry.notesPath"
                        class="inline-flex items-center gap-1.5 text-xs text-black/70 font-semibold tracking-[0.28em] uppercase transition dark:text-light/70 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:text-light"
                      >
                        <span class="i-carbon-document-blank text-sm" aria-hidden="true" />
                        {{ t('updates.table.viewNotes') }}
                      </NuxtLink>
                      <a
                        v-for="download in entry.downloads"
                        :key="download.id"
                        :href="download.href"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex items-center gap-1.5 text-xs text-black/50 font-semibold tracking-[0.28em] uppercase transition dark:text-light/60 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:text-light"
                      >
                        <span class="i-carbon-launch text-sm" aria-hidden="true" />
                        {{ t(download.labelKey) }}
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

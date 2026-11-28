<script setup lang="ts">
import type { AppRelease, ReleaseChannel } from '~/composables/useReleases'
import type { DashboardUpdate, LocalizedText } from '~/utils/public-updates'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { usePublicUpdates } from '~/composables/usePublicUpdates'
import {
  detectArch,
  detectPlatform,
  findAssetForPlatform,
  formatFileSize,
  getArchLabel,
  getPlatformLabel,
  resolveReleaseNotes,
  useReleases,
} from '~/composables/useReleases'
import { resolveLocaleFromPath, stripLocalePrefix, toLocalizedWebPath } from '~/utils/web-route'

const props = withDefaults(defineProps<{
  forceAllView?: boolean
}>(), {
  forceAllView: false,
})

const UpdatesAllView = defineAsyncComponent(() => import('~/components/updates/UpdatesAllView.vue'))

const GITHUB_RELEASES_URL = 'https://github.com/talex-touch/tuff/releases'
const STABLE_RELEASE_CHANNEL: ReleaseChannel = 'RELEASE'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const currentLocale = computed<'en' | 'zh'>(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => currentLocale.value === 'zh' || locale.value.startsWith('zh'))

const { fetchLatestRelease } = useReleases()
const { updateItems, showSkeleton: updatesSkeleton } = usePublicUpdates()

const userPlatform = ref(detectPlatform())
const userArch = ref(detectArch())
const latestRelease = ref<AppRelease | null>(null)
const releaseLoading = ref(true)
const notesModalOpen = ref(false)

onMounted(async () => {
  userPlatform.value = detectPlatform()
  userArch.value = detectArch()
  try {
    latestRelease.value = await fetchLatestRelease(STABLE_RELEASE_CHANNEL)
  }
  finally {
    releaseLoading.value = false
  }
})

const primaryDownload = computed(() => {
  if (!latestRelease.value?.assets)
    return null
  return findAssetForPlatform(latestRelease.value.assets, userPlatform.value, userArch.value)
})

const allDownloads = computed(() => latestRelease.value?.assets ?? [])
const primaryDownloadPlatform = computed(() => primaryDownload.value?.platform ?? userPlatform.value)
const primaryDownloadPlatformLabel = computed(() => getPlatformLabel(primaryDownloadPlatform.value))
const primaryDownloadIcon = computed(() => {
  if (primaryDownloadPlatform.value === 'darwin')
    return 'i-carbon-apple'
  if (primaryDownloadPlatform.value === 'win32')
    return 'i-carbon-grid'
  if (primaryDownloadPlatform.value === 'linux')
    return 'i-carbon-linux-alt'
  return 'i-carbon-download'
})
const platformRequirementLabel = computed(() => {
  if (primaryDownloadPlatform.value === 'darwin')
    return t('updates.downloads.requirements.darwin')
  if (primaryDownloadPlatform.value === 'win32')
    return t('updates.downloads.requirements.win32')
  return t('updates.downloads.requirements.generic', { platform: primaryDownloadPlatformLabel.value })
})
const latestVersionText = computed(() => latestRelease.value?.version || latestRelease.value?.tag || '')
const primaryDownloadVersionText = computed(() => latestRelease.value?.name || latestRelease.value?.tag || latestVersionText.value)
const latestReleaseNotesText = computed(() => (
  latestRelease.value ? resolveReleaseNotes(latestRelease.value.notes, currentLocale.value) : ''
))
const heroSubtitle = computed(() => t('updates.heroSubtitle'))

const isAllUpdatesView = computed(() => (
  props.forceAllView
  || stripLocalePrefix(route.path) === '/updates/all'
  || route.query.view === 'all'
))
const allUpdatesHref = computed(() => toLocalizedWebPath('/updates/all', currentLocale.value))
const featuredUpdateLimit = 3
const releaseUpdates = computed(() => updateItems.value.filter(update => update.type !== 'announcement').slice(0, featuredUpdateLimit))
const hasUpdateList = computed(() => releaseUpdates.value.length > 0)

const pageTitle = computed(() => (
  isAllUpdatesView.value
    ? `${t('updates.all.title')} · Tuff`
    : t('updates.title', 'Updates & downloads')
))
const pageDescription = computed(() => (
  isAllUpdatesView.value ? t('updates.all.subtitle') : heroSubtitle.value
))

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
  description: pageDescription,
  ogDescription: pageDescription,
})

useHead(() => ({
  bodyAttrs: {
    class: isAllUpdatesView.value ? '' : 'nexus-updates-single-page',
  },
}))

function resolveUpdateText(text: LocalizedText) {
  return isZh.value ? (text.zh || text.en) : (text.en || text.zh)
}

function openUpdateLink(link?: string) {
  if (!link)
    return
  if (/^https?:\/\//i.test(link)) {
    if (import.meta.client && hasWindow())
      window.open(link, '_blank', 'noopener')
    return
  }
  void router.push(link)
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
  return 'var(--tx-text-color-secondary)'
}

const dateFormatter = computed(() => new Intl.DateTimeFormat(currentLocale.value === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' }))

function formatReleaseDate(dateString: string) {
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return t('updates.latest.releaseDateFallback')
  return dateFormatter.value.format(parsed)
}

function getDownloadLabel(asset: { platform: string, arch: string }) {
  return `${getPlatformLabel(asset.platform as 'darwin' | 'win32' | 'linux')} (${getArchLabel(asset.arch as 'x64' | 'arm64' | 'universal')})`
}
</script>

<template>
  <UpdatesAllView v-if="isAllUpdatesView" :updates="updateItems" :loading="updatesSkeleton" />

  <main v-else class="updates-page" aria-labelledby="updates-page-title">
    <img
      class="updates-page__background"
      src="/assets/updates/download-bg.webp"
      alt=""
      aria-hidden="true"
    >
    <div class="updates-page__overlay" aria-hidden="true" />

    <section class="updates-shell">
      <div class="updates-hero-panel animate-fade-in-up">
        <h1 id="updates-page-title" class="updates-title">
          {{ t('updates.title') }}
        </h1>
        <p class="updates-subtitle">
          {{ heroSubtitle }}
        </p>

        <div class="updates-hero-actions">
          <!-- Edge Data Island 1: Latest Release Download with Skeleton loading state -->
          <div v-if="releaseLoading" class="updates-download-skeleton" aria-busy="true">
            <TxSkeleton width="268px" :height="58" :radius="16" />
          </div>

          <a
            v-else-if="primaryDownload"
            :href="primaryDownload.downloadUrl"
            target="_blank"
            rel="noopener"
            class="download-btn updates-primary-download"
          >
            <span :class="primaryDownloadIcon" class="updates-download-icon" aria-hidden="true" />
            <span class="updates-download-copy">
              <strong>{{ t('updates.downloads.downloadForPlatform', { platform: primaryDownloadPlatformLabel }) }}</strong>
              <small v-if="primaryDownloadVersionText">{{ primaryDownloadVersionText }}</small>
            </span>
          </a>

          <a
            v-else
            :href="GITHUB_RELEASES_URL"
            target="_blank"
            rel="noopener"
            class="download-btn updates-primary-download"
          >
            <span :class="primaryDownloadIcon" class="updates-download-icon" aria-hidden="true" />
            <span class="updates-download-copy">
              <strong>{{ t('updates.downloads.downloadForPlatform', { platform: primaryDownloadPlatformLabel }) }}</strong>
              <small>GitHub Releases</small>
            </span>
          </a>

          <div class="updates-platform-menu">
            <button type="button" class="updates-platform-menu__button">
              <span class="i-carbon-apps updates-download-icon" aria-hidden="true" />
              <span>{{ t('updates.downloads.otherPlatformsAndVersions') }}</span>
              <span class="i-carbon-chevron-down text-lg" aria-hidden="true" />
            </button>
            <div v-if="allDownloads.length" class="updates-platform-menu__list">
              <a
                v-for="asset in allDownloads"
                :key="asset.id"
                :href="asset.downloadUrl"
                target="_blank"
                rel="noopener"
                class="updates-platform-menu__item"
              >
                <span>{{ getDownloadLabel(asset) }}</span>
                <span v-if="asset.size">{{ formatFileSize(asset.size) }}</span>
              </a>
            </div>
          </div>

          <p class="updates-platform-hint">
            <span>{{ platformRequirementLabel }}</span>
            <span class="updates-platform-hint__dot">·</span>
            <a :href="GITHUB_RELEASES_URL" target="_blank" rel="noopener" class="updates-more-versions">
              <span>{{ t('updates.downloads.moreVersions') }}</span>
              <span class="i-carbon-chevron-right" aria-hidden="true" />
            </a>
            <template v-if="latestReleaseNotesText">
              <span class="updates-platform-hint__dot">·</span>
              <button type="button" class="updates-notes-btn" @click="notesModalOpen = true">
                <span>{{ isZh ? '查看更新日志' : 'Release Notes' }}</span>
              </button>
            </template>
          </p>
        </div>
      </div>

      <aside class="updates-control-panel animate-fade-in-up" style="animation-delay: 90ms;">
        <section class="updates-news-panel" :aria-label="t('updates.news.title')">
          <div class="updates-news-head">
            <div>
              <h2>{{ t('updates.news.title') }}</h2>
              <p>{{ t('updates.news.latestHint') }}</p>
            </div>
            <NuxtLink :to="allUpdatesHref" class="updates-news-more">
              {{ t('updates.news.viewAll') }}
            </NuxtLink>
          </div>

          <!-- Edge Data Island 2: Public Updates with Skeleton mirroring the 3-card row -->
          <div v-if="updatesSkeleton" class="updates-news-scroller">
            <div class="updates-news-track" aria-busy="true">
              <div v-for="idx in 3" :key="idx" class="updates-news-skeleton-card">
                <TxSkeleton width="65%" :height="15" />
                <TxSkeleton width="42%" :height="11" />
                <TxSkeleton width="94%" :height="12" />
                <TxSkeleton width="76%" :height="12" />
              </div>
            </div>
          </div>

          <TxEdgeFadeMask v-else-if="hasUpdateList" axis="horizontal" :size="42" class="updates-news-scroller">
            <div class="updates-news-track">
              <TxCardItem
                v-for="update in releaseUpdates"
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

          <TxNoData
            v-else
            class="UpdateNewsEmpty"
            :title="t('updates.news.empty')"
            description=""
            icon="i-carbon-notification-off"
            align="start"
            size="small"
          />
        </section>

        <div class="updates-latest-footer">
          <span class="i-carbon-version-major" aria-hidden="true" />
          <span>{{ t('updates.latest.heading') }}</span>
          <strong>{{ latestVersionText || t('updates.latest.releaseDateFallback') }}</strong>
          <span v-if="latestRelease">{{ formatReleaseDate(latestRelease.publishedAt || latestRelease.createdAt) }}</span>
        </div>
      </aside>
    </section>

    <!-- Inline Release Notes Modal (absorbs legacy /notes/[slug] SSR route cleanly) -->
    <ClientOnly>
      <Teleport to="body">
        <div
          v-if="notesModalOpen && latestRelease"
          class="updates-notes-overlay"
          role="dialog"
          aria-modal="true"
          :aria-label="latestVersionText"
          @click.self="notesModalOpen = false"
        >
          <div class="updates-notes-dialog">
            <header class="updates-notes-dialog__head">
              <div>
                <h3>{{ latestRelease.name || latestRelease.tag }}</h3>
                <p>{{ formatReleaseDate(latestRelease.publishedAt || latestRelease.createdAt) }}</p>
              </div>
              <button
                type="button"
                class="updates-notes-dialog__close"
                :aria-label="t('common.close', 'Close')"
                @click="notesModalOpen = false"
              >
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </header>
            <div class="updates-notes-dialog__body">
              <pre class="updates-notes-dialog__text">{{ latestReleaseNotesText }}</pre>
            </div>
          </div>
        </div>
      </Teleport>
    </ClientOnly>
  </main>
</template>

<style scoped>
:global(body.nexus-updates-single-page) {
  overflow: hidden;
  background: #05050a;
}

:global(body.nexus-updates-single-page .TuffFooter) {
  display: none;
}

:global(body.nexus-updates-single-page .TuffHeader-Main) {
  border-color: rgba(255, 255, 255, 0.14) !important;
  background: rgba(5, 8, 18, 0.42) !important;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22);
}

:global(body.nexus-updates-single-page .TuffHeader a),
:global(body.nexus-updates-single-page .TuffHeader button) {
  color: rgba(255, 255, 255, 0.82) !important;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.56s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

.updates-page {
  position: relative;
  isolation: isolate;
  height: 100svh;
  overflow: hidden;
  background: #05050a;
  color: #fff;
}

.updates-page__background {
  position: absolute;
  inset: 0;
  z-index: -3;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  filter: saturate(0.78) brightness(0.74);
}

.updates-page__overlay {
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.04), transparent 42%),
    linear-gradient(90deg, rgba(3, 5, 14, 0.48) 0%, rgba(3, 5, 14, 0.24) 44%, rgba(3, 5, 14, 0.48) 100%),
    linear-gradient(180deg, rgba(3, 5, 14, 0.12), rgba(3, 5, 14, 0.46));
  pointer-events: none;
}

.updates-shell {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(1080px, calc(100% - 56px));
  height: 100%;
  margin: 0 auto;
  grid-template-rows: auto auto;
  align-content: center;
  align-items: start;
  gap: clamp(36px, 5.6svh, 62px);
  padding: clamp(84px, 9svh, 104px) 0 clamp(28px, 5svh, 52px);
}

.updates-hero-panel {
  position: relative;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 18px 32px;
  text-align: center;
}

.updates-title {
  flex: 1 1 100%;
  margin: 0;
  background: linear-gradient(180deg, #fff 4%, rgba(255, 255, 255, 0.82) 42%, rgba(184, 196, 255, 0.52) 100%);
  background-clip: text;
  color: transparent;
  font-size: clamp(48px, 6vw, 78px);
  font-weight: 850;
  letter-spacing: -0.064em;
  line-height: 0.94;
  -webkit-background-clip: text;
}

.updates-subtitle {
  flex: 1 1 100%;
  margin: -4px 0 18px;
  color: rgba(255, 255, 255, 0.5);
  font-size: clamp(14px, 1.35vw, 18px);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.updates-hero-actions {
  display: flex;
  flex: 1 1 100%;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.updates-download-skeleton {
  display: inline-flex;
  align-items: center;
}

.updates-primary-download,
.updates-platform-menu__button {
  min-height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 16px;
  padding: 0 24px;
  font-size: 15px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}

.updates-primary-download {
  min-width: min(268px, 32vw);
  border: 1px solid rgba(176, 163, 255, 0.72);
  background: linear-gradient(135deg, rgba(149, 128, 255, 0.94), rgba(42, 66, 226, 0.88));
  color: #fff;
  box-shadow: 0 26px 80px rgba(80, 76, 255, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.38);
}

.updates-primary-download:hover {
  transform: translateY(-2px);
}

.updates-download-icon {
  flex: 0 0 auto;
  font-size: 24px;
}

.updates-download-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
  text-align: left;
}

.updates-download-copy small {
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 700;
}

.updates-platform-menu {
  position: relative;
  z-index: 20;
}

.updates-platform-menu__button {
  min-width: min(248px, 30vw);
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(8, 12, 34, 0.48);
  color: rgba(255, 255, 255, 0.84);
}

.updates-platform-menu__list {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 40;
  display: none;
  min-width: 260px;
  flex-direction: column;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 20px;
  background: rgba(8, 10, 20, 0.92);
  padding: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
}

.updates-platform-menu:hover .updates-platform-menu__list,
.updates-platform-menu:focus-within .updates-platform-menu__list {
  display: flex;
}

.updates-platform-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 700;
  padding: 10px 12px;
  text-decoration: none;
}

.updates-platform-menu__item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.updates-platform-hint {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 2px 0 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 700;
}

.updates-more-versions,
.updates-notes-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  padding: 0;
  color: rgba(255, 255, 255, 0.76);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgba(147, 102, 255, 0.78);
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}

.updates-platform-hint__dot {
  color: rgba(255, 255, 255, 0.34);
}

.updates-control-panel {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto;
  gap: 12px;
  width: 100%;
  border: 1px solid rgba(150, 156, 220, 0.26);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(11, 16, 38, 0.58), rgba(7, 10, 26, 0.42));
  box-shadow: 0 32px 120px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  padding: 34px 38px 30px;
}

.updates-news-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.updates-news-head h2,
.updates-news-head p {
  margin: 0;
}

.updates-news-head h2 {
  color: #fff;
  font-size: 19px;
  font-weight: 850;
}

.updates-news-head p {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 13px;
}

.updates-news-more {
  flex: 0 0 auto;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 13px;
  font-weight: 800;
  padding: 7px 10px;
  text-decoration: none;
}

.updates-news-more:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.updates-news-scroller {
  margin-top: 24px;
}

.updates-news-track {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.updates-news-skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 132px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.UpdateNewsItem--carousel {
  min-width: 0;
  min-height: 132px;
  --tx-card-item-padding: 18px;
  --tx-card-item-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.055);
}

.UpdateNewsMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
}

.UpdateNewsSummary {
  display: -webkit-box;
  overflow: hidden;
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.updates-latest-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.52);
  font-size: 13px;
  font-weight: 700;
  padding-top: 12px;
}

.updates-latest-footer strong {
  color: rgba(255, 255, 255, 0.9);
}

.updates-notes-overlay {
  position: fixed;
  inset: 0;
  z-index: 25000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(5, 8, 18, 0.72);
}

.updates-notes-dialog {
  width: min(680px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: #10131d;
  color: #f8fafc;
  overflow: hidden;
}

.updates-notes-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.updates-notes-dialog__head h3 {
  margin: 0;
  font-size: 16px;
}

.updates-notes-dialog__head p {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(248, 250, 252, 0.6);
}

.updates-notes-dialog__close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
}

.updates-notes-dialog__body {
  overflow-y: auto;
  padding: 18px 22px;
}

.updates-notes-dialog__text {
  margin: 0;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.7;
  color: rgba(248, 250, 252, 0.86);
}

@media (max-width: 900px) {
  .updates-page {
    height: auto;
    min-height: 100svh;
    overflow: auto;
  }

  .updates-news-track {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import type { AppRelease, ReleaseChannel } from '~/composables/useReleases'
import { computed, ref } from 'vue'
import UpdatesAllView from '~/components/updates/UpdatesAllView.vue'
import { detectArch, detectPlatform, findAssetForPlatform, formatFileSize, getArchLabel, getPlatformLabel } from '~/composables/useReleases'
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

const GITHUB_RELEASES_URL = 'https://github.com/talex-touch/tuff/releases'
const STABLE_RELEASE_CHANNEL: ReleaseChannel = 'RELEASE'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const { releases, fetchReleases } = useReleases()
const { data: updatesPayload } = await useAsyncData('public-updates', () =>
  requestJson<{ updates: DashboardUpdate[] }>('/api/updates'),
)

// Detect user's platform
const userPlatform = ref(detectPlatform())
const userArch = ref(detectArch())

onMounted(() => {
  userPlatform.value = detectPlatform()
  userArch.value = detectArch()
})

onMounted(async () => {
  await fetchReleases({
    channel: STABLE_RELEASE_CHANNEL,
    status: 'published',
    includeAssets: true,
  })
})

const filteredReleases = computed(() => {
  return releases.value
    .filter(r => r.channel === STABLE_RELEASE_CHANNEL)
    .slice()
    .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime())
})

const latestRelease = computed<AppRelease | null>(() => filteredReleases.value[0] ?? null)

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
const primaryDownloadPlatform = computed(() => primaryDownload.value?.platform ?? userPlatform.value)
const primaryDownloadPlatformLabel = computed(() => getPlatformLabel(primaryDownloadPlatform.value as any))
const primaryDownloadIcon = computed(() => {
  if (primaryDownloadPlatform.value === 'darwin')
    return 'i-carbon-logo-apple'
  if (primaryDownloadPlatform.value === 'win32')
    return 'i-carbon-logo-windows'
  if (primaryDownloadPlatform.value === 'linux')
    return 'i-carbon-logo-linux'
  return 'i-carbon-download'
})
const platformRequirementLabel = computed(() => {
  if (primaryDownloadPlatform.value === 'darwin')
    return 'macOS 13.0+ · Apple Silicon or Intel'
  if (primaryDownloadPlatform.value === 'win32')
    return 'Windows 10+ · x64 or ARM64'
  return `${primaryDownloadPlatformLabel.value} · x64 or ARM64`
})
const latestVersionText = computed(() => latestRelease.value?.version || latestRelease.value?.tag || '')
const primaryDownloadVersionText = computed(() => latestRelease.value?.name || latestRelease.value?.tag || latestVersionText.value)
const heroSubtitle = computed(() => isZh.value ? '获取最新版本，体验更强大的创作能力。' : 'Get the latest version and unlock a stronger creative workflow.')

const updateItems = computed<DashboardUpdate[]>(() => updatesPayload.value?.updates ?? [])
const isAllUpdatesView = computed(() => route.path === '/updates/all' || route.query.view === 'all')
const featuredUpdateLimit = 3
const releaseUpdates = computed(() => updateItems.value.filter(update => update.type !== 'announcement').slice(0, featuredUpdateLimit))
const hasUpdateList = computed(() => releaseUpdates.value.length > 0)
const isZh = computed(() => locale.value.startsWith('zh'))

useHead(() => ({
  bodyAttrs: {
    class: isAllUpdatesView.value ? '' : 'nexus-updates-single-page',
  },
}))

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

const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))

function formatReleaseDate(dateString: string) {
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return t('updates.latest.releaseDateFallback')
  return dateFormatter.value.format(parsed)
}

function getDownloadLabel(asset: { platform: string, arch: string }) {
  return `${getPlatformLabel(asset.platform as any)} (${getArchLabel(asset.arch as any)})`
}
</script>

<template>
  <UpdatesAllView v-if="isAllUpdatesView" :updates="updateItems" />

  <main v-else class="updates-page" aria-labelledby="updates-page-title">
    <img
      class="updates-page__background"
      src="/assets/updates/download-bg.png"
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
          <a
            v-if="primaryDownload"
            :href="primaryDownload.downloadUrl"
            target="_blank"
            rel="noopener"
            class="download-btn updates-primary-download"
          >
            <span :class="primaryDownloadIcon" class="updates-download-icon" aria-hidden="true" />
            <span class="updates-download-copy">
              <strong>{{ isZh ? `下载 ${primaryDownloadPlatformLabel} 版` : `Download for ${primaryDownloadPlatformLabel}` }}</strong>
              <small v-if="primaryDownloadVersionText">{{ primaryDownloadVersionText }}</small>
            </span>
          </a>

          <TxButton
            v-else
            variant="bare"
            native-type="button"
            class="updates-disabled-download"
            :disabled="true"
          >
            <span class="i-carbon-incomplete text-lg" aria-hidden="true" />
            <span>{{ t('updates.empty') }}</span>
          </TxButton>

          <div class="updates-platform-menu">
            <TxButton variant="bare" native-type="button" class="updates-platform-menu__button">
              <span class="i-carbon-apps updates-download-icon" aria-hidden="true" />
              <span>{{ isZh ? '其他平台与版本' : 'Other Platforms' }}</span>
              <span class="i-carbon-chevron-down text-lg" aria-hidden="true" />
            </TxButton>
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
              <span>More versions</span>
              <span class="i-carbon-chevron-right" aria-hidden="true" />
            </a>
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
            <NuxtLink to="/updates?view=all" class="updates-news-more">
              {{ isZh ? '查看全部' : 'View all' }}
            </NuxtLink>
          </div>

          <TxEdgeFadeMask v-if="hasUpdateList" axis="horizontal" :size="42" class="updates-news-scroller">
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

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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
  object-fit: fill;
  object-position: center;
  filter: saturate(0.78) brightness(0.74);
  transform: none;
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
  text-shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
}

.updates-title {
  flex: 1 1 100%;
  margin: 0;
  color: #fff;
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
  margin-top: 0;
}

.updates-primary-download,
.updates-disabled-download,
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
  transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
}

.updates-primary-download {
  border: 1px solid rgba(255, 255, 255, 0.76);
  min-width: min(268px, 32vw);
  border-color: rgba(176, 163, 255, 0.72);
  background: linear-gradient(135deg, rgba(149, 128, 255, 0.94), rgba(42, 66, 226, 0.88));
  color: #fff;
  box-shadow: 0 26px 80px rgba(80, 76, 255, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.38);
}

.updates-primary-download:hover {
  transform: translateY(-2px);
  background: linear-gradient(135deg, rgba(166, 148, 255, 0.98), rgba(52, 78, 244, 0.94));
  box-shadow: 0 34px 96px rgba(80, 76, 255, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.48);
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

.updates-download-copy strong,
.updates-download-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.updates-download-copy small {
  color: rgba(255, 255, 255, 0.56);
  font-size: 12px;
  font-weight: 700;
}

.updates-disabled-download {
  --tx-button-bare-bg: rgba(255, 255, 255, 0.18);
  --tx-button-bare-hover: rgba(255, 255, 255, 0.18);
  --tx-button-bare-padding: 0 22px;
  color: rgba(255, 255, 255, 0.74) !important;
}

.updates-platform-menu {
  position: relative;
  z-index: 20;
}

.updates-platform-menu:hover,
.updates-platform-menu:focus-within {
  z-index: 30;
}

.updates-platform-menu__button {
  min-width: min(248px, 30vw) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  background: rgba(8, 12, 34, 0.48) !important;
  color: rgba(255, 255, 255, 0.84) !important;
  --tx-button-bare-padding: 0 24px;
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
}

.updates-platform-menu__button:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.16) !important;
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
  background: rgba(8, 10, 20, 0.84);
  padding: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
}

.updates-platform-menu:hover .updates-platform-menu__list {
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
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 2px 0 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 700;
}

.updates-more-versions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.76);
  text-decoration: underline;
  text-decoration-color: rgba(147, 102, 255, 0.78);
  text-decoration-thickness: 2px;
  text-underline-offset: 5px;
}

.updates-more-versions:hover {
  color: #fff;
  text-decoration-color: rgba(190, 164, 255, 0.96);
}

.updates-platform-hint__dot {
  color: rgba(255, 255, 255, 0.34);
}

.updates-control-panel {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 0;
  grid-template-rows: auto auto;
  align-content: start;
  align-items: start;
  align-self: start;
  gap: 12px;
  overflow: hidden;
  width: 100%;
  border: 1px solid rgba(150, 156, 220, 0.26);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(11, 16, 38, 0.58), rgba(7, 10, 26, 0.42));
  box-shadow: 0 32px 120px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  padding: 34px 38px 30px;
  backdrop-filter: blur(26px) saturate(160%);
  -webkit-backdrop-filter: blur(26px) saturate(160%);
}

.updates-news-panel {
  min-height: 0;
  min-width: 0;
  border-top: 0;
  padding-top: 0;
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
  margin-top: 28px;
}

.updates-news-scroller :deep(.tx-edge-fade-mask__viewport) {
  scrollbar-width: none;
}

.updates-news-scroller :deep(.tx-edge-fade-mask__viewport::-webkit-scrollbar) {
  display: none;
}

.updates-news-track {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 0;
}

.UpdateNewsItem--carousel {
  min-width: 0;
  min-height: 132px;
  --tx-card-item-padding: 18px;
  --tx-card-item-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.055);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  outline: 0;
}

.UpdateNewsItem--carousel:hover,
.UpdateNewsItem--carousel:focus,
.UpdateNewsItem--carousel:focus-visible,
.UpdateNewsItem--carousel:focus-within {
  border-color: rgba(176, 163, 255, 0.26);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 14px 42px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  outline: 0;
}

.UpdateNewsItem--carousel :deep(.tx-card-item),
.UpdateNewsItem--carousel :deep(.tx-card-item:focus),
.UpdateNewsItem--carousel :deep(.tx-card-item:focus-visible),
.UpdateNewsItem--carousel :deep(.tx-card-item:hover) {
  border-radius: 20px;
  outline: 0;
}

.UpdateNewsItem--carousel :deep(.tx-card-item__icon) {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}

.UpdateNewsItem--carousel :deep(.tx-card-item__title) {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.UpdateNewsMeta {
  display: flex;
  min-width: 0;
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

.UpdateNewsEmpty {
  margin-top: 12px;
}

.updates-latest-footer {
  grid-column: 1 / -1;
  display: flex;
  min-width: 0;
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

.download-btn {
  position: relative;
  overflow: hidden;
}

.download-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  transform: translateX(-120%);
  transition: transform 0.52s ease;
}

.download-btn:hover::after {
  transform: translateX(120%);
}

@media (max-width: 980px) {
  .updates-shell {
    width: min(760px, calc(100% - 36px));
    align-content: center;
    gap: 26px;
    padding-top: 88px;
    padding-bottom: 24px;
  }

  .updates-title {
    font-size: clamp(44px, 10vw, 68px);
  }

  .updates-subtitle {
    margin-bottom: 8px;
    font-size: 15px;
  }

  .updates-control-panel {
    max-height: none;
    padding: 24px;
  }

  .updates-news-track {
    display: flex;
    width: max-content;
    gap: 12px;
  }

  .UpdateNewsItem--carousel {
    flex: 0 0 280px;
    border-right: 0;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.06);
    --tx-card-item-padding: 14px;
  }
}

@media (max-width: 640px) {
  .updates-shell {
    width: calc(100% - 28px);
    padding-top: 84px;
    padding-bottom: 16px;
  }

  .updates-title {
    margin-top: 16px;
    font-size: clamp(38px, 12vw, 54px);
  }

  .updates-subtitle {
    margin: -6px 0 2px;
  }

  .updates-hero-actions {
    margin-top: 12px;
  }

  .updates-primary-download,
  .updates-disabled-download,
  .updates-platform-menu,
  .updates-platform-menu__button {
    width: 100%;
    min-width: 0 !important;
  }

  .updates-platform-hint {
    flex-wrap: wrap;
    font-size: 12px;
  }

  .updates-control-panel {
    border-radius: 24px;
    padding: 18px;
  }

  .updates-news-head h2 {
    font-size: 16px;
  }

  .UpdateNewsItem--carousel {
    flex-basis: 260px;
  }
}

@media (max-height: 760px) {
  .updates-shell {
    padding-top: 82px;
    padding-bottom: 16px;
  }

  .updates-title {
    font-size: clamp(42px, 6vw, 68px);
  }

  .updates-subtitle {
    display: none;
  }

  .updates-control-panel {
    gap: 10px;
    padding: 18px 22px;
  }

  .UpdateNewsSummary {
    -webkit-line-clamp: 1;
  }

  .UpdateNewsItem--carousel {
    min-height: 118px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up,
  .updates-primary-download,
  .updates-platform-menu__button,
  .download-btn::after {
    animation: none;
    transition: none;
  }

  .updates-primary-download:hover,
  .updates-platform-menu__button:hover {
    transform: none;
  }
}
</style>

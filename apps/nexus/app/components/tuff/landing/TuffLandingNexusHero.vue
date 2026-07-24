<script setup lang="ts">
import type { AppRelease, ReleaseChannel } from '~/composables/useReleases'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import StarField from '~/components/landing/StarField.vue'
import DarkVeil from '~/components/tuff/background/DarkVeil.vue'
import TuffLandingLineShadowText from '~/components/tuff/landing/TuffLandingLineShadowText.vue'
import { resolveReleaseNotes, useReleases } from '~/composables/useReleases'

// Nexus landing hero — product-first CoreBox surface with live app search,────────────────────────
// Clean atmospheric hero: the homepage DarkVeil aurora over pure black. Title
// keeps the signature line-shadow "OS". The version is a clickable pill that
// flips open an overlay with the release history (live API + static fallback).

type HeroPlatform = 'darwin' | 'win32' | 'linux'

interface ReleaseItem {
  tag: string
  channel: ReleaseChannel
  date: string
  note?: string
}

const { t, locale } = useI18n()
const isZh = computed(() => locale.value.startsWith('zh'))

const heroPlatform = ref<HeroPlatform>('darwin')
const ready = ref(false)
const enableMotion = ref(false)

const triggerRef = ref<HTMLButtonElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)
let revealFrame: number | null = null

const platformName = computed(() => {
  if (heroPlatform.value === 'win32')
    return 'Windows'
  if (heroPlatform.value === 'linux')
    return 'Linux'
  return 'macOS'
})

const copy = computed(() => ({
  titlePrefix: t('landing.nexus.hero.titlePrefix'),
  titleSubject: t('landing.nexus.hero.titleSubject'),
  titleAccent: t('landing.nexus.hero.titleAccent'),
  subtitle: t('landing.nexus.hero.subtitle'),
  primary: t('landing.nexus.hero.getPlatformVersion', { platform: platformName.value }),
  secondary: t('landing.nexus.hero.secondaryCta'),
  openSource: t('landing.nexus.hero.openSource'),
  hintNav: t('landing.nexus.hero.hints.nav'),
  hintOpen: t('landing.nexus.hero.hints.open'),
  hintActions: t('landing.nexus.hero.hints.actions'),
  latest: t('landing.nexus.hero.releases.latest'),
  history: t('landing.nexus.hero.releases.history'),
  historyTitle: t('landing.nexus.hero.releases.historyTitle'),
  whatsNew: t('landing.nexus.hero.releases.whatsNew'),
  viewAll: t('landing.nexus.hero.releases.viewAll'),
  close: t('landing.nexus.hero.releases.close'),
  kApp: t('landing.nexus.hero.results.app'),
  kWeb: t('landing.nexus.hero.results.web'),
  kRecent: t('landing.nexus.hero.results.recent'),
  aOpen: t('landing.nexus.hero.results.open'),
  aGo: t('landing.nexus.hero.results.go'),
  aRecent: t('landing.nexus.hero.results.recentAction'),
}))

// ── Releases (live API, static fallback from real recent tags) ───────────────
const FALLBACK_RELEASES: ReleaseItem[] = [
  { tag: 'v2.4.13-beta.19', channel: 'BETA', date: '2026-07-21' },
  { tag: 'v2.4.13-beta.18', channel: 'BETA', date: '2026-07-21' },
  { tag: 'v2.4.13-beta.17', channel: 'BETA', date: '2026-07-20' },
  { tag: 'v2.4.13-beta.16', channel: 'BETA', date: '2026-07-19' },
  { tag: 'v2.4.13-beta.15', channel: 'BETA', date: '2026-07-19' },
  { tag: 'v2.4.13-beta.14', channel: 'BETA', date: '2026-07-16' },
]

const releaseList = ref<ReleaseItem[]>(FALLBACK_RELEASES)
const { fetchReleases } = useReleases()

const latestRelease = computed(() => releaseList.value[0])
const olderReleases = computed(() => releaseList.value.slice(1))

// Version-pill trust popover: RELEASE builds are officially certified; preview
// channels (Beta/Snapshot) surface concrete caveats instead of a trust claim.
const latestTrust = computed(() => {
  const verified = (latestRelease.value?.channel ?? 'RELEASE') === 'RELEASE'
  return {
    verified,
    title: verified
      ? t('landing.nexus.hero.trust.verifiedTitle')
      : t('landing.nexus.hero.trust.previewTitle'),
    desc: verified
      ? t('landing.nexus.hero.trust.verifiedDesc')
      : t('landing.nexus.hero.trust.previewDesc'),
    points: verified
      ? []
      : [
          t('landing.nexus.hero.trust.points.prerelease'),
          t('landing.nexus.hero.trust.points.stability'),
          t('landing.nexus.hero.trust.points.channel'),
        ],
  }
})

// ── Live app search (typewriter + morphing results, real brand logos) ────────
interface AppEntry {
  query: string
  logo: string
  app: string
  domain: string
  recent: string
}

const APPS: AppEntry[] = [
  { query: 'figma', logo: 'i-logos-figma', app: 'Figma', domain: 'figma.com', recent: 'Figma — Design files' },
  { query: 'spotify', logo: 'i-logos-spotify-icon', app: 'Spotify', domain: 'open.spotify.com', recent: 'Discover Weekly' },
  { query: 'code', logo: 'i-logos-visual-studio-code', app: 'Visual Studio Code', domain: 'code.visualstudio.com', recent: '~/projects/tuff' },
  { query: 'notion', logo: 'i-logos-notion-icon', app: 'Notion', domain: 'notion.so', recent: 'Meeting notes' },
  { query: 'slack', logo: 'i-logos-slack-icon', app: 'Slack', domain: 'app.slack.com', recent: '#general' },
]

interface ResultRow {
  icon: string
  title: string
  sub: string
  action: string
  mark: boolean
}

const typed = ref('')
const activeIndex = ref(0)
const searching = ref(false)
const resultsVisible = ref(false)

const currentRows = computed<ResultRow[]>(() => {
  if (!resultsVisible.value)
    return []
  const app = APPS[activeIndex.value]
  const c = copy.value
  return [
    { icon: app.logo, title: app.app, sub: c.kApp, action: c.aOpen, mark: true },
    { icon: 'i-carbon-earth', title: app.domain, sub: c.kWeb, action: c.aGo, mark: false },
    { icon: 'i-carbon-time', title: app.recent, sub: c.kRecent, action: c.aRecent, mark: false },
  ]
})

let ccCancelled = false
const ccTimers = new Set<number>()

function ccSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!hasWindow()) {
      resolve()
      return
    }
    const id = window.setTimeout(() => {
      ccTimers.delete(id)
      resolve()
    }, ms)
    ccTimers.add(id)
  })
}

async function runSearchLoop(): Promise<void> {
  for (;;) {
    if (ccCancelled)
      return
    const app = APPS[activeIndex.value]

    // Type the query
    for (let i = 1; i <= app.query.length; i++) {
      if (ccCancelled)
        return
      typed.value = app.query.slice(0, i)
      await ccSleep(62)
    }
    if (ccCancelled)
      return

    // Searching…
    searching.value = true
    await ccSleep(460)
    if (ccCancelled)
      return
    searching.value = false

    // Results morph in, hold
    resultsVisible.value = true
    await ccSleep(2400)
    if (ccCancelled)
      return

    // Results morph out, clear, next
    resultsVisible.value = false
    await ccSleep(360)
    for (let i = app.query.length - 1; i >= 0; i--) {
      if (ccCancelled)
        return
      typed.value = app.query.slice(0, i)
      await ccSleep(28)
    }
    activeIndex.value = (activeIndex.value + 1) % APPS.length
    await ccSleep(240)
  }
}

function startSearchDemo() {
  if (enableMotion.value) {
    runSearchLoop()
  }
  else {
    typed.value = APPS[0]?.query ?? ''
    resultsVisible.value = true
  }
}

const CHANNEL_META: Record<ReleaseChannel, { label: string, cls: string }> = {
  RELEASE: { label: 'Stable', cls: 'is-release' },
  BETA: { label: 'Beta', cls: 'is-beta' },
  SNAPSHOT: { label: 'Snapshot', cls: 'is-snapshot' },
}

function channelMeta(channel: ReleaseChannel) {
  return CHANNEL_META[channel] ?? CHANNEL_META.RELEASE
}

function formatDate(input: string): string {
  if (!input)
    return ''
  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime()))
    return input
  return new Intl.DateTimeFormat(isZh.value ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function toReleaseItem(release: AppRelease): ReleaseItem {
  const note = resolveReleaseNotes(release.notes, locale.value)
    ?.split('\n')
    .map(line => line.replace(/^[#>*\-\s]+/, '').trim())
    .find(Boolean)
  return {
    tag: release.tag,
    channel: release.channel ?? 'RELEASE',
    date: release.publishedAt ?? release.createdAt ?? '',
    note: note ? note.slice(0, 120) : undefined,
  }
}

async function loadReleases() {
  try {
    const live = await fetchReleases({ limit: 12 })
    if (live?.length) {
      const sorted = [...live].sort((a, b) =>
        (b.publishedAt ?? b.createdAt ?? '').localeCompare(a.publishedAt ?? a.createdAt ?? ''))
      releaseList.value = sorted.map(toReleaseItem)
    }
  }
  catch {
    // Keep the fallback list — the demo always shows meaningful versions.
  }
}

// ── Flip-overlay (version history) ───────────────────────────────────────────
const overlayOpen = ref(false)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    closeOverlay()
}

function openOverlay() {
  overlayOpen.value = true
  if (!hasWindow())
    return
  document.documentElement.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
  nextTick(() => closeRef.value?.focus())
}

function closeOverlay() {
  if (!overlayOpen.value)
    return
  overlayOpen.value = false
  if (!hasWindow())
    return
  document.documentElement.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
  triggerRef.value?.focus()
}

function detectHeroPlatform(): HeroPlatform {
  if (!hasNavigator())
    return 'darwin'

  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (ua.includes('windows') || platform.includes('win'))
    return 'win32'
  if (ua.includes('linux') || platform.includes('linux'))
    return 'linux'
  return 'darwin'
}

onMounted(() => {
  heroPlatform.value = detectHeroPlatform()

  if (hasWindow())
    enableMotion.value = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  revealFrame = requestAnimationFrame(() => {
    ready.value = true
  })

  loadReleases()
  startSearchDemo()
})

onBeforeUnmount(() => {
  if (revealFrame !== null)
    cancelAnimationFrame(revealFrame)
  ccCancelled = true
  ccTimers.forEach(id => hasWindow() && window.clearTimeout(id))
  ccTimers.clear()
  if (hasWindow()) {
    document.documentElement.style.overflow = ''
    window.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <section
    class="ExpHero TuffHome-HeroSection"
    :class="{ 'is-visible': ready }"
    aria-labelledby="exp-hero1-title"
  >
    <!-- Background: homepage aurora over pure black -->
    <div class="ExpHero-Veil" aria-hidden="true">
      <ClientOnly>
        <DarkVeil
          :hue-shift="354"
          :noise-intensity="0.07"
          :scanline-intensity="0.85"
          :scanline-frequency="4.6"
          :speed="1.4"
          :warp-amount="1.15"
          :resolution-scale="0.72"
        />
      </ClientOnly>
    </div>
    <div v-if="enableMotion" class="ExpHero-Stars" aria-hidden="true">
      <ClientOnly>
        <StarField />
      </ClientOnly>
    </div>
    <div class="ExpHero-Scrim" aria-hidden="true" />

    <div class="ExpHero-Content">
      <h1 id="exp-hero1-title" class="ExpHero-Title reveal" style="--d: 0ms">
        <span class="ExpHero-TitleLine">
          <span class="ExpHero-TitleLead">{{ copy.titlePrefix }}</span>
          <TuffLandingLineShadowText class="ExpHero-TitleOs" :text="copy.titleSubject" />
        </span>
        <strong class="ExpHero-TitleAccent">{{ copy.titleAccent }}</strong>
      </h1>

      <p class="ExpHero-Subtitle reveal" style="--d: 70ms">
        {{ copy.subtitle }}
      </p>

      <div class="ExpHero-Actions reveal" style="--d: 140ms">
        <NuxtLink class="NexusButton is-primary" to="/updates">
          <TxOsIcon :platform="heroPlatform" />
          <span>{{ copy.primary }}</span>
        </NuxtLink>
        <NuxtLink class="NexusButton" to="/docs">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ copy.secondary }}</span>
        </NuxtLink>
      </div>

      <div v-if="latestRelease" class="ExpHero-VersionWrap reveal" style="--d: 200ms">
        <button
          ref="triggerRef"
          type="button"
          class="ExpHero-VersionPill"
          aria-haspopup="dialog"
          :aria-expanded="overlayOpen"
          @click="openOverlay"
        >
          <span class="ExpHero-VersionDot" :class="channelMeta(latestRelease.channel).cls" aria-hidden="true" />
          <span class="ExpHero-VersionLabel">{{ copy.latest }}</span>
          <span class="ExpHero-VersionTag">{{ latestRelease.tag }}</span>
          <span class="ExpHero-VersionSep" aria-hidden="true" />
          <span class="ExpHero-VersionHistory">{{ copy.history }}</span>
          <span class="i-carbon-chevron-down ExpHero-VersionChevron" aria-hidden="true" />
        </button>

        <div
          class="ExpHero-VersionPop"
          :class="latestTrust.verified ? 'is-verified' : 'is-preview'"
          role="tooltip"
        >
          <div class="ExpHero-VersionPopHead">
            <span class="ExpHero-VersionPopIcon" aria-hidden="true">
              <span
                :class="latestTrust.verified ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-alt-filled'"
              />
            </span>
            <span class="ExpHero-VersionPopTitle">{{ latestTrust.title }}</span>
          </div>
          <p class="ExpHero-VersionPopDesc">
            {{ latestTrust.desc }}
          </p>
          <ul v-if="latestTrust.points.length" class="ExpHero-VersionPopList">
            <li v-for="point in latestTrust.points" :key="point">
              {{ point }}
            </li>
          </ul>
        </div>
      </div>

      <div class="ExpHero-Trust reveal" style="--d: 260ms">
        <span>macOS · Windows · Linux</span>
        <span class="ExpHero-Dot" aria-hidden="true" />
        <span class="ExpHero-OpenSource">
          <span class="i-carbon-logo-github" aria-hidden="true" />
          {{ copy.openSource }}
        </span>
      </div>
    </div>

    <!-- Product surface: a single command window anchors the composition -->
    <div class="ExpHero-Product reveal" style="--d: 350ms">
      <div class="CommandCard">
        <div class="CommandCard-Search">
          <span v-if="searching" class="CommandCard-Spinner" aria-hidden="true" />
          <span v-else class="i-carbon-search CommandCard-SearchIcon" aria-hidden="true" />
          <span class="CommandCard-Query">{{ typed }}</span>
          <span class="CommandCard-Caret" aria-hidden="true" />
          <span class="CommandCard-Kbd">⌘E</span>
        </div>

        <div class="CommandCard-Results">
          <TransitionGroup name="cc-row">
            <div
              v-for="(row, i) in currentRows"
              :key="`${activeIndex}-${i}`"
              class="CommandCard-Row"
              :class="{ 'is-selected': i === 0 }"
              :style="{ '--i': i }"
            >
              <span
                class="CommandCard-Tile"
                :class="row.mark ? 'is-logo' : 'is-neutral'"
                aria-hidden="true"
              >
                <span :class="row.icon" />
              </span>
              <span class="CommandCard-Meta">
                <span class="CommandCard-Title">{{ row.title }}</span>
                <span class="CommandCard-Sub">{{ row.sub }}</span>
              </span>
              <span class="CommandCard-Action">
                <span v-if="i === 0" class="CommandCard-Enter" aria-hidden="true">⏎</span>
                {{ row.action }}
              </span>
            </div>
          </TransitionGroup>
        </div>

        <div class="CommandCard-Footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ copy.hintNav }}</span>
          <span><kbd>⏎</kbd> {{ copy.hintOpen }}</span>
          <span><kbd>⌘</kbd><kbd>K</kbd> {{ copy.hintActions }}</span>
        </div>
      </div>
    </div>

    <!-- Flip-overlay: version history -->
    <ClientOnly>
      <Teleport to="body">
        <Transition name="ovl">
          <div
            v-if="overlayOpen"
            class="VersionOverlay"
            @click.self="closeOverlay"
          >
            <div
              class="VersionOverlay-Panel"
              role="dialog"
              aria-modal="true"
              :aria-label="copy.historyTitle"
            >
              <header class="VersionOverlay-Head">
                <span class="VersionOverlay-Title">
                  <span class="i-carbon-version" aria-hidden="true" />
                  {{ copy.historyTitle }}
                </span>
                <button
                  ref="closeRef"
                  type="button"
                  class="VersionOverlay-Close"
                  :aria-label="copy.close"
                  @click="closeOverlay"
                >
                  <span class="i-carbon-close" aria-hidden="true" />
                </button>
              </header>

              <NuxtLink
                v-if="latestRelease"
                class="VersionOverlay-Latest"
                to="/updates"
                @click="closeOverlay"
              >
                <div class="VersionOverlay-LatestTop">
                  <span class="ReleasesChannel" :class="channelMeta(latestRelease.channel).cls">
                    {{ channelMeta(latestRelease.channel).label }}
                  </span>
                  <span class="VersionOverlay-Ver">{{ latestRelease.tag }}</span>
                  <span class="VersionOverlay-LatestBadge">
                    <span class="i-carbon-star-filled" aria-hidden="true" />
                    {{ copy.latest }}
                  </span>
                </div>
                <p class="VersionOverlay-Note">
{{ latestRelease.note || copy.whatsNew }}
</p>
                <div class="VersionOverlay-LatestFoot">
                  <span class="VersionOverlay-Date">{{ formatDate(latestRelease.date) }}</span>
                  <span class="VersionOverlay-Whats">
                    {{ copy.whatsNew }}
                    <span class="i-carbon-arrow-right" aria-hidden="true" />
                  </span>
                </div>
              </NuxtLink>

              <ul class="VersionOverlay-List">
                <li v-for="item in olderReleases" :key="item.tag">
                  <NuxtLink class="VersionOverlay-Row" to="/updates" @click="closeOverlay">
                    <span class="VersionOverlay-RowDot" :class="channelMeta(item.channel).cls" aria-hidden="true" />
                    <span class="VersionOverlay-RowTag">{{ item.tag }}</span>
                    <span class="VersionOverlay-RowChannel">{{ channelMeta(item.channel).label }}</span>
                    <span class="VersionOverlay-RowDate">{{ formatDate(item.date) }}</span>
                  </NuxtLink>
                </li>
              </ul>

              <footer class="VersionOverlay-Foot">
                <NuxtLink to="/updates" class="VersionOverlay-All" @click="closeOverlay">
                  {{ copy.viewAll }}
                  <span class="i-carbon-arrow-right" aria-hidden="true" />
                </NuxtLink>
              </footer>
            </div>
          </div>
        </Transition>
      </Teleport>
    </ClientOnly>
  </section>
</template>

<style scoped>
.ExpHero {
  --nexus-ink: #f6f7f4;

  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100svh;
  padding: 6.5rem 1.5rem 3.5rem;
  overflow: hidden;
  color: var(--nexus-ink);
  background: #030305;
}

.ExpHero-Veil,
.ExpHero-Stars,
.ExpHero-Scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Pure-black base; the DarkVeil canvas paints the aurora on top */
.ExpHero-Veil {
  z-index: 0;
  background: #030305;
}

.ExpHero-Veil :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.ExpHero-Stars {
  z-index: 0;
  opacity: 0.8;
}

/* Vignette only — darkens toward the edges, keeps text legible */
.ExpHero-Scrim {
  z-index: 1;
  background:
    radial-gradient(72% 60% at 50% 42%, transparent 0%, rgba(3, 3, 5, 0.66) 100%),
    linear-gradient(180deg, rgba(3, 3, 5, 0.3) 0%, rgba(3, 3, 5, 0) 38%, rgba(3, 3, 5, 0.78) 100%);
}

.ExpHero-Content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 60rem);
  text-align: center;
}

/* ── Reveal ─────────────────────────────────────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translate3d(0, 16px, 0);
  transition:
    opacity 660ms cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 720ms cubic-bezier(0.22, 0.61, 0.36, 1);
  transition-delay: var(--d, 0ms);
}

.is-visible .reveal {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

/* ── Title ──────────────────────────────────────────────────────────────── */
.ExpHero-Title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0 0.28em;
  max-width: 20ch;
  margin: 0;
  line-height: 1.04;
  letter-spacing: -0.01em;
}

.ExpHero-TitleLine {
  display: inline-flex;
  align-items: baseline;
  gap: 0.24em;
}

.ExpHero-TitleLead {
  color: #fff;
  font-size: clamp(2.7rem, 5.6vw, 5.2rem);
  font-weight: 820;
  line-height: 1.04;
  text-shadow: 0 0 28px rgba(255, 255, 255, 0.16);
}

.ExpHero-TitleOs {
  --line-shadow-color: rgba(246, 247, 244, 0.85);

  color: #fff;
  font-size: clamp(2.7rem, 5.6vw, 5.2rem);
  font-weight: 830;
  line-height: 1.04;
}

.ExpHero-TitleAccent {
  background: linear-gradient(180deg, #f3ecff 0%, #bf9cff 28%, #7f6cff 62%, #5b3df4 100%);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  font-size: clamp(2.7rem, 5.6vw, 5.2rem);
  font-weight: 850;
  line-height: 1.04;
  /* Extend the painted box below the baseline so gradient descenders (g, p) aren't clipped */
  padding-bottom: 0.12em;
  filter: drop-shadow(0 18px 54px rgba(105, 75, 255, 0.36));
}

/* ── Subtitle ───────────────────────────────────────────────────────────── */
.ExpHero-Subtitle {
  max-width: 44ch;
  margin: clamp(0.9rem, 1.6vw, 1.3rem) 0 0;
  color: rgba(246, 247, 244, 0.68);
  font-size: clamp(0.98rem, 1.35vw, 1.18rem);
  font-weight: 460;
  line-height: 1.5;
}

/* ── Actions ────────────────────────────────────────────────────────────── */
.ExpHero-Actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  margin-top: clamp(1.4rem, 2.4vw, 2rem);
}

.NexusButton {
  display: inline-flex;
  min-height: 3rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid rgba(246, 247, 244, 0.22);
  border-radius: 999px;
  padding: 0.78rem 1.35rem;
  color: var(--nexus-ink);
  font-size: 0.96rem;
  font-weight: 680;
  text-decoration: none;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    transform 180ms ease;
}

.NexusButton:hover {
  border-color: rgba(246, 247, 244, 0.4);
  background: rgba(246, 247, 244, 0.05);
  transform: translateY(-1px);
}

.NexusButton:focus-visible {
  outline: 2px solid rgba(154, 208, 188, 0.78);
  outline-offset: 3px;
}

.NexusButton.is-primary {
  border-color: transparent;
  background: var(--nexus-ink);
  color: #07100d;
}

.NexusButton.is-primary:hover {
  background: rgba(246, 247, 244, 0.88);
}

/* ── Version pill (opens flip overlay, hover reveals trust popover) ──────── */
.ExpHero-VersionWrap {
  position: relative;
  display: inline-flex;
  margin-top: 1.2rem;
}

.ExpHero-VersionPill {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgba(246, 247, 244, 0.14);
  border-radius: 999px;
  background: rgba(16, 18, 28, 0.55);
  padding: 0.42rem 0.85rem;
  color: rgba(246, 247, 244, 0.75);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 560;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition:
    border-color 180ms ease,
    background-color 180ms ease,
    transform 180ms ease;
}

.ExpHero-VersionPill:hover {
  border-color: rgba(127, 108, 255, 0.55);
  background: rgba(30, 28, 52, 0.6);
  transform: translateY(-1px);
}

.ExpHero-VersionPill:focus-visible {
  outline: 2px solid rgba(146, 132, 255, 0.8);
  outline-offset: 3px;
}

.ExpHero-VersionDot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: rgba(246, 247, 244, 0.4);
}

.ExpHero-VersionDot.is-release {
  background: #35c2a4;
  box-shadow: 0 0 10px rgba(53, 194, 164, 0.7);
}

.ExpHero-VersionDot.is-beta {
  background: #7f6cff;
  box-shadow: 0 0 10px rgba(127, 108, 255, 0.7);
}

.ExpHero-VersionDot.is-snapshot {
  background: #febc2e;
  box-shadow: 0 0 10px rgba(254, 188, 46, 0.7);
}

.ExpHero-VersionLabel {
  color: rgba(246, 247, 244, 0.48);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
}

.ExpHero-VersionTag {
  color: #fff;
  font-weight: 680;
}

.ExpHero-VersionSep {
  width: 1px;
  height: 0.9rem;
  background: rgba(246, 247, 244, 0.16);
}

.ExpHero-VersionHistory {
  color: #cbb8ff;
  font-weight: 620;
}

.ExpHero-VersionChevron {
  color: rgba(203, 184, 255, 0.8);
  font-size: 0.9rem;
}

/* ── Version trust popover (hover / keyboard-focus) ──────────────────────── */
.ExpHero-VersionPop {
  position: absolute;
  top: calc(100% + 10px);
  left: 50%;
  z-index: 30;
  width: max-content;
  max-width: min(21rem, 82vw);
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(246, 247, 244, 0.14);
  border-radius: 14px;
  background: rgba(18, 20, 30, 0.94);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 24px 60px rgba(3, 4, 10, 0.62);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  text-align: left;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate(-50%, 6px);
  transition:
    opacity 200ms ease,
    transform 200ms ease,
    visibility 200ms;
}

/* Arrow + a transparent bridge so the cursor can cross the gap without closing */
.ExpHero-VersionPop::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: rgba(18, 20, 30, 0.94);
}

.ExpHero-VersionPop::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  height: 16px;
}

.ExpHero-VersionWrap:hover .ExpHero-VersionPop,
.ExpHero-VersionWrap:focus-within .ExpHero-VersionPop {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.ExpHero-VersionPopHead {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.ExpHero-VersionPopIcon {
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 999px;
  font-size: 0.9rem;
}

.ExpHero-VersionPop.is-verified .ExpHero-VersionPopIcon {
  color: #7ff0d5;
  background: rgba(53, 194, 164, 0.18);
}

.ExpHero-VersionPop.is-preview .ExpHero-VersionPopIcon {
  color: #ffd98a;
  background: rgba(254, 188, 46, 0.18);
}

.ExpHero-VersionPopTitle {
  color: #fff;
  font-size: 0.9rem;
  font-weight: 680;
}

.ExpHero-VersionPopDesc {
  margin: 0;
  color: rgba(246, 247, 244, 0.72);
  font-size: 0.82rem;
  line-height: 1.5;
}

.ExpHero-VersionPopList {
  display: grid;
  gap: 0.34rem;
  margin: 0.55rem 0 0;
  padding: 0;
  list-style: none;
}

.ExpHero-VersionPopList li {
  position: relative;
  padding-left: 0.9rem;
  color: rgba(246, 247, 244, 0.66);
  font-size: 0.78rem;
  line-height: 1.45;
}

.ExpHero-VersionPopList li::before {
  content: '';
  position: absolute;
  top: 0.5rem;
  left: 0.12rem;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: #ffd98a;
  opacity: 0.8;
}

/* ── Trust row ──────────────────────────────────────────────────────────── */
.ExpHero-Trust {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1rem;
  color: rgba(246, 247, 244, 0.5);
  font-size: 0.86rem;
  font-weight: 560;
}

.ExpHero-OpenSource {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
}

.ExpHero-Dot {
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.6;
}

/* ── Product surface (single, centered) ─────────────────────────────────── */
.ExpHero-Product {
  position: relative;
  z-index: 2;
  width: min(100%, 40rem);
  margin-top: clamp(1.9rem, 3.5vw, 2.9rem);
}

/* ── CommandCard — faithful to the real CoreBox (frameless frosted window) ── */
.CommandCard {
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(20, 20, 22, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 24px 70px rgba(0, 0, 0, 0.6),
    0 8px 24px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  overflow: hidden;
  text-align: left;
}

/* Input is the window header — large, borderless, with a hairline divider */
.CommandCard-Search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.CommandCard-SearchIcon {
  font-size: 1.3rem;
  color: #8d9095;
}

.CommandCard-Query {
  color: #e5eaf3;
  font-size: 1.2rem;
  font-weight: 500;
}

.CommandCard-Caret {
  width: 2px;
  height: 1.35rem;
  border-radius: 2px;
  background: #409eff;
  margin-left: 1px;
  animation: exp-blink 1.1s step-end infinite;
}

.CommandCard-Kbd {
  margin-left: auto;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.22rem 0.5rem;
  color: #a3a6ad;
  font-size: 0.78rem;
  font-weight: 600;
}

.CommandCard-Results {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.5rem;
  min-height: 12.6rem;
}

/* CoreBox keeps a constant 1px border and only recolors it on active/hover */
.CommandCard-Row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 0.6rem 0.65rem;
  transition: background-color 0.125s, border-color 0.125s;
}

.CommandCard-Row.is-selected {
  background: rgba(64, 158, 255, 0.12);
  border-color: rgba(64, 158, 255, 0.55);
}

.CommandCard-Tile {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 11px;
  flex-shrink: 0;
}

/* App row: real full-colour logo on a light icon plate (macOS-like) */
.CommandCard-Tile.is-logo {
  background: linear-gradient(180deg, #ffffff, #eceef3);
  font-size: 1.6rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 2px 6px rgba(0, 0, 0, 0.35);
}

/* Web / recent rows: monochrome glyph on a glass tile */
.CommandCard-Tile.is-neutral {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #a3a6ad;
  font-size: 1.25rem;
}

/* Searching spinner (briefly replaces the search glyph) */
.CommandCard-Spinner {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.14);
  border-top-color: #409eff;
  animation: cc-spin 0.7s linear infinite;
}

@keyframes cc-spin {
  to { transform: rotate(360deg); }
}

/* Result morph: staggered enter, quick leave */
.cc-row-enter-active {
  transition:
    opacity 380ms ease,
    transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1);
  transition-delay: calc(var(--i, 0) * 60ms);
}

.cc-row-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.cc-row-enter-from {
  opacity: 0;
  transform: translate3d(0, 12px, 0);
}

.cc-row-leave-to {
  opacity: 0;
  transform: translate3d(0, -6px, 0);
}

.CommandCard-Meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.CommandCard-Title {
  color: #e5eaf3;
  font-size: 0.98rem;
  font-weight: 560;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.CommandCard-Sub {
  color: #8d9095;
  font-size: 0.84rem;
}

.CommandCard-Action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  color: #8d9095;
  font-size: 0.84rem;
  font-weight: 500;
  white-space: nowrap;
}

.CommandCard-Row.is-selected .CommandCard-Action {
  color: #cfd3dc;
}

.CommandCard-Enter {
  display: grid;
  place-items: center;
  min-width: 1.4rem;
  height: 1.4rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e5eaf3;
  font-size: 0.82rem;
}

.CommandCard-Footer {
  display: flex;
  gap: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0.65rem 1rem;
  color: #8d9095;
  font-size: 0.78rem;
}

.CommandCard-Footer span {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.CommandCard-Footer kbd {
  display: inline-grid;
  place-items: center;
  min-width: 1.2rem;
  height: 1.2rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.03);
  padding: 0 0.25rem;
  color: #a3a6ad;
  font-size: 0.72rem;
  font-family: inherit;
}

@keyframes exp-blink {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}

@media (max-width: 640px) {
  .ExpHero {
    padding: 5.5rem 1.15rem 2.5rem;
  }

  .ExpHero-Actions,
  .NexusButton {
    width: 100%;
  }

  .ExpHero-Trust {
    flex-wrap: wrap;
    justify-content: center;
  }

  .CommandCard-Footer {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .CommandCard-Caret {
    animation: none;
  }

  .CommandCard-Spinner {
    animation: none;
  }

  .cc-row-enter-active,
  .cc-row-leave-active {
    transition: none;
  }

  .ExpHero-VersionPop {
    transform: translate(-50%, 0);
    transition: none;
  }
}
</style>

<style>
/* Teleported overlay — global (panel lives on <body>) */
.VersionOverlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(3, 3, 6, 0.66);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  perspective: 1600px;
}

.VersionOverlay-Panel {
  width: min(100%, 30rem);
  max-height: min(80vh, 42rem);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(246, 247, 244, 0.12);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(26, 28, 42, 0.96) 0%, rgba(14, 15, 24, 0.98) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 50px 140px rgba(3, 4, 10, 0.7),
    0 0 90px rgba(110, 114, 255, 0.18);
  transform-origin: top center;
  overflow: hidden;
}

.VersionOverlay-Head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.2rem 0.85rem;
  border-bottom: 1px solid rgba(246, 247, 244, 0.08);
}

.VersionOverlay-Title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #f6f7f4;
  font-size: 1.02rem;
  font-weight: 700;
}

.VersionOverlay-Title [class^="i-carbon"] {
  color: #bf9cff;
}

.VersionOverlay-Close {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(246, 247, 244, 0.12);
  border-radius: 9px;
  background: rgba(246, 247, 244, 0.04);
  color: rgba(246, 247, 244, 0.7);
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}

.VersionOverlay-Close:hover {
  background: rgba(246, 247, 244, 0.1);
  color: #fff;
}

.VersionOverlay-Close:focus-visible {
  outline: 2px solid rgba(146, 132, 255, 0.8);
  outline-offset: 2px;
}

.VersionOverlay-Latest {
  display: block;
  margin: 0.9rem 1rem 0.4rem;
  border-radius: 14px;
  border: 1px solid rgba(127, 108, 255, 0.3);
  background: linear-gradient(180deg, rgba(127, 108, 255, 0.18), rgba(127, 108, 255, 0.05));
  padding: 0.85rem 0.9rem;
  text-decoration: none;
  transition: border-color 180ms ease, transform 180ms ease;
}

.VersionOverlay-Latest:hover {
  border-color: rgba(127, 108, 255, 0.6);
  transform: translateY(-1px);
}

.VersionOverlay-LatestTop {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.VersionOverlay-Ver {
  color: #fff;
  font-size: 1.05rem;
  font-weight: 720;
}

.ReleasesChannel {
  border-radius: 999px;
  padding: 0.15rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.ReleasesChannel.is-release { background: rgba(53, 194, 164, 0.18); color: #7ff0d5; }
.ReleasesChannel.is-beta { background: rgba(127, 108, 255, 0.22); color: #c9bcff; }
.ReleasesChannel.is-snapshot { background: rgba(254, 188, 46, 0.18); color: #ffd98a; }

.VersionOverlay-LatestBadge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  color: rgba(246, 247, 244, 0.6);
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.VersionOverlay-LatestBadge .i-carbon-star-filled {
  color: #ffcf6b;
}

.VersionOverlay-Note {
  margin: 0.55rem 0 0.7rem;
  color: rgba(246, 247, 244, 0.68);
  font-size: 0.88rem;
  line-height: 1.45;
}

.VersionOverlay-LatestFoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.VersionOverlay-Date {
  color: rgba(246, 247, 244, 0.5);
  font-size: 0.82rem;
}

.VersionOverlay-Whats {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  color: #bf9cff;
  font-size: 0.84rem;
  font-weight: 640;
}

.VersionOverlay-List {
  list-style: none;
  margin: 0.35rem 0.6rem 0.5rem;
  padding: 0;
  overflow-y: auto;
}

.VersionOverlay-Row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  border-radius: 10px;
  padding: 0.6rem 0.6rem;
  text-decoration: none;
  transition: background-color 150ms ease;
}

.VersionOverlay-Row:hover {
  background: rgba(246, 247, 244, 0.05);
}

.VersionOverlay-RowDot {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 999px;
  flex-shrink: 0;
}

.VersionOverlay-RowDot.is-release { background: #35c2a4; box-shadow: 0 0 10px rgba(53, 194, 164, 0.7); }
.VersionOverlay-RowDot.is-beta { background: #7f6cff; box-shadow: 0 0 10px rgba(127, 108, 255, 0.7); }
.VersionOverlay-RowDot.is-snapshot { background: #febc2e; box-shadow: 0 0 10px rgba(254, 188, 46, 0.7); }

.VersionOverlay-RowTag {
  color: rgba(246, 247, 244, 0.88);
  font-size: 0.9rem;
  font-weight: 580;
}

.VersionOverlay-RowChannel {
  color: rgba(246, 247, 244, 0.4);
  font-size: 0.76rem;
}

.VersionOverlay-RowDate {
  margin-left: auto;
  color: rgba(246, 247, 244, 0.44);
  font-size: 0.8rem;
}

.VersionOverlay-Foot {
  border-top: 1px solid rgba(246, 247, 244, 0.08);
  padding: 0.85rem 1.2rem;
}

.VersionOverlay-All {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #cbb8ff;
  font-size: 0.88rem;
  font-weight: 640;
  text-decoration: none;
}

.VersionOverlay-All:hover {
  color: #e0d3ff;
}

/* Flip transition: backdrop fades, panel flips over the top edge */
.ovl-enter-active,
.ovl-leave-active {
  transition: opacity 300ms ease;
}

.ovl-enter-from,
.ovl-leave-to {
  opacity: 0;
}

.ovl-enter-active .VersionOverlay-Panel {
  transition: transform 460ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 300ms ease;
}

.ovl-leave-active .VersionOverlay-Panel {
  transition: transform 260ms ease, opacity 220ms ease;
}

.ovl-enter-from .VersionOverlay-Panel {
  opacity: 0;
  transform: rotateX(-90deg) translateY(-14px);
}

.ovl-leave-to .VersionOverlay-Panel {
  opacity: 0;
  transform: rotateX(28deg) translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .ovl-enter-active .VersionOverlay-Panel,
  .ovl-leave-active .VersionOverlay-Panel {
    transition: opacity 200ms ease;
  }

  .ovl-enter-from .VersionOverlay-Panel,
  .ovl-leave-to .VersionOverlay-Panel {
    transform: none;
  }
}
</style>

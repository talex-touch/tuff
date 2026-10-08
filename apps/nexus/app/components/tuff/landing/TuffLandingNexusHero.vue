<script setup lang="ts">
import type { TxVersionBuild, TxVersionChannelTone } from '@talex-touch/tuffex/version-capsule'
import type { AppRelease, AssetArch, AssetPlatform, ReleaseAsset, ReleaseChannel } from '~/composables/useReleases'
import { TxVersionCapsule, TxVersionDownloadPanel } from '@talex-touch/tuffex/version-capsule'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import TuffLandingLineShadowText from '~/components/tuff/landing/TuffLandingLineShadowText.vue'
import {
  detectArch,
  findAssetForPlatform,
  formatFileSize,
  getArchLabel,
  getPlatformLabel,
  resolveReleaseNotes,
  useReleases,
} from '~/composables/useReleases'

// Nexus landing hero — product-first CoreBox surface with live app search.
// Clean atmospheric hero: the 404 page's event-horizon field (nebula +
// starfield, no singularity) over pure black, revealed on load by a centered
// water-ripple wavefront. The first title line keeps the signature line shadow.

const LazyEventHorizon = defineAsyncComponent(() => import('~/components/tuff/background/EventHorizon.vue'))
//
// Two download channels, two affordances that must never compete: the primary
// CTA ships the certified RELEASE build, while the split capsule below it owns
// the preview channel. The capsule's left half opens the download panel; the
// right half is a plain trigger for the full-screen release-history overlay.

type HeroPlatform = 'darwin' | 'win32' | 'linux'

interface ReleaseItem {
  id: string
  tag: string
  channel: ReleaseChannel
  date: string
  note?: string
  /** Kept on the item so the capsule can offer a real download without a second fetch. */
  assets?: ReleaseAsset[]
}

const { t, locale } = useI18n()
const isZh = computed(() => locale.value.startsWith('zh'))

const heroPlatform = ref<HeroPlatform>('darwin')
const ready = ref(false)
const enableMotion = ref(false)

const triggerRef = ref<InstanceType<typeof TxVersionCapsule> | null>(null)
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
  primary: t('landing.nexus.hero.getPlatformVersion', { platform: platformName.value }),
  secondary: t('landing.nexus.hero.secondaryCta'),
  openSource: t('landing.nexus.hero.openSource'),
  placeholder: t('landing.nexus.hero.corebox.placeholder'),
  hintOpen: t('landing.nexus.hero.corebox.hints.open'),
  hintExecute: t('landing.nexus.hero.corebox.hints.execute'),
  hintActions: t('landing.nexus.hero.corebox.hints.actions'),
  hintQuickRun: t('landing.nexus.hero.corebox.hints.quickRun'),
  typeApp: t('landing.nexus.hero.corebox.types.app'),
  typeFile: t('landing.nexus.hero.corebox.types.file'),
  typeSystem: t('landing.nexus.hero.corebox.types.system'),
  fileSub: t('landing.nexus.hero.corebox.scenes.fileSub'),
  webSearch: t('landing.nexus.hero.corebox.scenes.webSearch'),
  webSearchSub: t('landing.nexus.hero.corebox.scenes.webSearchSub'),
  translate: t('landing.nexus.hero.corebox.scenes.translate'),
  translateSub: t('landing.nexus.hero.corebox.scenes.translateSub'),
  translateMulti: t('landing.nexus.hero.corebox.scenes.translateMulti'),
  translateMultiSub: t('landing.nexus.hero.corebox.scenes.translateMultiSub'),
  latest: t('landing.nexus.hero.releases.latest'),
  history: t('landing.nexus.hero.releases.history'),
  historyTitle: t('landing.nexus.hero.releases.historyTitle'),
  whatsNew: t('landing.nexus.hero.releases.whatsNew'),
  viewAll: t('landing.nexus.hero.releases.viewAll'),
  close: t('landing.nexus.hero.releases.close'),
  downloadBuild: t('landing.nexus.hero.releases.downloadBuild'),
  chooseBuild: t('landing.nexus.hero.releases.chooseBuild'),
  download: t('landing.nexus.hero.releases.download'),
  noBuilds: t('landing.nexus.hero.releases.noBuilds'),
  certifiedTrack: t('landing.nexus.hero.releases.certifiedTrack'),
  getStable: t('landing.nexus.hero.releases.getStable'),
}))

// A full-width CJK mark draws in the left half of its em box, so a centred line
// ending in "，" or "。" sits visibly left of centre. The mark is split off and
// pulled in by that empty half (see .ExpHero-Punct).
const TRAILING_CJK_PUNCT = /[，。！？、；：]$/

// How much of each mark's em box stays empty on its right, measured on PingFang
// SC at the hero's size by ink extent; anything else gets the plain half.
const PUNCT_TRIM: Record<string, string> = { '，': '-0.68em', '。': '-0.58em' }

function punctTrim(punct: string): string {
  return PUNCT_TRIM[punct] ?? '-0.5em'
}

function splitTrailingPunct(text: string): { body: string, punct: string } {
  return TRAILING_CJK_PUNCT.test(text)
    ? { body: text.slice(0, -1), punct: text.slice(-1) }
    : { body: text, punct: '' }
}

const titleSubject = computed(() => splitTrailingPunct(copy.value.titleSubject))
const titleAccent = computed(() => splitTrailingPunct(copy.value.titleAccent))

// ── Releases (live API, static fallback from real recent tags) ───────────────
// The tail entry is the real latest stable tag — without it the primary CTA has
// no certified build to point at whenever the releases API is unreachable.
const FALLBACK_RELEASES: ReleaseItem[] = [
  { id: 'v2.4.13-beta.19', tag: 'v2.4.13-beta.19', channel: 'BETA', date: '2026-07-21' },
  { id: 'v2.4.13-beta.18', tag: 'v2.4.13-beta.18', channel: 'BETA', date: '2026-07-21' },
  { id: 'v2.4.13-beta.17', tag: 'v2.4.13-beta.17', channel: 'BETA', date: '2026-07-20' },
  { id: 'v2.4.13-beta.16', tag: 'v2.4.13-beta.16', channel: 'BETA', date: '2026-07-19' },
  { id: 'v2.4.13-beta.15', tag: 'v2.4.13-beta.15', channel: 'BETA', date: '2026-07-19' },
  { id: 'v2.4.12', tag: 'v2.4.12', channel: 'RELEASE', date: '2026-06-23' },
]

const releaseList = ref<ReleaseItem[]>(FALLBACK_RELEASES)
const stableRelease = ref<ReleaseItem | null>(
  FALLBACK_RELEASES.find(item => item.channel === 'RELEASE') ?? null,
)
const { fetchLatestRelease, fetchReleases } = useReleases()

const latestRelease = computed(() => releaseList.value[0])
const olderReleases = computed(() => releaseList.value.slice(1))

// The capsule's download panel leads with a trust statement: RELEASE builds are
// officially certified, preview channels surface concrete caveats instead. The
// caveats sit on the path to the download so they read as consent, not decor.
const capsuleNotice = computed(() => {
  const verified = (latestRelease.value?.channel ?? 'RELEASE') === 'RELEASE'
  return {
    tone: verified ? ('success' as const) : ('warning' as const),
    title: verified
      ? t('landing.nexus.hero.trust.verifiedTitle')
      : t('landing.nexus.hero.trust.previewTitle'),
    description: verified
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

// ── CoreBox replica (typed scenes, measured against the real renderer) ──────
// Geometry, colours and labels follow apps/core-app/src/renderer/src: the 56px
// header with the orb, flat result rows (32px icon, uppercase source label,
// ⌘1… quick keys), the #409eff selection bar and the footer hints. Every scene
// is something Tuff does out of the box; the window grows with its results the
// way the real one does, inside a box reserved for its tallest scene.

type SceneRowKind = 'app' | 'file' | 'plugin'

interface SceneRow {
  kind: SceneRowKind
  icon: string
  /** Brand logos sit on a light plate like a macOS app icon; glyphs stay bare. */
  plate?: boolean
  title: string
  /** The characters of `title` the query matched, as [start, end). */
  match?: [number, number]
  sub: string
  source: string
}

interface Scene {
  query: string
  rows?: SceneRow[]
  calc?: { expression: string, result: string }
}

const scenes = computed<Scene[]>(() => {
  const c = copy.value
  return [
    {
      query: 'fig',
      rows: [
        { kind: 'app', icon: 'i-logos-figma', plate: true, title: 'Figma', match: [0, 3], sub: '/Applications/Figma.app', source: c.typeApp },
        { kind: 'file', icon: 'i-carbon-image', title: 'figma-export.png', match: [0, 3], sub: c.fileSub, source: c.typeFile },
        { kind: 'plugin', icon: 'i-carbon-search', title: c.webSearch, sub: c.webSearchSub, source: 'touch-browser-open' },
      ],
    },
    {
      query: '12*8+5',
      calc: { expression: '12 × 8 + 5', result: '101' },
    },
    {
      query: 'fy',
      rows: [
        { kind: 'plugin', icon: 'i-carbon-translate', title: c.translate, sub: c.translateSub, source: 'touch-translation' },
        { kind: 'plugin', icon: 'i-carbon-language', title: c.translateMulti, sub: c.translateMultiSub, source: 'touch-translation' },
      ],
    },
  ]
})

const typed = ref('')
const sceneIndex = ref(0)
/** The scene the results show; it outlives the collapse so the rows are clipped, not dropped. */
const shownIndex = ref(-1)
const expanded = ref(false)

const shownScene = computed(() => (shownIndex.value >= 0 ? scenes.value[shownIndex.value] ?? null : null))

const shownRows = computed(() => (shownScene.value?.rows ?? []).map((row) => {
  const [start, end] = row.match ?? [0, 0]
  return {
    ...row,
    before: row.title.slice(0, start),
    hit: row.title.slice(start, end),
    after: row.title.slice(end),
  }
}))

/** The footer names the selected item the way CoreBox does: icon, title, source. */
const footerItem = computed(() => {
  const scene = shownScene.value
  if (!scene)
    return null
  if (scene.calc)
    return { icon: 'i-carbon-calculator', plate: false, title: scene.calc.result, source: copy.value.typeSystem, plugin: false }
  const row = scene.rows?.[0]
  if (!row)
    return null
  return { icon: row.icon, plate: Boolean(row.plate), title: row.title, source: row.source, plugin: row.kind === 'plugin' }
})

/** stagger-delay.ts, doubled so the entrance reads at marketing pace. */
function rowDelay(index: number, count: number): number {
  const progress = count > 1 ? index / (count - 1) : 0
  return Math.round(Math.min(index * (0.025 + progress * progress * 0.03), 0.18) * 2000)
}

let demoCancelled = false
const demoTimers = new Set<number>()

function demoSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!hasWindow()) {
      resolve()
      return
    }
    const id = window.setTimeout(() => {
      demoTimers.delete(id)
      resolve()
    }, ms)
    demoTimers.add(id)
  })
}

async function runSceneLoop(): Promise<void> {
  for (;;) {
    if (demoCancelled)
      return
    const scene = scenes.value[sceneIndex.value]!

    for (let i = 1; i <= scene.query.length; i++) {
      if (demoCancelled)
        return
      typed.value = scene.query.slice(0, i)
      await demoSleep(90)
    }
    await demoSleep(160)
    if (demoCancelled)
      return

    shownIndex.value = sceneIndex.value
    expanded.value = true
    await demoSleep(3200)
    if (demoCancelled)
      return

    expanded.value = false
    await demoSleep(340)
    for (let i = scene.query.length - 1; i >= 0; i--) {
      if (demoCancelled)
        return
      typed.value = scene.query.slice(0, i)
      await demoSleep(34)
    }
    await demoSleep(620)
    sceneIndex.value = (sceneIndex.value + 1) % scenes.value.length
  }
}

function startSceneDemo() {
  if (enableMotion.value) {
    void runSceneLoop()
    return
  }
  typed.value = scenes.value[0]?.query ?? ''
  shownIndex.value = 0
  expanded.value = true
}

// `code` is what the capsule shows: naming the channel is what keeps it from
// competing with the primary CTA, which always ships the certified build.
const CHANNEL_META: Record<
  ReleaseChannel,
  { label: string, code: string, cls: string, tone: TxVersionChannelTone }
> = {
  RELEASE: { label: 'Stable', code: 'STABLE', cls: 'is-release', tone: 'stable' },
  BETA: { label: 'Beta', code: 'BETA', cls: 'is-beta', tone: 'preview' },
  SNAPSHOT: { label: 'Snapshot', code: 'SNAPSHOT', cls: 'is-snapshot', tone: 'nightly' },
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
    id: release.id || release.tag,
    tag: release.tag,
    channel: release.channel ?? 'RELEASE',
    date: release.publishedAt ?? release.createdAt ?? '',
    note: note ? note.slice(0, 120) : undefined,
    assets: release.assets,
  }
}

async function loadReleases() {
  // Assets ride along so the capsule can hand out a real download URL, and the
  // stable build is fetched on its own because the mixed list may not hold one.
  const [live, stable] = await Promise.all([
    fetchReleases({ limit: 12, includeAssets: true }),
    fetchLatestRelease('RELEASE'),
  ])

  if (live?.length) {
    const sorted = [...live].sort((a, b) =>
      (b.publishedAt ?? b.createdAt ?? '').localeCompare(a.publishedAt ?? a.createdAt ?? ''))
    releaseList.value = sorted.map(toReleaseItem)
  }

  // Both lookups can come back empty; the seeded fallback stays in place then.
  stableRelease.value
    = (stable ? toReleaseItem(stable) : null)
      ?? releaseList.value.find(item => item.channel === 'RELEASE')
      ?? stableRelease.value
}

// ── Version capsule ──────────────────────────────────────────────────────────
const userArch = computed<AssetArch>(() => detectArch())

const capsuleMeta = computed(() => channelMeta(latestRelease.value?.channel ?? 'RELEASE'))

/**
 * `getArchLabel` speaks Apple's language — "Intel" and "Apple Silicon" — which
 * only means anything on macOS. A Windows x64 build is not an "Intel" build.
 */
function archLabel(platform: AssetPlatform, arch: AssetArch): string {
  if (platform === 'darwin')
    return getArchLabel(arch)
  if (arch === 'universal')
    return 'Universal'
  return arch === 'arm64' ? 'ARM64' : 'x64'
}

/** Ordered so the visitor's own platform leads and carries the primary button. */
function toBuilds(assets: ReleaseAsset[] | undefined): TxVersionBuild[] {
  if (!assets?.length)
    return []

  const recommended = findAssetForPlatform(assets, heroPlatform.value, userArch.value)

  return [...assets]
    .sort((a, b) => Number(b.id === recommended?.id) - Number(a.id === recommended?.id))
    .map((asset) => {
      const ext = asset.filename.includes('.') ? `.${asset.filename.split('.').pop()}` : ''
      return {
        id: asset.id,
        name: `${getPlatformLabel(asset.platform)} · ${archLabel(asset.platform, asset.arch)}`,
        meta: [ext, formatFileSize(asset.size)].filter(Boolean).join(' · '),
        href: asset.downloadUrl,
        recommended: asset.id === recommended?.id,
      }
    })
}

const capsuleBuilds = computed(() => toBuilds(latestRelease.value?.assets))

const stableAsset = computed(() =>
  findAssetForPlatform(stableRelease.value?.assets, heroPlatform.value, userArch.value))

/** Falls back to the Updates page whenever there is no directly linkable asset. */
const primaryHref = computed(() => stableAsset.value?.downloadUrl ?? '/updates')

// ── Flip-overlay (version history) ───────────────────────────────────────────
// The capsule's right half only triggers this; it renders no anchored panel.
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
  triggerRef.value?.historyRef?.focus()
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
  startSceneDemo()
})

onBeforeUnmount(() => {
  if (revealFrame !== null)
    cancelAnimationFrame(revealFrame)
  demoCancelled = true
  demoTimers.forEach(id => hasWindow() && window.clearTimeout(id))
  demoTimers.clear()
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
    <!-- Background: event-horizon nebula + starfield over pure black, revealed
         by a centered water-ripple wavefront on load -->
    <div class="ExpHero-Sky" aria-hidden="true">
      <ClientOnly>
        <div class="ExpHero-SkyCanvas">
          <LazyEventHorizon ripple-in :resolution-scale="0.75" />
        </div>
      </ClientOnly>
    </div>
    <div class="ExpHero-Scrim" aria-hidden="true" />

    <div class="ExpHero-Content">
      <h1 id="exp-hero1-title" class="ExpHero-Title reveal" style="--d: 0ms">
        <span class="ExpHero-TitleLine">
          <span v-if="copy.titlePrefix" class="ExpHero-TitleLead">{{ copy.titlePrefix }}</span>
          <span class="ExpHero-TitleSubject">
            <TuffLandingLineShadowText class="ExpHero-TitleOs" :text="titleSubject.body" />
            <span v-if="titleSubject.punct" class="ExpHero-TitleOs ExpHero-Punct" :style="{ marginInlineEnd: punctTrim(titleSubject.punct) }">{{ titleSubject.punct }}</span>
          </span>
        </span>
        <strong class="ExpHero-TitleAccent">{{ titleAccent.body }}<span v-if="titleAccent.punct" class="ExpHero-Punct" :style="{ marginInlineEnd: punctTrim(titleAccent.punct) }">{{ titleAccent.punct }}</span></strong>
      </h1>

      <div class="ExpHero-Actions reveal" style="--d: 70ms">
        <NuxtLink class="NexusButton is-primary" :to="primaryHref">
          <TxOsIcon :platform="heroPlatform" />
          <span>{{ copy.primary }}</span>
        </NuxtLink>
        <NuxtLink class="NexusButton" to="/docs">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ copy.secondary }}</span>
        </NuxtLink>
      </div>

      <div v-if="latestRelease" class="ExpHero-VersionWrap reveal" style="--d: 150ms">
        <TxVersionCapsule
          ref="triggerRef"
          class="ExpHero-Capsule"
          :version="latestRelease.tag"
          :channel="capsuleMeta.code"
          :tone="capsuleMeta.tone"
          :history-label="copy.history"
          :download-label="copy.downloadBuild"
          @history="openOverlay"
        >
          <template #download>
            <TxVersionDownloadPanel
              :notice="capsuleNotice"
              :builds="capsuleBuilds"
              :builds-label="copy.chooseBuild"
              :download-label="copy.download"
              :empty-text="copy.noBuilds"
            >
              <template #footer>
                <span class="ExpHero-PanelFootLead">{{ copy.certifiedTrack }}</span>
                <NuxtLink class="ExpHero-PanelFootLink" :to="primaryHref">
                  {{ copy.getStable }}
                  <span class="i-carbon-arrow-right" aria-hidden="true" />
                </NuxtLink>
              </template>
            </TxVersionDownloadPanel>
          </template>
        </TxVersionCapsule>
      </div>

      <div class="ExpHero-Trust reveal" style="--d: 190ms">
        <span>macOS · Windows · Linux</span>
        <span class="ExpHero-Dot" aria-hidden="true" />
        <span class="ExpHero-OpenSource">
          <span class="i-carbon-logo-github" aria-hidden="true" />
          {{ copy.openSource }}
        </span>
      </div>
    </div>

    <!-- Product surface: a faithful CoreBox typing its way through what Tuff
         does. Decorative — the scenes repeat — so it stays out of the a11y tree. -->
    <div class="ExpHero-Product reveal" style="--d: 280ms" aria-hidden="true">
      <div class="CoreBoxReplica" :class="{ 'is-expanded': expanded }">
        <div class="CoreBoxReplica-Window">
          <div class="CoreBoxReplica-Header">
            <img class="CoreBoxReplica-Logo" src="/logo.svg" alt="" width="48" height="48">
            <div class="CoreBoxReplica-Input">
              <span class="CoreBoxReplica-Placeholder" :class="{ 'is-hidden': typed }">{{ copy.placeholder }}</span>
              <span class="CoreBoxReplica-Query">{{ typed }}</span>
              <span class="CoreBoxReplica-Caret" />
            </div>
            <span class="CoreBoxReplica-Pin i-carbon-pin" />
          </div>

          <div class="CoreBoxReplica-Body">
            <div class="CoreBoxReplica-BodyInner">
              <div class="CoreBoxReplica-Results">
                <div v-if="shownScene?.calc" :key="`calc-${shownIndex}`" class="CoreBoxReplica-Calc">
                  <span class="CoreBoxReplica-CalcExpr">{{ shownScene.calc.expression }}</span>
                  <span class="CoreBoxReplica-CalcResult"><span>=</span>{{ shownScene.calc.result }}</span>
                </div>
                <template v-else>
                  <div
                    v-for="(row, i) in shownRows"
                    :key="`${shownIndex}-${i}`"
                    class="CoreBoxReplica-Row"
                    :class="{ 'is-selected': i === 0 }"
                    :style="{ '--stagger': `${rowDelay(i, shownRows.length)}ms` }"
                  >
                    <span class="CoreBoxReplica-Icon" :class="{ 'is-plate': row.plate }">
                      <span :class="row.icon" />
                    </span>
                    <span class="CoreBoxReplica-Text">
                      <span class="CoreBoxReplica-Title">{{ row.before }}<b>{{ row.hit }}</b>{{ row.after }}</span>
                      <span class="CoreBoxReplica-Sub">{{ row.sub }}</span>
                    </span>
                    <span class="CoreBoxReplica-Meta">
                      <span class="CoreBoxReplica-Source">{{ row.source }}</span>
                      <kbd class="CoreBoxReplica-Quick">⌘{{ i + 1 }}</kbd>
                    </span>
                  </div>
                </template>
              </div>

              <div v-if="footerItem" class="CoreBoxReplica-Footer">
                <span class="CoreBoxReplica-FooterItem">
                  <span class="CoreBoxReplica-FooterIcon" :class="{ 'is-plate': footerItem.plate }">
                    <span :class="footerItem.icon" />
                  </span>
                  <span class="CoreBoxReplica-FooterText">
                    <span class="CoreBoxReplica-FooterTitle">{{ footerItem.title }}</span>
                    <span class="CoreBoxReplica-FooterSource">{{ footerItem.source }}</span>
                  </span>
                </span>
                <span class="CoreBoxReplica-Hints">
                  <span><kbd>↵</kbd>{{ footerItem.plugin ? copy.hintExecute : copy.hintOpen }}</span>
                  <span><kbd>⌘K</kbd>{{ copy.hintActions }}</span>
                  <span><kbd>⌘1-0</kbd>{{ copy.hintQuickRun }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div class="CoreBoxReplica-Glow" />
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

.ExpHero-Sky,
.ExpHero-Scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Static fallback for SSR first paint and browsers without WebGL. The field
   is held a step under full strength so the title, not the nebula, leads. */
.ExpHero-Sky {
  z-index: 0;
  background: #030305;
  opacity: 0.82;
}

/* Short blend only — the shader's ripple wavefront owns the real entrance */
.ExpHero-SkyCanvas {
  position: absolute;
  inset: 0;
  animation: ExpHeroSkyFade 0.55s ease both;
}

/* OGL's setSize writes a 0.75-scaled inline size on the canvas; stretch it
   back over the full layer. */
.ExpHero-SkyCanvas :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

@keyframes ExpHeroSkyFade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* Vignette only — darkens toward the edges, keeps text legible */
.ExpHero-Scrim {
  z-index: 1;
  background:
    radial-gradient(34% 24% at 50% 31%, rgba(3, 3, 5, 0.42) 0%, rgba(3, 3, 5, 0) 100%),
    radial-gradient(72% 60% at 50% 42%, transparent 0%, rgba(3, 3, 5, 0.66) 100%),
    linear-gradient(180deg, rgba(3, 3, 5, 0.3) 0%, rgba(3, 3, 5, 0) 38%, rgba(3, 3, 5, 0.78) 100%);
}

/* Above .ExpHero-Product: this block is a stacking context, so an open capsule
   panel cannot escape it — without this the product card paints over the panel. */
.ExpHero-Content {
  position: relative;
  z-index: 3;
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
/* Always two beats — the white line, then the accent — at every width. */
.ExpHero-Title {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  line-height: 1.04;
  letter-spacing: -0.01em;
  /* CJK breaks between any two glyphs by default, which would split a phrase
     like 就在眼前 mid-word once a line runs out of room */
  word-break: keep-all;
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

.ExpHero-TitleSubject {
  display: inline-flex;
  align-items: baseline;
}

/* The mark's ink sits in the left half of its em box; the inline trim from
   punctTrim() gives that empty part back, so the line centres on what is drawn. */
.ExpHero-Punct {
  display: inline-block;
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
  /* The accent is one headline beat — it wraps as a whole or not at all */
  white-space: nowrap;
  /* Extend the painted box below the baseline so gradient descenders (g, p) aren't clipped */
  padding-bottom: 0.12em;
  filter: drop-shadow(0 18px 54px rgba(105, 75, 255, 0.36));
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

/* ── Version capsule (preview channel) ──────────────────────────────────── */
.ExpHero-VersionWrap {
  position: relative;
  z-index: 5;
  display: inline-flex;
  margin-top: 1.5rem;
}

/* The hero is always dark, so the capsule's tokens are pinned to the aurora
   palette rather than following the app-wide light/dark theme. */
.ExpHero-Capsule {
  --tx-version-capsule-bg: rgba(16, 18, 28, 0.55);
  --tx-version-capsule-border-color: rgba(246, 247, 244, 0.14);
  --tx-version-capsule-accent: #cbb8ff;

  /* `preview` tone resolves through --tx-color-primary; the aurora wants purple. */
  --tx-color-primary: #7f6cff;
  --tx-text-color-primary: #fff;
  --tx-text-color-secondary: rgba(246, 247, 244, 0.48);

  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.ExpHero-Capsule :deep(.tx-version-download-panel),
.ExpHero-Capsule :deep(.tx-version-history-panel) {
  --tx-version-panel-bg: rgba(18, 20, 30, 0.94);
  --tx-version-panel-border-color: rgba(246, 247, 244, 0.14);
  --tx-version-panel-accent: #cbb8ff;
  --tx-color-primary: #7f6cff;
  --tx-text-color-primary: #fff;
  --tx-text-color-regular: rgba(246, 247, 244, 0.72);
  --tx-text-color-secondary: rgba(246, 247, 244, 0.66);
  --tx-text-color-placeholder: rgba(246, 247, 244, 0.42);
  --tx-fill-color: rgba(246, 247, 244, 0.07);
  --tx-fill-color-light: rgba(246, 247, 244, 0.05);
  --tx-fill-color-lighter: rgba(246, 247, 244, 0.03);
  --tx-color-warning: #febc2e;
  --tx-color-success: #35c2a4;

  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.ExpHero-PanelFootLead {
  color: rgba(246, 247, 244, 0.42);
}

.ExpHero-PanelFootLink {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #cbb8ff;
  font-weight: 680;
  text-decoration: none;
}

.ExpHero-PanelFootLink:hover {
  text-decoration: underline;
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

/* ── Product surface: CoreBox replica ──────────────────────────────────── */
/* Reserves the tallest scene (header + three rows + footer) so the window can
   grow and shrink without re-centring the hero above it. */
.ExpHero-Product {
  position: relative;
  z-index: 2;
  width: min(100%, 42rem);
  height: 19rem;
  margin-top: clamp(1.9rem, 3.5vw, 2.9rem);
}

.CoreBoxReplica {
  position: relative;
  text-align: left;
}

/* The real window is a vibrancy panel under an rgba(48,48,48,.75) mask; the
   nebula behind the hero stands in for the desktop. */
.CoreBoxReplica-Window {
  position: relative;
  z-index: 1;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(48, 48, 48, 0.75);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.08),
    0 24px 70px rgba(0, 0, 0, 0.55),
    0 8px 24px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(28px) saturate(170%);
  -webkit-backdrop-filter: blur(28px) saturate(170%);
  color: #e5eaf3;
}

.CoreBoxReplica-Header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 56px;
  padding: 4px 8px;
  box-sizing: border-box;
}

.CoreBoxReplica-Logo {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.CoreBoxReplica-Input {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 48px;
  font-size: 22px;
  font-weight: 400;
}

.CoreBoxReplica-Placeholder {
  position: absolute;
  left: 0;
  color: #8d9095;
  opacity: 0.75;
  white-space: nowrap;
  transition: opacity 200ms ease, filter 200ms ease;
}

/* Gone on the first keystroke — a fade here overlaps the typed text — and
   back with a short fade once the query is cleared. */
.CoreBoxReplica-Placeholder.is-hidden {
  opacity: 0;
  filter: blur(5px);
  transition: none;
}

.CoreBoxReplica-Query {
  white-space: pre;
}

.CoreBoxReplica-Caret {
  width: 2px;
  height: 24px;
  margin-left: 1px;
  border-radius: 1px;
  background: #e5eaf3;
  animation: replica-blink 1.06s step-end infinite;
}

.CoreBoxReplica-Pin {
  flex-shrink: 0;
  margin: 0 8px;
  font-size: 18px;
  color: #8d9095;
}

/* Grows by its own content: 0fr → 1fr is the window resize (easeOutCubic). */
.CoreBoxReplica-Body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 260ms cubic-bezier(0.33, 1, 0.68, 1);
}

.is-expanded .CoreBoxReplica-Body {
  grid-template-rows: 1fr;
}

.CoreBoxReplica-BodyInner {
  min-height: 0;
  overflow: hidden;
}

.CoreBoxReplica-Results {
  border-top: 1px solid #4c4d4f;
  padding: 4px 0 6px;
}

.CoreBoxReplica-Row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  margin: 4px 8px;
  padding: 8px;
  box-sizing: border-box;
  border-radius: 12px;
  animation: replica-row-in 280ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
  animation-delay: var(--stagger, 0ms);
}

.CoreBoxReplica-Row.is-selected {
  background: #141414;
}

/* CoreBoxSelectionBlock: a 4px bar at half the row's height. */
.CoreBoxReplica-Row.is-selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  width: 4px;
  height: 50%;
  border-radius: 999px;
  background: #409eff;
  box-shadow: 0 0 2px #409eff;
}

.CoreBoxReplica-Icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  font-size: 20px;
  color: #e5eaf3;
}

.CoreBoxReplica-Icon.is-plate {
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, #eceef3);
  font-size: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.CoreBoxReplica-Text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.CoreBoxReplica-Title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CoreBoxReplica-Title b {
  color: #409eff;
  font-weight: 700;
}

.CoreBoxReplica-Sub {
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  opacity: 0.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CoreBoxReplica-Meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.CoreBoxReplica-Source {
  max-width: 96px;
  overflow: hidden;
  color: #64748b;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.CoreBoxReplica-Quick {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 6px;
  background: #3a3a3a;
  color: #e5eaf3;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
}

/* Preview cards are their own surface: 18px radius, the selection as a border. */
.CoreBoxReplica-Calc {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 8px 16px;
  padding: 14px 18px;
  border: 1px solid #409eff;
  border-radius: 18px;
  background: #1d1d1d;
  animation: replica-row-in 280ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

.CoreBoxReplica-CalcExpr {
  color: #a3a6ad;
  font-size: 13px;
}

.CoreBoxReplica-CalcResult {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.CoreBoxReplica-CalcResult span {
  color: #8d9095;
  font-size: 20px;
  font-weight: 400;
}

.CoreBoxReplica-Footer {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 12px;
  box-sizing: border-box;
  border-top: 1px solid #363637;
  background: rgba(39, 39, 39, 0.92);
  color: #a3a6ad;
  font-size: 12px;
}

.CoreBoxReplica-FooterItem {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.CoreBoxReplica-FooterIcon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 4px;
  color: #e5eaf3;
  font-size: 14px;
}

.CoreBoxReplica-FooterIcon.is-plate {
  background: linear-gradient(180deg, #ffffff, #eceef3);
  font-size: 12px;
}

.CoreBoxReplica-FooterText {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.CoreBoxReplica-FooterTitle {
  overflow: hidden;
  color: #e5eaf3;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CoreBoxReplica-FooterSource {
  font-size: 11px;
}

.CoreBoxReplica-Hints {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11px;
}

.CoreBoxReplica-Hints span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.CoreBoxReplica-Hints kbd {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  padding: 2px 6px;
  box-sizing: border-box;
  border-radius: 6px;
  background: #3a3a3a;
  color: #e5eaf3;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}

/* The ALL IN ONE section's light bar: lit under the closed window, gone once
   the results open. */
.CoreBoxReplica-Glow {
  --color-1: hsl(0 100% 63%);
  --color-2: hsl(270 100% 63%);
  --color-3: hsl(210 100% 63%);
  --color-4: hsl(195 100% 63%);
  --color-5: hsl(90 100% 63%);

  position: absolute;
  top: 54px;
  left: 6%;
  right: 6%;
  height: 4px;
  border-radius: 999px;
  pointer-events: none;
  transition: opacity 0.45s ease, transform 0.45s ease, filter 0.45s ease;
}

.CoreBoxReplica-Glow::before {
  content: '';
  position: absolute;
  inset: -4px 2.5%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-1), var(--color-5), var(--color-3), var(--color-4), var(--color-2));
  background-size: 200%;
  opacity: 0.65;
  filter: blur(14px);
  transform: translateY(4px);
  animation: replica-rainbow 3.2s linear infinite;
}

.is-expanded .CoreBoxReplica-Glow {
  opacity: 0;
  transform: translateY(6px) scaleX(0.92);
  filter: blur(8px);
}

@keyframes replica-row-in {
  from {
    transform: translate3d(0, 10px, 0);
  }
}

@keyframes replica-rainbow {
  to {
    background-position: 200%;
  }
}

@keyframes replica-blink {
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

  .ExpHero-Product {
    height: 17rem;
  }

  .CoreBoxReplica-Source,
  .CoreBoxReplica-Hints span:not(:first-child) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .CoreBoxReplica-Caret,
  .CoreBoxReplica-Glow::before,
  .CoreBoxReplica-Row,
  .CoreBoxReplica-Calc {
    animation: none;
  }

  .CoreBoxReplica-Body {
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

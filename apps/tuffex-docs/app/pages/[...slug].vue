<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  watch,
} from 'vue'
import DocHero from '~/components/docs/DocHero.vue'
import DocsFrameworkStatusBar from '~/components/docs/DocsFrameworkStatusBar.vue'
import {
  prefetchDocByPath,
  prefetchDocPage,
  TUFFEX_CURRENT_DOC_KEY,
  useTuffexCurrentDoc,
  type TuffexCompiledDocMeta,
} from '~/composables/useTuffexCurrentDoc'
import { createDocsPrimaryDemoTracker, DOCS_PRIMARY_DEMO_KEY } from '~/utils/docs-primary-demo'
import { DOCS_SOURCE_PATH_KEY } from '~/utils/docs-source-path'
import { resetDemoMountQueue } from '~/utils/demo-mount-scheduler'
import {
  parseTuffexRoute,
  resolveTuffexComponentSlug,
  stripTrailingSlash,
  stripTuffexBase,
  toLocalizedTuffexPath,
  TUFFEX_BASE_PATH,
} from '~/utils/docs-route'

/**
 * R1: Persistent Page Instance — NEVER `key: route => route.path`!
 * Keeps Vue page component & layout mounted across SPA doc transitions,
 * swapping compiled `.mdc` Vue 3 SFC components (`displayComponent`) with
 * stale-while-revalidate and atomic state reset.
 */
definePageMeta({
  layout: 'docs',
  pageTransition: false,
  key: 'docs-slug',
})

const LazyDocsKatexStyles = defineAsyncComponent(() => import('~/components/docs/DocsKatexStyles.vue'))

const NON_DOC_ASSET_RE = /\.(?:md|json|xml|txt|js|mjs|css|svg|png|jpe?g|webp|ico|woff2?)$/i

const route = useRoute()
const { t } = useI18n()

// Reuse the single SSR-awaited compiled SFC context provided by `layouts/docs.vue`
// (ensures R2 byte-1 SSR body + outline + pager with ZERO `_payload.json` / `__NUXT_DATA__` doc payload).
const injectedDoc = inject(TUFFEX_CURRENT_DOC_KEY, null)
const currentDoc = injectedDoc ?? useTuffexCurrentDoc()
const {
  parsedRoute,
  docLocale,
  docSlug,
  fetchedMeta,
  displayMeta,
  displayComponent,
  pagerPrev: rawPagerPrev,
  pagerNext: rawPagerNext,
  pending,
  error,
  isSwitchingDoc,
  notFound,
  refresh,
} = currentDoc

const isZh = computed(() => docLocale.value === 'zh')

// Provide source path & primary demo tracker to descendant MDC components
provide(DOCS_SOURCE_PATH_KEY, computed(() => displayMeta.value?.path ?? null))
const primaryDemoTracker = createDocsPrimaryDemoTracker()
provide(DOCS_PRIMARY_DEMO_KEY, primaryDemoTracker)

function scrollToHashOrTop() {
  if (!import.meta.client)
    return

  const hash = route.hash || window.location.hash
  if (hash && hash.length > 1) {
    let id = ''
    try {
      id = decodeURIComponent(hash.slice(1))
    }
    catch {
      id = hash.slice(1)
    }
    if (id) {
      void nextTick(() => {
        const el = document.getElementById(id)
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 104
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
        }
      })
      return
    }
  }

  window.scrollTo({ top: 0, behavior: 'instant' })
}

let mermaidRunId = 0
async function maybeRenderMermaid(meta: TuffexCompiledDocMeta | null) {
  if (!import.meta.client || !meta?.hasMermaid)
    return
  const runId = ++mermaidRunId
  await nextTick()
  if (runId !== mermaidRunId)
    return
  const { renderMermaidInDocument } = await import('~/utils/mermaid-renderer')
  if (runId !== mermaidRunId)
    return
  await renderMermaidInDocument(document)
}

/**
 * Atomic transient state reset whenever a new compiled doc commits in our persistent
 * R1 page instance. Runs pre-flush so `primaryDemoTracker` and `demoMountQueue` clear
 * BEFORE the newly swapped SFC's `<TuffDemoWrapper>` children claim primary slots.
 */
function resetPageTransientState(nextMeta: TuffexCompiledDocMeta | null, options?: { scroll?: boolean }) {
  primaryDemoTracker.reset()
  resetDemoMountQueue()
  if (options?.scroll)
    scrollToHashOrTop()
  void maybeRenderMermaid(nextMeta)
}

let lastCommittedKey = displayMeta.value ? `${displayMeta.value.locale}:${displayMeta.value.slug}` : ''

watch(
  displayMeta,
  (nextMeta) => {
    const nextKey = nextMeta ? `${nextMeta.locale}:${nextMeta.slug}` : `missing:${docLocale.value}:${docSlug.value}`
    if (nextKey !== lastCommittedKey) {
      const isRouteSwap = Boolean(lastCommittedKey)
      lastCommittedKey = nextKey
      // Runs with default `flush: 'pre'` BEFORE `<component :is="displayComponent" :key="contentRenderKey" />`
      // patches and mounts the new page's `<TuffDemoWrapper>` children, so `resetDemoMountQueue()`
      // clears only the outgoing page's pending tasks and never wipes incoming demos.
      resetPageTransientState(nextMeta ?? null, { scroll: isRouteSwap })
    }
  },
  { flush: 'pre' },
)

const activeComponentSlug = computed(() => resolveTuffexComponentSlug(route.path))

const docDisplayTitle = computed(() => {
  if (displayMeta.value?.title)
    return displayMeta.value.title
  const fallback = docSlug.value.split('/').filter(Boolean).pop() || 'TuffEx'
  return fallback.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
})

const docDisplayDescription = computed(() => displayMeta.value?.description ?? '')

const showDocHero = computed(() => {
  if (!displayMeta.value)
    return false
  if (displayMeta.value.hideHero === true || displayMeta.value.hero === false)
    return false
  return Boolean(displayMeta.value.title)
})

const heroSinceLabel = computed(() => {
  const since = displayMeta.value?.since?.trim()
  if (since)
    return isZh.value ? `自 ${since}` : `Since ${since}`
  if (parsedRoute.value.kind === 'concept' || parsedRoute.value.kind === 'concepts-index')
    return isZh.value ? '设计理念' : 'Design Concept'
  if (parsedRoute.value.kind === 'composition')
    return isZh.value ? '组合指南' : 'Composition Guide'
  return isZh.value ? 'TuffEx 组件' : 'TuffEx Component'
})

const heroBetaLabel = computed(() => {
  if (displayMeta.value?.verified)
    return ''
  return displayMeta.value?.status?.trim().toLowerCase() === 'beta' ? 'BETA' : ''
})

const heroVerifiedLabel = computed(() => (
  displayMeta.value?.verified ? (isZh.value ? '已审阅' : 'Verified') : ''
))

const heroBreadcrumbs = computed(() => {
  const crumbs: Array<{ label: string, to?: string }> = [
    {
      label: isZh.value ? 'TuffEx 组件' : 'TuffEx',
      to: `/${docLocale.value}`,
    },
  ]

  if (parsedRoute.value.kind === 'concept') {
    crumbs.push({
      label: isZh.value ? '设计理念手册' : 'Design Concepts',
      to: `/${docLocale.value}/concepts`,
    })
  }

  if (parsedRoute.value.kind !== 'index') {
    crumbs.push({ label: docDisplayTitle.value })
  }
  return crumbs
})

const rawMarkdownHref = computed(() => {
  const raw = displayMeta.value?.rawMarkdownPath?.trim()
  if (!raw)
    return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith(`${TUFFEX_BASE_PATH}/`))
    return raw
  return `${TUFFEX_BASE_PATH}${raw.startsWith('/') ? raw : `/${raw}`}`
})

const githubEditHref = computed(() => {
  const slug = docSlug.value
  const loc = docLocale.value
  if (parsedRoute.value.kind === 'index')
    return `https://github.com/talex-touch/tuff/blob/master/apps/tuffex-docs/content/docs/components/index.${loc}.mdc`
  if (parsedRoute.value.kind === 'composition')
    return `https://github.com/talex-touch/tuff/blob/master/apps/tuffex-docs/content/docs/composition.${loc}.mdc`
  if (parsedRoute.value.kind === 'concepts-index')
    return `https://github.com/talex-touch/tuff/blob/master/apps/tuffex-docs/content/docs/concepts/index.${loc}.mdc`
  if (parsedRoute.value.kind === 'concept')
    return `https://github.com/talex-touch/tuff/blob/master/apps/tuffex-docs/content/docs/${slug}.${loc}.mdc`
  return `https://github.com/talex-touch/tuff/blob/master/apps/tuffex-docs/content/docs/components/${slug}.${loc}.mdc`
})

const pagerPrev = computed(() => {
  const item = rawPagerPrev.value
  if (!item?.path)
    return null
  return {
    title: item.title,
    slug: item.slug,
    to: toLocalizedTuffexPath(item.path, docLocale.value),
  }
})

const pagerNext = computed(() => {
  const item = rawPagerNext.value
  if (!item?.path)
    return null
  return {
    title: item.title,
    slug: item.slug,
    to: toLocalizedTuffexPath(item.path, docLocale.value),
  }
})

const contentRenderKey = computed(() => (
  displayMeta.value ? `${displayMeta.value.locale}:${displayMeta.value.slug || 'index'}` : 'empty'
))

/**
 * Resolves a static `<a href="/tuffex/...">` inside `.docs-prose` to a Nuxt internal
 * SPA target (`/{en,zh}/...`, preserving query & hash) or `null` if it should use
 * native browser navigation (external origin, cross-app Nexus link, `.md` raw file,
 * `#hash`-only anchor, download, or `_blank`).
 */
function resolveDelegatedProseLink(link: HTMLAnchorElement): {
  internalTarget: string
  strippedPath: string
  url: URL
} | null {
  const targetAttr = link.getAttribute('target')
  if (targetAttr && targetAttr !== '_self')
    return null
  if (link.hasAttribute('download'))
    return null

  const rawHref = link.getAttribute('href')?.trim() ?? ''
  if (!rawHref || rawHref.startsWith('#') || /^(?:mailto:|tel:|javascript:)/i.test(rawHref))
    return null

  let url: URL
  try {
    url = new URL(link.href, window.location.href)
  }
  catch {
    return null
  }

  if (url.origin !== window.location.origin)
    return null

  if (url.pathname !== TUFFEX_BASE_PATH && !url.pathname.startsWith(`${TUFFEX_BASE_PATH}/`))
    return null

  if (NON_DOC_ASSET_RE.test(url.pathname))
    return null

  const strippedPath = stripTuffexBase(url.pathname)
  if (strippedPath.startsWith('/_tuffex/') || strippedPath.startsWith('/_i18n/'))
    return null

  return {
    internalTarget: `${strippedPath}${url.search}${url.hash}`,
    strippedPath,
    url,
  }
}

// Inline code click-to-copy delegation (lightweight — zero MutationObserver/DOM scan!)
let inlineCopiedEl: HTMLElement | null = null
let inlineCopiedTimer: ReturnType<typeof setTimeout> | null = null

/**
 * VitePress-grade delegated click handler on `.docs-prose`:
 * 1. Intercepts static `<a href="/tuffex/...">` links inside `v-pre` (`createStaticVNode`)
 *    for instant SPA `navigateTo` without `<NuxtLink>` VNode bloat.
 * 2. Preserves click-to-copy on inline `<code>` tokens.
 */
function handleProseClick(event: MouseEvent) {
  if (!import.meta.client || event.defaultPrevented)
    return

  const target = event.target as HTMLElement | null
  if (!target)
    return

  const link = target.closest<HTMLAnchorElement>('a[href]')
  if (link) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return

    const resolved = resolveDelegatedProseLink(link)
    if (!resolved)
      return

    // Let same-document hash jumps use native anchor scrolling without redundant route swap
    if (
      resolved.strippedPath === stripTrailingSlash(route.path)
      && resolved.url.search === (window.location.search || '')
      && resolved.url.hash
    ) {
      return
    }

    event.preventDefault()
    void navigateTo(resolved.internalTarget)
    return
  }

  const codeEl = target.closest<HTMLElement>('.docs-prose code:not(pre code)')
  if (!codeEl || codeEl.closest('.not-prose, a, button'))
    return
  const text = codeEl.textContent?.trim()
  if (!text || text.length > 80)
    return
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(text).then(() => {
      if (inlineCopiedEl && inlineCopiedEl !== codeEl)
        inlineCopiedEl.classList.remove('is-copied')
      inlineCopiedEl = codeEl
      codeEl.classList.add('is-copied')
      if (inlineCopiedTimer)
        clearTimeout(inlineCopiedTimer)
      inlineCopiedTimer = setTimeout(() => {
        codeEl.classList.remove('is-copied')
        inlineCopiedEl = null
        inlineCopiedTimer = null
      }, 1200)
    }).catch(() => {})
  }
}

/**
 * VitePress-grade delegated hover/focus prefetch on `.docs-prose`:
 * Prefetches the target compiled `.mdc` ES module chunk on pointerover/focusin.
 */
function handleProseLinkPrefetch(event: Event) {
  if (!import.meta.client)
    return
  const target = event.target as HTMLElement | null
  const link = target?.closest<HTMLAnchorElement>('a[href]')
  if (!link)
    return

  const resolved = resolveDelegatedProseLink(link)
  if (!resolved || !/^\/(en|zh)(?:\/|$)/i.test(resolved.strippedPath))
    return

  const parsed = parseTuffexRoute(resolved.strippedPath)
  prefetchDocPage(parsed.locale, parsed.slug)
}

useHead(() => ({
  title: displayMeta.value?.title ? `${displayMeta.value.title} — TuffEx` : 'TuffEx Docs',
  meta: displayMeta.value?.description
    ? [{ name: 'description', content: displayMeta.value.description }]
    : [],
}))

onMounted(() => {
  void maybeRenderMermaid(displayMeta.value)
  if (route.hash)
    scrollToHashOrTop()
})

onBeforeUnmount(() => {
  resetDemoMountQueue()
  if (inlineCopiedTimer) {
    clearTimeout(inlineCopiedTimer)
    inlineCopiedTimer = null
  }
})

if (!injectedDoc)
  await currentDoc.ready

if (import.meta.server && !fetchedMeta.value) {
  setResponseStatus(404)
}
</script>

<template>
  <div class="docs-root" :aria-busy="isSwitchingDoc ? 'true' : undefined">
    <!-- Subtle top progress bar during stale-while-revalidate transitions -->
    <div v-if="isSwitchingDoc" class="docs-progress-bar" aria-hidden="true" />

    <!-- Conditional KaTeX CSS (ONLY loaded when current doc has math formulas!) -->
    <LazyDocsKatexStyles v-if="displayMeta?.hasMath" />

    <article v-if="displayMeta && displayComponent" class="docs-surface" :class="{ 'docs-surface--hero': showDocHero }">
      <div v-if="showDocHero" class="docs-hero-block">
        <nav v-if="heroBreadcrumbs.length > 1" class="docs-hero-breadcrumb" aria-label="Breadcrumb">
          <template v-for="(crumb, index) in heroBreadcrumbs" :key="`${crumb.label}-${index}`">
            <NuxtLink
              v-if="crumb.to && index < heroBreadcrumbs.length - 1"
              :to="crumb.to"
              class="docs-hero-crumb"
              @pointerenter="prefetchDocByPath(crumb.to)"
              @focus="prefetchDocByPath(crumb.to)"
            >
              {{ crumb.label }}
            </NuxtLink>
            <span
              v-else
              class="docs-hero-crumb is-current"
              :aria-current="index === heroBreadcrumbs.length - 1 ? 'page' : undefined"
            >
              {{ crumb.label }}
            </span>
            <span v-if="index < heroBreadcrumbs.length - 1" class="docs-hero-crumb-sep" aria-hidden="true">/</span>
          </template>
        </nav>

        <DocHero
          :title="docDisplayTitle"
          :description="docDisplayDescription"
          :since-label="heroSinceLabel"
          :beta-label="heroBetaLabel"
          :verified-label="heroVerifiedLabel"
        />

        <DocsFrameworkStatusBar
          v-if="activeComponentSlug"
          :slug="activeComponentSlug"
        />
      </div>

      <component
        :is="displayComponent"
        :key="contentRenderKey"
        :class="[
          'docs-prose',
          'markdown-body',
          { 'docs-prose--hero': showDocHero },
        ]"
        @click="handleProseClick"
        @pointerover="handleProseLinkPrefetch"
        @focusin="handleProseLinkPrefetch"
      />

      <footer class="docs-page-meta">
        <div class="docs-page-meta__links">
          <a
            v-if="rawMarkdownHref"
            :href="rawMarkdownHref"
            target="_blank"
            rel="noopener noreferrer"
            class="docs-page-meta__link"
          >
            <span class="i-carbon-document-view" aria-hidden="true" />
            <span>{{ isZh ? '查看原始 Markdown' : 'Raw Markdown' }}</span>
          </a>
          <a
            :href="githubEditHref"
            target="_blank"
            rel="noopener noreferrer"
            class="docs-page-meta__link"
          >
            <span class="i-carbon-edit" aria-hidden="true" />
            <span>{{ t('docs.editOnGitHub', isZh ? '在 GitHub 上编辑此页' : 'Edit this page on GitHub') }}</span>
          </a>
        </div>
      </footer>

      <nav
        v-if="pagerPrev || pagerNext"
        class="docs-pager"
        :aria-label="isZh ? '页面导航' : 'Pagination'"
      >
        <NuxtLink
          v-if="pagerPrev"
          :to="pagerPrev.to"
          class="docs-pager__card"
          @pointerenter="prefetchDocPage(docLocale, pagerPrev.slug)"
          @focus="prefetchDocPage(docLocale, pagerPrev.slug)"
        >
          <span class="docs-pager__eyebrow">
            <span class="i-carbon-arrow-left" aria-hidden="true" />
            <span>{{ t('docs.previousChapter', isZh ? '上一篇' : 'Previous') }}</span>
          </span>
          <span class="docs-pager__title">{{ pagerPrev.title }}</span>
        </NuxtLink>
        <div v-else />

        <NuxtLink
          v-if="pagerNext"
          :to="pagerNext.to"
          class="docs-pager__card docs-pager__card--next"
          @pointerenter="prefetchDocPage(docLocale, pagerNext.slug)"
          @focus="prefetchDocPage(docLocale, pagerNext.slug)"
        >
          <span class="docs-pager__eyebrow">
            <span>{{ t('docs.nextChapter', isZh ? '下一篇' : 'Next') }}</span>
            <span class="i-carbon-arrow-right" aria-hidden="true" />
          </span>
          <span class="docs-pager__title">{{ pagerNext.title }}</span>
        </NuxtLink>
      </nav>
    </article>

    <div v-else-if="error" class="docs-state-card" role="alert">
      <span class="i-carbon-warning-alt docs-state-card__icon" aria-hidden="true" />
      <h2 class="docs-state-card__title">
        {{ isZh ? '文档加载失败' : 'Failed to load document' }}
      </h2>
      <p class="docs-state-card__desc">
        {{ isZh ? '网络暂时不稳定，请点击重试。' : 'Please check your connection and try again.' }}
      </p>
      <button type="button" class="docs-state-card__btn" @click="refresh()">
        {{ isZh ? '重试' : 'Retry' }}
      </button>
    </div>

    <div v-else-if="notFound" class="docs-state-card">
      <span class="i-carbon-document-unknown docs-state-card__icon" aria-hidden="true" />
      <h2 class="docs-state-card__title">
        {{ t('docs.notFoundTitle', isZh ? '文档页面不存在' : 'Document not found') }}
      </h2>
      <p class="docs-state-card__desc">
        {{ t('docs.notFoundDescription', isZh ? '该页面可能已移动或更名，请返回 TuffEx 组件首页。' : 'This page may have moved or been renamed.') }}
      </p>
      <NuxtLink
        :to="`/${docLocale}`"
        class="docs-state-card__btn"
        @pointerenter="prefetchDocPage(docLocale, '')"
        @focus="prefetchDocPage(docLocale, '')"
      >
        <span class="i-carbon-arrow-left" aria-hidden="true" />
        <span>{{ t('docs.backHome', isZh ? '返回组件首页' : 'Back to Components') }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.docs-root {
  position: relative;
  min-height: 360px;
}

.docs-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 60;
  height: 2px;
  background: var(--docs-accent, #409eff);
  transform-origin: left center;
  animation: docs-progress-slide 1.2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes docs-progress-slide {
  0% {
    transform: scaleX(0.08);
    opacity: 0.9;
  }
  50% {
    transform: scaleX(0.65);
    opacity: 1;
  }
  100% {
    transform: scaleX(0.95);
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .docs-progress-bar {
    animation: none;
    transform: scaleX(1);
    opacity: 0.65;
  }
}

.docs-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  min-width: 0;
}

.docs-hero-block {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.docs-hero-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  line-height: 1.4;
  font-weight: 500;
  color: var(--docs-muted);
}

.docs-hero-crumb {
  color: var(--docs-muted);
  text-decoration: none;
}

a.docs-hero-crumb:hover {
  color: var(--docs-ink);
}

.docs-hero-crumb.is-current {
  color: var(--docs-ink);
}

.docs-hero-crumb-sep {
  opacity: 0.5;
}

.docs-page-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--docs-border-light, #ebeef5);
}

.docs-page-meta__links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.docs-page-meta__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--docs-muted);
  text-decoration: none;
}

.docs-page-meta__link:hover {
  color: var(--docs-accent);
}

.docs-pager {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 640px) {
  .docs-pager {
    grid-template-columns: 1fr;
  }
}

.docs-pager__card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--docs-surface-subtle, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--docs-border-light, #ebeef5);
  text-decoration: none;
}

.docs-pager__card--next {
  align-items: flex-end;
  text-align: right;
}

.docs-pager__card:hover {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--docs-accent) 45%, transparent);
}

.docs-pager__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--docs-muted);
}

.docs-pager__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--docs-ink);
}

.docs-pager__card:hover .docs-pager__title {
  color: var(--docs-accent);
}

.docs-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  padding: 48px 24px;
  border-radius: 18px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
}

.docs-state-card__icon {
  font-size: 32px;
  color: var(--docs-muted);
}

.docs-state-card__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.docs-state-card__desc {
  margin: 0;
  font-size: 13.5px;
  color: var(--docs-muted);
}

.docs-state-card__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: var(--docs-accent);
  color: var(--tx-color-on-primary, #ffffff);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
</style>

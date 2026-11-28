<script setup lang="ts">
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
} from 'vue'
import DocHero from '~/components/docs/DocHero.vue'
import {
  prefetchDocByPath,
  prefetchDocPage,
  TUFF_WEB_CURRENT_DOC_KEY,
  useWebCurrentDoc,
  type TuffWebCompiledDocMeta,
} from '~/composables/useWebCurrentDoc'
import {
  isExternalAppPath,
  parseDocsRoute,
  stripLocalePrefix,
  stripTrailingSlash,
} from '~/utils/web-route'

definePageMeta({
  layout: 'docs',
  pageTransition: false,
  key: 'docs-slug',
  validate: route => /^(?:en|zh)$/i.test(String(route.params.locale || '')),
})

const LazyDocsKatexStyles = defineAsyncComponent(() => import('~/components/docs/DocsKatexStyles.vue'))
const NON_DOC_ASSET_RE = /\.(?:md|json|xml|txt|js|mjs|css|svg|png|jpe?g|webp|ico|woff2?)$/i

const route = useRoute()
const { t } = useI18n()

const injectedDoc = inject(TUFF_WEB_CURRENT_DOC_KEY, null)
const currentDoc = injectedDoc ?? useWebCurrentDoc()
const {
  parsedRoute,
  docLocale,
  docSlug,
  fetchedMeta,
  displayMeta,
  displayComponent,
  pagerPrev,
  pagerNext,
  error,
  isSwitchingDoc,
  notFound,
  refresh,
} = currentDoc

const isZh = computed(() => docLocale.value === 'zh')

if (import.meta.server && !fetchedMeta.value)
  setResponseStatus(404)

function scrollToHashOrTop() {
  if (!import.meta.client || !hasWindow() || !hasDocument())
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
async function maybeRenderMermaid(meta: TuffWebCompiledDocMeta | null) {
  if (!import.meta.client || !hasDocument() || !meta?.hasMermaid)
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

let lastCommittedKey = displayMeta.value ? `${displayMeta.value.locale}:${displayMeta.value.slug}` : ''

watch(
  displayMeta,
  (nextMeta) => {
    const nextKey = nextMeta ? `${nextMeta.locale}:${nextMeta.slug}` : `missing:${docLocale.value}:${docSlug.value}`
    if (nextKey !== lastCommittedKey) {
      const isRouteSwap = Boolean(lastCommittedKey)
      lastCommittedKey = nextKey
      if (isRouteSwap)
        scrollToHashOrTop()
      void maybeRenderMermaid(nextMeta ?? null)
    }
  },
  { flush: 'pre' },
)

const docDisplayTitle = computed(() => {
  if (displayMeta.value?.title)
    return displayMeta.value.title
  const fallback = docSlug.value.split('/').filter(Boolean).pop() || 'Tuff Docs'
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
  if (parsedRoute.value.section === 'guide')
    return isZh.value ? '产品指南' : 'Product Guide'
  if (parsedRoute.value.section === 'dev')
    return isZh.value ? '开发者文档' : 'Developer SDK'
  return isZh.value ? 'Tuff 文档' : 'Tuff Docs'
})

const heroBreadcrumbs = computed(() => {
  const crumbs: Array<{ label: string, to?: string }> = [
    {
      label: isZh.value ? '文档' : 'Docs',
      to: `/${docLocale.value}/docs`,
    },
  ]

  if (parsedRoute.value.section === 'guide') {
    crumbs.push({
      label: isZh.value ? '使用指南' : 'Guide',
      to: `/${docLocale.value}/docs/guide/start`,
    })
  }
  else if (parsedRoute.value.section === 'dev') {
    crumbs.push({
      label: isZh.value ? '开发文档' : 'Developer',
      to: `/${docLocale.value}/docs/dev`,
    })
  }

  if (docSlug.value)
    crumbs.push({ label: docDisplayTitle.value })

  return crumbs
})

const rawMarkdownHref = computed(() => displayMeta.value?.rawMarkdownPath?.trim() ?? '')

const githubEditHref = computed(() => {
  const rel = displayMeta.value?.sourceRelativePath
  if (rel)
    return `https://github.com/talex-touch/tuff/blob/master/apps/tuff-web/content/docs/${rel}`
  return `https://github.com/talex-touch/tuff/tree/master/apps/tuff-web/content/docs`
})

const contentRenderKey = computed(() => (
  displayMeta.value ? `${displayMeta.value.locale}:${displayMeta.value.slug || 'index'}` : 'empty'
))

function resolveDelegatedProseLink(link: HTMLAnchorElement): {
  internalTarget: string
  strippedPath: string
  url: URL
} | null {
  if (!hasWindow())
    return null
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

  if (NON_DOC_ASSET_RE.test(url.pathname) || isExternalAppPath(url.pathname))
    return null

  const cleanPath = stripTrailingSlash(url.pathname)
  if (cleanPath.startsWith('/_tuff-web/'))
    return null

  return {
    internalTarget: `${cleanPath}${url.search}${url.hash}`,
    strippedPath: cleanPath,
    url,
  }
}

let inlineCopiedEl: HTMLElement | null = null
let inlineCopiedTimer: ReturnType<typeof setTimeout> | null = null

function handleProseClick(event: MouseEvent) {
  if (!import.meta.client || event.defaultPrevented || !hasWindow())
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
  if (hasNavigator() && navigator.clipboard) {
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

function handleProseLinkPrefetch(event: Event) {
  if (!import.meta.client)
    return
  const target = event.target as HTMLElement | null
  const link = target?.closest<HTMLAnchorElement>('a[href]')
  if (!link)
    return

  const resolved = resolveDelegatedProseLink(link)
  if (!resolved)
    return

  const withoutLocale = stripLocalePrefix(resolved.strippedPath)
  if (withoutLocale !== '/docs' && !withoutLocale.startsWith('/docs/'))
    return

  const parsed = parseDocsRoute(resolved.strippedPath)
  prefetchDocPage(parsed.locale, parsed.slug)
}

useHead(() => ({
  title: displayMeta.value?.title ? `${displayMeta.value.title} — Tuff Docs` : 'Tuff Docs',
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
  if (inlineCopiedTimer) {
    clearTimeout(inlineCopiedTimer)
    inlineCopiedTimer = null
  }
})

if (!injectedDoc)
  await currentDoc.ready
</script>

<template>
  <div class="docs-root" :aria-busy="isSwitchingDoc ? 'true' : undefined">
    <div v-if="isSwitchingDoc" class="docs-progress-bar" aria-hidden="true" />
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
          :to="pagerPrev.path"
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
          :to="pagerNext.path"
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
        {{ t('docs.notFoundDescription', isZh ? '该页面可能已移动或更名，请返回文档首页。' : 'This page may have moved or been renamed.') }}
      </p>
      <NuxtLink
        :to="`/${docLocale}/docs`"
        class="docs-state-card__btn"
        @pointerenter="prefetchDocPage(docLocale, '')"
        @focus="prefetchDocPage(docLocale, '')"
      >
        <span class="i-carbon-arrow-left" aria-hidden="true" />
        <span>{{ t('docs.backHome', isZh ? '返回文档首页' : 'Back to Docs') }}</span>
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
  0% { transform: scaleX(0.08); opacity: 0.9; }
  50% { transform: scaleX(0.65); opacity: 1; }
  100% { transform: scaleX(0.95); opacity: 0.4; }
}

.docs-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
  min-width: 0;
}

.docs-hero-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.docs-hero-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--docs-muted);
}

.docs-hero-crumb {
  color: var(--docs-muted);
  text-decoration: none;
}

a.docs-hero-crumb:hover,
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

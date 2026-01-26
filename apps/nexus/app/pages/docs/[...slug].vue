<script setup lang="ts">
import { TxButton, TxLoadingState } from '@talex-touch/tuffex'
import { defineComponent, h, render } from 'vue'
import { toast, Toaster } from 'vue-sonner'

definePageMeta({
  layout: 'docs',
})

const route = useRoute()
const nuxtApp = useNuxtApp()
const { locale, t } = useI18n()
const localePath = useLocalePath()

// Lazy load user for admin features (non-blocking)
const user = ref<any>(null)
const isAdmin = computed(() => {
  const metadata = (user.value?.publicMetadata ?? {}) as Record<string, unknown>
  return metadata?.role === 'admin'
})

// Load user info only on client side, non-blocking
onMounted(async () => {
  try {
    const { useUser } = await import('@clerk/vue')
    const { user: clerkUser } = useUser()
    user.value = clerkUser.value
  }
  catch {
    // Clerk not available, continue without admin features
  }
})

const SUPPORTED_LOCALES = ['en', 'zh']
function stripLocalePrefix(path: string) {
  if (!path)
    return '/'
  for (const code of SUPPORTED_LOCALES) {
    const exact = `/${code}`
    if (path === exact || path === `${exact}/`)
      return '/'
    const prefixed = `${exact}/`
    if (path.startsWith(prefixed))
      return path.slice(exact.length) || '/'
  }
  return path
}

const docPath = computed(() => {
  const rawPath = route.path.endsWith('/') && route.path.length > 1
    ? route.path.slice(0, -1)
    : route.path
  const normalized = stripLocalePrefix(rawPath).replace(/\.(en|zh)$/, '')
  return normalized || '/docs'
})

const localizedPath = computed(() => {
  return `${docPath.value}.${locale.value}`
})
const baseDocPath = computed(() => docPath.value.replace(/\/index$/, ''))
const localizedIndexPath = computed(() => `${baseDocPath.value}/index.${locale.value}`)
const indexPath = computed(() => `${baseDocPath.value}/index`)
const shouldTryIndex = computed(() => !docPath.value.endsWith('/index'))

const requestKey = computed(() => `doc:${docPath.value}:${locale.value}`)

function normalizeContentPath(path: string | null | undefined) {
  if (!path)
    return null
  const prefixed = path.startsWith('/') ? path : `/${path}`
  return stripLocalePrefix(prefixed).replace(/\.(en|zh)$/, '')
}

const { data: doc, status } = await useAsyncData(
  () => requestKey.value,
  async () => {
    const localizedDoc = await queryCollection('docs').path(localizedPath.value).first()
    if (localizedDoc)
      return localizedDoc

    if (shouldTryIndex.value) {
      const localizedIndexDoc = await queryCollection('docs').path(localizedIndexPath.value).first()
      if (localizedIndexDoc)
        return localizedIndexDoc
    }

    const baseDoc = await queryCollection('docs').path(docPath.value).first()
    if (baseDoc)
      return baseDoc

    if (shouldTryIndex.value)
      return await queryCollection('docs').path(indexPath.value).first()

    return null
  },
  { watch: [docPath, locale] },
)

const docMeta = computed(() => (doc.value ?? {}) as Record<string, any>)

const isLoading = ref(status.value === 'pending' || status.value === 'idle')

watch(requestKey, () => {
  isLoading.value = true
})

watch(
  () => status.value,
  (value) => {
    if (value === 'success' || value === 'error')
      isLoading.value = false
  },
  { immediate: true },
)

const viewState = computed(() => {
  if (isLoading.value)
    return 'loading'
  if (doc.value)
    return 'content'
  return 'not-found'
})

const { data: navigationTree } = await useAsyncData(
  'docs:navigation',
  () => queryCollectionNavigation('docs'),
)

const outlineState = useState<any[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')
const docLocaleState = useState<string>('docs-locale', () => locale.value)
function extractDocText(value: any): string {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value
  if (Array.isArray(value))
    return value.map(extractDocText).join(' ')
  if (typeof value === 'object') {
    if (typeof value.value === 'string')
      return value.value
    if (typeof value.text === 'string')
      return value.text
    if (Array.isArray(value.children))
      return value.children.map(extractDocText).join(' ')
  }
  return ''
}

const heroBreadcrumbs = computed(() => {
  const path = doc.value?.path ?? docPath.value
  const isComponentDoc = typeof path === 'string' && path.includes('/docs/dev/components')
  const prefix = isComponentDoc
    ? (locale.value === 'zh' ? '组件' : 'Components')
    : (locale.value === 'zh' ? '文档' : 'Docs')
  const title = doc.value?.title ? String(doc.value.title) : ''
  const category = docMeta.value.category ? String(docMeta.value.category) : ''
  if (title)
    return [prefix, title]
  if (category)
    return [prefix, category]
  return [prefix]
})
const heroSinceLabel = computed(() => {
  const since = docMeta.value.since ? String(docMeta.value.since).trim() : ''
  if (!since)
    return ''
  const normalized = /^v/i.test(since) ? since : `v${since}`
  return locale.value === 'zh' ? `自 ${normalized}` : `Since ${normalized}`
})
const heroStatusLabel = computed(() => {
  const status = docMeta.value.status ? String(docMeta.value.status).trim() : ''
  if (!status)
    return ''
  return status.charAt(0).toUpperCase() + status.slice(1)
})
const heroReadTimeLabel = computed(() => {
  const text = extractDocText(doc.value?.body).replace(/\s+/g, ' ').trim()
  if (!text)
    return ''
  if (locale.value === 'zh') {
    const charCount = text.replace(/\s/g, '').length
    const minutes = Math.max(1, Math.round(charCount / 350))
    return `${minutes} 分钟阅读`
  }
  const words = text.split(/\s+/).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
})
const heroMetaItems = computed(() => {
  const items: Array<{ key: string; label: string; variant?: string }> = []
  if (heroSinceLabel.value)
    items.push({ key: 'since', label: heroSinceLabel.value, variant: 'is-since' })
  if (heroStatusLabel.value)
    items.push({ key: 'status', label: heroStatusLabel.value, variant: 'is-status' })
  if (heroReadTimeLabel.value)
    items.push({ key: 'read', label: heroReadTimeLabel.value, variant: 'is-read' })
  return items
})
const showDocHero = computed(() => Boolean(doc.value?.title && (docMeta.value.category || docMeta.value.status || docMeta.value.since || doc.value?.description)))

function resolveDocLocale(target: any) {
  const path = typeof target?.path === 'string' ? target.path : null
  if (!path)
    return 'en'
  if (path.endsWith('.zh'))
    return 'zh'
  if (path.endsWith('.en'))
    return 'en'
  return 'en'
}

const normalizedDocPath = computed(() => normalizeContentPath(doc.value?.path ?? docPath.value))

function itemTitle(title?: string, path?: string) {
  if (title)
    return title
  if (!path)
    return 'Untitled'

  return path
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.(en|zh)$/, '')
    ?.replace(/[-_]/g, ' ')
    ?.replace(/\b\w/g, c => c.toUpperCase()) ?? 'Untitled'
}

function collectSectionPages(node: any): any[] {
  if (!node)
    return []
  const queue = Array.isArray(node) ? node : [node]
  const result: any[] = []
  for (const current of queue) {
    if (!current)
      continue
    const currentPath = normalizeContentPath(current.path)
    if (currentPath && current.page !== false)
      result.push(current)
    if (Array.isArray(current.children) && current.children.length > 0)
      result.push(...collectSectionPages(current.children))
  }
  return result
}

const navigationSections = computed(() => {
  const items = navigationTree.value ?? []
  if (!items.length)
    return []
  const [first] = items
  if (first?.path === '/docs' && Array.isArray(first.children))
    return first.children
  return items
})

const docPager = computed(() => {
  const sections = navigationSections.value
  const currentPath = normalizedDocPath.value

  if (!sections.length || !currentPath)
    return { prev: null, next: null, sectionTitle: null }

  for (const section of sections) {
    const pages = collectSectionPages(section)
    const index = pages.findIndex(page => normalizeContentPath(page.path) === currentPath)
    if (index === -1)
      continue

    const prev = index > 0 ? pages[index - 1] : null
    const next = index < pages.length - 1 ? pages[index + 1] : null

    return {
      prev,
      next,
      sectionTitle: itemTitle(section.title, section.path),
    }
  }

  return { prev: null, next: null, sectionTitle: null }
})

const lastUpdatedDate = computed(() => {
  const source = doc.value
  if (!source)
    return null

  const meta = source.meta as Record<string, unknown> | undefined
  const candidates = [
    meta?.updatedAt,
    meta?.modifiedAt,
    meta?.mtime,
    meta?.createdAt,
  ]

  for (const candidate of candidates) {
    if (!candidate)
      continue
    const value = candidate instanceof Date
      ? candidate
      : new Date(candidate as any)
    if (!Number.isNaN(value.getTime()))
      return value
  }

  return null
})

const formattedLastUpdated = computed(() => {
  if (!lastUpdatedDate.value)
    return null
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(lastUpdatedDate.value)
})

const pagerPrevPath = computed(() => {
  const entry = docPager.value.prev
  return entry ? normalizeContentPath(entry.path) : null
})

const pagerNextPath = computed(() => {
  const entry = docPager.value.next
  return entry ? normalizeContentPath(entry.path) : null
})

const pagerPrevTitle = computed(() => {
  const entry = docPager.value.prev
  return entry ? itemTitle(entry.title, entry.path) : null
})

const pagerNextTitle = computed(() => {
  const entry = docPager.value.next
  return entry ? itemTitle(entry.title, entry.path) : null
})

watchEffect(() => {
  if (doc.value) {
    outlineState.value = doc.value.body?.toc?.links ?? []
    docTitleState.value = doc.value.seo?.title ?? doc.value.title ?? ''
    docLocaleState.value = resolveDocLocale(doc.value)
  }
  else {
    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = locale.value
  }
})

onBeforeUnmount(() => {
  outlineState.value = []
  docTitleState.value = ''
})

// View tracking (admin only display)
const viewCount = ref<number | null>(null)
const viewCountLoading = ref(false)

const copyLabels = computed(() => {
  const isZh = locale.value === 'zh'
  return {
    copy: isZh ? '复制' : 'Copy',
    copied: isZh ? '已复制' : 'Copied',
    failed: isZh ? '复制失败' : 'Copy failed',
    text: isZh ? '文本' : 'Text',
  }
})

function resolveCodeLanguage(codeEl: HTMLElement | null, preEl: HTMLElement | null) {
  const attrLang = codeEl?.getAttribute('data-language')
    ?? codeEl?.getAttribute('data-lang')
    ?? preEl?.getAttribute('data-language')
  if (attrLang)
    return attrLang.trim()

  const className = codeEl?.className ?? preEl?.className ?? ''
  const match = className.match(/(?:language|lang)-([\w-]+)/i)
  return match?.[1] ?? ''
}

function formatLanguageLabel(language: string) {
  if (!language)
    return copyLabels.value.text
  return language.replace(/[^a-z0-9+#.-]/gi, '').toUpperCase()
}

async function writeToClipboard(text: string) {
  if (!text)
    return
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const CodeHeader = defineComponent({
  name: 'DocsCodeHeader',
  props: {
    language: { type: String, default: '' },
    codeText: { type: String, default: '' },
  },
  setup(props) {
    const label = computed(() => formatLanguageLabel(props.language))

    const handleCopy = async () => {
      try {
        await writeToClipboard(props.codeText)
        toast.success(copyLabels.value.copied)
      }
      catch {
        toast.error(copyLabels.value.failed)
      }
    }

    return () => [
      h('span', { class: 'docs-code-language' }, label.value),
      h(
        TxButton,
        {
          'size': 'sm',
          'variant': 'ghost',
          'class': 'docs-code-copy',
          'aria-label': copyLabels.value.copy,
          'onClick': handleCopy,
        },
        () => copyLabels.value.copy,
      ),
    ]
  },
})

function renderCodeHeader(target: HTMLElement, language: string, codeText: string) {
  const vnode = h(CodeHeader, { language, codeText })
  vnode.appContext = nuxtApp.vueApp._context
  render(vnode, target)
}

function enhanceCodeBlocks() {
  if (import.meta.server)
    return

  const blocks = document.querySelectorAll<HTMLPreElement>('.docs-prose pre')
  blocks.forEach((pre) => {
    if (pre.closest('.tuff-code-block'))
      return
    const code = pre.querySelector<HTMLElement>('code')
    if (!code)
      return

    const language = resolveCodeLanguage(code, pre)
    pre.dataset.language = language || 'text'

    let header = pre.querySelector<HTMLDivElement>('.docs-code-header')
    if (!header) {
      header = document.createElement('div')
      header.className = 'docs-code-header'
      pre.insertBefore(header, pre.firstChild)
    }
    renderCodeHeader(header, language, code.textContent ?? '')
  })
}

async function scheduleCodeEnhance(delay = 0) {
  if (import.meta.server)
    return
  if (delay > 0) {
    window.setTimeout(() => {
      void scheduleCodeEnhance()
    }, delay)
    return
  }
  await nextTick()
  requestAnimationFrame(() => {
    enhanceCodeBlocks()
  })
}

async function trackView() {
  if (!docPath.value)
    return

  try {
    viewCountLoading.value = true
    const result = await $fetch('/api/docs/view', {
      method: 'POST',
      body: { path: docPath.value },
    })
    viewCount.value = result.views
  }
  catch (error) {
    console.warn('[docs] Failed to track view:', error)
  }
  finally {
    viewCountLoading.value = false
  }
}

async function fetchViewCount() {
  if (!docPath.value || !isAdmin.value)
    return

  try {
    const result = await $fetch('/api/docs/view', {
      method: 'GET',
      query: { path: docPath.value },
    })
    viewCount.value = result.views
  }
  catch (error) {
    console.warn('[docs] Failed to fetch view count:', error)
  }
}

// Track view on mount
onMounted(() => {
  trackView()
  scheduleCodeEnhance()
})

// Refetch view count when doc changes (for admins)
watch(
  () => [docPath.value, isAdmin.value],
  () => {
    if (isAdmin.value && viewCount.value === null) {
      fetchViewCount()
    }
  },
  { immediate: true },
)

watch(
  () => [doc.value, status.value, locale.value],
  () => {
    if (status.value === 'success' && doc.value)
      scheduleCodeEnhance()
  },
)

watch(
  () => viewState.value,
  (value) => {
    if (!import.meta.client)
      return
    if (value === 'content')
      scheduleCodeEnhance(260)
  },
)
</script>

<template>
  <div class="docs-root relative">
    <Transition name="docs-state" mode="out-in">
      <div :key="viewState" class="docs-state">
        <div v-if="viewState === 'loading'" class="docs-state__body px-6 py-20">
          <TxLoadingState title="" :description="t('docs.loading')" />
        </div>

        <div
          v-else-if="viewState === 'content'"
          class="docs-surface px-8 py-10 space-y-10"
          :class="{ 'docs-surface--hero': showDocHero }"
        >
          <section v-if="showDocHero" class="docs-hero">
            <div v-if="heroBreadcrumbs.length" class="docs-hero__breadcrumb">
              <template v-for="(crumb, index) in heroBreadcrumbs" :key="`${crumb}-${index}`">
                <span
                  class="docs-hero__crumb"
                  :class="{ 'is-current': index === heroBreadcrumbs.length - 1 }"
                >
                  {{ crumb }}
                </span>
                <span v-if="index < heroBreadcrumbs.length - 1" class="docs-hero__crumb-sep">/</span>
              </template>
            </div>
            <h1 class="docs-hero__title">
              {{ doc?.title }}
            </h1>
            <p v-if="doc?.description" class="docs-hero__desc">
              {{ doc?.description }}
            </p>
            <div v-if="heroMetaItems.length" class="docs-hero__meta">
              <span v-for="item in heroMetaItems" :key="item.key" class="docs-hero__pill" :class="item.variant">
                {{ item.label }}
              </span>
            </div>
          </section>
          <ContentRenderer
            :value="doc ?? {}"
            :class="[
              'docs-prose',
              'markdown-body',
              'max-w-none',
              'prose',
              'prose-neutral',
              'dark:prose-invert',
              { 'docs-prose--hero': showDocHero },
            ]"
          />
          <div
            v-if="formattedLastUpdated || isAdmin"
            class="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-dark/5 pt-6 text-sm text-black/40 dark:border-light/5 dark:text-light/40"
          >
            <div class="flex flex-wrap items-center gap-4">
              <div v-if="formattedLastUpdated" class="flex items-center gap-1.5">
                <span class="i-carbon-time" />
                <span>
                  {{ t('docs.lastUpdatedLabel') }}
                  <span class="text-black/70 dark:text-light/70">{{ formattedLastUpdated }}</span>
                </span>
              </div>
              <div v-if="isAdmin && viewCount !== null" class="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-primary">
                <span class="i-carbon-view" />
                <span class="font-medium">{{ viewCount }}</span>
              </div>
            </div>
          </div>

          <div v-if="pagerPrevPath || pagerNextPath" class="space-y-4">
            <div v-if="docPager.sectionTitle" class="text-xs text-black/40 tracking-[0.2em] uppercase dark:text-light/40">
              {{ docPager.sectionTitle }}
            </div>
            <div class="grid gap-4 lg:grid-cols-2">
              <NuxtLink
                v-if="pagerPrevPath"
                :to="localePath({ path: pagerPrevPath })"
                class="group flex flex-col gap-2 border border-dark/10 rounded-2xl px-5 py-4 no-underline transition dark:border-light/10 hover:border-dark/20 hover:bg-dark/5 dark:hover:border-light/20 dark:hover:bg-light/5"
              >
                <span class="dark:group-hover:text-primary-200 flex items-center gap-2 text-xs text-black/40 font-medium tracking-[0.2em] uppercase dark:text-light/40 group-hover:text-primary">
                  <span class="i-carbon-arrow-left text-base" />
                  {{ t('docs.previousChapter') }}
                </span>
                <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
                  {{ pagerPrevTitle }}
                </span>
              </NuxtLink>
              <NuxtLink
                v-if="pagerNextPath"
                :to="localePath({ path: pagerNextPath })"
                class="group flex flex-col gap-2 border border-dark/10 rounded-2xl px-5 py-4 no-underline transition dark:border-light/10 hover:border-primary/30 hover:bg-primary/5 dark:hover:border-primary/40 dark:hover:bg-primary/10"
              >
                <span class="dark:group-hover:text-primary-200 flex items-center gap-2 text-xs text-black/40 font-medium tracking-[0.2em] uppercase dark:text-light/40 group-hover:text-primary">
                  {{ t('docs.nextChapter') }}
                  <span class="i-carbon-arrow-right text-base" />
                </span>
                <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
                  {{ pagerNextTitle }}
                </span>
              </NuxtLink>
            </div>
          </div>
        </div>

        <div
          v-else
          class="docs-state__body p-10 text-center space-y-4"
        >
          <div class="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-dark/5 text-3xl text-black dark:bg-light/10 dark:text-light">
            <span class="i-carbon-warning" />
          </div>
          <div class="text-lg text-black font-semibold dark:text-light">
            {{ t('docs.notFoundTitle') }}
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-300">
            {{ t('docs.notFoundDescription') }}
          </p>
          <NuxtLink
            to="/docs"
            class="inline-flex items-center justify-center gap-2 rounded-full bg-dark px-5 py-2 text-sm text-light font-medium no-underline transition dark:bg-light hover:bg-black dark:text-black dark:hover:bg-light/90"
          >
            <span class="i-carbon-arrow-left text-base" />
            {{ t('docs.backHome') }}
          </NuxtLink>
        </div>
      </div>
    </Transition>
    <ClientOnly>
      <Toaster position="bottom-left" />
    </ClientOnly>
  </div>
</template>

<style src="../../components/docs/github-markdown.css" />

<style scoped>
.docs-root {
  min-height: 320px;
}

.docs-state__body {
  border-radius: 20px;
}

.docs-state-enter-active,
.docs-state-leave-active {
  transition: opacity 220ms ease, filter 220ms ease, transform 220ms ease;
}

.docs-state-enter-from,
.docs-state-leave-to {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(6px);
}

.docs-surface {
  position: relative;
  border-radius: 8px;
  background: transparent;
  isolation: isolate;
}

.docs-surface--hero::before {
  content: '';
  position: absolute;
  left: -40px;
  right: -40px;
  top: -52px;
  height: 300px;
  border-radius: 36px;
  background:
    radial-gradient(120% 140% at 15% 0%, rgba(96, 165, 250, 0.24), transparent 62%),
    radial-gradient(120% 140% at 85% 0%, rgba(244, 114, 182, 0.16), transparent 64%),
    linear-gradient(120deg, rgba(248, 250, 252, 0.95), rgba(241, 245, 249, 0.6));
  filter: blur(0);
  opacity: 0.92;
  pointer-events: none;
  z-index: -1;
}

.docs-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 36px 44px;
  border-radius: 28px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 26px 70px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(12px);
}

.docs-hero__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(100, 116, 139, 0.7);
}

.docs-hero__crumb {
  color: var(--docs-muted);
}

.docs-hero__crumb.is-current {
  color: var(--docs-ink);
}

.docs-hero__crumb-sep {
  color: var(--docs-muted);
  opacity: 0.6;
}

.docs-hero__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.docs-hero__pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.04);
  color: var(--docs-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.docs-hero__pill.is-since {
  border-color: rgba(56, 189, 248, 0.25);
  background: rgba(56, 189, 248, 0.12);
  color: var(--docs-accent-strong);
}

.docs-hero__pill.is-status {
  border-color: rgba(15, 23, 42, 0.16);
  background: rgba(15, 23, 42, 0.05);
  color: var(--docs-ink);
}

.docs-hero__pill.is-read {
  border-color: rgba(14, 165, 233, 0.18);
  background: rgba(14, 165, 233, 0.08);
  color: var(--docs-accent);
}

::deep(.dark .docs-hero__crumb),
::deep([data-theme='dark'] .docs-hero__crumb) {
  color: rgba(226, 232, 240, 0.6);
}

::deep(.dark .docs-hero__crumb.is-current),
::deep([data-theme='dark'] .docs-hero__crumb.is-current) {
  color: rgba(248, 250, 252, 0.95);
}

::deep(.dark .docs-hero__pill),
::deep([data-theme='dark'] .docs-hero__pill) {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(30, 41, 59, 0.55);
  color: rgba(226, 232, 240, 0.85);
}

::deep(.dark .docs-hero__pill.is-since),
::deep([data-theme='dark'] .docs-hero__pill.is-since) {
  border-color: rgba(125, 211, 252, 0.35);
  background: rgba(14, 165, 233, 0.22);
  color: rgba(226, 232, 240, 0.95);
}

::deep(.dark .docs-hero__pill.is-read),
::deep([data-theme='dark'] .docs-hero__pill.is-read) {
  border-color: rgba(56, 189, 248, 0.28);
  background: rgba(14, 165, 233, 0.16);
  color: rgba(226, 232, 240, 0.92);
}

:deep(.dark .docs-hero__breadcrumb),
:deep([data-theme='dark'] .docs-hero__breadcrumb) {
  color: rgba(226, 232, 240, 0.5);
}

.docs-hero__title {
  margin: 0;
  font-size: 3rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--docs-ink);
}

.docs-hero__desc {
  margin: 0;
  max-width: 640px;
  font-size: 1.1rem;
  color: rgba(71, 85, 105, 0.85);
}

:deep(.dark .docs-hero__desc),
:deep([data-theme='dark'] .docs-hero__desc) {
  color: rgba(226, 232, 240, 0.75);
}

:deep(.docs-prose--hero > h1:first-of-type),
:deep(.docs-prose--hero > h1:first-of-type + blockquote),
:deep(.docs-prose--hero > h1:first-of-type + blockquote + p) {
  display: none;
}

:deep(.dark .docs-surface--hero)::before,
:deep([data-theme='dark'] .docs-surface--hero)::before {
  background:
    radial-gradient(120% 140% at 15% 0%, rgba(14, 116, 144, 0.4), transparent 62%),
    radial-gradient(120% 140% at 85% 0%, rgba(59, 130, 246, 0.3), transparent 64%),
    linear-gradient(120deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.65));
  opacity: 0.82;
}

:deep(.dark .docs-hero),
:deep([data-theme='dark'] .docs-hero) {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);
}

:deep(.dark .docs-hero__badge),
:deep([data-theme='dark'] .docs-hero__badge) {
  border-color: rgba(125, 211, 252, 0.3);
  background: rgba(56, 189, 248, 0.16);
  color: rgba(226, 232, 240, 0.9);
}

@media (max-width: 768px) {
  .docs-hero {
    padding: 24px;
  }

  .docs-hero__title {
    font-size: 2.2rem;
  }

  .docs-hero__desc {
    font-size: 0.95rem;
  }
}

:deep(.docs-prose) {
  --docs-accent: #1bb5f4;
  --docs-accent-strong: #0ea5e9;
  --docs-ink: var(--fgColor-default);
  --docs-muted: var(--fgColor-muted);
  --docs-border: var(--borderColor-muted);
  --docs-code-bg: var(--bgColor-muted);
  --docs-code-border: var(--borderColor-default);
  --docs-inline-code-bg: var(--bgColor-neutral-muted);
  --docs-inline-code-border: var(--borderColor-muted);
  --docs-hr-color: rgba(15, 23, 42, 0.18);
  --tw-prose-body: var(--docs-ink);
  --tw-prose-headings: var(--docs-accent-strong);
  --tw-prose-lead: var(--docs-muted);
  --tw-prose-links: var(--docs-accent);
  --tw-prose-bold: var(--docs-ink);
  --tw-prose-counters: var(--docs-muted);
  --tw-prose-bullets: var(--docs-muted);
  --tw-prose-hr: var(--docs-border);
  --tw-prose-quotes: var(--docs-muted);
  --tw-prose-quote-borders: var(--docs-border);
  --tw-prose-captions: var(--docs-muted);
  --tw-prose-code: var(--docs-ink);
  --tw-prose-pre-code: var(--docs-ink);
  --tw-prose-pre-bg: var(--docs-code-bg);
  --tw-prose-th-borders: var(--docs-border);
  --tw-prose-td-borders: var(--docs-border);
  color: var(--docs-ink);
}

:deep(.dark .docs-prose),
:deep([data-theme='dark'] .docs-prose) {
  --docs-accent: #7dd3fc;
  --docs-accent-strong: #38bdf8;
  --docs-ink: #f8fafc;
  --docs-muted: rgba(226, 232, 240, 0.8);
  --docs-border: var(--borderColor-muted);
  --docs-code-bg: var(--bgColor-muted);
  --docs-code-border: var(--borderColor-default);
  --docs-inline-code-bg: var(--bgColor-neutral-muted);
  --docs-inline-code-border: var(--borderColor-muted);
  --docs-hr-color: rgba(148, 163, 184, 0.32);
  color: var(--docs-ink);
}

:deep(.docs-prose h1) {
  font-size: 2.25rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  letter-spacing: -0.02em;
  color: var(--docs-accent-strong);
}

:deep(.docs-prose h2) {
  font-size: 1.75rem;
  font-weight: 600;
  margin-top: 2rem;
  margin-bottom: 0.8rem;
  letter-spacing: -0.01em;
  padding-bottom: 0.25rem;
}

:deep(.docs-prose h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.6rem;
  color: rgba(15, 23, 42, 0.9);
}

:deep(.dark .docs-prose h3),
:deep([data-theme='dark'] .docs-prose h3) {
  color: rgba(241, 245, 249, 0.92);
}

:deep(.docs-prose p),
:deep(.docs-prose ul),
:deep(.docs-prose ol),
:deep(.docs-prose li) {
  line-height: 1.7;
  margin-bottom: 0.9rem;
  color: var(--docs-ink);
}

:deep(.docs-prose strong) {
  color: var(--docs-ink);
}

:deep(.dark .docs-prose strong),
:deep([data-theme='dark'] .docs-prose strong) {
  color: #9ad2ee;
}

:deep(.docs-prose del) {
  color: var(--docs-muted);
  text-decoration-color: currentColor;
}

:deep(.docs-prose code) {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
  border-radius: 4px;
  padding: 0.2rem 0.35rem;
  background-color: var(--docs-inline-code-bg);
  border: 1px solid var(--docs-inline-code-border);
  color: var(--docs-ink);
}

:deep(.dark .docs-prose code),
:deep([data-theme='dark'] .docs-prose code) {
  color: var(--docs-ink);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre)) {
  position: relative;
  margin: 1.2rem 0;
  padding: 2.2rem 1rem 1rem;
  border-radius: 8px;
  background: var(--docs-code-bg) !important;
  border: 1px solid var(--docs-code-border);
  overflow-x: auto;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) code) {
  background-color: transparent !important;
  padding: 0;
  border-radius: 0;
  border: none;
  color: inherit;
  font-size: 0.9em;
  line-height: 1.6;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-header) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.6);
  background: rgba(15, 23, 42, 0.03);
}

:deep(.dark .docs-prose pre:not(.tuff-code-block__pre) .docs-code-header),
:deep([data-theme='dark'] .docs-prose pre:not(.tuff-code-block__pre) .docs-code-header) {
  color: rgba(226, 232, 240, 0.88);
  background: rgba(15, 23, 42, 0.55);
  border-bottom-color: rgba(148, 163, 184, 0.24);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-language) {
  font-weight: 600;
  color: inherit;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy) {
  font-size: 0.7rem;
  letter-spacing: 0.05em;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy:disabled) {
  opacity: 0.5;
  cursor: default;
}

:deep(.docs-prose blockquote) {
  border-left: 3px solid var(--docs-accent);
  padding-left: 1rem;
  margin: 1.2rem 0;
  font-style: italic;
  color: var(--docs-muted);
}

:deep(.docs-prose ul),
:deep(.docs-prose ol) {
  padding-left: 1.6rem;
}

:deep(.docs-prose ul li::marker),
:deep(.docs-prose ol li::marker) {
  color: var(--docs-accent);
}

:deep(.docs-prose a) {
  color: var(--docs-accent);
  text-decoration: none;
  border-bottom: 1px solid rgba(27, 181, 244, 0.35);
}

:deep(.docs-prose hr) {
  border: 0;
  height: 1px;
  margin: 2rem 0;
  background-image: linear-gradient(90deg, transparent, var(--docs-hr-color), transparent);
  background-size: 200% 100%;
  animation: docs-hr-shimmer 6s ease-in-out infinite;
  opacity: 0.6;
}

:deep(.docs-prose table) {
  width: 100%;
  border-collapse: collapse;
  border: none;
  border-radius: 6px;
  overflow: hidden;
}

:deep(.docs-prose table th),
:deep(.docs-prose table td) {
  padding: 0.5rem 0.8rem;
  border: none;
  text-align: left;
  color: var(--docs-ink);
}

:deep(.docs-prose table tr) {
  border-top: none;
}

:deep(.docs-prose table tr:last-child td) {
  border-bottom: 0;
}

:deep(.docs-prose table th) {
  background: rgba(15, 23, 42, 0.06);
  color: var(--docs-ink);
  font-weight: 600;
}

:deep(.dark .docs-prose table th),
:deep([data-theme='dark'] .docs-prose table th) {
  background: rgba(148, 163, 184, 0.32);
  color: var(--docs-ink);
}

:deep(.docs-prose table tbody tr:nth-child(2n)) {
  background: rgba(15, 23, 42, 0.04);
}

:deep(.dark .docs-prose table tbody tr:nth-child(2n)),
:deep([data-theme='dark'] .docs-prose table tbody tr:nth-child(2n)) {
  background: rgba(148, 163, 184, 0.16);
}

@keyframes docs-hr-shimmer {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.docs-prose hr) {
    animation: none;
  }
}
</style>

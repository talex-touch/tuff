<script setup lang="ts">
import { TxButton, TxLoadingState } from '@talex-touch/tuffex'
import { defineComponent, h, render } from 'vue'
import { toast, Toaster } from 'vue-sonner'
import DocHero from '~/components/docs/DocHero.vue'
import DocsFeedback from '~/components/docs/DocsFeedback.vue'

definePageMeta({
  layout: 'docs',
  pageTransition: {
    name: 'docs-page',
    mode: 'out-in',
  },
})

const route = useRoute()
const nuxtApp = useNuxtApp()
const { locale, t } = useI18n()
const localePath = useLocalePath()

const { user } = useAuthUser()
const isAdmin = computed(() => user.value?.role === 'admin')

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

function toBoolean(value: unknown) {
  if (value === true)
    return true
  if (typeof value === 'number')
    return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(normalized)
  }
  return false
}

function resolveDocMeta(record: Record<string, any> | null | undefined) {
  if (!record || typeof record !== 'object')
    return {}

  const rawMeta = record.meta
  let parsedMeta: Record<string, any> = {}

  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    parsedMeta = rawMeta as Record<string, any>
  }
  else if (typeof rawMeta === 'string') {
    try {
      const maybeMeta = JSON.parse(rawMeta)
      if (maybeMeta && typeof maybeMeta === 'object' && !Array.isArray(maybeMeta))
        parsedMeta = maybeMeta as Record<string, any>
    }
    catch {}
  }

  return {
    ...parsedMeta,
    ...record,
  }
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

const docMeta = computed(() => resolveDocMeta((doc.value ?? null) as Record<string, any> | null))

const isLoading = ref(status.value === 'pending' || status.value === 'idle')
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => isLoading.value)

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

watch(
  isLoading,
  (value) => {
    outlineLoadingState.value = value
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
const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))

watch(
  () => requestKey.value,
  () => {
    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = locale.value
    docMetaState.value = {}
  },
)

interface TocEntry {
  id: string
  text: string
  depth: number
  children?: TocEntry[]
}

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

function buildTocTree(entries: TocEntry[]) {
  const root: TocEntry[] = []
  const stack: TocEntry[] = []
  for (const entry of entries) {
    const node: TocEntry = { ...entry, children: [] }
    while (stack.length) {
      const last = stack.at(-1)
      if (!last || last.depth < node.depth)
        break
      stack.pop()
    }
    const parent = stack.at(-1)
    if (parent)
      parent.children?.push(node)
    else
      root.push(node)
    stack.push(node)
  }
  return root
}

function collectDomToc(): TocEntry[] {
  if (import.meta.server)
    return []
  const headings = Array.from(document.querySelectorAll<HTMLElement>(
    '.docs-prose h1, .docs-prose h2, .docs-prose h3, .docs-prose h4',
  ))
  const entries = headings
    .map((heading) => {
      const text = heading.textContent?.trim() ?? ''
      const depth = Number(heading.tagName.slice(1))
      return { id: heading.id, text, depth }
    })
    .filter(entry => entry.id && entry.text)
  return buildTocTree(entries)
}

async function scheduleOutlineSync(delay = 0) {
  if (import.meta.server)
    return
  if (delay > 0) {
    window.setTimeout(() => {
      void scheduleOutlineSync()
    }, delay)
    return
  }
  await nextTick()
  requestAnimationFrame(() => {
    if (outlineState.value.length)
      return
    const toc = collectDomToc()
    if (toc.length)
      outlineState.value = toc
  })
}

const docScope = computed(() => {
  const path = doc.value?.path ?? docPath.value
  const normalized = normalizeContentPath(path) ?? docPath.value
  const normalizedPath = typeof normalized === 'string' ? normalized : ''
  return {
    path: normalizedPath,
    isComponent: normalizedPath.includes('/docs/dev/components'),
    isExtension: normalizedPath.includes('/docs/dev/extensions'),
    isGuide: normalizedPath.startsWith('/docs/guide'),
    isDev: normalizedPath.startsWith('/docs/dev'),
  }
})

const heroBreadcrumbs = computed(() => {
  const isComponentDoc = docScope.value.isComponent
  const prefixLabel = isComponentDoc
    ? (locale.value === 'zh' ? '组件' : 'Components')
    : (locale.value === 'zh' ? '文档' : 'Docs')
  const prefixPath = isComponentDoc ? '/docs/dev/components' : '/docs'
  const title = doc.value?.title ? String(doc.value.title) : ''
  const category = docMeta.value.category ? String(docMeta.value.category) : ''
  const label = title || category
  const normalized = docScope.value.path
  const crumbs = [{ label: prefixLabel, path: prefixPath }]
  if (label)
    crumbs.push({ label, path: normalized ?? undefined })
  return crumbs
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
const heroSinceLabel = computed(() => {
  const raw = docMeta.value?.since ?? docMeta.value?.meta?.since
  const fallback = (() => {
    if (locale.value === 'zh') {
      if (docScope.value.isComponent)
        return '通用组件'
      if (docScope.value.isExtension)
        return '通用扩展'
      if (docScope.value.isGuide)
        return '通用教程'
      if (docScope.value.isDev)
        return '通用开发'
      return '通用文档'
    }
    if (docScope.value.isComponent)
      return 'Universal Component'
    if (docScope.value.isExtension)
      return 'Universal Extension'
    if (docScope.value.isGuide)
      return 'Universal Tutorial'
    if (docScope.value.isDev)
      return 'Universal Developer'
    return 'Universal Docs'
  })()
  if (!raw)
    return fallback
  const value = String(raw).trim()
  if (!value)
    return fallback
  return locale.value === 'zh' ? `自 ${value}` : `Since ${value}`
})
const heroBetaLabel = computed(() => {
  if (toBoolean(docMeta.value?.verified))
    return ''
  const raw = docMeta.value?.status ?? docMeta.value?.meta?.status
  if (!raw)
    return ''
  const value = String(raw).trim().toLowerCase()
  if (value !== 'beta')
    return ''
  return 'BETA'
})
const showDocHero = computed(() => {
  const heroFlag = docMeta.value?.hero
  const hideHero = docMeta.value?.hideHero
  const normalizedHero = typeof heroFlag === 'string' ? heroFlag.trim().toLowerCase() : heroFlag
  const normalizedHide = typeof hideHero === 'string' ? hideHero.trim().toLowerCase() : hideHero
  if (normalizedHide === true || normalizedHide === 'true' || normalizedHide === '1')
    return false
  if (normalizedHero === false || normalizedHero === 'false' || normalizedHero === '0' || normalizedHero === 'off' || normalizedHero === 'no')
    return false
  if (normalizedHero === true || normalizedHero === 'true' || normalizedHero === '1' || normalizedHero === 'on' || normalizedHero === 'yes')
    return true
  return Boolean(doc.value?.title)
})

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

function matchesLocale(target: any) {
  const path = typeof target?.path === 'string' ? target.path : ''
  if (path.endsWith('.zh'))
    return locale.value === 'zh'
  if (path.endsWith('.en'))
    return locale.value === 'en'
  return true
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
    if (currentPath && current.page !== false && matchesLocale(current))
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
  const record = source as unknown as Record<string, unknown>
  const candidates = [
    meta?.updatedAt,
    meta?.modifiedAt,
    meta?.mtime,
    meta?.createdAt,
    record.updatedAt,
    record.modifiedAt,
    record.mtime,
    record.createdAt,
    record._updatedAt,
    record._modifiedAt,
    record._mtime,
    record._createdAt,
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

const heroUpdatedLocale = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const heroUpdatedAgo = useTimeAgoIntl(
  () => lastUpdatedDate.value?.getTime() ?? Date.now(),
  {
    get locale() {
      return heroUpdatedLocale.value
    },
  },
)
const heroUpdatedLabel = computed(() => {
  if (!lastUpdatedDate.value)
    return ''
  return locale.value === 'zh'
    ? `更新于 ${heroUpdatedAgo.value}`
    : `Updated ${heroUpdatedAgo.value}`
})
const isDocVerified = computed(() => toBoolean(docMeta.value?.verified))
const heroVerifiedLabel = computed(() => (isDocVerified.value ? 'Verified' : ''))

type DocSyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

const DOC_SYNC_STATUS_ALIASES: Record<string, DocSyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

const docSyncStatus = computed<DocSyncStatusKey>(() => {
  if (isDocVerified.value)
    return 'verified'

  const raw = typeof docMeta.value?.syncStatus === 'string'
    ? docMeta.value.syncStatus.trim()
    : ''

  return DOC_SYNC_STATUS_ALIASES[raw] ?? 'not_started'
})

const heroSyncBanner = computed(() => {
  if (!docScope.value.isComponent || docSyncStatus.value === 'verified')
    return null

  if (docSyncStatus.value === 'in_progress' || docSyncStatus.value === 'not_started') {
    return {
      status: 'in_progress',
      icon: 'i-carbon-in-progress',
      title: locale.value === 'zh' ? '当前组件文档正在开发中' : 'This component doc is in progress',
      description: locale.value === 'zh'
        ? '该页面正在持续迁移，示例与 API 可能会继续调整。'
        : 'This page is still being migrated. Demos and API details may change.',
    }
  }

  return {
    status: 'migrated',
    icon: 'i-carbon-warning-alt',
    title: locale.value === 'zh' ? '该页面由 AI 迁移生成，请谨慎使用' : 'This page was migrated by AI, please review carefully',
    description: locale.value === 'zh'
      ? '内容已迁移完成，但仍建议结合源码和人工评审结果使用。'
      : 'Migration is complete, but please validate against source code and manual review.',
  }
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
    docMetaState.value = docMeta.value
    if (!outlineState.value.length)
      void scheduleOutlineSync(120)
  }
  else {
    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = locale.value
    docMetaState.value = {}
  }
})

onBeforeUnmount(() => {
  outlineState.value = []
  docTitleState.value = ''
  docMetaState.value = {}
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

const GITHUB_REPO = 'AJLoveChina/talex-touch'
const editOnGitHubUrl = computed(() => {
  const path = doc.value?.path
  if (!path)
    return null
  return `https://github.com/${GITHUB_REPO}/edit/master/apps/nexus/content${path}.mdc`
})

async function shareCurrentPage() {
  if (!import.meta.client)
    return
  try {
    await writeToClipboard(window.location.href)
    toast.success(t('docs.shareCopied', 'Link copied!'))
  }
  catch {
    toast.error(t('docs.shareFailed', 'Copy failed'))
  }
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
    if (value === 'content')
      void scheduleOutlineSync(280)
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
          <div v-if="showDocHero" class="docs-hero-block">
            <div v-if="heroBreadcrumbs.length" class="docs-hero-breadcrumb">
              <template v-for="(crumb, index) in heroBreadcrumbs" :key="`${crumb.label}-${index}`">
                <NuxtLink
                  v-if="crumb.path && index < heroBreadcrumbs.length - 1"
                  :to="localePath({ path: crumb.path })"
                  class="docs-hero-crumb"
                >
                  {{ crumb.label }}
                </NuxtLink>
                <span
                  v-else
                  class="docs-hero-crumb"
                  :class="{ 'is-current': index === heroBreadcrumbs.length - 1 }"
                  :aria-current="index === heroBreadcrumbs.length - 1 ? 'page' : undefined"
                >
                  {{ crumb.label }}
                </span>
                <span v-if="index < heroBreadcrumbs.length - 1" class="docs-hero-crumb-sep">/</span>
              </template>
            </div>
            <DocHero
              :title="doc?.title"
              :description="doc?.description"
              :since-label="heroSinceLabel"
              :beta-label="heroBetaLabel"
              :read-time-label="heroReadTimeLabel"
              :updated-label="heroUpdatedLabel"
              :verified-label="heroVerifiedLabel"
            />
          </div>
          <div
            v-if="heroSyncBanner"
            class="docs-sync-banner"
            :data-status="heroSyncBanner.status"
          >
            <span class="docs-sync-banner__icon" :class="heroSyncBanner.icon" />
            <div class="docs-sync-banner__content">
              <p class="docs-sync-banner__title">
                {{ heroSyncBanner.title }}
              </p>
              <p class="docs-sync-banner__desc">
                {{ heroSyncBanner.description }}
              </p>
            </div>
          </div>
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
            <div class="flex items-center gap-3">
              <button
                class="flex items-center gap-1.5 text-black/40 transition hover:text-black/70 dark:text-light/40 dark:hover:text-light/70"
                @click="shareCurrentPage"
              >
                <span class="i-carbon-share text-sm" />
                <span class="text-xs">{{ t('docs.share', 'Share') }}</span>
              </button>
              <a
                v-if="editOnGitHubUrl"
                :href="editOnGitHubUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1.5 text-black/40 no-underline transition hover:text-black/70 dark:text-light/40 dark:hover:text-light/70"
              >
                <span class="i-carbon-edit text-sm" />
                <span class="text-xs">{{ t('docs.editOnGitHub', 'Edit this page') }}</span>
              </a>
            </div>
          </div>

          <DocsFeedback :doc-path="docPath" />

          <div v-if="pagerPrevPath || pagerNextPath" class="space-y-4">
            <div v-if="docPager.sectionTitle" class="text-xs text-black/40 tracking-[0.12em] uppercase dark:text-light/40">
              {{ docPager.sectionTitle }}
            </div>
            <div class="grid gap-4 lg:grid-cols-2">
              <NuxtLink
                v-if="pagerPrevPath"
                :to="localePath({ path: pagerPrevPath })"
                class="group flex flex-col gap-2 border border-dark/10 rounded-2xl px-5 py-4 no-underline transition dark:border-light/10 hover:border-dark/20 hover:bg-dark/5 dark:hover:border-light/20 dark:hover:bg-light/5"
              >
                <span class="dark:group-hover:text-primary-200 flex items-center gap-2 text-xs text-black/40 font-medium tracking-[0.12em] uppercase dark:text-light/40 group-hover:text-primary">
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
                class="group flex flex-col items-end gap-2 border border-dark/10 rounded-2xl px-5 py-4 text-right no-underline transition dark:border-light/10 hover:border-primary/30 hover:bg-primary/5 dark:hover:border-primary/40 dark:hover:bg-primary/10"
              >
                <span class="dark:group-hover:text-primary-200 flex items-center justify-end gap-2 text-xs text-black/40 font-medium tracking-[0.12em] uppercase dark:text-light/40 group-hover:text-primary">
                  {{ t('docs.nextChapter') }}
                  <span class="i-carbon-arrow-right text-base" />
                </span>
                <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
                  {{ pagerNextTitle }}
                </span>
              </NuxtLink>
            </div>
          </div>

          <DocsComments :doc-path="docPath" />
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

:global(.docs-page-enter-active),
:global(.docs-page-leave-active) {
  transition:
    opacity 260ms ease,
    transform 320ms cubic-bezier(0.28, 1.7, 0.52, 1),
    filter 260ms ease;
}

:global(.docs-page-enter-from),
:global(.docs-page-leave-to) {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  filter: blur(3px);
}

@media (prefers-reduced-motion: reduce) {
  :global(.docs-page-enter-active),
  :global(.docs-page-leave-active) {
    transition: none;
  }
}

.docs-surface {
  position: relative;
  border-radius: 8px;
  background: transparent;
  isolation: isolate;
}

.docs-hero-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.docs-sync-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.75);
  background: rgba(248, 250, 252, 0.7);
  padding: 12px 14px;
}

.docs-sync-banner__icon {
  margin-top: 1px;
  font-size: 16px;
  color: rgba(71, 85, 105, 0.9);
}

.docs-sync-banner__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-sync-banner__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.92);
}

.docs-sync-banner__desc {
  margin: 0;
  font-size: 12px;
  color: rgba(71, 85, 105, 0.9);
}

.docs-sync-banner[data-status='in_progress'] {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
}

.docs-sync-banner[data-status='in_progress'] .docs-sync-banner__icon {
  color: rgba(180, 83, 9, 0.92);
}

.docs-sync-banner[data-status='migrated'] {
  border-color: rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.12);
}

.docs-sync-banner[data-status='migrated'] .docs-sync-banner__icon {
  color: rgba(217, 119, 6, 0.92);
}

::global(.dark .docs-sync-banner),
::global([data-theme='dark'] .docs-sync-banner) {
  border-color: rgba(71, 85, 105, 0.55);
  background: rgba(15, 23, 42, 0.5);
}

::global(.dark .docs-sync-banner__title),
::global([data-theme='dark'] .docs-sync-banner__title) {
  color: rgba(248, 250, 252, 0.95);
}

::global(.dark .docs-sync-banner__desc),
::global([data-theme='dark'] .docs-sync-banner__desc) {
  color: rgba(226, 232, 240, 0.78);
}

::global(.dark .docs-sync-banner[data-status='in_progress']),
::global([data-theme='dark'] .docs-sync-banner[data-status='in_progress']) {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(120, 53, 15, 0.3);
}

::global(.dark .docs-sync-banner[data-status='migrated']),
::global([data-theme='dark'] .docs-sync-banner[data-status='migrated']) {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(120, 53, 15, 0.24);
}
.docs-hero-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  color: rgba(100, 116, 139, 0.7);
}

.docs-hero-crumb {
  color: var(--docs-muted);
  text-decoration: none;
  transition: color 0.2s ease;
}

a.docs-hero-crumb:hover {
  color: var(--docs-ink);
}

.docs-hero-crumb.is-current {
  color: var(--docs-ink);
}

.docs-hero-crumb-sep {
  color: var(--docs-muted);
  opacity: 0.6;
}

::global(.dark .docs-hero-breadcrumb),
::global([data-theme='dark'] .docs-hero-breadcrumb) {
  color: rgba(226, 232, 240, 0.5);
}

::global(.dark .docs-hero-crumb),
::global([data-theme='dark'] .docs-hero-crumb) {
  color: rgba(226, 232, 240, 0.6);
}

::global(.dark .docs-hero-crumb.is-current),
::global([data-theme='dark'] .docs-hero-crumb.is-current) {
  color: rgba(248, 250, 252, 0.95);
}

::global(.dark a.docs-hero-crumb:hover),
::global([data-theme='dark'] a.docs-hero-crumb:hover) {
  color: rgba(248, 250, 252, 0.95);
}

:deep(.docs-prose--hero > h1:first-of-type) {
  display: none;
}





:deep(.docs-prose) {
  --docs-accent: #6a5546;
  --docs-accent-strong: #2f241c;
  --docs-ink: var(--fgColor-default);
  --docs-muted: var(--fgColor-muted);
  --docs-border: var(--borderColor-muted);
  --docs-code-bg: var(--bgColor-muted);
  --docs-code-border: var(--borderColor-default);
  --docs-inline-code-bg: var(--bgColor-neutral-muted);
  --docs-inline-code-border: var(--borderColor-muted);
  --docs-hr-color: rgba(15, 23, 42, 0.18);
  --tw-prose-body: var(--docs-ink);
  --tw-prose-headings: var(--docs-ink);
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
  --docs-accent: #d8b899;
  --docs-accent-strong: #ffe5c8;
  --docs-ink: #f3ede5;
  --docs-muted: rgba(235, 224, 213, 0.85);
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
  color: var(--docs-ink);
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
  color: var(--docs-ink);
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

:deep(.docs-prose .docs-mermaid) {
  margin: 1.2rem 0;
  padding: 1rem;
  border-radius: 8px;
  background: var(--docs-code-bg);
  border: 1px solid var(--docs-code-border);
  overflow-x: auto;
  white-space: pre;
}

:deep(.docs-prose .docs-mermaid svg) {
  max-width: 100%;
  height: auto;
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
  border-bottom: 1px solid color-mix(in srgb, var(--docs-accent) 40%, transparent);
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

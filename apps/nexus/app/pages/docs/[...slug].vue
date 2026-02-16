<script setup lang="ts">
import { TxButton, TxFlipOverlay, TxLoadingState, TxTooltip } from '@talex-touch/tuffex'
import { defineComponent, h, render } from 'vue'
import { toast, Toaster } from 'vue-sonner'
import DocHero from '~/components/docs/DocHero.vue'
import DocsFeedback from '~/components/docs/DocsFeedback.vue'
import type {
  DocAnalyticsEvidenceSummary,
  DocAnalyticsResponse,
} from '~/types/docs-engagement'

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
const { deviceId } = useDeviceIdentity()

const { user } = useAuthUser()
const isAdmin = computed(() => user.value?.role === 'admin')

const SUPPORTED_LOCALES = ['en', 'zh']
const CJK_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g
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

function stripCjk(value: string) {
  return value.replace(CJK_PATTERN, '').replace(/\s{2,}/g, ' ').trim()
}

function fallbackTitleFromPath(path?: string) {
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

function normalizeTitleForLocale(value: string, path?: string) {
  if (locale.value !== 'en')
    return value
  const stripped = stripCjk(value)
  if (stripped)
    return stripped
  return fallbackTitleFromPath(path)
}

function normalizeDescriptionForLocale(value?: string | null) {
  if (!value)
    return ''
  if (locale.value !== 'en')
    return value
  return stripCjk(value)
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

interface DocSectionInsight {
  sectionId: string
  sectionTitle: string
  viewCount: number
  readPercent: number
  jumpCount: number
  copyCount: number
  selectCount: number
  avgStayMs: number
}

interface DocOverlayRect {
  key: string
  type: 'copy' | 'select'
  left: number
  top: number
  width: number
  height: number
  opacity: number
  tooltip: string
}

interface DocSectionBadge {
  key: string
  label: string
  left: number
  top: number
  tooltip: string
}

interface DocSectionBlock {
  key: string
  label: string
  left: number
  top: number
  width: number
  height: number
  opacity: number
  tooltip: string
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

const ASSISTANT_CONTEXT_LIMIT = 8000

function buildAssistantContext(value: any): string {
  const text = extractDocText(value).replace(/\s+/g, ' ').trim()
  if (!text)
    return ''
  return text.length > ASSISTANT_CONTEXT_LIMIT ? text.slice(0, ASSISTANT_CONTEXT_LIMIT) : text
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

const docDisplayTitle = computed(() =>
  normalizeTitleForLocale(
    doc.value?.title ? String(doc.value.title) : '',
    doc.value?.path ?? docPath.value,
  ),
)

const docDisplayDescription = computed(() =>
  normalizeDescriptionForLocale(doc.value?.description ? String(doc.value.description) : ''),
)

const heroBreadcrumbs = computed(() => {
  const isComponentDoc = docScope.value.isComponent
  const prefixLabel = isComponentDoc
    ? (locale.value === 'zh' ? '组件' : 'Components')
    : (locale.value === 'zh' ? '文档' : 'Docs')
  const prefixPath = isComponentDoc ? '/docs/dev/components' : '/docs'
  const category = docMeta.value.category ? String(docMeta.value.category) : ''
  const categoryLabel = category ? normalizeTitleForLocale(category) : ''
  const label = docDisplayTitle.value || categoryLabel
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
  const fallback = fallbackTitleFromPath(path)
  const raw = title || fallback
  return normalizeTitleForLocale(raw, path)
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
    const rawTitle = doc.value.seo?.title ?? doc.value.title ?? ''
    docTitleState.value = normalizeTitleForLocale(String(rawTitle), doc.value.path ?? docPath.value)
    docLocaleState.value = resolveDocLocale(doc.value)
    docMetaState.value = {
      ...docMeta.value,
      assistantTitle: docTitleState.value,
      assistantContext: buildAssistantContext(doc.value.body),
    }
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
  docsAnalyticsOptionsReady.value = false
  docsAnalyticsConfigOpen.value = false
  docsOverlayResizeObserver?.disconnect()
  docsOverlayResizeObserver = null
  if (import.meta.client)
    window.removeEventListener('resize', scheduleDocsAnalyticsOverlay)
  if (docsOverlayFrameRaf)
    cancelAnimationFrame(docsOverlayFrameRaf)
  clearDocsAnalyticsVisuals()
})

// View tracking (admin only display)
const viewCount = ref<number | null>(null)

const docsTracker = useDocEngagementTracker({
  source: 'docs_page',
  path: () => docPath.value,
  title: () => docDisplayTitle.value || (doc.value?.title ? String(doc.value.title) : ''),
  clientId: () => deviceId.value || '',
  enabled: () => viewState.value === 'content' && Boolean(docPath.value),
  contentSelector: '.docs-prose',
  trackSections: true,
  captureSelection: true,
  onViewTracked: (views) => {
    viewCount.value = views
  },
})

function normalizeAnalyticsPath(path: string | null | undefined) {
  if (!path)
    return ''
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}

function formatCompactDuration(ms: number) {
  if (!ms)
    return locale.value === 'zh' ? '0 秒' : '0s'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60)
    return locale.value === 'zh' ? `${totalSeconds} 秒` : `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return locale.value === 'zh'
    ? `${minutes} 分 ${seconds} 秒`
    : `${minutes}m ${seconds}s`
}

function formatPercent(value: number) {
  const clamped = Math.max(0, Math.min(100, value))
  if (clamped === 0 || clamped >= 10)
    return `${clamped.toFixed(0)}%`
  return `${clamped.toFixed(1)}%`
}

const docsAnalyticsVisible = ref(false)
const docsAnalyticsLoading = ref(false)
const docsAnalyticsError = ref<string | null>(null)
const docsAnalyticsResult = ref<DocAnalyticsResponse | null>(null)
const docsAnalyticsUpdatedAt = ref<number | null>(null)
const docsAnalyticsRects = ref<DocOverlayRect[]>([])
const docsAnalyticsBadges = ref<DocSectionBadge[]>([])
const docsAnalyticsSectionBlocks = ref<DocSectionBlock[]>([])
const docsAnalyticsFrame = ref({
  ready: false,
  top: 0,
  left: 0,
  width: 0,
  height: 0,
})
const docsAnalyticsConfigOpen = ref(false)
const docsAnalyticsAdvancedOpen = ref(false)
const docsAnalyticsConfigTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const docsAnalyticsConfigTriggerEl = computed(() => docsAnalyticsConfigTriggerRef.value?.$el || null)

const DOCS_ANALYTICS_DEFAULTS = Object.freeze({
  days: 30,
  hotSectionLimit: 6,
  evidenceLimit: 160,
  showSectionBlocks: true,
  showBadges: true,
  showCopy: true,
  showSelect: true,
})
const DOCS_ANALYTICS_STORAGE_KEY = 'nexus.docs.analytics.overlay.v1'

const docsAnalyticsOptions = reactive({
  days: DOCS_ANALYTICS_DEFAULTS.days,
  hotSectionLimit: DOCS_ANALYTICS_DEFAULTS.hotSectionLimit,
  evidenceLimit: DOCS_ANALYTICS_DEFAULTS.evidenceLimit,
  showSectionBlocks: DOCS_ANALYTICS_DEFAULTS.showSectionBlocks,
  showBadges: DOCS_ANALYTICS_DEFAULTS.showBadges,
  showCopy: DOCS_ANALYTICS_DEFAULTS.showCopy,
  showSelect: DOCS_ANALYTICS_DEFAULTS.showSelect,
})
const docsAnalyticsOptionsReady = ref(false)

const docAnalyticsPath = computed(() => {
  const normalized = normalizeContentPath(doc.value?.path ?? docPath.value) ?? docPath.value
  return normalizeAnalyticsPath(normalized)
})

const adminAnalyticsHref = computed(() => {
  const params = new URLSearchParams()
  params.set('section', 'docs')
  params.set('source', 'docs_page')
  if (docAnalyticsPath.value)
    params.set('path', docAnalyticsPath.value)
  return `/dashboard/admin/analytics?${params.toString()}`
})

const docsAnalyticsDetail = computed(() => docsAnalyticsResult.value?.detail ?? null)
const docsAnalyticsSummary = computed(() => {
  const rows = docsAnalyticsResult.value?.docs ?? []
  const target = docAnalyticsPath.value
  const matched = rows.find(item => normalizeAnalyticsPath(item.path) === target)
  return matched ?? rows[0] ?? null
})

const docsSectionInsightMap = computed(() => {
  const detail = docsAnalyticsDetail.value
  const summary = docsAnalyticsSummary.value
  if (!detail)
    return new Map<string, DocSectionInsight>()

  const readerBase = Math.max(summary?.sessionCount || summary?.views || 0, 1)
  const jumpBySection = new Map<string, number>()
  const copyBySection = new Map<string, number>()
  const selectBySection = new Map<string, number>()

  for (const item of detail.evidence) {
    const sectionId = normalizeAnalyticsPath(item.sectionId || 'root') || 'root'
    if (item.actionType === 'jump')
      jumpBySection.set(sectionId, (jumpBySection.get(sectionId) || 0) + item.count)
    if (item.actionType === 'copy')
      copyBySection.set(sectionId, (copyBySection.get(sectionId) || 0) + item.count)
    if (item.actionType === 'select')
      selectBySection.set(sectionId, (selectBySection.get(sectionId) || 0) + item.count)
  }

  const map = new Map<string, DocSectionInsight>()
  for (const section of detail.sections) {
    const sectionId = normalizeAnalyticsPath(section.sectionId || 'root') || 'root'
    const readPercent = Math.min(100, (section.viewCount / readerBase) * 100)
    map.set(sectionId, {
      sectionId,
      sectionTitle: section.sectionTitle || section.sectionId || 'Untitled',
      viewCount: section.viewCount,
      readPercent,
      jumpCount: jumpBySection.get(sectionId) || 0,
      copyCount: copyBySection.get(sectionId) || 0,
      selectCount: selectBySection.get(sectionId) || 0,
      avgStayMs: section.viewCount > 0 ? Math.round(section.activeMs / section.viewCount) : 0,
    })
  }

  return map
})

const docsAnalyticsOverviewLabel = computed(() => {
  const summary = docsAnalyticsSummary.value
  if (!summary)
    return locale.value === 'zh' ? '暂无聚合数据' : 'No analytics data yet'

  const readers = summary.sessionCount || summary.views
  const readText = locale.value === 'zh' ? `${readers} 阅读会话` : `${readers} reading sessions`
  const stayText = locale.value === 'zh'
    ? `人均停留 ${formatCompactDuration(summary.activeMs / Math.max(1, readers))}`
    : `avg stay ${formatCompactDuration(summary.activeMs / Math.max(1, readers))}`
  return `${readText} · ${stayText}`
})

const docsAnalyticsQuickTips = computed(() => {
  if (locale.value === 'zh') {
    return {
      toggle: docsAnalyticsVisible.value ? '关闭文档热区' : '开启文档热区',
      refresh: '刷新统计',
      settings: '展开配置',
      analytics: '打开后台 Analytics',
      close: '关闭配置',
      apply: '应用并刷新',
      reset: '恢复默认',
      advanced: docsAnalyticsAdvancedOpen.value ? '收起高级配置' : '展开高级配置',
      sectionBlocks: '热门段落背景框选',
      badges: '段落标签',
      copy: '复制下划线高亮',
      select: '圈选背景高亮',
    }
  }

  return {
    toggle: docsAnalyticsVisible.value ? 'Hide docs overlays' : 'Show docs overlays',
    refresh: 'Refresh analytics',
    settings: 'Open settings',
    analytics: 'Open admin analytics',
    close: 'Close settings',
    apply: 'Apply and refresh',
    reset: 'Reset defaults',
    advanced: docsAnalyticsAdvancedOpen.value ? 'Collapse advanced settings' : 'Expand advanced settings',
    sectionBlocks: 'Section block highlight',
    badges: 'Section badges',
    copy: 'Copy underline highlight',
    select: 'Selection background highlight',
  }
})

function clampDocsAnalyticsOptions() {
  docsAnalyticsOptions.days = Math.max(7, Math.min(90, Math.round(docsAnalyticsOptions.days || DOCS_ANALYTICS_DEFAULTS.days)))
  docsAnalyticsOptions.hotSectionLimit = Math.max(1, Math.min(12, Math.round(docsAnalyticsOptions.hotSectionLimit || DOCS_ANALYTICS_DEFAULTS.hotSectionLimit)))
  docsAnalyticsOptions.evidenceLimit = Math.max(20, Math.min(360, Math.round(docsAnalyticsOptions.evidenceLimit || DOCS_ANALYTICS_DEFAULTS.evidenceLimit)))
}

function loadDocsAnalyticsOptions() {
  if (!import.meta.client)
    return
  try {
    const raw = window.localStorage.getItem(DOCS_ANALYTICS_STORAGE_KEY)
    if (!raw)
      return
    const parsed = JSON.parse(raw) as Partial<typeof docsAnalyticsOptions>
    if (typeof parsed.days === 'number')
      docsAnalyticsOptions.days = parsed.days
    if (typeof parsed.hotSectionLimit === 'number')
      docsAnalyticsOptions.hotSectionLimit = parsed.hotSectionLimit
    if (typeof parsed.evidenceLimit === 'number')
      docsAnalyticsOptions.evidenceLimit = parsed.evidenceLimit
    if (typeof parsed.showSectionBlocks === 'boolean')
      docsAnalyticsOptions.showSectionBlocks = parsed.showSectionBlocks
    if (typeof parsed.showBadges === 'boolean')
      docsAnalyticsOptions.showBadges = parsed.showBadges
    if (typeof parsed.showCopy === 'boolean')
      docsAnalyticsOptions.showCopy = parsed.showCopy
    if (typeof parsed.showSelect === 'boolean')
      docsAnalyticsOptions.showSelect = parsed.showSelect
  }
  catch {}
  clampDocsAnalyticsOptions()
}

function persistDocsAnalyticsOptions() {
  if (!import.meta.client || !docsAnalyticsOptionsReady.value)
    return
  try {
    window.localStorage.setItem(DOCS_ANALYTICS_STORAGE_KEY, JSON.stringify({
      days: docsAnalyticsOptions.days,
      hotSectionLimit: docsAnalyticsOptions.hotSectionLimit,
      evidenceLimit: docsAnalyticsOptions.evidenceLimit,
      showSectionBlocks: docsAnalyticsOptions.showSectionBlocks,
      showBadges: docsAnalyticsOptions.showBadges,
      showCopy: docsAnalyticsOptions.showCopy,
      showSelect: docsAnalyticsOptions.showSelect,
    }))
  }
  catch {}
}

function buildSectionBadgeTooltip(insight: DocSectionInsight) {
  if (locale.value === 'zh') {
    return [
      `${insight.sectionTitle}`,
      `阅读覆盖：${formatPercent(insight.readPercent)}（${insight.viewCount}）`,
      `链接跳转：${insight.jumpCount} 次`,
      `平均停留：${formatCompactDuration(insight.avgStayMs)}`,
      `复制：${insight.copyCount} 次`,
      `圈选：${insight.selectCount} 次`,
    ].join('\n')
  }

  return [
    insight.sectionTitle,
    `Read coverage: ${formatPercent(insight.readPercent)} (${insight.viewCount})`,
    `Direct jumps: ${insight.jumpCount}`,
    `Avg stay: ${formatCompactDuration(insight.avgStayMs)}`,
    `Copy: ${insight.copyCount}`,
    `Select: ${insight.selectCount}`,
  ].join('\n')
}

interface SectionTextSlice {
  node: Text
  start: number
  end: number
}

interface SectionDomContext {
  id: string
  heading: HTMLElement | null
  textNodes: SectionTextSlice[]
  textLength: number
}

function resolveSectionList(root: HTMLElement) {
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
    .filter(item => Boolean(item.id?.trim()))

  if (!headings.length) {
    return [{
      id: 'root',
      heading: null,
      range: (() => {
        const range = document.createRange()
        if (root.firstChild)
          range.setStartBefore(root.firstChild)
        else
          range.setStart(root, 0)
        if (root.lastChild)
          range.setEndAfter(root.lastChild)
        else
          range.setEnd(root, 0)
        return range
      })(),
    }]
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1] || null
    const range = document.createRange()
    range.setStartBefore(heading)
    if (nextHeading)
      range.setEndBefore(nextHeading)
    else if (root.lastChild)
      range.setEndAfter(root.lastChild)
    else
      range.setEnd(root, 0)
    return {
      id: normalizeAnalyticsPath(heading.id) || 'root',
      heading,
      range,
    }
  })
}

function buildSectionDomContext(root: HTMLElement) {
  const contexts = new Map<string, SectionDomContext>()
  const sections = resolveSectionList(root)

  for (const section of sections) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const textNodes: SectionTextSlice[] = []
    let cursor = 0
    let current = walker.nextNode() as Text | null
    while (current) {
      const text = current.textContent || ''
      if (text.length > 0 && section.range.intersectsNode(current)) {
        const start = cursor
        cursor += text.length
        textNodes.push({
          node: current,
          start,
          end: cursor,
        })
      }
      current = walker.nextNode() as Text | null
    }

    contexts.set(section.id, {
      id: section.id,
      heading: section.heading,
      textNodes,
      textLength: cursor,
    })
  }

  return contexts
}

function resolveNodeOffset(context: SectionDomContext, anchor: number) {
  if (!context.textNodes.length)
    return null
  const safeAnchor = Math.max(0, Math.min(Math.floor(anchor), Math.max(context.textLength - 1, 0)))
  for (const slice of context.textNodes) {
    if (safeAnchor < slice.end) {
      const localOffset = Math.max(0, Math.min(slice.node.textContent?.length || 0, safeAnchor - slice.start))
      return { node: slice.node, offset: localOffset }
    }
  }
  const last = context.textNodes[context.textNodes.length - 1]
  return {
    node: last.node,
    offset: Math.max(0, (last.node.textContent?.length || 1) - 1),
  }
}

function clearDocsAnalyticsVisuals() {
  docsAnalyticsRects.value = []
  docsAnalyticsBadges.value = []
  docsAnalyticsSectionBlocks.value = []
  docsAnalyticsFrame.value = {
    ready: false,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  }
}

function toHighlightRange(
  context: SectionDomContext,
  evidence: DocAnalyticsEvidenceSummary,
) {
  if (!context.textNodes.length || context.textLength <= 0)
    return null

  const hasAnchors = evidence.anchorStart >= 0 && evidence.anchorEnd >= 0 && evidence.anchorEnd >= evidence.anchorStart
  const fallbackLength = Math.max(1, Math.min(context.textLength, evidence.textLength || 36))
  let start = hasAnchors ? evidence.anchorStart : 0
  let end = hasAnchors ? evidence.anchorEnd : start + fallbackLength

  if (!hasAnchors && evidence.anchorBucket >= 0) {
    const ratioStart = Math.min(0.95, Math.max(0, evidence.anchorBucket / 20))
    start = Math.floor(context.textLength * ratioStart)
    end = Math.min(context.textLength, start + fallbackLength)
  }

  start = Math.max(0, Math.min(start, Math.max(context.textLength - 1, 0)))
  end = Math.max(start + 1, Math.min(end, context.textLength))

  const startPoint = resolveNodeOffset(context, start)
  const endPoint = resolveNodeOffset(context, end - 1)
  if (!startPoint || !endPoint)
    return null

  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, Math.min((endPoint.node.textContent?.length || 1), endPoint.offset + 1))
  return range
}

let docsOverlayFrameRaf: number | null = null
let docsOverlayResizeObserver: ResizeObserver | null = null

function renderDocsAnalyticsOverlay() {
  if (!import.meta.client)
    return

  if (!isAdmin.value || !docsAnalyticsVisible.value || !docsAnalyticsDetail.value || viewState.value !== 'content') {
    clearDocsAnalyticsVisuals()
    return
  }

  const surface = document.querySelector<HTMLElement>('.docs-surface')
  const root = document.querySelector<HTMLElement>('.docs-prose')
  if (!surface || !root) {
    clearDocsAnalyticsVisuals()
    return
  }

  const surfaceRect = surface.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  docsAnalyticsFrame.value = {
    ready: true,
    top: rootRect.top - surfaceRect.top,
    left: rootRect.left - surfaceRect.left,
    width: rootRect.width,
    height: rootRect.height,
  }

  const sectionContexts = buildSectionDomContext(root)
  const insightMap = docsSectionInsightMap.value
  const rankedSections = [...(docsAnalyticsDetail.value.sections || [])]
    .sort((a, b) => b.viewCount - a.viewCount)
  const rankLookup = new Map<string, number>()
  rankedSections.forEach((item, index) => {
    const key = normalizeAnalyticsPath(item.sectionId || 'root') || 'root'
    rankLookup.set(key, index + 1)
  })

  const badges: DocSectionBadge[] = []
  const headingNodes = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
  if (docsAnalyticsOptions.showBadges) {
    for (const heading of headingNodes) {
      const sectionId = normalizeAnalyticsPath(heading.id || 'root') || 'root'
      const insight = insightMap.get(sectionId)
      if (!insight)
        continue
      const headingRect = heading.getBoundingClientRect()
      const rank = rankLookup.get(sectionId) || 0
      const label = rank > 0 && rank <= 3
        ? `${locale.value === 'zh' ? '热门' : 'Top'} ${rank}`
        : `${formatPercent(insight.readPercent)}`
      badges.push({
        key: `badge:${sectionId}`,
        label,
        left: Math.max(0, headingRect.left - rootRect.left - 86),
        top: Math.max(0, headingRect.top - rootRect.top + 4),
        tooltip: buildSectionBadgeTooltip(insight),
      })
    }
  }

  const sectionNodes = headingNodes.map((heading, index) => ({
    id: normalizeAnalyticsPath(heading.id || 'root') || 'root',
    heading,
    nextHeading: headingNodes[index + 1] || null,
  }))
  const sectionNodeMap = new Map(sectionNodes.map(item => [item.id, item]))
  const hotSections = rankedSections
    .filter(item => (item.viewCount || 0) > 0)
    .slice(0, Math.max(1, Math.min(12, Math.round(docsAnalyticsOptions.hotSectionLimit))))
  const sectionBlocks: DocSectionBlock[] = []
  if (docsAnalyticsOptions.showSectionBlocks) {
    for (const section of hotSections) {
      const sectionId = normalizeAnalyticsPath(section.sectionId || 'root') || 'root'
      if (sectionId === 'root')
        continue
      const node = sectionNodeMap.get(sectionId)
      if (!node)
        continue
      const insight = insightMap.get(sectionId)
      if (!insight)
        continue
      const headingRect = node.heading.getBoundingClientRect()
      const nextRectTop = node.nextHeading
        ? node.nextHeading.getBoundingClientRect().top - rootRect.top
        : rootRect.height
      const top = Math.max(0, headingRect.top - rootRect.top + headingRect.height * 0.2)
      const bottom = Math.max(top + 24, nextRectTop - 10)
      const rank = rankLookup.get(sectionId) || 0
      const intensity = Math.max(0.22, Math.min(0.65, insight.readPercent / 100 + (4 - Math.min(rank, 3)) * 0.1))
      const label = `${locale.value === 'zh' ? '热门段落' : 'Hot section'} ${rank || '-'} · ${formatPercent(insight.readPercent)}`
      sectionBlocks.push({
        key: `section:${sectionId}`,
        label,
        left: 0,
        top,
        width: rootRect.width,
        height: bottom - top,
        opacity: intensity,
        tooltip: buildSectionBadgeTooltip(insight),
      })
    }
  }

  const evidence = docsAnalyticsDetail.value.evidence
    .filter((item) => {
      if (item.actionType === 'copy')
        return docsAnalyticsOptions.showCopy
      if (item.actionType === 'select')
        return docsAnalyticsOptions.showSelect
      return false
    })
    .slice(0, Math.max(20, Math.min(360, Math.round(docsAnalyticsOptions.evidenceLimit))))
  const maxCopyCount = Math.max(1, ...evidence.filter(item => item.actionType === 'copy').map(item => item.count))
  const maxSelectCount = Math.max(1, ...evidence.filter(item => item.actionType === 'select').map(item => item.count))

  const rects: DocOverlayRect[] = []
  let rectIndex = 0
  for (const item of evidence) {
    const sectionId = normalizeAnalyticsPath(item.sectionId || 'root') || 'root'
    const context = sectionContexts.get(sectionId) || sectionContexts.get('root')
    if (!context)
      continue
    const range = toHighlightRange(context, item)
    if (!range)
      continue
    const rectList = Array.from(range.getClientRects())
    if (!rectList.length)
      continue
    for (const rect of rectList) {
      if (rect.width < 3 || rect.height < 2)
        continue
      const isCopy = item.actionType === 'copy'
      const baseTop = rect.top - rootRect.top
      const baseHeight = rect.height
      const opacityBase = isCopy
        ? item.count / maxCopyCount
        : item.count / maxSelectCount
      const tooltip = locale.value === 'zh'
        ? [
            `${isCopy ? '复制热点' : '圈选热点'} · ${item.sectionTitle || item.sectionId || 'root'}`,
            `次数：${item.count}`,
            `位置桶：${item.anchorBucket >= 0 ? item.anchorBucket : 'n/a'}`,
            item.textHash ? `Hash：${item.textHash.slice(0, 20)}` : 'Hash：n/a',
          ].join('\n')
        : [
            `${isCopy ? 'Copy hotspot' : 'Selection hotspot'} · ${item.sectionTitle || item.sectionId || 'root'}`,
            `Count: ${item.count}`,
            `Bucket: ${item.anchorBucket >= 0 ? item.anchorBucket : 'n/a'}`,
            item.textHash ? `Hash: ${item.textHash.slice(0, 20)}` : 'Hash: n/a',
          ].join('\n')

      rects.push({
        key: `${item.actionType}:${item.sectionId}:${item.textHash || 'none'}:${item.anchorBucket}:${rectIndex}`,
        type: isCopy ? 'copy' : 'select',
        left: rect.left - rootRect.left,
        top: isCopy ? baseTop + Math.max(0, baseHeight - 2) : baseTop,
        width: rect.width,
        height: isCopy ? 2 : baseHeight,
        opacity: isCopy ? Math.min(0.95, 0.35 + opacityBase * 0.6) : Math.min(0.5, 0.12 + opacityBase * 0.35),
        tooltip,
      })
      rectIndex += 1
      if (rectIndex >= 360)
        break
    }
    if (rectIndex >= 360)
      break
  }

  docsAnalyticsBadges.value = badges
  docsAnalyticsSectionBlocks.value = sectionBlocks
  docsAnalyticsRects.value = rects
}

function scheduleDocsAnalyticsOverlay() {
  if (!import.meta.client)
    return
  if (docsOverlayFrameRaf)
    cancelAnimationFrame(docsOverlayFrameRaf)
  docsOverlayFrameRaf = requestAnimationFrame(() => {
    docsOverlayFrameRaf = null
    renderDocsAnalyticsOverlay()
  })
}

function bindDocsAnalyticsResizeObserver() {
  if (!import.meta.client || typeof ResizeObserver === 'undefined')
    return
  docsOverlayResizeObserver?.disconnect()
  docsOverlayResizeObserver = null
  const root = document.querySelector<HTMLElement>('.docs-prose')
  if (!root)
    return
  docsOverlayResizeObserver = new ResizeObserver(() => {
    if (!docsAnalyticsVisible.value)
      return
    scheduleDocsAnalyticsOverlay()
  })
  docsOverlayResizeObserver.observe(root)
}

async function loadDocsAnalyticsOverlay(force = false) {
  if (!isAdmin.value || !docAnalyticsPath.value || docsAnalyticsLoading.value)
    return
  if (!force && docsAnalyticsResult.value && docsAnalyticsVisible.value) {
    scheduleDocsAnalyticsOverlay()
    return
  }

  docsAnalyticsLoading.value = true
  docsAnalyticsError.value = null
  try {
    const response = await $fetch<DocAnalyticsResponse>('/api/admin/analytics/docs', {
      query: {
        days: Math.max(7, Math.min(90, Math.round(docsAnalyticsOptions.days))),
        path: docAnalyticsPath.value,
        source: 'docs_page',
      },
    })
    docsAnalyticsResult.value = response
    docsAnalyticsVisible.value = true
    docsAnalyticsUpdatedAt.value = Date.now()
    await nextTick()
    scheduleDocsAnalyticsOverlay()
  }
  catch (error: any) {
    docsAnalyticsError.value = error?.data?.statusMessage || error?.message || 'Failed to load docs analytics'
    docsAnalyticsVisible.value = false
    clearDocsAnalyticsVisuals()
  }
  finally {
    docsAnalyticsLoading.value = false
  }
}

async function toggleDocsAnalyticsOverlay() {
  if (docsAnalyticsVisible.value) {
    docsAnalyticsVisible.value = false
    clearDocsAnalyticsVisuals()
    return
  }
  await loadDocsAnalyticsOverlay()
}

function resetDocsAnalyticsConfig() {
  docsAnalyticsOptions.days = DOCS_ANALYTICS_DEFAULTS.days
  docsAnalyticsOptions.hotSectionLimit = DOCS_ANALYTICS_DEFAULTS.hotSectionLimit
  docsAnalyticsOptions.evidenceLimit = DOCS_ANALYTICS_DEFAULTS.evidenceLimit
  docsAnalyticsOptions.showSectionBlocks = DOCS_ANALYTICS_DEFAULTS.showSectionBlocks
  docsAnalyticsOptions.showBadges = DOCS_ANALYTICS_DEFAULTS.showBadges
  docsAnalyticsOptions.showCopy = DOCS_ANALYTICS_DEFAULTS.showCopy
  docsAnalyticsOptions.showSelect = DOCS_ANALYTICS_DEFAULTS.showSelect
  docsAnalyticsAdvancedOpen.value = false
  if (docsAnalyticsVisible.value)
    scheduleDocsAnalyticsOverlay()
}

async function applyDocsAnalyticsConfig() {
  await loadDocsAnalyticsOverlay(true)
}

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
        void docsTracker.recordAction({
          type: 'copy',
          source: 'code_block',
          sectionId: 'root',
          sectionTitle: 'Code Block',
          text: props.codeText,
        })
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

// Enhance code blocks on mount
onMounted(() => {
  loadDocsAnalyticsOptions()
  docsAnalyticsOptionsReady.value = true
  clampDocsAnalyticsOptions()
  scheduleCodeEnhance()
  bindDocsAnalyticsResizeObserver()
  window.addEventListener('resize', scheduleDocsAnalyticsOverlay, { passive: true })
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
    if (status.value === 'success' && doc.value) {
      scheduleCodeEnhance()
      bindDocsAnalyticsResizeObserver()
      nextTick(() => {
        docsTracker.refreshSections()
      })
    }
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
    if (value === 'content') {
      bindDocsAnalyticsResizeObserver()
      nextTick(() => docsTracker.refreshSections())
    }
  },
)

watch(
  () => docAnalyticsPath.value,
  () => {
    docsAnalyticsConfigOpen.value = false
    docsAnalyticsAdvancedOpen.value = false
    docsAnalyticsVisible.value = false
    docsAnalyticsError.value = null
    docsAnalyticsResult.value = null
    docsAnalyticsUpdatedAt.value = null
    clearDocsAnalyticsVisuals()
  },
)

watch(
  () => [docsAnalyticsVisible.value, docsAnalyticsDetail.value, viewState.value, locale.value],
  () => {
    if (!docsAnalyticsVisible.value || viewState.value !== 'content') {
      clearDocsAnalyticsVisuals()
      return
    }
    nextTick(() => scheduleDocsAnalyticsOverlay())
  },
)

watch(
  () => [
    docsAnalyticsOptions.hotSectionLimit,
    docsAnalyticsOptions.evidenceLimit,
    docsAnalyticsOptions.showSectionBlocks,
    docsAnalyticsOptions.showBadges,
    docsAnalyticsOptions.showCopy,
    docsAnalyticsOptions.showSelect,
  ],
  () => {
    if (!docsAnalyticsVisible.value)
      return
    scheduleDocsAnalyticsOverlay()
  },
)

watch(
  () => ({
    days: docsAnalyticsOptions.days,
    hotSectionLimit: docsAnalyticsOptions.hotSectionLimit,
    evidenceLimit: docsAnalyticsOptions.evidenceLimit,
    showSectionBlocks: docsAnalyticsOptions.showSectionBlocks,
    showBadges: docsAnalyticsOptions.showBadges,
    showCopy: docsAnalyticsOptions.showCopy,
    showSelect: docsAnalyticsOptions.showSelect,
  }),
  () => {
    clampDocsAnalyticsOptions()
    persistDocsAnalyticsOptions()
  },
  { deep: true },
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
              :title="docDisplayTitle"
              :description="docDisplayDescription"
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
          <ClientOnly>
            <Teleport to="#docs-outline-tools">
              <div v-if="isAdmin && viewState === 'content'" class="docs-analytics-toolbar docs-analytics-toolbar--outline">
                <div class="docs-analytics-toolbar__main docs-analytics-toolbar__main--icons">
                  <TxTooltip :content="docsAnalyticsQuickTips.toggle" :anchor="{ placement: 'bottom', showArrow: true }">
                    <TxButton
                      size="small"
                      circle
                      variant="bare"
                      native-type="button"
                      class="docs-analytics-icon-btn"
                      :class="{ 'is-active': docsAnalyticsVisible }"
                      :loading="docsAnalyticsLoading"
                      @click="toggleDocsAnalyticsOverlay"
                    >
                      <span :class="docsAnalyticsVisible ? 'i-carbon-view-off' : 'i-carbon-view'" />
                    </TxButton>
                  </TxTooltip>
                  <TxTooltip :content="docsAnalyticsQuickTips.settings" :anchor="{ placement: 'bottom', showArrow: true }">
                    <TxButton
                      ref="docsAnalyticsConfigTriggerRef"
                      size="small"
                      circle
                      variant="bare"
                      native-type="button"
                      class="docs-analytics-icon-btn"
                      :class="{ 'is-active': docsAnalyticsConfigOpen }"
                      @click="docsAnalyticsConfigOpen = !docsAnalyticsConfigOpen"
                    >
                      <span class="i-carbon-settings-adjust" />
                    </TxButton>
                  </TxTooltip>
                </div>
                <p class="docs-analytics-toolbar__meta docs-analytics-toolbar__meta--compact">
                  {{ docsAnalyticsOverviewLabel }}
                  <span v-if="docsAnalyticsUpdatedAt"> · {{ locale === 'zh' ? '更' : 'Up' }} {{ new Date(docsAnalyticsUpdatedAt).toLocaleTimeString() }}</span>
                </p>
                <p v-if="docsAnalyticsError" class="docs-analytics-toolbar__error">
                  {{ docsAnalyticsError }}
                </p>
              </div>
            </Teleport>
            <Teleport to="body">
              <TxFlipOverlay
                v-model="docsAnalyticsConfigOpen"
                :source="docsAnalyticsConfigTriggerEl"
                :duration="360"
                :rotate-x="8"
                :rotate-y="6"
                transition-name="docs-analytics-config-mask"
                mask-class="docs-analytics-config-mask"
                card-class="docs-analytics-config-card"
              >
                <template #default>
                  <section class="docs-analytics-config">
                    <header class="docs-analytics-config__header">
                      <div class="docs-analytics-config__title-wrap">
                        <span class="i-carbon-chart-line-data docs-analytics-config__title-icon" />
                        <h3 class="docs-analytics-config__title">
                          {{ locale === 'zh' ? '文档热区配置' : 'Docs Overlay Settings' }}
                        </h3>
                      </div>
                      <div class="docs-analytics-config__header-actions">
                        <TxTooltip :content="docsAnalyticsQuickTips.refresh" :anchor="{ placement: 'bottom', showArrow: true }">
                          <TxButton
                            circle
                            size="small"
                            variant="bare"
                            native-type="button"
                            class="docs-analytics-icon-btn"
                            :loading="docsAnalyticsLoading"
                            @click="loadDocsAnalyticsOverlay(true)"
                          >
                            <span class="i-carbon-renew" />
                          </TxButton>
                        </TxTooltip>
                        <TxTooltip :content="docsAnalyticsQuickTips.analytics" :anchor="{ placement: 'bottom', showArrow: true }">
                          <NuxtLink
                            :to="adminAnalyticsHref"
                            class="docs-analytics-icon-link"
                          >
                            <span class="i-carbon-launch" />
                          </NuxtLink>
                        </TxTooltip>
                        <TxTooltip :content="docsAnalyticsQuickTips.close" :anchor="{ placement: 'left', showArrow: true }">
                          <TxButton
                            circle
                            size="small"
                            variant="bare"
                            native-type="button"
                            class="docs-analytics-icon-btn"
                            @click="docsAnalyticsConfigOpen = false"
                          >
                            <span class="i-carbon-close" />
                          </TxButton>
                        </TxTooltip>
                      </div>
                    </header>

                    <div class="docs-analytics-config__group">
                      <label class="docs-analytics-config__label">
                        {{ locale === 'zh' ? '统计窗口（天）' : 'Window (days)' }}
                      </label>
                      <input
                        v-model.number="docsAnalyticsOptions.days"
                        class="docs-analytics-config__input"
                        type="number"
                        min="7"
                        max="90"
                        step="1"
                      >
                    </div>

                    <div class="docs-analytics-config__group">
                      <label class="docs-analytics-config__label">
                        {{ locale === 'zh' ? '热门段落数量' : 'Hot sections' }}
                      </label>
                      <input
                        v-model.number="docsAnalyticsOptions.hotSectionLimit"
                        class="docs-analytics-config__input"
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                      >
                    </div>

                    <TxButton
                      variant="ghost"
                      size="small"
                      native-type="button"
                      class="docs-analytics-config__advanced-toggle"
                      @click="docsAnalyticsAdvancedOpen = !docsAnalyticsAdvancedOpen"
                    >
                      <span :class="docsAnalyticsAdvancedOpen ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'" />
                      {{ docsAnalyticsQuickTips.advanced }}
                    </TxButton>

                    <Transition name="docs-analytics-fold">
                      <div v-if="docsAnalyticsAdvancedOpen" class="docs-analytics-config__advanced">
                        <div class="docs-analytics-config__group">
                          <label class="docs-analytics-config__label">
                            {{ locale === 'zh' ? '细粒度热点上限' : 'Fine-grain hotspot limit' }}
                          </label>
                          <input
                            v-model.number="docsAnalyticsOptions.evidenceLimit"
                            class="docs-analytics-config__input"
                            type="number"
                            min="20"
                            max="360"
                            step="10"
                          >
                        </div>
                        <label class="docs-analytics-config__switch">
                          <input v-model="docsAnalyticsOptions.showSectionBlocks" type="checkbox">
                          <span>{{ docsAnalyticsQuickTips.sectionBlocks }}</span>
                        </label>
                        <label class="docs-analytics-config__switch">
                          <input v-model="docsAnalyticsOptions.showBadges" type="checkbox">
                          <span>{{ docsAnalyticsQuickTips.badges }}</span>
                        </label>
                        <label class="docs-analytics-config__switch">
                          <input v-model="docsAnalyticsOptions.showCopy" type="checkbox">
                          <span>{{ docsAnalyticsQuickTips.copy }}</span>
                        </label>
                        <label class="docs-analytics-config__switch">
                          <input v-model="docsAnalyticsOptions.showSelect" type="checkbox">
                          <span>{{ docsAnalyticsQuickTips.select }}</span>
                        </label>
                      </div>
                    </Transition>

                    <footer class="docs-analytics-config__actions">
                      <TxButton variant="ghost" size="small" native-type="button" @click="resetDocsAnalyticsConfig">
                        {{ docsAnalyticsQuickTips.reset }}
                      </TxButton>
                      <TxButton variant="primary" size="small" native-type="button" :loading="docsAnalyticsLoading" @click="applyDocsAnalyticsConfig">
                        {{ docsAnalyticsQuickTips.apply }}
                      </TxButton>
                    </footer>
                  </section>
                </template>
              </TxFlipOverlay>
            </Teleport>
          </ClientOnly>
          <div
            v-if="isAdmin && docsAnalyticsVisible && docsAnalyticsFrame.ready"
            class="docs-analytics-overlay"
            :style="{
              top: `${docsAnalyticsFrame.top}px`,
              left: `${docsAnalyticsFrame.left}px`,
              width: `${docsAnalyticsFrame.width}px`,
              height: `${docsAnalyticsFrame.height}px`,
            }"
          >
            <div
              v-for="section in docsAnalyticsSectionBlocks"
              :key="section.key"
              class="docs-analytics-overlay__section"
              :title="section.tooltip"
              :style="{
                top: `${section.top}px`,
                left: `${section.left}px`,
                width: `${section.width}px`,
                height: `${section.height}px`,
                opacity: section.opacity.toFixed(2),
              }"
            >
              <span class="docs-analytics-overlay__section-label">{{ section.label }}</span>
            </div>
            <div
              v-for="badge in docsAnalyticsBadges"
              :key="badge.key"
              class="docs-analytics-overlay__badge"
              :title="badge.tooltip"
              :style="{
                top: `${badge.top}px`,
                left: `${badge.left}px`,
              }"
            >
              {{ badge.label }}
            </div>
            <div
              v-for="item in docsAnalyticsRects"
              :key="item.key"
              class="docs-analytics-overlay__rect"
              :class="`is-${item.type}`"
              :title="item.tooltip"
              :style="{
                top: `${item.top}px`,
                left: `${item.left}px`,
                width: `${item.width}px`,
                height: `${item.height}px`,
                opacity: item.opacity.toFixed(2),
              }"
            />
          </div>
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

          <ClientOnly>
            <DocsComments :doc-path="docPath" />
          </ClientOnly>
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
  --docs-accent: var(--tx-color-primary);
  --docs-accent-strong: var(--tx-color-primary-dark-2);
  --docs-ink: var(--tx-text-color-primary);
  --docs-muted: var(--tx-text-color-secondary);
  --docs-border: var(--tx-border-color);
  --docs-code-bg: var(--tx-fill-color-light);
  --docs-code-border: var(--tx-border-color-light);
  --docs-inline-code-bg: var(--tx-fill-color-lighter);
  --docs-inline-code-border: var(--tx-border-color-lighter);
  --docs-hr-color: color-mix(in srgb, var(--tx-border-color) 70%, transparent);
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

.docs-analytics-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-radius: 14px;
  padding: 9px 10px;
  border: 1px dashed color-mix(in srgb, var(--tx-color-primary) 46%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
}

.docs-analytics-toolbar--outline {
  position: relative;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.docs-analytics-toolbar__main {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}

.docs-analytics-toolbar__main--icons {
  flex-wrap: nowrap;
}

.docs-analytics-config__header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.docs-analytics-icon-btn {
  --tx-button-bg-color-hover: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
  --tx-button-bg-color-active: color-mix(in srgb, var(--tx-color-primary) 18%, transparent);
  --tx-button-text-color: var(--tx-text-color-secondary);
  --tx-button-border-color: transparent;
  width: 30px;
  height: 30px;
}

.docs-analytics-icon-btn :global(span[class^='i-carbon']) {
  font-size: 14px;
}

.docs-analytics-icon-btn.is-active {
  --tx-button-text-color: color-mix(in srgb, var(--tx-color-primary) 85%, #1d4ed8);
  --tx-button-bg-color-hover: color-mix(in srgb, var(--tx-color-primary) 26%, transparent);
}

.docs-analytics-icon-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  color: var(--tx-text-color-secondary);
  text-decoration: none;
  transition: color 0.2s ease, background-color 0.2s ease;
}

.docs-analytics-icon-link:hover {
  color: color-mix(in srgb, var(--tx-color-primary) 85%, #1d4ed8);
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
}

.docs-analytics-icon-link :global(span[class^='i-carbon']) {
  font-size: 14px;
}

.docs-analytics-toolbar__meta {
  margin: 0;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  line-height: 1.45;
}

.docs-analytics-toolbar__meta--compact {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.docs-analytics-toolbar__error {
  margin: 0;
  font-size: 11px;
  color: color-mix(in srgb, var(--tx-color-danger) 85%, #b91c1c);
}

.docs-analytics-config {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  padding: 18px;
}

.docs-analytics-config__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.docs-analytics-config__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.docs-analytics-config__title-icon {
  font-size: 16px;
  color: color-mix(in srgb, var(--tx-color-primary) 80%, #2563eb);
}

.docs-analytics-config__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.docs-analytics-config__group {
  display: grid;
  gap: 6px;
}

.docs-analytics-config__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-secondary);
}

.docs-analytics-config__input {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 78%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
  color: var(--tx-text-color-primary);
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.docs-analytics-config__input:focus {
  border-color: color-mix(in srgb, var(--tx-color-primary) 60%, transparent);
}

.docs-analytics-config__advanced-toggle {
  justify-content: flex-start;
  gap: 6px;
  padding-left: 6px;
  color: var(--tx-text-color-secondary);
}

.docs-analytics-config__advanced {
  display: grid;
  gap: 8px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 76%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 52%, transparent);
  padding: 10px 12px;
}

.docs-analytics-config__switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.docs-analytics-config__switch input {
  width: 13px;
  height: 13px;
}

.docs-analytics-config__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}

.docs-analytics-fold-enter-active,
.docs-analytics-fold-leave-active {
  transition: max-height 220ms ease, opacity 220ms ease, transform 220ms ease;
  overflow: hidden;
}

.docs-analytics-fold-enter-from,
.docs-analytics-fold-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.docs-analytics-fold-enter-to,
.docs-analytics-fold-leave-from {
  max-height: 280px;
  opacity: 1;
  transform: translateY(0);
}

.docs-analytics-overlay {
  position: absolute;
  z-index: 6;
  pointer-events: none;
}

.docs-analytics-overlay__section {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 55%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-color-primary) 24%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary) 18%, transparent);
  pointer-events: auto;
  z-index: 1;
}

.docs-analytics-overlay__section-label {
  position: absolute;
  left: 10px;
  top: 8px;
  max-width: calc(100% - 18px);
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-primary) 84%, #0f172a);
  color: #fff;
  padding: 1px 8px;
  font-size: 10px;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docs-analytics-overlay__badge {
  position: absolute;
  max-width: 82px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-primary) 82%, #0f172a);
  color: #fff;
  font-size: 10px;
  line-height: 1.7;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  z-index: 3;
}

.docs-analytics-overlay__rect {
  position: absolute;
  border-radius: 3px;
  pointer-events: auto;
  z-index: 2;
}

.docs-analytics-overlay__rect.is-select {
  background: color-mix(in srgb, var(--tx-color-warning) 65%, transparent);
}

.docs-analytics-overlay__rect.is-copy {
  background: color-mix(in srgb, var(--tx-color-primary) 80%, transparent);
  border-radius: 2px;
}

.docs-sync-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  padding: 12px 14px;
}

.docs-sync-banner__icon {
  margin-top: 1px;
  font-size: 16px;
  color: var(--tx-text-color-secondary);
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
  color: var(--tx-text-color-primary);
}

.docs-sync-banner__desc {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.docs-sync-banner[data-status='in_progress'] {
  border-color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 16%, transparent);
}

.docs-sync-banner[data-status='in_progress'] .docs-sync-banner__icon {
  color: color-mix(in srgb, var(--tx-color-warning) 85%, var(--tx-text-color-primary));
}

.docs-sync-banner[data-status='migrated'] {
  border-color: color-mix(in srgb, var(--tx-color-warning) 35%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 10%, transparent);
}

.docs-sync-banner[data-status='migrated'] .docs-sync-banner__icon {
  color: color-mix(in srgb, var(--tx-color-warning) 70%, var(--tx-text-color-primary));
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
  color: var(--docs-muted);
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

:deep(.docs-prose--hero > h1:first-of-type) {
  display: none;
}





:deep(.docs-prose) {
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

:deep(.docs-prose del) {
  color: var(--docs-muted);
  text-decoration-color: currentColor;
}

:deep(.docs-prose code) {
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace);
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
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color) 40%, transparent);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-fill-color) 55%, transparent);
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
  background: color-mix(in srgb, var(--tx-fill-color) 70%, transparent);
  color: var(--docs-ink);
  font-weight: 600;
}

:deep(.docs-prose table tbody tr:nth-child(2n)) {
  background: color-mix(in srgb, var(--tx-fill-color) 45%, transparent);
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

<style>
.docs-analytics-config-mask {
  position: fixed;
  inset: 0;
  z-index: 1880;
  background: rgba(10, 14, 24, 0.36);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.docs-analytics-config-mask-enter-active,
.docs-analytics-config-mask-leave-active {
  transition: opacity 180ms ease;
}

.docs-analytics-config-mask-enter-from,
.docs-analytics-config-mask-leave-to {
  opacity: 0;
}

.docs-analytics-config-card {
  width: min(440px, 92vw);
  height: min(520px, 78vh);
  background: var(--tx-bg-color-overlay);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}
</style>

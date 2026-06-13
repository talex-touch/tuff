<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import type {
  DocAnalyticsEvidenceSummary,
  DocAnalyticsResponse,
} from '~/types/docs-engagement'

const props = defineProps<{
  docPath: string
  isAdmin: boolean
  isZh: boolean
  ready: boolean
}>()

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

interface DocsAnalyticsOptions {
  days: number
  hotSectionLimit: number
  evidenceLimit: number
  showSectionBlocks: boolean
  showBadges: boolean
  showCopy: boolean
  showSelect: boolean
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

const DOCS_ANALYTICS_DEFAULTS: DocsAnalyticsOptions = Object.freeze({
  days: 30,
  hotSectionLimit: 6,
  evidenceLimit: 160,
  showSectionBlocks: true,
  showBadges: true,
  showCopy: true,
  showSelect: true,
})
const DOCS_ANALYTICS_STORAGE_KEY = 'nexus.docs.analytics.overlay.v1'

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

const docsAnalyticsOptions = reactive<DocsAnalyticsOptions>({
  days: DOCS_ANALYTICS_DEFAULTS.days,
  hotSectionLimit: DOCS_ANALYTICS_DEFAULTS.hotSectionLimit,
  evidenceLimit: DOCS_ANALYTICS_DEFAULTS.evidenceLimit,
  showSectionBlocks: DOCS_ANALYTICS_DEFAULTS.showSectionBlocks,
  showBadges: DOCS_ANALYTICS_DEFAULTS.showBadges,
  showCopy: DOCS_ANALYTICS_DEFAULTS.showCopy,
  showSelect: DOCS_ANALYTICS_DEFAULTS.showSelect,
})
const docsAnalyticsOptionsReady = ref(false)

let docsOverlayFrameRaf: number | null = null
let docsOverlayResizeObserver: ResizeObserver | null = null

function normalizeAnalyticsPath(path: string | null | undefined) {
  if (!path)
    return ''
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}

const docAnalyticsPath = computed(() => normalizeAnalyticsPath(props.docPath))

const adminAnalyticsHref = computed(() => {
  const params = new URLSearchParams()
  params.set('section', 'docs')
  params.set('source', 'docs_page')
  if (docAnalyticsPath.value)
    params.set('path', docAnalyticsPath.value)
  return `/dashboard/admin/analytics?${params.toString()}`
})

function formatCompactDuration(ms: number) {
  if (!ms)
    return props.isZh ? '0 秒' : '0s'
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60)
    return props.isZh ? `${totalSeconds} 秒` : `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return props.isZh ? `${minutes} 分 ${seconds} 秒` : `${minutes}m ${seconds}s`
}

function formatPercent(value: number) {
  const clamped = Math.max(0, Math.min(100, value))
  if (clamped === 0 || clamped >= 10)
    return `${clamped.toFixed(0)}%`
  return `${clamped.toFixed(1)}%`
}

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
    return props.isZh ? '暂无聚合数据' : 'No analytics data yet'

  const readers = summary.sessionCount || summary.views
  const readText = props.isZh ? `${readers} 阅读会话` : `${readers} reading sessions`
  const stayText = props.isZh
    ? `人均停留 ${formatCompactDuration(summary.activeMs / Math.max(1, readers))}`
    : `avg stay ${formatCompactDuration(summary.activeMs / Math.max(1, readers))}`
  return `${readText} · ${stayText}`
})

const docsAnalyticsQuickTips = computed(() => {
  if (props.isZh) {
    return {
      toggle: docsAnalyticsVisible.value ? '关闭文档热区' : '开启文档热区',
      refresh: '刷新统计',
      settings: '展开配置',
      analytics: '打开后台 Analytics',
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
  if (props.isZh) {
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
  if (!last)
    return null
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

function renderDocsAnalyticsOverlay() {
  if (!import.meta.client)
    return

  if (!props.isAdmin || !props.ready || !docsAnalyticsVisible.value || !docsAnalyticsDetail.value) {
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
        ? `${props.isZh ? '热门' : 'Top'} ${rank}`
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
      const label = `${props.isZh ? '热门段落' : 'Hot section'} ${rank || '-'} · ${formatPercent(insight.readPercent)}`
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
      const tooltip = props.isZh
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
  if (!props.isAdmin || !docAnalyticsPath.value || docsAnalyticsLoading.value)
    return
  if (!force && docsAnalyticsResult.value && docsAnalyticsVisible.value) {
    scheduleDocsAnalyticsOverlay()
    return
  }

  docsAnalyticsLoading.value = true
  docsAnalyticsError.value = null
  try {
    const response = await rawFetch<DocAnalyticsResponse>('/api/admin/analytics/docs', {
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

onMounted(() => {
  loadDocsAnalyticsOptions()
  docsAnalyticsOptionsReady.value = true
  clampDocsAnalyticsOptions()
  bindDocsAnalyticsResizeObserver()
  window.addEventListener('resize', scheduleDocsAnalyticsOverlay, { passive: true })
})

onBeforeUnmount(() => {
  docsAnalyticsOptionsReady.value = false
  docsAnalyticsConfigOpen.value = false
  docsOverlayResizeObserver?.disconnect()
  docsOverlayResizeObserver = null
  window.removeEventListener('resize', scheduleDocsAnalyticsOverlay)
  if (docsOverlayFrameRaf)
    cancelAnimationFrame(docsOverlayFrameRaf)
  clearDocsAnalyticsVisuals()
})

watch(
  () => [props.docPath, props.ready] as const,
  () => {
    docsAnalyticsConfigOpen.value = false
    docsAnalyticsAdvancedOpen.value = false
    docsAnalyticsVisible.value = false
    docsAnalyticsError.value = null
    docsAnalyticsResult.value = null
    docsAnalyticsUpdatedAt.value = null
    clearDocsAnalyticsVisuals()
    if (props.ready)
      nextTick(() => bindDocsAnalyticsResizeObserver())
  },
)

watch(
  () => [docsAnalyticsVisible.value, docsAnalyticsDetail.value, props.ready, props.isZh],
  () => {
    if (!docsAnalyticsVisible.value || !props.ready) {
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
  <ClientOnly v-if="isAdmin && ready">
    <Teleport to="#docs-outline-tools">
      <div class="docs-analytics-toolbar docs-analytics-toolbar--outline">
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
          <span v-if="docsAnalyticsUpdatedAt"> · {{ isZh ? '更' : 'Up' }} {{ new Date(docsAnalyticsUpdatedAt).toLocaleTimeString() }}</span>
        </p>
        <p v-if="docsAnalyticsError" class="docs-analytics-toolbar__error">
          {{ docsAnalyticsError }}
        </p>
      </div>
    </Teleport>
    <FlipDialog
      v-model="docsAnalyticsConfigOpen"
      :reference="docsAnalyticsConfigTriggerEl"
      size="md"
      mask-class="docs-analytics-config-mask"
    >
      <template #header-display>
        <div class="docs-analytics-config__title-wrap">
          <span class="i-carbon-chart-line-data docs-analytics-config__title-icon" />
          <h3 class="docs-analytics-config__title">
            {{ isZh ? '文档热区配置' : 'Docs Overlay Settings' }}
          </h3>
        </div>
      </template>
      <template #header-actions>
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
            <NuxtLink :to="adminAnalyticsHref" class="docs-analytics-icon-link">
              <span class="i-carbon-launch" />
            </NuxtLink>
          </TxTooltip>
        </div>
      </template>
      <template #default>
        <section class="docs-analytics-config">
          <div class="docs-analytics-config__group">
            <label class="docs-analytics-config__label">
              {{ isZh ? '统计窗口（天）' : 'Window (days)' }}
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
              {{ isZh ? '热门段落数量' : 'Hot sections' }}
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
                  {{ isZh ? '细粒度热点上限' : 'Fine-grain hotspot limit' }}
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
    </FlipDialog>
  </ClientOnly>

  <div
    v-if="isAdmin && ready && docsAnalyticsVisible && docsAnalyticsFrame.ready"
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
</template>

<style scoped>
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

.docs-analytics-icon-btn :deep(span[class^='i-carbon']) {
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

.docs-analytics-icon-link :deep(span[class^='i-carbon']) {
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

:global(.docs-analytics-config-mask) {
  perspective: 1200px;
}

:global(.docs-analytics-config-mask .TxFlipOverlay-GlobalMask) {
  background: rgba(10, 14, 24, 0.36);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

:global(.docs-analytics-config-mask .FlipDialog-Card) {
  width: min(440px, 92vw);
  height: min(520px, 78vh);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}
</style>

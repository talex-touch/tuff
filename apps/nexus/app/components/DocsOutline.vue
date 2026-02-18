<script setup lang="ts">
import { useEventListener, useResizeObserver, useThrottleFn } from '@vueuse/core'
import { nextTick, watch } from 'vue'

interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

interface TocFlatLink extends TocLink {
  parentId?: string
}

interface OutlineEntry extends TocFlatLink {
  indent: number
}

interface TreeNode extends OutlineEntry {
  isLastChild: boolean
  hasChildren: boolean
}

const { t } = useI18n()
const route = useRoute()

const tocState = useState<TocLink[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => false)

const activeHash = ref('')
const headingElements = ref<Record<string, HTMLElement>>({})
const SCROLL_OFFSET = 120

// Skeleton entries with hierarchical indentation
const skeletonEntries = [
  { width: '72%', indent: 0 },
  { width: '56%', indent: 1 },
  { width: '64%', indent: 1 },
  { width: '88%', indent: 0 },
  { width: '60%', indent: 1 },
  { width: '48%', indent: 1 },
  { width: '76%', indent: 0 },
]

// Tree line constants
const TREE_X_BASE = 6
const TREE_INDENT = 12
const CURVE_RADIUS = 5
const SKELETON_ROW_HEIGHT = 24
const SKELETON_PADDING_TOP = 0

// Marker state
const markerTop = ref(0)
const markerHeight = ref(0)
const hasActive = ref(false)
const navRef = ref<HTMLElement | null>(null)

// Entry positions for SVG tree lines
const entryPositions = ref<Map<string, { top: number, centerY: number, height: number }>>(new Map())
const navScrollHeight = ref(0)

function normalizeHash(hash: string) {
  const raw = hash.replace(/^#/, '')
  if (!raw)
    return ''
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
}

function setActiveHash(hash?: string | null) {
  if (!hash) {
    activeHash.value = ''
    return
  }
  activeHash.value = normalizeHash(hash)
}

function syncUrlHash(id: string) {
  if (!import.meta.client)
    return
  const encoded = encodeURIComponent(id)
  const next = `#${encoded}`
  if (window.location.hash !== next)
    history.replaceState(null, '', next)
}

function updateMarker() {
  if (!navRef.value || !activeHash.value) {
    hasActive.value = false
    return
  }

  const links = navRef.value.querySelectorAll<HTMLElement>('a[data-id]')
  const activeLink = Array.from(links).find(link => link.getAttribute('data-id') === activeHash.value)
  if (!activeLink) {
    hasActive.value = false
    return
  }

  hasActive.value = true
  markerHeight.value = 18
  const navRect = navRef.value.getBoundingClientRect()
  const linkRect = activeLink.getBoundingClientRect()
  markerTop.value = linkRect.top - navRect.top + navRef.value.scrollTop + (activeLink.offsetHeight - markerHeight.value) / 2
}

const updateEntryPositions = useThrottleFn(() => {
  if (!navRef.value)
    return
  const map = new Map<string, { top: number, centerY: number, height: number }>()
  const links = navRef.value.querySelectorAll<HTMLElement>('a[data-id]')
  const navRect = navRef.value.getBoundingClientRect()
  for (const link of links) {
    const id = link.getAttribute('data-id')
    if (!id)
      continue
    const linkRect = link.getBoundingClientRect()
    const top = linkRect.top - navRect.top + navRef.value.scrollTop
    const height = linkRect.height
    map.set(id, { top, centerY: top + height / 2, height })
  }
  entryPositions.value = map
  navScrollHeight.value = navRef.value.scrollHeight
}, 50)

function scrollToHeading(id: string, behavior: ScrollBehavior = 'smooth') {
  const element = document.getElementById(id)
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({
      top,
      behavior,
    })
    syncUrlHash(id)
    setActiveHash(`#${id}`)
  }
}

function refreshHeadingElements() {
  if (!import.meta.client)
    return
  const nextMap: Record<string, HTMLElement> = {}
  for (const entry of flatLinks.value) {
    const element = document.getElementById(entry.id)
    if (element instanceof HTMLElement)
      nextMap[entry.id] = element
  }
  headingElements.value = nextMap
}

const updateActiveFromScroll = useThrottleFn((fromScroll = false) => {
  if (!import.meta.client)
    return
  if (!flatLinks.value.length)
    return

  let current: TocLink | null = null
  for (const entry of flatLinks.value) {
    const element = headingElements.value[entry.id] ?? document.getElementById(entry.id)
    if (!(element instanceof HTMLElement))
      continue

    const rect = element.getBoundingClientRect()
    if (rect.top - SCROLL_OFFSET <= 0)
      current = entry
    else if (!current)
      current = entry
  }

  const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
  if (isNearBottom) {
    const last = flatLinks.value[flatLinks.value.length - 1]
    if (last)
      current = last
  }

  if (current && activeHash.value !== current.id) {
    activeHash.value = current.id
    if (fromScroll)
      syncUrlHash(current.id)
  }
}, 100)

if (import.meta.client) {
  onMounted(() => {
    setActiveHash(window.location.hash)
    nextTick(() => {
      refreshHeadingElements()
      const initialHash = normalizeHash(window.location.hash)
      if (initialHash)
        scrollToHeading(initialHash, 'auto')
      else
        updateActiveFromScroll()
      updateMarker()
      updateEntryPositions()
    })
  })
  useEventListener(window, 'hashchange', () => {
    setActiveHash(window.location.hash)
    const hash = normalizeHash(window.location.hash)
    if (hash)
      scrollToHeading(hash, 'smooth')
  })
  useEventListener(
    window,
    'scroll',
    () => {
      updateActiveFromScroll(true)
    },
    { passive: true },
  )
  useEventListener(window, 'resize', () => {
    refreshHeadingElements()
    updateActiveFromScroll()
    updateMarker()
    updateEntryPositions()
  })
  useEventListener(navRef, 'scroll', () => {
    updateMarker()
  }, { passive: true })
  useResizeObserver(navRef, () => {
    updateMarker()
    updateEntryPositions()
  })
}

function flattenLinks(links: TocLink[] | undefined, bucket: TocFlatLink[] = [], parentId?: string) {
  if (!Array.isArray(links))
    return bucket
  for (const link of links) {
    bucket.push({ ...link, parentId })
    if (link.children?.length)
      flattenLinks(link.children, bucket, link.id)
  }
  return bucket
}

const flatLinks = computed(() => flattenLinks(tocState.value))

const linkMap = computed(() => {
  const map = new Map<string, TocFlatLink>()
  for (const link of flatLinks.value)
    map.set(link.id, link)
  return map
})

const baseDepth = computed(() => {
  if (!flatLinks.value.length)
    return 1
  return flatLinks.value.reduce((minDepth, link) => Math.min(minDepth, link.depth), Number.POSITIVE_INFINITY)
})

function findAncestorId(id: string | undefined, targetDepth: number, map: Map<string, TocFlatLink>) {
  if (!id)
    return ''
  let current = map.get(id)
  while (current && current.depth > targetDepth)
    current = current.parentId ? map.get(current.parentId) : undefined
  if (current?.depth === targetDepth)
    return current.id
  return ''
}

const activeLink = computed(() => linkMap.value.get(activeHash.value))
const activeLevel1Id = computed(() => findAncestorId(activeLink.value?.id, baseDepth.value, linkMap.value))
const activeLevel2Id = computed(() => findAncestorId(activeLink.value?.id, baseDepth.value + 1, linkMap.value))

const outlineEntries = computed<OutlineEntry[]>(() => {
  if (!flatLinks.value.length)
    return []
  const base = baseDepth.value
  const level2Depth = base + 1
  const level3Depth = base + 2
  const activeLevel1 = activeLevel1Id.value
  const activeLevel2 = activeLevel2Id.value
  return flatLinks.value
    .filter((link) => {
      if (link.depth === base)
        return true
      if (link.depth === level2Depth)
        return !!activeLevel1 && link.parentId === activeLevel1
      if (link.depth === level3Depth)
        return !!activeLevel2 && link.parentId === activeLevel2
      return false
    })
    .map(link => ({
      ...link,
      indent: Math.min(2, Math.max(0, link.depth - base)),
    }))
})

// Tree structure with parent-child metadata
const treeStructure = computed<TreeNode[]>(() => {
  const entries = outlineEntries.value
  if (!entries.length)
    return []

  return entries.map((entry, idx) => {
    // Check if this is the last child at its indent level under the same parent
    let isLastChild = true
    for (let j = idx + 1; j < entries.length; j++) {
      if (entries[j].indent < entry.indent)
        break
      if (entries[j].indent === entry.indent && entries[j].parentId === entry.parentId) {
        isLastChild = false
        break
      }
    }

    // Check if has visible children (next entries with indent + 1)
    let hasChildren = false
    for (let j = idx + 1; j < entries.length; j++) {
      if (entries[j].indent <= entry.indent)
        break
      if (entries[j].indent === entry.indent + 1) {
        hasChildren = true
        break
      }
    }

    return {
      ...entry,
      isLastChild,
      hasChildren,
    }
  })
})

// SVG paths for tree guide lines
const svgPaths = computed(() => {
  const nodes = treeStructure.value
  const positions = entryPositions.value
  if (!nodes.length || !positions.size)
    return []

  const paths: { d: string, class: string }[] = []

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const pos = positions.get(node.id)
    if (!pos)
      continue

    const nodeX = TREE_X_BASE + node.indent * TREE_INDENT

    // A. Vertical trunk line: parent with children draws line down to last direct child
    if (node.hasChildren) {
      // Find last direct child position
      let lastChildCenterY = pos.centerY
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].indent <= node.indent)
          break
        if (nodes[j].indent === node.indent + 1) {
          const childPos = positions.get(nodes[j].id)
          if (childPos)
            lastChildCenterY = childPos.centerY
        }
      }

      if (lastChildCenterY > pos.centerY) {
        const x = nodeX + TREE_INDENT
        paths.push({
          d: `M ${x} ${pos.centerY} L ${x} ${lastChildCenterY - CURVE_RADIUS}`,
          class: 'tree-line tree-trunk',
        })
      }
    }

    // B. Branch connector: indent > 0 entries get a curved connector from parent trunk
    if (node.indent > 0) {
      const parentX = nodeX - TREE_INDENT + TREE_INDENT // parent's trunk x = parent indent * TREE_INDENT + TREE_X_BASE + TREE_INDENT
      const trunkX = TREE_X_BASE + (node.indent - 1) * TREE_INDENT + TREE_INDENT
      const endX = nodeX + 2 // slightly past the node X for visual connection
      const cy = pos.centerY
      const R = Math.min(CURVE_RADIUS, (endX - trunkX) / 2)

      paths.push({
        d: `M ${trunkX} ${cy - R} Q ${trunkX} ${cy}, ${trunkX + R} ${cy} L ${endX} ${cy}`,
        class: 'tree-line tree-branch',
      })
    }
  }

  return paths
})

// Static SVG paths for skeleton tree lines
const skeletonSvgPaths = computed(() => {
  const paths: { d: string }[] = []

  for (let i = 0; i < skeletonEntries.length; i++) {
    const entry = skeletonEntries[i]
    const centerY = SKELETON_PADDING_TOP + i * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2
    const nodeX = TREE_X_BASE + entry.indent * TREE_INDENT

    if (entry.indent > 0) {
      const trunkX = TREE_X_BASE + (entry.indent - 1) * TREE_INDENT + TREE_INDENT
      const endX = nodeX + 2
      const R = Math.min(CURVE_RADIUS, (endX - trunkX) / 2)

      paths.push({
        d: `M ${trunkX} ${centerY - R} Q ${trunkX} ${centerY}, ${trunkX + R} ${centerY} L ${endX} ${centerY}`,
      })
    }
  }

  // Vertical trunk lines for skeleton parents
  const parentRanges: { x: number, startY: number, endY: number }[] = []
  for (let i = 0; i < skeletonEntries.length; i++) {
    const entry = skeletonEntries[i]
    if (entry.indent > 0)
      continue
    // Find children range
    const startY = SKELETON_PADDING_TOP + i * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2
    let lastChildY = startY
    let hasChild = false
    for (let j = i + 1; j < skeletonEntries.length; j++) {
      if (skeletonEntries[j].indent === 0)
        break
      if (skeletonEntries[j].indent === 1) {
        hasChild = true
        lastChildY = SKELETON_PADDING_TOP + j * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2
      }
    }
    if (hasChild) {
      const x = TREE_X_BASE + TREE_INDENT
      parentRanges.push({ x, startY, endY: lastChildY - CURVE_RADIUS })
    }
  }

  for (const range of parentRanges) {
    paths.push({
      d: `M ${range.x} ${range.startY} L ${range.x} ${range.endY}`,
    })
  }

  return paths
})

const skeletonSvgHeight = computed(() => skeletonEntries.length * SKELETON_ROW_HEIGHT)

const hasOutline = computed(() => outlineEntries.value.length > 0)
const showSkeleton = computed(() => outlineLoadingState.value && !hasOutline.value)

watch(
  flatLinks,
  () => {
    if (!import.meta.client)
      return
    nextTick(() => {
      refreshHeadingElements()
      updateActiveFromScroll()
      updateMarker()
      updateEntryPositions()
    })
  },
  { immediate: true },
)

watch(activeHash, () => {
  nextTick(() => {
    updateMarker()
    updateEntryPositions()
  })
})

// Watch route changes to refresh heading elements after DOM update
watch(
  () => route.fullPath,
  () => {
    if (!import.meta.client)
      return
    // Reset state on route change
    headingElements.value = {}
    activeHash.value = ''
    hasActive.value = false

    // Wait for DOM to be ready with new content
    nextTick(() => {
      setTimeout(() => {
        refreshHeadingElements()
        const nextHash = normalizeHash(window.location.hash)
        if (nextHash)
          scrollToHeading(nextHash, 'auto')
        else
          updateActiveFromScroll()
        setActiveHash(window.location.hash)
        updateMarker()
        updateEntryPositions()
      }, 100)
    })
  },
)
</script>

<template>
  <div class="docs-outline flex flex-col text-sm">
    <div class="docs-outline__label">
      {{ t('docs.outlineLabel') }}
    </div>

    <nav v-if="hasOutline" ref="navRef" class="outline-nav relative">
      <!-- SVG tree guide lines -->
      <svg
        class="outline-tree-svg"
        :style="{ height: `${navScrollHeight}px` }"
        aria-hidden="true"
      >
        <path
          v-for="(p, i) in svgPaths"
          :key="i"
          :d="p.d"
          :class="p.class"
          fill="none"
        />
      </svg>

      <!-- Sliding Marker -->
      <div
        class="outline-marker"
        :style="{
          top: `${markerTop}px`,
          height: `${markerHeight}px`,
          opacity: hasActive ? 1 : 0,
        }"
      />

      <div
        v-for="entry in outlineEntries"
        :key="entry.id"
        class="outline-item relative"
        :class="{ 'outline-item-nested': entry.indent > 0 }"
      >
        <NuxtLink
          :to="`#${entry.id}`"
          replace
          class="outline-link group relative flex items-center py-2 text-[14px] leading-snug no-underline transition-all duration-150"
          :style="{ paddingLeft: `${8 + entry.indent * 12}px` }"
          :class="{ 'is-active': activeHash === entry.id }"
          :data-id="entry.id"
          @click.prevent="scrollToHeading(entry.id)"
        >
          <span class="line-clamp-2">{{ entry.text }}</span>
        </NuxtLink>
      </div>
    </nav>

    <div v-else-if="showSkeleton" class="outline-skeleton relative">
      <!-- Skeleton SVG tree lines -->
      <svg
        class="outline-tree-svg"
        :style="{ height: `${skeletonSvgHeight}px` }"
        aria-hidden="true"
      >
        <path
          v-for="(p, i) in skeletonSvgPaths"
          :key="i"
          :d="p.d"
          class="tree-line tree-skeleton-line"
          fill="none"
        />
      </svg>

      <div
        v-for="(entry, index) in skeletonEntries"
        :key="index"
        class="outline-skeleton__item"
        :style="{
          width: entry.width,
          marginLeft: `${entry.indent * 12}px`,
          animationDelay: `${index * 0.12}s`,
        }"
      />
    </div>

    <div v-else class="outline-empty">
      {{ t('docs.noOutline') }}
    </div>
  </div>
</template>

<style scoped>
.docs-outline {
  gap: 14px;
}

.docs-outline__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 70%, transparent);
}

.outline-nav {
  padding-left: 6px;
  padding-right: 6px;
  max-height: min(420px, calc(100vh - 16rem));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.outline-tree-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
  z-index: 0;
}

.tree-line {
  stroke: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
  stroke-width: 1;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: opacity 0.3s ease;
}

.tree-skeleton-line {
  stroke: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 80%, transparent);
}

.outline-marker {
  position: absolute;
  left: 0;
  width: 2px;
  border-radius: 999px;
  background: var(--tx-color-primary, #409eff);
  z-index: 1;
  transition:
    top var(--tx-transition-duration, 0.3s) var(--tx-transition-function, ease-in-out),
    height var(--tx-transition-duration, 0.3s) var(--tx-transition-function, ease-in-out),
    opacity var(--tx-transition-duration, 0.3s) var(--tx-transition-function, ease-in-out);
}

.outline-skeleton {
  display: grid;
  gap: 10px;
  padding-left: 6px;
}

.outline-skeleton__item {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent) 0%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 92%, transparent) 50%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: outline-shimmer 1.6s ease-in-out infinite;
}

.outline-link {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 85%, transparent);
  transition: color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.outline-link:hover {
  color: var(--tx-text-color-primary, #303133);
}

.outline-link.is-active {
  color: var(--tx-color-primary, #409eff);
  font-weight: 600;
}

.outline-item + .outline-item {
  margin-top: 2px;
}

.outline-item-nested .outline-link {
  font-size: 13px;
}

.outline-empty {
  font-size: 12px;
  color: var(--tx-text-color-placeholder, #a8abb2);
}

@keyframes outline-shimmer {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
}
</style>

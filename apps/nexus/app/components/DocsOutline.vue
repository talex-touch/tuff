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

// Tree line geometry
// SVG is inside contentRef wrapper (after nav's 6px padding)
// Link paddingLeft: 14 + indent*12 (from wrapper left)
// Trunk at 4 + indent*12 (before text start at 14)
const TREE_LINE_X = 4
const INDENT_SIZE = 12
const BRANCH_CURVE_H = 12
const SKELETON_ROW_HEIGHT = 24

const navRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

// Entry positions for SVG tree lines
const entryPositions = ref<Map<string, { top: number, centerY: number, height: number }>>(new Map())
const navContentHeight = ref(0)

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

const updateEntryPositions = useThrottleFn(() => {
  if (!contentRef.value)
    return
  const map = new Map<string, { top: number, centerY: number, height: number }>()
  const links = contentRef.value.querySelectorAll<HTMLElement>('a[data-id]')
  const wrapperRect = contentRef.value.getBoundingClientRect()
  for (const link of links) {
    const id = link.getAttribute('data-id')
    if (!id)
      continue
    const linkRect = link.getBoundingClientRect()
    const top = linkRect.top - wrapperRect.top
    const height = linkRect.height
    map.set(id, { top, centerY: top + height / 2, height })
  }
  entryPositions.value = map
  navContentHeight.value = contentRef.value.scrollHeight
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
    updateEntryPositions()
  })
  useResizeObserver(navRef, () => {
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
  const activeLevel2 = activeLevel2Id.value
  return flatLinks.value
    .filter((link) => {
      if (link.depth === base)
        return true
      if (link.depth === level2Depth)
        return true
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

  // Step 1: Group siblings by (indent, parentId)
  const siblingGroups = new Map<string, TreeNode[]>()
  for (const node of nodes) {
    const key = `${node.indent}:${node.parentId || '__root__'}`
    let group = siblingGroups.get(key)
    if (!group) {
      group = []
      siblingGroups.set(key, group)
    }
    group.push(node)
  }

  // Step 2: Draw segmented trunk lines (skip gaps where children detour)
  for (const [, group] of siblingGroups) {
    const first = group[0]
    const last = group[group.length - 1]
    const firstPos = positions.get(first.id)
    const lastPos = positions.get(last.id)
    if (!firstPos || !lastPos)
      continue

    let endY = lastPos.centerY

    // Compute gaps where children detour via diagonals
    const gaps: { start: number, end: number }[] = []
    for (const entry of group) {
      if (!entry.hasChildren)
        continue
      const entryIdx = nodes.indexOf(entry)
      let firstChildCy = Infinity
      let lastChildCy = -Infinity
      for (let j = entryIdx + 1; j < nodes.length; j++) {
        if (nodes[j].indent <= entry.indent)
          break
        if (nodes[j].indent === entry.indent + 1) {
          const cp = positions.get(nodes[j].id)
          if (cp) {
            if (cp.centerY < firstChildCy)
              firstChildCy = cp.centerY
            if (cp.centerY > lastChildCy)
              lastChildCy = cp.centerY
          }
        }
      }
      if (firstChildCy !== Infinity && lastChildCy !== -Infinity) {
        const gapStart = firstChildCy - BRANCH_CURVE_H
        const gapEnd = lastChildCy + BRANCH_CURVE_H
        gaps.push({ start: gapStart, end: gapEnd })
        if (gapEnd > endY)
          endY = gapEnd
      }
    }

    const startY = firstPos.centerY
    if (endY <= startY)
      continue

    const x = TREE_LINE_X + first.indent * INDENT_SIZE

    if (gaps.length === 0) {
      paths.push({ d: `M ${x} ${startY} L ${x} ${endY}`, class: 'tree-line tree-trunk' })
    }
    else {
      // Sort and merge overlapping gaps
      gaps.sort((a, b) => a.start - b.start)
      const merged: { start: number, end: number }[] = []
      for (const gap of gaps) {
        if (merged.length && gap.start <= merged[merged.length - 1].end)
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, gap.end)
        else
          merged.push({ start: gap.start, end: gap.end })
      }

      // Draw trunk segments between gaps
      let currentY = startY
      for (const gap of merged) {
        if (gap.start > currentY)
          paths.push({ d: `M ${x} ${currentY} L ${x} ${gap.start}`, class: 'tree-line tree-trunk' })
        currentY = Math.max(currentY, gap.end)
      }
      if (endY > currentY)
        paths.push({ d: `M ${x} ${currentY} L ${x} ${endY}`, class: 'tree-line tree-trunk' })
    }
  }

  // Step 3: Forward branch diagonal (only for FIRST child of each parent)
  const firstChildDrawn = new Set<string>()
  for (const node of nodes) {
    if (node.indent <= 0)
      continue
    const parentId = node.parentId || '__root__'
    if (firstChildDrawn.has(parentId))
      continue
    firstChildDrawn.add(parentId)

    const pos = positions.get(node.id)
    if (!pos)
      continue

    const parentTrunkX = TREE_LINE_X + (node.indent - 1) * INDENT_SIZE
    const endX = TREE_LINE_X + node.indent * INDENT_SIZE
    const cy = pos.centerY

    paths.push({
      d: `M ${parentTrunkX} ${cy - BRANCH_CURVE_H} L ${endX} ${cy}`,
      class: 'tree-line tree-branch',
    })
  }

  // Step 4: Reverse branch diagonal (from last child back to trunk)
  for (const node of nodes) {
    if (!node.hasChildren)
      continue
    const nodeIdx = nodes.indexOf(node)
    let lastChild: TreeNode | null = null
    for (let j = nodeIdx + 1; j < nodes.length; j++) {
      if (nodes[j].indent <= node.indent)
        break
      if (nodes[j].indent === node.indent + 1)
        lastChild = nodes[j]
    }
    if (!lastChild)
      continue
    const lcp = positions.get(lastChild.id)
    if (!lcp)
      continue
    const trunkX = TREE_LINE_X + node.indent * INDENT_SIZE
    const childX = TREE_LINE_X + lastChild.indent * INDENT_SIZE
    paths.push({
      d: `M ${childX} ${lcp.centerY} L ${trunkX} ${lcp.centerY + BRANCH_CURVE_H}`,
      class: 'tree-line tree-branch',
    })
  }

  return paths
})

// Active chain: active entry + all its ancestors
const activeChainIds = computed(() => {
  const ids = new Set<string>()
  if (!activeHash.value)
    return ids
  ids.add(activeHash.value)
  let current = linkMap.value.get(activeHash.value)
  while (current?.parentId) {
    ids.add(current.parentId)
    current = linkMap.value.get(current.parentId)
  }
  return ids
})

// SVG dots for each outline entry node (base layer, highlight when in active chain)
const svgDots = computed(() => {
  const positions = entryPositions.value
  if (!positions.size)
    return []
  const chain = activeChainIds.value

  return outlineEntries.value
    .map((entry) => {
      const pos = positions.get(entry.id)
      if (!pos)
        return null
      return {
        cx: TREE_LINE_X + entry.indent * INDENT_SIZE,
        cy: pos.centerY,
        active: chain.has(entry.id),
      }
    })
    .filter(Boolean) as { cx: number, cy: number, active: boolean }[]
})

// Indicator track range: computes the start/end distances along treeTrack for highlighting
const indicatorTrackRange = computed<{ start: number, length: number } | null>(() => {
  if (!activeHash.value)
    return null
  const distances = treeTrack.value.distances
  if (!distances.size)
    return null
  const chain = activeChainIds.value

  // Start: smallest distance in the active chain (topmost ancestor)
  let startDist = Infinity
  for (const id of chain) {
    const d = distances.get(id)
    if (d != null && d < startDist)
      startDist = d
  }

  // End: active node's distance, extended to last child if has children
  let endDist = distances.get(activeHash.value) ?? 0
  const nodes = treeStructure.value
  const activeIdx = nodes.findIndex(n => n.id === activeHash.value)
  if (activeIdx >= 0) {
    const activeNode = nodes[activeIdx]
    if (activeNode.hasChildren) {
      for (let j = activeIdx + 1; j < nodes.length; j++) {
        if (nodes[j].indent <= activeNode.indent)
          break
        if (nodes[j].indent === activeNode.indent + 1) {
          const d = distances.get(nodes[j].id)
          if (d != null && d > endDist)
            endDist = d
        }
      }
    }
  }

  if (startDist === Infinity)
    return null

  return { start: startDist, length: endDist - startDist }
})

// Continuous tree track path for offset-path animation
// Traces the full tree structure: trunk → forward diagonal → child trunk → reverse diagonal → trunk...
const treeTrack = computed(() => {
  const nodes = treeStructure.value
  const positions = entryPositions.value
  if (!nodes.length || !positions.size)
    return { d: '', distances: new Map<string, number>() }

  const distances = new Map<string, number>()
  const parts: string[] = []
  let totalLength = 0
  let curX = 0
  let curY = 0

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const pos = positions.get(node.id)
    if (!pos)
      continue

    const x = TREE_LINE_X + node.indent * INDENT_SIZE
    const cy = pos.centerY

    if (i === 0) {
      parts.push(`M ${x} ${cy}`)
      curX = x
      curY = cy
      distances.set(node.id, 0)
      continue
    }

    const prevNode = nodes[i - 1]

    if (node.indent > prevNode.indent) {
      // Going deeper: trunk down to branch start, then forward 45° diagonal
      const branchY = cy - BRANCH_CURVE_H
      if (branchY > curY) {
        parts.push(`L ${curX} ${branchY}`)
        totalLength += branchY - curY
        curY = branchY
      }
      const dx = x - curX
      const dy = cy - curY
      parts.push(`L ${x} ${cy}`)
      totalLength += Math.sqrt(dx * dx + dy * dy)
    }
    else if (node.indent < prevNode.indent) {
      // Going shallower: reverse 45° diagonal, then trunk down
      const rdx = x - curX
      parts.push(`L ${x} ${curY + BRANCH_CURVE_H}`)
      totalLength += Math.sqrt(rdx * rdx + BRANCH_CURVE_H * BRANCH_CURVE_H)
      const returnY = curY + BRANCH_CURVE_H
      if (cy > returnY) {
        parts.push(`L ${x} ${cy}`)
        totalLength += cy - returnY
      }
    }
    else {
      // Same indent: straight down
      if (cy > curY) {
        parts.push(`L ${x} ${cy}`)
        totalLength += cy - curY
      }
    }

    curX = x
    curY = cy
    distances.set(node.id, totalLength)
  }

  return { d: parts.join(' '), distances, totalLength }
})

const activeTrackOffset = computed(() => {
  if (!activeHash.value || !treeTrack.value.d)
    return 0
  return treeTrack.value.distances.get(activeHash.value) ?? 0
})

// Static SVG paths for skeleton tree lines
const skeletonSvgPaths = computed(() => {
  const paths: { d: string }[] = []

  // Branch connectors for indented items
  for (let i = 0; i < skeletonEntries.length; i++) {
    const entry = skeletonEntries[i]
    const centerY = i * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2

    if (entry.indent > 0) {
      const parentTrunkX = TREE_LINE_X + (entry.indent - 1) * INDENT_SIZE
      const endX = TREE_LINE_X + entry.indent * INDENT_SIZE

      paths.push({
        d: `M ${parentTrunkX} ${centerY - BRANCH_CURVE_H} L ${endX} ${centerY}`,
      })
    }
  }

  // Sibling group vertical lines (same logic as real tree)
  // Group by indent level
  const groups = new Map<number, number[]>()
  for (let i = 0; i < skeletonEntries.length; i++) {
    const indent = skeletonEntries[i].indent
    let group = groups.get(indent)
    if (!group) {
      group = []
      groups.set(indent, group)
    }
    group.push(i)
  }

  // For indent-0 group: continuous vertical line from first to last
  const rootIndices = groups.get(0)
  if (rootIndices && rootIndices.length >= 2) {
    const firstY = rootIndices[0] * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2
    let lastY = rootIndices[rootIndices.length - 1] * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2

    // Extend to cover children below last root
    for (const ri of rootIndices) {
      for (let j = ri + 1; j < skeletonEntries.length; j++) {
        if (skeletonEntries[j].indent === 0)
          break
        const childY = j * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2
        if (childY > lastY)
          lastY = childY
      }
    }

    paths.push({
      d: `M ${TREE_LINE_X} ${firstY} L ${TREE_LINE_X} ${lastY}`,
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
      updateEntryPositions()
    })
  },
  { immediate: true },
)

watch(activeHash, () => {
  nextTick(() => {
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

    <nav v-if="hasOutline" ref="navRef" class="outline-nav">
      <div ref="contentRef" class="relative">
        <!-- SVG tree guide lines: base layer (grey) + indicator layer (primary) -->
        <svg
          class="outline-tree-svg"
          :style="{ height: `${navContentHeight}px` }"
          aria-hidden="true"
        >
          <!-- Base layer: all tree lines + dots in grey -->
          <g class="tree-base-layer">
            <path
              v-for="(p, i) in svgPaths"
              :key="i"
              :d="p.d"
              :class="p.class"
              fill="none"
            />
            <circle
              v-for="(dot, i) in svgDots"
              :key="`dot-${i}`"
              :cx="dot.cx"
              :cy="dot.cy"
              :r="dot.active ? 3 : 2.5"
              :class="dot.active ? 'tree-dot-active' : 'tree-dot'"
            />
          </g>

          <!-- Indicator layer: highlighted segment of tree track -->
          <g class="tree-indicator-layer">
            <!-- Indicator line: same treeTrack path, dash-clipped to active chain range -->
            <path
              :d="treeTrack.d"
              class="tree-indicator-line"
              fill="none"
              :stroke-dasharray="`${indicatorTrackRange?.length ?? 0} ${(treeTrack.totalLength || 9999) * 2}`"
              :stroke-dashoffset="`${-(indicatorTrackRange?.start ?? 0)}`"
              :style="{ opacity: indicatorTrackRange ? 1 : 0 }"
            />
            <!-- Main active dot: stroke-dash animation along tree track -->
            <path
              :d="treeTrack.d"
              class="tree-indicator-dot-track"
              fill="none"
              :stroke-dasharray="`0.1 ${(treeTrack.totalLength || 9999) * 2}`"
              :stroke-dashoffset="`${-activeTrackOffset}`"
              :style="{ opacity: activeHash && treeTrack.d ? 1 : 0 }"
            />
          </g>
        </svg>

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
            :style="{ paddingLeft: `${14 + entry.indent * 12}px` }"
            :class="{ 'is-active': activeHash === entry.id }"
            :data-id="entry.id"
            @click.prevent="scrollToHeading(entry.id)"
          >
            <span class="line-clamp-2">{{ entry.text }}</span>
          </NuxtLink>
        </div>
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
        <circle
          v-for="(entry, i) in skeletonEntries"
          :key="`sk-dot-${i}`"
          :cx="TREE_LINE_X + entry.indent * INDENT_SIZE"
          :cy="i * SKELETON_ROW_HEIGHT + SKELETON_ROW_HEIGHT / 2"
          r="2.5"
          class="tree-dot tree-skeleton-dot"
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

.tree-dot {
  fill: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
  transition: fill 0.3s ease, r 0.3s ease;
}

.tree-skeleton-dot {
  fill: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 80%, transparent);
}

.tree-dot-active {
  fill: var(--tx-color-primary, #409eff);
  transition: fill 0.3s ease, r 0.3s ease;
}

.tree-indicator-line {
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke-dashoffset 0.4s ease, stroke-dasharray 0.4s ease, opacity 0.2s ease;
}

.tree-indicator-dot-track {
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s ease, opacity 0.2s ease;
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

<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type {
  FlowBackground,
  FlowchartEmits,
  FlowchartProps,
  FlowEdge,
  FlowEdgeMarker,
  FlowNode,
  FlowNodeTone,
  FlowViewport,
} from './types'
/**
 * TxFlowchart Component
 *
 * Interactive workflow canvas supporting Bezier/smoothstep/straight connectors,
 * directional markers, travelling pulse beams, edge labels, node execution
 * statuses, connection ports, alignment snap guides, and pan/zoom/minimap HUD.
 * Remains a pure controlled primitive for `nodes` and `edges`.
 *
 * @example
 * ```vue
 * <TxFlowchart :nodes="nodes" :edges="edges" draggable ports controls @node-move="place">
 *   <template #node="{ node }">…</template>
 * </TxFlowchart>
 * ```
 *
 * @component
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  computeEdgeGeometry,
  computeFitViewport,
  computeMinimapProjection,
  computeSnapGuides,
  type NodeBox,
} from './geometry'

defineOptions({ name: 'TxFlowchart' })

const props = withDefaults(defineProps<FlowchartProps>(), {
  edges: () => [],
  height: 333,
  nodeWidth: 290,
  grid: 22,
  dots: true,
  background: undefined,
  direction: 'vertical',
  edgeType: 'bezier',
  edgeMarker: 'none',
  ports: false,
  selectedId: null,
  draggable: false,
  snap: true,
  snapGuides: true,
  pannable: false,
  zoomable: false,
  minZoom: 0.45,
  maxZoom: 1.75,
  controls: false,
  minimap: false,
  ariaLabel: 'Workflow',
  labels: () => ({}),
})

const emit = defineEmits<FlowchartEmits>()

defineSlots<{
  /** The card body for a node. Falls back to structured fields (`title`/`description`) or an empty card. */
  node?: (props: { node: FlowNode, index: number }) => any
  /** Replaces the category chip above a node. */
  label?: (props: { node: FlowNode }) => any
  /** Custom content inside an edge's midpoint label pill. */
  'edge-label'?: (props: { edge: FlowEdge, index: number }) => any
  /** Replaces or extends the floating bottom-right HUD toolbar. */
  toolbar?: (props: {
    zoom: number
    zoomIn: () => void
    zoomOut: () => void
    fitView: (padding?: number) => void
    resetView: () => void
  }) => any
  /** Empty state rendered when `nodes` is empty. */
  empty?: () => any
}>()

const DRAG_CLICK_THRESHOLD = 4
const ZOOM_STEP = 0.15

const canvasEl = ref<HTMLElement | null>(null)
const canvasWidth = ref(0)
const canvasHeight = ref(props.height)

const resolvedBackground = computed<FlowBackground>(() => {
  if (props.background)
    return props.background
  return props.dots ? 'dots' : 'none'
})

const hudLabels = computed(() => ({
  zoomIn: props.labels?.zoomIn ?? 'Zoom in',
  zoomOut: props.labels?.zoomOut ?? 'Zoom out',
  fitView: props.labels?.fitView ?? 'Fit view',
  resetView: props.labels?.resetView ?? 'Reset zoom',
  minimap: props.labels?.minimap ?? 'Workflow minimap',
}))

/**
 * Measured node geometry keyed by node id.
 * Both height and card midpoint offset are measured so vertical and horizontal
 * connectors always kiss the real card boundary regardless of content wrapping.
 */
const heights = reactive<Record<string, number>>({})
const cardTopOffsets = reactive<Record<string, number>>({})
const cardMidOffsets = reactive<Record<string, number>>({})

let nodeObserver: ResizeObserver | undefined
let canvasObserver: ResizeObserver | undefined

function measureNodeEl(el: HTMLElement, id: string): void {
  const height = el.offsetHeight
  heights[id] = height
  const card = el.querySelector<HTMLElement>('.tx-bui-flowchart__card')
  if (card && card.offsetHeight > 0) {
    cardTopOffsets[id] = card.offsetTop
    cardMidOffsets[id] = card.offsetTop + card.offsetHeight / 2
  }
  else {
    cardTopOffsets[id] = 0
    cardMidOffsets[id] = height / 2
  }
}

function observeNode(el: Element | null, id: string): void {
  if (!el)
    return
  if (!nodeObserver && typeof ResizeObserver !== 'undefined') {
    nodeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement
        const key = target.dataset.flowNode
        if (!key)
          continue
        heights[key] = entry.contentRect.height
        const card = target.querySelector<HTMLElement>('.tx-bui-flowchart__card')
        if (card && card.offsetHeight > 0) {
          cardTopOffsets[key] = card.offsetTop
          cardMidOffsets[key] = card.offsetTop + card.offsetHeight / 2
        }
        else {
          cardTopOffsets[key] = 0
          cardMidOffsets[key] = entry.contentRect.height / 2
        }
      }
    })
  }
  measureNodeEl(el as HTMLElement, id)
  nodeObserver?.observe(el)
}

onMounted(() => {
  const el = canvasEl.value
  if (!el)
    return
  canvasWidth.value = el.clientWidth
  canvasHeight.value = el.clientHeight || props.height
  if (typeof ResizeObserver !== 'undefined') {
    canvasObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry)
        return
      canvasWidth.value = entry.contentRect.width
      canvasHeight.value = entry.contentRect.height || props.height
    })
    canvasObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  nodeObserver?.disconnect()
  nodeObserver = undefined
  canvasObserver?.disconnect()
  canvasObserver = undefined
})

// A node removed from `nodes` must not keep stale measurements around.
watch(
  () => props.nodes.map(n => n.id).join('\u0000'),
  () => {
    const live = new Set(props.nodes.map(n => n.id))
    for (const id of Object.keys(heights)) {
      if (!live.has(id)) {
        delete heights[id]
        delete cardTopOffsets[id]
        delete cardMidOffsets[id]
      }
    }
  },
)

/** Interactive viewport pan + zoom state. */
const viewport = reactive<FlowViewport>({ x: 0, y: 0, zoom: 1 })
const isPanning = ref(false)
const hoveredEdgeKey = ref<string | null>(null)

function clampZoom(value: number): number {
  const clamped = Math.min(props.maxZoom, Math.max(props.minZoom, value))
  return Math.round(clamped * 100) / 100
}

function updateViewport(next: Partial<FlowViewport>): void {
  if (next.x !== undefined)
    viewport.x = Math.round(next.x * 100) / 100
  if (next.y !== undefined)
    viewport.y = Math.round(next.y * 100) / 100
  if (next.zoom !== undefined)
    viewport.zoom = clampZoom(next.zoom)
  emit('viewport-change', { x: viewport.x, y: viewport.y, zoom: viewport.zoom })
}

/** Drag offsets applied on top of a node's declared position, cleared on drop. */
const dragOffset = reactive<Record<string, { dx: number, dy: number }>>({})
const draggingId = ref<string | null>(null)
let suppressNextNodeClick = false
let suppressNextCanvasClick = false

function nodeWidthOf(node: FlowNode): number {
  return node.width ?? props.nodeWidth
}

function nodeX(node: FlowNode): number {
  return node.x + (dragOffset[node.id]?.dx ?? 0)
}

function nodeY(node: FlowNode): number {
  return node.y + (dragOffset[node.id]?.dy ?? 0)
}

function nodeBoxOf(node: FlowNode): NodeBox {
  const height = heights[node.id] ?? 0
  return {
    id: node.id,
    x: nodeX(node),
    y: nodeY(node),
    width: nodeWidthOf(node),
    height,
    cardTopOffset: cardTopOffsets[node.id] ?? 0,
    cardMidOffsetY: cardMidOffsets[node.id] ?? height / 2,
  }
}

const nodeBoxes = computed<NodeBox[]>(() => props.nodes.map(nodeBoxOf))

const nodeBoxById = computed(() => {
  const map = new Map<string, NodeBox>()
  for (const box of nodeBoxes.value)
    map.set(box.id, box)
  return map
})

interface RenderedEdge {
  key: string
  index: number
  edge: FlowEdge
  d: string
  dashed: boolean
  animated: boolean
  pulse: boolean
  active: boolean
  tone: FlowNodeTone
  label?: string
  labelX: number
  labelY: number
  markerType: FlowEdgeMarker
  arrowPath?: string
  dot?: { cx: number, cy: number }
}

const renderedEdges = computed<RenderedEdge[]>(() => {
  const out: RenderedEdge[] = []
  for (let index = 0; index < props.edges.length; index++) {
    const edge = props.edges[index]!
    const from = nodeBoxById.value.get(edge.from)
    const to = nodeBoxById.value.get(edge.to)
    // Skip edges naming an unknown node id so no stray line streaks to (0, 0).
    if (!from || !to)
      continue
    const curveType = edge.type ?? props.edgeType
    const marker = edge.markerEnd ?? props.edgeMarker
    const geom = computeEdgeGeometry(from, to, props.direction, curveType, marker)
    const tone: FlowNodeTone = edge.tone ?? (edge.pulse || edge.active ? 'accent' : 'neutral')
    out.push({
      key: edge.id ?? `${edge.from}\u0000${edge.to}\u0000${index}`,
      index,
      edge,
      d: geom.d,
      dashed: Boolean(edge.dashed || edge.animated),
      animated: Boolean(edge.animated),
      pulse: Boolean(edge.pulse),
      active: Boolean(edge.active),
      tone,
      label: edge.label,
      labelX: geom.labelX,
      labelY: geom.labelY,
      markerType: geom.markerType,
      arrowPath: geom.arrowPath,
      dot: geom.dot,
    })
  }
  return out
})

/** Per-node port metadata so ports appear only on connected sides and inherit active tone. */
const portMetaByNode = computed(() => {
  const map = new Map<string, { inTone: FlowNodeTone | null, outTone: FlowNodeTone | null, inLive: boolean, outLive: boolean }>()
  for (const edge of renderedEdges.value) {
    const live = edge.pulse || edge.animated || edge.active
    const fromEntry = map.get(edge.edge.from) ?? { inTone: null, outTone: null, inLive: false, outLive: false }
    if (!fromEntry.outTone || live)
      fromEntry.outTone = edge.tone
    if (live)
      fromEntry.outLive = true
    map.set(edge.edge.from, fromEntry)

    const toEntry = map.get(edge.edge.to) ?? { inTone: null, outTone: null, inLive: false, outLive: false }
    if (!toEntry.inTone || live)
      toEntry.inTone = edge.tone
    if (live)
      toEntry.inLive = true
    map.set(edge.edge.to, toEntry)
  }
  return map
})

const activeSnapGuides = computed(() => {
  if (!props.snapGuides || !draggingId.value)
    return []
  const active = nodeBoxById.value.get(draggingId.value)
  if (!active)
    return []
  return computeSnapGuides(active, nodeBoxes.value)
})

const minimapData = computed(() => {
  if (!props.minimap)
    return null
  return computeMinimapProjection(
    nodeBoxes.value,
    canvasWidth.value || 640,
    canvasHeight.value || props.height,
    viewport,
  )
})

function hasPorts(node: FlowNode): boolean {
  return node.ports ?? props.ports
}

function isSelected(node: FlowNode): boolean {
  return Boolean(node.selected || (props.selectedId !== null && props.selectedId === node.id))
}

function hasDefaultCardContent(node: FlowNode): boolean {
  return Boolean(node.title || node.description || node.meta || node.badge)
}

function canDrag(node: FlowNode): boolean {
  return props.draggable && (node.draggable ?? true)
}

function onNodePointerDown(event: PointerEvent, node: FlowNode): void {
  if (!canDrag(node) || event.button !== 0)
    return
  // Keep canvas panning from also starting on a node drag.
  event.stopPropagation()

  const startX = event.clientX
  const startY = event.clientY
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)
  draggingId.value = node.id
  let moved = false

  const move = (moveEvent: PointerEvent): void => {
    const rawDx = moveEvent.clientX - startX
    const rawDy = moveEvent.clientY - startY
    if (!moved && Math.hypot(rawDx, rawDy) > DRAG_CLICK_THRESHOLD)
      moved = true
    const scale = Math.max(viewport.zoom, 0.1)
    let dx = rawDx / scale
    let dy = rawDy / scale
    if (props.snap) {
      dx = Math.round(dx / props.grid) * props.grid
      dy = Math.round(dy / props.grid) * props.grid
    }
    dragOffset[node.id] = { dx, dy }
  }

  const up = (): void => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
    const offset = dragOffset[node.id]
    draggingId.value = null
    delete dragOffset[node.id]
    if (moved) {
      suppressNextNodeClick = true
      setTimeout(() => {
        suppressNextNodeClick = false
      }, 0)
    }
    // Report the landing position whenever a pointermove happened so controlled
    // hosts always stay in step with what was drawn.
    if (offset)
      emit('node-move', { id: node.id, x: Math.round(node.x + offset.dx), y: Math.round(node.y + offset.dy) })
  }

  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}

function onCanvasPointerDown(event: PointerEvent): void {
  if (!props.pannable || event.button !== 0)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('.tx-bui-flowchart__node, .tx-bui-flowchart__hud, .tx-bui-flowchart__minimap, .tx-bui-flowchart__edge-label'))
    return

  const startX = event.clientX
  const startY = event.clientY
  const originX = viewport.x
  const originY = viewport.y
  const host = event.currentTarget as HTMLElement
  host.setPointerCapture?.(event.pointerId)
  isPanning.value = true
  let moved = false

  const move = (moveEvent: PointerEvent): void => {
    const dx = moveEvent.clientX - startX
    const dy = moveEvent.clientY - startY
    if (!moved && Math.hypot(dx, dy) > DRAG_CLICK_THRESHOLD)
      moved = true
    updateViewport({ x: originX + dx, y: originY + dy })
  }

  const up = (): void => {
    host.removeEventListener('pointermove', move)
    host.removeEventListener('pointerup', up)
    host.removeEventListener('pointercancel', up)
    isPanning.value = false
    if (moved) {
      suppressNextCanvasClick = true
      setTimeout(() => {
        suppressNextCanvasClick = false
      }, 0)
    }
  }

  host.addEventListener('pointermove', move)
  host.addEventListener('pointerup', up)
  host.addEventListener('pointercancel', up)
}

function onCanvasWheel(event: WheelEvent): void {
  if (!props.zoomable)
    return
  // Only hijack pinch / Ctrl+wheel / Cmd+wheel so ordinary vertical scrolling on
  // documentation or dashboard pages is never trapped by the canvas.
  if (!event.ctrlKey && !event.metaKey)
    return
  event.preventDefault()

  const host = canvasEl.value
  if (!host)
    return
  const rect = host.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top

  const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
  const nextZoom = clampZoom(viewport.zoom + delta)
  if (nextZoom === viewport.zoom)
    return

  // Zoom around the pointer so the item under the cursor stays stationary.
  const worldX = (pointerX - viewport.x) / viewport.zoom
  const worldY = (pointerY - viewport.y) / viewport.zoom
  updateViewport({
    zoom: nextZoom,
    x: pointerX - worldX * nextZoom,
    y: pointerY - worldY * nextZoom,
  })
}

function onCanvasClick(event: MouseEvent): void {
  if (suppressNextCanvasClick)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('.tx-bui-flowchart__node, .tx-bui-flowchart__hud, .tx-bui-flowchart__minimap, .tx-bui-flowchart__edge-label'))
    return
  emit('canvas-click')
}

function onActivateNode(node: FlowNode): void {
  if (suppressNextNodeClick)
    return
  emit('node-click', { id: node.id, node })
}

function onNodeKeydown(event: KeyboardEvent, node: FlowNode): void {
  if (event.target !== event.currentTarget)
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  emit('node-click', { id: node.id, node })
}

function onEdgeActivate(item: RenderedEdge): void {
  emit('edge-click', { edge: item.edge, index: item.index })
}

function onMinimapClick(event: MouseEvent): void {
  const data = minimapData.value
  const svg = event.currentTarget as SVGSVGElement | null
  if (!data || !svg)
    return
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return
  const ratioX = (event.clientX - rect.left) / rect.width
  const ratioY = (event.clientY - rect.top) / rect.height
  const targetX = data.minX + ratioX * data.spanX
  const targetY = data.minY + ratioY * data.spanY
  const w = canvasWidth.value || 640
  const h = canvasHeight.value || props.height
  updateViewport({
    x: w / 2 - targetX * viewport.zoom,
    y: h / 2 - targetY * viewport.zoom,
  })
}

function zoomAtCenter(delta: number): void {
  const nextZoom = clampZoom(viewport.zoom + delta)
  if (nextZoom === viewport.zoom)
    return
  const w = canvasWidth.value || 640
  const h = canvasHeight.value || props.height
  const worldX = (w / 2 - viewport.x) / viewport.zoom
  const worldY = (h / 2 - viewport.y) / viewport.zoom
  updateViewport({
    zoom: nextZoom,
    x: w / 2 - worldX * nextZoom,
    y: h / 2 - worldY * nextZoom,
  })
}

function zoomIn(): void {
  zoomAtCenter(ZOOM_STEP)
}

function zoomOut(): void {
  zoomAtCenter(-ZOOM_STEP)
}

function resetView(): void {
  updateViewport({ x: 0, y: 0, zoom: 1 })
}

function fitView(padding = 36): void {
  const w = canvasWidth.value || canvasEl.value?.clientWidth || 640
  const h = canvasHeight.value || props.height
  const next = computeFitViewport(nodeBoxes.value, w, h, props.minZoom, props.maxZoom, padding)
  updateViewport(next)
}

function centerOn(nodeId: string): void {
  const box = nodeBoxById.value.get(nodeId)
  if (!box)
    return
  const w = canvasWidth.value || 640
  const h = canvasHeight.value || props.height
  const cy = box.y + Math.max(box.height, 64) / 2
  updateViewport({
    x: w / 2 - box.x * viewport.zoom,
    y: h / 2 - cy * viewport.zoom,
  })
}

function getViewport(): FlowViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
}

defineExpose({
  fitView,
  zoomIn,
  zoomOut,
  resetView,
  centerOn,
  getViewport,
})

const hasViewportTransform = computed(() =>
  viewport.x !== 0 || viewport.y !== 0 || viewport.zoom !== 1,
)

const canvasStyle = computed(() => {
  const scaledGrid = Math.max(6, Math.round(props.grid * viewport.zoom * 100) / 100)
  return {
    '--tx-bui-flow-grid': `${props.grid}px`,
    '--tx-bui-flow-grid-scaled': `${scaledGrid}px`,
    '--tx-bui-flow-bg-x': `${viewport.x}px`,
    '--tx-bui-flow-bg-y': `${viewport.y}px`,
    'height': `${props.height}px`,
  }
})

const stageStyle = computed(() => {
  if (!hasViewportTransform.value)
    return undefined
  return {
    transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
  }
})

const zoomPercent = computed(() => `${Math.round(viewport.zoom * 100)}%`)

function minimapNodeTone(node: FlowNode): FlowNodeTone {
  if (node.status === 'error')
    return 'red'
  if (node.status === 'success')
    return 'green'
  if (node.status === 'warning')
    return 'orange'
  if (node.status === 'running' || node.status === 'active')
    return 'accent'
  return node.tone ?? 'neutral'
}
</script>

<template>
  <div
    ref="canvasEl"
    class="tx-bui-flowchart"
    :class="[
      `tx-bui-flowchart--bg-${resolvedBackground}`,
      `tx-bui-flowchart--${direction}`,
      {
        'is-dotted': resolvedBackground === 'dots',
        'is-pannable': pannable,
        'is-panning': isPanning,
      },
    ]"
    :style="canvasStyle"
    role="group"
    :aria-label="ariaLabel"
    @pointerdown="onCanvasPointerDown"
    @wheel="onCanvasWheel"
    @click="onCanvasClick"
  >
    <div class="tx-bui-flowchart__stage" :style="stageStyle">
      <!-- Connectors sit under the cards so a card's ring shadow covers the line's
           endpoint rather than the line crossing the card's corner. -->
      <svg class="tx-bui-flowchart__edges" aria-hidden="true">
        <!-- Alignment snap guides shown only while dragging in line with peers -->
        <line
          v-for="guide in activeSnapGuides"
          :key="`${guide.axis}:${guide.position}`"
          class="tx-bui-flowchart__guide"
          :x1="guide.axis === 'x' ? guide.position : guide.from"
          :y1="guide.axis === 'x' ? guide.from : guide.position"
          :x2="guide.axis === 'x' ? guide.position : guide.to"
          :y2="guide.axis === 'x' ? guide.to : guide.position"
        />

        <g
          v-for="item in renderedEdges"
          :key="item.key"
          class="tx-bui-flowchart__edge-group"
          :class="[
            `tx-bui-flowchart__edge-group--${item.tone}`,
            {
              'is-active': item.active,
              'is-hovered': hoveredEdgeKey === item.key,
              'is-pulse': item.pulse,
            },
          ]"
        >
          <!-- Base connector path -->
          <path
            class="tx-bui-flowchart__edge"
            :class="[
              `tx-bui-flowchart__edge--${item.tone}`,
              {
                'is-dashed': item.dashed,
                'is-animated': item.animated,
                'is-active': item.active,
                'is-pulse': item.pulse,
              },
            ]"
            :d="item.d"
          />

          <!-- Travelling signal beam (halo + core) using pathLength=100 so speed
               stays uniform across any curve shape and never clips on straight lines. -->
          <path
            v-if="item.pulse"
            class="tx-bui-flowchart__edge-glow"
            :class="`tx-bui-flowchart__edge-glow--${item.tone}`"
            :d="item.d"
            pathLength="100"
          />
          <path
            v-if="item.pulse"
            class="tx-bui-flowchart__edge-beam"
            :class="`tx-bui-flowchart__edge-beam--${item.tone}`"
            :d="item.d"
            pathLength="100"
          />

          <!-- Endpoint markers (drawn directly to avoid SVG <defs> id clashes) -->
          <path
            v-if="item.markerType === 'arrow' && item.arrowPath"
            class="tx-bui-flowchart__edge-arrow"
            :class="`tx-bui-flowchart__edge-arrow--${item.tone}`"
            :d="item.arrowPath"
          />
          <circle
            v-else-if="item.markerType === 'dot' && item.dot"
            class="tx-bui-flowchart__edge-dot"
            :class="`tx-bui-flowchart__edge-dot--${item.tone}`"
            :cx="item.dot.cx"
            :cy="item.dot.cy"
            r="3"
          />

          <!-- Wide invisible hit path for hover emphasis & edge-click -->
          <path
            class="tx-bui-flowchart__edge-hit"
            :d="item.d"
            @mouseenter="hoveredEdgeKey = item.key"
            @mouseleave="hoveredEdgeKey = null"
            @click.stop="onEdgeActivate(item)"
          />
        </g>
      </svg>

      <!-- Midpoint edge label pills rendered in HTML for crisp type & BUI rings -->
      <template v-for="item in renderedEdges" :key="`lbl-${item.key}`">
        <button
          v-if="item.label || $slots['edge-label']"
          type="button"
          class="tx-bui-flowchart__edge-label"
          :class="[
            `tx-bui-flowchart__edge-label--${item.tone}`,
            { 'is-active': item.active || item.pulse || hoveredEdgeKey === item.key },
          ]"
          :style="{
            left: `${item.labelX}px`,
            top: `${item.labelY}px`,
          }"
          @mouseenter="hoveredEdgeKey = item.key"
          @mouseleave="hoveredEdgeKey = null"
          @click.stop="onEdgeActivate(item)"
        >
          <slot name="edge-label" :edge="item.edge" :index="item.index">
            {{ item.label }}
          </slot>
        </button>
      </template>

      <div
        v-for="(node, index) in nodes"
        :key="node.id"
        :ref="el => observeNode(el as Element | null, node.id)"
        :data-flow-node="node.id"
        class="tx-bui-flowchart__node"
        :class="[
          node.status && node.status !== 'idle' ? `is-status-${node.status}` : undefined,
          {
            'is-draggable': canDrag(node),
            'is-dragging': draggingId === node.id,
            'is-selected': isSelected(node),
          },
        ]"
        :style="{
          left: `${nodeX(node)}px`,
          top: `${nodeY(node)}px`,
          width: `${nodeWidthOf(node)}px`,
        }"
        tabindex="0"
        :aria-selected="isSelected(node) ? 'true' : undefined"
        @pointerdown="onNodePointerDown($event, node)"
        @click="onActivateNode(node)"
        @keydown="onNodeKeydown($event, node)"
      >
        <slot name="label" :node="node">
          <span
            v-if="node.label"
            class="tx-bui-flowchart__chip"
            :class="`tx-bui-flowchart__chip--${node.tone ?? 'neutral'}`"
          >{{ node.label }}</span>
        </slot>

        <div class="tx-bui-flowchart__card">
          <!-- Incoming & outgoing anchor ports -->
          <span
            v-if="hasPorts(node) && portMetaByNode.get(node.id)?.inTone"
            class="tx-bui-flowchart__port tx-bui-flowchart__port--in"
            :class="[
              `tx-bui-flowchart__port--${portMetaByNode.get(node.id)?.inTone}`,
              { 'is-live': portMetaByNode.get(node.id)?.inLive },
            ]"
            aria-hidden="true"
          />
          <span
            v-if="hasPorts(node) && portMetaByNode.get(node.id)?.outTone"
            class="tx-bui-flowchart__port tx-bui-flowchart__port--out"
            :class="[
              `tx-bui-flowchart__port--${portMetaByNode.get(node.id)?.outTone}`,
              { 'is-live': portMetaByNode.get(node.id)?.outLive },
            ]"
            aria-hidden="true"
          />

          <slot name="node" :node="node" :index="index">
            <div v-if="hasDefaultCardContent(node)" class="tx-bui-flowchart__body">
              <div class="tx-bui-flowchart__head">
                <span
                  v-if="node.status && node.status !== 'idle'"
                  class="tx-bui-flowchart__status-dot"
                  :class="`is-${node.status}`"
                  aria-hidden="true"
                />
                <strong v-if="node.title" class="tx-bui-flowchart__title">{{ node.title }}</strong>
                <span
                  v-if="node.badge"
                  class="tx-bui-flowchart__badge"
                  :class="`tx-bui-flowchart__badge--${node.tone ?? 'neutral'}`"
                >{{ node.badge }}</span>
              </div>
              <small v-if="node.description" class="tx-bui-flowchart__desc">{{ node.description }}</small>
              <span v-if="node.meta" class="tx-bui-flowchart__meta">{{ node.meta }}</span>
            </div>
          </slot>
        </div>
      </div>
    </div>

    <div v-if="nodes.length === 0 && $slots.empty" class="tx-bui-flowchart__empty">
      <slot name="empty" />
    </div>

    <!-- Live interactive SVG minimap -->
    <div
      v-if="minimap && minimapData"
      class="tx-bui-flowchart__minimap"
      role="region"
      :aria-label="hudLabels.minimap"
    >
      <svg
        class="tx-bui-flowchart__minimap-svg"
        :viewBox="minimapData.viewBox"
        preserveAspectRatio="xMidYMid meet"
        @click.stop="onMinimapClick"
      >
        <path
          v-for="item in renderedEdges"
          :key="`mm-e-${item.key}`"
          class="tx-bui-flowchart__minimap-edge"
          :class="`tx-bui-flowchart__minimap-edge--${item.tone}`"
          :d="item.d"
        />
        <rect
          v-for="node in nodes"
          :key="`mm-n-${node.id}`"
          class="tx-bui-flowchart__minimap-node"
          :class="[
            `tx-bui-flowchart__minimap-node--${minimapNodeTone(node)}`,
            { 'is-selected': isSelected(node) },
          ]"
          :x="nodeX(node) - nodeWidthOf(node) / 2"
          :y="nodeY(node)"
          :width="nodeWidthOf(node)"
          :height="Math.max(heights[node.id] ?? 68, 44)"
          rx="14"
        />
        <rect
          class="tx-bui-flowchart__minimap-viewport"
          :x="minimapData.viewportRect.x"
          :y="minimapData.viewportRect.y"
          :width="minimapData.viewportRect.width"
          :height="minimapData.viewportRect.height"
          rx="8"
        />
      </svg>
    </div>

    <!-- Floating HUD zoom & fit controls -->
    <div v-if="controls || $slots.toolbar" class="tx-bui-flowchart__hud">
      <slot
        name="toolbar"
        :zoom="viewport.zoom"
        :zoom-in="zoomIn"
        :zoom-out="zoomOut"
        :fit-view="fitView"
        :reset-view="resetView"
      >
        <button
          type="button"
          class="tx-bui-flowchart__hud-btn"
          :aria-label="hudLabels.zoomOut"
          :disabled="viewport.zoom <= minZoom"
          @click.stop="zoomOut"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
            <path d="M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <button
          type="button"
          class="tx-bui-flowchart__hud-btn tx-bui-flowchart__hud-readout"
          :aria-label="hudLabels.resetView"
          @click.stop="resetView"
        >
          {{ zoomPercent }}
        </button>
        <button
          type="button"
          class="tx-bui-flowchart__hud-btn"
          :aria-label="hudLabels.zoomIn"
          :disabled="viewport.zoom >= maxZoom"
          @click.stop="zoomIn"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
            <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <span class="tx-bui-flowchart__hud-sep" aria-hidden="true" />
        <button
          type="button"
          class="tx-bui-flowchart__hud-btn"
          :aria-label="hudLabels.fitView"
          @click.stop="fitView()"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
            <path d="M2.5 5.5v-2a1 1 0 0 1 1-1h2M10.5 2.5h2a1 1 0 0 1 1 1v2M13.5 10.5v2a1 1 0 0 1-1 1h-2M5.5 13.5h-2a1 1 0 0 1-1-1v-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </button>
      </slot>
    </div>
  </div>
</template>

<style lang="scss">
// Ring shadows, never `border` — the BUI family's double-line trap.
@keyframes tx-bui-flow-march {
  to {
    stroke-dashoffset: -22;
  }
}

@keyframes tx-bui-flow-beam {
  0% {
    stroke-dashoffset: 100;
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    stroke-dashoffset: -18;
    opacity: 0;
  }
}

@keyframes tx-bui-flow-running-halo {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(1);
  }
  50% {
    opacity: 0.95;
    transform: scale(1.012);
  }
}

.tx-bui-flowchart {
  position: relative;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: var(--tx-bui-radius-card, 10px);
  background-color: var(--tx-bui-page, #fafafb);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  user-select: none;

  &.is-pannable {
    cursor: grab;
    touch-action: none;
  }

  &.is-panning {
    cursor: grabbing;
  }

  // The dot sits at 1px with its falloff at 1.25px: a hard 1px stop aliases into
  // a square at the grid pitch, and anything past ~1.5px reads as a visible
  // texture competing with the cards.
  &--bg-dots,
  &.is-dotted {
    background-image: radial-gradient(
      var(--tx-bui-line-strong, #e0e2e5) 1px,
      transparent 1.25px
    );
    background-size: var(--tx-bui-flow-grid-scaled, var(--tx-bui-flow-grid, 22px))
      var(--tx-bui-flow-grid-scaled, var(--tx-bui-flow-grid, 22px));
    background-position: var(--tx-bui-flow-bg-x, 0px) var(--tx-bui-flow-bg-y, 0px);
  }

  &--bg-lines {
    background-image:
      linear-gradient(to right, var(--tx-bui-line, #ecedef) 1px, transparent 1px),
      linear-gradient(to bottom, var(--tx-bui-line, #ecedef) 1px, transparent 1px);
    background-size: var(--tx-bui-flow-grid-scaled, var(--tx-bui-flow-grid, 22px))
      var(--tx-bui-flow-grid-scaled, var(--tx-bui-flow-grid, 22px));
    background-position: var(--tx-bui-flow-bg-x, 0px) var(--tx-bui-flow-bg-y, 0px);
  }

  &--bg-cross {
    background-image:
      radial-gradient(circle at 50% 50%, transparent 3.5px, var(--tx-bui-page, #fafafb) 4px),
      linear-gradient(to right, transparent calc(50% - 0.5px), var(--tx-bui-line-strong, #e0e2e5) calc(50% - 0.5px), var(--tx-bui-line-strong, #e0e2e5) calc(50% + 0.5px), transparent calc(50% + 0.5px)),
      linear-gradient(to bottom, transparent calc(50% - 0.5px), var(--tx-bui-line-strong, #e0e2e5) calc(50% - 0.5px), var(--tx-bui-line-strong, #e0e2e5) calc(50% + 0.5px), transparent calc(50% + 0.5px));
    background-size: var(--tx-bui-flow-grid-scaled, var(--tx-bui-flow-grid, 22px))
      var(--tx-bui-flow-grid-scaled, var(--tx-bui-flow-grid, 22px));
    background-position: var(--tx-bui-flow-bg-x, 0px) var(--tx-bui-flow-bg-y, 0px);
  }

  &--bg-none {
    background-image: none;
  }

  &__stage {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
  }

  &__edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  &__guide {
    stroke: var(--tx-bui-accent, #0285ff);
    stroke-width: 1px;
    stroke-dasharray: 3 3;
    opacity: 0.55;
  }

  &__edge-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14px;
    pointer-events: stroke;
    cursor: pointer;
  }

  &__edge {
    fill: none;
    stroke: var(--tx-bui-line-strong, #e0e2e5);
    stroke-width: 1.35px;
    stroke-linecap: round;
    stroke-linejoin: round;

    &--accent { stroke: var(--tx-bui-accent, #0285ff); }
    &--violet { stroke: var(--tx-bui-violet, #6b3fd4); }
    &--orange { stroke: var(--tx-bui-orange, #ef720c); }
    &--green { stroke: var(--tx-bui-green, #189a4d); }
    &--red { stroke: var(--tx-bui-red, #e3474c); }

    &.is-dashed {
      stroke-dasharray: 5 5;
    }

    &.is-active,
    &.is-pulse {
      stroke-width: 1.75px;
    }
  }

  &__edge-group.is-hovered &__edge {
    stroke-width: 2px;
  }

  &__edge-glow,
  &__edge-beam {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  &__edge-glow {
    stroke: var(--tx-bui-accent, #0285ff);
    stroke-width: 6px;
    stroke-dasharray: 18 82;
    opacity: 0.24;

    &--violet { stroke: var(--tx-bui-violet, #6b3fd4); }
    &--orange { stroke: var(--tx-bui-orange, #ef720c); }
    &--green { stroke: var(--tx-bui-green, #189a4d); }
    &--red { stroke: var(--tx-bui-red, #e3474c); }
    &--neutral { stroke: var(--tx-bui-ink-2, #62656b); }
  }

  &__edge-beam {
    stroke: var(--tx-bui-accent, #0285ff);
    stroke-width: 2.4px;
    stroke-dasharray: 16 84;
    opacity: 0.92;

    &--violet { stroke: var(--tx-bui-violet, #6b3fd4); }
    &--orange { stroke: var(--tx-bui-orange, #ef720c); }
    &--green { stroke: var(--tx-bui-green, #189a4d); }
    &--red { stroke: var(--tx-bui-red, #e3474c); }
    &--neutral { stroke: var(--tx-bui-ink, #1f2124); }
  }

  &__edge-arrow {
    fill: none;
    stroke: var(--tx-bui-line-strong, #e0e2e5);
    stroke-width: 1.5px;
    stroke-linecap: round;
    stroke-linejoin: round;

    &--accent { stroke: var(--tx-bui-accent, #0285ff); }
    &--violet { stroke: var(--tx-bui-violet, #6b3fd4); }
    &--orange { stroke: var(--tx-bui-orange, #ef720c); }
    &--green { stroke: var(--tx-bui-green, #189a4d); }
    &--red { stroke: var(--tx-bui-red, #e3474c); }
  }

  &__edge-dot {
    fill: var(--tx-bui-line-strong, #e0e2e5);

    &--accent { fill: var(--tx-bui-accent, #0285ff); }
    &--violet { fill: var(--tx-bui-violet, #6b3fd4); }
    &--orange { fill: var(--tx-bui-orange, #ef720c); }
    &--green { fill: var(--tx-bui-green, #189a4d); }
    &--red { fill: var(--tx-bui-red, #e3474c); }
  }

  &__edge-label {
    position: absolute;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    background-color: var(--tx-bui-surface, #fff);
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 1px 2px 2px #1018280d);
    color: var(--tx-bui-ink-2, #62656b);
    font-family: inherit;
    font-size: 11px;
    font-weight: var(--tx-font-weight-medium, 500);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
      background-color: var(--tx-bui-hover, #f4f5f6);
      color: var(--tx-bui-ink, #1f2124);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: 2px;
    }

    &--accent {
      color: var(--tx-bui-accent-ink, #0170dd);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 36%, transparent), 0 1px 3px #1018280d;
    }

    &--violet {
      color: var(--tx-bui-violet, #6b3fd4);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-violet, #6b3fd4) 36%, transparent), 0 1px 3px #1018280d;
    }

    &--orange {
      color: var(--tx-bui-orange, #ef720c);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-orange, #ef720c) 36%, transparent), 0 1px 3px #1018280d;
    }

    &--green {
      color: var(--tx-bui-green, #189a4d);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-green, #189a4d) 36%, transparent), 0 1px 3px #1018280d;
    }

    &--red {
      color: var(--tx-bui-red, #e3474c);
      box-shadow: 0 0 0 1px color-mix(in oklab, var(--tx-bui-red, #e3474c) 36%, transparent), 0 1px 3px #1018280d;
    }
  }

  &__node {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    // Nodes are positioned by their horizontal centre, so `left` is the centre
    // line and the card is pulled back over it.
    transform: translateX(-50%);

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: 4px;
      border-radius: 4px;
    }

    &.is-draggable {
      cursor: grab;
      // Without this a touch drag scrolls the page instead of moving the node.
      touch-action: none;
    }

    &.is-dragging {
      cursor: grabbing;
      z-index: 6;

      .tx-bui-flowchart__card {
        box-shadow: var(--tx-bui-shadow-overlay, 0 0 0 1px #ecedef, 4px 8px 28px #0001);
        transform: scale(1.015);
      }
    }

    &.is-selected .tx-bui-flowchart__card {
      box-shadow:
        0 0 0 2px var(--tx-bui-accent, #0285ff),
        var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 2px 4px 10px #0000000b);
    }

    &.is-status-active .tx-bui-flowchart__card {
      box-shadow:
        0 0 0 1.5px var(--tx-bui-accent, #0285ff),
        var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 2px 4px 10px #0000000b);
    }

    &.is-status-running .tx-bui-flowchart__card {
      box-shadow:
        0 0 0 1.5px var(--tx-bui-accent, #0285ff),
        0 0 0 5px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 16%, transparent);

      &::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 21px;
        box-shadow: 0 0 0 2px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 42%, transparent);
        pointer-events: none;
      }
    }

    &.is-status-success .tx-bui-flowchart__card {
      box-shadow:
        0 0 0 1.5px var(--tx-bui-green, #189a4d),
        0 0 0 4px color-mix(in oklab, var(--tx-bui-green, #189a4d) 12%, transparent);
    }

    &.is-status-warning .tx-bui-flowchart__card {
      box-shadow:
        0 0 0 1.5px var(--tx-bui-orange, #ef720c),
        0 0 0 4px color-mix(in oklab, var(--tx-bui-orange, #ef720c) 12%, transparent);
    }

    &.is-status-error .tx-bui-flowchart__card {
      box-shadow:
        0 0 0 1.5px var(--tx-bui-red, #e3474c),
        0 0 0 5px color-mix(in oklab, var(--tx-bui-red, #e3474c) 16%, transparent);
    }
  }

  // 11.5px is the family's density language, not a rounding slip.
  &__chip {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--tx-bui-radius-chip, 6px);
    font-size: 11.5px;
    font-weight: var(--tx-font-weight-medium, 500);
    line-height: 1;
    white-space: nowrap;

    &--neutral {
      background-color: var(--tx-bui-hover-2, #e7e9eb);
      color: var(--tx-bui-ink-2, #62656b);
    }

    &--violet {
      background-color: var(--tx-bui-violet-tint, #ede4fb);
      color: var(--tx-bui-violet, #6b3fd4);
    }

    &--orange {
      background-color: var(--tx-bui-orange-tint, #fdf1e5);
      color: var(--tx-bui-orange, #ef720c);
    }

    &--accent {
      background-color: var(--tx-bui-accent-tint, #e9f3ff);
      color: var(--tx-bui-accent-ink, #0170dd);
    }

    &--green {
      background-color: var(--tx-bui-green-tint, #e8f5ed);
      color: var(--tx-bui-green, #189a4d);
    }

    &--red {
      background-color: var(--tx-bui-red-tint, #fcecec);
      color: var(--tx-bui-red, #e3474c);
    }
  }

  &__card {
    position: relative;
    width: 100%;
    box-sizing: border-box;
    border-radius: 18px;
    background-color: var(--tx-bui-surface, #fff);
    box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 1px 2px 2px #1018280a, 2px 4px 6px #10182808);
    transition: transform 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      box-shadow 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  // Connection port handles positioned on card edges by flow direction.
  &__port {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--tx-bui-surface, #fff);
    box-shadow: 0 0 0 1.5px var(--tx-bui-line-strong, #e0e2e5);
    pointer-events: none;
    z-index: 3;

    &--accent { box-shadow: 0 0 0 1.5px var(--tx-bui-accent, #0285ff); }
    &--violet { box-shadow: 0 0 0 1.5px var(--tx-bui-violet, #6b3fd4); }
    &--orange { box-shadow: 0 0 0 1.5px var(--tx-bui-orange, #ef720c); }
    &--green { box-shadow: 0 0 0 1.5px var(--tx-bui-green, #189a4d); }
    &--red { box-shadow: 0 0 0 1.5px var(--tx-bui-red, #e3474c); }

    &.is-live {
      background-color: var(--tx-bui-accent, #0285ff);
      box-shadow:
        0 0 0 2px var(--tx-bui-surface, #fff),
        0 0 0 3.5px color-mix(in oklab, var(--tx-bui-accent, #0285ff) 45%, transparent);

      &.tx-bui-flowchart__port--violet { background-color: var(--tx-bui-violet, #6b3fd4); }
      &.tx-bui-flowchart__port--orange { background-color: var(--tx-bui-orange, #ef720c); }
      &.tx-bui-flowchart__port--green { background-color: var(--tx-bui-green, #189a4d); }
      &.tx-bui-flowchart__port--red { background-color: var(--tx-bui-red, #e3474c); }
    }
  }

  &--vertical &__port--in {
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
  }

  &--vertical &__port--out {
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
  }

  &--horizontal &__port--in {
    left: -4px;
    top: 50%;
    transform: translateY(-50%);
  }

  &--horizontal &__port--out {
    right: -4px;
    top: 50%;
    transform: translateY(-50%);
  }

  // Optional structured default card layout when `#node` slot is omitted.
  &__body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 11px 13px;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  &__status-dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: var(--tx-bui-ink-3, #9a9da3);

    &.is-active,
    &.is-running { background-color: var(--tx-bui-accent, #0285ff); }
    &.is-success { background-color: var(--tx-bui-green, #189a4d); }
    &.is-warning { background-color: var(--tx-bui-orange, #ef720c); }
    &.is-error { background-color: var(--tx-bui-red, #e3474c); }
  }

  &__title {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--tx-bui-ink, #1f2124);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    height: 19px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    background-color: var(--tx-bui-hover, #f4f5f6);
    color: var(--tx-bui-ink-2, #62656b);

    &--accent { background-color: var(--tx-bui-accent-tint, #e9f3ff); color: var(--tx-bui-accent-ink, #0170dd); }
    &--violet { background-color: var(--tx-bui-violet-tint, #ede4fb); color: var(--tx-bui-violet, #6b3fd4); }
    &--orange { background-color: var(--tx-bui-orange-tint, #fdf1e5); color: var(--tx-bui-orange, #ef720c); }
    &--green { background-color: var(--tx-bui-green-tint, #e8f5ed); color: var(--tx-bui-green, #189a4d); }
    &--red { background-color: var(--tx-bui-red-tint, #fcecec); color: var(--tx-bui-red, #e3474c); }
  }

  &__desc {
    font-size: 12px;
    line-height: 1.4;
    color: var(--tx-bui-ink-2, #62656b);
  }

  &__meta {
    margin-top: 2px;
    font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  &__empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 13px;
  }

  // Minimap
  &__minimap {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 8;
    width: 136px;
    height: 86px;
    padding: 5px;
    box-sizing: border-box;
    border-radius: var(--tx-bui-radius-card, 10px);
    background-color: color-mix(in oklab, var(--tx-bui-surface, #fff) 92%, transparent);
    box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 2px 4px 10px #0000000b);
    backdrop-filter: blur(8px);
  }

  &__minimap-svg {
    display: block;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  &__minimap-edge {
    fill: none;
    stroke: var(--tx-bui-line-strong, #e0e2e5);
    stroke-width: 1.25px;
    vector-effect: non-scaling-stroke;

    &--accent { stroke: var(--tx-bui-accent, #0285ff); }
    &--violet { stroke: var(--tx-bui-violet, #6b3fd4); }
    &--orange { stroke: var(--tx-bui-orange, #ef720c); }
    &--green { stroke: var(--tx-bui-green, #189a4d); }
    &--red { stroke: var(--tx-bui-red, #e3474c); }
  }

  &__minimap-node {
    fill: var(--tx-bui-hover-2, #e7e9eb);
    stroke: var(--tx-bui-line-strong, #e0e2e5);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;

    &--accent { fill: color-mix(in oklab, var(--tx-bui-accent, #0285ff) 45%, var(--tx-bui-surface, #fff)); }
    &--violet { fill: color-mix(in oklab, var(--tx-bui-violet, #6b3fd4) 45%, var(--tx-bui-surface, #fff)); }
    &--orange { fill: color-mix(in oklab, var(--tx-bui-orange, #ef720c) 45%, var(--tx-bui-surface, #fff)); }
    &--green { fill: color-mix(in oklab, var(--tx-bui-green, #189a4d) 45%, var(--tx-bui-surface, #fff)); }
    &--red { fill: color-mix(in oklab, var(--tx-bui-red, #e3474c) 45%, var(--tx-bui-surface, #fff)); }

    &.is-selected {
      stroke: var(--tx-bui-accent, #0285ff);
      stroke-width: 1.75px;
    }
  }

  &__minimap-viewport {
    fill: color-mix(in oklab, var(--tx-bui-accent, #0285ff) 10%, transparent);
    stroke: var(--tx-bui-accent, #0285ff);
    stroke-width: 1.25px;
    vector-effect: non-scaling-stroke;
  }

  // Floating HUD controls
  &__hud {
    position: absolute;
    right: 12px;
    bottom: 12px;
    z-index: 8;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: var(--tx-bui-radius-control, 8px);
    background-color: color-mix(in oklab, var(--tx-bui-surface, #fff) 92%, transparent);
    box-shadow: var(--tx-bui-shadow-raised, 0 0 0 1px #ecedef, 2px 4px 10px #0000000b);
    backdrop-filter: blur(8px);
  }

  &__hud-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    height: 26px;
    padding: 0 5px;
    border: 0;
    border-radius: 6px;
    background-color: transparent;
    color: var(--tx-bui-ink-2, #62656b);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: pointer;

    &:hover:not(:disabled) {
      background-color: var(--tx-bui-hover, #f4f5f6);
      color: var(--tx-bui-ink, #1f2124);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: -1px;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__hud-readout {
    min-width: 44px;
    color: var(--tx-bui-ink, #1f2124);
  }

  &__hud-sep {
    width: 1px;
    height: 14px;
    margin: 0 2px;
    background-color: var(--tx-bui-line, #ecedef);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-bui-flowchart__edge.is-animated {
    animation: tx-bui-flow-march 0.9s linear infinite;
  }

  .tx-bui-flowchart__edge-glow {
    animation: tx-bui-flow-beam 1.9s cubic-bezier(0.35, 0, 0.25, 1) infinite;
  }

  .tx-bui-flowchart__edge-beam {
    animation: tx-bui-flow-beam 1.9s cubic-bezier(0.35, 0, 0.25, 1) infinite;
  }

  .tx-bui-flowchart__node.is-status-running .tx-bui-flowchart__card::after {
    animation: tx-bui-flow-running-halo 1.8s ease-in-out infinite;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-bui-flowchart__card {
    transition: none;
  }

  .tx-bui-flowchart__node.is-dragging .tx-bui-flowchart__card {
    transform: none;
  }

  .tx-bui-flowchart__edge-glow,
  .tx-bui-flowchart__edge-beam {
    stroke-dasharray: none;
    opacity: 0.35;
  }
}
</style>

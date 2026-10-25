<script setup lang="ts">
// API surface modeled on Cloudflare kumo's SankeyChart (MIT); layout by
// d3-sankey, rendered as SVG. Tooltip content is a slot (VNodes), not an HTML
// string — kumo's XSS-escaping surface is deliberately not carried over.

import type { PositionedSankeyLink, PositionedSankeyNode } from './layout'
import type { SankeyChartProps, SankeyLabels, SankeyLinkData, SankeyNodeData, SankeyTooltipParams } from './types'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useId, watch } from 'vue'
import { stepSpring } from '../../../../../../utils/animation/spring'
import { createFrameLoop } from '../../../../../../utils/frame-loop'
import { responseSpring } from '../../../../../../utils/gesture'
import { useReducedMotion } from '../../../../../../utils/use-reduced-motion'
import { nextUid } from '../../core/uid'
import { ChartPalette } from '../../palette'
import { placeTooltip } from '../../tooltip'
import { computeSankeyLayout, offsetSankeyLayout } from './layout'
import { SANKEY_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxSankeyChart' })

const props = withDefaults(defineProps<SankeyChartProps>(), {
  height: 400,
  nodeWidth: 8,
  nodePadding: 10,
  showNodeValues: 'auto',
  nodeLabelLayout: 'stacked',
  formatValue: (value: number) => value.toLocaleString(),
  showTooltip: true,
  left: '5%',
  right: '5%',
  linkColor: 'gradient',
  linkOpacity: 0.5,
})

const emit = defineEmits<{
  nodeClick: [node: SankeyNodeData]
  linkClick: [link: SankeyLinkData]
}>()

defineSlots<{
  /** Replaces the default tooltip body. */
  tooltip?: (slotProps: { params: SankeyTooltipParams }) => unknown
}>()

const GRAY_LINK = '#D1D5DB'

const container = ref<HTMLElement | null>(null)
const measuredWidth = ref(0)

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!container.value)
    return
  measuredWidth.value = container.value.clientWidth
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect)
      measuredWidth.value = rect.width
  })
  observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())

const width = computed(() => props.width ?? measuredWidth.value)
const gradientPrefix = `tx-sankey-${nextUid()}`

const layout = computed(() =>
  computeSankeyLayout(props.nodes, props.links, {
    width: width.value,
    height: props.height,
    nodeWidth: props.nodeWidth,
    nodePadding: props.nodePadding,
    left: props.left,
    right: props.right,
  }),
)

// ── Node dragging ────────────────────────────────────────────────────────────
// A node follows a vertical drag 1:1 from where it was grabbed, inside the
// plot, and its ribbons re-route as it goes. Escape or a cancelled pointer puts
// it back; a double-click on the background springs every node home.

/** Vertical offsets of moved nodes: node index → px. */
const offsets = shallowRef<ReadonlyMap<number, number>>(new Map())
/** The layout as drawn, moved nodes included. */
const shown = computed(() => layout.value && offsetSankeyLayout(layout.value, offsets.value))

/** A press moving further than this (px) drags its node instead of clicking it. */
const DRAG_SLOP_PX = 4
/** One Alt + arrow press moves a node this far (px). */
const KEY_NUDGE = 8
/** How a node goes back after Escape, or home after a reset. */
const SETTLE_SPRING = responseSpring(0.3, 1)

/** Keeps a moved node inside the plot: d3-sankey's vertical extent. */
function clampOffset(index: number, offset: number): number {
  const node = layout.value?.nodes.find(candidate => candidate.index === index)
  if (!node)
    return 0
  const top = 8 - node.y0
  const bottom = Math.max(9, props.height - 8) - node.y1
  return Math.max(top, Math.min(bottom, offset))
}

function writeOffsets(changes: Iterable<[number, number]>): void {
  const next = new Map(offsets.value)
  for (const [index, offset] of changes) {
    if (Math.abs(offset) < 1e-6)
      next.delete(index)
    else
      next.set(index, offset)
  }
  offsets.value = next
}

const reduced = useReducedMotion()
const settling = new Map<number, { value: number, velocity: number, target: number }>()
const settleLoop = createFrameLoop(tickSettle)

function stopSettling(): void {
  settleLoop.stop()
  settling.clear()
}

function tickSettle(dt: number): boolean {
  const changes: Array<[number, number]> = []
  for (const [index, motion] of settling) {
    ;[motion.value, motion.velocity] = stepSpring(motion.value, motion.velocity, motion.target, SETTLE_SPRING, dt)
    if (Math.abs(motion.target - motion.value) < 0.1 && Math.abs(motion.velocity) < 1.6) {
      motion.value = motion.target
      settling.delete(index)
    }
    changes.push([index, motion.value])
  }
  writeOffsets(changes)
  return settling.size > 0
}

/** Springs each node in `targets` (index → offset) there; reduced motion jumps. */
function settle(targets: Map<number, number>): void {
  if (reduced.value || typeof requestAnimationFrame === 'undefined') {
    writeOffsets(targets)
    return
  }
  for (const [index, target] of targets) {
    const motion = settling.get(index)
    settling.set(index, {
      value: motion?.value ?? offsets.value.get(index) ?? 0,
      velocity: motion?.velocity ?? 0,
      target,
    })
  }
  settleLoop.start()
}

onBeforeUnmount(stopSettling)

interface NodeDrag { index: number, id: number, x: number, y: number, origin: number, active: boolean }

let drag: NodeDrag | null = null
/** A node is being dragged (its press has travelled past the slop). */
const dragging = ref(false)
/** The pointer sequence dragged a node, so its click is not a click. */
let suppressClick = false

function onNodePointerDown(event: PointerEvent, node: PositionedSankeyNode): void {
  if (event.pointerType !== 'touch' && (event.button !== 0 || event.isPrimary === false))
    return
  // Another finger keeps the node it has. The same pointer pressing again means
  // its last release never arrived (it let go outside the window), so that drag is over.
  if (drag && drag.id !== event.pointerId)
    return
  endDrag()
  // Grabbing a node that is still settling continues from where it is drawn.
  settling.delete(node.index)
  const el = container.value
  const rect = el?.getBoundingClientRect()
  drag = {
    index: node.index,
    id: event.pointerId,
    x: event.clientX - (rect?.left ?? 0),
    y: event.clientY - (rect?.top ?? 0),
    origin: offsets.value.get(node.index) ?? 0,
    active: false,
  }
}

function onPointerDown(): void {
  suppressClick = false
}

function endDrag(): NodeDrag | null {
  const current = drag
  drag = null
  if (current?.active) {
    dragging.value = false
    clearHover()
  }
  return current
}

function onPointerUp(event: PointerEvent): void {
  if (drag?.id === event.pointerId)
    endDrag()
}

/** Escape or a cancelled pointer: the node springs back to where it was picked up. */
function cancelDrag(): void {
  const current = endDrag()
  if (!current?.active)
    return
  container.value?.releasePointerCapture?.(current.id)
  settle(new Map([[current.index, current.origin]]))
}

function onPointerCancel(event: PointerEvent): void {
  if (drag?.id === event.pointerId)
    cancelDrag()
}

function onLostPointerCapture(event: PointerEvent): void {
  // Normally the pointerup already ended the drag; capture lost without one
  // leaves the node where it is. The event bubbles, and a touch that the node
  // captured implicitly hands that capture to the chart on the first move:
  // only the chart's own counts.
  if (event.target === container.value && drag?.active && drag.id === event.pointerId)
    endDrag()
}

function onClickCapture(event: MouseEvent): void {
  if (!suppressClick)
    return
  // A drag never lands as a click on the node it moved.
  suppressClick = false
  event.stopPropagation()
  event.preventDefault()
}

function onDblClick(event: MouseEvent): void {
  if (offsets.value.size === 0 || (event.target as Element | null)?.closest?.('.tx-sankey__node, .tx-sankey__link'))
    return
  settle(new Map([...offsets.value.keys()].map(index => [index, 0])))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && drag?.active) {
    event.preventDefault()
    cancelDrag()
  }
}

function onNodeKeydown(event: KeyboardEvent, node: PositionedSankeyNode): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('nodeClick', node.datum)
    return
  }
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || drag?.active)
    return
  event.preventDefault()
  settling.delete(node.index)
  const step = event.key === 'ArrowUp' ? -KEY_NUDGE : KEY_NUDGE
  writeOffsets([[node.index, clampOffset(node.index, (offsets.value.get(node.index) ?? 0) + step)]])
}

// New nodes, links or height start over from the computed layout. Arrays with
// the same content (a parent that rebuilds them on every render) do not, and
// neither would a mutation in place that went unnoticed by identity.
const layoutKey = computed(() => JSON.stringify([
  props.nodes.map(node => [node.name, node.value]),
  props.links.map(link => [link.source, link.target, link.value]),
  props.height,
]))
watch(layoutKey, () => {
  drag = null
  dragging.value = false
  stopSettling()
  offsets.value = new Map()
})

const labels = computed<SankeyLabels>(() => ({ ...SANKEY_DEFAULT_LABELS, ...props.labels }))
const instructionsId = useId()

function nodeName(node: PositionedSankeyNode): string {
  return node.datum.value === undefined
    ? node.datum.name
    : `${node.datum.name}, ${props.formatValue(node.datum.value)}`
}

function nodeColor(index: number): string {
  const node = props.nodes[index]
  return node?.color
    ?? props.defaultNodeColor
    ?? ChartPalette.categoricalVar(index)
}

const showValues = computed(() =>
  props.showNodeValues === 'auto'
    ? props.nodes.some(node => node.value !== undefined)
    : props.showNodeValues,
)

interface NodeLabel {
  x: number
  anchor: 'start' | 'end'
  midY: number
  name: string
  value: string | null
}

function nodeLabel(node: PositionedSankeyNode): NodeLabel {
  const onLeftHalf = node.x0 < width.value / 2
  return {
    x: onLeftHalf ? node.x1 + 6 : node.x0 - 6,
    anchor: onLeftHalf ? 'start' : 'end',
    midY: (node.y0 + node.y1) / 2,
    name: node.datum.name,
    value: showValues.value && node.datum.value !== undefined
      ? props.formatValue(node.datum.value)
      : null,
  }
}

// ── Hover / tooltip ──────────────────────────────────────────────────────────

const pointer = reactive({ x: 0, y: 0 })
const hovered = ref<SankeyTooltipParams | null>(null)

/**
 * Element driving the `emphasis: { focus: 'adjacency' }` state, which kumo's
 * sankey series sets. Kept separate from the tooltip payload so the emphasis
 * does not depend on tooltip visibility.
 */
const hoveredElement = ref<{ type: 'node' | 'link', index: number } | null>(null)

/**
 * Adjacency sets for the hovered element, matching ECharts' `adjacency` focus:
 * - node → the node, every link touching it, and the nodes at those links' other ends
 * - link → the link, its source and target nodes, and every link touching either
 */
const emphasis = computed<{ nodes: Set<number>, links: Set<number> } | null>(() => {
  const target = hoveredElement.value
  const result = layout.value
  if (!target || !result)
    return null
  const nodes = new Set<number>()
  const links = new Set<number>()
  const focusNodes: number[] = []
  if (target.type === 'node') {
    focusNodes.push(target.index)
  }
  else {
    const link = result.links[target.index]
    if (!link)
      return null
    focusNodes.push(link.sourceIndex, link.targetIndex)
  }
  for (const link of result.links) {
    if (focusNodes.includes(link.sourceIndex) || focusNodes.includes(link.targetIndex)) {
      links.add(link.index)
      nodes.add(link.sourceIndex)
      nodes.add(link.targetIndex)
    }
  }
  return { nodes, links }
})

function isNodeDimmed(index: number): boolean {
  return emphasis.value !== null && !emphasis.value.nodes.has(index)
}

function isLinkDimmed(index: number): boolean {
  return emphasis.value !== null && !emphasis.value.links.has(index)
}

function onPointerMove(event: PointerEvent): void {
  const el = container.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  pointer.x = event.clientX - rect.left
  pointer.y = event.clientY - rect.top
  if (!drag || event.pointerId !== drag.id)
    return
  // A mouse let go outside the window never says so: moving without the button is hover.
  if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
    endDrag()
    return
  }
  const dy = pointer.y - drag.y
  if (!drag.active) {
    if (Math.hypot(pointer.x - drag.x, dy) < DRAG_SLOP_PX)
      return
    drag.active = true
    dragging.value = true
    suppressClick = true
    // The tooltip steps aside; the node keeps its adjacency emphasis.
    hovered.value = null
    hoveredElement.value = { type: 'node', index: drag.index }
    // Captured only now, so a press that never moves stays a click. jsdom
    // has no pointer-capture API.
    el.setPointerCapture?.(event.pointerId)
  }
  writeOffsets([[drag.index, clampOffset(drag.index, drag.origin + dy)]])
}

function hoverNode(node: PositionedSankeyNode): void {
  if (dragging.value)
    return
  hoveredElement.value = { type: 'node', index: node.index }
  hovered.value = {
    type: 'node',
    name: node.datum.name,
    node: node.datum,
    color: nodeColor(node.index),
  }
}

function hoverLink(link: PositionedSankeyLink): void {
  if (dragging.value)
    return
  hoveredElement.value = { type: 'link', index: link.index }
  const source = props.nodes[link.sourceIndex]?.name ?? ''
  const target = props.nodes[link.targetIndex]?.name ?? ''
  hovered.value = {
    type: 'link',
    name: `${source} → ${target}`,
    link: { source, target, value: link.datum.value },
  }
}

function clearHover(): void {
  hoveredElement.value = null
  hovered.value = null
}

/** Leaving an element under a drag keeps the dragged node's emphasis. */
function onLeave(): void {
  if (!dragging.value)
    clearHover()
}

// ECharts drops the hover state when the series re-renders; a stale adjacency
// set would otherwise keep dimming the new elements.
watch(layout, () => clearHover())

const tooltipEl = ref<HTMLElement | null>(null)
const tooltipPlacement = computed(() => placeTooltip({
  pointerX: pointer.x,
  pointerY: pointer.y,
  tooltipWidth: tooltipEl.value?.offsetWidth ?? 0,
  tooltipHeight: tooltipEl.value?.offsetHeight ?? 0,
  containerWidth: width.value,
  containerHeight: props.height,
  offset: 12,
  follow: 'both',
}))

const tooltipRows = computed<Array<[string, string]>>(() => {
  const params = hovered.value
  if (!params)
    return []
  if (params.type === 'link' && params.link)
    return [['Value', props.formatValue(params.link.value)]]
  const rows: Array<[string, string]> = []
  if (params.node?.value !== undefined)
    rows.push(['Value', props.formatValue(params.node.value)])
  for (const [key, value] of Object.entries(params.node?.tooltipData ?? {}))
    rows.push([key, typeof value === 'number' ? props.formatValue(value) : String(value)])
  return rows
})
</script>

<template>
  <div
    ref="container"
    class="tx-sankey"
    :class="{ 'is-dragging': dragging }"
    :style="{ height: `${props.height}px` }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @lostpointercapture="onLostPointerCapture"
    @keydown="onKeydown"
    @dblclick="onDblClick"
    @click.capture="onClickCapture"
  >
    <span :id="instructionsId" class="tx-sankey__instructions">{{ labels.instructions }}</span>
    <svg
      v-if="shown && width > 0"
      class="tx-sankey__svg"
      :viewBox="`0 0 ${width} ${props.height}`"
    >
      <defs v-if="props.linkColor === 'gradient'">
        <linearGradient
          v-for="link in shown.links"
          :id="`${gradientPrefix}-link-${link.index}`"
          :key="`grad-${link.index}`"
          gradientUnits="userSpaceOnUse"
          :x1="link.x1"
          :x2="link.x2"
          y1="0"
          y2="0"
        >
          <stop offset="0%" :stop-color="nodeColor(link.sourceIndex)" />
          <stop offset="100%" :stop-color="nodeColor(link.targetIndex)" />
        </linearGradient>
      </defs>

      <g class="tx-sankey__links">
        <path
          v-for="link in shown.links"
          :key="link.index"
          class="tx-sankey__link"
          :class="{ 'is-drillable': link.datum.isDrillable, 'is-dimmed': isLinkDimmed(link.index) }"
          :d="link.path"
          fill="none"
          :stroke="props.linkColor === 'gradient' ? `url(#${gradientPrefix}-link-${link.index})` : GRAY_LINK"
          :stroke-opacity="props.linkColor === 'gradient' ? props.linkOpacity : 0.4"
          :stroke-width="link.width"
          @pointerenter="hoverLink(link)"
          @pointerleave="onLeave"
          @click="emit('linkClick', link.datum)"
        />
      </g>

      <g class="tx-sankey__nodes">
        <rect
          v-for="node in shown.nodes"
          :key="node.index"
          class="tx-sankey__node"
          :class="{ 'is-drillable': node.datum.isDrillable, 'is-dimmed': isNodeDimmed(node.index) }"
          :x="node.x0"
          :y="node.y0"
          :width="node.x1 - node.x0"
          :height="Math.max(1, node.y1 - node.y0)"
          :fill="nodeColor(node.index)"
          tabindex="0"
          role="button"
          :aria-label="nodeName(node)"
          :aria-describedby="instructionsId"
          @pointerdown="onNodePointerDown($event, node)"
          @pointerenter="hoverNode(node)"
          @pointerleave="onLeave"
          @keydown="onNodeKeydown($event, node)"
          @click="emit('nodeClick', node.datum)"
        />
      </g>

      <g class="tx-sankey__labels" aria-hidden="true">
        <template v-for="node in shown.nodes" :key="`label-${node.index}`">
          <text
            v-if="nodeLabel(node).value !== null && props.nodeLabelLayout === 'stacked'"
            class="tx-sankey__label"
            :class="{ 'is-dimmed': isNodeDimmed(node.index) }"
            :x="nodeLabel(node).x"
            :y="nodeLabel(node).midY"
            :text-anchor="nodeLabel(node).anchor"
          >
            <tspan class="tx-sankey__label-value" :x="nodeLabel(node).x" dy="-0.2em">
              {{ nodeLabel(node).value }}
            </tspan>
            <tspan :x="nodeLabel(node).x" dy="1.2em">{{ nodeLabel(node).name }}</tspan>
          </text>
          <text
            v-else
            class="tx-sankey__label"
            :class="{ 'is-dimmed': isNodeDimmed(node.index) }"
            :x="nodeLabel(node).x"
            :y="nodeLabel(node).midY"
            :text-anchor="nodeLabel(node).anchor"
            dominant-baseline="middle"
          >
            <tspan
              v-if="nodeLabel(node).value !== null"
              class="tx-sankey__label-value"
            >{{ nodeLabel(node).value }} </tspan>
            <tspan>{{ nodeLabel(node).name }}</tspan>
          </text>
        </template>
      </g>
    </svg>

    <div
      v-if="props.showTooltip && hovered"
      ref="tooltipEl"
      class="tx-sankey__tooltip"
      :style="{ left: `${tooltipPlacement.left}px`, top: `${tooltipPlacement.top}px` }"
      role="presentation"
    >
      <slot name="tooltip" :params="hovered">
        <div class="tx-sankey__tooltip-title">
          <span
            v-if="hovered.color"
            class="tx-sankey__tooltip-dot"
            :style="{ backgroundColor: hovered.color }"
          />
          <strong>{{ hovered.name }}</strong>
        </div>
        <div
          v-for="[key, value] in tooltipRows"
          :key="key"
          class="tx-sankey__tooltip-row"
        >
          <span class="tx-sankey__tooltip-key">{{ key }}</span>
          <span class="tx-sankey__tooltip-value">{{ value }}</span>
        </div>
        <div
          v-if="hovered.type === 'node' && hovered.node?.isDrillable && hovered.node.childCount"
          class="tx-sankey__tooltip-row tx-sankey__tooltip-drill"
        >
          {{ hovered.node.childCount }} items
        </div>
      </slot>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-sankey {
  position: relative;
  width: 100%;

  &__svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  // The dim snaps rather than easing over ECharts' 300ms `stateAnimation`:
  // TuffEx switches hover emphasis on the frame the pointer arrives.
  // `emphasis: { focus: 'adjacency' }` (set by kumo's sankey series) blurs the
  // non-adjacent elements; ECharts' default blur style is
  // `fromState.opacity * 0.1`. No `lineStyle.opacity` override exists, so a
  // hovered link keeps its base `linkOpacity`.
  &__link.is-dimmed,
  &__node.is-dimmed,
  &__label.is-dimmed {
    opacity: 0.1;
  }

  &__link.is-drillable {
    cursor: pointer;
  }

  // Nodes are picked up and moved, drillable ones included; a vertical touch
  // drag on one moves it instead of scrolling the page. `touch-action` skips
  // inline boxes, which is what an SVG shape is until it is made a block.
  &__node {
    display: block;
    cursor: grab;
    touch-action: none;
    outline: none;

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary, #409eff);
      outline-offset: 2px;
    }
  }

  &.is-dragging {
    user-select: none;
    -webkit-user-select: none;

    &,
    .tx-sankey__node {
      cursor: grabbing;
    }
  }

  &__instructions {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  &__label {
    fill: var(--tx-chart-text-primary, #6b7280);
    font-size: 12px;
  }

  &__label-value {
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  &__tooltip {
    position: absolute;
    z-index: 10;
    min-width: 150px;
    max-width: 20rem;
    padding: 0.5rem;
    border: 1px solid var(--tx-chart-grid-line, rgb(107 114 128 / 20%));
    border-radius: 0.5rem;
    background: var(--tx-chart-tooltip-bg, canvas);
    box-shadow: -2px 4px 12px rgb(0 0 0 / 10%);
    font-size: 0.75rem;
    pointer-events: none;
  }

  &__tooltip-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  &__tooltip-dot {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
  }

  &__tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding-block: 0.125rem;
  }

  &__tooltip-key {
    color: var(--tx-chart-text-secondary, #9ca3af);
  }

  &__tooltip-value {
    font-weight: var(--tx-font-weight-medium, 500);
    font-variant-numeric: tabular-nums;
  }

  &__tooltip-drill {
    color: var(--tx-chart-text-secondary, #9ca3af);
  }
}
</style>

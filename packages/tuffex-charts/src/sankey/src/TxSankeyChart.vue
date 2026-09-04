<script setup lang="ts">
// API surface modeled on Cloudflare kumo's SankeyChart (MIT); layout by
// d3-sankey, rendered as SVG. Tooltip content is a slot (VNodes), not an HTML
// string — kumo's XSS-escaping surface is deliberately not carried over.

import type { PositionedSankeyLink, PositionedSankeyNode } from './layout'
import type { SankeyChartProps, SankeyLinkData, SankeyNodeData, SankeyTooltipParams } from './types'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { nextUid } from '../../core/uid'
import { ChartPalette } from '../../palette'
import { placeTooltip } from '../../tooltip'
import { computeSankeyLayout } from './layout'

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

function onPointerMove(event: PointerEvent): void {
  const el = container.value
  if (!el)
    return
  const rect = el.getBoundingClientRect()
  pointer.x = event.clientX - rect.left
  pointer.y = event.clientY - rect.top
}

function hoverNode(node: PositionedSankeyNode): void {
  hovered.value = {
    type: 'node',
    name: node.datum.name,
    node: node.datum,
    color: nodeColor(node.index),
  }
}

function hoverLink(link: PositionedSankeyLink): void {
  const source = props.nodes[link.sourceIndex]?.name ?? ''
  const target = props.nodes[link.targetIndex]?.name ?? ''
  hovered.value = {
    type: 'link',
    name: `${source} → ${target}`,
    link: { source, target, value: link.datum.value },
  }
}

function clearHover(): void {
  hovered.value = null
}

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
    :style="{ height: `${props.height}px` }"
    @pointermove="onPointerMove"
  >
    <svg
      v-if="layout && width > 0"
      class="tx-sankey__svg"
      :viewBox="`0 0 ${width} ${props.height}`"
    >
      <defs v-if="props.linkColor === 'gradient'">
        <linearGradient
          v-for="link in layout.links"
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
          v-for="link in layout.links"
          :key="link.index"
          class="tx-sankey__link"
          :class="{ 'is-drillable': link.datum.isDrillable }"
          :d="link.path"
          fill="none"
          :stroke="props.linkColor === 'gradient' ? `url(#${gradientPrefix}-link-${link.index})` : GRAY_LINK"
          :stroke-opacity="props.linkColor === 'gradient' ? props.linkOpacity : 0.4"
          :stroke-width="link.width"
          @pointerenter="hoverLink(link)"
          @pointerleave="clearHover"
          @click="emit('linkClick', link.datum)"
        />
      </g>

      <g class="tx-sankey__nodes">
        <rect
          v-for="node in layout.nodes"
          :key="node.index"
          class="tx-sankey__node"
          :class="{ 'is-drillable': node.datum.isDrillable }"
          :x="node.x0"
          :y="node.y0"
          :width="node.x1 - node.x0"
          :height="Math.max(1, node.y1 - node.y0)"
          :fill="nodeColor(node.index)"
          @pointerenter="hoverNode(node)"
          @pointerleave="clearHover"
          @click="emit('nodeClick', node.datum)"
        />
      </g>

      <g class="tx-sankey__labels" aria-hidden="true">
        <template v-for="node in layout.nodes" :key="`label-${node.index}`">
          <text
            v-if="nodeLabel(node).value !== null && props.nodeLabelLayout === 'stacked'"
            class="tx-sankey__label"
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

  &__link {
    transition: stroke-opacity 0.15s ease;

    &:hover {
      stroke-opacity: 0.75;
    }
  }

  &__link.is-drillable,
  &__node.is-drillable {
    cursor: pointer;
  }

  &__label {
    fill: var(--tx-chart-text-primary, #6b7280);
    font-size: 12px;
  }

  &__label-value {
    font-weight: 600;
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
    box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
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
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  &__tooltip-drill {
    color: var(--tx-chart-text-secondary, #9ca3af);
  }
}
</style>

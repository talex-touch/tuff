<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { FlowchartEmits, FlowchartProps, FlowNode } from './types'
/**
 * TxFlowchart Component
 *
 * Workflow trigger and condition steps on a dotted canvas. A pure controlled
 * primitive: it draws whatever `nodes` and `edges` say and reports drags back
 * through `node-move` — it never mutates the arrays it was handed.
 *
 * @example
 * ```vue
 * <TxFlowchart :nodes="nodes" :edges="[{ from: 'trigger', to: 'branch' }]" draggable>
 *   <template #node="{ node }">…</template>
 * </TxFlowchart>
 * ```
 *
 * @component
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

defineOptions({ name: 'TxFlowchart' })

const props = withDefaults(defineProps<FlowchartProps>(), {
  edges: () => [],
  height: 333,
  nodeWidth: 290,
  grid: 22,
  dots: true,
  draggable: false,
  snap: true,
  ariaLabel: 'Workflow',
})

const emit = defineEmits<FlowchartEmits>()

defineSlots<{
  /** The card body for a node. Without it the node renders an empty card. */
  node?: (props: { node: FlowNode, index: number }) => any
  /** Replaces the category chip above a node. */
  label?: (props: { node: FlowNode }) => any
}>()

/**
 * Measured node heights, keyed by node id.
 *
 * An edge has to end on the *bottom* of its source card, and card height is
 * content-driven — a two-line condition row is taller than a one-line trigger.
 * Guessing it puts the connector's tail inside or below the card, so the
 * heights are measured and the edge path is recomputed when they change.
 */
const heights = reactive<Record<string, number>>({})

let observer: ResizeObserver | undefined

function observeNode(el: Element | null, id: string): void {
  if (!el)
    return
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.flowNode
        if (key)
          heights[key] = entry.contentRect.height
      }
    })
  }
  heights[id] = (el as HTMLElement).offsetHeight
  observer.observe(el)
}

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
})

// A node removed from `nodes` must not keep a stale height around: a later node
// reusing that id would draw its first frame against the old card's geometry.
watch(
  () => props.nodes.map(n => n.id).join('\u0000'),
  () => {
    const live = new Set(props.nodes.map(n => n.id))
    for (const id of Object.keys(heights)) {
      if (!live.has(id))
        delete heights[id]
    }
  },
)

/** Drag offsets applied on top of a node's declared position, cleared on drop. */
const dragOffset = reactive<Record<string, { dx: number, dy: number }>>({})
const draggingId = ref<string | null>(null)

function nodeWidthOf(node: FlowNode): number {
  return node.width ?? props.nodeWidth
}

function nodeX(node: FlowNode): number {
  return node.x + (dragOffset[node.id]?.dx ?? 0)
}

function nodeY(node: FlowNode): number {
  return node.y + (dragOffset[node.id]?.dy ?? 0)
}

const nodeById = computed(() => {
  const map = new Map<string, FlowNode>()
  for (const node of props.nodes)
    map.set(node.id, node)
  return map
})

/**
 * Edge geometry.
 *
 * Upstream's curve places both control points past the midpoint and crossed
 * (`C 240 161.7, 240 152.3, 240 204` over a 94px drop — ±0.55 of the gap either
 * side of centre). That keeps a vertically-aligned pair reading as a straight
 * line while an offset pair still leaves and enters its cards vertically,
 * instead of the slack ease a 0.5 factor gives.
 */
const CONTROL_RATIO = 0.55

const edgePaths = computed(() => {
  const out: { key: string, d: string, dashed: boolean }[] = []
  for (const edge of props.edges) {
    const from = nodeById.value.get(edge.from)
    const to = nodeById.value.get(edge.to)
    // An edge naming a node that is not on the canvas is skipped rather than
    // drawn to the origin, which would streak a line across the whole surface.
    if (!from || !to)
      continue
    const x1 = nodeX(from)
    const y1 = nodeY(from) + (heights[from.id] ?? 0)
    const x2 = nodeX(to)
    const y2 = nodeY(to)
    const drop = (y2 - y1) * CONTROL_RATIO
    out.push({
      key: `${edge.from}\u0000${edge.to}`,
      d: `M ${x1} ${y1} C ${x1} ${y1 + drop}, ${x2} ${y2 - drop}, ${x2} ${y2}`,
      dashed: edge.dashed ?? false,
    })
  }
  return out
})

function canDrag(node: FlowNode): boolean {
  return props.draggable && (node.draggable ?? true)
}

function onPointerDown(event: PointerEvent, node: FlowNode): void {
  if (!canDrag(node) || event.button !== 0)
    return
  const startX = event.clientX
  const startY = event.clientY
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)
  draggingId.value = node.id

  const move = (moveEvent: PointerEvent): void => {
    let dx = moveEvent.clientX - startX
    let dy = moveEvent.clientY - startY
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
    // Report the landing position even when it equals the start: a host that
    // re-renders on every pointerup stays in step with what is on screen.
    if (offset)
      emit('node-move', { id: node.id, x: node.x + offset.dx, y: node.y + offset.dy })
  }

  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}

function onActivate(node: FlowNode): void {
  emit('node-click', { id: node.id, node })
}

function onKeydown(event: KeyboardEvent, node: FlowNode): void {
  if (event.target !== event.currentTarget)
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  onActivate(node)
}

const canvasStyle = computed(() => ({
  '--tx-bui-flow-grid': `${props.grid}px`,
  'height': `${props.height}px`,
}))
</script>

<template>
  <div
    class="tx-bui-flowchart"
    :class="{ 'is-dotted': dots }"
    :style="canvasStyle"
    role="group"
    :aria-label="ariaLabel"
  >
    <!-- Connectors sit under the cards so a card's ring shadow covers the line's
         endpoint rather than the line crossing the card's corner. -->
    <svg class="tx-bui-flowchart__edges" aria-hidden="true">
      <path
        v-for="edge in edgePaths"
        :key="edge.key"
        class="tx-bui-flowchart__edge"
        :class="{ 'is-dashed': edge.dashed }"
        :d="edge.d"
      />
    </svg>

    <div
      v-for="(node, index) in nodes"
      :key="node.id"
      :ref="el => observeNode(el as Element | null, node.id)"
      :data-flow-node="node.id"
      class="tx-bui-flowchart__node"
      :class="{ 'is-draggable': canDrag(node), 'is-dragging': draggingId === node.id }"
      :style="{
        left: `${nodeX(node)}px`,
        top: `${nodeY(node)}px`,
        width: `${nodeWidthOf(node)}px`,
      }"
      tabindex="0"
      @pointerdown="onPointerDown($event, node)"
      @click="onActivate(node)"
      @keydown="onKeydown($event, node)"
    >
      <slot name="label" :node="node">
        <span
          v-if="node.label"
          class="tx-bui-flowchart__chip"
          :class="`tx-bui-flowchart__chip--${node.tone ?? 'neutral'}`"
        >{{ node.label }}</span>
      </slot>

      <div class="tx-bui-flowchart__card">
        <slot name="node" :node="node" :index="index" />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
// Ring shadows, never `border` — the BUI family's double-line trap.
.tx-bui-flowchart {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--tx-bui-radius-card, 10px);
  background-color: var(--tx-bui-page, #fafafb);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  user-select: none;

  // The dot sits at 1px with its falloff at 1.25px: a hard 1px stop aliases into
  // a square at the grid pitch, and anything past ~1.5px reads as a visible
  // texture competing with the cards.
  &.is-dotted {
    background-image: radial-gradient(
      var(--tx-bui-line-strong, #e0e2e5) 1px,
      transparent 1.25px
    );
    background-size: var(--tx-bui-flow-grid, 22px) var(--tx-bui-flow-grid, 22px);
  }

  &__edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  &__edge {
    fill: none;
    stroke: var(--tx-bui-line-strong, #e0e2e5);
    stroke-width: 1.25px;
    stroke-linecap: round;

    &.is-dashed {
      stroke-dasharray: 4 4;
    }
  }

  &__node {
    position: absolute;
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
      z-index: 1;
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
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;

    &--neutral {
      background-color: var(--tx-bui-hover-2, #e7e9eb);
      color: var(--tx-bui-ink-2, #62656b);
    }

    &--violet {
      background-color: #ede4fb;
      color: #6b3fd4;
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
    width: 100%;
    border-radius: 18px;
    background-color: var(--tx-bui-surface, #fff);
    box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 1px 2px 2px #1018280a, 2px 4px 6px #10182808);
  }
}

[data-theme='dark'] .tx-bui-flowchart,
.dark .tx-bui-flowchart {
  &__chip--violet {
    background-color: #2a2140;
    color: #c4a9fb;
  }
}
</style>

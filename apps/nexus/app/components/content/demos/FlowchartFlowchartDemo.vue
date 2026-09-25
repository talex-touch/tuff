<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// Mirrors `FlowNode`. Declared locally so the demo does not depend on the
// tuffex barrel having been rebuilt — the other demos do the same.
interface FlowNode {
  id: string
  label?: string
  tone?: 'violet' | 'orange' | 'accent' | 'green' | 'red' | 'neutral'
  x: number
  y: number
}

// Positions mirror the upstream demo: its connector path runs `M 240 110 … 240
// 204`, so the trigger's card ends at 110 and the branch's chip starts at 204.
const nodes = ref<FlowNode[]>([
  { id: 'trigger', label: 'Trigger', tone: 'violet', x: 240, y: 22 },
  { id: 'branch', label: 'If / Else', tone: 'orange', x: 240, y: 174 },
])

const edges = [{ from: 'trigger', to: 'branch' }]

// The component is controlled: it reports a drag and leaves the write to us.
function place({ id, x, y }: { id: string, x: number, y: number }) {
  const node = nodes.value.find(n => n.id === id)
  if (node) {
    node.x = x
    node.y = y
  }
}
</script>

<template>
  <!-- Node positions are absolute canvas coordinates, so the canvas needs a
       bounded width for `x: 240` to read as centred — the same 480px the
       upstream demo pins with `max-w-120`. -->
  <div class="demo-flow-frame">
    <TxFlowchart
      :nodes="nodes"
      :edges="edges"
      :height="333"
      :node-width="290"
      draggable
      :aria-label="zh ? '订单工作流' : 'Order workflow'"
      @node-move="place"
    >
    <template #node="{ node }">
      <div v-if="node.id === 'trigger'" class="demo-flow-trigger">
        <span class="demo-flow-trigger__icon" aria-hidden="true">
          <i class="i-carbon-flash" />
        </span>
        <span class="demo-flow-trigger__text">
          <strong>{{ zh ? '新订单创建' : 'New order created' }}</strong>
          <small>{{ zh ? '有新订单时触发' : 'Trigger when a new order is created' }}</small>
        </span>
      </div>

      <div v-else class="demo-flow-branch">
        <div class="demo-flow-branch__row">
          <span class="demo-flow-branch__kw">{{ zh ? '如果' : 'If' }}</span>
          <span class="demo-flow-branch__token">{{ zh ? '订单' : 'order' }}</span>
          <span class="demo-flow-branch__token">{{ zh ? '口味' : 'flavor' }}</span>
          <span class="demo-flow-branch__kw">{{ zh ? '是' : 'is' }}</span>
          <span class="demo-flow-branch__token is-dot">Rocky Road</span>
        </div>
        <div class="demo-flow-branch__row">
          <span class="demo-flow-branch__kw">{{ zh ? '并且' : 'and' }}</span>
          <span class="demo-flow-branch__token">{{ zh ? '订单' : 'order' }}</span>
          <span class="demo-flow-branch__token">{{ zh ? '配料' : 'topping' }}</span>
          <span class="demo-flow-branch__kw">{{ zh ? '是' : 'is' }}</span>
        </div>
        <div class="demo-flow-branch__row">
          <span class="demo-flow-branch__token is-dot is-wide">
            {{ zh ? '焦化黄油波本脆糖' : 'Brown butter bourbon brittle crunch' }}
          </span>
        </div>
      </div>
    </template>
    </TxFlowchart>
  </div>
</template>

<style scoped>
.demo-flow-frame {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

.demo-flow-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
}

.demo-flow-trigger__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #f1e9fd;
  color: #8b5cf6;
  font-size: 16px;
}

.demo-flow-trigger__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.demo-flow-trigger__text strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-bui-ink, #1f2124);
}

.demo-flow-trigger__text small {
  font-size: 11.5px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.demo-flow-branch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.demo-flow-branch__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.demo-flow-branch__kw {
  font-size: 12.5px;
  color: var(--tx-bui-ink-2, #62656b);
}

.demo-flow-branch__token {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--tx-bui-radius-chip, 6px);
  background: var(--tx-bui-inset, #f7f8f9);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  font-size: 12px;
  color: var(--tx-bui-ink, #1f2124);
  white-space: nowrap;
}

.demo-flow-branch__token.is-wide {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  line-height: 24px;
}

.demo-flow-branch__token.is-dot::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
  border-radius: 50%;
  background: var(--tx-bui-orange, #ef720c);
  vertical-align: middle;
}
</style>

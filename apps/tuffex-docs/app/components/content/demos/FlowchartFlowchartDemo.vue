<script setup lang="ts">
import type { FlowEdge, FlowNode } from '@talex-touch/tuffex/flowchart'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const INITIAL_POSITIONS = {
  trigger: { x: 240, y: 20 },
  branch: { x: 240, y: 178 },
}

const positions = ref({
  trigger: { ...INITIAL_POSITIONS.trigger },
  branch: { ...INITIAL_POSITIONS.branch },
})

const selectedId = ref<string | null>(null)

const nodes = computed<FlowNode[]>(() => [
  {
    id: 'trigger',
    label: zh.value ? '触发器' : 'Trigger',
    tone: 'violet',
    status: selectedId.value === 'trigger' ? 'active' : 'idle',
    ...positions.value.trigger,
  },
  {
    id: 'branch',
    label: zh.value ? '条件分支' : 'If / Else',
    tone: 'orange',
    status: selectedId.value === 'branch' ? 'active' : 'idle',
    ...positions.value.branch,
  },
])

const edges = computed<FlowEdge[]>(() => [
  {
    from: 'trigger',
    to: 'branch',
    tone: 'violet',
    pulse: true,
    label: zh.value ? '事件载荷' : 'payload',
    markerEnd: 'arrow',
  },
])

const isDirty = computed(() =>
  positions.value.trigger.x !== INITIAL_POSITIONS.trigger.x
  || positions.value.trigger.y !== INITIAL_POSITIONS.trigger.y
  || positions.value.branch.x !== INITIAL_POSITIONS.branch.x
  || positions.value.branch.y !== INITIAL_POSITIONS.branch.y,
)

function place({ id, x, y }: { id: string, x: number, y: number }) {
  if (id === 'trigger' || id === 'branch')
    positions.value[id] = { x, y }
}

function resetPositions() {
  positions.value = {
    trigger: { ...INITIAL_POSITIONS.trigger },
    branch: { ...INITIAL_POSITIONS.branch },
  }
  selectedId.value = null
}
</script>

<template>
  <div class="not-prose demo-flow-frame">
    <div class="demo-flow-bar">
      <span class="demo-flow-hint">
        <i class="i-carbon-draggable" aria-hidden="true" />
        {{ zh ? '拖动卡片吸附到点阵，连线与锚点自动跟随' : 'Drag cards to snap onto the grid; edges and ports follow live' }}
      </span>
      <TxButton v-if="isDirty" size="sm" variant="ghost" @click="resetPositions">
        {{ zh ? '还原位置' : 'Reset' }}
      </TxButton>
    </div>

    <TxFlowchart
      :nodes="nodes"
      :edges="edges"
      :height="346"
      :node-width="290"
      :selected-id="selectedId"
      draggable
      ports
      :aria-label="zh ? '订单工作流' : 'Order workflow'"
      @node-move="place"
      @node-click="({ id }) => (selectedId = id)"
      @canvas-click="selectedId = null"
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
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-flow-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
}

.demo-flow-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.demo-flow-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.demo-flow-trigger__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--tx-bui-violet-tint, #ede4fb);
  color: var(--tx-bui-violet, #6b3fd4);
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

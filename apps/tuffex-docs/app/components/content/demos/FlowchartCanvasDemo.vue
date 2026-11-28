<script setup lang="ts">
import type { FlowEdge, FlowNode, FlowNodeTone, FlowViewport, TxFlowchartInstance } from '@talex-touch/tuffex/flowchart'
import { computed, nextTick, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

interface RawNode {
  id: string
  tone: FlowNodeTone
  x: number
  y: number
  zhLabel: string
  enLabel: string
  zhTitle: string
  enTitle: string
  zhDesc: string
  enDesc: string
}

const flowRef = ref<TxFlowchartInstance | null>(null)
const snap = ref(true)
const lockFirst = ref(true)
const selectedId = ref<string | null>('ingest')
const viewportState = ref<FlowViewport>({ x: 0, y: 0, zoom: 1 })

const rawNodes = ref<RawNode[]>([
  {
    id: 'ingest',
    tone: 'violet',
    x: 120,
    y: 44,
    zhLabel: '入口',
    enLabel: 'Ingest',
    zhTitle: '事件采集',
    enTitle: 'Event Ingest',
    zhDesc: 'Webhook / 队列',
    enDesc: 'Webhook / queue',
  },
  {
    id: 'transform',
    tone: 'accent',
    x: 372,
    y: 44,
    zhLabel: '处理',
    enLabel: 'Transform',
    zhTitle: '字段清洗',
    enTitle: 'Normalize',
    zhDesc: '脱敏与结构化',
    enDesc: 'Sanitize & map',
  },
  {
    id: 'sink',
    tone: 'green',
    x: 624,
    y: 44,
    zhLabel: '落库',
    enLabel: 'Sink',
    zhTitle: '写入索引',
    enTitle: 'Write Index',
    zhDesc: 'SQLite + 向量',
    enDesc: 'SQLite + vector',
  },
])

const rawEdges = ref<FlowEdge[]>([
  { from: 'ingest', to: 'transform', tone: 'violet', pulse: true, label: 'JSON' },
  { from: 'transform', to: 'sink', tone: 'green', pulse: true, label: 'Batch' },
])

const nodes = computed<FlowNode[]>(() =>
  rawNodes.value.map((n, index) => ({
    id: n.id,
    label: zh.value ? n.zhLabel : n.enLabel,
    tone: n.tone,
    title: zh.value ? n.zhTitle : n.enTitle,
    description: zh.value ? n.zhDesc : n.enDesc,
    badge: index === 0 && lockFirst.value ? (zh.value ? '已锁定' : 'Locked') : undefined,
    draggable: index === 0 ? !lockFirst.value : true,
    width: 196,
    x: n.x,
    y: n.y,
  })),
)

const EXTRA_TONES: FlowNodeTone[] = ['orange', 'accent', 'green', 'violet']

async function addNode() {
  if (rawNodes.value.length >= 7)
    return
  const n = rawNodes.value.length + 1
  const parent = rawNodes.value[n === 4 ? 1 : rawNodes.value.length - 1]!
  const id = `step-${n}`
  const col = n >= 4 ? n - 3 : n - 1
  const row = n >= 4 ? 1 : 0
  rawNodes.value.push({
    id,
    tone: EXTRA_TONES[n % EXTRA_TONES.length]!,
    x: 120 + col * 252,
    y: 44 + row * 172,
    zhLabel: `扩展 ${n}`,
    enLabel: `Step ${n}`,
    zhTitle: `自定义任务 #${n}`,
    enTitle: `Custom Task #${n}`,
    zhDesc: '拖动画布或节点试试对齐参考线',
    enDesc: 'Drag to align with snap guides',
  })
  rawEdges.value.push({
    from: parent.id,
    to: id,
    tone: EXTRA_TONES[n % EXTRA_TONES.length]!,
    pulse: true,
  })
  selectedId.value = id
  await nextTick()
  flowRef.value?.fitView(28)
}

async function autoLayout() {
  rawNodes.value = rawNodes.value.map((node, index) => {
    const col = index >= 3 ? index - 2 : index
    const row = index >= 3 ? 1 : 0
    return { ...node, x: 120 + col * 252, y: 44 + row * 172 }
  })
  await nextTick()
  flowRef.value?.fitView(28)
}

function place({ id, x, y }: { id: string, x: number, y: number }) {
  const target = rawNodes.value.find(n => n.id === id)
  if (target) {
    target.x = x
    target.y = y
  }
}

onMounted(async () => {
  await nextTick()
  flowRef.value?.fitView(28)
})
</script>

<template>
  <div class="not-prose flow-canvas-demo">
    <div class="flow-canvas-demo__bar">
      <div class="flow-canvas-demo__actions">
        <TxButton size="sm" variant="primary" :disabled="rawNodes.length >= 7" @click="addNode">
          <i class="i-carbon-add" aria-hidden="true" />
          {{ zh ? '添加节点' : 'Add node' }}
        </TxButton>
        <TxButton size="sm" variant="secondary" @click="autoLayout">
          <i class="i-carbon-grid" aria-hidden="true" />
          {{ zh ? '自动整理' : 'Auto layout' }}
        </TxButton>
        <TxButton size="sm" :variant="snap ? 'primary' : 'secondary'" @click="snap = !snap">
          {{ zh ? '栅格吸附' : 'Snap' }}
        </TxButton>
        <TxButton size="sm" :variant="lockFirst ? 'primary' : 'secondary'" @click="lockFirst = !lockFirst">
          {{ lockFirst ? (zh ? '首节点已锁' : 'First locked') : (zh ? '全部可拖' : 'All draggable') }}
        </TxButton>
      </div>
      <span class="flow-canvas-demo__telemetry">
        {{ Math.round(viewportState.zoom * 100) }}% · ({{ Math.round(viewportState.x) }}, {{ Math.round(viewportState.y) }})
      </span>
    </div>

    <TxFlowchart
      ref="flowRef"
      :nodes="nodes"
      :edges="rawEdges"
      :height="420"
      direction="horizontal"
      background="cross"
      edge-marker="arrow"
      :selected-id="selectedId"
      :snap="snap"
      draggable
      ports
      pannable
      zoomable
      controls
      minimap
      :labels="zh ? { zoomIn: '放大', zoomOut: '缩小', fitView: '适应视图', resetView: '重置缩放', minimap: '流程缩略图' } : undefined"
      :aria-label="zh ? '可缩放与带缩略图的画布游乐场' : 'Pannable and zoomable canvas playground with minimap'"
      @node-move="place"
      @node-click="({ id }) => (selectedId = id)"
      @canvas-click="selectedId = null"
      @viewport-change="v => (viewportState = v)"
    />

    <p class="flow-canvas-demo__tip">
      {{ zh ? '提示：按住空白画布拖动画布，按住 Ctrl/⌘ + 滚轮或点击右下角 HUD 缩放，点击左下角缩略图可快速跳转。' : 'Tip: drag empty space to pan, use Ctrl/⌘ + wheel or the bottom-right HUD to zoom, and click the minimap to jump.' }}
    </p>
  </div>
</template>

<style scoped>
.flow-canvas-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.flow-canvas-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.flow-canvas-demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flow-canvas-demo__telemetry {
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary);
}

.flow-canvas-demo__tip {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>

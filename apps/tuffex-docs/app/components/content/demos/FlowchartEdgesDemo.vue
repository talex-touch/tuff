<script setup lang="ts">
import type {
  FlowBackground,
  FlowEdge,
  FlowEdgeMarker,
  FlowEdgeType,
  FlowNode,
} from '@talex-touch/tuffex/flowchart'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const edgeType = ref<FlowEdgeType>('bezier')
const edgeMarker = ref<FlowEdgeMarker>('arrow')
const background = ref<FlowBackground>('dots')
const animated = ref(true)
const pulse = ref(true)
const ports = ref(true)
const activeEdgeInfo = ref<string | null>(null)

const positions = ref<Record<string, { x: number, y: number }>>({
  gateway: { x: 330, y: 16 },
  cache: { x: 148, y: 192 },
  origin: { x: 512, y: 192 },
  fallback: { x: 512, y: 368 },
})

const nodes = computed<FlowNode[]>(() => [
  {
    id: 'gateway',
    label: zh.value ? '网关入口' : 'Edge Gateway',
    tone: 'accent',
    status: 'active',
    title: zh.value ? 'API 路由分发' : 'API Route Dispatch',
    description: zh.value ? '解析令牌并检查边缘缓存' : 'Validate token and probe edge cache',
    meta: 'GET /v2/plugins',
    badge: 'TLS 1.3',
    width: 236,
    ...positions.value.gateway!,
  },
  {
    id: 'cache',
    label: zh.value ? '缓存命中' : 'Cache Hit',
    tone: 'green',
    status: 'success',
    title: zh.value ? '边缘 KV 响应' : 'Edge KV Response',
    description: zh.value ? '直接返回热数据快照' : 'Serve warm snapshot immediately',
    meta: 'HIT · p99 4ms',
    badge: '200',
    width: 216,
    ...positions.value.cache!,
  },
  {
    id: 'origin',
    label: zh.value ? '源站回源' : 'Origin Fetch',
    tone: 'violet',
    status: 'running',
    title: zh.value ? '主集群查询' : 'Primary Cluster',
    description: zh.value ? '回源拉取并异步刷新缓存' : 'Fetch upstream and refresh cache',
    meta: 'MISS · 42ms',
    badge: 'Sync',
    width: 216,
    ...positions.value.origin!,
  },
  {
    id: 'fallback',
    label: zh.value ? '降级保护' : 'Circuit Breaker',
    tone: 'orange',
    status: 'warning',
    title: zh.value ? '陈旧快照兜底' : 'Stale Snapshot Fallback',
    description: zh.value ? '源站超时 300ms 时自动切换' : 'Engage when upstream exceeds 300ms',
    meta: 'stale-while-revalidate',
    width: 216,
    ...positions.value.fallback!,
  },
])

const edges = computed<FlowEdge[]>(() => [
  {
    id: 'e-cache',
    from: 'gateway',
    to: 'cache',
    tone: 'green',
    animated: animated.value,
    pulse: pulse.value,
    label: zh.value ? '命中 · 4ms' : 'HIT · 4ms',
  },
  {
    id: 'e-origin',
    from: 'gateway',
    to: 'origin',
    tone: 'accent',
    animated: animated.value,
    pulse: pulse.value,
    label: zh.value ? '回源 · 42ms' : 'MISS · 42ms',
  },
  {
    id: 'e-fallback',
    from: 'origin',
    to: 'fallback',
    tone: 'orange',
    dashed: true,
    label: zh.value ? '超时降级' : 'Timeout fallback',
  },
])

function place({ id, x, y }: { id: string, x: number, y: number }) {
  if (positions.value[id])
    positions.value[id] = { x, y }
}

function onEdgeClick({ edge }: { edge: FlowEdge }) {
  activeEdgeInfo.value = `${edge.from} → ${edge.to}${edge.label ? ` (${edge.label})` : ''}`
}

const CURVES: { value: FlowEdgeType, zh: string, en: string }[] = [
  { value: 'bezier', zh: '贝塞尔', en: 'Bezier' },
  { value: 'smoothstep', zh: '圆角折线', en: 'Smoothstep' },
  { value: 'straight', zh: '直线', en: 'Straight' },
]

const MARKERS: { value: FlowEdgeMarker, zh: string, en: string }[] = [
  { value: 'arrow', zh: '箭头', en: 'Arrow' },
  { value: 'dot', zh: '圆点', en: 'Dot' },
  { value: 'none', zh: '无端点', en: 'None' },
]

const BACKGROUNDS: { value: FlowBackground, zh: string, en: string }[] = [
  { value: 'dots', zh: '点阵', en: 'Dots' },
  { value: 'lines', zh: '网格', en: 'Lines' },
  { value: 'cross', zh: '十字', en: 'Cross' },
  { value: 'none', zh: '纯净', en: 'None' },
]
</script>

<template>
  <div class="not-prose flow-edges-demo">
    <div class="flow-edges-demo__controls">
      <div class="flow-edges-demo__group">
        <span class="flow-edges-demo__label">{{ zh ? '曲线' : 'Curve' }}</span>
        <TxButton
          v-for="item in CURVES"
          :key="item.value"
          size="sm"
          :variant="edgeType === item.value ? 'primary' : 'secondary'"
          @click="edgeType = item.value"
        >
          {{ zh ? item.zh : item.en }}
        </TxButton>
      </div>

      <div class="flow-edges-demo__group">
        <span class="flow-edges-demo__label">{{ zh ? '端点' : 'Marker' }}</span>
        <TxButton
          v-for="item in MARKERS"
          :key="item.value"
          size="sm"
          :variant="edgeMarker === item.value ? 'primary' : 'secondary'"
          @click="edgeMarker = item.value"
        >
          {{ zh ? item.zh : item.en }}
        </TxButton>
      </div>

      <div class="flow-edges-demo__group">
        <span class="flow-edges-demo__label">{{ zh ? '画布' : 'Grid' }}</span>
        <TxButton
          v-for="item in BACKGROUNDS"
          :key="item.value"
          size="sm"
          :variant="background === item.value ? 'primary' : 'secondary'"
          @click="background = item.value"
        >
          {{ zh ? item.zh : item.en }}
        </TxButton>
      </div>

      <div class="flow-edges-demo__group">
        <span class="flow-edges-demo__label">{{ zh ? '光效' : 'Effects' }}</span>
        <TxButton size="sm" :variant="pulse ? 'primary' : 'secondary'" @click="pulse = !pulse">
          {{ zh ? '脉冲光束' : 'Pulse' }}
        </TxButton>
        <TxButton size="sm" :variant="animated ? 'primary' : 'secondary'" @click="animated = !animated">
          {{ zh ? '虚线流动' : 'Animated' }}
        </TxButton>
        <TxButton size="sm" :variant="ports ? 'primary' : 'secondary'" @click="ports = !ports">
          {{ zh ? '连接锚点' : 'Ports' }}
        </TxButton>
      </div>
    </div>

    <div class="flow-edges-demo__stage">
      <TxFlowchart
        :nodes="nodes"
        :edges="edges"
        :height="504"
        :edge-type="edgeType"
        :edge-marker="edgeMarker"
        :background="background"
        :ports="ports"
        draggable
        :aria-label="zh ? '连线与画布效果演示' : 'Edge effects and canvas patterns'"
        @node-move="place"
        @edge-click="onEdgeClick"
        @canvas-click="activeEdgeInfo = null"
      />
    </div>

    <div class="flow-edges-demo__foot">
      <span v-if="activeEdgeInfo">
        {{ zh ? '已选连线：' : 'Selected edge: ' }}<strong>{{ activeEdgeInfo }}</strong>
      </span>
      <span v-else>
        {{ zh ? '点击任意连线或标签可触发 edge-click 事件' : 'Click any connector or pill label to trigger edge-click' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.flow-edges-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.flow-edges-demo__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.flow-edges-demo__group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.flow-edges-demo__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-text-color-secondary);
  margin-right: 2px;
}

.flow-edges-demo__stage {
  width: 100%;
  max-width: 660px;
  margin: 0 auto;
}

.flow-edges-demo__foot {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  text-align: center;
}

.flow-edges-demo__foot strong {
  color: var(--tx-text-color-primary);
  font-weight: 500;
}
</style>

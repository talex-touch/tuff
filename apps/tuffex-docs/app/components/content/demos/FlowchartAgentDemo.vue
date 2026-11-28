<script setup lang="ts">
import type { FlowEdge, FlowNode, TxFlowchartInstance } from '@talex-touch/tuffex/flowchart'
import { computed, nextTick, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

type RouteMode = 'rag' | 'sql' | 'sandbox' | 'parallel'

const flowRef = ref<TxFlowchartInstance | null>(null)
const routeMode = ref<RouteMode>('rag')
const selectedId = ref<string | null>('router')

const MODES: { id: RouteMode, zh: string, en: string }[] = [
  { id: 'rag', zh: '知识库检索', en: 'Vector RAG' },
  { id: 'sql', zh: 'SQL 分析', en: 'SQL Tool' },
  { id: 'sandbox', zh: '代码沙箱', en: 'Code Sandbox' },
  { id: 'parallel', zh: '全分支并行', en: 'Parallel Fan-out' },
]

function isBranchActive(branch: 'rag' | 'sql' | 'sandbox'): boolean {
  return routeMode.value === 'parallel' || routeMode.value === branch
}

const nodes = computed<FlowNode[]>(() => [
  {
    id: 'prompt',
    label: zh.value ? '输入' : 'Input',
    tone: 'violet',
    status: 'success',
    title: zh.value ? '用户提问' : 'User Prompt',
    description: zh.value ? '携带工作区上下文与附件' : 'Workspace context & attachments',
    badge: '412 tok',
    width: 230,
    x: 340,
    y: 18,
  },
  {
    id: 'router',
    label: zh.value ? '路由' : 'Router',
    tone: 'accent',
    status: 'active',
    title: zh.value ? '意图分类与调度' : 'Intent Router',
    description: zh.value ? '选择最优工具链与并发策略' : 'Pick optimal tool branch & policy',
    badge: '18ms',
    width: 230,
    x: 340,
    y: 146,
  },
  {
    id: 'rag',
    label: 'RAG',
    tone: 'green',
    status: isBranchActive('rag') ? 'running' : 'idle',
    title: zh.value ? '向量知识检索' : 'Vector Search',
    description: zh.value ? 'Top-6 文档重排' : 'Top-6 reranked chunks',
    meta: isBranchActive('rag') ? '6 hits · 0.91' : 'standby',
    width: 196,
    x: 112,
    y: 288,
  },
  {
    id: 'sql',
    label: 'Tool',
    tone: 'orange',
    status: isBranchActive('sql') ? 'running' : 'idle',
    title: zh.value ? '只读 SQL 查询' : 'Read-only SQL',
    description: zh.value ? '聚合指标与趋势统计' : 'Aggregate metrics & cohorts',
    meta: isBranchActive('sql') ? '14 rows · 34ms' : 'standby',
    width: 196,
    x: 340,
    y: 288,
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    tone: 'violet',
    status: isBranchActive('sandbox') ? 'running' : 'idle',
    title: zh.value ? '隔离代码执行' : 'Code Sandbox',
    description: zh.value ? '运行校验脚本与图表计算' : 'Verify formulas & compute diffs',
    meta: isBranchActive('sandbox') ? 'exit 0 · 86ms' : 'standby',
    width: 196,
    x: 568,
    y: 288,
  },
  {
    id: 'synth',
    label: zh.value ? '输出' : 'Synthesis',
    tone: 'accent',
    status: 'success',
    title: zh.value ? '流式答案生成' : 'Streaming Synthesis',
    description: zh.value ? '附带内联引用与安全校验' : 'Inline citations & policy check',
    badge: 'Stream',
    width: 248,
    x: 340,
    y: 432,
  },
])

const edges = computed<FlowEdge[]>(() => {
  const ragOn = isBranchActive('rag')
  const sqlOn = isBranchActive('sql')
  const sbOn = isBranchActive('sandbox')
  return [
    { from: 'prompt', to: 'router', tone: 'violet', pulse: true, label: zh.value ? '上下文' : 'context' },
    { from: 'router', to: 'rag', tone: ragOn ? 'green' : 'neutral', pulse: ragOn, animated: ragOn, dashed: !ragOn, label: ragOn ? '92%' : undefined },
    { from: 'router', to: 'sql', tone: sqlOn ? 'orange' : 'neutral', pulse: sqlOn, animated: sqlOn, dashed: !sqlOn, label: sqlOn ? 'SQL' : undefined },
    { from: 'router', to: 'sandbox', tone: sbOn ? 'violet' : 'neutral', pulse: sbOn, animated: sbOn, dashed: !sbOn, label: sbOn ? 'Py' : undefined },
    { from: 'rag', to: 'synth', tone: ragOn ? 'green' : 'neutral', pulse: ragOn, dashed: !ragOn },
    { from: 'sql', to: 'synth', tone: sqlOn ? 'orange' : 'neutral', pulse: sqlOn, dashed: !sqlOn },
    { from: 'sandbox', to: 'synth', tone: sbOn ? 'violet' : 'neutral', pulse: sbOn, dashed: !sbOn },
  ]
})

const selectedNode = computed(() => nodes.value.find(n => n.id === selectedId.value))

onMounted(async () => {
  await nextTick()
  flowRef.value?.fitView(20)
})
</script>

<template>
  <div class="not-prose flow-agent-demo">
    <div class="flow-agent-demo__bar">
      <div class="flow-agent-demo__tabs">
        <TxButton
          v-for="item in MODES"
          :key="item.id"
          size="sm"
          :variant="routeMode === item.id ? 'primary' : 'secondary'"
          @click="routeMode = item.id"
        >
          {{ zh ? item.zh : item.en }}
        </TxButton>
      </div>
    </div>

    <TxFlowchart
      ref="flowRef"
      :nodes="nodes"
      :edges="edges"
      :height="540"
      edge-marker="arrow"
      :selected-id="selectedId"
      ports
      pannable
      zoomable
      controls
      :aria-label="zh ? 'AI Agent 多分支编排画布' : 'AI Agent multi-branch orchestration canvas'"
      @node-click="({ id }) => (selectedId = id)"
      @canvas-click="selectedId = null"
    />

    <div v-if="selectedNode" class="flow-agent-demo__detail">
      <span class="flow-agent-demo__detail-chip">{{ selectedNode.label }}</span>
      <strong>{{ selectedNode.title }}</strong>
      <span class="flow-agent-demo__detail-desc">{{ selectedNode.description }}</span>
      <span v-if="selectedNode.meta || selectedNode.badge" class="flow-agent-demo__detail-meta">
        {{ selectedNode.meta ?? selectedNode.badge }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.flow-agent-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.flow-agent-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.flow-agent-demo__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flow-agent-demo__detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  font-size: 12.5px;
}

.flow-agent-demo__detail-chip {
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 11px;
  font-weight: 500;
}

.flow-agent-demo__detail strong {
  color: var(--tx-text-color-primary);
  font-weight: 600;
}

.flow-agent-demo__detail-desc {
  color: var(--tx-text-color-secondary);
}

.flow-agent-demo__detail-meta {
  margin-left: auto;
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  color: var(--tx-text-color-secondary);
}
</style>

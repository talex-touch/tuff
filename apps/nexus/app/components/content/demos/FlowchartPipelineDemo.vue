<script setup lang="ts">
import type { FlowEdge, FlowNode, FlowNodeStatus, TxFlowchartInstance } from '@talex-touch/tuffex/flowchart'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

type StageId = 'push' | 'lint' | 'unit' | 'security' | 'deploy'

const flowRef = ref<TxFlowchartInstance | null>(null)
const selectedId = ref<StageId>('lint')
const running = ref(false)
const activeEdges = ref<Set<string>>(new Set())
const failedMode = ref(false)

const statuses = reactive<Record<StageId, FlowNodeStatus>>({
  push: 'success',
  lint: 'success',
  unit: 'running',
  security: 'running',
  deploy: 'idle',
})

const timings = reactive<Record<StageId, string>>({
  push: '0.2s',
  lint: '4.1s',
  unit: '…',
  security: '…',
  deploy: '—',
})

const timers: ReturnType<typeof setTimeout>[] = []

function clearTimers() {
  while (timers.length)
    clearTimeout(timers.pop())
}

function schedule(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

function resetRun() {
  clearTimers()
  running.value = false
  failedMode.value = false
  statuses.push = 'idle'
  statuses.lint = 'idle'
  statuses.unit = 'idle'
  statuses.security = 'idle'
  statuses.deploy = 'idle'
  timings.push = '—'
  timings.lint = '—'
  timings.unit = '—'
  timings.security = '—'
  timings.deploy = '—'
  activeEdges.value = new Set()
}

function startRun(simulateFailure = false) {
  resetRun()
  running.value = true
  failedMode.value = simulateFailure

  if (prefersReducedMotion()) {
    statuses.push = 'success'
    statuses.lint = 'success'
    statuses.unit = simulateFailure ? 'error' : 'success'
    statuses.security = 'success'
    statuses.deploy = simulateFailure ? 'warning' : 'success'
    timings.push = '0.2s'
    timings.lint = '4.1s'
    timings.unit = simulateFailure ? '1 failed' : '6.8s'
    timings.security = '3.2s'
    timings.deploy = simulateFailure ? 'Blocked' : '2.4s'
    activeEdges.value = new Set()
    running.value = false
    return
  }

  statuses.push = 'running'
  selectedId.value = 'push'

  schedule(450, () => {
    statuses.push = 'success'
    timings.push = '0.2s'
    activeEdges.value = new Set(['push>lint'])
    statuses.lint = 'running'
    selectedId.value = 'lint'
  })

  schedule(1250, () => {
    statuses.lint = 'success'
    timings.lint = '4.1s'
    activeEdges.value = new Set(['lint>unit', 'lint>security'])
    statuses.unit = 'running'
    statuses.security = 'running'
    selectedId.value = 'unit'
  })

  schedule(2300, () => {
    statuses.security = 'success'
    timings.security = '3.2s'
    if (simulateFailure) {
      statuses.unit = 'error'
      timings.unit = zh.value ? '1 项失败' : '1 failed'
      statuses.deploy = 'warning'
      timings.deploy = zh.value ? '已阻断' : 'Blocked'
      activeEdges.value = new Set(['unit>deploy'])
      selectedId.value = 'unit'
      running.value = false
      return
    }
    statuses.unit = 'success'
    timings.unit = '6.8s'
    activeEdges.value = new Set(['unit>deploy', 'security>deploy'])
    statuses.deploy = 'running'
    selectedId.value = 'deploy'
  })

  if (!simulateFailure) {
    schedule(3300, () => {
      statuses.deploy = 'success'
      timings.deploy = '2.4s'
      activeEdges.value = new Set()
      running.value = false
    })
  }
}

const nodes = computed<FlowNode[]>(() => [
  {
    id: 'push',
    label: zh.value ? '触发' : 'Source',
    tone: 'violet',
    status: statuses.push,
    title: 'Git Push',
    description: 'main · #2316',
    meta: timings.push,
    width: 152,
    x: 92,
    y: 112,
  },
  {
    id: 'lint',
    label: zh.value ? '检查' : 'Verify',
    tone: 'accent',
    status: statuses.lint,
    title: zh.value ? '类型与规范' : 'Types & Lint',
    description: 'vue-tsc + eslint',
    meta: timings.lint,
    width: 166,
    x: 336,
    y: 112,
  },
  {
    id: 'unit',
    label: zh.value ? '并行测试' : 'Parallel',
    tone: statuses.unit === 'error' ? 'red' : 'green',
    status: statuses.unit,
    title: zh.value ? '单元测试' : 'Unit Tests',
    description: 'vitest · 194 specs',
    meta: timings.unit,
    width: 168,
    x: 584,
    y: 34,
  },
  {
    id: 'security',
    label: zh.value ? '并行审计' : 'Parallel',
    tone: 'orange',
    status: statuses.security,
    title: zh.value ? '安全扫描' : 'Security Audit',
    description: zh.value ? '依赖与产物校验' : 'Deps & bundle gate',
    meta: timings.security,
    width: 168,
    x: 584,
    y: 192,
  },
  {
    id: 'deploy',
    label: zh.value ? '发布' : 'Release',
    tone: statuses.deploy === 'warning' ? 'orange' : 'accent',
    status: statuses.deploy,
    title: zh.value ? '金丝雀 10%' : 'Canary 10%',
    description: 'Cloudflare Pages',
    meta: timings.deploy,
    width: 164,
    x: 824,
    y: 112,
  },
])

const edges = computed<FlowEdge[]>(() => {
  const isLive = (key: string) => activeEdges.value.has(key)
  const blocked = failedMode.value && statuses.unit === 'error'
  return [
    {
      from: 'push',
      to: 'lint',
      tone: statuses.push === 'success' ? 'green' : 'neutral',
      pulse: isLive('push>lint'),
      animated: isLive('push>lint'),
      label: timings.push !== '—' ? timings.push : undefined,
    },
    {
      from: 'lint',
      to: 'unit',
      tone: statuses.unit === 'error' ? 'red' : statuses.lint === 'success' ? 'accent' : 'neutral',
      pulse: isLive('lint>unit') || statuses.unit === 'running',
      animated: isLive('lint>unit') || statuses.unit === 'running',
    },
    {
      from: 'lint',
      to: 'security',
      tone: statuses.lint === 'success' ? 'orange' : 'neutral',
      pulse: isLive('lint>security') || statuses.security === 'running',
      animated: isLive('lint>security') || statuses.security === 'running',
    },
    {
      from: 'unit',
      to: 'deploy',
      tone: blocked ? 'red' : statuses.unit === 'success' ? 'green' : 'neutral',
      dashed: blocked,
      pulse: isLive('unit>deploy') && !blocked,
      animated: isLive('unit>deploy') && !blocked,
      label: blocked ? (zh.value ? '已阻断' : 'Blocked') : undefined,
    },
    {
      from: 'security',
      to: 'deploy',
      tone: statuses.security === 'success' && !blocked ? 'green' : 'neutral',
      pulse: isLive('security>deploy'),
      animated: isLive('security>deploy'),
    },
  ]
})

const selectedNode = computed(() => nodes.value.find(n => n.id === selectedId.value))

onMounted(async () => {
  await nextTick()
  flowRef.value?.fitView(26)
})

onBeforeUnmount(clearTimers)
</script>

<template>
  <div class="not-prose flow-pipe-demo">
    <div class="flow-pipe-demo__bar">
      <div class="flow-pipe-demo__actions">
        <TxButton size="sm" variant="primary" :disabled="running" @click="startRun(false)">
          <i class="i-carbon-play" aria-hidden="true" />
          {{ zh ? '运行流水线' : 'Run pipeline' }}
        </TxButton>
        <TxButton size="sm" variant="secondary" :disabled="running" @click="startRun(true)">
          <i class="i-carbon-warning-filled" aria-hidden="true" />
          {{ zh ? '模拟失败阻断' : 'Simulate failure' }}
        </TxButton>
        <TxButton size="sm" variant="ghost" @click="resetRun">
          {{ zh ? '重置' : 'Reset' }}
        </TxButton>
      </div>
      <span v-if="selectedNode" class="flow-pipe-demo__inspector">
        <strong>{{ selectedNode.title }}</strong> · {{ selectedNode.status }} · {{ selectedNode.meta }}
      </span>
    </div>

    <TxFlowchart
      ref="flowRef"
      :nodes="nodes"
      :edges="edges"
      :height="330"
      direction="horizontal"
      edge-marker="arrow"
      :selected-id="selectedId"
      ports
      pannable
      zoomable
      controls
      :aria-label="zh ? '横向 CI/CD 发布流水线' : 'Horizontal CI/CD release pipeline'"
      @node-click="({ id }) => (selectedId = id as StageId)"
    />
  </div>
</template>

<style scoped>
.flow-pipe-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.flow-pipe-demo__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.flow-pipe-demo__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.flow-pipe-demo__inspector {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary);
}

.flow-pipe-demo__inspector strong {
  color: var(--tx-text-color-primary);
  font-weight: 500;
}
</style>

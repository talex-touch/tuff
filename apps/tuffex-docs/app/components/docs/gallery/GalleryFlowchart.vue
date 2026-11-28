<script setup lang="ts">
import type { FlowEdge, FlowNode } from '@talex-touch/tuffex/flowchart'
import { computed, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// Cycles between two active branches so the overview cell previews live pulse
// beams, status halos, edge labels and draggable cards at a glance.
const activeBranch = ref<'cache' | 'llm'>('cache')

useGalleryLoop(() => {
  activeBranch.value = activeBranch.value === 'cache' ? 'llm' : 'cache'
}, 2800, 1800)

const positions = ref<Record<'trigger' | 'cache' | 'llm', { x: number, y: number }>>({
  trigger: { x: 204, y: 10 },
  cache: { x: 106, y: 176 },
  llm: { x: 302, y: 176 },
})

const nodes = computed<FlowNode[]>(() => [
  {
    id: 'trigger',
    label: zh.value ? '路由' : 'Router',
    tone: 'violet',
    status: 'active',
    title: zh.value ? '智能请求分发' : 'Smart Dispatch',
    description: zh.value ? '按命中率选择通道' : 'Route by cache confidence',
    width: 214,
    ...positions.value.trigger,
  },
  {
    id: 'cache',
    label: zh.value ? '缓存' : 'Cache',
    tone: 'green',
    status: activeBranch.value === 'cache' ? 'success' : 'idle',
    title: zh.value ? '语义缓存' : 'Semantic Cache',
    meta: '4ms',
    width: 168,
    ...positions.value.cache,
  },
  {
    id: 'llm',
    label: 'Agent',
    tone: 'accent',
    status: activeBranch.value === 'llm' ? 'running' : 'idle',
    title: zh.value ? '模型推理' : 'Model Synthesis',
    meta: '380ms',
    width: 168,
    ...positions.value.llm,
  },
])

const edges = computed<FlowEdge[]>(() => [
  {
    from: 'trigger',
    to: 'cache',
    tone: activeBranch.value === 'cache' ? 'green' : 'neutral',
    pulse: activeBranch.value === 'cache',
    animated: activeBranch.value === 'cache',
    dashed: activeBranch.value !== 'cache',
    label: zh.value ? '命中' : 'Hit',
  },
  {
    from: 'trigger',
    to: 'llm',
    tone: activeBranch.value === 'llm' ? 'accent' : 'neutral',
    pulse: activeBranch.value === 'llm',
    animated: activeBranch.value === 'llm',
    dashed: activeBranch.value !== 'llm',
    label: zh.value ? '推理' : 'Infer',
  },
])

function place({ id, x, y }: { id: string, x: number, y: number }) {
  if (id === 'trigger' || id === 'cache' || id === 'llm')
    positions.value[id] = { x, y }
}
</script>

<template>
  <div class="gallery-flow-specimen">
    <TxFlowchart
      :nodes="nodes"
      :edges="edges"
      :height="294"
      edge-marker="arrow"
      ports
      draggable
      :aria-label="zh ? '智能路由工作流预览' : 'Smart routing workflow preview'"
      @node-move="place"
    />
  </div>
</template>

<style scoped>
.gallery-flow-specimen {
  width: min(412px, 100%);
}
</style>

<script setup lang="ts">
import type { FlowEdge, FlowNode, TxFlowchartInstance } from '@talex-touch/tuffex/flowchart'
import { computed, nextTick, onMounted, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

type RiskTier = 'low' | 'medium' | 'high'

const flowRef = ref<TxFlowchartInstance | null>(null)
const tier = ref<RiskTier>('medium')

const TIERS: { id: RiskTier, zh: string, en: string }[] = [
  { id: 'low', zh: '低风险直通', en: 'Low Risk (Auto)' },
  { id: 'medium', zh: '中风险审批', en: 'Medium (Review)' },
  { id: 'high', zh: '高风险拦截', en: 'High (Block)' },
]

const nodes = computed<FlowNode[]>(() => [
  {
    id: 'submit',
    label: zh.value ? '提交' : 'Request',
    tone: 'violet',
    status: 'success',
    title: zh.value ? '版本发布申请' : 'Release Request',
    description: 'v2.9.0 · CoreApp + Nexus',
    width: 224,
    x: 340,
    y: 18,
  },
  {
    id: 'risk',
    label: zh.value ? '评估' : 'Policy',
    tone: tier.value === 'high' ? 'red' : tier.value === 'medium' ? 'orange' : 'green',
    status: 'active',
    title: zh.value ? '变更风险评分' : 'Risk Evaluation',
    description: tier.value === 'low'
      ? (zh.value ? '仅文案变更 · 风险分 12' : 'Copy only · Score 12')
      : tier.value === 'medium'
        ? (zh.value ? '含迁移脚本 · 风险分 58' : 'Migration included · Score 58')
        : (zh.value ? '签名异常 · 风险分 91' : 'Signature mismatch · Score 91'),
    badge: tier.value === 'low' ? '12' : tier.value === 'medium' ? '58' : '91',
    width: 240,
    x: 340,
    y: 146,
  },
  {
    id: 'auto',
    label: zh.value ? '自动' : 'Auto',
    tone: 'green',
    status: tier.value === 'low' ? 'success' : 'idle',
    title: zh.value ? '自动放行' : 'Auto Approve',
    description: zh.value ? '免人工确认进入发布队列' : 'Proceed straight to rollout',
    width: 194,
    x: 112,
    y: 292,
  },
  {
    id: 'review',
    label: zh.value ? '审批' : 'Approval',
    tone: 'orange',
    status: tier.value === 'medium' ? 'running' : 'idle',
    title: zh.value ? '负责人会签' : 'Owner Sign-off',
    description: zh.value ? '需 2 名维护者确认' : '2 maintainers required',
    width: 194,
    x: 340,
    y: 292,
  },
  {
    id: 'block',
    label: zh.value ? '阻断' : 'Blocked',
    tone: 'red',
    status: tier.value === 'high' ? 'error' : 'idle',
    title: zh.value ? '拦截并回滚' : 'Reject & Rollback',
    description: zh.value ? '冻结流水线并通知值班' : 'Freeze job and page on-call',
    width: 194,
    x: 568,
    y: 292,
  },
  {
    id: 'prod',
    label: zh.value ? '上线' : 'Production',
    tone: 'green',
    status: tier.value === 'low' ? 'success' : tier.value === 'medium' ? 'warning' : 'idle',
    title: zh.value ? '全量发布' : 'Production Rollout',
    description: tier.value === 'low'
      ? (zh.value ? '已推送至稳定通道' : 'Published to stable channel')
      : tier.value === 'medium'
        ? (zh.value ? '等待会签完成后执行' : 'Waiting for sign-off')
        : (zh.value ? '未触发' : 'Not reached'),
    width: 224,
    x: 226,
    y: 438,
  },
])

const edges = computed<FlowEdge[]>(() => [
  {
    from: 'submit',
    to: 'risk',
    tone: 'violet',
    pulse: true,
    label: zh.value ? '静态审计' : 'audit',
  },
  {
    from: 'risk',
    to: 'auto',
    tone: tier.value === 'low' ? 'green' : 'neutral',
    pulse: tier.value === 'low',
    animated: tier.value === 'low',
    dashed: tier.value !== 'low',
    label: '< 20',
  },
  {
    from: 'risk',
    to: 'review',
    tone: tier.value === 'medium' ? 'orange' : 'neutral',
    pulse: tier.value === 'medium',
    animated: tier.value === 'medium',
    dashed: tier.value !== 'medium',
    label: '20–70',
  },
  {
    from: 'risk',
    to: 'block',
    tone: tier.value === 'high' ? 'red' : 'neutral',
    pulse: tier.value === 'high',
    animated: tier.value === 'high',
    dashed: tier.value !== 'high',
    label: '> 70',
  },
  {
    from: 'auto',
    to: 'prod',
    tone: tier.value === 'low' ? 'green' : 'neutral',
    pulse: tier.value === 'low',
    dashed: tier.value !== 'low',
  },
  {
    from: 'review',
    to: 'prod',
    tone: tier.value === 'medium' ? 'orange' : 'neutral',
    animated: tier.value === 'medium',
    dashed: true,
    label: tier.value === 'medium' ? (zh.value ? '待批准' : 'Pending') : undefined,
  },
])

onMounted(async () => {
  await nextTick()
  flowRef.value?.fitView(20)
})
</script>

<template>
  <div class="not-prose flow-approval-demo">
    <div class="flow-approval-demo__bar">
      <TxButton
        v-for="item in TIERS"
        :key="item.id"
        size="sm"
        :variant="tier === item.id ? 'primary' : 'secondary'"
        @click="tier = item.id"
      >
        {{ zh ? item.zh : item.en }}
      </TxButton>
    </div>

    <TxFlowchart
      ref="flowRef"
      :nodes="nodes"
      :edges="edges"
      :height="548"
      edge-type="smoothstep"
      background="lines"
      edge-marker="arrow"
      ports
      pannable
      zoomable
      controls
      :aria-label="zh ? '审批与风险分流状态机' : 'Approval and risk routing state machine'"
    />
  </div>
</template>

<style scoped>
.flow-approval-demo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.flow-approval-demo__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>

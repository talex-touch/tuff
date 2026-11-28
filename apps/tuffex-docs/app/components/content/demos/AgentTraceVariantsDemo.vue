<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const opened = ref<string | null>(null)

// The switch is a demo affordance, not a component feature: `TxAgentTrace`
// takes a `variant` and knows nothing about being switched. Upstream drives its
// own showcase the same way.
//
// Every dataset here is a settled run — the live timeline (spinner, staged row
// arrival) is AgentTraceStepsDemo's job, above.
const variant = ref<'steps' | 'reasoning' | 'search' | 'coding'>('steps')

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      openedPrefix: '宿主收到打开请求：',
      openedNone: '点击来源行——组件只派发 open，导航由宿主决定。',
      tabs: { steps: '步骤', reasoning: '推理', search: '检索', coding: '工具' },
      steps: [
        { id: 'read', primary: '读取库存快照', status: 'done' as const },
        { id: 'compare', primary: '比对三家供应商报价', status: 'done' as const },
        { id: 'draft', primary: '起草补货单', status: 'done' as const },
      ],
      reasoning: [
        { id: 'demand', primary: '夏季对核果类口味的需求会走高，桃子和杏子领跑。' },
        { id: 'cones', primary: '在推华夫碗套餐之前，我应该先确认蛋筒库存。' },
      ],
      search: [
        { id: 'joy', primary: 'Joy Cone', secondary: 'joycone.com', href: 'https://joycone.com/' },
        { id: 'webstaurant', primary: 'WebstaurantStore', secondary: 'webstaurantstore.com', href: 'https://www.webstaurantstore.com/' },
        { id: 'konery', primary: 'The Konery', secondary: 'thekonery.com', href: 'https://www.thekonery.com/' },
      ],
      coding: [
        { id: 'read', primary: '读取', secondary: 'flavors.ts', mono: true },
        { id: 'edit', primary: '编辑', secondary: 'ChurnSchedule.tsx', mono: true, added: 74, removed: 41 },
        { id: 'run', primary: '执行', secondary: 'npm run freeze', mono: true },
      ],
      query: '最好的华夫蛋筒供应商',
      more: '还有 7 条',
      stepsDone: '走完 3 步',
      searchDone: '已搜索网页',
      codingDone: '执行了 3 个工具',
      reasoningDone: '思考了 4 秒',
    }
  }

  return {
    openedPrefix: 'Host received an open request: ',
    openedNone: 'Click a source row — the component only emits open; the host decides navigation.',
    tabs: { steps: 'Steps', reasoning: 'Reasoning', search: 'Search', coding: 'Coding' },
    steps: [
      { id: 'read', primary: 'Read the inventory snapshot', status: 'done' as const },
      { id: 'compare', primary: 'Compare three supplier quotes', status: 'done' as const },
      { id: 'draft', primary: 'Draft the restock order', status: 'done' as const },
    ],
    reasoning: [
      { id: 'demand', primary: 'Summer demand spikes for stone-fruit flavors — peach and apricot lead.' },
      { id: 'cones', primary: 'I should check cone inventory before promoting a waffle-bowl special.' },
    ],
    search: [
      { id: 'joy', primary: 'Joy Cone', secondary: 'joycone.com', href: 'https://joycone.com/' },
      { id: 'webstaurant', primary: 'WebstaurantStore', secondary: 'webstaurantstore.com', href: 'https://www.webstaurantstore.com/' },
      { id: 'konery', primary: 'The Konery', secondary: 'thekonery.com', href: 'https://www.thekonery.com/' },
    ],
    coding: [
      { id: 'read', primary: 'Read', secondary: 'flavors.ts', mono: true },
      { id: 'edit', primary: 'Edit', secondary: 'ChurnSchedule.tsx', mono: true, added: 74, removed: 41 },
      { id: 'run', primary: 'Run', secondary: 'npm run freeze', mono: true },
    ],
    query: 'best waffle cone supplier',
    more: '+7 more',
    stepsDone: 'Ran 3 steps',
    searchDone: 'Searched the web',
    codingDone: 'Ran 3 tools',
    reasoningDone: 'Thought for 4 seconds',
  }
})

const doneLabel = computed(() => ({
  steps: copy.value.stepsDone,
  reasoning: copy.value.reasoningDone,
  search: copy.value.searchDone,
  coding: copy.value.codingDone,
}[variant.value]))

const rows = computed(() => copy.value[variant.value])

// Typed structurally rather than importing AgentTraceRow, so the demo does not
// depend on the barrel export having landed.
function onOpen(row: { primary: string, href?: string }): void {
  opened.value = row.href ?? row.primary
}
</script>

<template>
  <div class="flex max-w-[380px] flex-col gap-4">
    <TxFlatRadio v-model="variant" size="sm">
      <TxFlatRadioItem value="steps" :label="copy.tabs.steps" />
      <TxFlatRadioItem value="reasoning" :label="copy.tabs.reasoning" />
      <TxFlatRadioItem value="search" :label="copy.tabs.search" />
      <TxFlatRadioItem value="coding" :label="copy.tabs.coding" />
    </TxFlatRadio>

    <!-- Keyed on the variant so switching rebuilds the trace rather than
         morphing one shape into another — the four are different row grammars,
         not four skins of one. -->
    <TxAgentTrace
      :key="variant"
      :variant="variant"
      :rows="rows"
      :query="variant === 'search' ? copy.query : undefined"
      :more-label="variant === 'search' ? copy.more : undefined"
      :done-label="doneLabel"
      default-open
      @open="onOpen"
    />

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ opened ? `${copy.openedPrefix}${opened}` : copy.openedNone }}
    </p>
  </div>
</template>

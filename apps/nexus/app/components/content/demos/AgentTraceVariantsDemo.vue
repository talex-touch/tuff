<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const opened = ref<string | null>(null)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      openedPrefix: '宿主收到打开请求：',
      openedNone: '点击来源行——组件只派发 open，导航由宿主决定。',
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
      searchDone: '已搜索网页',
      codingDone: '执行了 3 个工具',
      reasoningDone: '思考了 4 秒',
    }
  }

  return {
    openedPrefix: 'Host received an open request: ',
    openedNone: 'Click a source row — the component only emits open; the host decides navigation.',
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
    searchDone: 'Searched the web',
    codingDone: 'Ran 3 tools',
    reasoningDone: 'Thought for 4 seconds',
  }
})

// Typed structurally rather than importing AgentTraceRow, so the demo does not
// depend on the barrel export having landed.
function onOpen(row: { primary: string, href?: string }): void {
  opened.value = row.href ?? row.primary
}
</script>

<template>
  <div class="flex max-w-[380px] flex-col gap-6">
    <TxAgentTrace
      variant="reasoning"
      :rows="copy.reasoning"
      :done-label="copy.reasoningDone"
      default-open
    />

    <TxAgentTrace
      variant="search"
      :rows="copy.search"
      :query="copy.query"
      :more-label="copy.more"
      :done-label="copy.searchDone"
      default-open
      @open="onOpen"
    />

    <TxAgentTrace
      variant="coding"
      :rows="copy.coding"
      :done-label="copy.codingDone"
      default-open
    />

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ opened ? `${copy.openedPrefix}${opened}` : copy.openedNone }}
    </p>
  </div>
</template>

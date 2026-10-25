<script setup lang="ts">
import type { SankeyLinkData, SankeyNodeData } from '@talex-touch/tuffex/charts'
import { TxSankeyChart } from '@talex-touch/tuffex/charts'
import { computed, shallowRef } from 'vue'
import { SANKEY_ZH_LABELS } from './chart-demo-locale'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? {
      names: ['自然搜索', '外部引荐', '广告', '落地页', '注册', '文档', '跳出'],
      sessions: '会话',
      bounceRate: '跳出率',
      hint: '拖动节点可重新排列；点击节点或连线。',
      clicked: (kind: 'node' | 'link', text: string) => `${kind === 'node' ? '节点' : '连线'}：${text}`,
      labels: SANKEY_ZH_LABELS,
    }
  : {
      names: ['Organic', 'Referral', 'Ads', 'Landing', 'Signup', 'Docs', 'Bounce'],
      sessions: 'Sessions',
      bounceRate: 'Bounce rate',
      hint: 'Drag a node to move it; click nodes or links.',
      clicked: (kind: 'node' | 'link', text: string) => `${kind}: ${text}`,
      labels: undefined,
    })

const nodes = computed<SankeyNodeData[]>(() => {
  const [organic, referral, ads, landing, signup, docs, bounce] = copy.value.names
  return [
    { name: organic!, value: 5200 },
    { name: referral!, value: 2100 },
    { name: ads!, value: 1400 },
    { name: landing!, value: 8700, tooltipData: { [copy.value.sessions]: 8700, [copy.value.bounceRate]: '34%' } },
    { name: signup!, value: 2600, isDrillable: true, childCount: 4 },
    { name: docs!, value: 3100 },
    { name: bounce!, value: 3000 },
  ]
})

// Landing's outflows add up to its inflow (2600 + 3100 + 3000 = 8700): a node
// whose links carry less than its own value leaves a bare tail where d3 lays
// the node out at max(in, out), which reads as an unfinished diagram.
const links: SankeyLinkData[] = [
  { source: 0, target: 3, value: 5200 },
  { source: 1, target: 3, value: 2100 },
  { source: 2, target: 3, value: 1400 },
  { source: 3, target: 4, value: 2600, isDrillable: true },
  { source: 3, target: 5, value: 3100 },
  { source: 3, target: 6, value: 3000 },
]

function formatValue(value: number): string {
  return value.toLocaleString(locale.value)
}

const lastClick = shallowRef<{ kind: 'node' | 'link', text: string } | null>(null)
const readout = computed(() => lastClick.value ? copy.value.clicked(lastClick.value.kind, lastClick.value.text) : copy.value.hint)
</script>

<template>
  <div class="sankey-demo not-prose">
    <TxSankeyChart
      :nodes="nodes"
      :links="links"
      :height="320"
      :labels="copy.labels"
      :format-value="formatValue"
      @node-click="lastClick = { kind: 'node', text: $event.name }"
      @link-click="lastClick = { kind: 'link', text: formatValue($event.value) }"
    />
    <p class="sankey-demo__readout">
      {{ readout }}
    </p>
  </div>
</template>

<style scoped>
.sankey-demo {
  width: 100%;
}

.sankey-demo__readout {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--tx-chart-text-primary, #6b7280);
}
</style>

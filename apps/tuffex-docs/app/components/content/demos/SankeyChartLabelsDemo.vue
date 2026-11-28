<script setup lang="ts">
import type { SankeyLinkData, SankeyNodeData } from '@talex-touch/tuffex/charts'
import { TxSankeyChart } from '@talex-touch/tuffex/charts'
import { computed } from 'vue'
import { SANKEY_ZH_LABELS } from './chart-demo-locale'

const { locale } = useI18n()
const copy = computed(() => locale.value === 'zh'
  ? { names: ['免费', '试用', 'Pro', '流失'], labels: SANKEY_ZH_LABELS }
  : { names: ['Free', 'Trial', 'Pro', 'Churn'], labels: undefined })

const values = [12400, 3600, 2100, 1500]
const nodes = computed<SankeyNodeData[]>(() => copy.value.names.map((name, index) => ({ name, value: values[index] })))

const links: SankeyLinkData[] = [
  { source: 0, target: 1, value: 3600 },
  { source: 1, target: 2, value: 2100 },
  { source: 1, target: 3, value: 1500 },
]
</script>

<template>
  <TxSankeyChart
    :nodes="nodes"
    :links="links"
    :height="260"
    :labels="copy.labels"
    node-label-layout="inline"
    link-color="gray"
    :node-width="12"
    :format-value="(value: number) => `${(value / 1000).toFixed(1)}k`"
  />
</template>

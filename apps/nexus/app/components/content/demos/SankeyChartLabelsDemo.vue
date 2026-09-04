<script setup lang="ts">
import type { SankeyLinkData, SankeyNodeData } from '@talex-touch/tuffex-charts'
import { TxSankeyChart } from '@talex-touch/tuffex-charts'

const nodes: SankeyNodeData[] = [
  { name: 'Free', value: 12400 },
  { name: 'Trial', value: 3600 },
  { name: 'Pro', value: 2100 },
  { name: 'Churn', value: 1500 },
]

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
    node-label-layout="inline"
    link-color="gray"
    :node-width="12"
    :format-value="(value: number) => `${(value / 1000).toFixed(1)}k`"
  />
</template>

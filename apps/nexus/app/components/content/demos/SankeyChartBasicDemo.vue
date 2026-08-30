<script setup lang="ts">
import type { SankeyLinkData, SankeyNodeData } from '@talex-touch/tuffex-charts'
import { TxSankeyChart } from '@talex-touch/tuffex-charts'
import { ref } from 'vue'

const nodes: SankeyNodeData[] = [
  { name: 'Organic', value: 5200 },
  { name: 'Referral', value: 2100 },
  { name: 'Ads', value: 1400 },
  { name: 'Landing', value: 8700, tooltipData: { Sessions: 8700, 'Bounce rate': '32%' } },
  { name: 'Signup', value: 2600, isDrillable: true, childCount: 4 },
  { name: 'Docs', value: 3100 },
]

const links: SankeyLinkData[] = [
  { source: 0, target: 3, value: 5200 },
  { source: 1, target: 3, value: 2100 },
  { source: 2, target: 3, value: 1400 },
  { source: 3, target: 4, value: 2600, isDrillable: true },
  { source: 3, target: 5, value: 3100 },
]

const lastClick = ref('')
</script>

<template>
  <div class="sankey-demo">
    <TxSankeyChart
      :nodes="nodes"
      :links="links"
      :height="320"
      @node-click="lastClick = `node: ${$event.name}`"
      @link-click="lastClick = `link: ${$event.value}`"
    />
    <p class="sankey-demo__readout">
      {{ lastClick || 'Hover for tooltips; click nodes or links.' }}
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

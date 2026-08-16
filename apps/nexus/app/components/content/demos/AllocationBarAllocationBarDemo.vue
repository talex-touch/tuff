<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const selected = ref('van')

const segments = computed(() => locale.value === 'zh'
  ? [
      { key: 'van', label: '香草', short: 'VAN', percent: 72.5, amount: '$51,785', color: 'var(--tx-bui-orange)', description: '当前库存价值的贡献快照。切换分段只换检查对象，卡片不跳。' },
      { key: 'choc', label: '巧克力', short: 'CHOC', percent: 22.8, amount: '$16,278', description: '第二大持仓，随季节波动。' },
      { key: 'mint', label: '薄荷', short: 'MINT', percent: 4.7, amount: '$3,357', description: '尾部份额，主要来自限定口味。' },
    ]
  : [
      { key: 'van', label: 'Vanilla', short: 'VAN', percent: 72.5, amount: '$51,785', color: 'var(--tx-bui-orange)', description: 'Contribution snapshot across current inventory value. Selecting a segment changes the inspected group without moving the card.' },
      { key: 'choc', label: 'Chocolate', short: 'CHOC', percent: 22.8, amount: '$16,278', description: 'The second position, swinging with the season.' },
      { key: 'mint', label: 'Mint', short: 'MINT', percent: 4.7, amount: '$3,357', description: 'The tail share, mostly limited runs.' },
    ])

const active = computed(() => segments.value.find(segment => segment.key === selected.value))
const heading = computed(() => locale.value === 'zh' ? '香草占比' : 'Vanilla allocation')
</script>

<template>
  <div class="allocation-demo">
    <span class="allocation-demo__heading">
      <span class="allocation-demo__mark" aria-hidden="true">V</span>
      {{ heading }}
    </span>
    <span class="allocation-demo__amount">{{ active?.amount }}</span>

    <TxAllocationBar v-model="selected" :segments="segments" detail class="allocation-demo__bar" />
  </div>
</template>

<style scoped>
.allocation-demo {
  width: 100%;
  max-width: 356px;
  padding: 12px;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.allocation-demo__heading {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-bui-ink, #1f2124);
}

.allocation-demo__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  background: var(--tx-bui-orange, #ef720c);
  border-radius: 999px;
}

.allocation-demo__amount {
  display: block;
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--tx-bui-ink, #1f2124);
  font-variant-numeric: tabular-nums;
}

.allocation-demo__bar {
  margin-top: 12px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const metrics = computed(() => locale.value === 'zh'
  ? [
      { label: '薄荷脆片', color: 'var(--tx-bui-orange)', value: -4.41, detail: '−$2,377.66' },
      { label: '开心果', color: 'var(--tx-bui-accent)', value: 1.15, detail: '+$617.22' },
    ]
  : [
      { label: 'Mint Chip', color: 'var(--tx-bui-orange)', value: -4.41, detail: '−$2,377.66' },
      { label: 'Pistachio', color: 'var(--tx-bui-accent)', value: 1.15, detail: '+$617.22' },
    ])

const note = computed(() => locale.value === 'zh'
  ? '负号是 U+2212（−），与 ASCII 连字符（-）在等宽数字下的宽度与高度都不同。'
  : 'The minus is U+2212 (−); under tabular figures it differs from an ASCII hyphen (-) in both width and height.')
</script>

<template>
  <div class="metric-demo">
    <div class="metric-demo__row">
      <TxInsightMetric
        v-for="metric in metrics"
        :key="metric.label"
        :label="metric.label"
        :color="metric.color"
        :value="metric.value"
        :detail="metric.detail"
      />
    </div>
    <p class="metric-demo__note">
      {{ note }}
    </p>
  </div>
</template>

<style scoped>
.metric-demo {
  width: 100%;
  max-width: 344px;
  padding: 12px;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.metric-demo__row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.metric-demo__note {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--tx-bui-ink-3, #9a9da3);
}
</style>

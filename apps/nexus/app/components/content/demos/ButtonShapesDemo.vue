<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh')
    return { dashed: '虚线', plain: '朴素', round: '圆角', small: '小号编辑', medium: '默认编辑', large: '大号编辑' }
  return { dashed: 'Dashed', plain: 'Plain', round: 'Round', small: 'Small edit', medium: 'Default edit', large: 'Large edit' }
})
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton dashed>
      {{ labels.dashed }}
    </TxButton>
    <TxButton plain variant="primary">
      {{ labels.plain }}
    </TxButton>
    <TxButton round variant="primary">
      {{ labels.round }}
    </TxButton>
    <TxButton circle size="sm" icon="i-carbon-edit" :aria-label="labels.small" />
    <TxButton circle icon="i-carbon-edit" :aria-label="labels.medium" />
    <TxButton circle size="lg" icon="i-carbon-edit" :aria-label="labels.large" />
  </div>
</template>

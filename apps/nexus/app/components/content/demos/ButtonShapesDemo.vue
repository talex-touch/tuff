<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { dashed: '虚线', plain: '朴素', round: '圆角' }
  : { dashed: 'Dashed', plain: 'Plain', round: 'Round' }))
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
    <TxButton circle icon="i-carbon-edit" />
  </div>
</template>

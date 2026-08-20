<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { share: '分享' }
  : { share: 'Share' }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTooltip :content="labels.share">
      <TxButton icon="i-carbon-share" circle />
    </TxTooltip>
  </div>
</template>

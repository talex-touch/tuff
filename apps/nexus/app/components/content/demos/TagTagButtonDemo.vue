<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      badge: '测试版',
      action: '升级',
    }
  : {
      badge: 'Beta',
      action: 'Upgrade',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxTag class="tag-action-demo__tag" :label="labels.badge" size="md" />
    <TxButton size="sm">
      {{ labels.action }}
    </TxButton>
  </div>
</template>

<style scoped>
.tag-action-demo__tag {
  box-sizing: border-box;
  height: 26px;
}
</style>

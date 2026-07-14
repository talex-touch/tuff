<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const lastAction = ref('')

const items = computed(() => {
  if (locale.value === 'zh') {
    return [
      { label: '首页', href: '/', icon: 'i-carbon-home' },
      { label: '资料库' },
      { label: '数据' },
    ]
  }

  return [
    { label: 'Home', href: '/', icon: 'i-carbon-home' },
    { label: 'Library' },
    { label: 'Data' },
  ]
})

function onClick(item: { label: string }) {
  lastAction.value = item.label
}
</script>

<template>
  <div class="breadcrumb-demo">
    <TxBreadcrumb :items="items" @click="onClick" />
    <p v-if="lastAction" class="breadcrumb-demo__note">
      {{ locale === 'zh' ? '点击：' : 'Clicked: ' }}{{ lastAction }}
    </p>
  </div>
</template>

<style scoped>
.breadcrumb-demo {
  display: grid;
  gap: 8px;
}

.breadcrumb-demo__note {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>

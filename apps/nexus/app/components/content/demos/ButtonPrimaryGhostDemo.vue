<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh')
    return { create: '创建项目', secondary: '次要操作' }
  return { create: 'Create project', secondary: 'Secondary action' }
})
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton icon="i-ri-add-line">
      {{ labels.create }}
    </TxButton>
    <TxButton variant="ghost">
      {{ labels.secondary }}
    </TxButton>
  </div>
</template>

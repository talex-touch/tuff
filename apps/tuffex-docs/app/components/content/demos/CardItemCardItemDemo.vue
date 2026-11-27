<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const enabled = ref(true)

const copy = computed(() => (locale.value === 'zh'
  ? {
      title: '启用同步',
      description: '右侧区域可以组合开关、图标或状态文本。',
    }
  : {
      title: 'Enable sync',
      description: 'The right slot can combine switches, icons, or status text.',
    }))
</script>

<template>
  <TxCardItem
    :title="copy.title"
    :description="copy.description"
    icon-class="i-carbon-settings"
  >
    <template #right>
      <TxSwitch v-model="enabled" />
      <i class="i-carbon-chevron-right" />
    </template>
  </TxCardItem>
</template>

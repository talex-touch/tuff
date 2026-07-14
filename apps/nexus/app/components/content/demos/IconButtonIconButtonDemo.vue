<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const pinned = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      pin: pinned.value ? '取消置顶工作区' : '置顶工作区',
      settings: '打开设置',
      add: '新增项目',
    }
  : {
      pin: pinned.value ? 'Unpin workspace' : 'Pin workspace',
      settings: 'Open settings',
      add: 'Add item',
    }))
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <TxIconButton
      icon="i-carbon-star"
      :label="labels.pin"
      shape="circle"
      :pressed="pinned"
      @click="pinned = !pinned"
    />
    <TxIconButton icon="i-carbon-settings" :label="labels.settings" shape="square" />
    <TxIconButton icon="i-carbon-add" :label="labels.add" shape="pill" size="lg" />
    <TxIconButton icon="i-carbon-trash-can" label="Disabled action" disabled />
  </div>
</template>

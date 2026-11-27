<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const pinned = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      pin: pinned.value ? '取消置顶工作区' : '置顶工作区',
      edit: '编辑项目',
      add: '新增项目',
      warning: '需要注意的操作',
      remove: '删除项目',
    }
  : {
      pin: pinned.value ? 'Unpin workspace' : 'Pin workspace',
      edit: 'Edit item',
      add: 'Add item',
      warning: 'Action needs attention',
      remove: 'Delete item',
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
    <TxIconButton icon="i-carbon-edit" :label="labels.edit" shape="square" status="info" />
    <TxIconButton icon="i-carbon-add" :label="labels.add" shape="pill" size="lg" status="success" />
    <TxIconButton icon="i-carbon-warning" :label="labels.warning" status="warning" />
    <TxIconButton icon="i-carbon-trash-can" :label="labels.remove" status="danger" disabled />
  </div>
</template>

<script setup lang="ts">
import { TxBlockLine, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '高级设置',
      description: '折叠展示内容',
      detail: '展示内容',
      detailValue: '高级内容已保持挂载',
    }
  : {
      title: 'Project files',
      description: 'Collapsed by default',
      detail: 'Hidden content',
      detailValue: 'The group body stays mounted',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-folder-line"
      active-icon="i-ri-folder-open-line"
      :default-expand="false"
    >
      <TxBlockLine :title="labels.detail" :description="labels.detailValue" />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

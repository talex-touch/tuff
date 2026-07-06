<script setup lang="ts">
import { TxBlockLine, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '版本信息',
      description: '展示只读配置行',
      version: '版本',
      versionValue: '2.4.13-beta.3',
      updated: '构建日期',
      updatedValue: '2026.07.06',
    }
  : {
      title: 'Release info',
      description: 'Readonly configuration rows',
      version: 'Version',
      versionValue: '2.4.13-beta.3',
      updated: 'Build date',
      updatedValue: '2026.07.06',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-information-line"
      :collapsible="false"
    >
      <TxBlockLine :title="labels.version" :description="labels.versionValue" />
      <TxBlockLine :title="labels.updated" :description="labels.updatedValue" />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

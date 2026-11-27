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
      install: '如何安装？',
    }
  : {
      title: 'Release info',
      description: 'Readonly configuration rows',
      version: 'Version',
      versionValue: '2.4.13-beta.3',
      updated: 'Build date',
      updatedValue: '2026.07.06',
      install: 'How to install?',
    })
</script>

<template>
  <div class="group-block-showcase not-prose">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-carbon-information"
      :collapsible="false"
    >
      <TxBlockLine :title="labels.version" :description="labels.versionValue" />
      <TxBlockLine :title="labels.updated" :description="labels.updatedValue" />
    </TxGroupBlock>
    <TxGroupBlock class="group-block-showcase__compact" :name="labels.title" :collapsible="false">
      <TxBlockLine :title="labels.install" description="pnpm add @talex-touch/tuffex" />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
  display: grid;
  gap: 16px;
}

.group-block-showcase__compact {
  width: min(100%, 320px);
}
</style>

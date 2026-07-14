<script setup lang="ts">
import { TxBlockSelect, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { TuffSelectItem } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const timezone = ref('local')

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '工作区默认值',
      description: '选择控件复用同一行布局',
      item: '时间显示',
      itemDesc: '选择活动时间的展示方式。',
      placeholder: '选择时间显示',
      local: '本地时间',
      utc: 'UTC',
      relative: '相对时间',
    }
  : {
      title: 'Workspace defaults',
      description: 'Select controls reuse the same row layout',
      item: 'Time display',
      itemDesc: 'Choose how activity timestamps are shown.',
      placeholder: 'Select time display',
      local: 'Local time',
      utc: 'UTC',
      relative: 'Relative time',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-dashboard-line"
      active-icon="i-ri-dashboard-fill"
      :collapsible="false"
    >
      <TxBlockSelect
        v-model="timezone"
        :title="labels.item"
        :description="labels.itemDesc"
        :placeholder="labels.placeholder"
        default-icon="i-carbon-time"
        active-icon="i-carbon-time"
      >
        <TuffSelectItem value="local" :label="labels.local" />
        <TuffSelectItem value="utc" :label="labels.utc" />
        <TuffSelectItem value="relative" :label="labels.relative" />
      </TxBlockSelect>
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

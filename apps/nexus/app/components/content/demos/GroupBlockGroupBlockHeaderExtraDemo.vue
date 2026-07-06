<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBlockLine, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '同步',
      description: '手动触发同步',
      action: '立即同步',
      lastSync: '上次同步',
      justNow: '刚刚',
    }
  : {
      title: 'Sync',
      description: 'Trigger a manual sync',
      action: 'Run now',
      lastSync: 'Last sync',
      justNow: 'Just now',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-loop-left-line"
      :collapsible="false"
    >
      <template #header-extra>
        <TxButton size="small" variant="secondary">
          {{ labels.action }}
        </TxButton>
      </template>
      <TxBlockLine :title="labels.lastSync" :description="labels.justNow" />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

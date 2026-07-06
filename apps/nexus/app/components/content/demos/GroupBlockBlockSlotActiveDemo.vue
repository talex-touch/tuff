<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBlockSlot, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '工作区偏好',
      description: '激活态与标签',
      pinned: '置顶工作区',
      pinnedDesc: '优先显示该工作区',
      tag: '已启用',
      action: '管理',
    }
  : {
      title: 'Workspace preferences',
      description: 'Active state and labels',
      pinned: 'Pinned workspace',
      pinnedDesc: 'Show this workspace first',
      tag: 'Active',
      action: 'Manage',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-star-line"
      active-icon="i-ri-star-fill"
      :collapsible="false"
    >
      <TxBlockSlot
        :title="labels.pinned"
        :description="labels.pinnedDesc"
        default-icon="i-ri-star-line"
        active-icon="i-ri-star-fill"
        active
      >
        <template #tags>
          <TxTag :label="labels.tag" icon="i-carbon-checkmark-filled" color="var(--tx-color-success)" />
        </template>
        <TxButton size="small" variant="secondary">
          {{ labels.action }}
        </TxButton>
      </TxBlockSlot>
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

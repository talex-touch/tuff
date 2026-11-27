<script setup lang="ts">
import { TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const syncEnabled = ref(false)

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '同步状态',
      description: '加载中滑块变为旋转环并冻结整行',
      item: '正在同步',
      itemDesc: '等待最新状态返回',
    }
  : {
      title: 'Sync status',
      description: 'Loading turns the thumb into a ring and freezes the row',
      item: 'Sync status',
      itemDesc: 'Waiting for the latest state',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-carbon-renew"
      :collapsible="false"
    >
      <TxBlockSwitch
        v-model="syncEnabled"
        :title="labels.item"
        :description="labels.itemDesc"
        default-icon="i-carbon-renew"
        active-icon="i-carbon-renew"
        loading
      />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

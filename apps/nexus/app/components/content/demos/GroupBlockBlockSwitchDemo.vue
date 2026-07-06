<script setup lang="ts">
import { TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const autoUpdate = ref(true)

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '更新策略',
      description: '使用 CoreApp 同款行高和间距',
      item: '自动更新',
      itemDesc: '后台自动检查并下载更新',
    }
  : {
      title: 'Update policy',
      description: 'CoreApp-aligned row rhythm and spacing',
      item: 'Auto update',
      itemDesc: 'Install updates when the app restarts',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-refresh-line"
      active-icon="i-ri-refresh-line"
      :collapsible="false"
    >
      <TxBlockSwitch
        v-model="autoUpdate"
        :title="labels.item"
        :description="labels.itemDesc"
        default-icon="i-ri-refresh-line"
        active-icon="i-ri-refresh-line"
      />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

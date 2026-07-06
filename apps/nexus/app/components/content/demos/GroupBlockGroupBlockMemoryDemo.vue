<script setup lang="ts">
import { TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const autoUpdate = ref(true)

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '更新策略',
      description: '记忆展开状态',
      autoUpdate: '自动更新',
      autoUpdateDesc: '后台自动检查更新',
    }
  : {
      title: 'Updates',
      description: 'Remember the expanded state',
      autoUpdate: 'Auto update',
      autoUpdateDesc: 'Install updates when the app restarts',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-refresh-line"
      active-icon="i-ri-refresh-line"
      memory-name="tx-group-block-demo"
    >
      <TxBlockSwitch
        v-model="autoUpdate"
        :title="labels.autoUpdate"
        :description="labels.autoUpdateDesc"
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

<script setup lang="ts">
import { TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const dummy = ref(false)
function handleClick() {}

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '安全中心',
      description: '引导模式用于进入下一层设置',
      item: '隐私设置',
      itemDesc: '管理设备、数据和授权选项',
    }
  : {
      title: 'Security center',
      description: 'Guidance mode opens the next settings level',
      item: 'Security settings',
      itemDesc: 'Open the security preferences page',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-shield-keyhole-line"
      :collapsible="false"
    >
      <TxBlockSwitch
        v-model="dummy"
        :title="labels.item"
        :description="labels.itemDesc"
        default-icon="i-ri-shield-keyhole-line"
        guidance
        @click="handleClick"
      />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

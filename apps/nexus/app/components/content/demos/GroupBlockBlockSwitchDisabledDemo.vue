<script setup lang="ts">
import { TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const locked = ref(false)

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '受管设置',
      description: '禁用态保持同一视觉体系',
      setting: '高级功能',
      settingDesc: '需要订阅或管理员授权',
    }
  : {
      title: 'Managed setting',
      description: 'Disabled state keeps the same visual system',
      setting: 'Locked setting',
      settingDesc: 'Managed by your organization',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-lock-line"
      :collapsible="false"
    >
      <TxBlockSwitch
        v-model="locked"
        :title="labels.setting"
        :description="labels.settingDesc"
        default-icon="i-ri-lock-line"
        active-icon="i-ri-lock-fill"
        disabled
      />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

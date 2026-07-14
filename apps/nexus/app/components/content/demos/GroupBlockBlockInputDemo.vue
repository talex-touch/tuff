<script setup lang="ts">
import { TxBlockInput, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const displayName = ref('Talex')

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '账号资料',
      description: '输入控件保持设置行节奏',
      item: '显示名称',
      itemDesc: '用于协作空间和通知。',
      placeholder: '输入显示名称',
    }
  : {
      title: 'Account profile',
      description: 'Input controls keep the settings-row rhythm',
      item: 'Display name',
      itemDesc: 'Shown in shared workspaces and notifications.',
      placeholder: 'Enter display name',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-user-settings-line"
      active-icon="i-ri-user-settings-fill"
      :collapsible="false"
    >
      <TxBlockInput
        v-model="displayName"
        :title="labels.item"
        :description="labels.itemDesc"
        :placeholder="labels.placeholder"
        default-icon="i-carbon-user-profile"
        active-icon="i-carbon-user-profile"
        clearable
      />
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>

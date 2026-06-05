<script setup lang="ts">
import type { TxRadioValue } from '@talex-touch/tuffex/radio'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const value = ref<TxRadioValue>('sync')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      selected: '当前选中',
      options: [
        {
          value: 'local',
          title: '仅本地',
          description: '只保存在当前设备，适合临时草稿和私密配置。',
        },
        {
          value: 'sync',
          title: '跨设备同步',
          description: '通过账号同步偏好设置，适合多端工作流。',
        },
        {
          value: 'managed',
          title: '组织托管',
          description: '由管理员统一下发策略，当前租户未启用。',
          disabled: true,
        },
      ],
    }
  }

  return {
    selected: 'Selected',
    options: [
      {
        value: 'local',
        title: 'Local only',
        description: 'Keep settings on this device for drafts and private preferences.',
      },
      {
        value: 'sync',
        title: 'Sync across devices',
        description: 'Use account sync for preferences that should follow the user.',
      },
      {
        value: 'managed',
        title: 'Managed by workspace',
        description: 'Policy-driven settings are not enabled for this tenant.',
        disabled: true,
      },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-520">
    <TxRadioGroup v-model="value" type="card">
      <TxRadio
        v-for="option in labels.options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        <div class="tx-demo__title">
          {{ option.title }}
        </div>
        <div class="tx-demo__desc">
          {{ option.description }}
        </div>
      </TxRadio>
    </TxRadioGroup>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ value }}
      </div>
    </TxCard>
  </div>
</template>

<script setup lang="ts">
import type { TxRadioValue } from '@talex-touch/tuffex/radio'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const groupValue = ref<TxRadioValue>('locked')
const optionValue = ref<TxRadioValue>('manual')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      groupDisabled: '整组禁用',
      optionDisabled: '单项禁用',
      selected: '当前选中',
      locked: '锁定',
      archived: '归档',
      automatic: '自动',
      manual: '手动',
    }
  }

  return {
    groupDisabled: 'Group disabled',
    optionDisabled: 'Option disabled',
    selected: 'Selected',
    locked: 'Locked',
    archived: 'Archived',
    automatic: 'Automatic',
    manual: 'Manual',
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo--max-520">
    <div class="tx-demo__row">
      <div class="tx-demo__col">
        <div class="tx-demo__label">
          {{ labels.groupDisabled }}
        </div>
        <TxRadioGroup v-model="groupValue" disabled>
          <TxRadio value="locked">
            {{ labels.locked }}
          </TxRadio>
          <TxRadio value="archived">
            {{ labels.archived }}
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div class="tx-demo__col">
        <div class="tx-demo__label">
          {{ labels.optionDisabled }}
        </div>
        <TxRadioGroup v-model="optionValue">
          <TxRadio value="automatic" disabled>
            {{ labels.automatic }}
          </TxRadio>
          <TxRadio value="manual">
            {{ labels.manual }}
          </TxRadio>
        </TxRadioGroup>
      </div>
    </div>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}: {{ groupValue }} / {{ optionValue }}
      </div>
    </TxCard>
  </div>
</template>

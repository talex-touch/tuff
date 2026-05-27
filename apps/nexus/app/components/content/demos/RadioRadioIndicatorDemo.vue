<script setup lang="ts">
import type { TxRadioValue } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const valueDefault = ref<TxRadioValue>('focus')
const valuePlain = ref<TxRadioValue>('focus')
const valueBlur = ref<TxRadioValue>('focus')
const valueGlass = ref<TxRadioValue>('focus')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      default: '默认弹性',
      plain: '无弹性',
      blur: '模糊指示器',
      glass: '玻璃指示器',
      selected: '当前选中',
      options: [
        { value: 'focus', label: '专注' },
        { value: 'review', label: '复盘' },
        { value: 'ship', label: '发布' },
      ],
    }
  }

  return {
    default: 'Default elastic',
    plain: 'No elastic',
    blur: 'Blur indicator',
    glass: 'Glass indicator',
    selected: 'Selected',
    options: [
      { value: 'focus', label: 'Focus' },
      { value: 'review', label: 'Review' },
      { value: 'ship', label: 'Ship' },
    ],
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col tx-demo__col--18">
    <div class="tx-demo__col tx-demo__col--10">
      <div class="tx-demo__label">
        {{ labels.default }}
      </div>
      <TxRadioGroup v-model="valueDefault">
        <TxRadio v-for="option in labels.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </TxRadio>
      </TxRadioGroup>
    </div>

    <div class="tx-demo__col tx-demo__col--10">
      <div class="tx-demo__label">
        {{ labels.plain }}
      </div>
      <TxRadioGroup v-model="valuePlain" :elastic="false">
        <TxRadio v-for="option in labels.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </TxRadio>
      </TxRadioGroup>
    </div>

    <div class="tx-demo__col tx-demo__col--10">
      <div class="tx-demo__label">
        {{ labels.blur }}
      </div>
      <TxRadioGroup v-model="valueBlur" indicator-variant="blur">
        <TxRadio v-for="option in labels.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </TxRadio>
      </TxRadioGroup>
    </div>

    <div class="tx-demo__col tx-demo__col--10">
      <div class="tx-demo__label">
        {{ labels.glass }}
      </div>
      <TxRadioGroup v-model="valueGlass" indicator-variant="glass">
        <TxRadio v-for="option in labels.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </TxRadio>
      </TxRadioGroup>
    </div>

    <TxCard variant="plain" background="mask" :padding="10" :radius="14">
      <div class="tx-demo__meta">
        {{ labels.selected }}:
        {{ valueDefault }} / {{ valuePlain }} / {{ valueBlur }} / {{ valueGlass }}
      </div>
    </TxCard>
  </div>
</template>

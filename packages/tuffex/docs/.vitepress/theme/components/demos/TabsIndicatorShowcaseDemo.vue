<script setup lang="ts">
import { computed, ref } from 'vue'

type Motion = 'stretch' | 'warp' | 'glide' | 'snap' | 'spring'

type TabValue = 'A' | 'B' | 'C'

const motion = ref<Motion>('stretch')
const active = ref<TabValue>('A')

const variants = computed(() => {
  return [
    { value: 'line', label: 'line' },
    { value: 'pill', label: 'pill' },
    { value: 'block', label: 'block' },
    { value: 'dot', label: 'dot' },
    { value: 'outline', label: 'outline' },
  ] as const
})

const motionOptions = [
  { value: 'stretch', label: 'stretch' },
  { value: 'warp', label: 'warp' },
  { value: 'glide', label: 'glide' },
  { value: 'snap', label: 'snap' },
  { value: 'spring', label: 'spring' },
] as const

function next() {
  active.value = active.value === 'A' ? 'B' : active.value === 'B' ? 'C' : 'A'
}
</script>

<template>
  <div class="tx-demo tx-demo__col" style="max-width: 860px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">motion</span>
          <TuffSelect v-model="motion" style="min-width: 190px;">
            <TuffSelectItem v-for="opt in motionOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">auto</span>
          <TxButton size="small" @click="next">Next</TxButton>
        </label>

        <div style="opacity: 0.7; font-size: 12px;">
          active: <b>{{ active }}</b>
        </div>
      </div>
    </TxCard>

    <div class="tx-demo__col" style="gap: 12px;">
      <TxCard
        v-for="v in variants"
        :key="v.value"
        variant="plain"
        background="mask"
        :padding="12"
        :radius="14"
      >
        <div class="tx-demo__label" style="margin-bottom: 8px;">
          {{ v.label }}
        </div>

        <TxTabs
          v-model="active"
          placement="top"
          :content-scrollable="false"
          :indicator-variant="v.value"
          :indicator-motion="motion"
          :animation="{ indicator: { durationMs: 180 }, content: true }"
        >
          <TxTabItem name="A" activation>
            Overview
          </TxTabItem>
          <TxTabItem name="B">
            Features
          </TxTabItem>
          <TxTabItem name="C">
            Pricing
          </TxTabItem>
        </TxTabs>
      </TxCard>
    </div>
  </div>
</template>

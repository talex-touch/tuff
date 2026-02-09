<script setup lang="ts">
import { computed, ref } from 'vue'

type Motion = 'stretch' | 'warp' | 'glide' | 'snap' | 'spring'
type TabValue = 'A' | 'B' | 'C'

const { locale } = useI18n()

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

const motionOptions = computed(() => {
  return [
    { value: 'stretch', label: 'stretch' },
    { value: 'warp', label: 'warp' },
    { value: 'glide', label: 'glide' },
    { value: 'snap', label: 'snap' },
    { value: 'spring', label: 'spring' },
  ] as const
})

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      motion: '动效',
      auto: '自动',
      next: '下一项',
      active: '当前',
      overview: '概览',
      features: '功能',
      pricing: '价格',
    }
  }

  return {
    motion: 'motion',
    auto: 'auto',
    next: 'Next',
    active: 'active',
    overview: 'Overview',
    features: 'Features',
    pricing: 'Pricing',
  }
})

function next() {
  active.value = active.value === 'A' ? 'B' : active.value === 'B' ? 'C' : 'A'
}
</script>

<template>
  <div class="tx-demo tx-demo__col" style="max-width: 860px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.motion }}</span>
          <TuffSelect v-model="motion" style="min-width: 190px;">
            <TuffSelectItem
              v-for="option in motionOptions"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.auto }}</span>
          <TxButton size="small" @click="next">
            {{ labels.next }}
          </TxButton>
        </label>

        <div style="opacity: 0.7; font-size: 12px;">
          {{ labels.active }}: <b>{{ active }}</b>
        </div>
      </div>
    </TxCard>

    <div class="tx-demo__col" style="gap: 12px;">
      <TxCard
        v-for="variant in variants"
        :key="variant.value"
        variant="plain"
        background="mask"
        :padding="12"
        :radius="14"
      >
        <div class="tx-demo__label" style="margin-bottom: 8px;">
          {{ variant.label }}
        </div>

        <TxTabs
          v-model="active"
          placement="top"
          :content-scrollable="false"
          :indicator-variant="variant.value"
          :indicator-motion="motion"
          :animation="{ indicator: { durationMs: 180 }, content: true }"
        >
          <TxTabItem name="A" activation>
            {{ labels.overview }}
          </TxTabItem>
          <TxTabItem name="B">
            {{ labels.features }}
          </TxTabItem>
          <TxTabItem name="C">
            {{ labels.pricing }}
          </TxTabItem>
        </TxTabs>
      </TxCard>
    </div>
  </div>
</template>

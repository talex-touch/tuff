<script setup lang="ts">
import { computed, ref } from 'vue'

type Preset = 'fade' | 'slide-fade' | 'rebound' | 'smooth-size'

const preset = ref<Preset>('fade')
const value = ref<'A' | 'B'>('A')

const contentKey = computed(() => value.value)

function toggle() {
  value.value = value.value === 'A' ? 'B' : 'A'
}
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 12px; width: 520px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap; align-items: center;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">preset</span>
          <TuffSelect v-model="preset" style="min-width: 180px;">
            <TuffSelectItem value="fade" label="fade" />
            <TuffSelectItem value="slide-fade" label="slide-fade" />
            <TuffSelectItem value="rebound" label="rebound" />
            <TuffSelectItem value="smooth-size" label="smooth-size" />
          </TuffSelect>
        </label>

        <TxButton size="small" type="primary" @click="toggle">
          Toggle
        </TxButton>

        <div style="opacity: 0.75; font-size: 12px;">key: <b>{{ contentKey }}</b></div>
      </div>
    </TxCard>

    <TxCard variant="plain" background="mask" :padding="14" :radius="14" style="width: 100%;">
      <TxTransition :preset="preset" :duration="220" mode="out-in">
        <div :key="contentKey" style="padding: 10px 12px;">
          <div style="font-weight: 600; margin-bottom: 8px;">Panel {{ value }}</div>
          <div
            :style="{
              height: value === 'A' ? '90px' : '180px',
              borderRadius: '12px',
              background: value === 'A'
                ? 'color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent)'
                : 'color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent)',
            }"
          />
        </div>
      </TxTransition>
    </TxCard>

    <TxCard variant="plain" background="mask" :padding="14" :radius="14" style="width: 100%;">
      <div class="tx-demo__label" style="margin-bottom: 8px;">Semantic Components</div>

      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap;">
        <TxTransitionFade :duration="180" mode="out-in">
          <div :key="`fade-${contentKey}`" style="padding: 8px 10px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter);">
            Fade {{ value }}
          </div>
        </TxTransitionFade>

        <TxTransitionSlideFade :duration="180" mode="out-in">
          <div :key="`slide-${contentKey}`" style="padding: 8px 10px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter);">
            SlideFade {{ value }}
          </div>
        </TxTransitionSlideFade>

        <TxTransitionRebound :duration="200" mode="out-in">
          <div :key="`rebound-${contentKey}`" style="padding: 8px 10px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter);">
            Rebound {{ value }}
          </div>
        </TxTransitionRebound>
      </div>
    </TxCard>
  </div>
</template>

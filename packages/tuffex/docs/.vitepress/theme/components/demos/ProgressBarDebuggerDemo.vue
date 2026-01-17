<script setup lang="ts">
import { computed, ref } from 'vue'

type Status = '' | 'success' | 'warning' | 'error'

type MaskVariant = 'solid' | 'dashed' | 'plain'

type MaskBackground = 'mask' | 'blur' | 'glass'

type IndeterminateVariant = 'classic' | 'sweep' | 'bounce' | 'elastic' | 'split'

type FlowEffect = 'none' | 'shimmer' | 'wave' | 'particles'

type IndicatorEffect = 'none' | 'sparkle'

type HoverEffect = 'none' | 'glow'

const percentage = ref(72)
const showText = ref(true)
const textPlacement = ref<'inside' | 'outside'>('inside')

const indeterminate = ref(false)
const indeterminateVariant = ref<IndeterminateVariant>('sweep')

const status = ref<Status>('')

const flowEffect = ref<FlowEffect>('shimmer')
const indicatorEffect = ref<IndicatorEffect>('sparkle')
const hoverEffect = ref<HoverEffect>('glow')

const maskVariant = ref<MaskVariant>('solid')
const maskBackground = ref<MaskBackground>('glass')

const message = ref('')

const showPercentageControl = computed(() => !indeterminate.value)
</script>

<template>
  <div class="demo">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14" style="width: 100%;">
      <div class="demo__grid">
        <div class="demo__row">
          <div class="demo__label">
            indeterminate
          </div>
          <TxSwitch v-model="indeterminate" />
        </div>

        <div class="demo__row">
          <div class="demo__label">
            indeterminateVariant
          </div>
          <TuffSelect v-model="indeterminateVariant" style="min-width: 220px;">
            <TuffSelectItem value="classic" label="classic" />
            <TuffSelectItem value="sweep" label="sweep" />
            <TuffSelectItem value="bounce" label="bounce" />
            <TuffSelectItem value="elastic" label="elastic" />
            <TuffSelectItem value="split" label="split" />
          </TuffSelect>
        </div>

        <div class="demo__row" :style="{ opacity: showPercentageControl ? 1 : 0.4 }">
          <div class="demo__label">
            percentage
          </div>
          <TxSlider v-model="percentage" :min="0" :max="100" :step="1" show-value :disabled="!showPercentageControl" />
        </div>

        <div class="demo__row">
          <div class="demo__label">
            status
          </div>
          <TuffSelect v-model="status" style="min-width: 220px;">
            <TuffSelectItem value="" label="(none)" />
            <TuffSelectItem value="success" label="success" />
            <TuffSelectItem value="warning" label="warning" />
            <TuffSelectItem value="error" label="error" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            maskVariant
          </div>
          <TuffSelect v-model="maskVariant" style="min-width: 220px;">
            <TuffSelectItem value="solid" label="solid" />
            <TuffSelectItem value="dashed" label="dashed" />
            <TuffSelectItem value="plain" label="plain" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            maskBackground
          </div>
          <TuffSelect v-model="maskBackground" style="min-width: 220px;">
            <TuffSelectItem value="mask" label="mask" />
            <TuffSelectItem value="blur" label="blur" />
            <TuffSelectItem value="glass" label="glass" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            flowEffect
          </div>
          <TuffSelect v-model="flowEffect" style="min-width: 220px;">
            <TuffSelectItem value="none" label="none" />
            <TuffSelectItem value="shimmer" label="shimmer" />
            <TuffSelectItem value="wave" label="wave" />
            <TuffSelectItem value="particles" label="particles" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            indicatorEffect
          </div>
          <TuffSelect v-model="indicatorEffect" style="min-width: 220px;">
            <TuffSelectItem value="none" label="none" />
            <TuffSelectItem value="sparkle" label="sparkle" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            hoverEffect
          </div>
          <TuffSelect v-model="hoverEffect" style="min-width: 220px;">
            <TuffSelectItem value="none" label="none" />
            <TuffSelectItem value="glow" label="glow" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            textPlacement
          </div>
          <TuffSelect v-model="textPlacement" style="min-width: 220px;">
            <TuffSelectItem value="inside" label="inside" />
            <TuffSelectItem value="outside" label="outside" />
          </TuffSelect>
        </div>

        <div class="demo__row">
          <div class="demo__label">
            showText
          </div>
          <TxSwitch v-model="showText" />
        </div>

        <div class="demo__row">
          <div class="demo__label">
            message
          </div>
          <TuffInput v-model="message" placeholder="optional" style="min-width: 320px;" />
        </div>
      </div>
    </TxCard>

    <TxCard variant="plain" background="mask" :padding="18" :radius="14" style="width: 100%;">
      <TxProgressBar
        :percentage="percentage"
        :indeterminate="indeterminate"
        :indeterminate-variant="indeterminateVariant"
        :status="status"
        :mask-variant="maskVariant"
        :mask-background="maskBackground"
        :flow-effect="flowEffect"
        :indicator-effect="indicatorEffect"
        :hover-effect="hoverEffect"
        :show-text="showText"
        :text-placement="textPlacement"
        :message="message"
        height="12px"
        tooltip
      />
    </TxCard>
  </div>
</template>

<style scoped>
.demo {
  width: 100%;
  display: grid;
  gap: 12px;
}

.demo__grid {
  display: grid;
  gap: 10px;
}

.demo__row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 12px;
  align-items: center;
}

.demo__label {
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-text-color-primary, #fff) 82%, transparent);
  white-space: nowrap;
}
</style>

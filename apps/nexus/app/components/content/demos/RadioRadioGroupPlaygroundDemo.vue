<script setup lang="ts">
import type { TxRadioValue } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

const { locale } = useI18n()

type GroupType = 'button' | 'standard' | 'card'
type IndicatorVariant = 'solid' | 'outline' | 'glass' | 'blur'

const type = ref<GroupType>('button')
const direction = ref<'row' | 'column'>('row')
const disabled = ref(false)
const indicatorVariant = ref<IndicatorVariant>('solid')
const elastic = ref(true)
const stiffness = ref(110)
const damping = ref(12)
const blurAmount = ref(1)
const value = ref<TxRadioValue>('alpha')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      type: '类型',
      direction: '方向',
      disabled: '整组禁用',
      elastic: '弹性',
      indicator: '指示器',
      stiffness: '刚度',
      damping: '阻尼',
      blurAmount: '模糊强度',
      selected: '当前选中',
      cardA: 'Alpha 路径',
      cardB: 'Beta 路径',
      cardC: 'Gamma 路径',
      descA: '适合默认流程和低风险配置。',
      descB: '适合需要更多人工确认的流程。',
      descC: '示例禁用项，会被键盘导航跳过。',
    }
  }

  return {
    type: 'Type',
    direction: 'Direction',
    disabled: 'Group disabled',
    elastic: 'Elastic',
    indicator: 'Indicator',
    stiffness: 'Stiffness',
    damping: 'Damping',
    blurAmount: 'Blur amount',
    selected: 'Selected',
    cardA: 'Alpha path',
    cardB: 'Beta path',
    cardC: 'Gamma path',
    descA: 'Good for default flows and low-risk settings.',
    descB: 'Good for flows that need extra manual review.',
    descC: 'Disabled sample; keyboard navigation skips it.',
  }
})

const typeOptions = [
  { value: 'button', label: 'button' },
  { value: 'standard', label: 'standard' },
  { value: 'card', label: 'card' },
] satisfies Array<{ value: GroupType, label: string }>

const directionOptions = [
  { value: 'row', label: 'row' },
  { value: 'column', label: 'column' },
] satisfies Array<{ value: 'row' | 'column', label: string }>

const indicatorOptions = [
  { value: 'solid', label: 'solid' },
  { value: 'outline', label: 'outline' },
  { value: 'glass', label: 'glass' },
  { value: 'blur', label: 'blur' },
] satisfies Array<{ value: IndicatorVariant, label: string }>

const shouldShowDirection = computed(() => type.value !== 'button')
const shouldShowIndicatorProps = computed(() => type.value === 'button')
const resolvedBlur = computed(() => shouldShowIndicatorProps.value && indicatorVariant.value === 'blur')
const resolvedGlass = computed(() => shouldShowIndicatorProps.value && indicatorVariant.value === 'glass')
</script>

<template>
  <div class="tx-demo tx-demo__col" style="max-width: 720px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__col" style="gap: 12px;">
        <div class="tx-demo__row">
          <label class="tx-demo__row" style="gap: 8px;">
            <span class="tx-demo__label">{{ labels.type }}</span>
            <TuffSelect v-model="type" style="min-width: 180px;">
              <TuffSelectItem
                v-for="option in typeOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TuffSelect>
          </label>

          <label v-if="shouldShowDirection" class="tx-demo__row" style="gap: 8px;">
            <span class="tx-demo__label">{{ labels.direction }}</span>
            <TuffSelect v-model="direction" style="min-width: 180px;">
              <TuffSelectItem
                v-for="option in directionOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TuffSelect>
          </label>
        </div>

        <div class="tx-demo__row">
          <label class="tx-demo__row" style="gap: 8px;">
            <span class="tx-demo__label">{{ labels.disabled }}</span>
            <TxSwitch v-model="disabled" />
          </label>

          <label class="tx-demo__row" style="gap: 8px;">
            <span class="tx-demo__label">{{ labels.elastic }}</span>
            <TxSwitch v-model="elastic" />
          </label>

          <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
            <span class="tx-demo__label">{{ labels.indicator }}</span>
            <TuffSelect v-model="indicatorVariant" style="min-width: 180px;">
              <TuffSelectItem
                v-for="option in indicatorOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </TuffSelect>
          </label>
        </div>

        <div class="tx-demo__col" style="gap: 10px;">
          <div class="tx-demo__label">
            {{ labels.stiffness }}
          </div>
          <TxSlider v-model="stiffness" :min="60" :max="220" :step="1" show-value />
        </div>

        <div class="tx-demo__col" style="gap: 10px;">
          <div class="tx-demo__label">
            {{ labels.damping }}
          </div>
          <TxSlider v-model="damping" :min="4" :max="30" :step="1" show-value />
        </div>

        <div v-if="resolvedBlur" class="tx-demo__col" style="gap: 10px;">
          <div class="tx-demo__label">
            {{ labels.blurAmount }}
          </div>
          <TxSlider v-model="blurAmount" :min="0" :max="24" :step="1" show-value />
        </div>
      </div>
    </TxCard>

    <TxCard variant="plain" background="mask" :padding="18" :radius="14" style="width: 100%;">
      <TxRadioGroup
        v-model="value"
        :type="type"
        :direction="shouldShowDirection ? direction : undefined"
        :disabled="disabled"
        :indicator-variant="shouldShowIndicatorProps ? indicatorVariant : undefined"
        :glass="resolvedGlass"
        :blur="resolvedBlur"
        :elastic="elastic"
        :stiffness="stiffness"
        :damping="damping"
        :blur-amount="blurAmount"
      >
        <TxRadio value="alpha">
          <template v-if="type === 'card'">
            <div class="tx-demo__title">
              {{ labels.cardA }}
            </div>
            <div class="tx-demo__desc">
              {{ labels.descA }}
            </div>
          </template>
          <template v-else>
            Alpha
          </template>
        </TxRadio>

        <TxRadio value="beta">
          <template v-if="type === 'card'">
            <div class="tx-demo__title">
              {{ labels.cardB }}
            </div>
            <div class="tx-demo__desc">
              {{ labels.descB }}
            </div>
          </template>
          <template v-else>
            Beta
          </template>
        </TxRadio>

        <TxRadio value="gamma" :disabled="type !== 'button'">
          <template v-if="type === 'card'">
            <div class="tx-demo__title">
              {{ labels.cardC }}
            </div>
            <div class="tx-demo__desc">
              {{ labels.descC }}
            </div>
          </template>
          <template v-else>
            Gamma
          </template>
        </TxRadio>
      </TxRadioGroup>

      <div class="tx-demo__meta" style="margin-top: 12px;">
        {{ labels.selected }}: {{ value }}
      </div>
    </TxCard>
  </div>
</template>

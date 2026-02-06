<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const blur = ref('')
const blurAmount = ref('')
const damping = ref('')
const direction = ref('')
const directionOptions = ref([])
const disabled = ref(false)
const elastic = ref('')
const glass = ref('')
const indicatorVariant = ref('')
const resolvedBlur = ref('')
const resolvedGlass = ref('')
const shouldShowDirection = ref(false)
const shouldShowIndicatorProps = ref(false)
const stiffness = ref('')
const type = ref('')
const typeOptions = ref([])
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="tx-demo tx-demo__col" style="max-width: 720px;">
        <TxCard variant="plain" background="mask" :padding="14" :radius="14">
          <div class="tx-demo__col" style="gap: 12px;">
            <div class="tx-demo__row">
              <label class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">type</span>
                <TuffSelect v-model="type" style="min-width: 180px;">
                  <TuffSelectItem v-for="opt in typeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
                </TuffSelect>
              </label>

              <label v-if="shouldShowDirection" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">direction</span>
                <TuffSelect v-model="direction" style="min-width: 180px;">
                  <TuffSelectItem v-for="opt in directionOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
                </TuffSelect>
              </label>
            </div>

            <div class="tx-demo__row">
              <label class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">disabled</span>
                <TxSwitch v-model="disabled" />
              </label>

              <label class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">elastic</span>
                <TxSwitch v-model="elastic" />
              </label>

              <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">indicator</span>
                <TuffSelect v-model="indicatorVariant" style="min-width: 180px;">
                  <TuffSelectItem value="solid" label="solid" />
                  <TuffSelectItem value="outline" label="outline" />
                  <TuffSelectItem value="glass" label="glass" />
                  <TuffSelectItem value="blur" label="blur" />
                </TuffSelect>
              </label>

              <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">blur</span>
                <TxSwitch v-model="blur" />
              </label>

              <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">glass</span>
                <TxSwitch v-model="glass" />
              </label>
            </div>

            <div class="tx-demo__col" style="gap: 10px;">
              <div class="tx-demo__label">
                stiffness
              </div>
              <TxSlider v-model="stiffness" :min="60" :max="220" :step="1" show-value />
            </div>

            <div class="tx-demo__col" style="gap: 10px;">
              <div class="tx-demo__label">
                damping
              </div>
              <TxSlider v-model="damping" :min="4" :max="30" :step="1" show-value />
            </div>

            <div v-if="shouldShowIndicatorProps && blur" class="tx-demo__col" style="gap: 10px;">
              <div class="tx-demo__label">
                blurAmount
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
            <TxRadio value="a" :disabled="disabled && type !== 'button'">
              <template v-if="type === 'card'">
                <div class="tx-demo__title">
                  Option A
                </div>
                <div class="tx-demo__desc">
                  Card description A
                </div>
              </template>
              <template v-else>
                Option A
              </template>
            </TxRadio>

            <TxRadio value="b">
              <template v-if="type === 'card'">
                <div class="tx-demo__title">
                  Option B
                </div>
                <div class="tx-demo__desc">
                  Card description B
                </div>
              </template>
              <template v-else>
                Option B
              </template>
            </TxRadio>

            <TxRadio value="c" :disabled="type === 'button' ? false : true">
              <template v-if="type === 'card'">
                <div class="tx-demo__title">
                  Option C (disabled)
                </div>
                <div class="tx-demo__desc">
                  Disabled in non-button types
                </div>
              </template>
              <template v-else>
                Option C
              </template>
            </TxRadio>
          </TxRadioGroup>

          <div class="tx-demo__meta" style="margin-top: 12px;">
            selected: {{ value }}
          </div>
        </TxCard>
      </div>
  </div>
  <div v-else>
      <div class="tx-demo tx-demo__col" style="max-width: 720px;">
        <TxCard variant="plain" background="mask" :padding="14" :radius="14">
          <div class="tx-demo__col" style="gap: 12px;">
            <div class="tx-demo__row">
              <label class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">type</span>
                <TuffSelect v-model="type" style="min-width: 180px;">
                  <TuffSelectItem v-for="opt in typeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
                </TuffSelect>
              </label>

              <label v-if="shouldShowDirection" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">direction</span>
                <TuffSelect v-model="direction" style="min-width: 180px;">
                  <TuffSelectItem v-for="opt in directionOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
                </TuffSelect>
              </label>
            </div>

            <div class="tx-demo__row">
              <label class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">disabled</span>
                <TxSwitch v-model="disabled" />
              </label>

              <label class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">elastic</span>
                <TxSwitch v-model="elastic" />
              </label>

              <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">indicator</span>
                <TuffSelect v-model="indicatorVariant" style="min-width: 180px;">
                  <TuffSelectItem value="solid" label="solid" />
                  <TuffSelectItem value="outline" label="outline" />
                  <TuffSelectItem value="glass" label="glass" />
                  <TuffSelectItem value="blur" label="blur" />
                </TuffSelect>
              </label>

              <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">blur</span>
                <TxSwitch v-model="blur" />
              </label>

              <label v-if="shouldShowIndicatorProps" class="tx-demo__row" style="gap: 8px;">
                <span class="tx-demo__label">glass</span>
                <TxSwitch v-model="glass" />
              </label>
            </div>

            <div class="tx-demo__col" style="gap: 10px;">
              <div class="tx-demo__label">
                stiffness
              </div>
              <TxSlider v-model="stiffness" :min="60" :max="220" :step="1" show-value />
            </div>

            <div class="tx-demo__col" style="gap: 10px;">
              <div class="tx-demo__label">
                damping
              </div>
              <TxSlider v-model="damping" :min="4" :max="30" :step="1" show-value />
            </div>

            <div v-if="shouldShowIndicatorProps && blur" class="tx-demo__col" style="gap: 10px;">
              <div class="tx-demo__label">
                blurAmount
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
            <TxRadio value="a" :disabled="disabled && type !== 'button'">
              <template v-if="type === 'card'">
                <div class="tx-demo__title">
                  Option A
                </div>
                <div class="tx-demo__desc">
                  Card description A
                </div>
              </template>
              <template v-else>
                Option A
              </template>
            </TxRadio>

            <TxRadio value="b">
              <template v-if="type === 'card'">
                <div class="tx-demo__title">
                  Option B
                </div>
                <div class="tx-demo__desc">
                  Card description B
                </div>
              </template>
              <template v-else>
                Option B
              </template>
            </TxRadio>

            <TxRadio value="c" :disabled="type === 'button' ? false : true">
              <template v-if="type === 'card'">
                <div class="tx-demo__title">
                  Option C (disabled)
                </div>
                <div class="tx-demo__desc">
                  Disabled in non-button types
                </div>
              </template>
              <template v-else>
                Option C
              </template>
            </TxRadio>
          </TxRadioGroup>

          <div class="tx-demo__meta" style="margin-top: 12px;">
            selected: {{ value }}
          </div>
        </TxCard>
      </div>
  </div>
</template>

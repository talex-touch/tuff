<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="tx-demo tx-demo__col tx-demo--max-520">
        <TxRadioGroup v-model="value" type="card">
          <TxRadio value="a">
            <div class="tx-demo__title">
              Option A
            </div>
            <div class="tx-demo__desc">
              Description text for option A
            </div>
          </TxRadio>
          <TxRadio value="b">
            <div class="tx-demo__title">
              Option B
            </div>
            <div class="tx-demo__desc">
              A longer description line to test wrapping and spacing
            </div>
          </TxRadio>
          <TxRadio value="c" disabled>
            <div class="tx-demo__title">
              Option C (disabled)
            </div>
            <div class="tx-demo__desc">
              Disabled option
            </div>
          </TxRadio>
        </TxRadioGroup>

        <TxCard variant="plain" background="mask" :padding="10" :radius="14">
          <div class="tx-demo__meta">
            selected: {{ value }}
          </div>
        </TxCard>
      </div>
  </div>
  <div v-else>
      <div class="tx-demo tx-demo__col tx-demo--max-520">
        <TxRadioGroup v-model="value" type="card">
          <TxRadio value="a">
            <div class="tx-demo__title">
              Option A
            </div>
            <div class="tx-demo__desc">
              Description text for option A
            </div>
          </TxRadio>
          <TxRadio value="b">
            <div class="tx-demo__title">
              Option B
            </div>
            <div class="tx-demo__desc">
              A longer description line to test wrapping and spacing
            </div>
          </TxRadio>
          <TxRadio value="c" disabled>
            <div class="tx-demo__title">
              Option C (disabled)
            </div>
            <div class="tx-demo__desc">
              Disabled option
            </div>
          </TxRadio>
        </TxRadioGroup>

        <TxCard variant="plain" background="mask" :padding="10" :radius="14">
          <div class="tx-demo__meta">
            selected: {{ value }}
          </div>
        </TxCard>
      </div>
  </div>
</template>

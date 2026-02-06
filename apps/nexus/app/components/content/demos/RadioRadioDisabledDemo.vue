<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="tx-demo tx-demo__row">
        <TxRadioGroup v-model="value" disabled>
          <TxRadio value="a">
            Disabled A
          </TxRadio>
          <TxRadio value="b">
            Disabled B
          </TxRadio>
        </TxRadioGroup>

        <TxRadioGroup v-model="value">
          <TxRadio value="a" disabled>
            Option A
          </TxRadio>
          <TxRadio value="b">
            Option B
          </TxRadio>
        </TxRadioGroup>
      </div>
  </div>
  <div v-else>
      <div class="tx-demo tx-demo__row">
        <TxRadioGroup v-model="value" disabled>
          <TxRadio value="a">
            Disabled A
          </TxRadio>
          <TxRadio value="b">
            Disabled B
          </TxRadio>
        </TxRadioGroup>

        <TxRadioGroup v-model="value">
          <TxRadio value="a" disabled>
            Option A
          </TxRadio>
          <TxRadio value="b">
            Option B
          </TxRadio>
        </TxRadioGroup>
      </div>
  </div>
</template>

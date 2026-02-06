<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="tx-demo tx-demo__col">
        <TxRadioGroup v-model="value">
          <TxRadio value="a">
            Option A
          </TxRadio>
          <TxRadio value="b">
            Option B
          </TxRadio>
          <TxRadio value="c">
            Option C
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
      <div class="tx-demo tx-demo__col">
        <TxRadioGroup v-model="value">
          <TxRadio value="a">
            Option A
          </TxRadio>
          <TxRadio value="b">
            Option B
          </TxRadio>
          <TxRadio value="c">
            Option C
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

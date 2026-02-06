<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const valueBlur = ref('')
const valueDefault = ref('')
const valueGlass = ref('')
const valuePlain = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div class="tx-demo tx-demo__col tx-demo__col--18">
        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Default
          </div>
          <TxRadioGroup v-model="valueDefault">
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
        </div>

        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Plain
          </div>
          <TxRadioGroup v-model="valuePlain" :elastic="false">
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
        </div>

        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Blur
          </div>
          <TxRadioGroup v-model="valueBlur" blur>
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
        </div>

        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Glass
          </div>
          <TxRadioGroup v-model="valueGlass" glass>
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
        </div>
      </div>
  </div>
  <div v-else>
      <div class="tx-demo tx-demo__col tx-demo__col--18">
        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Default
          </div>
          <TxRadioGroup v-model="valueDefault">
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
        </div>

        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Plain
          </div>
          <TxRadioGroup v-model="valuePlain" :elastic="false">
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
        </div>

        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Blur
          </div>
          <TxRadioGroup v-model="valueBlur" blur>
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
        </div>

        <div class="tx-demo__col tx-demo__col--10">
          <div class="tx-demo__label">
            Glass
          </div>
          <TxRadioGroup v-model="valueGlass" glass>
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
        </div>
      </div>
  </div>
</template>

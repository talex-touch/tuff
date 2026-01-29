<script setup lang="ts">
import { ref } from 'vue'

const valueDefault = ref<'a' | 'b' | 'c'>('a')
const valuePlain = ref<'a' | 'b' | 'c'>('a')
const valueBlur = ref<'a' | 'b' | 'c'>('a')
const valueGlass = ref<'a' | 'b' | 'c'>('a')
</script>

<template>
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
</template>

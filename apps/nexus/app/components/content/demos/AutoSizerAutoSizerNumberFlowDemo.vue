<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
const shuffle = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <TxButton @click="shuffle">
          Shuffle
        </TxButton>

        <TxAutoSizer ref="sizerRef" :width="true" :height="false" outer-class="overflow-hidden">
          <TxButton variant="secondary">
            <span style="display: inline-flex; align-items: center; gap: 6px;">
              <span style="opacity: 0.7;">$</span>
              <NumberFlow :value="value" />
            </span>
          </TxButton>
        </TxAutoSizer>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <TxButton @click="shuffle">
          Shuffle
        </TxButton>

        <TxAutoSizer ref="sizerRef" :width="true" :height="false" outer-class="overflow-hidden">
          <TxButton variant="secondary">
            <span style="display: inline-flex; align-items: center; gap: 6px;">
              <span style="opacity: 0.7;">$</span>
              <NumberFlow :value="value" />
            </span>
          </TxButton>
        </TxAutoSizer>
      </div>
  </div>
</template>

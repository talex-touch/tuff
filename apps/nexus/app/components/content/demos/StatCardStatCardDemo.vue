<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const value = ref('')
const bump = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 8px;">
          <TxButton @click="bump">
            Shuffle
          </TxButton>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
          <TxStatCard
            :value="value"
            label="Downloads"
            icon-class="i-carbon-download text-6xl text-[var(--tx-color-primary)]"
            clickable
          />
          <TxStatCard :value="42" label="Tasks" icon-class="i-carbon-task text-6xl text-[var(--tx-color-success)]" />
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; gap: 8px;">
          <TxButton @click="bump">
            Shuffle
          </TxButton>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
          <TxStatCard
            :value="value"
            label="Downloads"
            icon-class="i-carbon-download text-6xl text-[var(--tx-color-primary)]"
            clickable
          />
          <TxStatCard :value="42" label="Tasks" icon-class="i-carbon-task text-6xl text-[var(--tx-color-success)]" />
        </div>
      </div>
  </div>
</template>

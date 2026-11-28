<script setup lang="ts">
import { computed, ref } from 'vue'

const colorMode = useColorMode()
const beamTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))
const active = ref(true)
</script>

<template>
  <TxFlex direction="column" gap="24px" class="beam-pulse">
    <TxFlex align="center" gap="40px" wrap="wrap">
      <TxBorderBeam size="pulse-inner" :theme="beamTheme" :active="active" :border-radius="16">
        <TxCard :radius="16" :padding="28" shadow="none" class="beam-pulse__card">
          pulse-inner
        </TxCard>
      </TxBorderBeam>
      <!-- pulse-outside blooms BEHIND the content: it needs an opaque child
           whose own 1px border supplies the idle hairline. -->
      <TxBorderBeam size="pulse-outside" :theme="beamTheme" :active="active" :border-radius="16">
        <TxCard :radius="16" :padding="28" shadow="none" class="beam-pulse__card">
          pulse-outside
        </TxCard>
      </TxBorderBeam>
    </TxFlex>
    <TxFlex align="center" gap="8px">
      <TxSwitch v-model="active" />
      <span class="beam-pulse__hint">active</span>
    </TxFlex>
  </TxFlex>
</template>

<style scoped>
.beam-pulse {
  padding: 24px 8px;
}

.beam-pulse__card {
  width: 200px;
  font-size: 13px;
}

.beam-pulse__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>

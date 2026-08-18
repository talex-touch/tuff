<script setup lang="ts">
import { computed } from 'vue'

const colorMode = useColorMode()
// The beam is tuned per background; follow the docs site theme.
const beamTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))
</script>

<template>
  <TxFlex align="center" gap="28px" wrap="wrap" class="beam-showcase">
    <TxBorderBeam :theme="beamTheme" :border-radius="16">
      <TxCard :radius="16" :padding="24" shadow="none" class="beam-showcase__card">
        <TxFlex direction="column" gap="4px">
          <strong>md</strong>
          <span class="beam-showcase__hint">full border</span>
        </TxFlex>
      </TxCard>
    </TxBorderBeam>
    <TxFlex direction="column" gap="20px">
      <TxBorderBeam size="sm" :theme="beamTheme">
        <TxButton round variant="secondary">
          sm
        </TxButton>
      </TxBorderBeam>
      <TxBorderBeam size="line" :theme="beamTheme" :border-radius="12">
        <div class="beam-showcase__line">
          <TxFlatInput placeholder="line" />
        </div>
      </TxBorderBeam>
    </TxFlex>
  </TxFlex>
</template>

<style scoped>
.beam-showcase {
  padding: 24px 8px;
}

.beam-showcase__card {
  width: 220px;
}

.beam-showcase__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.beam-showcase__line {
  width: 200px;
}
</style>

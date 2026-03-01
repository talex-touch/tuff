<script setup lang="ts">
import { CoreBoxOmniPanelKeys } from '@talex-touch/utils/i18n'
import { TxButton } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import TuffIcon from '~/components/base/TuffIcon.vue'

const emit = defineEmits<{
  (event: 'close'): void
}>()

const { t } = useI18n()
</script>

<template>
  <header class="OmniPanelHeader">
    <div class="OmniPanelHeader__titleBlock">
      <p class="OmniPanelHeader__eyebrow">OmniPanel</p>
      <h1 class="OmniPanelHeader__title">{{ t(CoreBoxOmniPanelKeys.TITLE, '全景面板') }}</h1>
    </div>
    <TxButton class="OmniPanelHeader__close" variant="flat" @click="emit('close')">
      <TuffIcon :icon="{ type: 'class', value: 'i-ri-close-line' }" :size="18" />
    </TxButton>
  </header>
</template>

<style scoped lang="scss">
.OmniPanelHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.OmniPanelHeader__eyebrow {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.OmniPanelHeader__title {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.OmniPanelHeader__close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color);
  color: var(--tx-text-color-secondary);
}
</style>

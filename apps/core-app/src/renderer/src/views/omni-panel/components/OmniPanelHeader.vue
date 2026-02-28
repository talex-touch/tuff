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
  align-items: flex-start;
  justify-content: space-between;
}

.OmniPanelHeader__eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(199, 210, 254, 0.75);
}

.OmniPanelHeader__title {
  margin: 6px 0 0;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 650;
}

.OmniPanelHeader__close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.5);
  color: #cbd5e1;
}
</style>

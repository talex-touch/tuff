<script setup lang="ts">
import { CoreBoxOmniPanelKeys } from '@talex-touch/utils/i18n'
import { TxTag } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    text: string
    source: string
    capturedAt?: number | null
    hasSelection: boolean
    fallbackText: string
  }>(),
  {
    capturedAt: null
  }
)

const { t } = useI18n()

const resolvedText = computed(() => {
  if (props.hasSelection) return props.text
  return props.fallbackText
})
</script>

<template>
  <section class="OmniPanelContextCard">
    <div class="OmniPanelContextCard__meta">
      <TxTag size="sm" color="var(--tx-fill-color)">
        {{ t(CoreBoxOmniPanelKeys.SOURCE, '来源') }}: {{ source }}
      </TxTag>
      <span v-if="capturedAt">{{ new Date(capturedAt).toLocaleTimeString() }}</span>
    </div>
    <p class="OmniPanelContextCard__text">{{ resolvedText }}</p>
  </section>
</template>

<style scoped lang="scss">
.OmniPanelContextCard {
  border: 1px solid var(--tx-border-color);
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  padding: 10px 12px;
}

.OmniPanelContextCard__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.OmniPanelContextCard__text {
  margin: 8px 0 0;
  color: var(--tx-text-color-primary);
  line-height: 1.5;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 84px;
  overflow: auto;
}
</style>

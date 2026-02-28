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
      <TxTag size="sm" color="rgba(99, 102, 241, 0.24)">
        {{ t(CoreBoxOmniPanelKeys.SOURCE, '来源') }}: {{ source }}
      </TxTag>
      <span v-if="capturedAt">{{ new Date(capturedAt).toLocaleTimeString() }}</span>
    </div>
    <p class="OmniPanelContextCard__text">{{ resolvedText }}</p>
  </section>
</template>

<style scoped lang="scss">
.OmniPanelContextCard {
  border: 1px solid rgba(129, 140, 248, 0.35);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.6);
  padding: 14px 16px;
}

.OmniPanelContextCard__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(165, 180, 252, 0.85);
}

.OmniPanelContextCard__text {
  margin: 10px 0 0;
  color: #e2e8f0;
  line-height: 1.6;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow: auto;
}
</style>

<script setup lang="ts">
import type { TxAiLoadingHintProps, TxAiMotionPreset } from '../../types'
import TxAiThinking from './TxAiThinking.vue'

interface Props extends TxAiLoadingHintProps {
  /** Set to `'none'` to disable indicator animation while keeping status semantics. */
  motion?: TxAiMotionPreset
}

defineOptions({
  name: 'TxAiLoadingHint',
})

withDefaults(defineProps<Props>(), {
  label: 'Working',
  description: '',
  status: 'running',
  tone: 'neutral',
  motion: 'fade',
})
</script>

<template>
  <div
    class="tx-ai-loading-hint"
    :class="[
      `tx-ai-loading-hint--${status}`,
      `tx-ai-loading-hint--${tone}`,
      { 'tx-ai-loading-hint--static': motion === 'none' },
    ]"
    :data-motion="motion"
  >
    <!-- The dots are decoration here: the label is rendered once by the body below,
         and the indicator's own sr-only text keeps the status announced. -->
    <TxAiThinking
      v-if="status === 'pending' || status === 'running'"
      :text="label"
      :show-text="false"
      variant="dots"
      :motion="motion"
    />
    <div v-else class="tx-ai-loading-hint__status" aria-hidden="true" />
    <div class="tx-ai-loading-hint__body">
      <div class="tx-ai-loading-hint__label">
        {{ label }}
      </div>
      <div v-if="description" class="tx-ai-loading-hint__description">
        {{ description }}
      </div>
    </div>
  </div>
</template>

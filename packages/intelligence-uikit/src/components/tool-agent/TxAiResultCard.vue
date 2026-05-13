<script setup lang="ts">
import type { TxAiResultCardProps } from '../../types'

defineOptions({
  name: 'TxAiResultCard',
})

withDefaults(defineProps<TxAiResultCardProps>(), {
  title: '',
  description: '',
  tone: 'neutral',
})
</script>

<template>
  <article class="tx-ai-result-card" :class="`tx-ai-result-card--${tone}`">
    <header v-if="title || $slots.header" class="tx-ai-result-card__header">
      <slot name="header">
        <h3 class="tx-ai-result-card__title">
          {{ title }}
        </h3>
      </slot>
    </header>
    <div v-if="description" class="tx-ai-result-card__description">
      {{ description }}
    </div>
    <div v-if="$slots.default" class="tx-ai-result-card__content">
      <slot />
    </div>
  </article>
</template>

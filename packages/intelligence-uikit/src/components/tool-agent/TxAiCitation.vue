<script setup lang="ts">
import type { TxAiCitationProps } from '../../types'

defineOptions({
  name: 'TxAiCitation',
})

withDefaults(defineProps<TxAiCitationProps>(), {
  href: '',
  index: undefined,
  description: '',
})
</script>

<template>
  <component
    :is="href ? 'a' : 'span'"
    class="tx-ai-citation"
    :href="href || undefined"
    target="_blank"
    rel="noreferrer"
  >
    <span v-if="index != null" class="tx-ai-citation__index">{{ index }}</span>
    <span class="tx-ai-citation__body">
      <span class="tx-ai-citation__title">{{ title }}</span>
      <span v-if="description" class="tx-ai-citation__description">{{ description }}</span>
    </span>
  </component>
</template>

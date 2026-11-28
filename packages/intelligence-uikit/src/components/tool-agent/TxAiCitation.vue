<script setup lang="ts">
import type { TxAiCitationProps } from '../../types'
import { computed } from 'vue'

defineOptions({
  name: 'TxAiCitation',
})

const props = withDefaults(defineProps<TxAiCitationProps>(), {
  href: '',
  index: undefined,
  description: '',
})

const safeHref = computed(() => {
  const raw = props.href?.trim() ?? ''
  if (!raw)
    return ''
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  }
  catch {
    return ''
  }
})
</script>

<template>
  <component
    :is="safeHref ? 'a' : 'span'"
    class="tx-ai-citation"
    :href="safeHref || undefined"
    :target="safeHref ? '_blank' : undefined"
    :rel="safeHref ? 'noopener noreferrer' : undefined"
  >
    <span v-if="index != null" class="tx-ai-citation__index">{{ index }}</span>
    <span class="tx-ai-citation__body">
      <span class="tx-ai-citation__title">{{ title }}</span>
      <span v-if="description" class="tx-ai-citation__description">{{ description }}</span>
    </span>
  </component>
</template>

<script setup lang="ts">
import type { TxAiAgentBadgeProps } from '../../types'

defineOptions({
  name: 'TxAiAgentBadge',
})

withDefaults(defineProps<TxAiAgentBadgeProps>(), {
  description: '',
  avatarUrl: '',
  tone: 'neutral',
})
</script>

<template>
  <span class="tx-ai-agent-badge" :class="`tx-ai-agent-badge--${tone}`">
    <span class="tx-ai-agent-badge__avatar" aria-hidden="true">
      <img v-if="avatarUrl" :src="avatarUrl" alt="">
      <span v-else>{{ name.slice(0, 1).toUpperCase() }}</span>
    </span>
    <span class="tx-ai-agent-badge__body">
      <span class="tx-ai-agent-badge__name">{{ name }}</span>
      <span v-if="description" class="tx-ai-agent-badge__description">{{ description }}</span>
    </span>
  </span>
</template>

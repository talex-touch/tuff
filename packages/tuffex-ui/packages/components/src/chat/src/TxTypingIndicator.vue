<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'TxTypingIndicator',
})

const props = withDefaults(defineProps<{
  text?: string
  showText?: boolean
  size?: number
  gap?: number
}>(), {
  text: 'Typing…',
  showText: true,
  size: 6,
  gap: 5,
})

const dotStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}))

const dotsStyle = computed(() => ({
  gap: `${props.gap}px`,
}))
</script>

<template>
  <div class="tx-typing-indicator" role="status" aria-live="polite">
    <div class="tx-typing-indicator__dots" :style="dotsStyle" aria-hidden="true">
      <span class="tx-typing-indicator__dot" :style="dotStyle" />
      <span class="tx-typing-indicator__dot" :style="dotStyle" />
      <span class="tx-typing-indicator__dot" :style="dotStyle" />
    </div>
    <span v-if="showText" class="tx-typing-indicator__text">{{ text }}</span>
  </div>
</template>

<style scoped lang="scss">
.tx-typing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 12px;
}

.tx-typing-indicator__dots {
  display: inline-flex;
  align-items: center;
}

.tx-typing-indicator__dot {
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 72%, transparent);
  animation: tx-typing-indicator-bounce 1.1s infinite ease-in-out;
}

.tx-typing-indicator__dot:nth-child(2) {
  animation-delay: 0.12s;
}

.tx-typing-indicator__dot:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes tx-typing-indicator-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>

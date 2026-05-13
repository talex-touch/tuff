<script setup lang="ts">
import type { TxAiStreamTextProps } from '../../types'
import { computed } from 'vue'
import { TxTextTransformer } from '@talex-touch/tuffex'

defineOptions({
  name: 'TxAiStreamText',
})

const props = withDefaults(defineProps<TxAiStreamTextProps>(), {
  as: 'span',
  streaming: false,
  cursor: true,
  motion: 'blur',
  duration: 240,
  wrap: false,
  stagger: 18,
})

const rootClass = computed(() => ({
  'is-streaming': props.streaming,
  'has-cursor': props.cursor,
  'is-wrap': props.wrap,
  'is-character-fade': props.motion === 'fade',
}))

const characters = computed(() => Array.from(props.text ?? ''))
</script>

<template>
  <component
    :is="as"
    class="tx-ai-stream-text"
    :class="rootClass"
    aria-live="polite"
  >
    <span v-if="motion === 'fade'" class="tx-ai-stream-text__characters">
      <span
        v-for="(char, index) in characters"
        :key="`${index}-${char}`"
        class="tx-ai-stream-text__char"
        :style="{
          '--tx-ai-char-delay': `${index * stagger}ms`,
          '--tx-ai-char-duration': `${duration}ms`,
        }"
      >
        {{ char === ' ' ? '\u00A0' : char }}
      </span>
    </span>
    <TxTextTransformer
      v-else-if="motion === 'blur'"
      :text="text"
      :duration-ms="duration"
      :wrap="wrap"
    />
    <span v-else class="tx-ai-stream-text__plain">{{ text }}</span>
    <span v-if="streaming && cursor" class="tx-ai-stream-text__cursor" aria-hidden="true" />
  </component>
</template>

<script setup lang="ts">
import type { TxAiStreamTextProps } from '../../types'
import type { StreamRevealPreset } from '@talex-touch/tuffex/stream-text'
import { computed } from 'vue'
import { TxStreamText } from '@talex-touch/tuffex/stream-text'

defineOptions({
  name: 'TxAiStreamText',
})

const props = withDefaults(defineProps<TxAiStreamTextProps>(), {
  as: 'span',
  streaming: false,
  cursor: true,
  motion: 'blur',
  stagger: 24,
})

// The cadence is tuffex's pacer (`TxStreamText`), not a per-character delay: the source
// arrives in bursts, and releasing one character every `stagger` ms from a fixed index
// made a long burst land as a cascade that outran the text. The pacer holds a steady
// word-per-tick rate, accelerates when it falls behind the source, and drains the
// backlog once the source stops.
const revealPreset = computed<StreamRevealPreset>(() => {
  if (props.motion === 'none')
    return 'none'
  if (props.motion === 'slide-fade')
    return 'languid'
  if (props.motion === 'rebound')
    return 'aurora'
  // `fade` and `blur` both mean "resolve out of a blur" at word granularity.
  return 'blur'
})
</script>

<template>
  <TxStreamText
    :content="text"
    :streaming="streaming"
    :appear="streaming"
    :reveal="revealPreset"
    :caret="cursor"
    :word-ms="stagger"
    :tag="as"
  />
</template>

<script setup lang="ts">
import type { TxAiAssistantTurnProps, TxAiSegment } from '../../types'
import { reactive } from 'vue'
import { TxChainOfThought } from '@talex-touch/tuffex/chain-of-thought'
import { TxStreamElement } from '@talex-touch/tuffex/stream-element'
import { TxToolCallCard } from '@talex-touch/tuffex/tool-call-card'

defineOptions({
  name: 'TxAiAssistantTurn',
})

withDefaults(defineProps<TxAiAssistantTurnProps>(), {
  streaming: false,
  elementProps: () => ({}),
  toolCallProps: () => ({}),
  hasToolFace: () => false,
})

defineSlots<{
  /** A tool the host gives its own face (widget, form, chart); only rendered when `hasToolFace` says so. */
  tool?: (props: { segment: Extract<TxAiSegment, { kind: 'tool' }> }) => unknown
  /** After the segments: the pre-first-token wait, compaction notice, errors. */
  default?: () => unknown
}>()

// The reader's open/collapse choice per segment. Keyed by segment id so a streaming delta that
// re-aligns the list never resets what they opened.
const chainOpen = reactive(new Map<string, boolean>())
const toolOpen = reactive(new Map<string, boolean>())
</script>

<template>
  <div class="tx-ai-turn">
    <template v-for="segment in segments" :key="segment.id">
      <TxChainOfThought
        v-if="segment.kind === 'reasoning'"
        class="tx-ai-turn__chain"
        :steps="[segment.step]"
        :streaming="streaming"
        :default-open="false"
        :user-open="chainOpen.get(segment.id)"
        :label="segment.step.title"
        @toggle="chainOpen.set(segment.id, $event)"
      />

      <TxStreamElement
        v-else-if="segment.kind === 'text'"
        class="tx-ai-turn__text"
        v-bind="elementProps"
        :content="segment.text"
        :streaming="segment.streaming"
      />

      <slot v-else-if="hasToolFace(segment.part)" name="tool" :segment="segment" />

      <TxToolCallCard
        v-else
        class="tx-ai-turn__tool"
        v-bind="toolCallProps"
        :tool-call="segment.part"
        :user-open="toolOpen.get(segment.id)"
        @toggle="toolOpen.set(segment.id, $event)"
      />
    </template>

    <slot />
  </div>
</template>

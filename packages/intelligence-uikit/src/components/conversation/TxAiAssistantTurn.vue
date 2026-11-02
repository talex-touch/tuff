<script setup lang="ts">
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxAiAssistantTurnProps, TxAiSegment } from '../../types'
import { computed, reactive } from 'vue'
import { TxChainOfThought } from '@talex-touch/tuffex/chain-of-thought'
import { TxStreamElement } from '@talex-touch/tuffex/stream-element'
import { TxToolCallCard } from '@talex-touch/tuffex/tool-call-card'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { toolFaceOf } from '../../utils/tool-payload'
import TxAiToolChart from '../tool-agent/TxAiToolChart.vue'
import TxAiToolForm from '../tool-agent/TxAiToolForm.vue'
import TxAiToolWidget from '../tool-agent/TxAiToolWidget.vue'
import TxAiTurnFooter from './TxAiTurnFooter.vue'
import TxAiErrorBlock from './TxAiErrorBlock.vue'

defineOptions({ name: 'TxAiAssistantTurn' })
const props = withDefaults(defineProps<TxAiAssistantTurnProps>(), {
  streaming: false,
  elementProps: () => ({}),
  toolCallProps: () => ({}),
  payloadLabel: 'View payload',
  thinkingVerb: 'Thinking',
  thinkingLabel: 'Thinking…',
  compactingLabel: 'Compacting context…',
  motion: 'fade',
})
const emit = defineEmits<{
  'form-submit': [part: AiToolCallPart, values: Record<string, FormFieldValue>]
  'form-change': [part: AiToolCallPart, values: Record<string, FormFieldValue>]
  'payload': [part: AiToolCallPart]
  'copy': [text: string]
  'regenerate': []
  'speak': []
  'branch': []
  'retry': []
  'error-action': []
}>()
defineSlots<{
  /** When present overrides tools; hasToolFace optionally restricts the override. */
  tool?: (props: { segment: Extract<TxAiSegment, { kind: 'tool' }> }) => unknown
  footer?: () => unknown
  error?: () => unknown
  default?: () => unknown
}>()
const chainOpen = reactive(new Map<string, boolean>())
const toolOpen = reactive(new Map<string, boolean>())
// Parse result envelopes once per update, never repeatedly in a template branch.
const toolFaces = computed(() => new Map(props.segments.flatMap(segment =>
  segment.kind === 'tool' ? [[segment.id, toolFaceOf(segment.part)] as const] : [],
)))
</script>

<template>
  <div class="tx-ai-turn" :data-motion="motion">
    <template v-for="segment in segments" :key="segment.id">
      <TxChainOfThought
        v-if="segment.kind === 'reasoning'"
        class="tx-ai-turn__chain"
        :steps="[segment.step]"
        :streaming="streaming"
        :default-open="false"
        :bullets="false"
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
      <slot v-else-if="$slots.tool && (!hasToolFace || hasToolFace(segment.part))" name="tool" :segment="segment" />
      <div v-else-if="toolFaces.get(segment.id) && (toolFaces.get(segment.id)?.kind !== 'widget' || widgetSandbox)" class="tx-ai-turn__face">
        <TxAiToolChart
          v-if="toolFaces.get(segment.id)?.kind === 'chart'"
          v-bind="chartProps"
          :spec="(toolFaces.get(segment.id) as Extract<ReturnType<typeof toolFaceOf>, { kind: 'chart' }>).spec"
          :animate="streaming"
          :motion="motion === 'none' ? 'none' : 'fade'"
        />
        <TxAiToolForm
          v-else-if="toolFaces.get(segment.id)?.kind === 'form'"
          v-bind="formProps"
          :spec="(toolFaces.get(segment.id) as Extract<ReturnType<typeof toolFaceOf>, { kind: 'form' }>).spec"
          :submitted="submittedForms?.has(segment.part.id) || segment.part.submitted === true"
          :initial-values="formDrafts?.get(segment.part.id)"
          @submit="emit('form-submit', segment.part, $event)"
          @change="emit('form-change', segment.part, $event)"
        />
        <TxAiToolWidget
          v-else-if="widgetSandbox && toolFaces.get(segment.id)?.kind === 'widget'"
          v-bind="widgetProps"
          :source="(toolFaces.get(segment.id) as Extract<ReturnType<typeof toolFaceOf>, { kind: 'widget' }>).spec.source"
          :title="(toolFaces.get(segment.id) as Extract<ReturnType<typeof toolFaceOf>, { kind: 'widget' }>).spec.title"
          :fallback="segment.part.output"
          :sandbox="widgetSandbox"
        />
        <button v-if="showToolPayload" class="tx-ai-turn__payload" type="button" @click="emit('payload', segment.part)">
          <span class="i-ri-braces-line" aria-hidden="true" />{{ payloadLabel }}
        </button>
      </div>
      <TxToolCallCard
        v-else
        class="tx-ai-turn__tool"
        v-bind="toolCallProps"
        :tool-call="segment.part"
        :user-open="toolOpen.get(segment.id)"
        @toggle="toolOpen.set(segment.id, $event)"
      />
    </template>
    <div v-if="waiting" class="tx-ai-turn__thinking" role="status">
      <TxThinkingOrb :size="64" :display-size="28" variant="gradient" :label="thinkingVerb" :paused="motion === 'none'" />
      <TxTextMorph :text="thinkingLabel" :duration-ms="motion === 'none' ? 0 : 320" />
    </div>
    <p v-if="streaming && compacting" class="tx-ai-turn__compacting" role="status">
      <span class="i-ri-archive-2-line" aria-hidden="true" />{{ compactingLabel }}
    </p>
    <slot name="error">
      <TxAiErrorBlock v-if="error" v-bind="error" @retry="emit('retry')" @action="emit('error-action')" />
    </slot>
    <slot name="footer">
      <TxAiTurnFooter v-if="footer" v-bind="footer" :motion="motion" @copy="emit('copy', $event)" @regenerate="emit('regenerate')" @speak="emit('speak')" @branch="emit('branch')" />
    </slot>
    <slot />
  </div>
</template>

<style scoped>
.tx-ai-turn { display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 0; }
.tx-ai-turn__face { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 14px; box-sizing: border-box; border-radius: var(--tx-border-radius-large, 12px); box-shadow: inset 0 0 0 1px var(--tx-border-color-light); background: var(--tx-bg-color); }
.tx-ai-turn__payload { display: inline-flex; align-items: center; align-self: flex-start; gap: 5px; padding: 2px 6px; border: none; border-radius: 4px; background: transparent; color: var(--tx-text-color-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.tx-ai-turn__payload:hover { background: var(--tx-fill-color-light); }
.tx-ai-turn__thinking { display: inline-flex; align-items: center; gap: 10px; margin: 4px 0; color: var(--tx-text-color-secondary); font-style: italic; }
.tx-ai-turn__compacting { display: inline-flex; gap: 6px; align-items: center; margin: 2px 0 0; color: var(--tx-text-color-secondary); font-size: 12px; }
</style>

<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { ContextCardsEmits, ContextCardsProps, ContextChunk, ContextChunkOpenPayload } from './types'
import TxContextChunk from './TxContextChunk.vue'

defineOptions({ name: 'TxContextCards' })

const props = withDefaults(defineProps<ContextCardsProps>(), {
  title: 'All chunks',
  appear: true,
  staggerStep: 100,
  chipDelay: 700,
  chipStaggerStep: 80,
})

const emit = defineEmits<ContextCardsEmits>()

defineSlots<{
  /** Replaces the whole header row. */
  header?: () => any
  /** Replaces a whole card. */
  chunk?: (props: { chunk: ContextChunk, index: number }) => any
  'chunk-title'?: (props: { chunk: ContextChunk }) => any
  'chunk-body'?: (props: { chunk: ContextChunk }) => any
  'chunk-source'?: (props: { chunk: ContextChunk, source: ContextChunk['source'] }) => any
}>()

// Only the batch that is on screen at mount reads as one arrival, so only it
// gets staggered. A chunk streamed in later would otherwise inherit its index's
// delay and sit blank for half a second before fading up.
const initialCount = props.chunks.length

function enterDelay(index: number) {
  return index < initialCount ? index * props.staggerStep : 0
}

function chipDelay(index: number) {
  return props.chipDelay + (index < initialCount ? index * props.chipStaggerStep : 0)
}

function onOpen(payload: ContextChunkOpenPayload) {
  emit('open', payload)
}
</script>

<template>
  <div class="tx-bui-context-cards">
    <slot name="header">
      <div v-if="title || total !== undefined" class="tx-bui-context-cards__header">
        <span v-if="title" class="tx-bui-context-cards__title">{{ title }}</span>
        <span v-if="total !== undefined" class="tx-bui-context-cards__total">{{ total }}</span>
      </div>
    </slot>

    <!-- The key belongs on the template, not the slot: an attribute on <slot>
         would be passed down as a slot prop instead of keying the list. -->
    <template v-for="(item, index) in chunks" :key="item.id">
      <slot name="chunk" :chunk="item" :index="index">
        <TxContextChunk
          :chunk="item"
          :appear="appear"
          :enter-delay="enterDelay(index)"
          :chip-delay="chipDelay(index)"
          @open="onOpen"
        >
          <template v-if="$slots['chunk-title']" #title="titleProps">
            <slot name="chunk-title" v-bind="titleProps" />
          </template>
          <template v-if="$slots['chunk-body']" #body="bodyProps">
            <slot name="chunk-body" v-bind="bodyProps" />
          </template>
          <template v-if="$slots['chunk-source']" #source="sourceProps">
            <slot name="chunk-source" v-bind="sourceProps" />
          </template>
        </TxContextChunk>
      </slot>
    </template>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-in;

.tx-bui-context-cards {
  @include bui-scope;

  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: var(--tx-bui-context-cards-max-width, 380px);

  &__header {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 0 2px;
    animation: tx-bui-fade-in 400ms ease-out both;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--tx-bui-ink, #1f2124);
  }

  &__total {
    @include bui-tabular-nums;

    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--tx-bui-ink-2, #62656b);
    background: var(--tx-bui-inset, #f7f8f9);
    border-radius: 6px;
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  }

  @media (prefers-reduced-motion: reduce) {
    &__header {
      animation: none;
    }
  }
}
</style>

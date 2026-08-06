<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

defineOptions({ name: 'TxReasoningDisclosure' })

const props = withDefaults(
  defineProps<{
    text?: string
    streaming?: boolean
    durationMs?: number
    defaultOpen?: boolean
    /** Header label once settled. @default 'Reasoning' */
    label?: string
    /** Header label while streaming. @default 'Thinking…' */
    thinkingLabel?: string
    /** Formats the settled duration. @default (ms) => `Thought for X.Xs` */
    durationFormatter?: (ms: number) => string
  }>(),
  {
    text: '',
    streaming: false,
    defaultOpen: false,
    label: 'Reasoning',
    thinkingLabel: 'Thinking…',
  },
)

const emit = defineEmits<{
  toggle: [open: boolean]
}>()

const open = ref(props.defaultOpen)
const bodyId = useId()

function toggle(): void {
  open.value = !open.value
  emit('toggle', open.value)
}

const headerLabel = computed(() => (props.streaming ? props.thinkingLabel : props.label))

const durationText = computed(() => {
  if (props.streaming || props.durationMs === undefined)
    return ''
  const format = props.durationFormatter ?? ((ms: number) => `Thought for ${(ms / 1000).toFixed(1)}s`)
  return format(props.durationMs)
})

// The open text region follows its own tail while thinking streams in.
const textRef = ref<HTMLElement | null>(null)

watch(
  () => props.text,
  () => {
    if (!props.streaming)
      return
    const el = textRef.value
    if (el)
      el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="tx-reasoning-disclosure" :class="{ 'is-streaming': streaming }">
    <button
      type="button"
      class="tx-reasoning-disclosure__header"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="tx-reasoning-disclosure__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3a6 6 0 0 1 6 6c0 2.2-1.2 3.6-2.4 4.8-.7.7-1.1 1.4-1.3 2.2h-4.6c-.2-.8-.6-1.5-1.3-2.2C7.2 12.6 6 11.2 6 9a6 6 0 0 1 6-6Z" />
          <path d="M9.5 19.5h5M10.5 22h3" />
        </svg>
      </span>
      <span class="tx-reasoning-disclosure__label">{{ headerLabel }}</span>
      <span v-if="durationText" class="tx-reasoning-disclosure__duration">{{ durationText }}</span>
      <span class="tx-reasoning-disclosure__chevron" :class="{ 'is-open': open }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>

    <div :id="bodyId" class="tx-reasoning-disclosure__collapse" :class="{ 'is-open': open }">
      <div class="tx-reasoning-disclosure__body">
        <div ref="textRef" class="tx-reasoning-disclosure__text">
{{ text }}
</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-reasoning-disclosure {
  border-left: 2px solid var(--tx-border-color-light, #e4e7ed);
  padding-left: 10px;

  .tx-reasoning-disclosure__header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    border: none;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .tx-reasoning-disclosure__icon {
    display: inline-flex;
  }

  // Shimmer sweeps the label while the model is thinking.
  &.is-streaming .tx-reasoning-disclosure__label {
    background: linear-gradient(
      90deg,
      var(--tx-text-color-secondary, #6b7280) 35%,
      var(--tx-text-color-primary, #111827) 50%,
      var(--tx-text-color-secondary, #6b7280) 65%
    );
    background-clip: text;
    background-size: 200% 100%;
    color: transparent;
    animation: tx-reasoning-shimmer 1.6s linear infinite;
  }

  .tx-reasoning-disclosure__duration {
    color: var(--tx-text-color-placeholder, #a8abb2);
    font-size: 11.5px;
  }

  .tx-reasoning-disclosure__chevron {
    display: inline-flex;
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      transform: rotate(180deg);
    }
  }

  .tx-reasoning-disclosure__collapse {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.26s cubic-bezier(0.4, 0, 0.2, 1);

    &.is-open {
      grid-template-rows: 1fr;
    }
  }

  .tx-reasoning-disclosure__body {
    min-height: 0;
    overflow: hidden;
  }

  .tx-reasoning-disclosure__text {
    max-height: 200px;
    margin-top: 4px;
    overflow: auto;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

@keyframes tx-reasoning-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-reasoning-disclosure .tx-reasoning-disclosure__collapse,
  .tx-reasoning-disclosure .tx-reasoning-disclosure__chevron,
  .tx-reasoning-disclosure.is-streaming .tx-reasoning-disclosure__label {
    transition: none;
    animation: none;
  }
}
</style>

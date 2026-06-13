<script setup lang="ts">
import type { AiElementMessage } from './types'
import { computed } from 'vue'
import TxMarkdownView from '../../markdown-view/src/TxMarkdownView.vue'

const props = withDefaults(
  defineProps<{
    message: AiElementMessage
    markdown?: boolean
    compact?: boolean
  }>(),
  {
    markdown: true,
    compact: false,
  },
)

defineOptions({
  name: 'TxAiMessage',
})

const roleLabel = computed(() => {
  if (props.message.name)
    return props.message.name

  switch (props.message.role) {
    case 'assistant':
      return 'AI'
    case 'tool':
      return 'Tool'
    case 'system':
      return 'System'
    default:
      return 'You'
  }
})

const statusLabel = computed(() => {
  switch (props.message.status) {
    case 'pending':
      return 'Pending'
    case 'streaming':
      return 'Streaming'
    case 'error':
      return 'Error'
    default:
      return ''
  }
})
</script>

<template>
  <article
    class="tx-ai-message"
    :class="[
      `tx-ai-message--${message.role}`,
      { 'tx-ai-message--compact': compact, 'is-error': message.status === 'error' },
    ]"
    :data-role="message.role"
  >
    <div class="tx-ai-message__avatar" aria-hidden="true">
      <slot name="avatar" :message="message">
        <img v-if="message.avatar" :src="message.avatar" alt="">
        <span v-else>{{ roleLabel.slice(0, 1).toUpperCase() }}</span>
      </slot>
    </div>

    <div class="tx-ai-message__body">
      <header class="tx-ai-message__header">
        <span class="tx-ai-message__role">{{ roleLabel }}</span>
        <span v-if="statusLabel" class="tx-ai-message__status">{{ statusLabel }}</span>
      </header>

      <div class="tx-ai-message__content">
        <slot :message="message">
          <TxMarkdownView v-if="markdown" :content="message.content" />
          <p v-else>
{{ message.content }}
</p>
        </slot>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.tx-ai-message {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  width: 100%;
}

.tx-ai-message--user {
  grid-template-columns: minmax(0, 1fr) 30px;

  .tx-ai-message__avatar {
    grid-column: 2;
    color: var(--tx-color-primary, #409eff);
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
    border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 24%, transparent);
  }

  .tx-ai-message__body {
    grid-column: 1;
    grid-row: 1;
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 6%, var(--tx-fill-color-blank, #fff));
    border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, var(--tx-border-color-lighter, #e5e7eb));
  }
}

.tx-ai-message__avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 12px;
  color: var(--tx-color-success, #67c23a);
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent);
  font-size: 11px;
  font-weight: 700;
}

.tx-ai-message__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tx-ai-message__body {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 14px;
  background: var(--tx-fill-color-blank, #fff);
}

.tx-ai-message__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tx-ai-message__role {
  color: var(--tx-text-color-secondary, #6b7280);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.tx-ai-message__status {
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  font-size: 10px;
  font-weight: 600;
}

.tx-ai-message__content {
  color: var(--tx-text-color-primary, #111827);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.tx-ai-message__content p {
  margin: 0;
  white-space: pre-wrap;
}

.tx-ai-message--system .tx-ai-message__body,
.tx-ai-message--tool .tx-ai-message__body {
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 60%, transparent);
}

.tx-ai-message.is-error .tx-ai-message__body {
  border-color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 28%, var(--tx-border-color-lighter, #e5e7eb));
  background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 7%, var(--tx-fill-color-blank, #fff));
}

.tx-ai-message--compact {
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;

  &.tx-ai-message--user {
    grid-template-columns: minmax(0, 1fr) 24px;
  }

  .tx-ai-message__avatar {
    width: 24px;
    height: 24px;
    border-radius: 9px;
    font-size: 10px;
  }

  .tx-ai-message__body {
    padding: 8px 10px;
    border-radius: 12px;
  }
}
</style>

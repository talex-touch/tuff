<script setup lang="ts">
import { computed } from 'vue'
import TxMarkdownView from '../../markdown-view/src/TxMarkdownView.vue'

defineOptions({
  name: 'TxChatMessage',
})

const props = withDefaults(
  defineProps<{
    message: {
      id: string
      role: 'user' | 'assistant' | 'system'
      content: string
      createdAt?: number
      avatarUrl?: string
      attachments?: Array<{ type: 'image', url: string, name?: string }>
    }
    markdown?: boolean
  }>(),
  {
    markdown: true,
  },
)

const emit = defineEmits<{
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
}>()

const roleClass = computed(() => {
  return `tx-chat-message--${props.message.role}`
})

const createdText = computed(() => {
  if (!props.message.createdAt)
    return ''
  const d = new Date(props.message.createdAt)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
})

function onImageClick(url: string, name?: string): void {
  emit('imageClick', { url, name, messageId: props.message.id })
}
</script>

<template>
  <article class="tx-chat-message" :class="roleClass">
    <div class="tx-chat-message__meta">
      <div class="tx-chat-message__avatar">
        <slot name="avatar" :message="message">
          <img v-if="message.avatarUrl" :src="message.avatarUrl" alt="">
          <div v-else class="tx-chat-message__avatar-fallback" aria-hidden="true" />
        </slot>
      </div>

      <div class="tx-chat-message__bubble">
        <header v-if="$slots.header || createdText" class="tx-chat-message__header">
          <slot name="header" :message="message">
            <span v-if="createdText" class="tx-chat-message__time">{{ createdText }}</span>
          </slot>
        </header>

        <div class="tx-chat-message__content">
          <slot name="content" :message="message">
            <TxMarkdownView v-if="markdown" :content="message.content" />
            <div v-else class="tx-chat-message__plain">
              {{ message.content }}
            </div>
          </slot>
        </div>

        <div v-if="message.attachments?.length" class="tx-chat-message__attachments">
          <button
            v-for="(a, idx) in message.attachments"
            :key="idx"
            type="button"
            class="tx-chat-message__thumb"
            @click="onImageClick(a.url, a.name)"
          >
            <img :src="a.url" :alt="a.name || ''" loading="lazy">
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.tx-chat-message {
  width: 100%;
}

.tx-chat-message__meta {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tx-chat-message__avatar {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tx-chat-message__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tx-chat-message__avatar-fallback {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tx-color-primary, #409eff) 30%, transparent),
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 75%, transparent)
  );
}

.tx-chat-message__bubble {
  flex: 1;
  min-width: 0;
  border-radius: 14px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 10px 12px;
}

.tx-chat-message__header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.tx-chat-message__time {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-chat-message__plain {
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tx-text-color-primary, #111827);
}

.tx-chat-message__attachments {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-chat-message__thumb {
  width: 92px;
  height: 64px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
}

.tx-chat-message__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tx-chat-message--user .tx-chat-message__meta {
  flex-direction: row-reverse;
}

.tx-chat-message--user .tx-chat-message__bubble {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 7%, var(--tx-fill-color-blank, #fff));
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
}

.tx-chat-message--system .tx-chat-message__bubble {
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent);
}
</style>

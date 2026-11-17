<script setup lang="ts">
import type { TxAiMessageRailProps } from '../../types'
import { computed, ref } from 'vue'
import { buildMessageRailTurns } from '../../utils/message-rail'

defineOptions({ name: 'TxAiMessageRail' })

const props = withDefaults(defineProps<TxAiMessageRailProps>(), {
  activeIndex: -1,
  ariaLabel: 'Conversation turns',
  imageTag: '[Image]',
  codeTag: '[Code]',
  turnPrefix: '#',
})

const emit = defineEmits<{
  navigate: [messageIndex: number]
}>()

const hoveredIndex = ref<number | null>(null)

const resolvedTurns = computed(() => {
  if (props.turns)
    return props.turns
  return buildMessageRailTurns(props.messages, {
    imageTag: props.imageTag,
    codeTag: props.codeTag,
  })
})
</script>

<template>
  <nav
    v-if="resolvedTurns.length > 0"
    class="tx-ai-message-rail"
    :aria-label="ariaLabel"
  >
    <ul class="tx-ai-message-rail__list">
      <li
        v-for="turn in resolvedTurns"
        :key="turn.key"
        class="tx-ai-message-rail__item"
        :class="{
          'is-active': activeIndex === turn.messageIndex,
          'is-preview': hoveredIndex === turn.messageIndex,
        }"
        @mouseenter="hoveredIndex = turn.messageIndex"
        @mouseleave="hoveredIndex = null"
      >
        <button
          type="button"
          class="tx-ai-message-rail__trigger"
          :aria-label="`${turnPrefix}${turn.turnNumber}: ${turn.title}`"
          :aria-current="activeIndex === turn.messageIndex ? 'true' : undefined"
          @focus="hoveredIndex = turn.messageIndex"
          @blur="hoveredIndex = null"
          @click="emit('navigate', turn.messageIndex)"
        >
          <span class="tx-ai-message-rail__badge">{{ turnPrefix }}{{ turn.turnNumber }}</span>
          <span class="tx-ai-message-rail__bar" aria-hidden="true" />
        </button>

        <div class="tx-ai-message-rail__popover" role="tooltip">
          <span class="tx-ai-message-rail__popover-index">{{ turnPrefix }}{{ turn.turnNumber }}</span>
          <span class="tx-ai-message-rail__popover-text">{{ turn.title }}</span>
        </div>
      </li>
    </ul>
  </nav>
</template>

<style scoped lang="scss">
.tx-ai-message-rail {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: auto;
}

.tx-ai-message-rail__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.tx-ai-message-rail__item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tx-ai-message-rail__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-placeholder, #94a3b8);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
  cursor: pointer;

  &:hover,
  .is-active & {
    color: var(--tx-color-primary, #3b82f6);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
  }
}

.tx-ai-message-rail__bar {
  width: 12px;
  height: 2.5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.48;

  .tx-ai-message-rail__trigger:hover &,
  .is-active & {
    width: 18px;
    opacity: 1;
  }
}

.tx-ai-message-rail__badge {
  opacity: 0;
  font-weight: 600;

  .tx-ai-message-rail__trigger:hover &,
  .is-active & {
    opacity: 1;
  }
}

.tx-ai-message-rail__popover {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 25;
  display: none;
  align-items: flex-start;
  gap: 6px;
  width: 220px;
  padding: 8px 10px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  border-radius: 10px;
  background: var(--tx-bg-color-overlay, #ffffff);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  color: var(--tx-text-color-primary, #0f172a);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;

  .is-preview & {
    display: flex;
  }
}

.tx-ai-message-rail__popover-index {
  flex: none;
  color: var(--tx-color-primary, #3b82f6);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-weight: 600;
}

.tx-ai-message-rail__popover-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  word-break: break-word;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-message-rail__bar,
  .tx-ai-message-rail__badge {
    transition: width 0.16s ease, opacity 0.16s ease;
  }
}
</style>

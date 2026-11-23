<script setup lang="ts">
import type { TxAiMessageRailProps } from '../../types'
import type { TxAiRailPromptSegment, TxAiRailTurn } from '../../utils/message-rail'
import { computed, ref } from 'vue'
import {
  buildMessageRailSegments,
  buildMessageRailTurns,
  countRailImageAttachments,
  RAIL_IMAGE_SENTINEL,
} from '../../utils/message-rail'

defineOptions({ name: 'TxAiMessageRail' })

const props = withDefaults(defineProps<TxAiMessageRailProps>(), {
  variant: 'popover',
  activeIndex: -1,
  ariaLabel: 'Conversation turns',
  imageTag: '[Image]',
  codeTag: '[Code]',
  fallbackLabel: undefined,
  maxLength: undefined,
  turnPrefix: '#',
  turnAriaLabel: undefined,
})

const emit = defineEmits<{
  navigate: [messageIndex: number]
}>()

const hoveredIndex = ref<number | null>(null)
const hoveredKey = ref<string | null>(null)

interface MinimalRailTurn extends TxAiRailTurn {
  segments: TxAiRailPromptSegment[]
}

const resolvedTurns = computed(() => {
  if (props.turns)
    return props.turns
  return buildMessageRailTurns(props.messages, {
    imageTag: props.imageTag,
    codeTag: props.codeTag,
    fallbackLabel: props.fallbackLabel,
    maxLength: props.maxLength,
  })
})

const minimalTurns = computed<MinimalRailTurn[]>(() => {
  if (props.variant !== 'minimal')
    return []
  const baseTurns = props.turns
    ? props.turns
    : buildMessageRailTurns(props.messages, {
        imageTag: RAIL_IMAGE_SENTINEL,
        codeTag: props.codeTag,
        fallbackLabel: props.fallbackLabel ?? 'Message',
        maxLength: props.maxLength ?? 200,
      })
  return baseTurns.map((turn) => {
    const source = props.messages[turn.messageIndex]
    const extraImages = source ? countRailImageAttachments(source) : 0
    return {
      ...turn,
      segments: buildMessageRailSegments(
        turn.title,
        Boolean(source?.content?.trim()),
        extraImages,
        {
          sentinel: RAIL_IMAGE_SENTINEL,
          fallbackLabel: props.fallbackLabel ?? 'Message',
        },
      ),
    }
  })
})

function resolveTurnLabel(turn: TxAiRailTurn): string {
  if (props.turnAriaLabel)
    return props.turnAriaLabel(turn.turnNumber, turn.title)
  return `${props.turnPrefix}${turn.turnNumber}: ${turn.title}`
}
</script>

<template>
  <nav
    v-if="variant === 'minimal' && minimalTurns.length > 0"
    class="tx-ai-message-rail tx-ai-message-rail--minimal"
    :aria-label="ariaLabel"
  >
    <div class="tx-ai-message-rail__track">
      <div
        v-for="turn in minimalTurns"
        :key="turn.key"
        class="tx-ai-message-rail__turn"
        :class="{
          'is-active': activeIndex === turn.messageIndex,
          'is-hovered': hoveredKey === turn.key,
          'is-first': turn.turnNumber === 1,
        }"
        @mouseenter="hoveredKey = turn.key"
        @mouseleave="hoveredKey = null"
      >
        <Transition name="tx-ai-rail-text">
          <div
            v-if="hoveredKey === turn.key"
            class="tx-ai-message-rail__prompt-text"
            @click.stop="emit('navigate', turn.messageIndex)"
          >
            <template v-for="(seg, idx) in turn.segments" :key="idx">
              <span v-if="seg.type === 'image'" class="tx-ai-message-rail__image-tag">{{
                seg.value
              }}</span>
              <template v-else>
                {{ seg.value }}
              </template>
            </template>
          </div>
        </Transition>

        <button
          type="button"
          class="tx-ai-message-rail__bar-wrap"
          :aria-label="resolveTurnLabel(turn)"
          :aria-current="activeIndex === turn.messageIndex ? 'true' : undefined"
          @focus="hoveredKey = turn.key"
          @blur="hoveredKey = null"
          @click="emit('navigate', turn.messageIndex)"
        >
          <span class="tx-ai-message-rail__bar-line" aria-hidden="true" />
          <span class="tx-ai-message-rail__index">{{ turnPrefix }}{{ turn.turnNumber }}</span>
        </button>
      </div>
    </div>
  </nav>
  <nav
    v-else-if="variant === 'popover' && resolvedTurns.length > 0"
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
          :aria-label="resolveTurnLabel(turn)"
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

.tx-ai-message-rail--minimal {
  justify-content: center;
  pointer-events: none;
  user-select: none;
}

.tx-ai-message-rail__track {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px 0;
  pointer-events: auto;
}

.tx-ai-message-rail__turn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.tx-ai-message-rail__bar-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

.tx-ai-message-rail__bar-line {
  height: 2px;
  width: 32px;
  border-radius: 999px;
  background: var(--tx-border-color-light, #e2e8f0);
  opacity: 0.65;

  .is-hovered & {
    width: 54px;
    background: var(--tx-color-primary, #409eff);
    opacity: 1;
  }
}

.tx-ai-message-rail__index {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #64748b);
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
  min-width: 16px;
  text-align: right;

  .is-hovered & {
    opacity: 1;
    color: var(--tx-color-primary, #409eff);
    font-weight: 600;
  }
}

.tx-ai-message-rail__prompt-text {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  width: 220px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--shell-text-secondary, var(--tx-text-color-secondary, #64748b));
  word-break: break-word;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: right;
  pointer-events: none;
  z-index: 10;
  text-shadow: 0 1px 3px var(--tx-bg-color, #ffffff);

  .is-first & {
    bottom: auto;
    top: calc(100% + 4px);
  }
}

.tx-ai-message-rail__image-tag {
  display: inline-block;
  padding: 0 3px;
  margin: 0 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
  border-radius: 3px;
  vertical-align: baseline;
}

.tx-ai-rail-text-enter-from,
.tx-ai-rail-text-leave-to {
  opacity: 0;
  transform: translateY(2px);

  .is-first & {
    transform: translateY(-2px);
  }
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
  color: var(--tx-text-color-regular, #475569);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 10px;
  cursor: pointer;

  &:hover,
  .is-preview &,
  .is-active & {
    color: var(--tx-color-primary, #3b82f6);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
  }
}

// Resting contrast measured against TuffEx theme backgrounds (WCAG 1.4.11 >= 3:1):
// light `--tx-text-color-regular #606266` @ 0.76 -> 3.55:1 on `#ffffff`, 3.32:1 on `#f2f3f5`
// (fallback `#475569` @ 0.76 -> 4.07:1 on `#ffffff`); dark `#cfd3dc` @ 0.76 -> 7.50:1 on `#141414`;
// high-contrast light/dark -> 6.77:1 / 10.55:1.
.tx-ai-message-rail__bar {
  width: 12px;
  height: 2.5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.76;

  .tx-ai-message-rail__trigger:hover &,
  .is-preview &,
  .is-active & {
    width: 18px;
    opacity: 1;
  }
}

.tx-ai-message-rail__badge {
  opacity: 0;
  font-weight: 600;

  .tx-ai-message-rail__trigger:hover &,
  .is-preview &,
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
  .tx-ai-message-rail__badge,
  .tx-ai-message-rail__bar-line,
  .tx-ai-message-rail__index {
    transition: width 0.16s ease, opacity 0.16s ease;
  }

  .tx-ai-rail-text-enter-active,
  .tx-ai-rail-text-leave-active {
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }
}
</style>

<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { AgentScreenProps } from './types'
/**
 * TxAgentScreen Component
 *
 * A framed view of what an agent is looking at — the capture, an optional
 * pointer overlay, and a caption. The frame is all this owns: what is inside it
 * comes from `src` or the default slot, so the same component can show a
 * screenshot, a live canvas, or a streamed video.
 *
 * @example
 * ```vue
 * <TxAgentScreen :src="frame" alt="Agent's desktop" label="Agent's screen" :cursor="{ x: 52, y: 61 }" />
 * ```
 *
 * @component
 */
import { computed, onBeforeUnmount, ref, useSlots } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { TxButton } from '../../button'

defineOptions({ name: 'TxAgentScreen' })

const props = withDefaults(defineProps<AgentScreenProps & {
  expandable?: boolean
  teachable?: boolean
  teaching?: boolean
  expandLabel?: string
  closeLabel?: string
  teachLabel?: string
  stopTeachLabel?: string
}>(), {
  src: '',
  alt: '',
  label: '',
  state: 'working',
  cursor: undefined,
  ratio: '2964 / 1856',
  ariaLabel: 'Agent screen',
  loadingLabel: 'Waiting for the agent’s screen',
  expandable: false,
  teachable: false,
  teaching: undefined,
  expandLabel: 'Expand screen',
  closeLabel: 'Close',
  teachLabel: 'Teach a task',
  stopTeachLabel: 'Stop recording',
})

const emit = defineEmits<{
  'update:teaching': [teaching: boolean]
  'expand': []
  'close': []
}>()

defineSlots<{
  /** Replaces the frame's content. Takes precedence over `src`. */
  default?: () => any
  /** Rendered above the frame content, inside the clip. */
  overlay?: () => any
  /** Replaces the caption. */
  label?: () => any
}>()

const slots = useSlots()

const loading = computed(() => props.state === 'loading')

/**
 * A host-provided surface wins over `src`: a live canvas and a stale
 * screenshot must not stack.
 */
const showFrame = computed(() => !loading.value && (Boolean(slots.default) || Boolean(props.src)))

const frameStyle = computed(() => ({ aspectRatio: props.ratio }))

const cursorStyle = computed(() => {
  if (!props.cursor)
    return undefined
  // Clamped rather than trusted: a capture-relative coordinate can arrive
  // slightly outside the frame, and an un-clamped one escapes the clip and
  // lands on the page.
  const clamp = (value: number) => Math.min(100, Math.max(0, value))
  return {
    left: `${clamp(props.cursor.x)}%`,
    top: `${clamp(props.cursor.y)}%`,
  }
})

const expanded = ref(false)
const internalTeaching = ref(false)
const expandTriggerRef = ref<HTMLButtonElement | null>(null)
const isTeaching = computed(() => props.teaching ?? internalTeaching.value)

function onModalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape')
    closeExpanded()
}

function openExpanded(): void {
  if (!props.expandable || !showFrame.value || expanded.value)
    return
  expanded.value = true
  emit('expand')
  if (hasDocument())
    document.addEventListener('keydown', onModalKeydown)
}

function closeExpanded(): void {
  if (!expanded.value)
    return
  expanded.value = false
  emit('close')
  if (hasDocument())
    document.removeEventListener('keydown', onModalKeydown)
  expandTriggerRef.value?.focus()
}

function toggleTeaching(): void {
  const next = !isTeaching.value
  internalTeaching.value = next
  emit('update:teaching', next)
}

onBeforeUnmount(() => {
  if (hasDocument())
    document.removeEventListener('keydown', onModalKeydown)
})
</script>

<template>
  <div class="tx-bui-agent-screen" role="group" :aria-label="ariaLabel">
    <div
      class="tx-bui-agent-screen__frame"
      :class="{ 'is-expandable': expandable && showFrame }"
      :style="frameStyle"
      @click="expandable && showFrame ? openExpanded() : undefined"
    >
      <template v-if="showFrame">
        <slot>
          <img class="tx-bui-agent-screen__image" :src="src" :alt="alt">
        </slot>

        <div
          v-if="cursor"
          class="tx-bui-agent-screen__cursor"
          :style="cursorStyle"
          aria-hidden="true"
        >
          <!-- Inline rather than an icon font: the pointer needs a light fill
               with a dark outline to stay visible over an arbitrary capture,
               which a single-colour glyph cannot do. -->
          <svg viewBox="0 0 16 20" width="16" height="20">
            <path
              d="M1 1 L1 16.5 L5.1 12.7 L7.7 18.6 L10.4 17.4 L7.8 11.6 L13.2 11.2 Z"
              fill="#fff"
              stroke="#1f2124"
              stroke-width="1.2"
              stroke-linejoin="round"
            />
          </svg>
          <span v-if="cursor.label" class="tx-bui-agent-screen__cursor-label">{{ cursor.label }}</span>
        </div>

        <button
          v-if="expandable"
          ref="expandTriggerRef"
          type="button"
          class="tx-bui-agent-screen__expand-btn"
          :aria-label="expandLabel"
          @click.stop="openExpanded"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>

        <slot name="overlay" />
      </template>

      <!-- A state that changes without user action, so it announces itself. -->
      <div
        v-else
        class="tx-bui-agent-screen__placeholder"
        role="status"
        aria-live="polite"
      >
        <span class="tx-bui-agent-screen__sr">{{ loadingLabel }}</span>
      </div>
    </div>

    <div v-if="label || slots.label" class="tx-bui-agent-screen__label">
      <slot name="label">
        {{ label }}
      </slot>
    </div>

    <Teleport to="body">
      <div
        v-if="expanded"
        class="tx-bui-agent-screen__modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="label || ariaLabel"
        @click.self="closeExpanded"
      >
        <div class="tx-bui-agent-screen__modal">
          <div class="tx-bui-agent-screen__modal-bar">
            <span class="tx-bui-agent-screen__modal-title">{{ label || ariaLabel }}</span>
            <div class="tx-bui-agent-screen__modal-actions">
              <TxButton
                v-if="teachable"
                class="tx-bui-agent-screen__teach-btn"
                :class="{ 'is-recording': isTeaching }"
                size="sm"
                :variant="isTeaching ? 'danger' : 'secondary'"
                :plain="isTeaching"
                round
                :aria-pressed="isTeaching"
                @click="toggleTeaching"
              >
                <span class="tx-bui-agent-screen__teach-dot" aria-hidden="true" />
                <span>{{ isTeaching ? stopTeachLabel : teachLabel }}</span>
              </TxButton>
              <TxButton
                class="tx-bui-agent-screen__close-btn"
                size="sm"
                variant="bare"
                :aria-label="closeLabel"
                @click="closeExpanded"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </TxButton>
            </div>
          </div>
          <div class="tx-bui-agent-screen__modal-frame" :style="frameStyle">
            <slot>
              <img class="tx-bui-agent-screen__image" :src="src" :alt="alt">
            </slot>
            <div
              v-if="cursor"
              class="tx-bui-agent-screen__cursor"
              :style="cursorStyle"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 20" width="16" height="20">
                <path
                  d="M1 1 L1 16.5 L5.1 12.7 L7.7 18.6 L10.4 17.4 L7.8 11.6 L13.2 11.2 Z"
                  fill="#fff"
                  stroke="#1f2124"
                  stroke-width="1.2"
                  stroke-linejoin="round"
                />
              </svg>
              <span v-if="cursor.label" class="tx-bui-agent-screen__cursor-label">{{ cursor.label }}</span>
            </div>
            <slot name="overlay" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-bui-agent-screen {
  @include skeleton-keyframes;

  width: 100%;

  &__frame {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--tx-bui-radius-card, 10px);
    // The capture supplies its own edges, so the frame only needs the hairline
    // ring that separates it from the page — never a border on top of it.
    background-color: var(--tx-bui-inset, #f7f8f9);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);

    &.is-expandable {
      cursor: pointer;
    }
  }

  &__expand-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--tx-bui-radius-chip, 6px);
    background: color-mix(in srgb, var(--tx-bui-tooltip-bg, #25272b) 78%, transparent);
    color: var(--tx-bui-tooltip-fg, #f6f7f8);
    cursor: pointer;
    opacity: 0;

    .tx-bui-agent-screen__frame:hover &,
    &:focus-visible {
      opacity: 1;
    }

    &:focus-visible {
      outline: 2px solid var(--tx-bui-accent, #0285ff);
      outline-offset: 2px;
    }
  }

  &__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  // Positioned by its tip, which is the pixel the coordinate refers to.
  &__cursor {
    position: absolute;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    pointer-events: none;
    // `drop-shadow` rather than a box shadow: the pointer is an arbitrary
    // silhouette, and a rectangular shadow around it would read as a card.
    filter: drop-shadow(0 1px 2px color-mix(in srgb, var(--tx-color-black, #000) 25%, transparent));
  }

  &__cursor-label {
    margin-top: 12px;
    padding: 2px 6px;
    border-radius: var(--tx-bui-radius-chip, 6px);
    background: var(--tx-bui-tooltip-bg, #25272b);
    color: var(--tx-bui-tooltip-fg, #f6f7f8);
    font-size: 11.5px;
    line-height: 1.4;
    white-space: nowrap;
  }

  &__placeholder {
    // Reuses the library's skeleton bar rather than minting a second shimmer:
    // one timing, one reduced-motion guard. Only the colour is pinned to the
    // BUI surface, so the placeholder matches the frame it is filling instead
    // of the base theme's generic fill.
    --tx-skeleton-base-color: var(--tx-bui-hover-2, #e7e9eb);

    position: absolute;
    inset: 0;

    @include skeleton-surface;
  }

  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  &__label {
    margin-top: 10px;
    padding: 0 2px;
    overflow: hidden;
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tx-bui-agent-screen__modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2300;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--tx-color-black, #000) 56%, transparent);
  backdrop-filter: blur(6px);
  font-family: var(--tx-font-family, "Inter", "Helvetica Neue", Arial, sans-serif);
}

.tx-bui-agent-screen__modal {
  width: min(860px, 100%);
  overflow: hidden;
  border-radius: var(--tx-bui-radius-card, 12px);
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-overlay, 0 0 0 1px #ecedef, 0 14px 40px #0000002e);
}

.tx-bui-agent-screen__modal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tx-bui-line, #ecedef);
}

.tx-bui-agent-screen__modal-title {
  font-size: 13px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-bui-ink, #1f2124);
}

.tx-bui-agent-screen__modal-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.tx-bui-agent-screen__teach-btn.tx-button {
  gap: 6px;
}

.tx-bui-agent-screen__teach-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--tx-bui-red, #e3474c);
}

.tx-bui-agent-screen__close-btn.tx-button {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
  border-radius: var(--tx-bui-radius-chip, 6px);
  color: var(--tx-bui-ink-2, #62656b);

  &:hover {
    background: var(--tx-bui-hover, #f4f5f6);
    color: var(--tx-bui-ink, #1f2124);
  }
}

.tx-bui-agent-screen__modal-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  background-color: var(--tx-bui-inset, #f7f8f9);
}
</style>

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
import { computed, useSlots } from 'vue'

defineOptions({ name: 'TxAgentScreen' })

const props = withDefaults(defineProps<AgentScreenProps>(), {
  src: '',
  alt: '',
  label: '',
  state: 'working',
  cursor: undefined,
  ratio: '2964 / 1856',
  ariaLabel: 'Agent screen',
  loadingLabel: 'Waiting for the agent’s screen',
})

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
</script>

<template>
  <div class="tx-bui-agent-screen" role="group" :aria-label="ariaLabel">
    <div class="tx-bui-agent-screen__frame" :style="frameStyle">
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
    filter: drop-shadow(0 1px 2px #00000040);
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
</style>

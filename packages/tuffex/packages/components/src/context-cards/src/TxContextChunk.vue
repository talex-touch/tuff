<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { ContextChunkEmits, ContextChunkProps, ContextChunkSource } from './types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TxIconChip } from '../../icon-chip'

defineOptions({ name: 'TxContextChunk' })

const props = withDefaults(defineProps<ContextChunkProps>(), {
  appear: true,
  enterDelay: 0,
  chipDelay: 700,
})

const emit = defineEmits<ContextChunkEmits>()

defineSlots<{
  /** Replaces the title text (the leading glyph stays). */
  title?: (props: { chunk: ContextChunkProps['chunk'] }) => any
  /** Replaces the retrieved text. */
  body?: (props: { chunk: ContextChunkProps['chunk'] }) => any
  /** Replaces the whole source row. */
  source?: (props: { chunk: ContextChunkProps['chunk'], source: ContextChunkSource | undefined }) => any
}>()

// Upstream leans on a global `prefers-reduced-motion` rule that squashes every
// duration to 0.01ms but leaves `transition-delay` untouched — so the chip
// still waits 700ms before appearing at all. Skipping the timer outright is
// the fix: reduced motion should remove the wait, not just the fade.
function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const chipSettled = ref(false)
let chipTimer: ReturnType<typeof setTimeout> | null = null

function clearChipTimer() {
  if (chipTimer !== null) {
    clearTimeout(chipTimer)
    chipTimer = null
  }
}

watch(
  () => [props.appear, props.chipDelay] as const,
  ([appear, delay]) => {
    clearChipTimer()
    if (!appear || prefersReducedMotion() || delay <= 0) {
      chipSettled.value = true
      return
    }
    chipSettled.value = false
    chipTimer = setTimeout(() => {
      chipTimer = null
      chipSettled.value = true
    }, delay)
  },
  { immediate: true },
)

onBeforeUnmount(clearChipTimer)

const source = computed(() => props.chunk.source)
const sourceTag = computed(() => (source.value?.href ? 'a' : 'span'))

const cardStyle = computed(() => ({
  '--tx-bui-context-chunk-enter-delay': `${props.enterDelay}ms`,
}))

function onSourceClick(event: MouseEvent) {
  const current = source.value
  if (!current?.href)
    return
  // The href stays in the DOM for hover previews and copy-link, but navigation
  // is the host's decision — an Electron renderer must not follow it in place.
  event.preventDefault()
  emit('open', { chunk: props.chunk, source: current })
}
</script>

<template>
  <article
    class="tx-bui-context-chunk"
    :class="{ 'is-appearing': appear }"
    :style="cardStyle"
  >
    <div class="tx-bui-context-chunk__bar">
      <span class="tx-bui-context-chunk__heading">
        <svg
          class="tx-bui-context-chunk__glyph"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        <span class="tx-bui-context-chunk__title">
          <slot name="title" :chunk="chunk">
            {{ chunk.title }}
          </slot>
        </span>
      </span>
      <span v-if="chunk.chars" class="tx-bui-context-chunk__chars">{{ chunk.chars }}</span>
    </div>

    <p v-if="chunk.body || $slots.body" class="tx-bui-context-chunk__body">
      <slot name="body" :chunk="chunk">
        {{ chunk.body }}
      </slot>
    </p>

    <div v-if="source || $slots.source" class="tx-bui-context-chunk__footer">
      <slot name="source" :chunk="chunk" :source="source">
        <component
          :is="sourceTag"
          v-if="source"
          class="tx-bui-context-chunk__source"
          :class="{ 'is-settled': chipSettled, 'is-interactive': !!source.href }"
          :href="source.href || undefined"
          @click="onSourceClick"
        >
          <TxIconChip
            v-if="source.badge"
            :size="14"
            :tone="source.tone ?? 'neutral'"
            :label="source.badge"
          />
          <span class="tx-bui-context-chunk__source-name">{{ source.name }}</span>
          <svg
            v-if="source.href"
            class="tx-bui-context-chunk__external"
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 17L17 7M7 7h10v10" />
          </svg>
        </component>
      </slot>
    </div>
  </article>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-fade-up;

.tx-bui-context-chunk {
  @include bui-scope;

  overflow: hidden;
  background: var(--tx-bui-surface, #fff);
  border-radius: var(--tx-bui-radius-card, 10px);
  box-shadow: var(--tx-bui-shadow-card, 0 0 0 1px #ecedef, 0 1px 2px #1018280a, 0 2px 6px #10182808);

  &.is-appearing {
    animation: tx-bui-fade-up 400ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1))
      var(--tx-bui-context-chunk-enter-delay, 0ms) both;
  }

  &__bar {
    @include bui-card-bar;

    display: flex;
    gap: 10px;
    align-items: center;
    border-bottom: 1px solid var(--tx-bui-line, #ecedef);
  }

  &__heading {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--tx-bui-ink, #1f2124);
  }

  &__glyph {
    flex-shrink: 0;
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chars {
    @include bui-tabular-nums;

    flex-shrink: 0;
    margin-left: auto;
    font-size: 12px;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  &__body {
    padding: 8px 12px 4px;
    margin: 0;
    font-size: 12.5px;
    line-height: 1.625;
    color: var(--tx-bui-ink-2, #62656b);
  }

  &__footer {
    padding: 0 12px 12px;
  }

  &__source {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    height: 24px;
    max-width: 100%;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--tx-bui-ink-2, #62656b);
    text-decoration: none;
    background: var(--tx-bui-inset, #f7f8f9);
    border-radius: 999px;
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
    opacity: 0;
    transform: scale(0.95);
    transition:
      opacity 300ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      transform 300ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      background-color 300ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &.is-settled {
      opacity: 1;
      transform: scale(1);
    }

    // Hover feedback only where there is something to activate — upstream
    // paints it on every row, which reads as clickable when it is not.
    &.is-interactive {
      cursor: pointer;

      &:hover {
        background: var(--tx-bui-hover, #f4f5f6);
      }

      &:focus-visible {
        outline: 2px solid var(--tx-bui-accent, #0285ff);
        outline-offset: 2px;
      }
    }
  }

  &__source-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__external {
    flex-shrink: 0;
  }

  // Upstream's global reduced-motion rule squashes durations but leaves delays
  // intact, so its 700ms chip and 100ms-per-card stagger become blank gaps
  // rather than instant reveals. Killing the animation outright drops the delay
  // with it — and the resting styles below must therefore be fully visible on
  // their own, never waiting on a timer or an animation to be revealed.
  @media (prefers-reduced-motion: reduce) {
    &.is-appearing {
      animation: none;
    }

    // This chip rests at `opacity: 0` and is revealed by `.is-settled`. Pinning
    // the resting state visible keeps it off the JS timer's critical path: if
    // the media query is live but `matchMedia` ever read false, the chip would
    // otherwise stay invisible for the whole delay.
    &__source {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
}
</style>

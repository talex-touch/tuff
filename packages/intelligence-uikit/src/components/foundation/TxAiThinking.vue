<script setup lang="ts">
import type { TxAiMotionPreset, TxAiThinkingProps } from '../../types'
import { TxTypingIndicator } from '@talex-touch/tuffex/chat'
import { computed, onMounted, ref, watch } from 'vue'

interface Props extends TxAiThinkingProps {
  /** Set to `'none'` to keep a static resting frame without any indicator loop. */
  motion?: TxAiMotionPreset
}

defineOptions({
  name: 'TxAiThinking',
})

const props = withDefaults(defineProps<Props>(), {
  text: 'Thinking...',
  variant: 'ai',
  showText: true,
  size: 6,
  motion: 'fade',
})

const LIVE_ANIM_ATTR = 'data-live-anim'
const LIVE_ANIM_STAGGER_ATTR = 'data-live-anim-stagger'

const rootEl = ref<HTMLElement | null>(null)
const isStatic = computed(() => props.motion === 'none')

function clearLiveAnimAttrs(el: Element): void {
  el.removeAttribute(LIVE_ANIM_ATTR)
  el.removeAttribute(LIVE_ANIM_STAGGER_ATTR)
}

function syncLiveAnimTargets(): void {
  const root = rootEl.value
  if (!root)
    return

  for (const prev of root.querySelectorAll(`[${LIVE_ANIM_ATTR}]`))
    clearLiveAnimAttrs(prev)

  if (isStatic.value)
    return

  switch (props.variant) {
    case 'dots': {
      root.querySelectorAll('.tx-typing-indicator__dot').forEach((dot, index) => {
        dot.setAttribute(LIVE_ANIM_ATTR, 'dot')
        if (index > 0)
          dot.setAttribute(LIVE_ANIM_STAGGER_ATTR, String(index))
      })
      break
    }
    case 'bars': {
      root.querySelectorAll('.tx-typing-indicator__bar').forEach((bar, index) => {
        bar.setAttribute(LIVE_ANIM_ATTR, 'bar')
        if (index > 0)
          bar.setAttribute(LIVE_ANIM_STAGGER_ATTR, String(index))
      })
      break
    }
    case 'pure':
    case 'ring':
    case 'circle-dash': {
      root.querySelector(`.tx-typing-indicator__${props.variant}`)?.setAttribute(LIVE_ANIM_ATTR, 'spin')
      break
    }
    case 'ai': {
      root.querySelector('.tx-typing-indicator__ai')?.setAttribute(LIVE_ANIM_ATTR, 'breathe')
      break
    }
  }
}

onMounted(syncLiveAnimTargets)
watch([() => props.variant, () => props.motion], syncLiveAnimTargets, { flush: 'post' })
</script>

<template>
  <div
    ref="rootEl"
    class="tx-ai-thinking"
    :class="{ 'tx-ai-thinking--static': isStatic }"
    :data-motion="motion"
  >
    <TxTypingIndicator
      :variant="variant"
      :text="text"
      :show-text="showText"
      :size="size"
    />
  </div>
</template>

<style scoped lang="scss">
@mixin tx-ai-thinking-stop-css-loop {
  :deep(.tx-typing-indicator__dot),
  :deep(.tx-typing-indicator__bar),
  :deep(.tx-typing-indicator__pure),
  :deep(.tx-typing-indicator__ring),
  :deep(.tx-typing-indicator__circle-dash),
  :deep(.tx-typing-indicator__ai),
  :deep(.tx-typing-indicator__ai-mask),
  :deep(.tx-typing-indicator__ai-mask polygon) {
    animation: none;
  }
}

// Standalone fallback (when no host `live-animation-clock` is installed):
// quantize TuffEx's continuous 60-120fps indicator curves to stepped ~10-12fps
// ticks and suppress the main-thread `filter: contrast`/polygon loops on the `ai`
// orb so translucent/refraction backdrops are not repainted every vsync.
@media (prefers-reduced-motion: no-preference) {
  .tx-ai-thinking :deep(.tx-typing-indicator__dot),
  .tx-ai-thinking :deep(.tx-typing-indicator__bar),
  .tx-ai-thinking :deep(.tx-typing-indicator__ai) {
    animation-timing-function: steps(16, end);
  }

  .tx-ai-thinking :deep(.tx-typing-indicator__pure),
  .tx-ai-thinking :deep(.tx-typing-indicator__ring),
  .tx-ai-thinking :deep(.tx-typing-indicator__circle-dash) {
    animation-timing-function: steps(12, end);
  }

  .tx-ai-thinking.tx-ai-thinking :deep(.tx-typing-indicator__ai-mask),
  .tx-ai-thinking.tx-ai-thinking :deep(.tx-typing-indicator__ai-mask polygon) {
    animation: none;
  }
}

// When CoreApp's phase-locked WAAPI clock is active, low-battery motion is enabled,
// or the caller sets `motion="none"`, remove every continuous CSS keyframe loop so
// elements sit cleanly at rest or are driven exclusively by the shared WAAPI clock.
[data-live-anim-clock='active'] .tx-ai-thinking,
html[data-low-battery-motion='1'] .tx-ai-thinking,
.tx-ai-thinking.tx-ai-thinking--static {
  @include tx-ai-thinking-stop-css-loop;
}

@media (prefers-reduced-motion: reduce) {
  .tx-ai-thinking.tx-ai-thinking {
    @include tx-ai-thinking-stop-css-loop;
  }
}
</style>

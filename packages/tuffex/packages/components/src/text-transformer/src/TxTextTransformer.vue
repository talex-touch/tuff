<script setup lang="ts">
import type { TextTransformerProps } from './types'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

defineOptions({
  name: 'TxTextTransformer',
})

const props = withDefaults(defineProps<TextTransformerProps>(), {
  durationMs: 240,
  blurPx: 8,
  tag: 'span',
  wrap: false,
})

const currentText = ref(String(props.text))
const prevText = ref<string | null>(null)

const rootRef = ref<HTMLElement | null>(null)
const prevColor = ref<string | null>(null)

const showPrev = ref(false)
const animating = ref(false)

let timer: number | null = null
let rafId: number | null = null
let opSeq = 0

const styleVars = computed(() => {
  return {
    '--tx-tt-duration': `${props.durationMs}ms`,
    '--tx-tt-blur': `${props.blurPx}px`,
  } as Record<string, string>
})

async function runTransition(nextText: string) {
  opSeq += 1
  const seq = opSeq

  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }

  if (rafId != null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  if (rootRef.value != null && typeof getComputedStyle !== 'undefined') {
    prevColor.value = getComputedStyle(rootRef.value).color
  }
  else {
    prevColor.value = null
  }

  prevText.value = currentText.value
  currentText.value = nextText
  showPrev.value = true
  animating.value = false

  await nextTick()

  if (seq !== opSeq)
    return

  if (typeof requestAnimationFrame === 'undefined') {
    animating.value = true
  }
  else {
    rafId = requestAnimationFrame(() => {
      if (seq !== opSeq)
        return
      animating.value = true
      rafId = null
    })
  }

  timer = setTimeout(() => {
    if (seq !== opSeq)
      return
    showPrev.value = false
    prevText.value = null
    animating.value = false
    prevColor.value = null
    timer = null
  }, props.durationMs + 34) as unknown as number
}

watch(
  () => props.text,
  (v) => {
    const nextText = String(v)
    if (nextText === currentText.value)
      return
    void runTransition(nextText)
  },
)

onBeforeUnmount(() => {
  if (timer != null)
    clearTimeout(timer)
  timer = null

  if (rafId != null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId)
  }
  rafId = null
})
</script>

<template>
  <component
    :is="tag"
    ref="rootRef"
    class="tx-text-transformer"
    :class="{ 'is-animating': animating, 'has-prev': showPrev, 'is-wrap': wrap }"
    :style="styleVars"
    aria-live="polite"
  >
    <span class="tx-text-transformer__layer tx-text-transformer__layer--current">
      <slot :text="currentText">{{ currentText }}</slot>
    </span>

    <span
      v-if="showPrev && prevText != null"
      class="tx-text-transformer__layer tx-text-transformer__layer--prev"
      :style="prevColor ? { color: prevColor } : undefined"
      aria-hidden="true"
    >
      <slot :text="prevText">{{ prevText }}</slot>
    </span>
  </component>
</template>

<style scoped>
.tx-text-transformer {
  position: relative;
  display: inline-block;
  overflow: hidden;
  max-width: 100%;
}

.tx-text-transformer__layer {
  display: inline-block;
  transition:
    opacity var(--tx-tt-duration) cubic-bezier(0.2, 0, 0, 1),
    filter var(--tx-tt-duration) cubic-bezier(0.2, 0, 0, 1),
    color var(--tx-tt-duration) cubic-bezier(0.2, 0, 0, 1);
  will-change: opacity, filter;
  white-space: nowrap;
}

.tx-text-transformer:not(.is-wrap) .tx-text-transformer__layer {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-text-transformer.is-wrap .tx-text-transformer__layer {
  white-space: pre-line;
}

.tx-text-transformer__layer--current {
  opacity: 1;
  filter: blur(0px);
}

.tx-text-transformer__layer--prev {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  opacity: 1;
  filter: blur(0px);
  pointer-events: none;
}

.tx-text-transformer.is-animating .tx-text-transformer__layer--current {
  opacity: 1;
  filter: blur(0px);
}

.tx-text-transformer.has-prev .tx-text-transformer__layer--current {
  opacity: 0;
  filter: blur(var(--tx-tt-blur));
}

.tx-text-transformer.has-prev.is-animating .tx-text-transformer__layer--current {
  opacity: 1;
  filter: blur(0px);
}

.tx-text-transformer.is-animating .tx-text-transformer__layer--prev {
  opacity: 0;
  filter: blur(var(--tx-tt-blur));
}
</style>

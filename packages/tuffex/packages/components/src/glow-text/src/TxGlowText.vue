<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { GlowTextProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'TxGlowText' })

const props = withDefaults(defineProps<GlowTextProps>(), {
  tag: 'span',
  active: true,
  durationMs: 1400,
  delayMs: 0,
  angle: 20,
  bandSize: 38,
  color: 'rgba(255, 255, 255, 0.9)',
  opacity: 0.75,
  mode: 'adaptive',
  radius: 10,
  repeat: true,
})

const rootRef = ref<HTMLElement>()
const textMaskContent = ref('')
let textObserver: MutationObserver | null = null

function collectSlotText(node: Node): string {
  if (node.nodeType === 3)
    return node.textContent ?? ''

  if (node.nodeType !== 1)
    return ''

  const element = node as HTMLElement
  if (
    element.classList.contains('tx-glow-text__clip-shine')
    || element.classList.contains('tx-glow-text__shine')
  ) {
    return ''
  }

  return Array.from(element.childNodes).map(collectSlotText).join('')
}

function syncTextMaskContent() {
  const el = rootRef.value
  if (!el)
    return

  const text = Array.from(el.childNodes).map(collectSlotText).join('').trim()
  textMaskContent.value = text
}

function disconnectTextObserver() {
  if (!textObserver)
    return
  textObserver.disconnect()
  textObserver = null
}

function connectTextObserver() {
  const el = rootRef.value
  if (!el || props.mode !== 'text-clip')
    return

  disconnectTextObserver()
  syncTextMaskContent()
  textObserver = new MutationObserver(() => {
    syncTextMaskContent()
  })
  textObserver.observe(el, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

watch(
  () => props.mode,
  async (mode) => {
    if (mode !== 'text-clip') {
      disconnectTextObserver()
      textMaskContent.value = ''
      return
    }
    await nextTick()
    connectTextObserver()
  },
)

const rootClasses = computed(() => {
  return {
    'is-inactive': !props.active,
    'is-once': !props.repeat,
    'is-adaptive': props.mode === 'adaptive',
    'is-text-clip': props.mode === 'text-clip',
    'has-custom-blend': Boolean(props.blendMode),
    'has-custom-backdrop': Boolean(props.backdrop),
  }
})

const styleVars = computed<CSSProperties>(() => {
  const vars: CSSProperties = {
    '--tx-glow-duration': `${props.durationMs}ms`,
    '--tx-glow-delay': `${props.delayMs}ms`,
    '--tx-glow-angle': `${props.angle}deg`,
    '--tx-glow-band': `${props.bandSize}%`,
    '--tx-glow-color': props.color,
    '--tx-glow-opacity': String(props.opacity),
    '--tx-glow-radius': `${props.radius}px`,
  }

  if (props.blendMode)
    vars['--tx-glow-blend-mode'] = props.blendMode

  if (props.backdrop)
    vars['--tx-glow-backdrop'] = props.backdrop

  return vars
})

onMounted(() => {
  if (props.mode !== 'text-clip')
    return
  connectTextObserver()
})

onBeforeUnmount(() => {
  disconnectTextObserver()
})
</script>

<template>
  <component
    :is="tag"
    ref="rootRef"
    class="tx-glow-text"
    :class="rootClasses"
    :style="styleVars"
  >
    <slot />
    <span v-if="mode === 'text-clip' && textMaskContent" class="tx-glow-text__clip-shine" aria-hidden="true">
      {{ textMaskContent }}
    </span>
    <span class="tx-glow-text__shine" aria-hidden="true" />
  </component>
</template>

<style scoped lang="scss">
.tx-glow-text {
  position: relative;
  display: inline-block;
  width: fit-content;
  max-width: 100%;
  border-radius: var(--tx-glow-radius, 10px);
  overflow: hidden;
  isolation: isolate;
}

.tx-glow-text > * {
  position: relative;
  z-index: 1;
}

.tx-glow-text.is-adaptive:not(.has-custom-blend) {
  --tx-glow-blend-mode: screen;
}

.tx-glow-text.is-text-clip .tx-glow-text__shine {
  display: none;
}

@supports (mix-blend-mode: plus-lighter) {
  .tx-glow-text.is-adaptive:not(.has-custom-blend) {
    --tx-glow-blend-mode: plus-lighter;
  }
}

@supports (backdrop-filter: blur(0)) {
  .tx-glow-text.is-adaptive:not(.has-custom-backdrop) {
    --tx-glow-backdrop: brightness(1.18) saturate(1.12);
  }
}

.tx-glow-text__shine {
  position: absolute;
  inset: -40%;
  z-index: 2;
  opacity: var(--tx-glow-opacity, 0.75);
  pointer-events: none;
  mix-blend-mode: var(--tx-glow-blend-mode, screen);
  -webkit-backdrop-filter: var(--tx-glow-backdrop, none);
  backdrop-filter: var(--tx-glow-backdrop, none);
  --tx-glow-band-size: var(--tx-glow-band, 38%);
  --tx-glow-band-half: calc(var(--tx-glow-band-size) / 2);
  --tx-glow-band-soft: calc(var(--tx-glow-band-size) / 3);

  background: linear-gradient(
    var(--tx-glow-angle, 20deg),
    transparent 0%,
    transparent calc(50% - var(--tx-glow-band-half)),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) calc(50% - var(--tx-glow-band-soft)),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) 50%,
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) calc(50% + var(--tx-glow-band-soft)),
    transparent calc(50% + var(--tx-glow-band-half)),
    transparent 100%
  );

  transform: translateX(-160%);
  filter: blur(0.4px);
  animation: tx-glow-sweep var(--tx-glow-duration, 1400ms) var(--tx-glow-ease, cubic-bezier(0.4, 0, 0.2, 1)) infinite;
  animation-delay: var(--tx-glow-delay, 0ms);
  will-change: transform, opacity, filter;
}

.tx-glow-text__clip-shine {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  overflow: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  color: transparent;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  -webkit-text-fill-color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  --tx-glow-band-size: var(--tx-glow-band, 38%);
  --tx-glow-band-half: calc(var(--tx-glow-band-size) / 2);
  --tx-glow-band-soft: calc(var(--tx-glow-band-size) / 3);

  background-image: linear-gradient(
    var(--tx-glow-angle, 20deg),
    transparent 0%,
    transparent calc(50% - var(--tx-glow-band-half)),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) calc(50% - var(--tx-glow-band-soft)),
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) 50%,
    var(--tx-glow-color, rgba(255, 255, 255, 0.9)) calc(50% + var(--tx-glow-band-soft)),
    transparent calc(50% + var(--tx-glow-band-half)),
    transparent 100%
  );
  background-repeat: no-repeat;
  background-size: 240% 220%;
  background-position: -160% 50%;
  filter: blur(0.2px);
  animation: tx-glow-text-sweep var(--tx-glow-duration, 1400ms) var(--tx-glow-ease, cubic-bezier(0.4, 0, 0.2, 1)) infinite;
  animation-delay: var(--tx-glow-delay, 0ms);
}

.tx-glow-text.is-once .tx-glow-text__shine {
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

.tx-glow-text.is-once .tx-glow-text__clip-shine {
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

.tx-glow-text.is-inactive .tx-glow-text__shine {
  display: none;
}

.tx-glow-text.is-inactive .tx-glow-text__clip-shine {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .tx-glow-text__shine {
    animation: none;
    transform: translateX(0);
    filter: none;
  }

  .tx-glow-text__clip-shine {
    animation: none;
    background-position: 50% 50%;
    filter: none;
  }
}

@keyframes tx-glow-sweep {
  0% {
    transform: translateX(-160%);
    opacity: 0;
  }
  20%,
  80% {
    opacity: var(--tx-glow-opacity, 0.75);
  }
  100% {
    transform: translateX(160%);
    opacity: 0;
  }
}

@keyframes tx-glow-text-sweep {
  0% {
    background-position: 160% 50%;
    opacity: 0;
  }
  20%,
  80% {
    opacity: var(--tx-glow-opacity, 0.75);
  }
  100% {
    background-position: -160% 50%;
    opacity: 0;
  }
}
</style>

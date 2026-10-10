<script setup lang="ts">
import type { FlowLightProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxFlowLight' })

const props = withDefaults(defineProps<FlowLightProps>(), {
  variant: 'corners',
  intensity: 1,
  colors: undefined,
})

/**
 * Only what the host set lands on the element. Colours and opacity are otherwise read where they
 * are used, through `--tx-flow-light-*`, so a host can also set them on any ancestor.
 */
const style = computed<Record<string, string>>(() => {
  const vars: Record<string, string> = {}
  if (props.intensity !== 1)
    vars['--tx-flow-light-intensity'] = String(Number.isFinite(props.intensity) ? Math.max(0, props.intensity) : 1)
  props.colors?.slice(0, 4).forEach((color, index) => {
    if (typeof color === 'string' && color.trim())
      vars[`--tx-flow-light-color-${index + 1}`] = color.trim()
  })
  return vars
})
</script>

<template>
  <div
    class="tx-flow-light"
    :class="`tx-flow-light--${variant}`"
    :style="style"
    aria-hidden="true"
  />
</template>

<style lang="scss" scoped>
/*
 * A fixed light in the Tuff brand colours, laid over a surface. Unlike the refraction surface's
 * dispersion, which can only colour what happens to sit behind the panel, it looks the same over
 * any backdrop — a submenu over an empty page glows like the menu it came from.
 *
 * Each variant brings its light- and dark-theme opacity as `--tx-flow-light-default-opacity`; a
 * host can override it with `--tx-flow-light-opacity`, and `intensity` multiplies either.
 */
.tx-flow-light {
  --tx-flow-light-c1: var(--tx-flow-light-color-1, #0894ff);
  --tx-flow-light-c2: var(--tx-flow-light-color-2, #c959dd);
  --tx-flow-light-c3: var(--tx-flow-light-color-3, #ff2e54);
  --tx-flow-light-c4: var(--tx-flow-light-color-4, #ff9004);

  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: calc(
    var(--tx-flow-light-opacity, var(--tx-flow-light-default-opacity))
    * var(--tx-flow-light-intensity, 1)
  );
}

.tx-flow-light--corners {
  --tx-flow-light-default-opacity: 0.2;

  background:
    radial-gradient(85% 42% at 0% 0%, var(--tx-flow-light-c3), transparent 70%),
    radial-gradient(85% 42% at 100% 0%, var(--tx-flow-light-c1), transparent 70%);
}

.tx-flow-light--rim {
  --tx-flow-light-default-opacity: 0.55;

  background: linear-gradient(
    90deg,
    var(--tx-flow-light-c1),
    var(--tx-flow-light-c2) 27%,
    var(--tx-flow-light-c3) 52%,
    var(--tx-flow-light-c4) 74%,
    var(--tx-flow-light-c1)
  );
  // A bright 1px rim, then a wash that is gone a third of the way down.
  -webkit-mask-image: linear-gradient(to bottom, rgb(0 0 0 / 90%) 0, rgb(0 0 0 / 90%) 1px, rgb(0 0 0 / 28%) 2px, transparent 34%);
  mask-image: linear-gradient(to bottom, rgb(0 0 0 / 90%) 0, rgb(0 0 0 / 90%) 1px, rgb(0 0 0 / 28%) 2px, transparent 34%);
}

.tx-flow-light--aurora {
  --tx-flow-light-default-opacity: 0.14;

  background:
    radial-gradient(60% 45% at 8% 0%, var(--tx-flow-light-c3), transparent 70%),
    radial-gradient(60% 45% at 96% 8%, var(--tx-flow-light-c1), transparent 70%),
    radial-gradient(70% 50% at 55% 108%, var(--tx-flow-light-c2), transparent 70%),
    radial-gradient(45% 35% at 0% 96%, var(--tx-flow-light-c4), transparent 70%);
  filter: blur(14px);
}

// A dark backdrop swallows the same light, so each variant is brighter there.
[data-theme='dark'] .tx-flow-light--corners,
.dark .tx-flow-light--corners {
  --tx-flow-light-default-opacity: 0.34;
}

[data-theme='dark'] .tx-flow-light--rim,
.dark .tx-flow-light--rim {
  --tx-flow-light-default-opacity: 0.75;
}

[data-theme='dark'] .tx-flow-light--aurora,
.dark .tx-flow-light--aurora {
  --tx-flow-light-default-opacity: 0.26;
}

// Decoration only: high contrast drops it rather than tint the panel under its text.
html[data-tx-contrast='high'] .tx-flow-light,
html.contrast .tx-flow-light {
  display: none;
}
</style>

<script lang="ts" name="ComposerModelPill" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposerChip from './ComposerChip.vue'
import { animateElement, prefersReducedMotion, snappyCurve } from './composer-motion'

/**
 * The model pill: which model the next send runs on, and at what reasoning effort. `effort` is the
 * reasoning level's short label, or nothing — on auto, or on a route that takes no effort, the pill
 * shows none (`useReasoningEffort().pillLevel`). Rendered inside `HomeModelMenu`'s trigger slot,
 * which owns the menu and hands `open` back.
 */
const props = withDefaults(
  defineProps<{
    label: string
    icon?: ITuffIcon
    effort?: string
    open?: boolean
  }>(),
  { effort: '', open: false }
)

const { t } = useI18n()

const iconKey = computed(() => (props.icon ? `${props.icon.type}:${props.icon.value}` : ''))

/** The name has to contain the visible words (WCAG label-in-name): model, then level. */
const ariaLabel = computed(() =>
  t('home.composer.modelPill', { current: [props.label, props.effort].filter(Boolean).join(' ') })
)

const chevronRef = ref<HTMLElement | null>(null)
let chevronAnimation: Animation | null = null

/**
 * The chevron turns over as the menu opens: the library's `snappy` spring, from where it is. A
 * pre-flush watcher, so the computed angle is still the old class's — or a running turn's.
 */
watch(
  () => props.open,
  (open, wasOpen) => {
    const el = chevronRef.value
    if (!el || prefersReducedMotion()) return
    const from = currentTurn(el, wasOpen)
    chevronAnimation?.cancel()
    const curve = snappyCurve()
    chevronAnimation = animateElement(
      el,
      [{ rotate: `${from}deg` }, { rotate: open ? '180deg' : '0deg' }],
      { duration: curve.duration, easing: curve.easing }
    )
  }
)

function currentTurn(el: HTMLElement, wasOpen: boolean): number {
  const value = getComputedStyle(el).rotate
  if (value === 'none') return 0
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : wasOpen ? 180 : 0
}

onBeforeUnmount(() => chevronAnimation?.cancel())
</script>

<template>
  <ComposerChip
    class="ComposerModelPill"
    :label="label"
    :suffix="effort"
    :icon-key="iconKey"
    :aria-label="ariaLabel"
    :aria-expanded="open"
  >
    <template v-if="icon" #icon>
      <TxIcon class="ComposerModelPill-Icon" :icon="icon" :size="14" />
    </template>
    <template #trailing>
      <span
        ref="chevronRef"
        class="ComposerModelPill-Chevron i-ri-arrow-down-s-line"
        :class="{ 'is-open': open }"
        aria-hidden="true"
      />
    </template>
  </ComposerChip>
</template>

<style lang="scss" scoped>
.ComposerModelPill-Icon {
  display: inline-flex;
  color: var(--shell-text-secondary);
}

/* A glyph (3:1 suffices): the secondary grey measures 4.42 light / 6.30 dark on the chip. */
.ComposerModelPill-Chevron {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--shell-text-secondary);

  &.is-open {
    rotate: 180deg;
  }
}
</style>

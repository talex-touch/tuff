<script lang="ts" name="ComposerModelPill" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposerChip from './ComposerChip.vue'

/**
 * The model pill: which model the next send runs on, and at what reasoning effort. `effort` is the
 * reasoning level's short label, or nothing — on auto, or on a route that takes no effort, the pill
 * shows none (`useReasoningEffort().pillLevel`). Rendered inside `HomeModelMenu`'s trigger slot,
 * which owns the popover and hands `open` back.
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

/** The name has to contain the visible words (WCAG label-in-name): model, then level. */
const ariaLabel = computed(() =>
  t('home.composer.modelPill', { current: [props.label, props.effort].filter(Boolean).join(' ') })
)
</script>

<template>
  <ComposerChip
    class="ComposerModelPill"
    :label="label"
    :suffix="effort"
    :open="open"
    :aria-label="ariaLabel"
    :aria-expanded="open"
    aria-haspopup="dialog"
  >
    <template v-if="icon" #icon>
      <TxIcon class="ComposerModelPill-Icon" :icon="icon" :size="15" />
    </template>
    <template #trailing>
      <span
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

@media (prefers-reduced-motion: no-preference) {
  .ComposerModelPill-Chevron {
    transition: rotate 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
}
</style>

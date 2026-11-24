<script lang="ts" name="ComposerModelPill" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ComposerChip from './ComposerChip.vue'

/**
 * The model pill: which scheduler runs the next send, which model it runs on, and at what
 * reasoning effort — 「Tuff Pi › ▣ model · 档位」. `scheduler` is the scheduler's short name, or
 * nothing on surfaces without one. `effort` is the reasoning level's short label, or nothing — on
 * auto, or on a route that takes no effort, the pill shows none (`useReasoningEffort().pillLevel`).
 * Rendered inside `HomeModelMenu`'s trigger slot, which owns the popover and hands `open` back.
 */
const props = withDefaults(
  defineProps<{
    label: string
    icon?: ITuffIcon
    effort?: string
    scheduler?: string
    open?: boolean
  }>(),
  { effort: '', scheduler: '', open: false }
)

const { t } = useI18n()

/** The name has to contain the visible words (WCAG label-in-name): scheduler, model, then level. */
const ariaLabel = computed(() =>
  t('home.composer.modelPill', {
    current: [props.scheduler, props.label, props.effort].filter(Boolean).join(' ')
  })
)
</script>

<template>
  <ComposerChip
    class="ComposerModelPill"
    :label="label"
    :prefix="scheduler"
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
.ComposerChip.ComposerModelPill {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(360px, 100%);
}

.ComposerModelPill-Icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

/* A glyph (3:1 suffices): the secondary grey measures 4.42 light / 6.30 dark on the chip. */
.ComposerModelPill-Chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

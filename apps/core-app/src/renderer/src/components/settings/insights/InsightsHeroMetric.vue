<script setup lang="ts">
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'

/**
 * The one number an insights page leads with.
 *
 * Equally sized cards make the reader choose what matters; a page with an answer puts it here, at
 * the size of a conclusion, and lets `InsightsMetricCard`s carry the working. The figure morphs by
 * place value when it changes, so a refresh shows which digits moved rather than only that
 * something did.
 */
defineOptions({ name: 'InsightsHeroMetric' })

defineProps<{
  label: string
  value: string
  /**
   * How the number was reached, for a figure that must not be mistaken for a measurement. Shown
   * on hover or focus of an icon beside the label, and read out as that icon's name.
   */
  note?: string
  /** The note icon's `data-testid`. */
  noteTestId?: string
}>()
</script>

<template>
  <article class="InsightsHeroMetric">
    <p class="InsightsHeroMetric-Label">
      {{ label }}
      <!--
        The basis rides the label, not the body.
        It is a caveat about how the number was derived, not a second number, and printing
        it under the value made the one card that carries a caveat taller than the ones that
        do not. On hover it is still one gesture away, and the row stops being ragged.
      -->
      <TxTooltip v-if="note" :content="note">
        <span
          class="InsightsHeroMetric-Note i-carbon-information"
          :data-testid="noteTestId"
          role="img"
          :aria-label="note"
          tabindex="0"
        />
      </TxTooltip>
    </p>
    <div class="InsightsHeroMetric-Value">
      <strong><TxTextMorph :text="value" /></strong>
    </div>
  </article>
</template>

<style scoped lang="scss">
/*
 * The conclusion, at the size of a conclusion.
 *
 * Its basis line sits inside the same card rather than under the section: a number this large is
 * the one most likely to be read as measured, and the sentence that says it is an estimate has
 * to be impossible to scroll past separately from it.
 */
.InsightsHeroMetric {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
}

.InsightsHeroMetric-Label {
  display: flex;
  margin: 0;
  align-items: center;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  gap: var(--shell-space-2);
}

/* Warning-coloured because the caveat is the point: the number under it is an estimate. */
.InsightsHeroMetric-Note {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--shell-warning);
  cursor: help;
}

.InsightsHeroMetric-Value {
  display: flex;
  gap: var(--shell-space-3);
  align-items: baseline;
  flex-wrap: wrap;

  > strong {
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 600;
    line-height: 1.1;
  }
}

/*
 * The morph renders its own element inside the value, and it needs two things back: the
 * figure's size, weight and colour (a descendant rule elsewhere would otherwise dress it), and
 * a baseline alignment — the engine sets `vertical-align: top` on its root, which moves the
 * row's baseline to the bottom of an inline-block. Both are only visible in a browser: jsdom
 * computes no layout.
 */
.InsightsHeroMetric-Value .tx-text-morph {
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  vertical-align: baseline;
}
</style>

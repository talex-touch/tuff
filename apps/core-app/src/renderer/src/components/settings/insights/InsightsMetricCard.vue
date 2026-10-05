<script setup lang="ts">
import { TxCard } from '@talex-touch/tuffex/card'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'

/**
 * A supporting figure on an insights page: the working behind the `InsightsHeroMetric`.
 *
 * The default slot replaces the figure and label while keeping the card's frame, which is how a
 * loading skeleton is drawn: from the same container as the loaded card, so the two cannot drift
 * apart in size.
 */
defineOptions({ name: 'InsightsMetricCard' })

withDefaults(
  defineProps<{
    value?: string
    /** Beside the figure, smaller. Leave it out when the label already names the unit. */
    unit?: string
    label?: string
    /** A caveat about the figure, behind an icon beside the label (hover or focus). */
    note?: string
    /** The note icon's `data-testid`. */
    noteTestId?: string
    /** An extra class on the figure row, for the page's own handles. It carries no style. */
    valueClass?: string
  }>(),
  {
    value: '',
    unit: undefined,
    label: '',
    note: undefined,
    noteTestId: undefined,
    valueClass: undefined
  }
)

defineSlots<{
  /** Replaces the figure and the label; the card keeps its frame. */
  default?: () => unknown
}>()
</script>

<template>
  <TxCard class="InsightsMetricCard" shadow="none">
    <slot>
      <div class="InsightsMetricCard-Value" :class="valueClass">
        <strong><TxTextMorph :text="value" /></strong>
        <span v-if="unit">{{ unit }}</span>
      </div>
      <p class="InsightsMetricCard-Label" :class="{ 'has-note': note }">
        {{ label }}
        <TxTooltip v-if="note" :content="note">
          <span
            class="InsightsMetricCard-Note i-carbon-information"
            :data-testid="noteTestId"
            role="img"
            :aria-label="note"
            tabindex="0"
          />
        </TxTooltip>
      </p>
    </slot>
  </TxCard>
</template>

<style scoped lang="scss">
.InsightsMetricCard {
  display: flex;
  min-width: 0;
  min-height: 116px;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  padding: var(--shell-space-5);

  /*
   * Moved as written, and it does not reach: TxCard renders its slot inside `.tx-card__body`, so
   * the label is a grandchild of this element and keeps its inherited size and ink with no top
   * margin — on the voice page as well, where these cards came from. Carried unchanged so the
   * migration changes nothing on screen; retargeting it is a visible change for whoever owns
   * the card's look to make on purpose.
   */
  > p {
    margin: var(--shell-space-2) 0 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-md);
  }
}

/* Only a label that carries a note becomes a row, so one without a note renders exactly as before. */
.InsightsMetricCard-Label.has-note {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

/* The same caveat icon as the hero figure's: warning-coloured, because the figure is an estimate. */
.InsightsMetricCard-Note {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--shell-warning);
  cursor: help;
}

.InsightsMetricCard-Value {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: baseline;
  min-width: 0;
  font-variant-numeric: tabular-nums;

  > strong {
    min-width: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-display);
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  > span {
    color: var(--shell-text-regular);
    font-size: var(--shell-fs-md);
    font-weight: 600;
  }
}

/*
 * The morph renders its own element inside the value, and it needs two things back.
 *
 * The rules above were descendant selectors, so `span` reached the morph's root and dressed the
 * figure in the unit's size, weight and colour — the number shrank to look like "字". And the
 * engine sets `vertical-align: top` on that root, which moves the row's baseline to the bottom
 * of an inline-block and drops the unit onto what looks like a second line. Both are only
 * visible in a browser: jsdom computes no layout, so nothing in the suite could see either.
 */
.InsightsMetricCard-Value .tx-text-morph {
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  vertical-align: baseline;
}
</style>

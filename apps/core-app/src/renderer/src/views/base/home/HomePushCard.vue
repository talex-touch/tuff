<script lang="ts" name="HomePushCard" setup>
import type { ChoiceSelectPayload, ChoiceStep } from '@talex-touch/tuffex/choice-card'
import { TxChoiceCard } from '@talex-touch/tuffex/choice-card'

/**
 * The card under the composer on an untouched Home: the two-page guide, or 「为你准备」 once there
 * is history. The root is the lane and a query container; its slot reserves the mode's tallest
 * page, so rows replacing their skeleton or a shorter page never move the centred composer.
 *
 * The page wraps this in its `home-card` transition, whose leave pins the card under the box: the
 * transition classes land on this root.
 */
defineProps<{
  steps: ChoiceStep[]
  selected: string | undefined
  /** This entry's local reads have not landed, so the rows are not final yet. */
  loading: boolean
  loadingRows: number
  /** Rows that are not final, before the skeleton is due. */
  settling: boolean
  prevLabel: string
  nextLabel: string
  /** `--home-push-rows-*` and `--home-push-pager`: what the slot reserves (`useHomeOpening`). */
  slotStyle: Record<string, string | number>
}>()

const step = defineModel<number>('step', { required: true })

const emit = defineEmits<{
  (event: 'select', payload: ChoiceSelectPayload): void
}>()
</script>

<template>
  <div class="HomePushCard">
    <div class="HomePushCard-Slot" :style="slotStyle">
      <TxChoiceCard
        v-model:step="step"
        class="HomePushCard-Card"
        :class="{ 'is-settling': settling }"
        :steps="steps"
        :selected="selected"
        :loading="loading"
        :loading-rows="loadingRows"
        :columns="2"
        :appear="false"
        :prev-label="prevLabel"
        :next-label="nextLabel"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/**
 * The push card's lane, and a query container: its slot reserves rows for the columns the card
 * actually lays out. The card's own sizes are compacted here — TxChoiceCard reads them from any
 * ancestor — so the guide's tallest page still fits a 600px window under the composer.
 */
.HomePushCard {
  --tx-choice-card-pad: 6px;
  --tx-choice-card-label-line: 18px;
  --tx-choice-card-desc-line: 16px;

  // The page's bridge folds tuffex's four fills onto the shell's two surfaces, so `--tx-fill-color`
  // and `--tx-fill-color-light` are one colour — and the card rests its options on the second and
  // hovers them onto the first: a hover with nothing to change to. Inside the card the ramp runs a
  // step further instead. The hover takes the shell's second surface, and the skeleton bars the
  // card draws on a resting row (`--tx-fill-color-darker`) a step past that, where they read.
  --tx-fill-color: var(--shell-surface-2);
  --tx-fill-color-darker: var(--shell-border);

  container: home-push / inline-size;
  width: var(--home-chat-lane-width);
  min-width: 0;
}

/**
 * Holds the mode's tallest page (`slotStyle`), so the card can shrink inside it — a shorter
 * page, fewer rows, rows replacing their skeleton — without the centred stage moving the composer.
 *
 * The arithmetic is TxChoiceCard's own box: 10px of block padding and a 2px gap in each option, 6px
 * between rows, and a head of 6px + a 20px title line + 10px, with a 24px pager and a 4px gap above
 * the title when there are pages to turn. Only the two text lines and the inset are variables; the
 * rest is restated here, so a change to the card's spacing shows up as a slot that no longer fits.
 */
.HomePushCard-Slot {
  --home-push-row: calc(
    20px + var(--tx-choice-card-label-line) + 2px + var(--tx-choice-card-desc-line)
  );
  --home-push-rows: var(--home-push-rows-1);
  --home-push-head: calc(36px + var(--home-push-pager) * 28px);
  --home-push-list: calc(var(--home-push-rows) * (var(--home-push-row) + 6px) - 6px);

  min-height: calc(2 * var(--tx-choice-card-pad) + var(--home-push-head) + var(--home-push-list));
}

/* TxChoiceCard turns to two columns at 480px of its content box, inside its two 6px insets. */
@container home-push (width >= 492px) {
  .HomePushCard-Slot {
    --home-push-rows: var(--home-push-rows-2);
  }
}

.HomePushCard-Card.is-settling {
  visibility: hidden;
}
</style>

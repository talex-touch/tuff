<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { DiffChipsEmits, DiffChipsProps, ToolChipDiff } from './types'

defineOptions({ name: 'TxDiffChips' })

const props = withDefaults(defineProps<DiffChipsProps>(), {
  moreCount: 0,
  moreLabelFormatter: (count: number) => `+${count} more`,
  staggerStep: 80,
})

const emit = defineEmits<DiffChipsEmits>()

defineSlots<{
  /** Replaces a chip's contents. */
  chip?: (props: { diff: ToolChipDiff }) => any
}>()
</script>

<template>
  <div class="tx-bui-diff-chips" :style="{ '--tx-bui-diff-chips-step': `${props.staggerStep}ms` }">
    <button
      v-for="(diff, index) in diffs"
      :key="diff.file"
      type="button"
      class="tx-bui-diff-chips__chip"
      :style="{ '--tx-bui-diff-chips-index': index }"
      @click="emit('select', diff)"
    >
      <slot name="chip" :diff="diff">
        <span class="tx-bui-diff-chips__file">{{ diff.file }}</span>
        <span class="tx-bui-diff-chips__add">+{{ diff.add }}</span>
        <!-- U+2212 MINUS SIGN, not a hyphen: it aligns with the plus and keeps
             the tabular columns even. -->
        <span v-if="diff.del > 0" class="tx-bui-diff-chips__del">&#8722;{{ diff.del }}</span>
      </slot>
    </button>

    <button
      v-if="moreCount > 0"
      type="button"
      class="tx-bui-diff-chips__more"
      :style="{ '--tx-bui-diff-chips-index': diffs.length }"
      @click="emit('more')"
    >
      {{ moreLabelFormatter(moreCount) }}
    </button>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;
@include bui-keyframes-fade-in;

.tx-bui-diff-chips {
  @include bui-scope;

  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 100%;

  .tx-bui-diff-chips__chip {
    @include bui-pop-in(250ms);

    display: inline-flex;
    gap: 6px;
    align-items: center;
    max-width: 100%;
    height: 28px;
    padding: 0 8px;
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11.5px;
    color: var(--tx-bui-ink, #1f2124);
    cursor: pointer;
    background: var(--tx-bui-surface, #fff);
    border-radius: var(--tx-bui-radius-chip, 6px);
    box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
    transition: background-color 0.1s ease;
    animation-delay: calc(var(--tx-bui-diff-chips-index, 0) * var(--tx-bui-diff-chips-step, 80ms));

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }
  }

  .tx-bui-diff-chips__file {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-diff-chips__add,
  .tx-bui-diff-chips__del {
    @include bui-tabular-nums;

    flex: none;
  }

  .tx-bui-diff-chips__add {
    color: var(--tx-bui-green, #189a4d);
  }

  .tx-bui-diff-chips__del {
    color: var(--tx-bui-red, #e3474c);
  }

  .tx-bui-diff-chips__more {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 6px;
    font-family: var(--tx-bui-font-mono, "JetBrains Mono", ui-monospace, "SF Mono", monospace);
    font-size: 11.5px;
    color: var(--tx-bui-ink-3, #9a9da3);
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 2px;
    cursor: pointer;
    border-radius: var(--tx-bui-radius-chip, 6px);
    transition: color 0.1s ease, text-decoration-color 0.1s ease;
    animation: tx-bui-fade-in 300ms ease-out both;
    animation-delay: calc(var(--tx-bui-diff-chips-index, 0) * var(--tx-bui-diff-chips-step, 80ms));

    &:hover {
      color: var(--tx-bui-ink-2, #62656b);
      text-decoration-color: currentcolor;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-bui-diff-chips__chip,
    .tx-bui-diff-chips__more {
      transition: none;
      animation: none;
    }
  }
}
</style>

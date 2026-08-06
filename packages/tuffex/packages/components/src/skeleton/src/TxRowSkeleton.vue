<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { RowSkeletonProps } from './types.ts'
import { computed } from 'vue'
import { toCssUnit } from './utils'

defineOptions({
  name: 'TxRowSkeleton',
})

const props = withDefaults(defineProps<RowSkeletonProps>(), {
  rows: 1,
  leading: false,
  description: false,
  trailing: false,
  separated: false,
  titleWidth: '38%',
  descWidth: '62%',
})

/**
 * Bars of identical width read as a table rather than as prose, so the title
 * width is nudged per row. The sequence is fixed rather than random: a random
 * one would make every render — and every snapshot — differ.
 */
const TITLE_WIDTH_SCALE = [1, 0.88, 1.06, 0.94]

const rowsArray = computed(() => Array.from({ length: Math.max(1, props.rows) }))

function titleStyle(index: number): CSSProperties {
  const scale = TITLE_WIDTH_SCALE[index % TITLE_WIDTH_SCALE.length] ?? 1
  const base = toCssUnit(props.titleWidth)

  return {
    width: scale === 1 ? base : `calc(${base} * ${scale})`,
  }
}

const descStyle = computed<CSSProperties>(() => ({
  width: toCssUnit(props.descWidth),
}))
</script>

<template>
  <div class="tx-row-skeleton" aria-hidden="true">
    <template v-for="(_, i) in rowsArray" :key="i">
      <div v-if="separated && i > 0" class="tx-row-skeleton__separator" />

      <div class="tx-row-skeleton__row">
        <div v-if="leading" class="tx-row-skeleton__leading" />

        <div class="tx-row-skeleton__text">
          <div class="tx-row-skeleton__title" :style="titleStyle(i)" />
          <div v-if="description" class="tx-row-skeleton__desc" :style="descStyle" />
        </div>

        <div v-if="trailing" class="tx-row-skeleton__trailing" />
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

@include skeleton-keyframes;

.tx-row-skeleton {
  display: flex;
  flex-direction: column;
  width: 100%;

  /*
   * No border or background here on purpose. The consumer's own card supplies
   * the surface, and drawing a second one nests two cards inside each other.
   */
}

.tx-row-skeleton__row {
  display: flex;
  gap: var(--tx-skeleton-row-gap, 16px);
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--tx-skeleton-row-padding-block, 12px) var(--tx-skeleton-row-padding-inline, 16px);
  box-sizing: border-box;
}

/*
 * Unanimated: a moving hairline reads as noise, and the separator is structure
 * rather than a content placeholder.
 */
.tx-row-skeleton__separator {
  height: 1px;
  margin-left: var(--tx-skeleton-row-separator-inset, 16px);
  background: var(--tx-skeleton-row-separator-color, var(--tx-border-color-light, #e5e7eb));
}

.tx-row-skeleton__leading {
  flex-shrink: 0;
  width: var(--tx-skeleton-row-leading-size, 20px);
  height: var(--tx-skeleton-row-leading-size, 20px);
  border-radius: var(--tx-skeleton-row-leading-radius, 6px);

  @include skeleton-surface;
}

.tx-row-skeleton__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--tx-skeleton-row-text-gap, 3px);
  min-width: 0;
}

/*
 * Each bar sits inside the line box its real text would occupy, so the row keeps
 * the same height before and after the content lands.
 */
.tx-row-skeleton__title,
.tx-row-skeleton__desc {
  display: flex;
  align-items: center;

  &::before {
    content: "";
    display: block;
    width: 100%;
    border-radius: var(--tx-skeleton-row-bar-radius, 4px);

    @include skeleton-surface;
  }
}

.tx-row-skeleton__title {
  height: var(--tx-skeleton-row-title-line, 16px);

  &::before {
    height: var(--tx-skeleton-row-title-bar, 10px);
  }
}

.tx-row-skeleton__desc {
  height: var(--tx-skeleton-row-desc-line, 18px);

  &::before {
    height: var(--tx-skeleton-row-desc-bar, 8px);
  }
}

.tx-row-skeleton__trailing {
  flex-shrink: 0;
  width: var(--tx-skeleton-row-trailing-width, 36px);
  height: var(--tx-skeleton-row-trailing-height, 20px);
  border-radius: var(--tx-skeleton-row-trailing-radius, 10px);

  @include skeleton-surface;
}
</style>

<script setup lang="ts">
defineOptions({
  name: 'TxLayoutSkeleton',
})

const sidebarLineWidths = ['64%', '48%', '72%', '56%', '68%', '44%']
const contentLineWidths = ['72%', '58%', '84%', '46%', '67%', '76%', '52%', '63%']
</script>

<template>
  <div class="tx-layout-skeleton" aria-hidden="true">
    <div class="tx-layout-skeleton__container">
      <div class="tx-layout-skeleton__header">
        <div class="tx-layout-skeleton__circle tx-layout-skeleton__brand" />
        <div class="tx-layout-skeleton__line tx-layout-skeleton__header-line" />
        <div class="tx-layout-skeleton__header-actions">
          <div class="tx-layout-skeleton__line tx-layout-skeleton__pill" />
          <div class="tx-layout-skeleton__line tx-layout-skeleton__pill" />
          <div class="tx-layout-skeleton__circle tx-layout-skeleton__avatar" />
        </div>
      </div>

      <div class="tx-layout-skeleton__main">
        <div class="tx-layout-skeleton__sidebar">
          <div
            v-for="(width, i) in sidebarLineWidths"
            :key="i"
            class="tx-layout-skeleton__sidebar-item"
            :class="{ 'tx-layout-skeleton__sidebar-item--current': i === 0 }"
          >
            <div class="tx-layout-skeleton__circle" />
            <div class="tx-layout-skeleton__line tx-layout-skeleton__sidebar-text" :style="{ width }" />
          </div>
        </div>

        <div class="tx-layout-skeleton__content">
          <div v-for="(width, i) in contentLineWidths" :key="i" class="tx-layout-skeleton__content-line">
            <div class="tx-layout-skeleton__line" :style="{ width }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

@include skeleton-keyframes;

.tx-layout-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #eee);
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 65%, transparent);
}

.tx-layout-skeleton__container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/*
 * The shared placeholder shapes come first so every sized bar below overrides
 * them. Declared last, as they used to be, `.tx-layout-skeleton__line`'s
 * `height: 100%` tied with the sized rules on specificity and won on order: the
 * header bar filled the whole header and ran into the frame, and the sidebar
 * labels came out as tall as the avatars beside them.
 */
.tx-layout-skeleton__line {
  height: 8px;
  border-radius: 999px;

  @include skeleton-surface;
}

.tx-layout-skeleton__circle {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 999px;

  @include skeleton-surface;
}

.tx-layout-skeleton__header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #eee);
}

.tx-layout-skeleton__brand {
  width: 16px;
  height: 16px;
  border-radius: 5px;
}

.tx-layout-skeleton__header-line {
  width: clamp(48px, 28%, 160px);
  height: 10px;
}

.tx-layout-skeleton__header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.tx-layout-skeleton__pill {
  width: 28px;
}

.tx-layout-skeleton__avatar {
  width: 18px;
  height: 18px;
}

.tx-layout-skeleton__main {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* A proportional rail: at a fixed 200px it took two thirds of a narrow frame
   and squeezed the content into a strip on the far side. A hairline separates
   it instead of a darker block, which read as a hole in dark mode. */
.tx-layout-skeleton__sidebar {
  flex: 0 0 clamp(72px, 30%, 200px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  overflow: hidden;
  border-right: 1px solid var(--tx-border-color-lighter, #eee);
}

.tx-layout-skeleton__sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
}

.tx-layout-skeleton__sidebar-item--current {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tx-layout-skeleton__sidebar-text {
  flex: 0 1 auto;
  min-width: 0;
}

.tx-layout-skeleton__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  overflow: hidden;
}

.tx-layout-skeleton__content-line {
  flex: none;
  height: 8px;
}

.tx-layout-skeleton__content-line .tx-layout-skeleton__line {
  height: 100%;
}

/* The first line is the page title; the fifth opens a second paragraph. */
.tx-layout-skeleton__content-line:first-child {
  height: 12px;
  margin-bottom: 4px;
}

.tx-layout-skeleton__content-line:nth-child(5) {
  margin-top: 8px;
}

/*
 * No hand-written reduced-motion block here: `skeleton-surface` emits one per include, so every
 * animated placeholder is already covered. The motion-contract test counts guards against
 * animations exactly, and a duplicate reads as an uncovered third animation.
 */
</style>

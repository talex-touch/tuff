<script setup lang="ts">
/**
 * The frame every design-concepts figure sits in: a stage, then its controls, readouts
 * and a caption, so the handbook's figures read as one set.
 *
 * Its styles are deliberately unscoped and `cfig`-prefixed: the figures use the same
 * classes inside their own markup (`cfig-split`, `cfig-panel`, `cfig-stat`,
 * `cfig-control`, `cfig-legend`), including around TuffEx controls, which scoped
 * `:slotted()` rules would not reach. `not-prose` keeps the docs' markdown styles out:
 * their `figure` margins and display would otherwise outrank `.cfig`.
 */
withDefaults(defineProps<{
  caption?: string
  /** `grid` draws drafting-paper lines behind the stage, `plain` a flat panel, `none` no box at all. */
  stage?: 'grid' | 'plain' | 'none'
  /** Minimum stage height in px. */
  stageHeight?: number
}>(), {
  caption: '',
  stage: 'grid',
  stageHeight: 0,
})
</script>

<template>
  <figure class="cfig not-prose">
    <div
      class="cfig__stage"
      :class="`is-${stage}`"
      :style="stageHeight ? { minHeight: `${stageHeight}px` } : undefined"
    >
      <slot />
    </div>
    <div v-if="$slots.controls" class="cfig__controls">
      <slot name="controls" />
    </div>
    <div v-if="$slots.readout" class="cfig__readout">
      <slot name="readout" />
    </div>
    <figcaption v-if="caption || $slots.caption" class="cfig__caption">
      <slot name="caption">
        {{ caption }}
      </slot>
    </figcaption>
  </figure>
</template>

<style>
.cfig {
  --cfig-ink: var(--tx-text-color-primary, #303133);
  --cfig-muted: var(--tx-text-color-secondary, #909399);
  --cfig-line: var(--tx-border-color-lighter, #ebeef5);
  --cfig-line-strong: var(--tx-border-color, #dcdfe6);
  --cfig-panel: var(--tx-fill-color-lighter, #fafafa);
  --cfig-accent: var(--tx-color-primary, #409eff);
  --cfig-pass: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
  --cfig-fail: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
  --cfig-mono: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace);

  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  margin: 0;
  color: var(--cfig-ink);
  font-size: 13px;
  line-height: 1.5;
}

.cfig__stage {
  position: relative;
  min-width: 0;
}

.cfig__stage.is-grid,
.cfig__stage.is-plain {
  overflow: hidden;
  border: 1px solid var(--cfig-line);
  border-radius: 14px;
  background-color: var(--cfig-panel);
}

.cfig__stage.is-grid {
  background-image:
    linear-gradient(color-mix(in srgb, var(--cfig-ink) 5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--cfig-ink) 5%, transparent) 1px, transparent 1px);
  background-size: 16px 16px;
  background-position: -1px -1px;
}

.cfig__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
}

.cfig__readout {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cfig__caption {
  color: var(--cfig-muted);
  font-size: 12px;
  text-wrap: pretty;
}

/* A labelled control; the label sits on its own line when the row is narrow. */
.cfig-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-width: 0;
}

.cfig-control__label {
  color: var(--cfig-muted);
  font-size: 12px;
  white-space: nowrap;
}

.cfig-control__value {
  min-width: 3.5em;
  color: var(--cfig-ink);
  font-family: var(--cfig-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.cfig-control .tx-slider {
  flex: 1 1 160px;
  min-width: 140px;
}

/* A measured value: a label over a monospaced number. */
.cfig-stat {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  min-width: 92px;
  padding: 6px 10px;
  border: 1px solid var(--cfig-line);
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
}

.cfig-stat__label {
  color: var(--cfig-muted);
  font-size: 11px;
}

.cfig-stat__value {
  font-family: var(--cfig-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.cfig-stat.is-accent .cfig-stat__value {
  color: var(--cfig-accent);
}

.cfig-stat.is-pass .cfig-stat__value {
  color: var(--cfig-pass);
}

.cfig-stat.is-fail .cfig-stat__value {
  color: var(--cfig-fail);
}

/* Side-by-side comparison panels; they stack when the column is narrow. */
.cfig-split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}

.cfig-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--cfig-line);
  border-radius: 12px;
  background: var(--tx-bg-color, #fff);
}

.cfig-panel__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}

.cfig-panel__note {
  color: var(--cfig-muted);
  font-size: 12px;
  text-wrap: pretty;
}

.cfig-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cfig-ink) 7%, transparent);
  color: var(--cfig-muted);
  font-size: 11px;
  font-weight: 500;
}

.cfig-badge.is-pass {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 14%, transparent);
  color: var(--cfig-pass);
}

.cfig-badge.is-fail {
  background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 14%, transparent);
  color: var(--cfig-fail);
}

.cfig-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  color: var(--cfig-muted);
  font-size: 12px;
}

.cfig-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cfig-legend__swatch {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  background: var(--swatch, currentColor);
}

.cfig-mono {
  font-family: var(--cfig-mono);
  font-variant-numeric: tabular-nums;
}
</style>

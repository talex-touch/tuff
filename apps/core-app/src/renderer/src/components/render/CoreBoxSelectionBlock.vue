<script setup lang="ts">
/**
 * The CoreBox list's selection block: the selected row's background and accent bar, drawn once and
 * moved between rows by useSelectionBlock. It is the list's last child and sits under the rows (the
 * list isolates a stacking context for it), and it shows only while the list carries
 * `data-selection-block`. It is a FLIP participant, so a list re-rank carries it with its row.
 */
defineOptions({ name: 'CoreBoxSelectionBlock' })
</script>

<template>
  <div
    class="CoreBox-SelectionBlock"
    data-flip-key="corebox-selection-block"
    data-flip="move"
    aria-hidden="true"
  >
    <span class="CoreBox-SelectionBlock__accent" />
  </div>
</template>

<style scoped lang="scss">
// Position and size are written by useSelectionBlock: `translate` for where it rests, `transform`
// for the motion on top of it, `width` / `height` for the row it covers. Nothing here transitions.
.CoreBox-SelectionBlock {
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: var(--corebox-result-radius, 16px);
  background-color: var(--tx-bg-color);
  pointer-events: none;
  visibility: hidden;
  will-change: transform;
}

[data-selection-block] > .CoreBox-SelectionBlock {
  visibility: visible;
}

// BoxItem's own accent bar, which the block replaces while it shows: the same box, clipped by the
// same radius.
.CoreBox-SelectionBlock__accent {
  position: absolute;
  top: 25%;
  left: 0;
  width: 0.25rem;
  height: 50%;
  border-radius: 1.5rem;
  background-color: var(--tx-color-primary);
  box-shadow: 0 0 2px 0 var(--tx-color-primary);
}
</style>

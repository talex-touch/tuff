<script lang="ts" setup>
import { TxCardSkeleton } from '@talex-touch/tuffex/skeleton'

defineOptions({
  name: 'CapabilitySkeleton'
})
</script>

<template>
  <!--
    Kept as a named component so capability lists read for themselves, but the
    shape now comes from the shared preset instead of a second copy of it.
  -->
  <TxCardSkeleton class="CapabilitySkeleton" />
</template>

<style lang="scss" scoped>
/*
 * The preset is a standalone card and spaces itself accordingly; here it sits in
 * a flex column that already supplies the gap, so its own bottom margin stacked
 * on top of it and made the placeholder list taller than the real one. Height is
 * pinned to `.capability-card`'s 4.5rem for the same reason.
 */
.CapabilitySkeleton {
  height: 4.5rem;
  margin-bottom: 0;
}
</style>

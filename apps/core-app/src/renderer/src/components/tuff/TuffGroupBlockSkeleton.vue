<script lang="ts" name="TuffGroupBlockSkeleton" setup>
import { TxRowSkeleton, TxSkeleton } from '@talex-touch/tuffex/skeleton'

/** One block's worth of placeholder, mirroring what `TuffGroupBlock` draws. */
export interface TuffGroupBlockSkeletonGroup {
  /** Rows the block renders once loaded. */
  rows: number
  /** The rows carry a description line under the title. */
  description?: boolean
  /** The rows carry a trailing control. */
  trailing?: boolean
  /** The rows carry a leading icon. */
  leading?: boolean
}

withDefaults(
  defineProps<{
    groups: TuffGroupBlockSkeletonGroup[]
    /**
     * Header description line. Most blocks pass one, so it is drawn by default;
     * a block whose header is title-only would otherwise gain a line on load.
     */
    headerDescription?: boolean
  }>(),
  { headerDescription: true }
)
</script>

<template>
  <!--
    The chrome is copied from `TuffGroupBlock` rather than reused through it,
    because that component owns collapse state, GSAP height tweens and a
    persisted expand preference — none of which a placeholder should touch. The
    numbers below therefore track it by hand: the 56px header, the hairline
    borders and the 22px icon are all read off its own stylesheet.

    Every animated bar comes from TuffEx primitives, so the shimmer, its timing
    and the reduced-motion guard stay in one place instead of being redeclared
    here.
  -->
  <div class="TGroupBlockSkeleton" aria-hidden="true">
    <div v-for="(group, index) in groups" :key="index" class="TGroupBlockSkeleton-Container">
      <div class="TGroupBlockSkeleton-Header fake-background index-fix">
        <div class="TGroupBlockSkeleton-Icon">
          <TxSkeleton variant="rect" :width="22" :height="22" :radius="6" />
        </div>
        <div class="TGroupBlockSkeleton-Label">
          <TxSkeleton :width="128" :height="14" :radius="4" />
          <TxSkeleton v-if="headerDescription" :width="196" :height="11" :radius="4" />
        </div>
      </div>

      <div class="TGroupBlockSkeleton-Main">
        <TxRowSkeleton
          :rows="group.rows"
          :leading="group.leading"
          :description="group.description"
          :trailing="group.trailing"
          separated
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TGroupBlockSkeleton {
  width: 100%;
}

.TGroupBlockSkeleton-Container {
  position: relative;
  margin-bottom: 0.7rem;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter);
}

.TGroupBlockSkeleton-Header {
  display: flex;
  align-items: center;
  width: 100%;
  height: 56px;
  padding: 4px 22px 4px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  --fake-color: var(--tx-fill-color-dark);
  --fake-inner-opacity: 0.5;
  --fake-radius: 12px 12px 0 0;
}

/* The 12px gutter is the header's own `> * { margin-right: 12px }`. */
.TGroupBlockSkeleton-Icon {
  flex-shrink: 0;
  margin-right: 12px;
  line-height: 0;
}

.TGroupBlockSkeleton-Label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.TGroupBlockSkeleton-Main {
  padding: 0;
}
</style>

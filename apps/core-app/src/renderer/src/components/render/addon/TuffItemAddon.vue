<script lang="ts" name="TuffItemAddon" setup>
import type { TuffItem } from '@talex-touch/utils'

defineProps<{
  type?: 'preview'
  item?: TuffItem
  searchQuery?: string
}>()
</script>

<template>
  <div class="TuffItemAddon" :class="{ show: !!type }">
    <template v-if="type === 'preview'">
      <TuffItemPreviewer :item="item!" :search-query="searchQuery" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
// The width switches in one layout pass and the pane slides in on the compositor. Transitioning
// the width re-laid out the results column and repainted the preview image on every frame, and
// the collapse stuttered for it.
.TuffItemAddon {
  z-index: 1;
  position: relative;

  top: 0;
  right: 0;

  width: 0;
  height: 100%;

  overflow: hidden;
  border-left: 1px solid var(--tx-border-color);

  &.show {
    width: 60%;
    animation: addon-slide-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
}

@keyframes addon-slide-in {
  from {
    opacity: 0;
    transform: translateX(16px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}
</style>

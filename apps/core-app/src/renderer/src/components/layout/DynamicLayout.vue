<template>
  <div class="DynamicLayout-Wrapper">
    <LayoutSkeleton v-if="isLoading" />

    <transition name="layout-fade" mode="out-in">
      <component
        :is="layoutComponent"
        v-if="layoutComponent && !isLoading"
        :key="`layout-${currentLayoutName}`"
      >
        <template #view>
          <slot name="view" />
        </template>
        <template #title>
          <slot name="title" />
        </template>
        <template #icon>
          <slot name="icon" />
        </template>
      </component>
    </transition>
  </div>
</template>

<script lang="ts" setup>
import { useDynamicTuffLayout } from '~/modules/layout'
import LayoutSkeleton from '@comp/layout/LayoutSkeleton.vue'

const { layoutComponent, isLoading, currentLayoutName } = useDynamicTuffLayout()
</script>

<style lang="scss" scoped>
.DynamicLayout-Wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.layout-fade-enter-active,
.layout-fade-leave-active {
  transition: opacity 0.3s ease;
}

.layout-fade-enter-from,
.layout-fade-leave-to {
  opacity: 0;
}

.layout-fade-enter-to,
.layout-fade-leave-from {
  opacity: 1;
}
</style>

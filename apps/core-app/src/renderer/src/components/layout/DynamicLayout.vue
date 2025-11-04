<template>
  <div class="DynamicLayout-Wrapper">
    <LayoutSkeleton v-if="showSkeleton" />

    <transition name="layout-fade" mode="out-in">
      <component
        :is="layoutComponent"
        v-if="layoutComponent && !showSkeleton"
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
import { watch, ref } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'
import { useDynamicTuffLayout } from '~/modules/layout'
import LayoutSkeleton from '@comp/layout/LayoutSkeleton.vue'

const { layoutComponent, isLoading, currentLayoutName } = useDynamicTuffLayout()

// Control skeleton display
const showSkeleton = ref(false)

// Watch for layout changes and show skeleton with delay
watch(
  () => currentLayoutName.value,
  async (newLayout, oldLayout) => {
    console.log('[DynamicLayout] Layout name changed:', {
      oldLayout,
      newLayout,
      changed: oldLayout !== newLayout
    })

    if (oldLayout && newLayout && oldLayout !== newLayout) {
      // Layout changed - show skeleton first
      console.log('[DynamicLayout] Showing skeleton, will load new layout in 500ms')
      showSkeleton.value = true

      // Wait 500ms
      await sleep(500)

      console.log('[DynamicLayout] Delay completed, loading new layout')
      showSkeleton.value = isLoading.value
    }
  },
  { immediate: false }
)

// Watch for layoutComponent changes
watch(
  () => layoutComponent.value,
  (newComponent) => {
    console.log('[DynamicLayout] layoutComponent changed:', {
      hasComponent: !!newComponent
    })
  },
  { immediate: true }
)

// Watch for isLoading changes
watch(
  () => isLoading.value,
  (loading) => {
    console.log('[DynamicLayout] Loading state changed:', loading)

    if (loading) {
      showSkeleton.value = true
    } else if (!loading && layoutComponent.value) {
      // Component ready and not loading
      showSkeleton.value = false
    }
  }
)
</script>

<style lang="scss" scoped>
.DynamicLayout-Wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Fade transition for layout switching */
.layout-fade-enter-active,
.layout-fade-leave-active {
  transition: opacity 0.3s ease;
}

.layout-fade-enter-from {
  opacity: 0;
}

.layout-fade-leave-to {
  opacity: 0;
}

.layout-fade-enter-to,
.layout-fade-leave-from {
  opacity: 1;
}
</style>

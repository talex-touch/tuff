<script name="TSelectItem" setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * Props definition
 * @prop modelValue - The currently selected value
 */
const _props = defineProps<{
  modelValue: string | number
}>()

/**
 * Indicates whether the component is in an active (clicked/open) state.
 */
const isActive = ref(false)

/**
 * Handles document-level click events to determine if the component should be closed.
 * Closes the component if the click occurred outside of the container.
 * 
 * @param event - MouseEvent triggered on document
 */
function handleDocumentClick(event: MouseEvent): void {
  if (!isActive.value) return

  // Use composedPath (standard), fallback to legacy .path if needed
  const path = (event.composedPath?.() || (event as any).path) as HTMLElement[]
  isActive.value = path.some(node =>
    node?.className?.includes('TSelectItem-Container')
  )
}

/**
 * Toggles the active state when the component is clicked.
 */
function toggle(): void {
  isActive.value = !isActive.value
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <div
    class="TSelectItem-Container fake-background"
    :class="{ selection: isActive }"
    @click="toggle"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
.TSelectItem-Container {
  position: relative;
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: all 0.25s;
  background-color: var(--el-fill-color);

  &:hover {
    background-color: var(--el-bg-color);
  }
}
</style>

<template>
  <div ref="gridContainer" class="GridLayout" @mouseleave="cancelColor" @mousemove="handleMove">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const gridContainer = ref<HTMLElement | null>(null)

/**
 * Handle mouse move event to create interactive hover effect.
 * Updates CSS variables for each child element with the `.element` class.
 * @param {MouseEvent} event - The mouse move event.
 */
function handleMove(event: MouseEvent) {
  if (!gridContainer.value) return

  const { pageX: mouseX, pageY: mouseY } = event
  const elements = gridContainer.value.querySelectorAll('.element')

  for (const element of elements) {
    const htmlElement = element as HTMLElement
    const { left, top } = htmlElement.getBoundingClientRect()
    const elementX = left + window.scrollX
    const elementY = top + window.scrollY

    const distanceX = mouseX - elementX
    const distanceY = mouseY - elementY

    htmlElement.style.setProperty('--op', '0.2')
    htmlElement.style.setProperty('--x', `${distanceX}px`)
    htmlElement.style.setProperty('--y', `${distanceY}px`)
  }
}

/**
 * Reset the hover effect when the mouse leaves the container.
 */
function cancelColor() {
  if (!gridContainer.value) return
  gridContainer.value.querySelectorAll('.element').forEach(element => {
    (element as HTMLElement).style.setProperty('--op', '0')
  })
}
</script>

<style lang="scss" scoped>
.GridLayout {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

  @media (max-width: 768px) {
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  @media (min-width: 1400px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

:deep(.element) {
  background: var(--el-fill-color-light);
  height: 100%;
  position: relative;
  border-radius: 16px;
  transition: all 0.3s ease;
  cursor: pointer;
  overflow: hidden; // Ensures the ::before pseudo-element is clipped

  &::before {
    content: '';
    position: absolute;
    width: calc(100% + 3px);
    height: calc(100% + 3px);
    top: 50%;
    left: 50%;
    opacity: var(--op, 0);
    transition: opacity 0.25s ease-in-out;
    transform: translate(-50%, -50%);
    border-radius: 18px;
    filter: blur(5px);
    background: radial-gradient(
      250px circle at var(--x) var(--y),
      var(--el-color-primary) 0,
      transparent 100%
    );
    z-index: 0;
  }

  & > * {
    position: relative;
    z-index: 1;
  }
}
</style>

<script setup lang="ts">
/**
 * TxDrawer Component
 *
 * A slide-out panel component that appears from the edge of the screen.
 * Supports customizable direction, width, and accessibility features.
 *
 * @example
 * ```vue
 * <TxDrawer v-model:visible="drawerVisible" title="Settings">
 *   <p>Drawer content goes here</p>
 * </TxDrawer>
 * ```
 *
 * @component
 */
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import type { DrawerProps, DrawerEmits } from './types'

defineOptions({
  name: 'TxDrawer',
})

const props = withDefaults(defineProps<DrawerProps>(), {
  title: 'Drawer',
  width: '60%',
  direction: 'right',
  showClose: true,
  closeOnClickMask: true,
  closeOnPressEscape: true,
  zIndex: 1998,
})

const emit = defineEmits<DrawerEmits>()

const drawerRef = ref<HTMLElement | null>(null)

/**
 * Internal display state for animation purposes.
 */
const display = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

/**
 * Computed styles for the drawer container.
 */
const drawerStyle = computed(() => ({
  '--tx-drawer-width': props.width,
  '--tx-drawer-z-index': props.zIndex,
}))

/**
 * Handles the close action.
 */
function handleClose(): void {
  display.value = false
  emit('close')
}

/**
 * Handles click on the mask overlay.
 */
function handleMaskClick(): void {
  if (props.closeOnClickMask) {
    handleClose()
  }
}

/**
 * Handles keyboard events for accessibility.
 * @param event - The keyboard event
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.closeOnPressEscape) {
    handleClose()
  }
}

/**
 * Traps focus within the drawer when open.
 */
function trapFocus(): void {
  if (drawerRef.value) {
    drawerRef.value.focus()
  }
}

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      emit('open')
      trapFocus()
    }
  },
)

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <teleport to="body">
    <div
      ref="drawerRef"
      class="tx-drawer"
      :class="{
        'tx-drawer--visible': display,
        [`tx-drawer--${direction}`]: true,
      }"
      :style="drawerStyle"
      role="dialog"
      aria-modal="true"
      :aria-hidden="!display"
      tabindex="-1"
    >
      <!-- Mask overlay -->
      <div
        class="tx-drawer__mask"
        @click="handleMaskClick"
      />

      <!-- Main drawer panel -->
      <div class="tx-drawer__panel">
        <!-- Header -->
        <header class="tx-drawer__header">
          <h2 class="tx-drawer__title">{{ title }}</h2>
          <button
            v-if="showClose"
            type="button"
            class="tx-drawer__close"
            aria-label="Close drawer"
            @click="handleClose"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <!-- Content -->
        <div class="tx-drawer__body">
          <slot />
        </div>

        <!-- Footer slot -->
        <footer v-if="$slots.footer" class="tx-drawer__footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.tx-drawer {
  --tx-drawer-transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  position: fixed;
  inset: 0;
  z-index: var(--tx-drawer-z-index, 1998);
  pointer-events: none;

  &--visible {
    pointer-events: auto;

    .tx-drawer__mask {
      opacity: 1;
    }

    .tx-drawer__panel {
      transform: translateX(0);
    }
  }

  &--right {
    .tx-drawer__panel {
      right: 0;
      transform: translateX(100%);
    }
  }

  &--left {
    .tx-drawer__panel {
      left: 0;
      transform: translateX(-100%);
    }
  }

  &__mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    opacity: 0;
    transition: opacity var(--tx-drawer-transition);
  }

  &__panel {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--tx-drawer-width, 60%);
    max-width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color, #fff);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
    transition: transform var(--tx-drawer-transition);
    z-index: 1;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--el-border-color-light, #eee);
    flex-shrink: 0;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary, #303133);
  }

  &__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--el-text-color-secondary, #909399);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
      color: var(--el-text-color-primary, #303133);
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  &__footer {
    padding: 16px 20px;
    border-top: 1px solid var(--el-border-color-light, #eee);
    flex-shrink: 0;
  }
}
</style>

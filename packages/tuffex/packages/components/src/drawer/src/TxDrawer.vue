<script setup lang="ts">
import type { CSSProperties, Slots } from 'vue'
import type { DrawerDirection, DrawerEmits, DrawerProps } from './types'
import { computed, nextTick, onMounted, onUnmounted, ref, useId, useSlots, watch } from 'vue'
import TxDivider from '../../divider/src/TxDivider.vue'
import { getZIndex, nextZIndex, refreshZIndex } from '../../../../utils/z-index-manager'

const MOBILE_BREAKPOINT = 768

/**
 * TxDrawer Component
 *
 * A slide-out panel component that appears from the edge of the screen.
 * Supports four directions, responsive bottom sheets, custom slots, and mask effects.
 */
defineOptions({
  name: 'TxDrawer',
})

const props = withDefaults(defineProps<DrawerProps>(), {
  title: 'Drawer',
  direction: 'right',
  showHeader: true,
  showFooter: true,
  showClose: true,
  closeOnClickMask: true,
  closeOnPressEscape: true,
  maskEffect: 'blur',
  panelTransparent: false,
  mobileAdapt: true,
  full: false,
})

const emit = defineEmits<DrawerEmits>()
const slots: Slots = useSlots()

const drawerRef = ref<HTMLElement | null>(null)
const internalZIndex = ref(getZIndex())
const titleId = useId()
const isMobile = ref(false)
let previouslyFocusedElement: HTMLElement | null = null

const display = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const effectiveDirection = computed<DrawerDirection>(() => {
  if (props.mobileAdapt && isMobile.value) {
    return 'bottom'
  }
  return props.direction
})

const resolvedSize = computed(() => normalizeDrawerSize(props.full ? 'full' : props.size ?? props.width))
const isHorizontalDirection = computed(() => effectiveDirection.value === 'left' || effectiveDirection.value === 'right')

const shouldRenderHeader = computed<boolean>(() => props.showHeader && (Boolean(slots.header) || Boolean(props.title) || props.showClose))
const shouldRenderFooter = computed<boolean>(() => props.showFooter && Boolean(slots.footer))
const drawerAriaLabelledBy = computed<string | undefined>(() => shouldRenderHeader.value ? titleId : undefined)
const drawerAriaLabel = computed<string | undefined>(() => shouldRenderHeader.value ? undefined : props.title || undefined)

const drawerStyle = computed<CSSProperties>(() => ({
  '--tx-drawer-size': resolvedSize.value,
  '--tx-drawer-width': isHorizontalDirection.value ? resolvedSize.value : '100%',
  '--tx-drawer-height': isHorizontalDirection.value ? '100%' : resolvedSize.value,
  '--tx-drawer-z-index': props.zIndex ?? internalZIndex.value,
}))

function normalizeDrawerSize(size: DrawerProps['size'] | DrawerProps['width']): string {
  if (typeof size === 'number') {
    return `${size}px`
  }

  const normalized = `${size ?? '60%'}`.trim()
  if (!normalized) {
    return '60%'
  }

  return normalized.toLowerCase() === 'full' ? '100%' : normalized
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT
}

function updateMobileState(): void {
  isMobile.value = isMobileViewport()
}

function handleClose(): void {
  display.value = false
  emit('close')
}

function handleMaskClick(): void {
  if (props.closeOnClickMask) {
    handleClose()
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (!display.value) {
    return
  }
  if (event.key === 'Escape' && props.closeOnPressEscape) {
    handleClose()
  }
}

function focusDrawer(): void {
  drawerRef.value?.focus()
}

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      if (props.zIndex != null) {
        refreshZIndex(props.zIndex, 'drawer(zIndex prop)')
      }
      internalZIndex.value = props.zIndex ?? nextZIndex()
      previouslyFocusedElement = typeof document !== 'undefined' ? document.activeElement as HTMLElement : null
      emit('open')
      nextTick(() => {
        focusDrawer()
      })
    }
    else if (previouslyFocusedElement) {
      previouslyFocusedElement.focus()
      previouslyFocusedElement = null
    }
  },
  { immediate: true },
)

onMounted(() => {
  updateMobileState()
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateMobileState)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateMobileState)
  previouslyFocusedElement?.focus()
})
</script>

<template>
  <teleport to="body">
    <div
      ref="drawerRef"
      class="tx-drawer"
      :class="[
        `tx-drawer--${effectiveDirection}`,
        `tx-drawer--mask-${maskEffect}`,
        {
          'tx-drawer--visible': display,
          'tx-drawer--panel-transparent': panelTransparent,
          'tx-drawer--mobile': mobileAdapt && isMobile,
        },
      ]"
      :style="drawerStyle"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="drawerAriaLabelledBy"
      :aria-label="drawerAriaLabel"
      :aria-hidden="!display"
      tabindex="-1"
    >
      <div
        class="tx-drawer__mask"
        aria-hidden="true"
        @click="handleMaskClick"
      />

      <div class="tx-drawer__panel">
        <header v-if="shouldRenderHeader" class="tx-drawer__header">
          <div v-if="$slots.header" :id="titleId" class="tx-drawer__header-content">
            <slot name="header" :close="handleClose" :title="title" :title-id="titleId" />
          </div>
          <template v-else>
            <h2 :id="titleId" class="tx-drawer__title">
              {{ title }}
            </h2>
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
          </template>
        </header>

        <TxDivider v-if="shouldRenderHeader" class="tx-drawer__divider" />

        <div class="tx-drawer__body">
          <slot />
        </div>

        <TxDivider v-if="shouldRenderFooter" class="tx-drawer__divider" />

        <footer v-if="shouldRenderFooter" class="tx-drawer__footer">
          <slot name="footer" :close="handleClose" />
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.tx-drawer {
  --tx-drawer-transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  --tx-drawer-mask-background: rgba(0, 0, 0, 0.45);
  --tx-drawer-panel-background: var(--tx-bg-color-overlay, var(--tx-bg-color, #fff));
  --tx-drawer-panel-background-transparent: color-mix(in srgb, var(--tx-drawer-panel-background) 78%, transparent);

  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100vw;
  max-width: 100vw;
  z-index: var(--tx-drawer-z-index, 1998);
  pointer-events: none;

  &--visible {
    pointer-events: auto;

    .tx-drawer__mask {
      opacity: 1;
    }
  }

  &--visible#{&}--right,
  &--visible#{&}--left,
  &--visible#{&}--top,
  &--visible#{&}--bottom {
    .tx-drawer__panel {
      transform: translate3d(0, 0, 0);
    }
  }

  &--right {
    .tx-drawer__panel {
      top: 0;
      right: 0;
      bottom: 0;
      transform: translate3d(100%, 0, 0);
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--left {
    .tx-drawer__panel {
      top: 0;
      bottom: 0;
      left: 0;
      transform: translate3d(-100%, 0, 0);
      box-shadow: 8px 0 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--top {
    .tx-drawer__panel {
      top: 0;
      right: 0;
      left: 0;
      transform: translate3d(0, -100%, 0);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--bottom {
    .tx-drawer__panel {
      right: 0;
      bottom: 0;
      left: 0;
      transform: translate3d(0, 100%, 0);
      box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--mask-opacity,
  &--mask-transparent {
    .tx-drawer__mask {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  &--mask-transparent {
    .tx-drawer__mask {
      background: transparent;
    }
  }

  &--panel-transparent {
    .tx-drawer__panel {
      background: var(--tx-drawer-panel-background-transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
  }

  &__mask {
    position: absolute;
    inset: 0;
    background: var(--tx-drawer-mask-background);
    opacity: 0;
    transition: opacity var(--tx-drawer-transition);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  &__panel {
    position: absolute;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: var(--tx-drawer-width, 60%);
    height: var(--tx-drawer-height, 100%);
    max-width: 100vw;
    max-height: 100vh;
    background: var(--tx-drawer-panel-background);
    transition: transform var(--tx-drawer-transition);
  }

  &__header,
  &__footer {
    flex-shrink: 0;
    padding: 16px 20px;
  }

  &__header {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  &__header-content {
    flex: 1;
    min-width: 0;
  }

  &__title {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--tx-text-color-primary, #303133);
    font-size: 18px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--tx-text-color-secondary, #909399);
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      color: var(--tx-text-color-primary, #303133);
      background: var(--tx-fill-color-light, #f5f7fa);
    }
  }

  &__divider.tx-divider {
    --tx-divider-color: var(--tx-border-color-light, #eee);
    --tx-divider-gap: 0;

    flex-shrink: 0;
    margin: 0;
  }

  &__divider.tx-divider--horizontal::before,
  &__divider.tx-divider--horizontal::after {
    min-width: 0;
  }

  &__body {
    flex: 1;
    min-height: 0;
    padding: 20px;
    overflow: auto;
  }
}
</style>

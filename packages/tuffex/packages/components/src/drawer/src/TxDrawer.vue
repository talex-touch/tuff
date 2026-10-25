<script setup lang="ts">
import type { CSSProperties, Slots } from 'vue'
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { DrawerDirection, DrawerEmits, DrawerProps } from './types'
import { computed, nextTick, onMounted, onUnmounted, ref, useId, useSlots, watch } from 'vue'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import TxDivider from '../../divider/src/TxDivider.vue'
import { createFocusReturn, trapTab } from '../../../../utils/focus-trap'
import { useGuardedClose } from '../../../../utils/guarded-close'
import { isTopmostModalDialog, useZIndexAllocator } from '../../../../utils/z-index-manager'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

const MOBILE_BREAKPOINT = 768
const SURFACE_MODES: readonly string[] = ['pure', 'mask', 'blur', 'glass', 'refraction', 'acrylic', 'mica', 'flat', 'plain']
const DRAWER_Z_INDEX_SEED = 10000

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
  closeLabel: 'Close drawer',
  closeOnClickMask: true,
  closeOnPressEscape: true,
  maskEffect: 'blur',
  panelTransparent: false,
  surface: 'pure',
  surfaceColor: '',
  mobileAdapt: true,
  full: false,
  lazy: true,
})

const emit = defineEmits<DrawerEmits>()
const slots: Slots = useSlots()

const drawerRef = ref<HTMLElement | null>(null)
const internalZIndex = ref(zIndexAllocator.get())
const titleId = useId()
const isMobile = ref(false)
const focusReturn = createFocusReturn()
/**
 * Latched on the drawer's first open and never cleared: gating the slot content on `visible`
 * alone would tear the content down mid-close, so content outlives the first open and reopening
 * costs no child `setup`.
 */
const hasEverOpened = ref(props.visible)
const shouldRenderContent = computed(() => !props.lazy || hasEverOpened.value)

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

const surfaceMode = computed<BaseSurfaceMode>(() =>
  SURFACE_MODES.includes(props.surface) ? props.surface : 'pure',
)

const surfaceColor = computed(() => props.surfaceColor || 'var(--tx-drawer-panel-background)')

// pure, the default, paints the colour solid whatever this says. mask keeps a near-opaque fill,
// and the other materials sit over the colour at half strength, so text stays legible and the
// page still shows through to be blurred and refracted. `panelTransparent` thins either.
const surfaceOpacity = computed(() => {
  const fallback = surfaceMode.value === 'mask'
    ? (props.panelTransparent ? 0.78 : 0.96)
    : (props.panelTransparent ? 0.3 : 0.5)
  const value = typeof props.surfaceOpacity === 'number' ? props.surfaceOpacity : fallback
  if (!Number.isFinite(value))
    return fallback
  return Math.max(0, Math.min(1, value))
})

/**
 * Transform transitions of the panel under way. A sliding panel's backdrop filter samples
 * where the panel was a frame ago, so the surface takes its motion fallback until the slide
 * ends. Counted rather than flagged: a slide reversed midway reports the new run and the old
 * one's cancel in either order.
 */
const panelSlides = ref(0)

function trackPanelSlide(event: TransitionEvent): void {
  if (event.propertyName !== 'transform')
    return
  panelSlides.value = event.type === 'transitionrun'
    ? panelSlides.value + 1
    : Math.max(0, panelSlides.value - 1)
}

const resolvedSize = computed(() => normalizeDrawerSize(props.full ? 'full' : props.size ?? props.width))
const isHorizontalDirection = computed(() => effectiveDirection.value === 'left' || effectiveDirection.value === 'right')

const shouldRenderHeader = computed<boolean>(() => shouldRenderContent.value && props.showHeader && (Boolean(slots.header) || Boolean(props.title) || props.showClose))
const shouldRenderFooter = computed<boolean>(() => shouldRenderContent.value && props.showFooter && Boolean(slots.footer))
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

const requestClose = useGuardedClose(() => props.beforeClose, () => display.value, handleClose)

/** The `close` the slots receive: it may be bound straight to `@click`, so the event is ignored. */
function closeFromSlot(): void {
  requestClose('close')
}

function handleMaskClick(): void {
  if (props.closeOnClickMask) {
    requestClose('mask')
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (!display.value || event.defaultPrevented || (event.key !== 'Tab' && event.key !== 'Escape'))
    return
  if (!isTopmostModalDialog(drawerRef.value))
    return
  if (event.key === 'Tab') {
    if (drawerRef.value)
      trapTab(event, drawerRef.value)
    return
  }
  if (event.key === 'Escape' && props.closeOnPressEscape) {
    requestClose('escape')
  }
}

function focusDrawer(): void {
  drawerRef.value?.focus()
}

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      // Before the focus/`nextTick` below, so lazy content exists by the time we look for
      // something focusable inside it.
      hasEverOpened.value = true
      if (props.zIndex != null) {
        zIndexAllocator.refresh(props.zIndex, 'drawer(zIndex prop)')
      }
      else {
        zIndexAllocator.refresh(DRAWER_Z_INDEX_SEED, 'drawer')
      }
      internalZIndex.value = props.zIndex ?? zIndexAllocator.next()
      focusReturn.save()
      emit('open')
      nextTick(() => {
        focusDrawer()
      })
    }
    else {
      focusReturn.restore()
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
  focusReturn.restore()
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
      :inert="!display || undefined"
      tabindex="-1"
    >
      <div
        class="tx-drawer__mask"
        aria-hidden="true"
        @click="handleMaskClick"
      />

      <div
        class="tx-drawer__panel"
        @transitionrun.self="trackPanelSlide"
        @transitionend.self="trackPanelSlide"
        @transitioncancel.self="trackPanelSlide"
      >
        <TxBaseSurface
          v-if="shouldRenderContent"
          class="tx-drawer__surface"
          preset="card"
          fake
          :mode="surfaceMode"
          :color="surfaceColor"
          :opacity="surfaceOpacity"
          :moving="panelSlides > 0"
        />
        <header v-if="shouldRenderHeader" class="tx-drawer__header">
          <div v-if="$slots.header" :id="titleId" class="tx-drawer__header-content">
            <slot name="header" :close="closeFromSlot" :title="title" :title-id="titleId" />
          </div>
          <template v-else>
            <h2 :id="titleId" class="tx-drawer__title">
              {{ title }}
            </h2>
            <button
              v-if="showClose"
              type="button"
              class="tx-drawer__close"
              :aria-label="closeLabel"
              @click="closeFromSlot"
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
          <slot v-if="shouldRenderContent" />
        </div>

        <TxDivider v-if="shouldRenderFooter" class="tx-drawer__divider" />

        <footer v-if="shouldRenderFooter" class="tx-drawer__footer">
          <slot name="footer" :close="closeFromSlot" />
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-drawer {
  --tx-drawer-transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  --tx-drawer-mask-background: rgba(0, 0, 0, 0.45);
  --tx-drawer-panel-background: var(--tx-bg-color-overlay, var(--tx-bg-color, #fff));

  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100vw;
  max-width: 100vw;
  z-index: var(--tx-drawer-z-index, 1998);
  pointer-events: none;

  /**
   * A closed drawer is moved out of the viewport by `transform` only, which does not stop it
   * from being painted: the panel's outward `box-shadow` points back into the viewport, so a
   * closed right-side drawer smears a full-height dark band down the window's right edge (and
   * two stacked drawers double it). The mask's `backdrop-filter` likewise keeps a compositing
   * layer alive for nothing.
   *
   * `visibility` transitions discretely and stays `visible` for the whole duration whenever
   * either endpoint is visible, so the slide-out still animates and only then stops painting.
   */
  visibility: hidden;
  transition: visibility var(--tx-drawer-transition);

  &--visible {
    pointer-events: auto;
    visibility: visible;
    // Opening shows it at once. A transition from `hidden` is still `hidden` at its start, where
    // the drawer is focused, and focusing a hidden element does nothing. `none`, not a zero
    // duration, which would keep a delay a host puts in `--tx-drawer-transition`.
    transition: none;

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
      box-shadow: -8px 4px 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--left {
    .tx-drawer__panel {
      top: 0;
      bottom: 0;
      left: 0;
      transform: translate3d(-100%, 0, 0);
      box-shadow: 8px 4px 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--top {
    .tx-drawer__panel {
      top: 0;
      right: 0;
      left: 0;
      transform: translate3d(0, -100%, 0);
      box-shadow: 4px 8px 32px rgba(0, 0, 0, 0.18);
    }
  }

  &--bottom {
    .tx-drawer__panel {
      right: 0;
      bottom: 0;
      left: 0;
      transform: translate3d(0, 100%, 0);
      box-shadow: 4px -8px 32px rgba(0, 0, 0, 0.18);
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

  &__mask {
    position: absolute;
    inset: 0;
    background: var(--tx-drawer-mask-background);
    opacity: 0;
    transition: opacity var(--tx-drawer-transition);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  // The panel paints no colour of its own: its surface, under the header, body and footer,
  // is the panel's background.
  &__panel {
    position: absolute;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: var(--tx-drawer-width, 60%);
    height: var(--tx-drawer-height, 100%);
    max-width: 100vw;
    max-height: 100vh;
    transition: transform var(--tx-drawer-transition);
  }

  &__surface {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    pointer-events: none;
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
    font-weight: var(--tx-font-weight-semibold, 600);
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

// High contrast: the mask still dims the page and no longer frosts it. The panel's surface
// turns solid on its own.
.tx-drawer {
  @include tx-when-high-contrast {
    .tx-drawer__mask {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
}
</style>

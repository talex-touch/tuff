<script setup lang="ts">
import type { Ref } from 'vue'
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { PreviewMenuItem, PreviewMenuPlacer } from './menu'
import type { ImagePreviewAction } from './types'
import { computed, ref } from 'vue'
import { hasDocument } from '../../../../utils/env'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { ACTION_ICONS, PREVIEW_ICONS } from './icons'
import ImagePreviewIcon from './ImagePreviewIcon.vue'
import ImagePreviewMenu from './ImagePreviewMenu.vue'
import { MENU_MARGIN } from './menu'

// Internal: the toolbar of TxImagePreview, the zoom controls and then the actions. Its buttons
// stay focusable at the ends (aria-disabled): a disabled button that held focus would drop it to
// <body>, outside the dialog. The readout opens a menu of zooms above it (ImagePreviewMenu), laid
// beside the toolbar over the whole preview. Not exported — the preview owns what each button does.
defineOptions({ name: 'TxImagePreviewToolbar' })

const props = defineProps<{
  /** The scale against the picture's own pixels; absent while the picture has no size. */
  scale?: number
  /** The scales the menu offers below the whole picture. */
  presets: number[]
  /** The readout, and each of those scales in the menu. */
  formatter: (scale: number) => string
  /** The menu's accessible name, and the readout's after the readout. */
  label: string
  labelFormatter: (readout: string, label: string) => string
  /** The menu's first item, the whole picture. */
  resetLabel: string
  zoomInLabel: string
  zoomOutLabel: string
  canZoomIn: boolean
  canZoomOut: boolean
  actions: ImagePreviewAction[]
  actionLabel: (action: ImagePreviewAction) => string
  actionDisabled: (action: ImagePreviewAction) => boolean
  /** The controls' surface. */
  material: { mode?: BaseSurfaceMode, color?: string, opacity?: number, blur?: number }
  /** A fade of the preview's own transition. */
  level: (shown: () => boolean, ms: number) => Ref<number>
}>()

const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  /** To one of the menu's scales. */
  zoomTo: [scale: number]
  /** Back to the whole picture. */
  reset: []
  /** Inside the click that chose it; Shift asks for the reverse, a turn back. */
  action: [action: ImagePreviewAction, reverse: boolean]
}>()

const toolbarRef = ref<HTMLElement | null>(null)
const readoutRef = ref<HTMLElement | null>(null)
const menuRef = ref<InstanceType<typeof ImagePreviewMenu> | null>(null)
const menuOpen = ref(false)
const menuLevel = props.level(() => menuOpen.value, 150)

const readout = computed(() => (props.scale === undefined ? '' : props.formatter(props.scale)))
const readoutLabel = computed(() => (readout.value ? props.labelFormatter(readout.value, props.label) : props.label))
/** Nothing to choose while the picture has no size, nor once its whole is as far as it zooms. */
const canZoom = computed(() => props.canZoomIn || props.canZoomOut)

/** The whole picture (`whole`), then each scale past it. */
const zoomItems = computed<PreviewMenuItem[]>(() => {
  const k = props.scale
  const shown = k !== undefined
  return [
    { key: 'whole', label: props.resetLabel, icon: PREVIEW_ICONS.check, checked: shown && !props.canZoomOut },
    ...props.presets.map(preset => ({
      key: String(preset),
      label: props.formatter(preset),
      icon: PREVIEW_ICONS.check,
      checked: shown && props.canZoomOut && Math.abs(k - preset) <= preset * 1e-3,
    })),
  ]
})

/** Focus lands on the zoom shown, as in a list of choices. */
const checkedItem = computed(() => Math.max(0, zoomItems.value.findIndex(item => item.checked)))

/** Above the toolbar, centred on the readout; it grows out of the readout. */
const placeAbove: PreviewMenuPlacer = (size, room) => {
  const box = readoutRef.value?.getBoundingClientRect()
  const toolbar = toolbarRef.value?.getBoundingClientRect()
  const x = box ? box.left + box.width / 2 - room.left : room.width / 2
  const y = (toolbar?.top ?? room.bottom) - room.top
  return { left: x - size.width / 2, top: y - MENU_MARGIN - size.height, x, y }
}

function openMenu(): void {
  if (canZoom.value)
    menuOpen.value = true
}

function closeMenu(): void {
  if (!menuOpen.value)
    return
  menuOpen.value = false
  // Focus leaves with the menu, back onto the readout.
  const active = hasDocument() ? document.activeElement : null
  if (!active || active === document.body || menuRef.value?.holdsFocus())
    readoutRef.value?.focus({ preventScroll: true })
}

function toggleMenu(): void {
  if (menuOpen.value)
    closeMenu()
  else
    openMenu()
}

function choose(key: string): void {
  closeMenu()
  if (key === 'whole')
    emit('reset')
  else
    emit('zoomTo', Number(key))
}
</script>

<template>
  <div ref="toolbarRef" class="tx-image-preview__toolbar tx-image-preview__chrome">
    <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" fake v-bind="material" />
    <div class="tx-image-preview__zoom">
      <button
        type="button"
        class="tx-image-preview__button"
        :aria-label="zoomOutLabel"
        :aria-disabled="!canZoomOut || undefined"
        @click="emit('zoomOut')"
      >
        <ImagePreviewIcon :paths="PREVIEW_ICONS.zoomOut" />
      </button>
      <button
        ref="readoutRef"
        type="button"
        class="tx-image-preview__button tx-image-preview__readout"
        :aria-label="readoutLabel"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        :aria-disabled="!canZoom || undefined"
        @click="toggleMenu"
      >
        <span class="tx-image-preview__readout-text tx-image-preview__part">{{ readout }}</span>
      </button>
      <button
        type="button"
        class="tx-image-preview__button"
        :aria-label="zoomInLabel"
        :aria-disabled="!canZoomIn || undefined"
        @click="emit('zoomIn')"
      >
        <ImagePreviewIcon :paths="PREVIEW_ICONS.zoomIn" />
      </button>
    </div>
    <template v-if="actions.length > 0">
      <span class="tx-image-preview__divider tx-image-preview__part" aria-hidden="true" />
      <button
        v-for="action in actions"
        :key="action"
        type="button"
        class="tx-image-preview__button"
        :aria-label="actionLabel(action)"
        :aria-disabled="actionDisabled(action) || undefined"
        @click="emit('action', action, $event.shiftKey)"
      >
        <ImagePreviewIcon :paths="ACTION_ICONS[action]" />
      </button>
    </template>
  </div>
  <ImagePreviewMenu
    ref="menuRef"
    class="is-zoom"
    :open="menuOpen"
    :level="menuLevel"
    :label="label"
    :items="zoomItems"
    :start="checkedItem"
    :place="placeAbove"
    :material="material"
    @choose="choose"
    @close="closeMenu"
  />
</template>

<style lang="scss">
@use './preview-shared' as *;

.tx-image-preview__toolbar {
  position: absolute;
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%;
  isolation: isolate;
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 4px;
  border-radius: 999px;
  transform: translateX(-50%);

  .tx-image-preview__button {
    width: 36px;
    height: 36px;
  }
}

.tx-image-preview__zoom {
  display: flex;
  gap: 2px;
  align-items: center;
}

.tx-image-preview__divider {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.16);
}

// The readout stays legible where the picture cannot zoom, and lit while its menu is open.
.tx-image-preview__toolbar .tx-image-preview__readout {
  width: auto;
  min-width: 58px;
  padding: 0 8px;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;

  &[aria-disabled='true'] {
    color: inherit;
  }

  &[aria-expanded='true']::after {
    background-color: var(--tx-image-preview-tint-hover);
  }
}

.tx-image-preview__readout-text {
  position: relative;
  z-index: 2;
}

@media #{$tx-image-preview-phone} {
  .tx-image-preview__toolbar {
    bottom: calc(12px + env(safe-area-inset-bottom));
    padding: 0;

    .tx-image-preview__button {
      width: 44px;
      height: 44px;
    }
  }

  .tx-image-preview__zoom,
  .tx-image-preview__divider {
    display: none;
  }

  .tx-image-preview:not(.has-actions) .tx-image-preview__toolbar {
    display: none;
  }
}
</style>

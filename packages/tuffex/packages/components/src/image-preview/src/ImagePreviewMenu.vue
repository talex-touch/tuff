<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { PreviewMenuItem, PreviewMenuPlacer } from './menu'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { createRovingFocus } from '../../../../utils/roving-focus'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import ImagePreviewIcon from './ImagePreviewIcon.vue'
import { MENU_MARGIN } from './menu'

// Internal: a menu of TxImagePreview, laid over the whole preview, so a press anywhere off it
// closes it and does nothing else. The actions' menu and the zoom readout's are both this one;
// each says what is in it and where it goes. The arrow keys, Home and End move along it, and
// Escape and Tab close it; Enter and Space press the item. Not exported.
defineOptions({ name: 'TxImagePreviewMenu' })

const props = withDefaults(defineProps<{
  open: boolean
  /** Takes the pointer: a menu a press opened waits for the press to be let go, so the release picks nothing. */
  armed?: boolean
  /** Its fade, 0 to 1. */
  level: number
  label: string
  items: PreviewMenuItem[]
  /** The item focus lands on once it shows. */
  start?: number
  /** Where it goes; a new one places it afresh. */
  place: PreviewMenuPlacer
  /** The controls' surface. */
  material: { mode?: BaseSurfaceMode, color?: string, opacity?: number, blur?: number }
}>(), {
  armed: true,
  start: 0,
})

const emit = defineEmits<{
  /** Inside the click that chose it; Shift asks for the reverse. */
  choose: [key: string, reverse: boolean]
  /** A press off it, Escape or Tab. Focus is for the host to put back. */
  close: []
}>()

const layerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const placed = ref(false)
const placement = shallowRef({ left: 0, top: 0, originX: 0, originY: 0 })

const menuStyle = computed<CSSProperties>(() => ({
  left: `${placement.value.left}px`,
  top: `${placement.value.top}px`,
  transformOrigin: `${placement.value.originX}px ${placement.value.originY}px`,
}))

// The keys stop on a disabled item too, which is read out as unavailable.
const roving = createRovingFocus(
  () => menuRef.value?.querySelectorAll<HTMLElement>('.tx-image-preview__menu-item') ?? [],
  { focusOptions: { preventScroll: true } },
)

function focusItem(at: number): void {
  const list = roving.items()
  if (props.open && list.length > 0)
    list[((at % list.length) + list.length) % list.length]!.focus({ preventScroll: true })
}

/** Where the host wants it, turned back from the edges; it grows out of the host's point. */
function placeMenu(): void {
  const menu = menuRef.value
  const layer = layerRef.value
  if (!menu || !layer || !props.open)
    return
  const room = layer.getBoundingClientRect()
  const width = menu.offsetWidth
  const height = menu.offsetHeight
  const want = props.place({ width, height }, room)
  const left = Math.max(MENU_MARGIN, Math.min(want.left, room.width - MENU_MARGIN - width))
  const top = Math.max(MENU_MARGIN, Math.min(want.top, room.height - MENU_MARGIN - height))
  placement.value = {
    left,
    top,
    originX: Math.max(0, Math.min(width, want.x - left)),
    originY: Math.max(0, Math.min(height, want.y - top)),
  }
  placed.value = true
  // Once shown: a hidden item takes no focus.
  nextTick(() => focusItem(props.start))
}

// Laid out unseen first, and measured. Closing, it fades out where it was.
watch(() => [props.open, props.place] as const, ([open]) => {
  if (!open)
    return
  placed.value = false
  nextTick(placeMenu)
}, { immediate: true })

/**
 * The keys it takes, with their defaults prevented: the preview leaves those alone. The rest go
 * on to the preview, which zooms and turns the picture under the zoom menu.
 */
function onKey(event: KeyboardEvent): void {
  if (props.open && roving.move(event))
    return
  switch (event.key) {
    case 'Escape':
    case 'Tab':
      emit('close')
      break
    // The arrows, Home and End with no item to move to, and the keys across.
    case 'ArrowDown':
    case 'ArrowUp':
    case 'Home':
    case 'End':
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ContextMenu':
      break
    case 'F10':
      if (!event.shiftKey)
        return
      break
    default:
      return
  }
  event.preventDefault()
}

function contains(node: Node | null): boolean {
  return !!node && !!menuRef.value?.contains(node)
}

/** Whether it holds focus. */
function holdsFocus(): boolean {
  return hasDocument() && contains(document.activeElement)
}

defineExpose({
  /** For keys pressed while it is open and focus is elsewhere. */
  onKey,
  holdsFocus,
})
</script>

<template>
  <div
    v-if="open || level > 0"
    ref="layerRef"
    class="tx-image-preview__menu-layer"
    :class="{ 'is-armed': open && armed }"
    :style="{ '--tx-image-preview-menu': `${level}` }"
  >
    <div class="tx-image-preview__scrim" aria-hidden="true" @pointerdown.prevent="emit('close')" />
    <div
      ref="menuRef"
      class="tx-image-preview__menu"
      :class="{ 'is-open': open, 'is-placed': placed }"
      role="menu"
      :aria-label="label"
      :style="menuStyle"
      @keydown="onKey"
    >
      <span class="tx-image-preview__menu-shadow tx-image-preview__part" aria-hidden="true" />
      <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" fake v-bind="material" />
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        :role="item.checked === undefined ? 'menuitem' : 'menuitemradio'"
        tabindex="-1"
        class="tx-image-preview__menu-item"
        :aria-checked="item.checked"
        :aria-disabled="item.disabled || undefined"
        @click="emit('choose', item.key, $event.shiftKey)"
      >
        <span class="tx-image-preview__menu-text tx-image-preview__part">{{ item.label }}</span>
        <ImagePreviewIcon :paths="item.icon" />
      </button>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-image-preview__menu-layer {
  --tx-image-preview-level: var(--tx-image-preview-menu, 1);

  position: absolute;
  inset: 0;
  pointer-events: none;
}

// Not until the press that opened it is let go, so the release picks nothing.
.tx-image-preview__menu-layer.is-armed {
  pointer-events: auto;
}

.tx-image-preview__scrim {
  position: absolute;
  inset: 0;
}

.tx-image-preview__menu {
  position: absolute;
  isolation: isolate;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: max-content;
  min-width: 196px;
  max-width: calc(100% - 16px);
  padding: 6px;
  border-radius: 14px;
  transform: scale(0.9);
  transition: transform 0.16s ease;
}

.tx-image-preview__menu:not(.is-placed) {
  visibility: hidden;
}

// It pops out of the press with the host's bounce.
.tx-image-preview__menu.is-open.is-placed {
  transform: none;
  transition: transform 0.36s var(--tx-image-preview-bounce-ease);
}

.tx-image-preview__menu-shadow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow:
    6px 12px 40px rgba(0, 0, 0, 0.36),
    1px 2px 8px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.tx-image-preview__menu-item {
  position: relative;
  isolation: isolate;
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 10px 0 12px;
  border: none;
  border-radius: 8px;
  outline: none;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: start;
  background: none;
  cursor: pointer;

  &::after {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    background-color: transparent;
    content: '';
    pointer-events: none;
  }

  &:hover::after,
  &:focus-visible::after {
    background-color: var(--tx-image-preview-tint-hover);
  }

  &:active::after {
    background-color: var(--tx-image-preview-tint-active);
  }

  &[aria-disabled='true'] {
    color: var(--tx-image-preview-ink-disabled);
    cursor: default;

    &::after {
      background-color: transparent;
    }
  }

  @include tx-when-high-contrast {
    &:focus-visible {
      outline: 2px solid var(--tx-image-preview-ink);
      outline-offset: -2px;
    }
  }
}

.tx-image-preview__menu-text {
  position: relative;
  z-index: 2;
}

// The zoom readout's menu (see ImagePreviewToolbar), over the whole preview as well: above the
// minimap and the page buttons, and fading with the chrome as well as on its own.
.tx-image-preview__menu-layer.is-zoom {
  --tx-image-preview-level: calc(var(--tx-image-preview-chrome, 1) * var(--tx-image-preview-menu, 1));

  z-index: 1;

  .tx-image-preview__menu {
    min-width: 148px;
    font-variant-numeric: tabular-nums;
  }

  // Every item keeps room for the check, so the menu keeps its width as the zoom moves.
  .tx-image-preview__menu-item[aria-checked='false'] .tx-image-preview__icon {
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-image-preview__menu,
  .tx-image-preview__menu.is-open.is-placed {
    transform: none;
    transition: none;
  }
}
</style>

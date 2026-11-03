<script setup lang="ts">
import type { Morph } from '../../icon-morph/src/engine/dom'
import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { TxIconSource } from '../../icon/src/types'
import type { IconPickerEntry, IconPickerLabels, IconPickerProps, IconPickerShape } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createMorph } from '../../icon-morph/src/engine/dom'
import TxIcon from '../../icon/src/TxIcon.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import { EMOJI_CATALOG, ICON_PICKER_CATEGORY_LABELS } from './catalog'
import { provideIconPickerGlyphs } from './glyphs'
import { formatIconIdentifier, parseIconIdentifier } from './identifier'
import { isIconPickerShape, SHAPE_CONTENT, shapePath } from './shapes'
import TxIconPickerPanel from './TxIconPickerPanel.vue'

defineOptions({ name: 'TxIconPicker' })

const props = withDefaults(defineProps<IconPickerProps>(), {
  modelValue: '',
  shape: 'rounded',
  sections: () => ['emoji', 'icon', 'brand', 'ai', 'file'],
  catalog: undefined,
  emojiPacks: undefined,
  shapeSelectable: true,
  fileChooser: undefined,
  accept: 'image/*',
  disabled: false,
  size: 44,
  placeholder: '',
  inline: false,
  labels: undefined,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:shape', value: IconPickerShape): void
  (e: 'change', value: string): void
  (e: 'file-error', error: unknown): void
}>()

const DEFAULT_LABELS: IconPickerLabels = {
  emoji: 'Emoji',
  icon: 'Icons',
  brand: 'Brands',
  ai: 'AI',
  file: 'File',
  search: 'Search icons',
  empty: 'No matching icon',
  clear: 'Clear',
  chooseFile: 'Choose local file',
  shape: 'Shape',
  shapes: {
    circle: 'Circle',
    squircle: 'Squircle',
    rounded: 'Rounded',
    square: 'Square',
    diamond: 'Diamond',
    pentagon: 'Pentagon',
    hexagon: 'Hexagon',
    arch: 'Arch',
    cookie: 'Cookie',
    clover: 'Clover',
    burst: 'Burst',
    heart: 'Heart',
  },
  categories: ICON_PICKER_CATEGORY_LABELS,
}

// The catalog's classes draw from bundled path data here, so the picker
// renders on a host whose stylesheet has none of them.
provideIconPickerGlyphs()

const labels = computed<IconPickerLabels>(() => {
  const host = props.labels ?? {}
  const legacy: NonNullable<IconPickerLabels['shapes']> = {}
  if (host.shapeCircle)
    legacy.circle = host.shapeCircle
  if (host.shapeRounded)
    legacy.rounded = host.shapeRounded
  if (host.shapeSquare)
    legacy.square = host.shapeSquare
  return {
    ...DEFAULT_LABELS,
    ...host,
    shapes: { ...(DEFAULT_LABELS.shapes ?? {}), ...legacy, ...(host.shapes ?? {}) },
    categories: { ...(DEFAULT_LABELS.categories ?? {}), ...packCategoryLabels(props.emojiPacks), ...(host.categories ?? {}) },
  }
})

function uniquePacks(packs: readonly TxEmojiPack[] | undefined): TxEmojiPack[] {
  const seen = new Set<string>()
  return (packs ?? []).filter((pack) => {
    if (seen.has(pack.id))
      return false
    seen.add(pack.id)
    return true
  })
}

function packCategoryLabels(packs: readonly TxEmojiPack[] | undefined): Record<string, string> {
  return Object.fromEntries(uniquePacks(packs).map(pack => [`pack:${pack.id}`, pack.name]))
}

function emojiPackRows(packs: readonly TxEmojiPack[] | undefined): IconPickerEntry[] {
  const seen = new Set<string>()
  const rows: IconPickerEntry[] = []
  for (const pack of uniquePacks(packs)) {
    for (const emoji of pack.emoji) {
      const id = `url:${emoji.src}`
      if (!emoji.src || seen.has(id))
        continue
      seen.add(id)
      rows.push({
        id,
        icon: { type: 'url', value: emoji.src },
        keywords: [emoji.name, emoji.keywords].filter(Boolean).join(' '),
        category: `pack:${pack.id}`,
      })
    }
  }
  return rows
}

const panelCatalog = computed(() => {
  const rows = emojiPackRows(props.emojiPacks)
  if (!rows.length)
    return props.catalog
  return { ...props.catalog, emoji: [...rows, ...(props.catalog?.emoji ?? EMOJI_CATALOG)] }
})

const open = ref(false)
const fileBusy = ref(false)
const panel = ref<InstanceType<typeof TxIconPickerPanel> | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const plate = ref<SVGPathElement | null>(null)

const selected = computed<TxIconSource | null>(() => parseIconIdentifier(props.modelValue))

/* ─── plate ─── */

// The plate is path data rather than a CSS box, so it can be any of the
// twelve shapes and morph between them; `border-radius` can only round a
// rectangle. Rendered once from the initial shape and morphed from then on:
// the engine owns `d` after mount, and a reactive binding would overwrite
// its frames with the end state.
const initialPlate = shapePath(props.shape)
let morph: Morph | null = null

onMounted(() => {
  if (plate.value)
    morph = createMorph(plate.value, initialPlate, { reducedMotion: 'user' })
})

watch(() => props.shape, (shape) => {
  // The engine drops to an instant set under reduced motion.
  morph?.morphTo(shapePath(shape), 'snappy')
})

onBeforeUnmount(() => {
  morph?.destroy()
  morph = null
})

// The glyph keeps one rendered size and is scaled to each plate's interior,
// so a shape change eases the glyph with the plate instead of snapping its
// font size between frames of the morph.
const contentSize = computed(() => Math.round(props.size * SHAPE_CONTENT.rounded.scale))

const contentStyle = computed(() => {
  const content = SHAPE_CONTENT[isIconPickerShape(props.shape) ? props.shape : 'rounded']
  return {
    transform: `translateY(${(content.offset * props.size).toFixed(2)}px) scale(${(content.scale / SHAPE_CONTENT.rounded.scale).toFixed(3)})`,
  }
})

const triggerStyle = computed(() => ({ '--tx-icon-picker-size': `${props.size}px` }))

/* ─── selection ─── */

function commit(identifier: string): void {
  if (identifier === props.modelValue)
    return
  emit('update:modelValue', identifier)
  emit('change', identifier)
}

function selectEntry(entry: IconPickerEntry): void {
  commit(entry.id)
  if (!props.inline)
    open.value = false
}

function selectShape(shape: IconPickerShape): void {
  if (shape !== props.shape)
    emit('update:shape', shape)
}

async function chooseFile(): Promise<void> {
  if (props.disabled || fileBusy.value || !props.fileChooser)
    return

  fileBusy.value = true
  try {
    const path = await props.fileChooser()
    if (path)
      commit(formatIconIdentifier({ type: 'file', value: path }))
  }
  catch (error) {
    emit('file-error', error)
  }
  finally {
    fileBusy.value = false
  }
}

/**
 * The no-host-chooser path. Its result is a data URL, typed `url` rather than
 * `file`: a browser never hands out a path, and typing it `file` would produce
 * an identifier whose value cannot be resolved by anything.
 */
function readFile(file: File): void {
  fileBusy.value = true
  const reader = new FileReader()
  reader.onload = () => {
    fileBusy.value = false
    const result = typeof reader.result === 'string' ? reader.result : ''
    if (result)
      commit(formatIconIdentifier({ type: 'url', value: result }))
  }
  reader.onerror = () => {
    fileBusy.value = false
    emit('file-error', reader.error)
  }
  reader.readAsDataURL(file)
}

watch(open, async (value) => {
  if (!value) {
    // Focus inside a panel that is about to hide falls back to the page,
    // and a keyboard user has to tab back from the top to reach the field
    // they were editing. Only when it is still inside: a click outside
    // already put it where the user wanted it.
    const root = panel.value?.$el as HTMLElement | undefined
    if (root?.contains(document.activeElement))
      trigger.value?.focus({ preventScroll: true })
    // Reopening onto the previous query shows a filtered grid the user did
    // not ask for and has to notice before clearing.
    panel.value?.resetQuery()
    return
  }
  // The panel mounts on the first open, so it exists only after this tick.
  await nextTick()
  panel.value?.reveal()
  void panel.value?.focusSearch()
})

defineExpose({
  /** Opens or closes the panel. No-op when `inline`. */
  toggle: (value?: boolean) => {
    open.value = typeof value === 'boolean' ? value : !open.value
  },
})
</script>

<template>
  <TxIconPickerPanel
    v-if="inline"
    ref="panel"
    class="tx-icon-picker is-inline"
    :model-value="modelValue"
    :shape="shape"
    :sections="sections"
    :catalog="panelCatalog"
    :shape-selectable="shapeSelectable"
    :labels="labels"
    :disabled="disabled"
    :accept="accept"
    :has-file-chooser="Boolean(fileChooser)"
    :file-busy="fileBusy"
    @select="selectEntry"
    @select-shape="selectShape"
    @choose-file="chooseFile"
    @pick-file="readFile"
    @clear="commit('')"
  />

  <TxPopover
    v-else
    v-model="open"
    class="tx-icon-picker"
    :disabled="disabled"
    placement="bottom-start"
    :width="312"
    :max-width="312"
    :max-height="480"
    :panel-padding="0"
    :show-arrow="false"
  >
    <template #reference>
      <button
        ref="trigger"
        type="button"
        class="tx-icon-picker__trigger"
        :class="{ 'is-empty': !selected }"
        :style="triggerStyle"
        :disabled="disabled"
        :aria-label="placeholder || labels.search"
        :aria-expanded="open"
      >
        <svg class="tx-icon-picker__plate" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path ref="plate" :d="initialPlate" />
        </svg>
        <span class="tx-icon-picker__content" :style="contentStyle">
          <TxIcon
            v-if="selected"
            :icon="selected"
            :size="contentSize"
            colorful
          />
          <!-- Remix `image-add-line`, drawn here so the trigger needs no icon collection -->
          <svg v-else class="tx-icon-picker__trigger-empty" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 15v3h3v2h-3v3h-2v-3h-3v-2h3v-3zm.008-12c.548 0 .992.445.992.993V13h-2V5H4v13.999L14 9l3 3v2.829l-3-3L6.827 19H14v2H2.992A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3zM8 7a2 2 0 1 1 0 4a2 2 0 0 1 0-4" />
          </svg>
        </span>
      </button>
    </template>

    <TxIconPickerPanel
      ref="panel"
      :model-value="modelValue"
      :shape="shape"
      :sections="sections"
      :catalog="panelCatalog"
      :shape-selectable="shapeSelectable"
      :labels="labels"
      :disabled="disabled"
      :accept="accept"
      :has-file-chooser="Boolean(fileChooser)"
      :file-busy="fileBusy"
      @select="selectEntry"
      @select-shape="selectShape"
      @choose-file="chooseFile"
      @pick-file="readFile"
      @clear="commit('')"
    />
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-icon-picker.is-inline {
  display: block;
  width: 100%;
}

// The button is a hit area and a focus target; the plate behind its content
// is what the user sees, so the focus ring is drawn on the plate's own edge
// rather than as a rectangle around a heart.
.tx-icon-picker__trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: var(--tx-icon-picker-size, 44px);
  height: var(--tx-icon-picker-size, 44px);

  padding: 0;
  border: 0;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &.is-empty {
    color: var(--tx-text-color-placeholder, #a8abb2);
  }
}

// `overflow: visible`: the edge stroke is centred on the outline, so half of
// it lies outside the 24-unit box, as do the few control points a lobed shape
// overshoots by.
.tx-icon-picker__plate {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;

  path {
    fill: var(--tx-bg-color, #fff);
    stroke: var(--tx-border-color, #dcdfe6);
    stroke-width: 1px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
}

.tx-icon-picker__trigger.is-empty .tx-icon-picker__plate path {
  stroke-dasharray: 4 3;
}

.tx-icon-picker__trigger:hover:not(:disabled) .tx-icon-picker__plate path {
  stroke: var(--tx-color-primary, #409eff);
}

.tx-icon-picker__trigger:focus-visible .tx-icon-picker__plate path {
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 2px;
  stroke-dasharray: none;
}

// SVG paint is not forced, so the plate would keep its theme colours on a
// high-contrast background — a white plate on black, with a hairline edge
// nobody can see.
@media (forced-colors: active) {
  .tx-icon-picker__plate path {
    fill: Canvas;
    stroke: CanvasText;
  }

  .tx-icon-picker__trigger:hover:not(:disabled) .tx-icon-picker__plate path,
  .tx-icon-picker__trigger:focus-visible .tx-icon-picker__plate path {
    stroke: Highlight;
  }
}

.tx-icon-picker__content {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  // Same overshoot as the plate's morph, so glyph and plate settle together.
  transition: transform 0.32s cubic-bezier(0.32, 1.28, 0.5, 1);
}

// The glyph still lands at its new size and offset — that is the committed
// shape. Only the travel goes, as the plate's morph does.
@media (prefers-reduced-motion: reduce) {
  .tx-icon-picker__content {
    transition: none;
  }
}

.tx-icon-picker__trigger-empty {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
</style>

<script setup lang="ts">
import type { TxFlatRadioValue } from '../../flat-radio/src/types'
import type { IconPickerEntry, IconPickerLabels, IconPickerSection, IconPickerShape } from './types'
import { computed, ref, watch } from 'vue'
import TxButton from '../../button/src/button.vue'
import TxFlatRadio from '../../flat-radio/src/TxFlatRadio.vue'
import TxFlatRadioItem from '../../flat-radio/src/TxFlatRadioItem.vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import { BRAND_CATALOG, EMOJI_CATALOG, ICON_CATALOG } from './catalog'

/**
 * The picker's panel: tabs, search, grid, shape row and actions.
 *
 * Its own component rather than a block inside TxIconPicker because the panel
 * is rendered in two places — behind a popover, and directly when `inline`.
 * Expressed as one template with a dynamic root, the popover's `#reference`
 * slot has to be conditionally bound, which silently drops the trigger in the
 * branch that does not use it.
 */

defineOptions({ name: 'TxIconPickerPanel' })

const props = defineProps<{
  modelValue: string
  shape: IconPickerShape
  sections: IconPickerSection[]
  catalog?: Partial<Record<'emoji' | 'icon' | 'brand', IconPickerEntry[]>>
  shapeSelectable: boolean
  labels: IconPickerLabels
  disabled: boolean
  accept: string
  /** Whether the host supplied a native chooser; drives the fallback input. */
  hasFileChooser: boolean
  fileBusy: boolean
}>()

const emit = defineEmits<{
  (e: 'select', entry: IconPickerEntry): void
  (e: 'select-shape', shape: IconPickerShape): void
  (e: 'choose-file'): void
  (e: 'pick-file', file: File): void
  (e: 'clear'): void
}>()

const SHAPES: IconPickerShape[] = ['circle', 'rounded', 'square']

const SHAPE_LABEL_KEYS: Record<IconPickerShape, keyof IconPickerLabels> = {
  circle: 'shapeCircle',
  rounded: 'shapeRounded',
  square: 'shapeSquare',
}

const query = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

/** Sections that carry a grid; `file` is an action, not a catalog. */
const gridSections = computed(() =>
  props.sections.filter((section): section is 'emoji' | 'icon' | 'brand' => section !== 'file'),
)

const fileEnabled = computed(() => props.sections.includes('file'))

const activeSection = ref<'emoji' | 'icon' | 'brand'>(gridSections.value[0] ?? 'emoji')

// A host may narrow `sections` at runtime (a settings toggle, a capability
// check). Left alone, the tab bar keeps a selection with no panel behind it
// and the grid renders empty with no way back.
watch(gridSections, (sections) => {
  if (!sections.includes(activeSection.value))
    activeSection.value = sections[0] ?? 'emoji'
})

// Which way the grid should travel on a tab change. Derived from tab order
// rather than a fixed direction, so the content follows the thumb: stepping
// Emoji -> Brands slides left, Brands -> Emoji slides right. A constant
// direction reads as a glitch on the way back.
const slideBack = ref(false)

function handleSection(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (typeof value !== 'string')
    return
  const next = value as 'emoji' | 'icon' | 'brand'
  if (next === activeSection.value)
    return
  const order = gridSections.value
  slideBack.value = order.indexOf(next) < order.indexOf(activeSection.value)
  activeSection.value = next
}

// `select-shape` carries the narrow union, but TxFlatRadio's model is the wide
// `string | number` any radio group accepts. The guard is the boundary between
// the two, not a defensive check: nothing else writes this model.
function handleShape(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (typeof value !== 'string')
    return
  emit('select-shape', value as IconPickerShape)
}

function catalogFor(section: 'emoji' | 'icon' | 'brand'): IconPickerEntry[] {
  const override = props.catalog?.[section]
  if (override)
    return override
  if (section === 'emoji')
    return EMOJI_CATALOG
  if (section === 'brand')
    return BRAND_CATALOG
  return ICON_CATALOG
}

const visibleEntries = computed(() => {
  const entries = catalogFor(activeSection.value)
  const needle = query.value.trim().toLowerCase()
  if (!needle)
    return entries

  // Every space-separated term must match, so "ai chat" narrows rather than
  // widening the way one `includes` over the joined query would.
  const terms = needle.split(/\s+/)
  return entries.filter((entry) => {
    const haystack = `${entry.keywords} ${entry.icon.value}`.toLowerCase()
    return terms.every(term => haystack.includes(term))
  })
})

function openFilePicker(): void {
  if (props.hasFileChooser) {
    emit('choose-file')
    return
  }
  fileInput.value?.click()
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset first: picking the same file twice in a row fires no `change` at all
  // while the previous value is still on the input.
  input.value = ''
  if (file)
    emit('pick-file', file)
}

defineExpose({
  /** Clears the query, so reopening never shows a filter the user did not ask for. */
  resetQuery: () => {
    query.value = ''
  },
})
</script>

<template>
  <div class="tx-icon-picker-panel">
    <TxFlatRadio
      v-if="gridSections.length > 1"
      class="tx-icon-picker-panel__tabs"
      size="md"
      :model-value="activeSection"
      :disabled="disabled"
      @update:model-value="handleSection"
    >
      <TxFlatRadioItem
        v-for="section in gridSections"
        :key="section"
        class="tx-icon-picker-panel__tab"
        :value="section"
        :label="labels[section]"
      />
    </TxFlatRadio>

    <div class="tx-icon-picker-panel__search">
      <i class="i-ri-search-line" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        class="tx-icon-picker-panel__search-input"
        :placeholder="labels.search"
        :disabled="disabled"
      >
    </div>

    <div class="tx-icon-picker-panel__viewport">
      <Transition :name="slideBack ? 'tx-icon-picker-slide-back' : 'tx-icon-picker-slide'">
        <div :key="activeSection" class="tx-icon-picker-panel__grid" role="listbox">
          <button
            v-for="entry in visibleEntries"
            :key="entry.id"
            type="button"
            role="option"
            class="tx-icon-picker-panel__cell"
            :class="{ 'is-selected': entry.id === modelValue }"
            :aria-selected="entry.id === modelValue"
            :title="entry.icon.value"
            :disabled="disabled"
            @click="emit('select', entry)"
          >
            <TxIcon :icon="entry.icon" :size="20" colorful />
          </button>

          <p v-if="!visibleEntries.length" class="tx-icon-picker-panel__empty">
            {{ labels.empty }}
          </p>
        </div>
      </Transition>
    </div>

    <div v-if="shapeSelectable" class="tx-icon-picker-panel__row">
      <span class="tx-icon-picker-panel__row-label">{{ labels.shape }}</span>
      <TxFlatRadio
        class="tx-icon-picker-panel__shapes"
        size="md"
        :model-value="shape"
        :disabled="disabled"
        @update:model-value="handleShape"
      >
        <TxFlatRadioItem
          v-for="option in SHAPES"
          :key="option"
          class="tx-icon-picker-panel__shape"
          :value="option"
          :aria-label="labels[SHAPE_LABEL_KEYS[option]]"
        >
          <template #icon>
            <span class="tx-icon-picker-panel__swatch" :class="`is-${option}`" />
          </template>
        </TxFlatRadioItem>
      </TxFlatRadio>
    </div>

    <div class="tx-icon-picker-panel__actions">
      <TxButton
        v-if="fileEnabled"
        class="tx-icon-picker-panel__action"
        variant="flat"
        type="primary"
        icon="i-ri-folder-image-line"
        :disabled="disabled"
        :loading="fileBusy"
        @click="openFilePicker"
      >
        {{ labels.chooseFile }}
      </TxButton>
      <TxButton
        class="tx-icon-picker-panel__action is-quiet"
        variant="ghost"
        :disabled="disabled || !modelValue"
        @click="emit('clear')"
      >
        {{ labels.clear }}
      </TxButton>
    </div>

    <input
      v-if="fileEnabled && !hasFileChooser"
      ref="fileInput"
      type="file"
      class="tx-icon-picker-panel__file"
      :accept="accept"
      @change="handleFileInput"
    >
  </div>
</template>

<style lang="scss" scoped>
.tx-icon-picker-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  box-sizing: border-box;
}

// TxFlatRadio owns its own geometry through these variables, and it styles
// itself as `.tx-flat-radio[data-v-hash]` — one class plus an attribute. The
// wrapper class is repeated to out-specify that without reaching for
// !important, matching how TxFineTuneCard overrides the same component.
.tx-icon-picker-panel__tabs.tx-icon-picker-panel__tabs {
  display: flex;
  width: 100%;
  --tx-flat-radio-height: 30px;
  --tx-flat-radio-radius: 10px;
  --tx-flat-radio-item-radius: 8px;
  --tx-flat-radio-font-size: 12px;

  // The three sections are peers, so they split the bar evenly. Left to
  // content width, "Emoji" and "Brands" get different widths and the thumb
  // resizes on every switch — motion that encodes label length, not state.
  :deep(.tx-icon-picker-panel__tab) {
    flex: 1;
    justify-content: center;
  }
}

.tx-icon-picker-panel__search {
  display: flex;
  align-items: center;
  gap: 6px;

  padding: 6px 8px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 10px;
  color: var(--tx-text-color-placeholder, #a8abb2);

  &:focus-within {
    border-color: var(--tx-color-primary, #409eff);
  }
}

.tx-icon-picker-panel__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--tx-text-color-primary, #303133);

  &::-webkit-search-cancel-button {
    appearance: none;
  }
}

// The viewport is the stable box the grids move inside. During a switch both
// the leaving and entering grid are mounted; without a positioned container
// they stack vertically and the panel — and the popover anchored to it —
// jumps to double height for the length of the transition.
.tx-icon-picker-panel__viewport {
  position: relative;
  overflow: hidden;

  // Reserve the grid's full height so a short section (a 1-hit search) does
  // not collapse the box and drag the actions row up under the cursor.
  min-height: 196px;
}

.tx-icon-picker-panel__grid {
  display: grid;
  // Column *count* absorbs the extra width, not column size. `repeat(7, 1fr)`
  // is right inside the 312px popover and wrong inline, where the panel is as
  // wide as its host: seven columns of a 1265px grid are 179px cells carrying a
  // 20px glyph. `auto-fill` keeps every cell at the popover's ~40px and adds
  // columns instead.
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 2px;

  max-height: 196px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

// Only the outgoing grid is taken out of flow. Pulling *both* out would leave
// the viewport with no in-flow child to size against, collapsing it to the
// reserved minimum even when the entering section is shorter.
.tx-icon-picker-slide-leave-active,
.tx-icon-picker-slide-back-leave-active {
  position: absolute;
  inset: 0;
}

.tx-icon-picker-slide-enter-active,
.tx-icon-picker-slide-leave-active,
.tx-icon-picker-slide-back-enter-active,
.tx-icon-picker-slide-back-leave-active {
  // Deliberately shorter than the thumb's 0.26s: the thumb is what the eye
  // tracks, and content that is still arriving after it lands reads as lag.
  transition: transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.16s ease;
}

// 12px, not a full panel width. The grid is a dense field of same-size cells,
// so a long travel turns into a blur of glyphs; a short offset reads as the
// content stepping aside.
.tx-icon-picker-slide-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.tx-icon-picker-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.tx-icon-picker-slide-back-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}

.tx-icon-picker-slide-back-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

// The fade stays so sections still resolve rather than cutting; only travel goes.
@media (prefers-reduced-motion: reduce) {
  .tx-icon-picker-slide-enter-active,
  .tx-icon-picker-slide-leave-active,
  .tx-icon-picker-slide-back-enter-active,
  .tx-icon-picker-slide-back-leave-active {
    transition: opacity 0.16s ease;
  }

  .tx-icon-picker-slide-enter-from,
  .tx-icon-picker-slide-leave-to,
  .tx-icon-picker-slide-back-enter-from,
  .tx-icon-picker-slide-back-leave-to {
    transform: none;
  }
}

.tx-icon-picker-panel__cell {
  display: flex;
  align-items: center;
  justify-content: center;

  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  font-size: 18px;
  cursor: pointer;
  // `background` alone made selection a state swap with no event attached to
  // it. The ring is animated from a collapsed spread so the selected cell is
  // seen *becoming* selected, on the same overshoot curve as the tab thumb.
  transition:
    background 0.15s ease,
    box-shadow 0.24s cubic-bezier(0.32, 1.28, 0.5, 1),
    transform 0.24s cubic-bezier(0.32, 1.28, 0.5, 1);

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light, #f5f7fa);
  }

  // Presses land on the glyph, so the feedback belongs there. 0.92 is enough
  // to feel at a 40px target without the icon visibly resampling.
  &:active:not(:disabled) {
    transform: scale(0.92);
    transition-duration: 0.08s;
  }

  &.is-selected {
    background: var(--tx-color-primary-light-8, #ecf5ff);
    box-shadow: inset 0 0 0 2px var(--tx-color-primary, #409eff);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

// The ring and fill still change — the selected cell must stay identifiable.
// Only the spring travel and the press scale go.
@media (prefers-reduced-motion: reduce) {
  .tx-icon-picker-panel__cell {
    transition: background 0.15s ease, box-shadow 0.15s ease;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}

.tx-icon-picker-panel__empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-icon-picker-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-icon-picker-panel__row-label {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

// Same override shape as the tab bar: the wrapper class repeated to out-specify
// `.tx-flat-radio[data-v-hash]` without !important.
.tx-icon-picker-panel__shapes.tx-icon-picker-panel__shapes {
  --tx-flat-radio-item-padding: 0 10px;

  // The swatch *is* the label, so the item has no text to set its width and
  // collapses to the padding. A floor keeps the three cells square-ish and
  // gives the thumb a target wide enough to read as a segment.
  :deep(.tx-icon-picker-panel__shape) {
    min-width: 34px;
  }
}

// A plate outline, at the size a plate is actually judged at. The old 20px box
// with a 1.5px border was the complaint: at that scale `rounded` (6px) and
// `square` (2px) differ by four pixels of corner and read as the same chip.
//
// Each swatch's radius is constant — the one that morphs is the trigger plate,
// which is what the row actually edits. These three only have to be told apart.
.tx-icon-picker-panel__swatch {
  width: 18px;
  height: 18px;
  // The radii are the trigger's own, scaled: the row previews the plate, so a
  // `rounded` chip rounder than the plate it stands for is a lie the user only
  // catches after committing.
  border: 2px solid currentColor;

  &.is-circle { border-radius: 999px; }
  &.is-rounded { border-radius: 6px; }
  &.is-square { border-radius: 2px; }
}

.tx-icon-picker-panel__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

// `variant-flat` carries `min-width: 120px`, which inside the 312px popover
// forces the two buttons past the row and wraps them. The row owns the split
// instead: the file action takes the slack, `clear` stays at its content width.
.tx-icon-picker-panel__action.tx-icon-picker-panel__action {
  flex: 1;
  min-width: 0;
}

.tx-icon-picker-panel__action.is-quiet.is-quiet {
  flex: 0 0 auto;
}

.tx-icon-picker-panel__file {
  display: none;
}
</style>

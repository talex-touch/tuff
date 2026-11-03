<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { TxFlatRadioValue } from '../../flat-radio/src/types'
import type {
  IconPickerCatalogSection,
  IconPickerEntry,
  IconPickerLabels,
  IconPickerSection,
  IconPickerShape,
} from './types'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import { useMorphWindow } from '../../../../utils/use-morph-window'
import TxButton from '../../button/src/button.vue'
import TxFlatRadio from '../../flat-radio/src/TxFlatRadio.vue'
import TxFlatRadioItem from '../../flat-radio/src/TxFlatRadioItem.vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import {
  AI_CATALOG,
  BRAND_CATALOG,
  EMOJI_CATALOG,
  ICON_CATALOG,
  ICON_PICKER_CATEGORY_LABELS,
} from './catalog'
import { loadIconPickerPinyin, searchIconPickerEntries } from './search'
import { ICON_PICKER_SHAPE_PATHS, ICON_PICKER_SHAPES } from './shapes'

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
  catalog?: Partial<Record<IconPickerCatalogSection, IconPickerEntry[]>>
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

const BUNDLED: Record<IconPickerCatalogSection, IconPickerEntry[]> = {
  emoji: EMOJI_CATALOG,
  icon: ICON_CATALOG,
  brand: BRAND_CATALOG,
  ai: AI_CATALOG,
}

interface Group {
  key: string
  /** The heading; empty when there is nothing to tell this group apart from. */
  label: string
  /** The category the group gathers while browsing; empty for search results. */
  category: string
  entries: IconPickerEntry[]
  /** Flat index of the group's first entry, for keyboard navigation. */
  start: number
}

const uid = useId()
const listboxId = `${uid}-listbox`

const query = ref('')
const active = ref(-1)
const currentCategory = ref('')
const hoveredShape = ref<IconPickerShape | null>(null)
const input = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const scroller = shallowRef<HTMLElement | null>(null)
// Picking a cell eases its fill in; a hover repaints at once.
const morphing = useMorphWindow(() => props.modelValue, 150)

/** Sections that carry a grid; `file` is an action, not a catalog. */
const gridSections = computed(() =>
  props.sections.filter((section): section is IconPickerCatalogSection => section !== 'file'),
)

const fileEnabled = computed(() => props.sections.includes('file'))

function catalogFor(section: IconPickerCatalogSection): IconPickerEntry[] {
  return props.catalog?.[section] ?? BUNDLED[section]
}

function sectionOf(identifier: string): IconPickerCatalogSection | undefined {
  if (!identifier)
    return undefined
  return gridSections.value.find(section => catalogFor(section).some(entry => entry.id === identifier))
}

// Opens on the section the current icon is in: landing on Emoji while editing
// a brand mark sends the user hunting for the icon they already have.
const activeSection = ref<IconPickerCatalogSection>(
  sectionOf(props.modelValue) ?? gridSections.value[0] ?? 'emoji',
)

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
// Set while the panel jumps to the current icon's section on open, which the
// user did not ask to watch.
const instant = ref(false)

function handleSection(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (typeof value !== 'string')
    return
  const next = value as IconPickerCatalogSection
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

function categoryLabel(category: string): string {
  return props.labels.categories?.[category] ?? ICON_PICKER_CATEGORY_LABELS[category] ?? category
}

function shapeLabel(shape: IconPickerShape): string {
  return props.labels.shapes?.[shape] ?? shape
}

const searching = computed(() => query.value.trim().length > 0)

const groups = computed<Group[]>(() => {
  const result: Group[] = []
  if (!gridSections.value.length)
    return result

  let start = 0
  const push = (key: string, label: string, category: string, entries: IconPickerEntry[]): void => {
    if (!entries.length)
      return
    result.push({ key, label, category, entries, start })
    start += entries.length
  }

  // A query searches every section, not just the open tab: someone typing
  // "github" wants the mark wherever it lives, and an empty Emoji grid with
  // the answer one tab over reads as "no such icon". The open tab still
  // leads, so pressing a tab while searching brings its hits to the top.
  if (searching.value) {
    const order = [activeSection.value, ...gridSections.value.filter(section => section !== activeSection.value)]
    const headed = gridSections.value.length > 1
    for (const section of order) {
      push(
        `section:${section}`,
        headed ? (props.labels[section] ?? '') : '',
        '',
        searchIconPickerEntries(catalogFor(section), query.value, categoryLabel),
      )
    }
    return result
  }

  const byCategory = new Map<string, IconPickerEntry[]>()
  for (const entry of catalogFor(activeSection.value)) {
    const category = entry.category ?? ''
    const rows = byCategory.get(category)
    if (rows)
      rows.push(entry)
    else
      byCategory.set(category, [entry])
  }
  const uncategorized = byCategory.get('') ?? []
  byCategory.delete('')
  for (const [category, rows] of byCategory)
    push(`category:${category}`, categoryLabel(category), category, rows)
  push('category:', '', '', uncategorized)
  return result
})

const flat = computed(() => groups.value.flatMap(group => group.entries))

/** Category shortcuts, while browsing a section that has more than one. */
const jumps = computed(() => {
  if (searching.value)
    return []
  const named = groups.value.filter(group => group.category)
  return named.length > 1 ? named : []
})

const activeId = computed(() => (active.value >= 0 ? `${uid}-option-${active.value}` : undefined))

function setScroller(el: Element | ComponentPublicInstance | null): void {
  // Both grids are mounted while sections cross-fade; the leaving one
  // reporting `null` must not clear the one that replaced it.
  if (el instanceof HTMLElement)
    scroller.value = el
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── category shortcuts ─── */

// Set by a shortcut, until the scroll it started lands. Without it the
// highlight steps through every category the smooth scroll passes, and when
// the target is too short to reach the top it settles on the last one rather
// than the one pressed.
let jump: { top: number, timer: ReturnType<typeof setTimeout> } | null = null

function releaseJump(): void {
  if (jump)
    clearTimeout(jump.timer)
  jump = null
}

function categorySections(): HTMLElement[] {
  return [...(scroller.value?.querySelectorAll<HTMLElement>('[data-category]') ?? [])]
}

function syncCurrentCategory(): void {
  const el = scroller.value
  const sections = categorySections()
  if (!el || !sections.length)
    return

  const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
  let current = sections[0]!
  if (atEnd) {
    // The last categories can be too short to ever reach the top.
    current = sections[sections.length - 1]!
  }
  else {
    for (const section of sections) {
      if (section.offsetTop - el.scrollTop > 24)
        break
      current = section
    }
  }
  currentCategory.value = current.dataset.category ?? ''
}

function handleScroll(): void {
  const el = scroller.value
  if (!el)
    return
  if (jump) {
    if (Math.abs(el.scrollTop - jump.top) < 2 || el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
      releaseJump()
    return
  }
  syncCurrentCategory()
}

function jumpTo(category: string): void {
  const el = scroller.value
  const target = categorySections().find(section => section.dataset.category === category)
  if (!el || !target)
    return

  currentCategory.value = category
  releaseJump()
  releaseReveal()
  const top = Math.min(target.offsetTop, el.scrollHeight - el.clientHeight)
  jump = { top, timer: setTimeout(releaseJump, 1200) }
  el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

watch(
  () => [activeSection.value, jumps.value[0]?.category ?? ''] as const,
  ([, first]) => {
    releaseJump()
    currentCategory.value = first
  },
  { immediate: true },
)

onBeforeUnmount(releaseJump)

/* ─── search and keyboard ─── */

watch(query, (value) => {
  active.value = -1
  releaseReveal()
  if (scroller.value)
    scroller.value.scrollTop = 0
  // Pinyin is only consulted for latin terms; most queries never need it.
  if (/[a-z]/i.test(value))
    loadIconPickerPinyin().catch(() => {})
})

watch(activeSection, () => {
  active.value = -1
  releaseReveal()
})

function cellAt(index: number): HTMLElement | null {
  return scroller.value?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null
}

/**
 * Scrolls the grid, and only the grid. `scrollIntoView` also scrolls every
 * ancestor, which on a panel still positioning itself can move the page.
 */
function scrollToCell(cell: HTMLElement, center: boolean): void {
  const el = scroller.value
  if (!el)
    return
  const top = cell.offsetTop
  const bottom = top + cell.offsetHeight
  if (center)
    el.scrollTop = Math.max(0, top - (el.clientHeight - cell.offsetHeight) / 2)
  else if (top < el.scrollTop)
    el.scrollTop = top - 4
  else if (bottom > el.scrollTop + el.clientHeight)
    el.scrollTop = bottom - el.clientHeight + 4
}

// The first open lays the panel out before the popover sizes it: the grid is
// ten columns wide when `reveal` centres the current cell and six a moment
// later, and scroll anchoring then keeps the row that was on top, not the
// cell. So the cell is centred again on every width change until the user
// moves the grid. A ResizeObserver reports after layout and before paint, so
// the correction never shows.
let revealHold: ResizeObserver | null = null

function releaseReveal(): void {
  revealHold?.disconnect()
  revealHold = null
}

function centreSelected(): void {
  const cell = scroller.value?.querySelector<HTMLElement>('.tx-icon-picker-panel__cell.is-selected')
  if (cell)
    scrollToCell(cell, true)
}

function holdReveal(): void {
  releaseReveal()
  const el = scroller.value
  if (!el || typeof ResizeObserver === 'undefined')
    return
  let width = el.clientWidth
  revealHold = new ResizeObserver(() => {
    // Zero is a closed popover, not a layout to find the cell in.
    if (!el.clientWidth || el.clientWidth === width)
      return
    width = el.clientWidth
    centreSelected()
  })
  revealHold.observe(el)
}

onBeforeUnmount(releaseReveal)

function setActive(index: number): void {
  releaseReveal()
  active.value = index
  if (index < 0)
    return
  void nextTick(() => {
    const cell = cellAt(index)
    if (cell)
      scrollToCell(cell, false)
  })
}

/** The rendered column count. Every group is its own grid, at the same width. */
function columns(): number {
  const grid = scroller.value?.querySelector<HTMLElement>('.tx-icon-picker-panel__grid')
  if (!grid)
    return 1
  return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length)
}

function locate(index: number): { group: number, offset: number } {
  const list = groups.value
  let group = list.length - 1
  while (group > 0 && list[group]!.start > index)
    group--
  return { group, offset: index - (list[group]?.start ?? 0) }
}

/**
 * Up and down move by a row, across group boundaries, keeping the column
 * where the next row is long enough to have one.
 */
function stepRow(down: boolean): void {
  const list = groups.value
  const cols = columns()
  const { group, offset } = locate(active.value)
  const current = list[group]
  if (!current)
    return

  if (down) {
    if (offset + cols < current.entries.length)
      return setActive(active.value + cols)
    // A shorter last row: land on its last cell rather than skip the row.
    if (Math.floor(offset / cols) < Math.floor((current.entries.length - 1) / cols))
      return setActive(current.start + current.entries.length - 1)
    const next = list[group + 1]
    if (next)
      setActive(next.start + Math.min(offset % cols, next.entries.length - 1))
    return
  }

  if (offset - cols >= 0)
    return setActive(active.value - cols)
  const previous = list[group - 1]
  if (!previous)
    return setActive(-1)
  const lastRow = Math.floor((previous.entries.length - 1) / cols) * cols
  setActive(previous.start + Math.min(lastRow + (offset % cols), previous.entries.length - 1))
}

/**
 * Focus stays in the search box, and the grid is driven from it through
 * `aria-activedescendant`: typing, arrowing to a cell and pressing Enter is
 * one motion, with no Tab stop for each of a few hundred cells.
 */
function handleKeydown(event: KeyboardEvent): void {
  // Enter and the arrows belong to the input method while it is composing.
  if (event.isComposing)
    return

  const total = flat.value.length
  switch (event.key) {
    case 'ArrowDown':
      if (!total)
        return
      if (active.value < 0)
        setActive(0)
      else
        stepRow(true)
      break
    case 'ArrowUp':
      if (active.value < 0)
        return
      stepRow(false)
      break
    // Left and right edit the query until a cell is active.
    case 'ArrowRight':
      if (active.value < 0)
        return
      setActive(Math.min(active.value + 1, total - 1))
      break
    case 'ArrowLeft':
      if (active.value < 0)
        return
      setActive(Math.max(active.value - 1, 0))
      break
    case 'Enter': {
      // With a query and nothing arrowed to, Enter takes the best match.
      const entry = flat.value[active.value] ?? (searching.value ? flat.value[0] : undefined)
      if (!entry)
        return
      emit('select', entry)
      break
    }
    case 'Escape':
      // The first Esc clears the query; only an empty one closes the panel.
      if (!query.value)
        return
      query.value = ''
      event.stopPropagation()
      break
    default:
      return
  }
  event.preventDefault()
}

/* ─── file ─── */

function openFilePicker(): void {
  if (props.hasFileChooser) {
    emit('choose-file')
    return
  }
  fileInput.value?.click()
}

function handleFileInput(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  // Reset first: picking the same file twice in a row fires no `change` at all
  // while the previous value is still on the input.
  target.value = ''
  if (file)
    emit('pick-file', file)
}

defineExpose({
  /** Clears the query, so reopening never shows a filter the user did not ask for. */
  resetQuery: () => {
    query.value = ''
  },
  /** Moves to the current icon's section and scrolls it into view, without animating. */
  reveal: () => {
    const section = sectionOf(props.modelValue)
    if (section && section !== activeSection.value) {
      instant.value = true
      activeSection.value = section
    }
    void nextTick(() => {
      instant.value = false
      centreSelected()
      holdReveal()
    })
  },
  /**
   * Focuses the search box once the panel is visible. A popover keeps its
   * panel `visibility: hidden` for the first frames of opening, and focusing
   * inside it then does nothing. Skipped on touch screens, where focusing a
   * field raises the keyboard over the grid the user came to browse.
   */
  focusSearch: async () => {
    if (typeof matchMedia === 'undefined' || matchMedia('(hover: none)').matches)
      return
    for (let frame = 0; frame < 30; frame++) {
      const el = input.value
      if (!el?.isConnected)
        return
      if (getComputedStyle(el).visibility === 'visible') {
        el.focus({ preventScroll: true })
        return
      }
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
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

    <template v-if="gridSections.length">
      <div class="tx-icon-picker-panel__search">
        <TxIcon name="search" />
        <input
          ref="input"
          v-model="query"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          class="tx-icon-picker-panel__search-input"
          :aria-controls="listboxId"
          :aria-activedescendant="activeId"
          :placeholder="labels.search"
          :disabled="disabled"
          @keydown="handleKeydown"
        >
      </div>

      <div class="tx-icon-picker-panel__browse">
        <div v-if="jumps.length" class="tx-icon-picker-panel__jumps">
          <!-- Pointer shortcuts: the keyboard reaches every cell from the
               search box, so these stay out of the Tab order. -->
          <button
            v-for="group in jumps"
            :key="group.key"
            type="button"
            tabindex="-1"
            class="tx-icon-picker-panel__jump"
            :class="{ 'is-current': group.category === currentCategory }"
            :aria-current="group.category === currentCategory || undefined"
            :aria-label="group.label"
            :title="group.label"
            @click="jumpTo(group.category)"
          >
            <TxIcon :icon="group.entries[0]!.icon" :size="16" colorful />
          </button>
        </div>

        <div class="tx-icon-picker-panel__viewport">
          <Transition :css="!instant" :name="slideBack ? 'tx-icon-picker-slide-back' : 'tx-icon-picker-slide'">
            <div
              :id="listboxId"
              :key="activeSection"
              :ref="setScroller"
              class="tx-icon-picker-panel__scroller"
              :class="{ 'is-morphing': morphing }"
              role="listbox"
              :aria-label="labels[activeSection]"
              @scroll.passive="handleScroll"
              @wheel.passive="releaseReveal"
              @touchmove.passive="releaseReveal"
              @pointerdown="releaseReveal"
            >
              <section
                v-for="group in groups"
                :key="group.key"
                class="tx-icon-picker-panel__group"
                role="group"
                :data-category="group.category || undefined"
                :aria-labelledby="group.label ? `${uid}-${group.key}` : undefined"
              >
                <div v-if="group.label" :id="`${uid}-${group.key}`" class="tx-icon-picker-panel__heading" aria-hidden="true">
                  {{ group.label }}
                </div>
                <div class="tx-icon-picker-panel__grid">
                  <button
                    v-for="(entry, offset) in group.entries"
                    :id="`${uid}-option-${group.start + offset}`"
                    :key="entry.id"
                    type="button"
                    role="option"
                    tabindex="-1"
                    class="tx-icon-picker-panel__cell"
                    :class="{ 'is-selected': entry.id === modelValue, 'is-active': group.start + offset === active }"
                    :aria-selected="entry.id === modelValue"
                    :title="entry.icon.value.startsWith('data:') ? undefined : entry.icon.value"
                    :data-index="group.start + offset"
                    :disabled="disabled"
                    @click="emit('select', entry)"
                  >
                    <TxIcon :icon="entry.icon" :size="20" colorful />
                  </button>
                </div>
              </section>

              <p v-if="!groups.length" class="tx-icon-picker-panel__empty">
                {{ labels.empty }}
              </p>
            </div>
          </Transition>
        </div>
      </div>
    </template>

    <div v-if="shapeSelectable" class="tx-icon-picker-panel__shape-row">
      <div class="tx-icon-picker-panel__row">
        <span class="tx-icon-picker-panel__row-label">{{ labels.shape }}</span>
        <!-- Twelve outlines at this size are told apart by eye, not by name;
             the name of the one under the pointer is what confirms it. -->
        <span class="tx-icon-picker-panel__row-value">{{ shapeLabel(hoveredShape ?? shape) }}</span>
      </div>
      <TxFlatRadio
        class="tx-icon-picker-panel__shapes"
        size="md"
        :model-value="shape"
        :disabled="disabled"
        @update:model-value="handleShape"
        @mouseleave="hoveredShape = null"
      >
        <TxFlatRadioItem
          v-for="option in ICON_PICKER_SHAPES"
          :key="option"
          class="tx-icon-picker-panel__shape"
          :value="option"
          :aria-label="shapeLabel(option)"
          @mouseenter="hoveredShape = option"
        >
          <template #icon>
            <svg class="tx-icon-picker-panel__swatch" viewBox="-1.5 -1.5 27 27" aria-hidden="true">
              <path :d="ICON_PICKER_SHAPE_PATHS[option]" />
            </svg>
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
        :disabled="disabled"
        :loading="fileBusy"
        @click="openFilePicker"
      >
        <!-- Remix `folder-image-line`, drawn here so the action needs no icon collection -->
        <svg class="tx-icon-picker-panel__action-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5v14h16V7h-8.414l-2-2zm8.414 0H21a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.414zM10 10.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m8 6.5l-4-6l-7 6z" />
        </svg>
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

  // The sections are peers, so they split the bar evenly. Left to content
  // width, "Emoji" and "Brands" get different widths and the thumb resizes on
  // every switch — motion that encodes label length, not state.
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

// One fixed box for the shortcuts and the grid together. The shortcuts hide
// while searching, and a panel that shrank by their height on the first
// keystroke would drag the popover's bottom edge up under the pointer.
.tx-icon-picker-panel__browse {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 244px;
}

// As many columns as there are categories, splitting the width: thirteen
// categories get narrower shortcuts than three, and none of them wraps.
.tx-icon-picker-panel__jumps {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 2px;
  flex: none;
}

.tx-icon-picker-panel__jump {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-current {
    background: var(--tx-fill-color, #f0f2f5);
    color: var(--tx-color-primary, #409eff);
  }
}

// The viewport is the stable box the grids move inside. During a switch both
// the leaving and entering grid are mounted; without a positioned container
// they stack vertically and the panel — and the popover anchored to it —
// jumps to double height for the length of the transition.
.tx-icon-picker-panel__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

// Positioned, so a group's and a cell's `offsetTop` are measured from here:
// the shortcuts and the keyboard both scroll by them.
.tx-icon-picker-panel__scroller {
  position: relative;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.tx-icon-picker-panel__heading {
  padding: 8px 4px 4px;
  font-size: 11px;
  font-weight: var(--tx-font-weight-semibold, 600);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-icon-picker-panel__group:first-child .tx-icon-picker-panel__heading {
  padding-top: 2px;
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
}

// Only the outgoing grid is taken out of flow. Pulling *both* out would leave
// the viewport with no in-flow child to size against.
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
    box-shadow 0.24s cubic-bezier(0.32, 1.28, 0.5, 1),
    transform 0.24s cubic-bezier(0.32, 1.28, 0.5, 1);

  .tx-icon-picker-panel__scroller.is-morphing & {
    transition:
      background 0.15s ease,
      box-shadow 0.24s cubic-bezier(0.32, 1.28, 0.5, 1),
      transform 0.24s cubic-bezier(0.32, 1.28, 0.5, 1);
  }

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

  // The keyboard's cell. An outline rather than the selection's inset ring,
  // so a cell that is both reads as both.
  &.is-active {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: -2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

// The ring still fades in — the selected cell must stay identifiable. The
// spring travel and the press scale go, and the fill lands at once (the
// morph window that eases it stays shut under reduced motion).
@media (prefers-reduced-motion: reduce) {
  .tx-icon-picker-panel__cell {
    transition: box-shadow 0.15s ease;

    &:active:not(:disabled) {
      transform: none;
    }
  }
}

// Forced colours drop backgrounds and box shadows, and with them the selected
// cell and the current shortcut; the system's selection colours stand in. The
// keyboard's outline is kept, in a system colour, on top of either.
@media (forced-colors: active) {
  .tx-icon-picker-panel__cell.is-selected,
  .tx-icon-picker-panel__jump.is-current {
    forced-color-adjust: none;
    background: Highlight;
    color: HighlightText;
  }
}

.tx-icon-picker-panel__empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-icon-picker-panel__shape-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-icon-picker-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.tx-icon-picker-panel__row-label {
  color: var(--tx-text-color-secondary, #909399);
}

.tx-icon-picker-panel__row-value {
  color: var(--tx-text-color-regular, #606266);
}

// Same override shape as the tab bar: the wrapper class repeated to out-specify
// `.tx-flat-radio[data-v-hash]` without !important.
.tx-icon-picker-panel__shapes.tx-icon-picker-panel__shapes {
  display: flex;
  width: 100%;
  --tx-flat-radio-gap: 2px;
  --tx-flat-radio-item-padding: 0;

  // Twelve outlines share the row's width rather than each claiming a
  // padded cell, which would push the last few out of the popover.
  :deep(.tx-icon-picker-panel__shape) {
    flex: 1 1 0;
    min-width: 0;
  }
}

// A plate outline, drawn from the same path the trigger morphs to, so the
// row cannot preview a corner the plate does not have.
.tx-icon-picker-panel__swatch {
  width: 16px;
  height: 16px;
  overflow: visible;

  path {
    fill: transparent;
    stroke: currentColor;
    stroke-width: 1.5px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
}

.tx-icon-picker-panel__shape.is-selected .tx-icon-picker-panel__swatch path {
  fill: color-mix(in srgb, currentColor 18%, transparent);
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

.tx-icon-picker-panel__action-glyph {
  flex: none;
  width: 1em;
  height: 1em;
  fill: currentColor;
}

.tx-icon-picker-panel__file {
  display: none;
}
</style>

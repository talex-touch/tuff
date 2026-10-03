<script setup lang="ts">
import type { TuffContainerLayout, TuffItem, TuffSection } from '@talex-touch/utils'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { useElementSize } from '@vueuse/core'
import type { ComponentPublicInstance } from 'vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveI18nText } from '~/modules/lang/resolve-i18n-text'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { shortcutChordLabel } from '~/modules/shortcuts/shortcut-chord'
import {
  CORE_BOX_GRID_COMPACT_TILE_MIN_WIDTH,
  CORE_BOX_GRID_TILE_MIN_WIDTH,
  resolveBoxGridFitColumns,
  resolveVisibleBoxGridColumnCount
} from './box-grid-layout'
import BoxGridItem from './BoxGridItem.vue'
import BoxItem from './BoxItem.vue'

interface Props {
  items: TuffItem[]
  layout?: TuffContainerLayout
  focus: number
  /** Tiles drop their labels and keep the icon: the preview pane has squeezed the row to 40%. */
  compact?: boolean
  /**
   * Width the grid may use, when the parent knows it ahead of layout — the preview pane toggling
   * changes it in the same render, so the column count lands with the compact state instead of a
   * frame later from a resize observer. Measured here when absent or zero.
   */
  availableWidth?: number
  /**
   * Receives each rendered row or tile under its global index, so the keyboard's focus scroll
   * finds grid items the same way it finds list rows.
   */
  registerItem?: (el: Element | ComponentPublicInstance | null, index: number) => void
}

interface SectionData {
  section: TuffSection
  items: TuffItem[]
  startIndex: number
}

const props = defineProps<Props>()

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'select', index: number, item: TuffItem): void
  (e: 'update:visibleColumns', columns: number): void
}>()

const gridConfig = computed(() => ({
  columns: props.layout?.grid?.columns || 5,
  gap: props.layout?.grid?.gap || 8,
  itemSize: props.layout?.grid?.itemSize || 'medium'
}))

/**
 * Horizontal space a grid section does not get for tiles: the wrapper's 4px side margins and the
 * `.BoxGrid` 16px side padding, both defined in the styles below.
 */
const GRID_HORIZONTAL_INSET_PX = 2 * 4 + 2 * 16

const containerRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(containerRef)

/**
 * Columns that fit at the tile's minimum width, capped at what the layout declared. Tiles past
 * that wrap onto the next row instead of shrinking until a title is two letters and the badges
 * overlap. It is the one number both the CSS (`--grid-cols`) and, through `update:visibleColumns`,
 * the keyboard geometry use, so a wrapped row is still one row for ArrowDown. Unmeasured (0, before
 * the first layout) means the declared count.
 */
const visibleColumns = computed(() => {
  const width =
    props.availableWidth && props.availableWidth > 0 ? props.availableWidth : containerWidth.value
  return resolveBoxGridFitColumns(
    width - GRID_HORIZONTAL_INSET_PX,
    gridConfig.value.gap,
    props.compact ? CORE_BOX_GRID_COMPACT_TILE_MIN_WIDTH : CORE_BOX_GRID_TILE_MIN_WIDTH,
    gridConfig.value.columns
  )
})

watch(visibleColumns, (columns) => emit('update:visibleColumns', columns), { immediate: true })

/** Build sections with their items and global indices */
const sectionsData = computed<SectionData[]>(() => {
  const sections = props.layout?.sections
  if (!sections || sections.length === 0) {
    return []
  }

  const itemIdToItem = new Map(props.items.map((item) => [item.id, item]))
  const result: SectionData[] = []
  let currentIndex = 0

  for (const section of sections) {
    const sectionItems = section.itemIds
      .map((id) => itemIdToItem.get(id))
      .filter((item): item is TuffItem => !!item)

    if (sectionItems.length > 0) {
      result.push({
        section,
        items: sectionItems,
        startIndex: currentIndex
      })
      currentIndex += sectionItems.length
    }
  }

  return result
})

const hasSections = computed(() => sectionsData.value.length > 0)

// Guidance belongs to the recommendation surface, not the result pool or keyboard indices.
const showHabitualEmptyState = computed(
  () =>
    sectionsData.value.some(({ section }) => section.id === 'proposed') &&
    !sectionsData.value.some(({ section }) => section.id === 'habitual')
)

/**
 * The key the guidance teaches: it opens the action panel, whose "Pin to Recommendations" row the
 * guidance names. Labelled the way the panel labels its own toggle key, so it reads Ctrl+K off
 * macOS.
 */
const actionPanelKeyLabel = shortcutChordLabel(
  { code: 'KeyK' },
  getCurrentRendererPlatformState().isMac
)

function getQuickKey(index: number): string {
  if (index > 9) return ''
  const key = index === 9 ? 0 : index + 1
  return `⌘${key}`
}

/**
 * Sections declare their own layout; `grid` is the fallback because the empty state was two grids
 * before the tiered layout existed and `layout` is optional on TuffSection.
 */
function isListSection(section: TuffSection): boolean {
  return section.layout === 'list'
}

function isIntelligenceSection(section: TuffSection): boolean {
  return section.meta?.intelligence === true
}

function getSectionColumnCount(sectionData: SectionData): number {
  return resolveVisibleBoxGridColumnCount(
    sectionData.section,
    sectionData.items.length,
    visibleColumns.value
  )
}

/** Intelligence tray shows at most two rows: a full first row, then the rest. */
function getSectionVisibleItems(sectionData: SectionData): TuffItem[] {
  // List sections are already capped to RECOMMENDATION_SECTION_ITEM_LIMIT by the
  // main process; truncating again here would fight that budget.
  if (isListSection(sectionData.section)) return sectionData.items
  if (!isIntelligenceSection(sectionData.section)) return sectionData.items
  return sectionData.items.slice(0, getSectionColumnCount(sectionData) * 2)
}
</script>

<template>
  <!--
    `data-flip-key` / `data-flip` opt rows, tiles and titles into the FLIP CoreBox plays when the
    layout re-wraps (see modules/box/adapter/hooks/flip-layout.ts): tiles morph, rows and titles
    slide.
  -->
  <div ref="containerRef" class="BoxGridContainer">
    <section
      v-if="showHabitualEmptyState"
      class="BoxGridWrapper"
      :aria-label="t('coreBox.sections.habitual')"
    >
      <div class="BoxGridTitle" data-flip-key="title:habitual" data-flip="move">
        {{ t('coreBox.sections.habitual') }}
      </div>
      <!--
        Empty slots on the real grid's own tracks: the same `.BoxGrid` box, padding, column count
        and gap, so each slot sits where a habitual tile will land. Decoration only: hidden from
        assistive tech, never registered, no quick key, and no FLIP key, so it lands in place.
      -->
      <div
        class="BoxGrid BoxGridGhost p-4"
        :class="[`size-${gridConfig.itemSize}`, { 'is-compact': compact }]"
        :style="{
          '--grid-cols': visibleColumns,
          '--grid-gap': `${gridConfig.gap}px`
        }"
        aria-hidden="true"
      >
        <span v-for="column in visibleColumns" :key="column" class="BoxGridGhost-Tile">
          <span class="BoxGridGhost-Icon" />
          <span class="BoxGridGhost-Title"><span class="BoxGridGhost-Bar" /></span>
        </span>
      </div>
      <p class="BoxGridHabitualHint">
        <span class="BoxGridHabitualHint-Text">{{ t('coreBox.sections.habitualEmptyTitle') }}</span>
        <span class="BoxGridHabitualHint-Separator" aria-hidden="true">·</span>
        <span class="BoxGridHabitualHint-Action">
          <TxKbd>{{ actionPanelKeyLabel }}</TxKbd>
          <span>{{ t('corebox.actions.pin') }}</span>
        </span>
      </p>
    </section>
    <!-- Multiple sections mode -->
    <template v-if="hasSections">
      <div
        v-for="sectionData in sectionsData"
        :key="sectionData.section.id"
        class="BoxGridWrapper"
        :class="{ 'is-intelligence': isIntelligenceSection(sectionData.section) }"
      >
        <div
          v-if="sectionData.section.title"
          class="BoxGridTitle"
          :data-flip-key="`title:${sectionData.section.id}`"
          data-flip="move"
        >
          {{ resolveI18nText(sectionData.section.title, t) }}
        </div>
        <div v-if="isListSection(sectionData.section)" class="BoxGridList">
          <BoxItem
            v-for="(item, localIndex) in sectionData.items"
            :key="item.id"
            :ref="(el) => registerItem?.(el, sectionData.startIndex + localIndex)"
            :item="item"
            :active="focus === sectionData.startIndex + localIndex"
            :render="item.render"
            :quick-key="getQuickKey(sectionData.startIndex + localIndex)"
            :data-flip-key="item.id"
            data-flip="move"
            @click="emit('select', sectionData.startIndex + localIndex, item)"
          />
        </div>

        <div
          v-else
          class="BoxGrid p-4"
          :style="{
            '--grid-cols': getSectionColumnCount(sectionData),
            '--grid-gap': `${gridConfig.gap}px`
          }"
          :class="`size-${gridConfig.itemSize}`"
        >
          <BoxGridItem
            v-for="(item, localIndex) in getSectionVisibleItems(sectionData)"
            :key="item.id"
            :ref="(el) => registerItem?.(el, sectionData.startIndex + localIndex)"
            :item="item"
            :active="focus === sectionData.startIndex + localIndex"
            :render="item.render"
            :compact="compact"
            :quick-key="getQuickKey(sectionData.startIndex + localIndex)"
            :style="{ '--item-index': localIndex }"
            :data-flip-key="item.id"
            data-flip="scale"
            @click="emit('select', sectionData.startIndex + localIndex, item)"
          />
        </div>
      </div>
    </template>

    <!-- Single grid fallback (no sections) -->
    <div v-else class="BoxGridWrapper">
      <div
        class="BoxGrid p-4"
        :style="{
          '--grid-cols': visibleColumns,
          '--grid-gap': `${gridConfig.gap}px`
        }"
        :class="`size-${gridConfig.itemSize}`"
      >
        <BoxGridItem
          v-for="(item, index) in items"
          :key="item.id"
          :ref="(el) => registerItem?.(el, index)"
          :item="item"
          :active="focus === index"
          :render="item.render"
          :compact="compact"
          :quick-key="getQuickKey(index)"
          :style="{ '--item-index': index }"
          :data-flip-key="item.id"
          data-flip="scale"
          @click="emit('select', index, item)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.BoxGridContainer {
  width: 100%;
}

.BoxGridWrapper {
  width: calc(100% - 0.5rem);
  border-radius: 18px;
  position: relative;

  // Tight on purpose: BoxItem already carries its own 8px inset, so a 0.5rem wrapper margin put
  // list rows 16px from the edge and the section title 24px — visibly adrift from the design and
  // from each other.
  margin: 2px 4px;

  // Reason sections stack down the panel, so the animated tray border that
  // frames a single intelligence grid would repeat up to nine times. They carry
  // their own heading instead.
  &.is-list {
    margin: 0 0.5rem;
  }

  &.is-intelligence {
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 18px;
      padding: 0.125rem;
      background: linear-gradient(
        135deg,
        #ff6b6b 0%,
        #feca57 17%,
        #48dbfb 34%,
        #ff9ff3 51%,
        #54a0ff 68%,
        #5f27cd 85%,
        #ff6b6b 100%
      );
      background-size: 300% 300%;
      animation: rainbow-border 4s ease infinite;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
      opacity: 0.7;
    }
  }
}

@keyframes rainbow-border {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.BoxGridTitle {
  // 8px left lines the label up with BoxItem's own inset, so title and rows share one edge.
  padding: 4px 8px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-text-color-secondary);
  opacity: 0.7;
}

// A list section reuses BoxItem, which brings its own row padding, so the wrapper only stacks.
.BoxGridList {
  display: flex;
  flex-direction: column;
}

.BoxGrid {
  display: grid; // Keep result cards compact while distributing every column across the available row.
  grid-template-columns: repeat(var(--grid-cols), minmax(0, 108px));
  justify-content: space-between;
  gap: var(--grid-gap);
  overflow-x: hidden;
  width: 100%;

  &.size-small {
    --item-icon-size: 32px;
  }

  &.size-medium {
    --item-icon-size: 36px;
  }

  &.size-large {
    --item-icon-size: 48px;
  }
}

// Empty habitual slots: a BoxGridItem's box (16px radius, 8px inset, a 36px icon over an 11px
// label) as a dashed outline with two static fills. Static on purpose: this is guidance, not a
// loading state, so nothing here shimmers or animates.
.BoxGridGhost {
  // The two shades, tuned together in both themes. Tints of the ink rather than fill tokens:
  // CoreBox has no opaque surface (a 75% `--tx-fill-color` mask over the window material), and an
  // ink tint darkens the light theme and lightens the dark one over whatever shows through.
  --box-grid-ghost-line: color-mix(in srgb, var(--tx-text-color-primary) 16%, transparent);
  --box-grid-ghost-fill: color-mix(in srgb, var(--tx-text-color-primary) 5%, transparent);

  // The guidance below belongs to the slots, so it sits closer to them than to the next title.
  padding-bottom: 8px;
}

.BoxGridGhost-Tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.5rem;
  border: 1px dashed var(--box-grid-ghost-line);
  border-radius: 16px;
}

.BoxGridGhost-Icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--box-grid-ghost-fill);
}

// The real title's line box (11px at 1.2, 4px under the icon), so a slot is as tall as a tile
// without a badge.
.BoxGridGhost-Title {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 1lh;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.2;
}

.BoxGridGhost-Bar {
  width: 55%;
  height: 6px;
  border-radius: 3px;
  background: var(--box-grid-ghost-fill);
}

// A compact BoxGridItem's shape: the 6px inset, the icon scaled rather than resized, no label.
.BoxGridGhost.is-compact {
  .BoxGridGhost-Tile {
    padding: 6px;
  }

  .BoxGridGhost-Icon {
    transform: scale(0.78);
  }

  .BoxGridGhost-Title {
    display: none;
  }
}

// One line under the slots: what will appear there, then how to put something there now. The 16px
// side margins match the grid's own padding, so the line never runs past the slots.
.BoxGridHabitualHint {
  container: box-grid-habitual-hint / inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
  margin: 0 16px 12px;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  color: var(--tx-text-color-secondary);
}

.BoxGridHabitualHint-Separator {
  color: var(--tx-text-color-placeholder);
}

.BoxGridHabitualHint-Action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

// Too narrow for one line (the preview pane's 40% column, a narrow window): the two parts take a
// line each, centred, instead of wrapping with the separator dangling at a line end. 480px clears
// the longest line today (English with Ctrl+K, 428px measured in Chromium) and stays well under
// the full results column (680px). Longer copy still wraps rather than overflows: the line is a
// wrapping flex row.
@container box-grid-habitual-hint (max-width: 480px) {
  .BoxGridHabitualHint-Text {
    flex-basis: 100%;
  }

  .BoxGridHabitualHint-Separator {
    display: none;
  }
}
</style>

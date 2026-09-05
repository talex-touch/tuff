<script setup lang="ts">
import type { TuffContainerLayout, TuffItem, TuffSection } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveI18nText } from '~/modules/lang/resolve-i18n-text'
import { resolveBoxGridColumnCount } from './box-grid-layout'
import BoxGridItem from './BoxGridItem.vue'
import BoxItem from './BoxItem.vue'

interface Props {
  items: TuffItem[]
  layout?: TuffContainerLayout
  focus: number
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
}>()

const gridConfig = computed(() => ({
  columns: props.layout?.grid?.columns || 5,
  gap: props.layout?.grid?.gap || 8,
  itemSize: props.layout?.grid?.itemSize || 'medium'
}))

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
  return resolveBoxGridColumnCount(
    sectionData.section,
    sectionData.items.length,
    gridConfig.value.columns
  )
}

/** Intelligence tray shows at most two rows: a full first row, then the rest. */
function getSectionVisibleItems(sectionData: SectionData): TuffItem[] {
  if (!isIntelligenceSection(sectionData.section)) return sectionData.items
  return sectionData.items.slice(0, getSectionColumnCount(sectionData) * 2)
}
</script>

<template>
  <div class="BoxGridContainer">
    <!-- Multiple sections mode -->
    <template v-if="hasSections">
      <div
        v-for="sectionData in sectionsData"
        :key="sectionData.section.id"
        class="BoxGridWrapper"
        :class="{ 'is-intelligence': isIntelligenceSection(sectionData.section) }"
      >
        <div v-if="sectionData.section.title" class="BoxGridTitle">
          {{ resolveI18nText(sectionData.section.title, t) }}
        </div>
        <div v-if="isListSection(sectionData.section)" class="BoxGridList">
          <BoxItem
            v-for="(item, localIndex) in sectionData.items"
            :key="item.id"
            :item="item"
            :active="focus === sectionData.startIndex + localIndex"
            :render="item.render"
            :quick-key="getQuickKey(sectionData.startIndex + localIndex)"
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
            :item="item"
            :active="focus === sectionData.startIndex + localIndex"
            :render="item.render"
            :quick-key="getQuickKey(sectionData.startIndex + localIndex)"
            :style="{ '--item-index': localIndex }"
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
          '--grid-cols': gridConfig.columns,
          '--grid-gap': `${gridConfig.gap}px`
        }"
        :class="`size-${gridConfig.itemSize}`"
      >
        <BoxGridItem
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :active="focus === index"
          :render="item.render"
          :quick-key="getQuickKey(index)"
          :style="{ '--item-index': index }"
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
</style>

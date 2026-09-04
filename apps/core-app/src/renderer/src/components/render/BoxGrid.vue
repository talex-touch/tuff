<script setup lang="ts">
import type {
  RecommendationEvidence,
  RecommendationSource,
  TuffContainerLayout,
  TuffItem,
  TuffSection
} from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveBoxGridColumnCount } from './box-grid-layout'
import BoxGridItem from './BoxGridItem.vue'
import BoxItem from './BoxItem.vue'
import { formatRecommendationEvidence } from './recommendation-evidence'

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

function isIntelligenceSection(section: TuffSection): boolean {
  return section.meta?.intelligence === true
}

function isPinnedSection(section: TuffSection): boolean {
  return section.meta?.pinned === true
}

function isListSection(section: TuffSection): boolean {
  return section.layout === 'list'
}

/**
 * Section titles arrive from the main process as i18n keys (`corebox.reason.*`)
 * because the main process has no idea what language the user reads. Older
 * cached layouts still carry finished English literals like `Recommend`, which
 * have no dot and must be shown as-is rather than as a missing key.
 */
function getSectionTitle(section: TuffSection): string {
  const title = section.title
  if (!title) return ''
  return title.includes('.') ? t(title) : title
}

function getItemEvidence(section: TuffSection, item: TuffItem): string {
  const recommendation = item.meta?.recommendation
  if (!recommendation) return ''

  const source = (section.meta?.source ?? recommendation.source) as RecommendationSource | undefined
  return formatRecommendationEvidence(
    source,
    recommendation.evidence as RecommendationEvidence | undefined,
    t
  )
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
  // List sections are already capped to RECOMMENDATION_SECTION_ITEM_LIMIT by the
  // main process; truncating again here would fight that budget.
  if (isListSection(sectionData.section)) return sectionData.items
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
        :class="{
          'is-list': isListSection(sectionData.section),
          'is-intelligence':
            isIntelligenceSection(sectionData.section) && !isListSection(sectionData.section),
          'is-pinned': isPinnedSection(sectionData.section) && !isListSection(sectionData.section)
        }"
      >
        <div v-if="sectionData.section.title" class="BoxGridTitle">
          {{ getSectionTitle(sectionData.section) }}
        </div>

        <!-- Reason-grouped list: one row per item, with the reason it is here -->
        <div v-if="isListSection(sectionData.section)" class="BoxReasonList">
          <BoxItem
            v-for="(item, localIndex) in getSectionVisibleItems(sectionData)"
            :key="item.id"
            :item="item"
            :active="focus === sectionData.startIndex + localIndex"
            :render="item.render"
            :quick-key="getQuickKey(sectionData.startIndex + localIndex)"
            :evidence="getItemEvidence(sectionData.section, item)"
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
  width: calc(100% - 1rem);
  border-radius: 18px;
  position: relative;

  margin: 0.5rem;

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

  &.is-pinned {
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 18px;
      padding: 0.125rem;
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
      opacity: 0.5;
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
  padding: 8px 16px 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-text-color-secondary);
  opacity: 0.7;
}

.is-list > .BoxGridTitle {
  padding: 10px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  opacity: 0.6;
}

.BoxReasonList {
  display: flex;
  flex-direction: column;
}

.BoxGrid {
  display: grid;
  // Keep result cards compact while distributing every column across the available row.
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

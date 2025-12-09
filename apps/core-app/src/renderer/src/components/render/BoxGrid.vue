<script setup lang="ts">
import type { TuffContainerLayout, TuffItem, TuffSection } from '@talex-touch/utils'
import { computed } from 'vue'
import BoxGridItem from './BoxGridItem.vue'

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
</script>

<template>
  <!-- Multiple sections mode -->
  <template v-if="hasSections">
    <div
      v-for="sectionData in sectionsData"
      :key="sectionData.section.id"
      class="BoxGridWrapper"
      :class="{
        'is-intelligence': isIntelligenceSection(sectionData.section),
        'is-pinned': isPinnedSection(sectionData.section)
      }"
    >
      <div v-if="sectionData.section.title" class="BoxGridTitle">
        {{ sectionData.section.title }}
      </div>
      <div
        class="BoxGrid p-4"
        :style="{
          '--grid-cols': gridConfig.columns,
          '--grid-gap': gridConfig.gap + 'px'
        }"
        :class="`size-${gridConfig.itemSize}`"
      >
        <BoxGridItem
          v-for="(item, localIndex) in sectionData.items"
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
        '--grid-gap': gridConfig.gap + 'px'
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
</template>

<style scoped lang="scss">
.BoxGridWrapper {
  width: calc(100% - 1rem);
  border-radius: 18px;
  position: relative;

  margin: 0.5rem;

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
  color: var(--el-text-color-secondary);
  opacity: 0.7;
}

.BoxGrid {
  display: grid;
  // Use minmax to prevent items from stretching when fewer than columns
  grid-template-columns: repeat(var(--grid-cols), minmax(0, 108px));
  justify-content: start;
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

// Grid item staggered animation
:deep(.BoxGridItem) {
  animation: grid-item-in 0.32s cubic-bezier(0.22, 0.61, 0.36, 1);
  animation-fill-mode: both;
  animation-delay: calc(var(--item-index, 0) * 0.03s);
}

@keyframes grid-item-in {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(6px);
  }
  65% {
    opacity: 1;
    transform: scale(1.03) translateY(-1px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>

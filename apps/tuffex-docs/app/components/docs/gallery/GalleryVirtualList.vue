<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion } from './use-gallery-loop'

const props = defineProps<{
  title: string
  /** Formats the counter, e.g. `12 / 10,000 in the DOM`. */
  countLabel: (rendered: number, total: string) => string
  /** Plugin names in the page's language; the rows cycle through them. */
  names: Record<string, string>
}>()

const ROW_HEIGHT = 28
const VIEW_HEIGHT = 112
// TxVirtualList's default overscan; the counter's first reading has to match
// what the component renders before any scroll event arrives.
const OVERSCAN = 4

// Each row holds an index into the names rather than a name, so a language
// switch relabels the rows without rebuilding ten thousand of them.
const names = computed(() => Object.values(props.names))
const PLUGIN_COUNT = Object.keys(props.names).length

const rows = Array.from({ length: 10_000 }, (_, index) => ({
  id: index,
  plugin: index % PLUGIN_COUNT,
  version: `1.${Math.floor(index / PLUGIN_COUNT) % 10}.${index % PLUGIN_COUNT}`,
}))
const total = rows.length.toLocaleString('en-US')

const rendered = ref(Math.min(rows.length, Math.ceil(VIEW_HEIGHT / ROW_HEIGHT) + OVERSCAN))

function onScroll({ startIndex, endIndex }: { startIndex: number, endIndex: number }) {
  rendered.value = endIndex - startIndex
}

// Glides a stretch down the list once it has mounted: the row numbers race
// past while the counter holds at a dozen, which is the whole point of the
// component. A remount starts back at the top, so the reset button replays it.
const listRef = ref<ComponentPublicInstance | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (prefersReducedMotion())
    return
  timer = setTimeout(() => {
    const el = listRef.value?.$el as HTMLElement | undefined
    el?.scrollTo({ top: ROW_HEIGHT * 120, behavior: 'smooth' })
  }, 700)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__block docs-gallery__doc docs-gallery__vlist">
    <div class="docs-gallery__doc-bar">
      <span>{{ props.title }}</span>
      <span class="docs-gallery__vlist-count">{{ props.countLabel(rendered, total) }}</span>
    </div>
    <TxVirtualList
      ref="listRef"
      :items="rows"
      :item-height="ROW_HEIGHT"
      :height="VIEW_HEIGHT"
      item-key="id"
      @scroll="onScroll"
    >
      <template #item="{ item, index }">
        <div class="docs-gallery__vrow">
          <span class="docs-gallery__vrow-index">{{ index + 1 }}</span>
          <span class="docs-gallery__vrow-name">{{ names[item.plugin] }}</span>
          <span class="docs-gallery__vrow-meta">{{ item.version }}</span>
        </div>
      </template>
    </TxVirtualList>
  </div>
</template>

<script setup lang="ts">
import type { MarkdownEmoji } from './emoji'
import { nextTick, ref, watch } from 'vue'
import { markdownEmojiText } from './emoji'

// Internal: the `:shortcode` completion list of the rich surface. The surface
// keeps focus; the editor drives `active` from the arrow keys.
defineOptions({ name: 'TxMarkdownEditorEmojiSuggest' })

const props = defineProps<{
  items: MarkdownEmoji[]
  active: number
  label: string
}>()

const emit = defineEmits<{
  pick: [index: number]
  hover: [index: number]
}>()

const list = ref<HTMLElement | null>(null)

watch(() => props.active, async (active) => {
  await nextTick()
  list.value?.children[active]?.scrollIntoView?.({ block: 'nearest' })
})
</script>

<template>
  <ul
    ref="list"
    class="tx-markdown-editor-suggest"
    role="listbox"
    :aria-label="label"
    @mousedown.prevent
  >
    <li
      v-for="(item, position) in items"
      :key="markdownEmojiText(item)"
      class="tx-markdown-editor-suggest__item"
      :class="{ 'is-active': position === active }"
      role="option"
      :aria-selected="position === active"
      @mousemove="position !== active && emit('hover', position)"
      @click="emit('pick', position)"
    >
      <img
        v-if="item.src"
        class="tx-markdown-editor-suggest__glyph is-image"
        :src="item.src"
        alt=""
      >
      <span v-else class="tx-markdown-editor-suggest__glyph">{{ item.char }}</span>
      <span class="tx-markdown-editor-suggest__name">:{{ item.name }}:</span>
    </li>
  </ul>
</template>

<style lang="scss">
.tx-markdown-editor-suggest {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 200px;
  max-height: 236px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  color: var(--tx-markdown-editor-text);
  font-size: 13px;
}

.tx-markdown-editor-suggest__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  cursor: pointer;

  &.is-active {
    background: color-mix(in srgb, var(--tx-markdown-editor-accent) 14%, transparent);
  }
}

.tx-markdown-editor-suggest__glyph {
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  font-size: 17px;
  line-height: 1;
}

.tx-markdown-editor-suggest__glyph.is-image {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.tx-markdown-editor-suggest__name {
  overflow: hidden;
  color: var(--tx-markdown-editor-muted);
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-markdown-editor-suggest__item.is-active .tx-markdown-editor-suggest__name {
  color: var(--tx-markdown-editor-text);
}
</style>

<script setup lang="ts">
import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { MarkdownEmoji, MarkdownEmojiIndex } from './emoji'
import type { MarkdownEmojiCategory } from './emoji-data'
import type { MarkdownEditorLabels } from './types'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { TxIcon } from '../../icon'
import { composeMarkdownEmoji, loadMarkdownEmoji, markdownEmojiText, peekMarkdownEmoji, recentMarkdownEmoji, searchMarkdownEmoji } from './emoji'
import { focusWhenShown } from './focus-when-shown'
import { MARKDOWN_EDITOR_UI_ICONS } from './toolbar-icons'

// Internal: the emoji panel behind the toolbar's emoji button.
defineOptions({ name: 'TxMarkdownEditorEmojiPicker' })

const props = defineProps<{
  labels: MarkdownEditorLabels
  packs?: readonly TxEmojiPack[]
}>()

const emit = defineEmits<{
  pick: [emoji: MarkdownEmoji]
}>()

type Tab = 'recent' | MarkdownEmojiCategory | `pack:${string}`

const COLUMNS = 8

const CATEGORY_LABELS: Record<MarkdownEmojiCategory, keyof MarkdownEditorLabels> = {
  people: 'emojiPeople',
  nature: 'emojiNature',
  food: 'emojiFood',
  activity: 'emojiActivity',
  travel: 'emojiTravel',
  objects: 'emojiObjects',
  symbols: 'emojiSymbols',
  flags: 'emojiFlags',
}

const base = shallowRef<MarkdownEmojiIndex | null>(peekMarkdownEmoji())
const index = computed(() => (base.value ? composeMarkdownEmoji(base.value, props.packs) : null))
const query = ref('')
const tab = ref<Tab>('people')
const focused = ref(0)
const search = ref<HTMLInputElement | null>(null)
const grid = ref<HTMLElement | null>(null)

const recent = computed(() => (index.value ? recentMarkdownEmoji(index.value) : []))

const tabs = computed(() => {
  const loaded = index.value
  if (!loaded)
    return []
  return [
    ...(recent.value.length ? [{ key: 'recent' as Tab, label: props.labels.emojiRecent, glyph: '', src: undefined }] : []),
    ...loaded.packs.map(pack => ({ key: pack.key as Tab, label: pack.label, glyph: '', src: pack.items[0]?.src })),
    ...loaded.categories.map(category => ({
      key: category.key as Tab,
      label: props.labels[CATEGORY_LABELS[category.key]],
      glyph: category.items[0]?.char ?? '',
      src: undefined,
    })),
  ]
})

const items = computed<MarkdownEmoji[]>(() => {
  const loaded = index.value
  if (!loaded)
    return []
  if (query.value.trim())
    return searchMarkdownEmoji(loaded, query.value, 120)
  if (tab.value === 'recent')
    return recent.value
  const pack = loaded.packs.find(entry => entry.key === tab.value)
  if (pack)
    return pack.items
  return loaded.categories.find(category => category.key === tab.value)?.items ?? []
})

const current = computed(() => items.value[focused.value] ?? items.value[0] ?? null)

watch(items, () => {
  focused.value = 0
  grid.value?.scrollTo?.({ top: 0 })
})

onMounted(async () => {
  focusWhenShown(() => search.value)
  base.value ??= await loadMarkdownEmoji()
  if (recent.value.length)
    tab.value = 'recent'
  else if (index.value?.packs[0])
    tab.value = index.value.packs[0].key as Tab
})

function cells(): HTMLButtonElement[] {
  return Array.from(grid.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
}

async function focusCell(target: number): Promise<void> {
  const list = cells()
  if (!list.length)
    return
  focused.value = Math.max(0, Math.min(list.length - 1, target))
  await nextTick()
  list[focused.value]?.focus()
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.isComposing)
    return
  if (event.key === 'Enter') {
    event.preventDefault()
    if (items.value[0])
      emit('pick', items.value[0])
  }
  else if (event.key === 'ArrowDown') {
    event.preventDefault()
    void focusCell(0)
  }
}

function onGridKeydown(event: KeyboardEvent): void {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }
  const at = cells().indexOf(event.target as HTMLButtonElement)
  if (at < 0)
    return
  if (event.key in step) {
    event.preventDefault()
    if (event.key === 'ArrowUp' && at < COLUMNS)
      search.value?.focus()
    else
      void focusCell(at + step[event.key]!)
  }
  else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    void focusCell(event.key === 'Home' ? 0 : items.value.length - 1)
  }
}
</script>

<template>
  <div class="tx-markdown-editor-emoji" role="dialog" :aria-label="labels.emoji">
    <input
      ref="search"
      v-model="query"
      class="tx-markdown-editor-emoji__search"
      type="search"
      :placeholder="labels.emojiSearch"
      :aria-label="labels.emojiSearch"
      autocomplete="off"
      spellcheck="false"
      @keydown="onSearchKeydown"
    >

    <div v-if="!query.trim() && tabs.length" class="tx-markdown-editor-emoji__tabs" role="group">
      <button
        v-for="item in tabs"
        :key="item.key"
        type="button"
        class="tx-markdown-editor-emoji__tab"
        :class="{ 'is-active': tab === item.key }"
        :aria-label="item.label"
        :aria-pressed="tab === item.key"
        :title="item.label"
        @click="tab = item.key"
      >
        <TxIcon v-if="item.key === 'recent'" :name="MARKDOWN_EDITOR_UI_ICONS.recent" :size="15" />
        <img v-else-if="item.src" class="tx-markdown-editor-emoji__image is-tab" :src="item.src" alt="">
        <span v-else class="tx-markdown-editor-emoji__glyph">{{ item.glyph }}</span>
      </button>
    </div>

    <div ref="grid" class="tx-markdown-editor-emoji__grid" @keydown="onGridKeydown">
      <button
        v-for="(item, position) in items"
        :key="markdownEmojiText(item)"
        type="button"
        class="tx-markdown-editor-emoji__cell"
        :aria-label="item.name.replace(/_/g, ' ')"
        :title="`:${item.name}:`"
        :tabindex="position === focused ? 0 : -1"
        @focus="focused = position"
        @mouseenter="focused = position"
        @click="emit('pick', item)"
      >
        <img v-if="item.src" class="tx-markdown-editor-emoji__image" :src="item.src" alt="">
        <span v-else>{{ item.char }}</span>
      </button>
      <p v-if="index && !items.length" class="tx-markdown-editor-emoji__empty">
        {{ labels.emojiEmpty }}
      </p>
    </div>

    <div class="tx-markdown-editor-emoji__footer" aria-hidden="true">
      <template v-if="current">
        <img v-if="current.src" class="tx-markdown-editor-emoji__image is-large" :src="current.src" alt="">
        <span v-else class="tx-markdown-editor-emoji__glyph is-large">{{ current.char }}</span>
        <code>:{{ current.name }}:</code>
      </template>
    </div>
  </div>
</template>

<style lang="scss">
.tx-markdown-editor-emoji {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  color: var(--tx-markdown-editor-text);
  font-size: 13px;
}

.tx-markdown-editor-emoji__search {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  outline: 0;
  background: var(--tx-markdown-editor-field-bg);
  box-shadow: inset 0 0 0 1px var(--tx-markdown-editor-border);
  color: inherit;
  font: inherit;

  &::placeholder {
    color: var(--tx-markdown-editor-placeholder);
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 1px var(--tx-markdown-editor-accent), 0 0 0 3px color-mix(in srgb, var(--tx-markdown-editor-accent) 18%, transparent);
  }
}

.tx-markdown-editor-emoji__tabs {
  display: flex;
  justify-content: space-between;
  gap: 2px;
}

.tx-markdown-editor-emoji__tab {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-markdown-editor-muted);
  cursor: pointer;
  filter: grayscale(0.85);
  opacity: 0.72;

  &:hover {
    background: color-mix(in srgb, var(--tx-markdown-editor-text) 7%, transparent);
  }

  &.is-active {
    background: color-mix(in srgb, var(--tx-markdown-editor-accent) 14%, transparent);
    color: var(--tx-markdown-editor-accent);
    filter: none;
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tx-markdown-editor-accent) 55%, transparent);
    outline-offset: 1px;
  }
}

.tx-markdown-editor-emoji__glyph,
.tx-markdown-editor-emoji__cell {
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.tx-markdown-editor-emoji__glyph {
  font-size: 15px;
  line-height: 1;

  &.is-large {
    font-size: 20px;
  }
}

.tx-markdown-editor-emoji__image {
  display: block;
  width: 24px;
  height: 24px;
  object-fit: contain;
  pointer-events: none;

  &.is-tab {
    width: 16px;
    height: 16px;
  }

  &.is-large {
    width: 22px;
    height: 22px;
  }
}

.tx-markdown-editor-emoji__grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  align-content: start;
  height: 216px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.tx-markdown-editor-emoji__cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    outline: 0;
    background: color-mix(in srgb, var(--tx-markdown-editor-accent) 14%, transparent);
  }
}

.tx-markdown-editor-emoji__empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 32px 0;
  color: var(--tx-markdown-editor-muted);
  text-align: center;
}

.tx-markdown-editor-emoji__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 4px;
  border-top: 1px solid var(--tx-markdown-editor-border);
  color: var(--tx-markdown-editor-muted);

  code {
    overflow: hidden;
    font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>

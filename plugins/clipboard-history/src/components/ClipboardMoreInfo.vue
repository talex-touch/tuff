<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed, nextTick, ref, watch } from 'vue'
import {
  CLIPBOARD_NOTE_MAX_LENGTH,
  CLIPBOARD_TAG_MAX_LENGTH,
  CLIPBOARD_TAGS_MAX_COUNT,
  normalizeClipboardNote,
  normalizeClipboardTags,
} from '@talex-touch/utils/clipboard'
import ClipboardGlyph from './ClipboardGlyph.vue'
import {
  getClipboardColorTokens,
  getClipboardRetentionLabel,
  getClipboardSourceInfo,
  getClipboardTextInsight,
  inferClipboardMime,
} from '~/utils/clipboard-items'
import { detectSecret } from '~/utils/clipboard-shapes'
import { useDisclosureState } from '~/utils/use-disclosure-state'

const props = defineProps<{
  item: PluginClipboardItem | null
  palette?: string[]
}>()

const emit = defineEmits<{
  (event: 'copyText', value: string): void
  (event: 'annotate', payload: { note?: string | null; tags?: string[] }): void
}>()

const expanded = useDisclosureState('moreInfoExpanded')

const noteDraft = ref('')
const tagDraft = ref('')
const tagInput = ref<HTMLInputElement | null>(null)

const savedNote = computed(() => props.item?.note ?? '')
const tags = computed(() => props.item?.userTags ?? [])
const tagsFull = computed(() => tags.value.length >= CLIPBOARD_TAGS_MAX_COUNT)

// 切换记录时把草稿丢掉。留着上一条的半句备注，下一次失焦就会把它写到别的记录上。
watch(
  () => props.item?.id,
  () => {
    noteDraft.value = savedNote.value
    tagDraft.value = ''
  },
  { immediate: true },
)

// 主进程会裁剪、去重、截断，返回的才是真正入库的东西；这里跟着回写，
// 否则输入框会一直显示一段数据库里并不存在的文字。
watch(savedNote, value => {
  noteDraft.value = value
})

function commitNote(): void {
  const next = normalizeClipboardNote(noteDraft.value)
  // 归一化之后和已存的一样就什么都不做：每次失焦都发一次写请求会让 change 流空转。
  if ((next ?? '') === savedNote.value) {
    noteDraft.value = savedNote.value
    return
  }
  emit('annotate', { note: next })
}

function addTag(): void {
  const [tag] = normalizeClipboardTags([tagDraft.value])
  if (!tag) {
    tagDraft.value = ''
    return
  }
  if (tags.value.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
    tagDraft.value = ''
    return
  }
  if (tagsFull.value) {
    return
  }

  emit('annotate', { tags: [...tags.value, tag] })
  tagDraft.value = ''
}

function removeTag(tag: string): void {
  emit('annotate', { tags: tags.value.filter(existing => existing !== tag) })
}

/** 输入框空着时退格删掉最后一个标签，和常见的标签输入控件一致。 */
function handleTagBackspace(): void {
  if (tagDraft.value.length > 0 || tags.value.length === 0) {
    return
  }
  removeTag(tags.value[tags.value.length - 1]!)
}

async function focusTagInput(): Promise<void> {
  expanded.value = true
  await nextTick()
  tagInput.value?.focus()
}

defineExpose({ focusTagInput })

interface DetailRow {
  label: string
  value: string
}

function readMetaString(item: PluginClipboardItem, ...keys: string[]): string | null {
  const meta = (item.meta ?? {}) as Record<string, unknown>
  for (const key of keys) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function formatFullTimestamp(item: PluginClipboardItem): string | null {
  const raw = item.timestamp
  const time =
    typeof raw === 'number' ? raw : raw instanceof Date ? raw.getTime() : raw ? Date.parse(raw) : Number.NaN
  if (!Number.isFinite(time)) {
    return null
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time)
}

const rows = computed<DetailRow[]>(() => {
  const item = props.item
  if (!item) {
    return []
  }

  const source = getClipboardSourceInfo(item)
  const originalUrl = item.type === 'image' ? readMetaString(item, 'image_original_url', 'imageOriginalUrl') : null
  const fullTime = formatFullTimestamp(item)
  const retention = getClipboardRetentionLabel(item)

  return [
    // 摘要条里的 MIME 是缩写（x-tuff-files），这里给全称。
    { label: 'MIME', value: inferClipboardMime(item) },
    source.bundleId ? { label: 'Bundle ID', value: source.bundleId } : null,
    fullTime ? { label: '记录时间', value: fullTime } : null,
    retention ? { label: '自动删除', value: retention } : null,
    typeof item.id === 'number' ? { label: '记录 ID', value: `#${item.id}` } : null,
    originalUrl ? { label: '原图路径', value: originalUrl } : null,
  ].filter((row): row is DetailRow => row !== null)
})

const fullPalette = computed(() => {
  const fromImage = props.palette ?? []
  if (fromImage.length > 0) {
    return fromImage
  }
  return getClipboardColorTokens(props.item).map(token => token.label)
})

/**
 * 密钥不给拆词：把一个 API key 拆开渲染成可点按钮，等于把掩码拼回原文，
 * 而拆一个 key 本来就没有任何使用价值。summary 由实际渲染的分区名拼成，
 * 所以这里返回 null 之后摘要行也不会再宣传它。
 */
const textInsight = computed(() =>
  detectSecret(props.item?.content) ? null : getClipboardTextInsight(props.item),
)

/**
 * 摘要由实际会渲染出来的分区名拼，而不是按类型写死四套文案——
 * 否则会出现「摘要说有原图路径、展开却没有」的空头支票。
 */
const summary = computed(() => {
  const names = rows.value.map(row => row.label)
  // 备注和标签放在最前：它们是这条记录上唯一由人写的东西，收起时也该看得见有没有。
  if (savedNote.value || tags.value.length > 0) {
    names.unshift(tags.value.length > 0 ? `标注 · ${tags.value.length} 标签` : '标注')
  }
  if (fullPalette.value.length > 0) {
    names.push('完整调色板')
  }
  if ((textInsight.value?.wordTokens.length ?? 0) > 0) {
    names.push('拆词')
  }
  return names.join(' · ')
})
</script>

<template>
  <div v-if="item && summary" class="more-info">
    <button
      class="more-toggle"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <ClipboardGlyph class="more-caret" :class="{ open: expanded }" name="chevron" />
      <span class="more-title">更多信息</span>
      <span class="more-summary">{{ summary }}</span>
    </button>

    <div v-if="expanded" class="more-body">
      <div v-for="row in rows" :key="row.label" class="more-row">
        <span class="more-label">{{ row.label }}</span>
        <button
          class="more-value"
          type="button"
          :title="`复制 ${row.label}`"
          @click="emit('copyText', row.value)"
        >
          {{ row.value }}
        </button>
      </div>

      <div class="more-block annotate-block">
        <span class="more-block-title">标注</span>

        <input
          v-model="noteDraft"
          class="note-input"
          type="text"
          :maxlength="CLIPBOARD_NOTE_MAX_LENGTH"
          placeholder="写点备注，比如这个 key 属于哪个项目"
          @keydown.enter.prevent="commitNote"
          @keydown.esc.prevent.stop="noteDraft = savedNote"
          @blur="commitNote"
        >

        <div class="tag-row">
          <button
            v-for="tag in tags"
            :key="tag"
            class="tag-chip"
            type="button"
            :title="`移除标签 ${tag}`"
            @click="removeTag(tag)"
          >
            {{ tag }}
            <ClipboardGlyph class="tag-remove" name="close" />
          </button>

          <input
            ref="tagInput"
            v-model="tagDraft"
            class="tag-input"
            type="text"
            :maxlength="CLIPBOARD_TAG_MAX_LENGTH"
            :disabled="tagsFull"
            :placeholder="tagsFull ? `最多 ${CLIPBOARD_TAGS_MAX_COUNT} 个标签` : '加标签，回车确认'"
            @keydown.enter.prevent="addTag"
            @keydown.delete="handleTagBackspace"
            @blur="addTag"
          >
        </div>
      </div>

      <div v-if="fullPalette.length > 0" class="more-block">
        <span class="more-block-title">完整调色板</span>
        <div class="more-palette">
          <button
            v-for="color in fullPalette"
            :key="color"
            class="more-swatch"
            type="button"
            :style="{ backgroundColor: color }"
            :title="`复制 ${color}`"
            @click="emit('copyText', color)"
          />
        </div>
      </div>

      <div v-if="textInsight && textInsight.wordTokens.length > 0" class="more-block">
        <span class="more-block-title">
          拆词
          <!-- getClipboardTextInsight 把词截到 40 个，所以标注写实际 / 总数，不假装是全部。 -->
          <small>{{ textInsight.wordTokens.length }} / {{ textInsight.wordCount }}</small>
        </span>
        <div class="more-chars">
          <button
            v-for="word in textInsight.wordTokens"
            :key="word"
            class="more-char"
            type="button"
            :title="`复制 ${word}`"
            @click="emit('copyText', word)"
          >
            {{ word }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.more-info {
  margin-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--clipboard-border-color) 45%, transparent);
}

.more-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border: 0;
  background: transparent;
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  text-align: left;
}

.more-toggle:hover {
  background: color-mix(in srgb, var(--clipboard-surface-strong) 60%, transparent);
}

.more-caret {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--clipboard-text-muted);
  transform: rotate(-90deg);
  transition: transform 0.15s ease;
}

.more-caret.open {
  transform: rotate(0deg);
}

.more-title {
  flex: none;
  color: var(--clipboard-text-primary);
  font-size: 0.76rem;
  font-weight: 600;
}

.more-summary {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--clipboard-text-muted);
  font-size: 0.68rem;
}

.more-body {
  display: grid;
  gap: 8px;
  padding: 0 14px 12px;
}

.more-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.more-label {
  width: 76px;
  flex: none;
  color: var(--clipboard-text-muted);
  font-size: 0.72rem;
}

.more-value {
  min-width: 0;
  flex: 1 1 auto;
  height: 26px;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  text-align: left;
}

.more-value:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
}

.more-block {
  display: grid;
  gap: 6px;
}

/* 标注是唯一可写的区块，用一条上分隔线把它和上面只读的键值行分开。 */
.annotate-block {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--clipboard-border-color) 40%, transparent);
}

.note-input {
  width: 100%;
  height: 28px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 60%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-primary);
  font-size: 0.74rem;
}

.note-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 60%, transparent);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--clipboard-color-accent) 40%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 12%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
  font-size: 0.7rem;
}

.tag-chip:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 70%, transparent);
}

.tag-remove {
  width: 9px;
  height: 9px;
  color: var(--clipboard-text-muted);
}

.tag-input {
  min-width: 116px;
  flex: 1 1 116px;
  height: 22px;
  padding: 0 8px;
  border: 1px dashed color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--clipboard-text-primary);
  font-size: 0.7rem;
}

.tag-input:focus {
  outline: none;
  border-style: solid;
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 60%, transparent);
}

.tag-input:disabled {
  cursor: not-allowed;
  color: var(--clipboard-text-muted);
}

.more-block-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--clipboard-text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
}

.more-block-title small {
  color: var(--clipboard-text-muted);
  font-size: 0.66rem;
  font-weight: 400;
}

.more-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.more-swatch {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  cursor: pointer;
  padding: 0;
}

.more-chars {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.more-char {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 20px;
}

.more-char:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
}
</style>

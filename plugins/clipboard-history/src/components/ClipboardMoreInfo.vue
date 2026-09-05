<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed } from 'vue'
import ClipboardGlyph from './ClipboardGlyph.vue'
import {
  getClipboardColorTokens,
  getClipboardSourceInfo,
  getClipboardTextInsight,
  inferClipboardMime,
} from '~/utils/clipboard-items'
import { useDisclosureState } from '~/utils/use-disclosure-state'

const props = defineProps<{
  item: PluginClipboardItem | null
  palette?: string[]
}>()

const emit = defineEmits<{
  (event: 'copyText', value: string): void
}>()

const expanded = useDisclosureState('moreInfoExpanded')

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

  return [
    // 摘要条里的 MIME 是缩写（x-tuff-files），这里给全称。
    { label: 'MIME', value: inferClipboardMime(item) },
    source.bundleId ? { label: 'Bundle ID', value: source.bundleId } : null,
    fullTime ? { label: '记录时间', value: fullTime } : null,
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

const textInsight = computed(() => getClipboardTextInsight(props.item))

/**
 * 摘要由实际会渲染出来的分区名拼，而不是按类型写死四套文案——
 * 否则会出现「摘要说有原图路径、展开却没有」的空头支票。
 */
const summary = computed(() => {
  const names = rows.value.map(row => row.label)
  if (fullPalette.value.length > 0) {
    names.push('完整调色板')
  }
  if ((textInsight.value?.characterTokens.length ?? 0) > 0) {
    names.push('字符拆分')
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

      <div v-if="textInsight && textInsight.characterTokens.length > 0" class="more-block">
        <span class="more-block-title">
          字符拆分
          <!-- getClipboardTextInsight 把字符截到 80 个，所以标注写实际 / 总数，不假装是全部。 -->
          <small>{{ textInsight.characterTokens.length }} / {{ textInsight.characterCount }}</small>
        </span>
        <div class="more-chars">
          <button
            v-for="(char, index) in textInsight.characterTokens"
            :key="`${char}-${index}`"
            class="more-char"
            type="button"
            :title="`复制 ${char}`"
            @click="emit('copyText', char)"
          >
            {{ char }}
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

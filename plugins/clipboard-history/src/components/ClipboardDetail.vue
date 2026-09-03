<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import type { ResolvedApplication } from '@talex-touch/utils/transport/events/types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ClipboardGlyph from './ClipboardGlyph.vue'
import {
  getClipboardColorTokens,
  getClipboardInfoRows,
  getClipboardOcrInsight,
  getClipboardTagLabels,
  getClipboardTextInsight,
  getClipboardTitle,
  getClipboardTypeLabel,
  parseFileList,
  resolveDetailImagePreview,
  resolveListImageSrc,
} from '~/utils/clipboard-items'

const props = defineProps<{
  item: PluginClipboardItem | null
  resolvedImageUrl?: string | null
  resolvingImageUrl?: boolean
  sourceApplication?: ResolvedApplication | null
}>()

const emit = defineEmits<{
  (event: 'copyText', value: string): void
}>()

const textInsight = computed(() => getClipboardTextInsight(props.item))
const colorTokens = computed(() => getClipboardColorTokens(props.item))
const ocrInsight = computed(() => getClipboardOcrInsight(props.item))
const tagLabels = computed(() => (props.item ? getClipboardTagLabels(props.item) : []))
const failedImageSources = ref<ReadonlySet<string>>(new Set())
const retriedImageSources = ref<ReadonlySet<string>>(new Set())
const imageRetryNonce = ref(0)
let imageRetryTimer: ReturnType<typeof setTimeout> | null = null

const imagePreview = computed(() => {
  const primary = resolveDetailImagePreview(props.item, props.resolvedImageUrl)
  if (!primary.src || !failedImageSources.value.has(primary.src)) {
    return primary
  }

  const fallback = resolveListImageSrc(props.item)
  return {
    src: fallback && !failedImageSources.value.has(fallback) ? fallback : null,
    isThumbnailOnly: Boolean(fallback),
  }
})

function resetImageFailureState(): void {
  if (imageRetryTimer) {
    clearTimeout(imageRetryTimer)
    imageRetryTimer = null
  }
  failedImageSources.value = new Set()
  retriedImageSources.value = new Set()
  imageRetryNonce.value += 1
}

watch([() => props.item?.id, () => props.resolvedImageUrl], resetImageFailureState)

onBeforeUnmount(() => {
  if (imageRetryTimer) {
    clearTimeout(imageRetryTimer)
  }
})

function handleImageError(): void {
  const failedPreview = imagePreview.value
  const failedSource = failedPreview.src
  if (!failedSource) return

  failedImageSources.value = new Set([...failedImageSources.value, failedSource])
  if (failedPreview.isThumbnailOnly || retriedImageSources.value.has(failedSource)) {
    return
  }

  retriedImageSources.value = new Set([...retriedImageSources.value, failedSource])
  imageRetryTimer = setTimeout(() => {
    failedImageSources.value = new Set(
      [...failedImageSources.value].filter(source => source !== failedSource),
    )
    imageRetryNonce.value += 1
    imageRetryTimer = null
  }, 160)
}

function handleSourceIconError(event: Event): void {
  if (event.currentTarget instanceof HTMLImageElement) {
    event.currentTarget.hidden = true
  }
}
</script>

<template>
  <section class="clipboard-detail">
    <div class="preview-surface" :class="{ empty: !item }">
      <template v-if="!item">
        <div class="list-empty">
          <div class="empty-icon">
            <ClipboardGlyph name="arrow-left" />
          </div>
          <p>在左侧选择一条剪贴记录以查看详情</p>
        </div>
      </template>

      <template v-else-if="item.type === 'image' && imagePreview.src">
        <div class="image-container">
          <img
            :key="imageRetryNonce"
            :src="imagePreview.src || undefined"
            :alt="getClipboardTitle(item)"
            class="preview-img"
            :class="{ thumbnail: imagePreview.isThumbnailOnly }"
            @error="handleImageError"
          >
          <span v-if="imagePreview.isThumbnailOnly" class="preview-badge">缩略图预览</span>
        </div>
      </template>

      <template v-else-if="item?.type === 'image'">
        <div class="detail-empty-preview">
          {{ resolvingImageUrl ? '正在解析原图地址…' : '当前图片没有可用预览地址。' }}
        </div>
      </template>

      <template v-else-if="item?.type === 'text'">
        <pre class="code-preview text-preview">{{ item.content }}</pre>
      </template>

      <template v-else>
        <ul class="file-list">
          <li v-for="file in parseFileList(item?.content)" :key="file">
            {{ file }}
          </li>
        </ul>
      </template>
    </div>

    <div v-if="item" class="info-surface">
      <div class="detail-heading">
        <p class="eyebrow">
          {{ getClipboardTypeLabel(item) }}
        </p>
        <h2>{{ getClipboardTitle(item) }}</h2>
      </div>

      <div v-if="tagLabels.length > 0" class="credential-tags" aria-label="内容标签">
        <span v-for="label in tagLabels" :key="label" class="credential-tag">{{ label }}</span>
      </div>

      <div class="info-grid">
        <div v-for="row in getClipboardInfoRows(item, sourceApplication)" :key="row.label" class="info-row">
          <span class="info-label">{{ row.label }}</span>
          <span class="info-value" :class="{ 'with-icon': row.icon }">
            <img v-if="row.icon" class="source-app-icon" :src="row.icon" alt="" @error="handleSourceIconError">
            <span class="info-value-copy">
              <span>{{ row.value }}</span>
              <small v-if="row.secondaryValue" class="info-secondary">{{ row.secondaryValue }}</small>
            </span>
          </span>
        </div>
      </div>

      <div v-if="textInsight" class="insight-section">
        <div class="insight-title">
          <span>拆词</span>
          <span class="insight-meta">
            {{ textInsight.characterCount }} 字符 · {{ textInsight.wordCount }} 词 · {{ textInsight.lineCount }} 行
          </span>
        </div>
        <div v-if="textInsight.wordTokens.length > 0" class="word-row">
          <button
            v-for="word in textInsight.wordTokens"
            :key="word"
            class="word-chip"
            type="button"
            :title="`复制 ${word}`"
            @click="emit('copyText', word)"
          >
            {{ word }}
          </button>
        </div>
        <div class="character-grid" :class="{ empty: textInsight.characterTokens.length === 0 }">
          <button
            v-for="(char, index) in textInsight.characterTokens"
            :key="`${char}-${index}`"
            class="character-chip"
            type="button"
            :title="`复制 ${char}`"
            @click="emit('copyText', char)"
          >
            {{ char }}
          </button>
          <span v-if="textInsight.characterTokens.length === 0" class="insight-empty">无可拆分字符</span>
        </div>
      </div>

      <div v-if="colorTokens.length > 0" class="insight-section">
        <div class="insight-title">
          <span>颜色</span>
          <span class="insight-meta">{{ colorTokens.length }} 个</span>
        </div>
        <div class="color-grid">
          <button
            v-for="color in colorTokens"
            :key="color.value"
            class="color-chip"
            type="button"
            :title="color.label"
            @click="emit('copyText', color.label)"
          >
            <span class="color-swatch" :style="{ backgroundColor: color.value }" />
            <span class="color-label">{{ color.label }}</span>
          </button>
        </div>
      </div>

      <div v-if="ocrInsight" class="insight-section">
        <div class="insight-title">
          <span>OCR</span>
          <span class="insight-meta">
            {{ ocrInsight.statusLabel }}
            <template v-if="ocrInsight.language"> · {{ ocrInsight.language }}</template>
            <template v-if="ocrInsight.confidence"> · {{ ocrInsight.confidence }}</template>
          </span>
        </div>
        <button
          v-if="ocrInsight.displayText"
          class="ocr-text"
          type="button"
          title="复制 OCR 文本"
          @click="emit('copyText', ocrInsight.displayText)"
        >
          {{ ocrInsight.displayText }}
        </button>
        <div v-if="ocrInsight.keywords.length > 0" class="keyword-row">
          <button
            v-for="keyword in ocrInsight.keywords"
            :key="keyword"
            class="keyword-chip"
            type="button"
            :title="`复制 ${keyword}`"
            @click="emit('copyText', keyword)"
          >
            {{ keyword }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.clipboard-detail {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: auto;
  background: var(--clipboard-surface-base);
  color: var(--clipboard-text-primary);
}

.preview-surface {
  flex: 1;
  min-height: 240px;
  padding: 10px;
  overflow: auto;
  border-bottom: 1px solid var(--clipboard-border-color);
  background: var(--clipboard-surface-strong);
}

.preview-surface.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  width: 100%;
  max-height: min(50vh, 520px);
  object-fit: contain;
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 92%, transparent);
}

.preview-img.thumbnail {
  image-rendering: auto;
}

.preview-badge {
  position: absolute;
  left: 10px;
  bottom: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 90%, transparent);
  color: var(--clipboard-text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
}

.detail-empty-preview,
.code-preview,
.file-list {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--clipboard-border-color);
  background: color-mix(in srgb, var(--clipboard-surface-base) 94%, transparent);
}

.detail-empty-preview {
  color: var(--clipboard-text-secondary);
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.code-preview {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  color: var(--clipboard-text-primary);
}

.text-preview {
  max-height: min(30vh, 260px);
  overflow: auto;
}

.file-list {
  padding-left: 36px;
  display: grid;
  gap: 10px;
  color: var(--clipboard-text-primary);
}

.info-surface {
  padding: 10px 14px 12px;
  background: var(--clipboard-surface-base);
}

.detail-heading {
  margin-bottom: 8px;
}

.detail-heading h2 {
  margin: 4px 0 0;
  font-size: 1rem;
  line-height: 1.25;
  color: var(--clipboard-text-primary);
}

.eyebrow {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--clipboard-text-muted);
  text-transform: uppercase;
}

.credential-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.credential-tag {
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-color-accent) 32%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--clipboard-color-accent) 10%, transparent);
  color: var(--clipboard-color-accent);
  font-size: 0.7rem;
  font-weight: 600;
}

.info-grid {
  border-top: 1px solid color-mix(in srgb, var(--clipboard-border-color) 60%, transparent);
}

.info-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--clipboard-border-color) 45%, transparent);
}

.info-label {
  color: var(--clipboard-text-muted);
  font-size: 0.76rem;
}

.info-value {
  min-width: 0;
  color: var(--clipboard-text-primary);
  font-size: 0.78rem;
  word-break: break-word;
}

.info-value.with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-app-icon {
  width: 24px;
  height: 24px;
  flex: none;
  object-fit: contain;
  border-radius: 5px;
}

.info-value-copy {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.info-secondary {
  color: var(--clipboard-text-muted);
  font-size: 0.7rem;
  font-weight: 400;
}

.insight-section {
  padding-top: 10px;
  margin-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--clipboard-border-color) 45%, transparent);
}

.insight-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: var(--clipboard-text-primary);
  font-size: 0.78rem;
  font-weight: 700;
}

.insight-meta {
  min-width: 0;
  color: var(--clipboard-text-muted);
  font-size: 0.72rem;
  font-weight: 500;
  text-align: right;
}

.character-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 92px;
  overflow: auto;
}

.character-grid.empty {
  display: block;
}

.character-chip,
.word-chip,
.keyword-chip {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-primary);
  font-size: 0.75rem;
  line-height: 20px;
  text-align: center;
}

.character-chip {
  cursor: pointer;
}

.character-chip:hover,
.word-chip:hover,
.color-chip:hover,
.keyword-chip:hover,
.ocr-text:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 10%, transparent);
}

.word-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 54px;
  margin-bottom: 6px;
  overflow: auto;
}

.word-chip {
  max-width: 120px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.insight-empty {
  color: var(--clipboard-text-muted);
  font-size: 0.76rem;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
  gap: 6px;
}

.color-chip {
  min-width: 0;
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 88%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
}

.color-swatch {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  border-radius: 4px;
  border: 1px solid var(--clipboard-border-color);
}

.color-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ocr-text {
  width: 100%;
  max-height: 92px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 55%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 88%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
  font-size: 0.76rem;
  line-height: 1.45;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
}

.keyword-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.list-empty {
  margin: 0 auto;
  text-align: center;
  color: var(--clipboard-text-muted);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px 0;
}

.empty-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  margin: 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--clipboard-text-muted);
  font-size: 1.3rem;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--clipboard-surface-ghost) 60%, transparent),
    color-mix(in srgb, var(--clipboard-surface-ghost) 90%, transparent)
  );
}

.empty-icon .ClipboardGlyph {
  width: 24px;
  height: 24px;
}
</style>

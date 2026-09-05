<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import type { ResolvedApplication } from '@talex-touch/utils/transport/events/types'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ClipboardGlyph from './ClipboardGlyph.vue'
import ClipboardInsight from './ClipboardInsight.vue'
import ClipboardMoreInfo from './ClipboardMoreInfo.vue'
import { extractPaletteFromImage, parseColor, pickReadableForeground, toHex } from '~/utils/clipboard-colors'
import type { ClipboardFileNode } from '~/utils/clipboard-items'
import {
  getClipboardSourceInfo,
  getClipboardSummary,
  getClipboardTagLabels,
  getClipboardTitle,
  groupFilesByDirectory,
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
  (event: 'openLink', url: string): void
  (event: 'previewFile', file: ClipboardFileNode): void
}>()

const summary = computed(() => (props.item ? getClipboardSummary(props.item) : null))
const sourceInfo = computed(() =>
  props.item ? getClipboardSourceInfo(props.item, props.sourceApplication) : null,
)
const fileGroups = computed(() =>
  props.item?.type === 'files' ? groupFilesByDirectory(props.item.content) : [],
)
const collapsedDirs = ref<ReadonlySet<string>>(new Set())

/**
 * 图片主题色只能在渲染进程侧从缩略图提取——主进程从未写过 dominant_color / palette。
 * 按 id 缓存，切回同一条不重算；取不到就整条不渲染，不留一条空色带。
 */
const palette = ref<string[]>([])
const paletteCache = new Map<number, string[]>()

/** 内容本身就是一个色值时，预览区直接变成色卡。含多个色值的 CSS 片段不走这条。 */
const previewColor = computed(() =>
  props.item?.type === 'text' ? parseColor(props.item.content?.trim() ?? '') : null,
)

function toggleDir(dir: string): void {
  const next = new Set(collapsedDirs.value)
  if (next.has(dir)) {
    next.delete(dir)
  } else {
    next.add(dir)
  }
  collapsedDirs.value = next
}

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(name)
}

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
  collapsedDirs.value = new Set()
  imageRetryNonce.value += 1
}

watch([() => props.item?.id, () => props.resolvedImageUrl], resetImageFailureState)

onBeforeUnmount(() => {
  if (imageRetryTimer) {
    clearTimeout(imageRetryTimer)
  }
})

watch(
  () => [props.item?.id, imagePreview.value.src] as const,
  async ([id, src]) => {
    palette.value = []
    if (props.item?.type !== 'image' || typeof id !== 'number' || !src) {
      return
    }

    const cached = paletteCache.get(id)
    if (cached) {
      palette.value = cached
      return
    }

    const extracted = await extractPaletteFromImage(src)
    paletteCache.set(id, extracted)
    if (props.item?.id === id) {
      palette.value = extracted
    }
  },
  { immediate: true },
)

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
    <div class="preview-surface" :class="{ empty: !item }" :data-kind="item?.type">
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
          <div class="image-block">
            <div class="image-frame">
              <img
                :key="imageRetryNonce"
                :src="imagePreview.src || undefined"
                :alt="getClipboardTitle(item)"
                class="preview-img"
                :class="{ thumbnail: imagePreview.isThumbnailOnly }"
                @error="handleImageError"
              >
              <span v-if="imagePreview.isThumbnailOnly" class="preview-badge">
                {{ resolvingImageUrl ? '正在加载原图…' : '缩略图预览' }}
              </span>
            </div>

            <div v-if="palette.length > 0" class="palette-strip">
              <button
                v-for="color in palette"
                :key="color"
                class="palette-swatch"
                type="button"
                :style="{ backgroundColor: color }"
                :title="`复制 ${color}`"
                @click="emit('copyText', color)"
              />
            </div>
            <p v-if="palette.length > 0" class="palette-caption">
              主题色 · 点击复制
            </p>
          </div>
        </div>
      </template>

      <template v-else-if="previewColor">
        <div
          class="color-canvas"
          :style="{ backgroundColor: toHex(previewColor), color: pickReadableForeground(previewColor) }"
        >
          {{ toHex(previewColor) }}
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
        <div class="file-tree">
          <div v-for="group in fileGroups" :key="group.dir" class="file-group">
            <button
              class="file-dir"
              type="button"
              :aria-expanded="!collapsedDirs.has(group.dir)"
              @click="toggleDir(group.dir)"
            >
              <ClipboardGlyph
                class="dir-caret"
                :class="{ collapsed: collapsedDirs.has(group.dir) }"
                name="chevron"
              />
              <span class="dir-path">{{ group.dir }}</span>
              <span class="dir-count">{{ group.files.length }} 项</span>
            </button>

            <ul v-if="!collapsedDirs.has(group.dir)" class="file-rows">
              <li v-for="file in group.files" :key="file.path">
                <div class="file-row">
                  <div class="file-icon" :class="{ 'has-image': isImageFile(file.name) }">
                    <ClipboardGlyph :name="isImageFile(file.name) ? 'image' : 'text'" />
                  </div>
                  <span class="file-name" :title="file.path">{{ file.name }}</span>
                  <button
                    class="file-preview"
                    type="button"
                    :title="`预览 ${file.name}`"
                    @click="emit('previewFile', file)"
                  >
                    <ClipboardGlyph name="eye" />
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </div>

    <div v-if="item" class="info-surface">
      <div v-if="summary" class="summary-strip">
        <div class="summary-left">
          <span class="type-badge">{{ summary.typeLabel }}</span>
          <span class="summary-mime">{{ summary.mime }}</span>
          <template v-for="metric in summary.metrics" :key="metric">
            <span class="summary-dot">·</span>
            <span class="summary-metric">{{ metric }}</span>
          </template>
        </div>
        <span class="summary-time">{{ summary.timeLabel }}</span>
      </div>

      <div v-if="sourceInfo" class="source-row">
        <img
          v-if="sourceInfo.icon"
          class="source-app-icon"
          :src="sourceInfo.icon"
          alt=""
          @error="handleSourceIconError"
        >
        <span v-else class="source-app-icon placeholder" />
        <span class="source-copy">
          <span class="source-name">{{ sourceInfo.displayName }}</span>
          <small v-if="sourceInfo.bundleId" class="source-bundle">{{ sourceInfo.bundleId }}</small>
        </span>
        <span v-if="tagLabels.length > 0" class="credential-tags" aria-label="内容标签">
          <span v-for="label in tagLabels" :key="label" class="credential-tag">{{ label }}</span>
        </span>
      </div>

      <ClipboardInsight
        :item="item"
        @copy-text="value => emit('copyText', value)"
        @open-link="url => emit('openLink', url)"
      />

      <ClipboardMoreInfo :item="item" :palette="palette" @copy-text="value => emit('copyText', value)" />
    </div>
  </section>
</template>

<style scoped>
.clipboard-detail {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--clipboard-surface-base);
  color: var(--clipboard-text-primary);
}

/**
 * 预览区高度 = clamp(内容自然高度, 下限, 上限)，剩余空间归详情区。
 * `.clipboard-detail` 必须是 hidden：它曾是 auto，导致这里的 flex 从未被真正约束，
 * 短文本时预览占掉半屏、下方信息反被挤到滚动。
 */
.preview-surface {
  flex: 0 1 auto;
  min-height: 96px;
  max-height: 45%;
  padding: 10px;
  overflow: auto;
  border-bottom: 1px solid var(--clipboard-border-color);
  background: var(--clipboard-surface-strong);
}

.preview-surface[data-kind='image'] {
  min-height: 200px;
}

.preview-surface[data-kind='files'] {
  max-height: 60%;
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

.image-block {
  min-width: 0;
  display: grid;
  gap: 6px;
  justify-items: stretch;
}

.image-frame {
  position: relative;
  min-width: 0;
  display: flex;
  justify-content: center;
}

.palette-strip {
  display: flex;
  height: 16px;
  overflow: hidden;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
}

.palette-swatch {
  flex: 1 1 0;
  min-width: 0;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.palette-caption {
  margin: 0;
  color: var(--clipboard-text-muted);
  font-size: 0.66rem;
}

.color-canvas {
  min-height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.preview-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 90%, transparent);
  color: var(--clipboard-text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
}

.detail-empty-preview,
.code-preview {
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

.file-tree {
  display: grid;
  gap: 4px;
}

.file-group {
  display: grid;
  gap: 2px;
}

.file-dir {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  text-align: left;
}

.file-dir:hover {
  background: color-mix(in srgb, var(--clipboard-surface-base) 70%, transparent);
}

.dir-caret {
  width: 12px;
  height: 12px;
  flex: none;
  color: var(--clipboard-text-muted);
  transform: rotate(-90deg);
  transition: transform 0.15s ease;
}

.dir-caret.collapsed {
  transform: rotate(0deg);
}

.dir-path {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  font-weight: 600;
}

.dir-count {
  flex: none;
  color: var(--clipboard-text-muted);
  font-size: 0.68rem;
}

.file-rows {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0 0 0 18px;
  list-style: none;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 55%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 90%, transparent);
}

.file-icon {
  width: 26px;
  height: 26px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  overflow: hidden;
  color: var(--clipboard-text-secondary);
  background: color-mix(in srgb, var(--clipboard-surface-ghost) 90%, transparent);
}

.file-icon .ClipboardGlyph {
  width: 13px;
  height: 13px;
}

.file-name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--clipboard-text-primary);
  font-size: 0.8rem;
  font-weight: 500;
}

.file-preview {
  width: 24px;
  height: 24px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--clipboard-text-muted);
  cursor: pointer;
}

.file-preview:hover {
  color: var(--clipboard-color-accent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 12%, transparent);
}

.file-preview .ClipboardGlyph {
  width: 14px;
  height: 14px;
}

.info-surface {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0 0 12px;
  background: var(--clipboard-surface-base);
}

.summary-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 14px;
}

.summary-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}

.type-badge {
  flex: none;
  padding: 3px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-ghost) 90%, transparent);
  color: var(--clipboard-text-secondary);
  font-size: 0.72rem;
  font-weight: 600;
}

.summary-mime {
  color: var(--clipboard-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  white-space: nowrap;
}

.summary-dot,
.summary-metric {
  color: var(--clipboard-text-secondary);
  font-size: 0.72rem;
  white-space: nowrap;
}

.summary-dot {
  color: var(--clipboard-text-muted);
}

/** 时间戳不参与压缩，否则图片类型的尺寸+体积会把它挤没。 */
.summary-time {
  flex: none;
  color: var(--clipboard-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 14px 10px;
}

.source-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  gap: 1px;
}

.source-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--clipboard-text-primary);
  font-size: 0.78rem;
  font-weight: 500;
}

.source-bundle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--clipboard-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.66rem;
}

.credential-tags {
  flex: none;
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
}

.credential-tag {
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-color-accent) 32%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--clipboard-color-accent) 10%, transparent);
  color: var(--clipboard-color-accent);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}

.source-app-icon {
  width: 26px;
  height: 26px;
  flex: none;
  object-fit: contain;
  border-radius: 7px;
}

.source-app-icon.placeholder {
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-ghost) 90%, transparent);
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

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
  groupFilesByDirectory,
  resolveDetailImagePreview,
  resolveListImageSrc,
} from '~/utils/clipboard-items'
import { detectSecret, getClipboardDisplayTitle, getClipboardPreviewText } from '~/utils/clipboard-shapes'

const props = defineProps<{
  item: PluginClipboardItem | null
  resolvedImageUrl?: string | null
  resolvingImageUrl?: boolean
  sourceApplication?: ResolvedApplication | null
  /** 大图浮层的开合。状态放在容器里，因为按键分派要知道浮层是否正吃着方向键。 */
  imageViewerOpen?: boolean
}>()

const emit = defineEmits<{
  (event: 'copyText', value: string): void
  (event: 'openLink', url: string): void
  (event: 'previewFile', file: ClipboardFileNode): void
  (event: 'update:imageViewerOpen', value: boolean): void
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
 * 密钥的可见性只有这一个开关，切记录必须复位——否则「看过一次」会静默地跟着列表往下走。
 * 私钥不给开关，`getClipboardPreviewText` 那侧也会把 reveal 吞掉，两层都拦。
 */
const secret = computed(() => detectSecret(props.item?.content))
const revealSecret = ref(false)
const canRevealSecret = computed(() => Boolean(secret.value) && secret.value?.kind !== 'private-key')
const previewText = computed(() => (props.item ? getClipboardPreviewText(props.item, revealSecret.value) : ''))

watch(
  () => props.item?.id,
  () => {
    revealSecret.value = false
  },
)

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

/** 浮层只在真有图可放时才认为是打开的，避免出现一块空的黑幕挡住整个面板。 */
const imageViewerVisible = computed(
  () => props.imageViewerOpen === true && props.item?.type === 'image' && Boolean(imagePreview.value.src),
)
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
                :alt="getClipboardDisplayTitle(item)"
                class="preview-img"
                :class="{ thumbnail: imagePreview.isThumbnailOnly }"
                @error="handleImageError"
              >
              <span v-if="imagePreview.isThumbnailOnly" class="preview-badge">
                {{ resolvingImageUrl ? '正在加载原图…' : '缩略图预览' }}
              </span>
            </div>

            <div v-if="palette.length > 0" class="palette-rail" title="主题色 · 点击复制">
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
        <div class="text-preview-block">
          <pre class="code-preview text-preview">{{ previewText }}</pre>
          <button
            v-if="canRevealSecret"
            class="reveal-toggle"
            type="button"
            :title="revealSecret ? '隐藏完整值' : '显示完整值'"
            :aria-label="revealSecret ? '隐藏完整值' : '显示完整值'"
            :aria-pressed="revealSecret"
            @click="revealSecret = !revealSecret"
          >
            <ClipboardGlyph name="eye" />
          </button>
        </div>
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
        :reveal-secret="revealSecret"
        @copy-text="value => emit('copyText', value)"
        @open-link="url => emit('openLink', url)"
      />

      <ClipboardMoreInfo :item="item" :palette="palette" @copy-text="value => emit('copyText', value)" />
    </div>

    <div
      v-if="imageViewerVisible"
      class="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click="emit('update:imageViewerOpen', false)"
    >
      <img :src="imagePreview.src || undefined" :alt="item ? getClipboardDisplayTitle(item) : ''" class="viewer-img">
      <span class="viewer-hint">Esc 关闭</span>
    </div>
  </section>
</template>

<style scoped>
.clipboard-detail {
  position: relative;
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

/**
 * 图片预览区用确定高度而不是 max-height：色带和图片要靠百分比互相约束，
 * 而百分比高度只在父级高度确定时才成立。auto + max-height 会退化成内容高度，
 * 于是图片按原始尺寸撑开、把色带顶出可视区——那正是这里出现滚动条的原因。
 */
.preview-surface[data-kind='image'] {
  height: 45%;
  min-height: 200px;
  display: flex;
  overflow: hidden;
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
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 92%, transparent);
}

.preview-img.thumbnail {
  image-rendering: auto;
}

.image-block {
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.image-frame {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

/** 色带竖排贴在图片右侧：垂直空间是这一区最稀缺的资源，横排会把自己挤出可视区。 */
.palette-rail {
  flex: 0 0 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
}

.palette-swatch {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  border: 0;
  padding: 0;
  cursor: pointer;
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
  /* 全局基线是 user-select: none（拖拽不再全选整个窗口）；正文是少数该放开的地方。 */
  user-select: text;
  -webkit-user-select: text;
}

.text-preview-block {
  position: relative;
}

/**
 * 密钥可见性的唯一开关。放在预览区而不是洞察区，是因为预览区是明文原本泄漏的地方；
 * 列表标题不受它影响。
 */
.reveal-toggle {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 92%, transparent);
  color: var(--clipboard-text-muted);
  cursor: pointer;
}

.reveal-toggle:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
  color: var(--clipboard-color-accent);
}

.reveal-toggle[aria-pressed='true'] {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
  color: var(--clipboard-color-accent);
}

.reveal-toggle .ClipboardGlyph {
  width: 14px;
  height: 14px;
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

/**
 * 大图浮层盖住整个详情面板而不是整个窗口：左侧列表要保持可见，
 * 这样按 Esc 之前也知道自己停在哪一条上。
 */
.image-viewer {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backdrop-filter: blur(18px) saturate(180%);
  background: color-mix(in srgb, var(--clipboard-surface-base) 88%, transparent);
  cursor: zoom-out;
}

.viewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.viewer-hint {
  position: absolute;
  bottom: 12px;
  color: var(--clipboard-text-muted);
  font-size: 0.7rem;
}
</style>

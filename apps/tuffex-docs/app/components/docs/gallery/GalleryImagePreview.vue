<script setup lang="ts">
import type { ImagePreviewItem } from '@tuffex-components/image-preview'
import { computed, ref } from 'vue'
import { tileImage } from './tile-image'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const labels = computed(() => zh.value
  ? {
      label: '图片预览',
      close: '关闭',
      previous: '上一张',
      next: '下一张',
      zoomIn: '放大',
      zoomOut: '缩小',
      zoom: '缩放',
      reset: '适应屏幕',
      failed: '图片加载失败',
      rotate: '旋转',
      copy: '复制图片',
      share: '分享',
      download: '下载',
      menu: '图片操作',
      indicator: '图片列表',
      copied: '已复制图片',
      linkCopied: '已复制链接',
      copyFailed: '无法复制图片',
      item: (current: number, total: number, name?: string) => `${name ? `${name}，` : ''}第 ${current} 张，共 ${total} 张`,
      dialog: (title: string, name: string) => `${title}：${name}`,
      readout: (readout: string, label: string) => `${readout}，${label}`,
      open: (name: string) => `查看${name}`,
    }
  : {
      label: 'Image preview',
      close: 'Close',
      previous: 'Previous image',
      next: 'Next image',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoom: 'Zoom',
      reset: 'Fit to screen',
      failed: 'This image could not be loaded',
      rotate: 'Rotate',
      copy: 'Copy image',
      share: 'Share',
      download: 'Download',
      menu: 'Image actions',
      indicator: 'Images',
      copied: 'Image copied',
      linkCopied: 'Link copied',
      copyFailed: 'Could not copy the image',
      item: (current: number, total: number, name?: string) => name ? `${name}, ${current} of ${total}` : `Image ${current} of ${total}`,
      dialog: (title: string, name: string) => `${title}: ${name}`,
      readout: (readout: string, label: string) => `${readout}, ${label}`,
      open: (name: string) => `View ${name}`,
    })

// 1280×960, so there is something to zoom into: the preview never blows a picture up past its
// own pixels, and a thumbnail-sized tile would open as a small picture in the middle.
const TILES = [
  { id: 'dusk', url: tileImage('#312e81', '#a78bfa', '#fde68a', 8), en: 'Violet dusk', zh: '紫色黄昏' },
  { id: 'glacier', url: tileImage('#0c4a6e', '#38bdf8', '#f0f9ff', 8), en: 'Glacier lake', zh: '冰川湖' },
  { id: 'canyon', url: tileImage('#831843', '#fb7185', '#ffe4e6', 8), en: 'Rose canyon', zh: '玫瑰峡谷' },
]

const images = computed<ImagePreviewItem[]>(() => TILES.map(tile => ({
  url: tile.url,
  name: zh.value ? tile.zh : tile.en,
  width: 1280,
  height: 960,
})))

const open = ref(false)
const index = ref(0)
const grid = ref<HTMLElement | null>(null)

// Each picture grows out of its thumbnail and shrinks back into it.
function thumbOf(at: number): Element | null {
  return grid.value?.children[at] ?? null
}

function show(at: number, event: MouseEvent): void {
  // The preview returns focus to whatever had it when it opened; WebKit does not focus a
  // clicked button, so give it the thumbnail explicitly.
  ;(event.currentTarget as HTMLElement).focus()
  index.value = at
  open.value = true
}
</script>

<template>
  <div ref="grid" class="gallery-image-preview">
    <button
      v-for="(image, i) in images"
      :key="image.url"
      type="button"
      class="gallery-image-preview__thumb"
      :aria-label="labels.open(image.name!)"
      @click="show(i, $event)"
    >
      <img :src="image.url" alt="">
    </button>

    <TxImagePreview
      v-model:open="open"
      v-model:index="index"
      :images="images"
      :origin="thumbOf"
      :label="labels.label"
      :close-label="labels.close"
      :previous-label="labels.previous"
      :next-label="labels.next"
      :zoom-in-label="labels.zoomIn"
      :zoom-out-label="labels.zoomOut"
      :zoom-label="labels.zoom"
      :reset-label="labels.reset"
      :failed-text="labels.failed"
      :rotate-label="labels.rotate"
      :copy-label="labels.copy"
      :share-label="labels.share"
      :download-label="labels.download"
      :menu-label="labels.menu"
      :indicator-label="labels.indicator"
      :copied-text="labels.copied"
      :link-copied-text="labels.linkCopied"
      :copy-failed-text="labels.copyFailed"
      :indicator-item-formatter="labels.item"
      :label-formatter="labels.dialog"
      :readout-label-formatter="labels.readout"
    />
  </div>
</template>

<style scoped>
.gallery-image-preview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.gallery-image-preview__thumb {
  aspect-ratio: 4 / 3;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  cursor: zoom-in;
}

.gallery-image-preview__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.25s ease;
}

.gallery-image-preview__thumb:hover img {
  transform: scale(1.04);
}

.gallery-image-preview__thumb:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .gallery-image-preview__thumb img {
    transition: none;
  }
}
</style>

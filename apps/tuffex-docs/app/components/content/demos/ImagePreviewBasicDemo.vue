<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

// A screenshot, a panorama, an upright photo and a landscape one: each fits the
// screen its own way, and the screenshot's text only reads once zoomed to 100%.
const sources = [
  { id: 'search', url: '/shots/SearchFileImmediately.jpg', thumb: '/shots/SearchFileImmediately.jpg', width: 1668, height: 1080 },
  { id: 'fjord', url: 'https://picsum.photos/id/1015/3000/1000', thumb: 'https://picsum.photos/id/1015/480/160', width: 3000, height: 1000 },
  { id: 'alley', url: 'https://picsum.photos/id/1047/1200/1800', thumb: 'https://picsum.photos/id/1047/320/480', width: 1200, height: 1800 },
  { id: 'jellyfish', url: 'https://picsum.photos/id/1069/2400/1600', thumb: 'https://picsum.photos/id/1069/480/320', width: 2400, height: 1600 },
]

const copy = computed(() => (locale.value === 'zh'
  ? {
      names: { search: 'Tuff 文件搜索', fjord: '峡湾全景', alley: '红砖巷', jellyfish: '水母' } as Record<string, string>,
      open: (name: string) => `查看大图：${name}`,
      label: '图片预览',
      dialog: (label: string, name: string) => `${label}：${name}`,
      readout: (readout: string, label: string) => `${readout}，${label}`,
      close: '关闭',
      previous: '上一张',
      next: '下一张',
      zoomIn: '放大',
      zoomOut: '缩小',
      zoom: '缩放',
      reset: '适应屏幕',
      rotate: '旋转',
      copyImage: '复制图片',
      share: '分享',
      download: '下载',
      menu: '图片操作',
      strip: '图片列表',
      copied: '已复制图片',
      linkCopied: '已复制链接',
      copyFailed: '无法复制图片',
      failed: '图片加载失败',
      item: (current: number, total: number, name?: string) => `${name ? `${name}，` : ''}第 ${current} 张，共 ${total} 张`,
    }
  : {
      names: { search: 'Tuff file search', fjord: 'Fjord panorama', alley: 'Brick alley', jellyfish: 'Jellyfish' } as Record<string, string>,
      open: (name: string) => `View ${name}`,
      label: 'Image preview',
      dialog: (label: string, name: string) => `${label}: ${name}`,
      readout: (readout: string, label: string) => `${readout}, ${label}`,
      close: 'Close',
      previous: 'Previous image',
      next: 'Next image',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      zoom: 'Zoom',
      reset: 'Fit to screen',
      rotate: 'Rotate',
      copyImage: 'Copy image',
      share: 'Share',
      download: 'Download',
      menu: 'Image actions',
      strip: 'Images',
      copied: 'Image copied',
      linkCopied: 'Link copied',
      copyFailed: 'Could not copy the image',
      failed: 'This image could not be loaded',
      item: (current: number, total: number, name?: string) => `${name ? `${name}, ` : ''}${current} of ${total}`,
    }))

const images = computed(() => sources.map(({ url, thumb, width, height, id }) => ({ url, thumbnail: thumb, width, height, name: copy.value.names[id] })))

const open = ref(false)
const index = ref(0)
const grid = ref<HTMLElement | null>(null)

// Each picture grows out of its thumbnail and shrinks back into it.
function thumbOf(at: number): Element | null {
  return grid.value?.children[at] ?? null
}

function show(at: number, event: MouseEvent): void {
  // WebKit does not focus a clicked button; focused first, it gets the focus back on close.
  (event.currentTarget as HTMLElement).focus()
  index.value = at
  open.value = true
}
</script>

<template>
  <div ref="grid" class="image-preview-demo not-prose">
    <button
      v-for="(source, i) in sources"
      :key="source.id"
      type="button"
      class="image-preview-demo__thumb"
      :aria-label="copy.open(copy.names[source.id] ?? '')"
      @click="show(i, $event)"
    >
      <img :src="source.thumb" alt="" loading="lazy" decoding="async">
    </button>

    <TxImagePreview
      v-model:open="open"
      v-model:index="index"
      :images="images"
      :origin="thumbOf"
      :label="copy.label"
      :close-label="copy.close"
      :previous-label="copy.previous"
      :next-label="copy.next"
      :zoom-in-label="copy.zoomIn"
      :zoom-out-label="copy.zoomOut"
      :zoom-label="copy.zoom"
      :reset-label="copy.reset"
      :rotate-label="copy.rotate"
      :copy-label="copy.copyImage"
      :share-label="copy.share"
      :download-label="copy.download"
      :menu-label="copy.menu"
      :indicator-label="copy.strip"
      :copied-text="copy.copied"
      :link-copied-text="copy.linkCopied"
      :copy-failed-text="copy.copyFailed"
      :failed-text="copy.failed"
      :indicator-item-formatter="copy.item"
      :label-formatter="copy.dialog"
      :readout-label-formatter="copy.readout"
    />
  </div>
</template>

<style scoped>
.image-preview-demo {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: min(560px, 100%);
}

@media (max-width: 520px) {
  .image-preview-demo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.image-preview-demo__thumb {
  display: block;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  padding: 0;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  cursor: zoom-in;
}

.image-preview-demo__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  object-fit: cover;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.image-preview-demo__thumb:hover img {
  transform: scale(1.04);
}

.image-preview-demo__thumb:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .image-preview-demo__thumb img {
    transition: none;
  }
}
</style>

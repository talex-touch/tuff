<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

// Landscape and portrait sources: the preview opens on the whole image, so the
// reader can see neither axis is cropped.
const sources = [
  { id: 'one', url: 'https://picsum.photos/seed/talex-gallery-one/640/420' },
  { id: 'two', url: 'https://picsum.photos/seed/talex-gallery-two/640/420' },
  { id: 'three', url: 'https://picsum.photos/seed/talex-gallery-three/480/760' },
]

const copy = computed(() => (locale.value === 'zh'
  ? {
      names: { one: '工作区概览', two: '发布图表', three: '插件详情' } as Record<string, string>,
      previewTitle: '预览',
      previousLabel: '上一张',
      nextLabel: '下一张',
      closeLabel: '关闭',
      zoomInLabel: '放大',
      zoomOutLabel: '缩小',
      resetLabel: '适应屏幕',
      failedText: '图片加载失败',
      itemLabel: (index: number) => `第 ${index + 1} 张`,
      openLabel: (label: string) => `预览：${label}`,
      // The preview's own text, which the gallery does not forward.
      preview: {
        zoomLabel: '缩放',
        rotateLabel: '旋转',
        copyLabel: '复制图片',
        shareLabel: '分享',
        downloadLabel: '下载',
        menuLabel: '图片操作',
        indicatorLabel: '图片列表',
        copiedText: '已复制图片',
        linkCopiedText: '已复制链接',
        copyFailedText: '无法复制图片',
        indicatorItemFormatter: (current: number, total: number, name?: string) => `${name ? `${name}，` : ''}第 ${current} 张，共 ${total} 张`,
        labelFormatter: (title: string, name: string) => `${title}：${name}`,
        readoutLabelFormatter: (readout: string, label: string) => `${readout}，${label}`,
      },
    }
  : {
      names: { one: 'Workspace overview', two: 'Release graph', three: 'Plugin detail' } as Record<string, string>,
      previewTitle: 'Preview',
      previousLabel: 'Previous image',
      nextLabel: 'Next image',
      closeLabel: 'Close',
      zoomInLabel: 'Zoom in',
      zoomOutLabel: 'Zoom out',
      resetLabel: 'Fit to screen',
      failedText: 'This image could not be loaded',
      itemLabel: (index: number) => `Image ${index + 1}`,
      openLabel: (label: string) => `Open ${label} preview`,
      preview: {
        zoomLabel: 'Zoom',
        rotateLabel: 'Rotate',
        copyLabel: 'Copy image',
        shareLabel: 'Share',
        downloadLabel: 'Download',
        menuLabel: 'Image actions',
        indicatorLabel: 'Images',
        copiedText: 'Image copied',
        linkCopiedText: 'Link copied',
        copyFailedText: 'Could not copy the image',
        indicatorItemFormatter: (current: number, total: number, name?: string) => `${name ? `${name}, ` : ''}${current} of ${total}`,
        labelFormatter: (title: string, name: string) => `${title}: ${name}`,
        readoutLabelFormatter: (readout: string, label: string) => `${readout}, ${label}`,
      },
    }))

const items = computed(() => sources.map(item => ({ ...item, name: copy.value.names[item.id] })))
</script>

<template>
  <div class="image-gallery-demo">
    <TxImageGallery
      :items="items"
      :start-index="1"
      :preview-title="copy.previewTitle"
      :previous-label="copy.previousLabel"
      :next-label="copy.nextLabel"
      :close-label="copy.closeLabel"
      :zoom-in-label="copy.zoomInLabel"
      :zoom-out-label="copy.zoomOutLabel"
      :reset-label="copy.resetLabel"
      :failed-text="copy.failedText"
      :item-label-formatter="copy.itemLabel"
      :open-label-formatter="copy.openLabel"
      :preview-props="copy.preview"
    />
  </div>
</template>

<style scoped>
.image-gallery-demo {
  width: min(460px, 100%);
}
</style>

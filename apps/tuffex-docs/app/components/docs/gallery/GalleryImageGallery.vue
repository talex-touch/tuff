<script setup lang="ts">
import type { ImageGalleryItem } from '@tuffex-components/image-gallery'
import { computed } from 'vue'

defineProps<{ items: ImageGalleryItem[] }>()

const { locale } = useI18n()
const labels = computed(() => locale.value === 'zh'
  ? {
      preview: '预览',
      previous: '上一张',
      next: '下一张',
      close: '关闭',
      zoomIn: '放大',
      zoomOut: '缩小',
      reset: '适应屏幕',
      failed: '图片加载失败',
      item: (index: number) => `第 ${index + 1} 张`,
      open: (label: string) => `预览：${label}`,
      // The preview's own text, which the gallery does not forward.
      viewer: {
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
      preview: 'Preview',
      previous: 'Previous image',
      next: 'Next image',
      close: 'Close',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      reset: 'Fit to screen',
      failed: 'This image could not be loaded',
      item: (index: number) => `Image ${index + 1}`,
      open: (label: string) => `Open ${label} preview`,
      viewer: {
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
    })
</script>

<template>
  <TxImageGallery
    :items="items"
    :preview-title="labels.preview"
    :previous-label="labels.previous"
    :next-label="labels.next"
    :close-label="labels.close"
    :zoom-in-label="labels.zoomIn"
    :zoom-out-label="labels.zoomOut"
    :reset-label="labels.reset"
    :failed-text="labels.failed"
    :item-label-formatter="labels.item"
    :open-label-formatter="labels.open"
    :preview-props="labels.viewer"
  />
</template>

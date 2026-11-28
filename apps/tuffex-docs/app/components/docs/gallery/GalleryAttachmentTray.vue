<script setup lang="ts">
import type { AiAttachment } from '@tuffex-components/ai-elements'
import { computed, ref } from 'vue'
import { tileImage } from './tile-image'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')
const labels = computed(() => zh.value
  ? { preview: '预览', previous: '上一张', next: '下一张', close: '关闭', zoomIn: '放大', zoomOut: '缩小', reset: '适应屏幕', failed: '图片加载失败', remove: '移除附件', open: (name: string) => `预览：${name}` }
  : { preview: 'Preview', previous: 'Previous image', next: 'Next image', close: 'Close', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Fit to screen', failed: 'This image could not be loaded', remove: 'Remove attachment', open: (name: string) => `Preview: ${name}` })
// The preview's own text, which the tray does not forward.
const viewer = computed(() => zh.value
  ? {
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
    }
  : {
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
    })

const RIDGE = tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 4)
const VALLEY = tileImage('#064e3b', '#4ade80', '#fef9c3', 4)

// Removing is the host's job, so the specimen keeps its own list; the cell's
// reset remounts it with everything back.
const kept = ref(['ridge', 'valley', 'notes'])

const attachments = computed(() => {
  const all: AiAttachment[] = [
    { kind: 'image', id: 'ridge', url: RIDGE, name: zh.value ? '山脊晨光.png' : 'dawn-ridge.png', width: 640, height: 480 },
    { kind: 'image', id: 'valley', url: VALLEY, name: zh.value ? '松谷.png' : 'pine-valley.png', width: 640, height: 480 },
    { kind: 'file', id: 'notes', name: zh.value ? '旅行手记.pdf' : 'trip-notes.pdf', size: 248_000, mime: 'application/pdf' },
  ]
  return all.filter(item => kept.value.includes(item.id))
})

function remove(id: string): void {
  kept.value = kept.value.filter(item => item !== id)
}
</script>

<template>
  <TxAttachmentTray
    :attachments="attachments"
    removable
    :preview-title="labels.preview"
    :previous-label="labels.previous"
    :next-label="labels.next"
    :close-label="labels.close"
    :zoom-in-label="labels.zoomIn"
    :zoom-out-label="labels.zoomOut"
    :reset-label="labels.reset"
    :failed-text="labels.failed"
    :remove-label="labels.remove"
    :open-label-formatter="labels.open"
    :preview-props="viewer"
    @remove="remove"
  />
</template>

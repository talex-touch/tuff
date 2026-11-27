<script setup lang="ts">
import type { AiAttachment, AiAttachmentFile } from '@tuffex-components/ai-elements'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const copy = computed(() => (locale.value === 'zh'
  ? {
      hint: '点击图片全屏预览，可缩放、拖动并左右滑动翻页；点击文件胶囊会派发 open 事件。',
      opened: '宿主将打开：',
      previewTitle: '预览',
      previousLabel: '上一张',
      nextLabel: '下一张',
      removeLabel: '移除附件',
      cancelLabel: '取消上传',
      closeLabel: '关闭',
      zoomInLabel: '放大',
      zoomOutLabel: '缩小',
      resetLabel: '适应屏幕',
      failedText: '图片加载失败',
      openLabel: (name: string) => `预览：${name}`,
      // The preview's own text, which the tray does not forward.
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
      hint: 'Click an image to preview it full-window, where it zooms, pans, and swipes to page; a file chip emits open.',
      opened: 'Host would open: ',
      previewTitle: 'Preview',
      previousLabel: 'Previous image',
      nextLabel: 'Next image',
      removeLabel: 'Remove attachment',
      cancelLabel: 'Cancel upload',
      closeLabel: 'Close',
      zoomInLabel: 'Zoom in',
      zoomOutLabel: 'Zoom out',
      resetLabel: 'Fit to screen',
      failedText: 'This image could not be loaded',
      openLabel: (name: string) => `Preview: ${name}`,
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

function seed(): AiAttachment[] {
  return [
    { kind: 'image', id: 'i1', url: 'https://picsum.photos/id/1015/400/300', name: 'canyon.jpg' },
    { kind: 'image', id: 'i2', url: 'https://picsum.photos/id/1025/400/300', name: 'pug.jpg' },
    { kind: 'image', id: 'i3', url: 'https://picsum.photos/id/1043/400/300', name: 'shore.jpg', uploading: true, progress: 0.6 },
    // A URL that will not resolve, to show the placeholder rather than a broken glyph.
    { kind: 'image', id: 'i4', url: 'https://example.com/missing.png', name: 'missing.png' },
    { kind: 'file', id: 'f1', name: 'report.pdf', size: 240_000 },
    { kind: 'file', id: 'f2', name: 'uploading.zip', size: 1_200_000, uploading: true, progress: 0.4 },
  ]
}

const attachments = ref<AiAttachment[]>(seed())
const opened = ref<string | null>(null)

// The component never mutates the list; removal is the host's job.
function onRemove(id: string): void {
  attachments.value = attachments.value.filter(item => item.id !== id)
}

function onCancel(id: string): void {
  attachments.value = attachments.value.filter(item => item.id !== id)
}

// Files only — images open the built-in preview and emit nothing.
function onOpen(attachment: AiAttachmentFile): void {
  opened.value = attachment.name
}

// The demo window's own reset button calls this instead of remounting the demo.
function resetDemo(): void {
  attachments.value = seed()
  opened.value = null
}

defineExpose({ resetDemo })
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Left inside the article's prose on purpose: the tray pins its own image box. -->
    <TxAttachmentTray
      :attachments="attachments"
      removable
      :preview-title="copy.previewTitle"
      :previous-label="copy.previousLabel"
      :next-label="copy.nextLabel"
      :close-label="copy.closeLabel"
      :zoom-in-label="copy.zoomInLabel"
      :zoom-out-label="copy.zoomOutLabel"
      :reset-label="copy.resetLabel"
      :failed-text="copy.failedText"
      :remove-label="copy.removeLabel"
      :cancel-label="copy.cancelLabel"
      :open-label-formatter="copy.openLabel"
      :preview-props="copy.preview"
      @remove="onRemove"
      @cancel="onCancel"
      @open="onOpen"
    />

    <div class="not-prose">
      <span class="text-[13px] text-[var(--tx-text-color-regular)]">
        <template v-if="opened">{{ copy.opened }}<span class="font-medium text-[var(--tx-text-color-primary)]">{{ opened }}</span></template>
        <template v-else>{{ copy.hint }}</template>
      </span>
    </div>
  </div>
</template>

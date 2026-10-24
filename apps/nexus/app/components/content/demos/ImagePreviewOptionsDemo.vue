<script setup lang="ts">
import type { ImagePreviewAction, ImagePreviewIndicator } from '@talex-touch/tuffex/image-preview'
import { computed, ref } from 'vue'

const { locale } = useI18n()

type Material = 'refraction' | 'blur' | 'glass' | 'mask'

const ACTIONS: ImagePreviewAction[] = ['rotate', 'copy', 'share', 'download']
const INDICATORS: ImagePreviewIndicator[] = ['thumbnails', 'dots', 'none']
const MASKS: Material[] = ['refraction', 'blur', 'mask']
const CONTROLS: Material[] = ['blur', 'glass', 'mask']
const BOUNCES = [0, 0.2, 0.45]

// Wide, tall and square, so the strip's thumbnails take each picture's own shape.
const sources = [
  { id: 'fjord', picsum: 1015, width: 2400, height: 1600 },
  { id: 'canyon', picsum: 1016, width: 1600, height: 1200 },
  { id: 'pug', picsum: 1025, width: 1200, height: 1600 },
  { id: 'camp', picsum: 1036, width: 2400, height: 1350 },
  { id: 'waterfall', picsum: 1039, width: 2000, height: 1333 },
  { id: 'valley', picsum: 1043, width: 1600, height: 2000 },
  { id: 'jellyfish', picsum: 1069, width: 1200, height: 1500 },
  { id: 'strawberries', picsum: 1080, width: 1600, height: 1600 },
].map(source => ({
  ...source,
  url: `https://picsum.photos/id/${source.picsum}/${source.width}/${source.height}`,
  thumbnail: `https://picsum.photos/id/${source.picsum}/${Math.round(source.width / 5)}/${Math.round(source.height / 5)}`,
}))

const copy = computed(() => (locale.value === 'zh'
  ? {
      names: { fjord: '峡湾', canyon: '峡谷日落', pug: '巴哥', camp: '雪山营地', waterfall: '瀑布', valley: '山谷', jellyfish: '水母', strawberries: '草莓' } as Record<string, string>,
      open: (name: string) => `查看大图：${name}`,
      settings: { indicator: '底部条', mask: '遮罩', control: '控件', bounce: '回弹', actions: '操作', menu: '长按菜单' },
      indicators: { thumbnails: '缩略图', dots: '圆点', none: '无' } as Record<ImagePreviewIndicator, string>,
      materials: { refraction: '折射', blur: '模糊', glass: '玻璃', mask: '半透明' } as Record<Material, string>,
      bounces: ['无', '轻', '强'],
      actionNames: { rotate: '旋转', copy: '复制', share: '分享', download: '下载' } as Record<ImagePreviewAction, string>,
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
      copyImage: '复制图片',
      menu: '图片操作',
      strip: '图片列表',
      copied: '已复制图片',
      linkCopied: '已复制链接',
      copyFailed: '无法复制图片',
      failed: '图片加载失败',
      item: (current: number, total: number, name?: string) => `${name ? `${name}，` : ''}第 ${current} 张，共 ${total} 张`,
    }
  : {
      names: { fjord: 'Fjord', canyon: 'Canyon at dusk', pug: 'Pug', camp: 'Snow camp', waterfall: 'Waterfall', valley: 'Valley', jellyfish: 'Jellyfish', strawberries: 'Strawberries' } as Record<string, string>,
      open: (name: string) => `View ${name}`,
      settings: { indicator: 'Strip', mask: 'Mask', control: 'Controls', bounce: 'Bounce', actions: 'Actions', menu: 'Long-press menu' },
      indicators: { thumbnails: 'Thumbnails', dots: 'Dots', none: 'None' } as Record<ImagePreviewIndicator, string>,
      materials: { refraction: 'Refraction', blur: 'Blur', glass: 'Glass', mask: 'Translucent' } as Record<Material, string>,
      bounces: ['None', 'Light', 'Strong'],
      actionNames: { rotate: 'Rotate', copy: 'Copy', share: 'Share', download: 'Download' } as Record<ImagePreviewAction, string>,
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
      copyImage: 'Copy image',
      menu: 'Image actions',
      strip: 'Images',
      copied: 'Image copied',
      linkCopied: 'Link copied',
      copyFailed: 'Could not copy the image',
      failed: 'This image could not be loaded',
      item: (current: number, total: number, name?: string) => `${name ? `${name}, ` : ''}${current} of ${total}`,
    }))

const images = computed(() => sources.map(({ id, url, thumbnail, width, height }) => ({ url, thumbnail, width, height, name: copy.value.names[id] })))

const indicator = ref<ImagePreviewIndicator>('thumbnails')
const maskSurface = ref<Material>('refraction')
const controlSurface = ref<Material>('blur')
const bounce = ref(0.2)
const chosen = ref<ImagePreviewAction[]>([...ACTIONS])
const contextMenu = ref(true)

// The toolbar keeps the actions in their own order, whichever was ticked first.
const actions = computed(() => ACTIONS.filter(action => chosen.value.includes(action)))

function setActions(value: unknown): void {
  chosen.value = Array.isArray(value) ? value as ImagePreviewAction[] : []
}

const open = ref(false)
const index = ref(0)
const grid = ref<HTMLElement | null>(null)

function thumbOf(at: number): Element | null {
  return grid.value?.children[at] ?? null
}

function show(at: number, event: MouseEvent): void {
  (event.currentTarget as HTMLElement).focus()
  index.value = at
  open.value = true
}
</script>

<template>
  <div class="image-preview-options-demo not-prose">
    <div class="image-preview-options-demo__settings">
      <span>{{ copy.settings.indicator }}</span>
      <TxFlatRadio v-model="indicator" size="sm" :aria-label="copy.settings.indicator">
        <TxFlatRadioItem v-for="option in INDICATORS" :key="option" :value="option" :label="copy.indicators[option]" />
      </TxFlatRadio>

      <span>{{ copy.settings.mask }}</span>
      <TxFlatRadio v-model="maskSurface" size="sm" :aria-label="copy.settings.mask">
        <TxFlatRadioItem v-for="option in MASKS" :key="option" :value="option" :label="copy.materials[option]" />
      </TxFlatRadio>

      <span>{{ copy.settings.control }}</span>
      <TxFlatRadio v-model="controlSurface" size="sm" :aria-label="copy.settings.control">
        <TxFlatRadioItem v-for="option in CONTROLS" :key="option" :value="option" :label="copy.materials[option]" />
      </TxFlatRadio>

      <span>{{ copy.settings.bounce }}</span>
      <TxFlatRadio v-model="bounce" size="sm" :aria-label="copy.settings.bounce">
        <TxFlatRadioItem v-for="(value, i) in BOUNCES" :key="value" :value="value" :label="copy.bounces[i]" />
      </TxFlatRadio>

      <span>{{ copy.settings.actions }}</span>
      <TxFlatRadio :model-value="chosen" multiple size="sm" :aria-label="copy.settings.actions" @update:model-value="setActions">
        <TxFlatRadioItem v-for="action in ACTIONS" :key="action" :value="action" :label="copy.actionNames[action]" />
      </TxFlatRadio>

      <span>{{ copy.settings.menu }}</span>
      <TxSwitch v-model="contextMenu" size="small" :aria-label="copy.settings.menu" />
    </div>

    <div ref="grid" class="image-preview-options-demo__grid">
      <button
        v-for="(source, i) in sources"
        :key="source.id"
        type="button"
        class="image-preview-options-demo__thumb"
        :aria-label="copy.open(copy.names[source.id] ?? '')"
        @click="show(i, $event)"
      >
        <img :src="source.thumbnail" alt="" loading="lazy" decoding="async">
      </button>
    </div>

    <TxImagePreview
      v-model:open="open"
      v-model:index="index"
      :images="images"
      :origin="thumbOf"
      :indicator="indicator"
      :mask-surface="maskSurface"
      :control-surface="controlSurface"
      :bounce="bounce"
      :actions="actions"
      :context-menu="contextMenu"
      :label="copy.label"
      :close-label="copy.close"
      :previous-label="copy.previous"
      :next-label="copy.next"
      :zoom-in-label="copy.zoomIn"
      :zoom-out-label="copy.zoomOut"
      :zoom-label="copy.zoom"
      :reset-label="copy.reset"
      :rotate-label="copy.actionNames.rotate"
      :copy-label="copy.copyImage"
      :share-label="copy.actionNames.share"
      :download-label="copy.actionNames.download"
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
.image-preview-options-demo {
  display: grid;
  gap: 16px;
  width: min(560px, 100%);
}

.image-preview-options-demo__settings {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 10px 14px;
  align-items: center;
  justify-items: start;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.image-preview-options-demo__grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 6px;
}

@media (max-width: 520px) {
  .image-preview-options-demo__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.image-preview-options-demo__thumb {
  display: block;
  overflow: hidden;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 8px;
  background: var(--tx-fill-color-light);
  cursor: zoom-in;
}

.image-preview-options-demo__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  object-fit: cover;
}

.image-preview-options-demo__thumb:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}
</style>

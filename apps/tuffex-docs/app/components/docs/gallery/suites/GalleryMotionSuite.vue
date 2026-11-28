<script setup lang="ts">
import type { Component } from 'vue'
import { onMounted, shallowRef } from 'vue'
import ClientOnly from '../GallerySpecimenGate.vue'

defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const galleryAmicroSpecimen = shallowRef<Component | null>(null)

onMounted(() => {
  void import('../GalleryAmicroSpecimen.vue').then(({ default: component }) => {
    galleryAmicroSpecimen.value = component
  })
})

// `height` is the specimen's tallest height in px, given only where it outgrows
// the default stage, and `narrowHeight` its height in the narrowest two-column
// cells where that is taller still: the stage reserves both
// (`--docs-gallery-specimen` and `--docs-gallery-specimen-narrow`).
const motionGalleryItems = [
  { doc: 'motion-button', name: 'MotionButton', zh: '动效按钮', kind: 'motion-button' },
  { doc: 'card-spread', name: 'CardSpread', zh: '卡片展开', kind: 'card-spread', height: 264 },
  { doc: 'carousel-3d', name: 'Carousel3D', zh: '三维轮播', kind: 'carousel-3d', height: 279, narrowHeight: 318 },
  { doc: 'flip-book', name: 'FlipBook', zh: '翻页书', kind: 'flip-book', height: 253 },
  { doc: 'motion-loader', name: 'MotionLoader', zh: '加载动效', kind: 'motion-loader', height: 139 },
  { doc: 'dither-chart', name: 'DitherChart', zh: '抖动图表', kind: 'dither-chart', height: 331 },
  { doc: 'motion-text', name: 'MotionText', zh: '文字动效', kind: 'motion-text' },
  { doc: 'physics-motion', name: 'PhysicsMotion', zh: '物理动效', kind: 'physics-motion', height: 128 },
  { doc: 'motion-dock', name: 'MotionDock', zh: '动态应用栏', kind: 'motion-dock' },
  { doc: 'motion', name: 'Motion', zh: '悬停与滚动', kind: 'motion', height: 150 },
  { doc: 'pixel-field', name: 'PixelField', zh: '像素粒子场', kind: 'pixel-field', height: 220 },
  { doc: 'voice-ring', name: 'VoiceRing', zh: '语音光环', kind: 'voice-ring', height: 196 },
  { doc: 'motion-toggle', name: 'MotionToggle', zh: '动效切换', kind: 'motion-toggle' },
  { doc: 'motion-transition', name: 'MotionTransition', zh: '动效转场', kind: 'motion-transition', height: 198 },
  { doc: 'distortion-wave', name: 'DistortionWave', zh: '折射波转场', kind: 'distortion-wave', height: 196 },
] as const

function specimenStyle(item: { readonly doc?: string, readonly name?: string, readonly zh?: string, readonly kind?: string, readonly height?: number, readonly narrowHeight?: number }) {
  if (!item.height)
    return undefined
  return item.narrowHeight
    ? { '--docs-gallery-specimen': `${item.height}px`, '--docs-gallery-specimen-narrow': `${item.narrowHeight}px` }
    : { '--docs-gallery-specimen': `${item.height}px` }
}
</script>

<template>
  <div class="docs-gallery__grid">
    <section v-for="item in motionGalleryItems" :key="item.kind" class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath(item.doc)">
        {{ cellLabel(item.name, item.zh) }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" :style="specimenStyle(item)">
        <ClientOnly>
          <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" :kind="item.kind" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
  </div>
</template>

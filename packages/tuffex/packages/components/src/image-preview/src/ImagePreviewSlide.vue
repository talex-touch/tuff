<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { DrawnSlide } from './use-preview-slides'
import { BrokenImageIcon } from '../../../../utils/broken-image-icon'

// Internal: one page of TxImagePreview, as use-preview-slides draws it. Its picture sits in a
// frame, the window of it shown; a thumbnail's pixels stand in until the picture loads, and the
// placeholder shimmers where neither has. Not exported.
defineOptions({ name: 'TxImagePreviewSlide' })

defineProps<{
  slide: DrawnSlide
  /** Where a picture is fitted: a failed one's message fills it. */
  boxStyle: CSSProperties
  failedText: string
  /** Hands the picture's element over as it comes and goes (see use-preview-pictures). */
  bind: (el: unknown) => void
}>()

const emit = defineEmits<{
  load: [event: Event]
  error: [event: Event]
}>()
</script>

<template>
  <div
    class="tx-image-preview__slide"
    :class="{ 'is-flying': slide.flying, 'is-hidden': slide.hidden }"
    :style="slide.style"
    :aria-hidden="slide.offset !== 0 || undefined"
  >
    <div v-if="slide.failed" class="tx-image-preview__failed" :style="boxStyle">
      <BrokenImageIcon :size="36" :stroke-width="1.5" />
      <span>{{ failedText }}</span>
    </div>
    <template v-else>
      <span v-if="slide.placeholder" class="tx-image-preview__placeholder" :style="slide.placeholder" aria-hidden="true" />
      <div class="tx-image-preview__frame" :style="slide.frame">
        <img
          v-if="slide.standIn"
          class="tx-image-preview__stand-in"
          :src="slide.standIn"
          alt=""
          aria-hidden="true"
          draggable="false"
          :style="slide.picture"
        >
        <img
          :ref="bind"
          class="tx-image-preview__image"
          :class="{ 'is-loaded': slide.loaded }"
          :src="slide.item.url"
          :alt="slide.item.alt ?? slide.item.name ?? ''"
          :style="slide.picture"
          draggable="false"
          decoding="async"
          @load="emit('load', $event)"
          @error="emit('error', $event)"
        >
      </div>
    </template>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include skeleton-keyframes;

.tx-image-preview__slide {
  position: absolute;
  inset: 0;
}

// The neighbours wait out of sight while a picture flies home.
.tx-image-preview__slide.is-hidden {
  visibility: hidden;
}

// The window of the picture shown: all of it at rest; in flight, as much as its thumbnail
// shows, with the thumbnail's corners.
.tx-image-preview__frame {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.tx-image-preview__slide.is-flying .tx-image-preview__frame {
  overflow: hidden;
}

.tx-image-preview__image,
.tx-image-preview__stand-in {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  max-height: none;
  -webkit-user-drag: none;
}

.tx-image-preview__stand-in {
  object-fit: cover;
}

.tx-image-preview__image {
  opacity: 0;
  cursor: zoom-in;
  transition: opacity 0.2s ease-out;
}

.tx-image-preview__image.is-loaded {
  opacity: 1;
}

// Composited only while something moves: a layer kept at rest stays rasterised at the scale it
// started at, and a picture zoomed into would stay blurred.
.tx-image-preview.is-moving .tx-image-preview__frame {
  will-change: transform;
}

.tx-image-preview.is-zoomed .tx-image-preview__image {
  cursor: grab;
}

.tx-image-preview.is-grabbing .tx-image-preview__image {
  cursor: grabbing;
}

.tx-image-preview__placeholder {
  --tx-skeleton-base-color: rgba(255, 255, 255, 0.16);

  position: absolute;
  top: 0;
  left: 0;
  border-radius: 6px;

  @include skeleton-surface;
}

.tx-image-preview__failed {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--tx-image-preview-ink-muted);
  text-align: center;
}
</style>

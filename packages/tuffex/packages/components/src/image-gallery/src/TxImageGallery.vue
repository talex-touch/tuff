<script setup lang="ts">
import type TxImagePreviewComponent from '../../image-preview/src/TxImagePreview.vue'
import type { ImageGalleryEmits, ImageGalleryItem, ImageGalleryProps } from './types'
import { computed, ref, watch } from 'vue'
import { BrokenImageIcon } from '../../../../utils/broken-image-icon'
import { useLazyComponent } from '../../../../utils/use-lazy-component'

defineOptions({
  name: 'TxImageGallery',
})

const props = withDefaults(defineProps<ImageGalleryProps>(), {
  startIndex: 0,
  previousLabel: 'Previous image',
  nextLabel: 'Next image',
  previewTitle: 'Preview',
  closeLabel: 'Close',
  zoomInLabel: 'Zoom in',
  zoomOutLabel: 'Zoom out',
  resetLabel: 'Fit to screen',
  failedText: 'This image could not be loaded',
  itemLabelFormatter: (index: number) => `Image ${index + 1}`,
  openLabelFormatter: (label: string) => `Open ${label} preview`,
})

const emit = defineEmits<ImageGalleryEmits>()

const visible = ref(false)
const index = ref(0)
const gridRef = ref<HTMLElement | null>(null)

const list = computed(() => props.items ?? [])

function clampIndex(value: number): number {
  return Math.min(Math.max(0, value), Math.max(0, list.value.length - 1))
}

watch(
  () => props.startIndex,
  (v) => {
    index.value = clampIndex(v ?? 0)
  },
  { immediate: true },
)

// Broken images become a placeholder, in the thumbnail and in the preview, instead of a browser
// broken-image glyph. Keyed by URL, so a host that swaps a failed URL for a new one gets a fresh load.
const failedUrls = ref(new Set<string>())

function markFailed(url: string): void {
  failedUrls.value = new Set(failedUrls.value).add(url)
}

// The preview flies each picture out of its thumbnail and back into it.
function thumbOf(i: number): Element | null {
  return gridRef.value?.children[i] ?? null
}

// The preview is loaded the first time it is about to be needed, so a page of thumbnails carries
// neither it nor its stylesheet until then: pointing at or focusing the gallery starts the load,
// and a press that lands first opens it as soon as it arrives.
const { component: preview, load: startPreviewLoad } = useLazyComponent<typeof TxImagePreviewComponent>(
  () => import('../../image-preview').then(module => module.TxImagePreview),
  () => {
    // The next press tries again; until then the gallery is not left open on nothing.
    if (visible.value) {
      visible.value = false
      emit('close')
    }
  },
)

function loadPreview(): void {
  if (list.value.length > 0)
    startPreviewLoad()
}

function getItemLabel(item: ImageGalleryItem, i: number): string {
  return item.name || props.itemLabelFormatter(i)
}

function openAt(i: number, event: MouseEvent): void {
  if (list.value.length <= 0)
    return

  loadPreview()
  index.value = clampIndex(i)
  // The preview returns focus to whatever had it when it opened; WebKit does not focus a
  // clicked button, so give it the thumbnail explicitly.
  ;(event.currentTarget as HTMLButtonElement | null)?.focus()
  visible.value = true
  const item = list.value[index.value]
  if (item)
    emit('open', { index: index.value, item })
}
</script>

<template>
  <div class="tx-image-gallery" @pointerenter="loadPreview" @focusin="loadPreview">
    <div ref="gridRef" class="tx-image-gallery__grid">
      <button
        v-for="(item, i) in list"
        :key="item.id"
        type="button"
        class="tx-image-gallery__thumb"
        :class="{ 'is-broken': failedUrls.has(item.url) }"
        :aria-label="openLabelFormatter(getItemLabel(item, i))"
        @click="openAt(i, $event)"
      >
        <BrokenImageIcon v-if="failedUrls.has(item.url)" :size="20" :stroke-width="2" />
        <img v-else :src="item.url" :alt="item.name || ''" loading="lazy" @error="markFailed(item.url)">
      </button>
    </div>

    <component
      :is="preview"
      v-if="preview"
      v-bind="previewProps"
      v-model:open="visible"
      v-model:index="index"
      :images="list"
      :failed="failedUrls"
      :origin="thumbOf"
      :label="previewTitle"
      :previous-label="previousLabel"
      :next-label="nextLabel"
      :close-label="closeLabel"
      :zoom-in-label="zoomInLabel"
      :zoom-out-label="zoomOutLabel"
      :reset-label="resetLabel"
      :failed-text="failedText"
      @close="emit('close')"
      @error="markFailed"
      @action="emit('action', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.tx-image-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 10px;
}

.tx-image-gallery__thumb {
  border-radius: 14px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1;
}

// Scoped, this is (0,2,1), which outranks host typography such as `.prose img` margins whatever
// order the sheets load in; a margin there pushes the picture down inside the clipped square.
.tx-image-gallery__thumb img {
  width: 100%;
  height: 100%;
  margin: 0;
  object-fit: cover;
  display: block;
}

// A picture that failed leaves its placeholder, centred on the fill, as in TxAttachmentTray.
.tx-image-gallery__thumb.is-broken {
  display: grid;
  place-items: center;
  background: var(--tx-fill-color, #f0f2f5);
  color: var(--tx-text-color-secondary, #6b7280);
}
</style>

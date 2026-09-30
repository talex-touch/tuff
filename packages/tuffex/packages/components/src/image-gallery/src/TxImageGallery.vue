<script setup lang="ts">
import type { ImageGalleryEmits, ImageGalleryItem, ImageGalleryProps } from './types'
import { computed, nextTick, ref, watch } from 'vue'
import TxModal from '../../modal/src/TxModal.vue'

defineOptions({
  name: 'TxImageGallery',
})

const props = withDefaults(defineProps<ImageGalleryProps>(), {
  startIndex: 0,
  previousLabel: 'Previous image',
  nextLabel: 'Next image',
  previousText: 'Prev',
  nextText: 'Next',
  previewTitle: 'Preview',
  itemLabelFormatter: (index: number) => `Image ${index + 1}`,
  openLabelFormatter: (label: string) => `Open ${label} preview`,
})

const emit = defineEmits<ImageGalleryEmits>()

const visible = ref(false)
const index = ref(0)
const previousButton = ref<HTMLButtonElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)

const list = computed(() => props.items ?? [])

watch(
  () => props.startIndex,
  (v) => {
    index.value = clampIndex(v ?? 0)
  },
  { immediate: true },
)

watch(
  () => list.value.length,
  (length) => {
    if (length <= 0) {
      index.value = 0
      visible.value = false
      return
    }

    index.value = clampIndex(index.value)
  },
)

const current = computed<ImageGalleryItem | null>(() => {
  return list.value[index.value] ?? null
})

function clampIndex(value: number): number {
  return Math.min(Math.max(0, value), Math.max(0, list.value.length - 1))
}

function getItemLabel(item: ImageGalleryItem, i: number): string {
  return item.name || props.itemLabelFormatter(i)
}

function openAt(i: number, event: MouseEvent): void {
  if (list.value.length <= 0)
    return

  index.value = clampIndex(i)
  ;(event.currentTarget as HTMLButtonElement | null)?.focus()
  visible.value = true
  const item = list.value[index.value]
  if (item)
    emit('open', { index: index.value, item })
}

function close(): void {
  visible.value = false
  emit('close')
}

async function prev(): Promise<void> {
  if (index.value <= 0)
    return
  index.value -= 1
  await nextTick()
  if (index.value === 0)
    nextButton.value?.focus()
}

async function next(): Promise<void> {
  if (index.value >= list.value.length - 1)
    return
  index.value += 1
  await nextTick()
  if (index.value === list.value.length - 1)
    previousButton.value?.focus()
}
</script>

<template>
  <div class="tx-image-gallery">
    <div class="tx-image-gallery__grid">
      <button
        v-for="(item, i) in list"
        :key="item.id"
        type="button"
        class="tx-image-gallery__thumb"
        :aria-label="openLabelFormatter(getItemLabel(item, i))"
        @click="openAt(i, $event)"
      >
        <img :src="item.url" :alt="item.name || ''" loading="lazy">
      </button>
    </div>

    <TxModal
      v-model="visible"
      fullscreen
      :title="current?.name || previewTitle"
      @close="close"
    >
      <div v-if="current" class="tx-image-gallery__viewer">
        <img :src="current.url" :alt="current.name || ''">
      </div>

      <template #footer>
        <div class="tx-image-gallery__footer">
          <button ref="previousButton" type="button" class="tx-image-gallery__nav" :aria-label="previousLabel" :disabled="index <= 0" @click="prev">
            {{ previousText }}
          </button>
          <div class="tx-image-gallery__count">
            {{ index + 1 }} / {{ list.length }}
          </div>
          <button ref="nextButton" type="button" class="tx-image-gallery__nav" :aria-label="nextLabel" :disabled="index >= list.length - 1" @click="next">
            {{ nextText }}
          </button>
        </div>
      </template>
    </TxModal>
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

.tx-image-gallery__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

// The body of the fullscreen modal is `flex: 1`; the viewer takes that whole
// box and the image is contained inside it, so `contain` never letterboxes the
// picture out of the viewport on either axis.
.tx-image-gallery__viewer {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tx-image-gallery__viewer img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
}

.tx-image-gallery__footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tx-image-gallery__count {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-image-gallery__nav {
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 8px 12px;
  cursor: pointer;
}

.tx-image-gallery__nav:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

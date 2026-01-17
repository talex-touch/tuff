<script setup lang="ts">
import type { ImageGalleryEmits, ImageGalleryItem, ImageGalleryProps } from './types'
import { computed, ref, watch } from 'vue'
import TxModal from '../../modal/src/TxModal.vue'

defineOptions({
  name: 'TxImageGallery',
})

const props = withDefaults(defineProps<ImageGalleryProps>(), {
  startIndex: 0,
})

const emit = defineEmits<ImageGalleryEmits>()

const visible = ref(false)
const index = ref(0)

const list = computed(() => props.items ?? [])

watch(
  () => props.startIndex,
  (v) => {
    index.value = Math.min(Math.max(0, v ?? 0), Math.max(0, list.value.length - 1))
  },
  { immediate: true },
)

const current = computed<ImageGalleryItem | null>(() => {
  return list.value[index.value] ?? null
})

function openAt(i: number): void {
  index.value = Math.min(Math.max(0, i), Math.max(0, list.value.length - 1))
  visible.value = true
  const item = list.value[index.value]
  if (item)
    emit('open', { index: index.value, item })
}

function close(): void {
  visible.value = false
  emit('close')
}

function prev(): void {
  if (index.value > 0)
    index.value -= 1
}

function next(): void {
  if (index.value < list.value.length - 1)
    index.value += 1
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
        @click="openAt(i)"
      >
        <img :src="item.url" :alt="item.name || ''" loading="lazy">
      </button>
    </div>

    <TxModal v-model="visible" :title="current?.name || 'Preview'" width="min(92vw, 880px)" @close="close">
      <div v-if="current" class="tx-image-gallery__viewer">
        <img :src="current.url" :alt="current.name || ''">
      </div>

      <template #footer>
        <div class="tx-image-gallery__footer">
          <button type="button" class="tx-image-gallery__nav" :disabled="index <= 0" @click="prev">
            Prev
          </button>
          <div class="tx-image-gallery__count">
            {{ index + 1 }} / {{ list.length }}
          </div>
          <button type="button" class="tx-image-gallery__nav" :disabled="index >= list.length - 1" @click="next">
            Next
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

.tx-image-gallery__viewer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tx-image-gallery__viewer img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 14px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
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

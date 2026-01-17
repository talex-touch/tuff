<script setup lang="ts">
import type { ImageUploaderEmits, ImageUploaderFile, ImageUploaderProps } from './types'
import { computed, onBeforeUnmount, ref } from 'vue'

defineOptions({
  name: 'TxImageUploader',
})

const props = withDefaults(defineProps<ImageUploaderProps>(), {
  multiple: true,
  accept: 'image/*',
  disabled: false,
  max: 9,
})

const emit = defineEmits<ImageUploaderEmits>()

const inputRef = ref<HTMLInputElement | null>(null)

const value = computed(() => props.modelValue ?? [])

const objectUrls = new Set<string>()

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function sync(next: ImageUploaderFile[]): void {
  emit('update:modelValue', next)
  emit('change', next)
}

function pick(): void {
  if (props.disabled)
    return
  inputRef.value?.click()
}

function onInputChange(e: Event): void {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''

  if (!files.length)
    return

  const remain = Math.max(0, (props.max ?? 9) - value.value.length)
  const take = remain > 0 ? files.slice(0, remain) : []
  if (!take.length)
    return

  const added: ImageUploaderFile[] = take.map((f) => {
    const url = URL.createObjectURL(f)
    objectUrls.add(url)
    return {
      id: uid(),
      url,
      name: f.name,
      file: f,
    }
  })

  sync([...value.value, ...added])
}

function remove(id: string): void {
  const cur = value.value
  const idx = cur.findIndex(i => i.id === id)
  if (idx < 0)
    return

  const removed = cur[idx]
  if (removed?.file && removed.url && objectUrls.has(removed.url)) {
    URL.revokeObjectURL(removed.url)
    objectUrls.delete(removed.url)
  }

  const next = cur.slice(0, idx).concat(cur.slice(idx + 1))
  emit('update:modelValue', next)
  emit('remove', { id, value: next })
  emit('change', next)
}

onBeforeUnmount(() => {
  for (const url of objectUrls) {
    URL.revokeObjectURL(url)
  }
  objectUrls.clear()
})
</script>

<template>
  <div class="tx-image-uploader" :class="{ 'tx-image-uploader--disabled': disabled }">
    <input
      ref="inputRef"
      class="tx-image-uploader__input"
      type="file"
      :multiple="multiple"
      :accept="accept"
      :disabled="disabled"
      @change="onInputChange"
    >

    <div class="tx-image-uploader__grid">
      <button
        type="button"
        class="tx-image-uploader__add"
        :disabled="disabled || value.length >= (max ?? 9)"
        @click="pick"
      >
        <i class="i-carbon-add" aria-hidden="true" />
        <span class="tx-image-uploader__add-text">Upload</span>
      </button>

      <div
        v-for="item in value"
        :key="item.id"
        class="tx-image-uploader__item"
      >
        <img :src="item.url" :alt="item.name || ''" loading="lazy">
        <button
          type="button"
          class="tx-image-uploader__remove"
          :aria-label="`Remove ${item.name || 'image'}`"
          @click="remove(item.id)"
        >
          <i class="i-carbon-close" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-image-uploader__input {
  display: none;
}

.tx-image-uploader__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 10px;
}

.tx-image-uploader__add {
  border-radius: 14px;
  border: 1px dashed var(--tx-border-color-lighter, #e5e7eb);
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 45%, transparent);
  height: 88px;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #6b7280);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: border-color 150ms ease, background 150ms ease;
}

.tx-image-uploader__add:hover {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
}

.tx-image-uploader__add:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tx-image-uploader__add-text {
  font-size: 12px;
  font-weight: 600;
}

.tx-image-uploader__item {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  height: 88px;
}

.tx-image-uploader__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tx-image-uploader__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border-radius: 10px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 70%, transparent);
  color: var(--tx-text-color-secondary, #6b7280);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 150ms ease;
}

.tx-image-uploader__item:hover .tx-image-uploader__remove {
  opacity: 1;
}

.tx-image-uploader--disabled {
  opacity: 0.7;
}
</style>

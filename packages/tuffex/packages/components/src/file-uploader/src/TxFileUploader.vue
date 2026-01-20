<script setup lang="ts">
import type { FileUploaderEmits, FileUploaderFile, FileUploaderProps } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxFileUploader' })

const props = withDefaults(defineProps<FileUploaderProps>(), {
  multiple: true,
  accept: '*/*',
  disabled: false,
  max: 10,
  showSize: true,
  allowDrop: true,
  buttonText: 'Choose files',
  dropText: 'Drop files here',
  hintText: 'or click to browse',
})

const emit = defineEmits<FileUploaderEmits>()

const inputRef = ref<HTMLInputElement | null>(null)
const dropActive = ref(false)

const value = computed(() => props.modelValue ?? [])

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes))
    return ''
  if (bytes < 1024)
    return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024)
    return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

function sync(next: FileUploaderFile[]): void {
  emit('update:modelValue', next)
  emit('change', next)
}

function addFiles(files: File[]) {
  if (!files.length)
    return
  const remain = Math.max(0, (props.max ?? 10) - value.value.length)
  const take = remain > 0 ? files.slice(0, remain) : []
  if (!take.length)
    return
  const added = take.map(file => ({
    id: uid(),
    name: file.name,
    size: file.size,
    type: file.type,
    file,
  }))
  const next = [...value.value, ...added]
  emit('add', added)
  sync(next)
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
  addFiles(files)
}

function remove(id: string): void {
  const cur = value.value
  const idx = cur.findIndex(i => i.id === id)
  if (idx < 0)
    return
  const next = cur.slice(0, idx).concat(cur.slice(idx + 1))
  emit('remove', { id, value: next })
  sync(next)
}

function onDragOver(e: DragEvent) {
  if (!props.allowDrop || props.disabled)
    return
  e.preventDefault()
  dropActive.value = true
}

function onDragLeave() {
  dropActive.value = false
}

function onDrop(e: DragEvent) {
  if (!props.allowDrop || props.disabled)
    return
  e.preventDefault()
  dropActive.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  addFiles(files)
}

defineExpose({ pick })
</script>

<template>
  <div
    class="tx-file-uploader"
    :class="{ 'is-disabled': disabled, 'is-dragging': dropActive }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <input
      ref="inputRef"
      class="tx-file-uploader__input"
      type="file"
      :multiple="multiple"
      :accept="accept"
      :disabled="disabled"
      @change="onInputChange"
    >

    <div class="tx-file-uploader__drop" role="button" :aria-disabled="disabled" @click="pick">
      <div class="tx-file-uploader__drop-title">
        {{ dropText }}
      </div>
      <div class="tx-file-uploader__drop-hint">
        {{ hintText }}
      </div>
      <button type="button" class="tx-file-uploader__button" :disabled="disabled" @click.stop="pick">
        {{ buttonText }}
      </button>
    </div>

    <div v-if="value.length" class="tx-file-uploader__list">
      <div v-for="item in value" :key="item.id" class="tx-file-uploader__item">
        <div class="tx-file-uploader__meta">
          <span class="tx-file-uploader__name">{{ item.name }}</span>
          <span v-if="showSize" class="tx-file-uploader__size">{{ formatSize(item.size) }}</span>
        </div>
        <button
          type="button"
          class="tx-file-uploader__remove"
          :aria-label="`Remove ${item.name}`"
          :disabled="disabled"
          @click="remove(item.id)"
        >
          <i class="i-carbon-close" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-file-uploader {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--tx-text-color-primary, #303133);

  &.is-disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}

.tx-file-uploader__input {
  display: none;
}

.tx-file-uploader__drop {
  border: 1px dashed var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 14px;
  padding: 18px;
  background: color-mix(in srgb, var(--tx-fill-color, #f5f7fa) 55%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  text-align: center;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.tx-file-uploader.is-dragging .tx-file-uploader__drop {
  border-color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.tx-file-uploader__drop-title {
  font-size: 14px;
  font-weight: 600;
}

.tx-file-uploader__drop-hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-file-uploader__button {
  margin-top: 4px;
  border: none;
  background: var(--tx-color-primary, #409eff);
  color: #fff;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.tx-file-uploader__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tx-file-uploader__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tx-file-uploader__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
}

.tx-file-uploader__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tx-file-uploader__name {
  font-size: 13px;
  font-weight: 600;
}

.tx-file-uploader__size {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-file-uploader__remove {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
}

.tx-file-uploader__remove:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

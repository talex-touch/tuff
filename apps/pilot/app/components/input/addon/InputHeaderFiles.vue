<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  files: IInnerItemMeta[]
}>()

const emit = defineEmits<{
  (e: 'delete', index: number): void
}>()

watchEffect(() => {
  console.log('a', props)
})

function formateSize(num: number) {
  if (num < 1024)
    return `${num}B`
  return `${(num / 1024).toFixed(2)}KB`
}
</script>

<template>
  <div v-if="files.length" class="InputHeader-FileList">
    <div v-for="(file, index) in files" :key="index" :class="{ uploading: file.extra.syncing, uploaded: file.extra.sync, error: file.extra.error }" class="InputHeader-FileItem">
      <div v-if="file.type === 'image'" class="ImageItem">
        <img v-if="file.extra" :src="file.extra.url" :alt="file.extra.file.name">
      </div>
      <!-- {{ file }} -->

      <div class="sync-badge">
        已上传
      </div>

      <div class="sync-status">
        {{ formateSize(file.extra.file.size ?? 0) }}
      </div>

      <div class="close-button" @click="emit('delete', index)">
        <div i-carbon:close />
      </div>

      <div class="mention transition-cubic fake-background">
        <p v-if="file.extra.syncing">
          上传解析中
        </p>
        <p v-if="file.extra.error" text-red>
          {{ file.extra.error }}
        </p>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@keyframes upload_shining {
  0%,
  100% {
    filter: blur(5px);
  }

  50% {
    filter: blur(2px);
  }
}

.InputHeader-FileItem {
  &.uploading {
    img {
      animation: upload_shining 2s infinite linear;
    }
  }

  &.uploaded .sync-badge {
    opacity: 0.85;
  }

  .sync-badge {
    position: absolute;
    padding: 0.125rem 0.25rem;

    top: 0;
    right: 0;

    opacity: 0;
    font-size: 12px;
    border-radius: 0 4px 0 8px;
    background-color: var(--theme-color);
  }

  .sync-status {
    position: absolute;
    padding: 0.125rem 0.25rem;

    left: 0.5rem;
    bottom: 0.25rem;

    opacity: 1;
    font-size: 12px;
    border-radius: 8px;
    backdrop-filter: blur(18px) saturate(180%);
    background-color: var(--el-mask-color-extra-light);
  }

  &.error .mention {
    opacity: 1;
  }

  .mention {
    .uploading & {
      opacity: 1;
    }
    position: absolute;
    display: flex;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    align-items: center;
    justify-content: center;

    opacity: 0;
    font-weight: 600;
    border-radius: 4px;
    color: var(--el-text-color-regular);
    backdrop-filter: blur(18px) saturate(180%) brightness(80%);
  }

  .close-button {
    &:hover {
      color: #fff;
      background-color: var(--el-color-danger);
    }
    z-index: 1;
    position: absolute;

    top: 0;
    right: 0;

    opacity: 0;
    cursor: pointer;
    border-radius: 50%;
    transform: translate(50%, -50%);
    background-color: var(--el-bg-color-page);
  }
  &:hover {
    .close-button {
      opacity: 1;
    }
  }

  img {
    position: relative;

    width: 100%;
    height: 100%;

    min-width: 5rem;
    min-height: 5rem;

    max-width: 300px;
    max-height: 200px;

    object-fit: cover;

    overflow: hidden;
    border-radius: 8px;
  }
  position: relative;

  max-width: 300px;
  max-height: 200px;

  border-radius: 8px;
  border: 1px solid var(--el-border-color);
}

.InputHeader-FileList {
  display: flex;
  flex-wrap: wrap;
  padding: 1rem 0;

  gap: 1rem;

  max-height: 300px;
  .ImageItem {
  }
}
</style>

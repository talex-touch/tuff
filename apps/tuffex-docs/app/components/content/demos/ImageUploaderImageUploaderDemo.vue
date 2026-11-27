<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const files = ref([])

const helper = computed(() => locale.value === 'zh'
  ? '最多选择 4 张图片；预览会使用本地 object URL。'
  : 'Select up to 4 images; previews use local object URLs.')
</script>

<template>
  <div class="image-uploader-demo">
    <TxImageUploader v-model="files" :max="4" accept="image/png,image/jpeg" />
    <p class="image-uploader-demo__helper">
      {{ helper }}
    </p>
  </div>
</template>

<style scoped>
.image-uploader-demo {
  display: grid;
  width: min(420px, 100%);
  gap: 8px;
}

.image-uploader-demo__helper {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const files = ref<any[]>([])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      button: '选择文件',
      drop: '将文件拖拽到这里',
      hint: '或点击浏览文件',
      count: '已选择文件',
      unit: '个',
    }
  }

  return {
    button: 'Choose files',
    drop: 'Drop files here',
    hint: 'or click to browse',
    count: 'Selected files',
    unit: '',
  }
})
</script>

<template>
  <div class="group" style="max-width: 480px;">
    <TxFileUploader
      v-model="files"
      accept=".pdf,.png,.jpg"
      :max="5"
      :button-text="labels.button"
      :drop-text="labels.drop"
      :hint-text="labels.hint"
    />
    <div style="margin-top: 8px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      {{ labels.count }}：{{ files.length }}{{ labels.unit }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const files = ref<any[]>([])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      button: '选择文件',
      drop: '将文件拖拽到这里',
      hint: '或点击浏览 PDF / 图片',
      count: '已选择',
      unit: ' 个文件',
    }
  }

  return {
    button: 'Choose files',
    drop: 'Drop files here',
    hint: 'or browse PDF / images',
    count: 'Selected',
    unit: ' file(s)',
  }
})
</script>

<template>
  <div class="file-uploader-demo">
    <TxFileUploader
      v-model="files"
      accept=".pdf,.png,.jpg"
      :max="5"
      :button-text="labels.button"
      :drop-text="labels.drop"
      :hint-text="labels.hint"
    />
    <div class="file-uploader-demo__count">
      {{ labels.count }}: {{ files.length }}{{ labels.unit }}
    </div>
  </div>
</template>

<style scoped>
.file-uploader-demo {
  width: min(480px, 100%);
}

.file-uploader-demo__count {
  margin-top: 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}
</style>

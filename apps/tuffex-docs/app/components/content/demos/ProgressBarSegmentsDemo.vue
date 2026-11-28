<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

/*
 * Labels ride into each segment's hover tip (`Video · 25%`), so they are the
 * part of the data that must be localized; the values and colours are not.
 */
const segments = computed(() => {
  const zh = locale.value === 'zh'
  return [
    { value: 25, color: 'linear-gradient(90deg, #60a5fa, #34d399)', label: zh ? '视频' : 'Video' },
    { value: 18, color: 'linear-gradient(90deg, #a78bfa, #f472b6)', label: zh ? '图片' : 'Images' },
    { value: 12, color: 'linear-gradient(90deg, #fb7185, #f59e0b)', label: zh ? '文档' : 'Documents' },
  ]
})
</script>

<template>
  <div class="progress-bar-segments-demo">
    <TxProgressBar :segments="segments" :segments-total="100" height="8px" />
  </div>
</template>

<style scoped>
.progress-bar-segments-demo {
  width: 100%;
  /* Room for the tip that rises above a hovered segment. */
  padding-top: 28px;
}
</style>

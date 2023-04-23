<template>
  <span v-if="msg" class="PluginExportMention-Wrapper">
    <el-alert
      :title="msg"
      type="warning"
      :closable="false"
    />
  </span>
</template>

<script>
export default {
  name: "PluginExportMention"
}
</script>

<script setup>
import { ref } from "vue";

const msg = ref()
const messages = [
  "为了保证数据的完整性，请勿操作数据文件夹中的文件。",
  "为了保证导出速度，打包与进度计算同时进行，可能会造成进度条不准确的情况。",
  "导出完成后，会自动打开文件夹。",
  "在导出过程中，不要关闭软件，否则可能会导致导出失败。",
  "注意：导出的文件不要修改，否则可能会导致软件无法正常使用。",
  "需要导出的文件会自动复制到导出文件夹中，不需要手动复制。",
  "进度条会在导出完成后自动消失。",
]

// timer to change
const timer = setInterval(() => {
  const index = Math.floor(Math.random() * messages.length)
  msg.value = messages[index]
}, 5000)
</script>

<style scoped>

</style>
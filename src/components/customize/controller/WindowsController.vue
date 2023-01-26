<template>
  <div class="WindowsController-Container">
    <IconButton @click="closeWindow" icon="close" plain small />
    <IconButton @click="minimizeWindow" icon="subtract" plain small />
  </div>
</template>

<script>
export default {
  name: "WindowsController"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import IconButton from '@comp/button/IconButton.vue'

const props = defineProps(['closeWindow', 'minimizeWindow'])
</script>

<style lang="scss" scoped>
.WindowsController-Container {
  display: flex;

  .IconButton-Container {
    &:last-child {
      border-radius: 0 4px 4px 0;
    }
    border-radius: 4px 0 0 4px;
    background-color: var(--el-fill-color-dark);
  }
}
</style>
<template>
  <div class="MacOSController-Container">
    <remix-icon @click="closeWindow" name="close" />
    <remix-icon @click="minimizeWindow" name="subtract" />
  </div>
</template>

<script>
export default {
  name: "MacOSController"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'

const props = defineProps(['closeWindow', 'minimizeWindow'])
</script>

<style lang="scss" scoped>
.remix {
  &:hover {
    color: var(--el-text-color-primary);
  }
  width: 10px;
  height: 10px;

  margin-left: 10px;
  border-radius: 50%;

  font-size: 10px;
  color: var(--color);
  cursor: pointer;
  background-color: var(--color);
  &:first-child {
    --color: var(--el-color-error);
  }
  &:nth-child(2) {
    --color: var(--el-color-warning);
  }
}
</style>
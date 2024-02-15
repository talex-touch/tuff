<script setup lang="ts">
const props = defineProps<{
  data?: any;
}>();
</script>

<template>
  <div class="BoxItem">
    {{ data.DisplayName.value }}
  </div>
</template>

<style lang="scss">
.BoxItem {
  position: relative;
  padding: 4px 8px;

  width: 100%;
  height: 48px;

  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;

  &:hover {
    background-color: var(--el-color-primary-light-5);
  }
}
</style>

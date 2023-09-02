<script setup name="MarketItem" lang="ts">
const props = defineProps(['item'])
</script>

<template>
  <li  class="MarketItem-Container fake-background">
    {{ item }}
  </li>
</template>

<style scoped lang="scss">
.MarketItem-Container {
  &:hover {
    box-shadow: var(--el-box-shadow-lighter);
  }
  position: relative;

  width: 240px;
  height: 100px;

  border: 1px solid var(--el-border-color);

  cursor: pointer;
  border-radius: 8px;
  //transition: all 0.2s ease-in-out;
}
</style>
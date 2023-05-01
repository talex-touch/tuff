<template>
  <div class="TSelectItem-Container" :class="{ ignore }">
    <slot />
  </div>
</template>

<script>
export default {
  name: "TSelectItem"
}
</script>

<style lang="scss" scoped>

.TSelectItem-Container {
  &:hover {
    background-color: var(--el-fill-color-darker);
  }
  position: relative;
  //margin-bottom: 2px;
  //padding: 0 5px;
  //padding: 6px 15px;

  left: 4px;
  top: 2px;

  width: 120px;
  height: 30px;
  line-height: 28px;
  text-indent: 8px;
  font-size: 14px;

  cursor: pointer;
  user-select: none;
  border-radius: 2px;
  transition: all .25s;
  box-sizing: border-box;
}
</style>
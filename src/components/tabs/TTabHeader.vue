<template>
  <div class="TTabHeader-Container">
    <slot :props="props" />
  </div>
</template>

<script>
export default {
  name: "TTabHeader"
}
</script>

<script setup>
const props = defineProps(['node'])
</script>

<style lang="scss">
.TTabHeader-Container {
  &:after {
    z-index: -1;
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    left: 0;

    background-color: var(--el-fill-color-light);
  }
  z-index: 1;
  position: sticky;
  display: flex;
  //padding: 0 10px;

  align-items: center;

  top: 0;
  left: 0;

  width: 100%;
  //height: 12%;

  box-sizing: border-box;
  //backdrop-filter: blur(10px);
  //background-color: var(--el-fill-color-lighter);
}

.blur .TTabHeader-Container {
  &:after {
    opacity: 0;
  }
  //background-color: transparent;
  //backdrop-filter: blur(10px);
 }
</style>
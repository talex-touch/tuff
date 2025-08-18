<template>
  <div class="TTabHeader-Container fake-background">
    <slot :props="props" />
  </div>
</template>

<script>
export default {
  name: 'TTabHeader'
}
</script>

<script setup>
const props = defineProps(['node'])
</script>

<style lang="scss">
.TTabHeader-Container {
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

.touch-blur .TTabHeader-Container {
  --fake-opacity: 0;
}
</style>

<template>
  <el-scrollbar>
    <div class="View-Container">

      <slot />
    </div>
  </el-scrollbar>
</template>

<script name="View" setup>
defineProps({
  title: {
    type: String,
    default: 'ViewTemplate'
  }
})
</script>

<style lang="scss" scoped>
.View-Header {
  z-index: 100;
  position: sticky;
  display: flex;

  top: 0;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: 4rem;
}

.View-Container {
  position: relative;
  padding: 7px;

  height: 100%;
  width: 100%;

  box-sizing: border-box;
}
</style>
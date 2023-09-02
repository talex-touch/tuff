<template>
  <div class="ViewTemplate-Wrapper">
    <el-scrollbar>
      <div class="View-Container">

        <slot />
      </div>
    </el-scrollbar>
  </div>
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
.ViewTemplate-Wrapper {
  position: relative;
  padding: 0 .2rem;

  height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

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
  padding: .5rem;

  height: 100%;
  width: 100%;

  box-sizing: border-box;
}
</style>
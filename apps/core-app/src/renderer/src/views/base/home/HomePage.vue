<template>
  <div class="Home-Container">
    <HomeBanner />
    <el-scrollbar>
      <div class="Home-Main">
        <HomeContent />
      </div>
    </el-scrollbar>
  </div>
</template>

<script name="HomePage" setup>
import HomeBanner from './HomeBanner.vue'
import HomeContent from './HomeContent.vue'
</script>

<style lang="scss" scoped>
.Home-Main {
  position: relative;
  padding-top: 50%;
  margin-bottom: -5%;

  width: 100%;
}

.Home-Container {
  position: absolute;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>

<template>
  <el-scrollbar>
    <div class="App-Wrapper">
      <div class="TouchMusic-Main">
        <p class="TouchMusic-Title">Home</p>

        <IndexImages />

        <p class="TouchMusic-Title">Trending List</p>
        <div class="TouchMusic-ListContent">
        </div>
      </div>

      <div class="TouchMusic-Sidebar">
        <Header />

        <PlayStation />
      </div>
    </div>

  </el-scrollbar>
</template>

<script setup>
import Header from "./components/music/layout/Header.vue";
import IndexImages from "@comp/display/IndexImages.vue";
import PlayStation from "@comp/display/PlayStation.vue";


</script>

<style lang="scss" scoped>
.TouchMusic-Sidebar {
  position: relative;
  padding-bottom: 10px;
  display: flex;

  flex-direction: column;
  gap: 10px;

  width: 35%;
  height: 100%;

  flex-shrink: 0;

  overflow: hidden;
  box-sizing: border-box;
  border-radius: 18px 0 0 18px;
  background-color: var(--el-fill-color-light);
}

.TouchMusic-Main {
  .TouchMusic-Title {
    font-size: 24px;
    font-weight: 600;
  }
  position: relative;
  padding: 0 20px;

  flex: 1;
  height: 100%;

  box-sizing: border-box;
}


.App-Container {
  :deep(.el-scrollbar__view) {

    height: 100%
  }
  width: 100%;
}

.App-Wrapper {
  position: relative;
  display: flex;

  height: 100vh;
  width: 100%;

  justify-content: space-between;
  align-items: center;

  box-sizing: border-box;
  background-color: var(--el-fill-color-lighter);
}
</style>

<template>
  <div class="NavBar-Wrapper">
    <div class="NavBar-Container">
      <NavBarInner />
    </div>
    <div class="NavBar-View">
      <router-view></router-view>
    </div>

  </div>
</template>

<script>
import NavBarInner from '@comp/layout/NavBarInner.vue'

export default {
  name: "NavBar",
  components: { NavBarInner }
}
</script>

<style lang="scss" scoped>
.NavBar-Wrapper {
  .NavBar-Container {
    position: relative;

    width: 70px;
    height: 100%;

    -webkit-app-region: drag;
    background-color: var(--el-fill-color-light);
  }
  .NavBar-View {
    position: relative;
    //padding: 10px;

    width: calc(100% - 80px);
    height: 100%;

    box-sizing: border-box;
  }
  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
}
</style>
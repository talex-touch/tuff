<template>
  <div class="NavBar-Wrapper">
    <div class="NavBar-Container fake-background">
      <NavBarInner />
    </div>
    <div class="NavBar-View fake-background">
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
.blur .NavBar-Wrapper {
  .NavBar-Container {
    --fake-opacity: .6;
    backdrop-filter: saturate(180%) blur(80px);
  }

  .NavBar-View {
    --fake-opacity: .75;
    backdrop-filter: saturate(180%) blur(100px);
  }
}

.NavBar-Wrapper {
  .NavBar-Container {
    .fullscreen & {
      width: 0;
      opacity: 0;
    }
    z-index: 1;
    position: relative;

    width: 70px;
    height: 100%;

    --fake-radius: 0;
    -webkit-app-region: drag;
    --fake-color: var(--el-fill-color-lighter);
    transition: .25s;
  }
  .NavBar-View {
    .fullscreen & {
      width: 100%;
    }
    z-index: 0;
    position: relative;
    //padding: 10px;

    width: calc(100% - 70px);
    height: 100%;

    box-sizing: border-box;
    --fake-radius: 0;
    --fake-color: var(--el-fill-color-lighter);
    transition: .25s;
  }
  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
}
</style>
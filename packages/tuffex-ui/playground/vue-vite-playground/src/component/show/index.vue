<script setup lang="ts">
import Menu from '../menu/index.vue'
import { routes } from '../../router/index'


</script>

<template>
  <div class="show">
    <div class="center">
      <Menu :menu="routes" />
      <div class="main">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.show {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  .center {
    display: flex;
    height: 100%;
  }

  .main {
    flex: 1;
    padding: 10px;
  }
}
</style>

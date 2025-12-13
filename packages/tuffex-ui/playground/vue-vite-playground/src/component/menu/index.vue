<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'

interface Props {
  menu: any[]
}

defineProps<Props>()

const router = useRouter()
const route = useRoute()

function to(path: string) {
  router.push(path)
}

function formatMenuName(name: string) {
  return name !== '/' ? name.replace('/', '') : '首页'
}
</script>

<template>
  <div class="menu">
    <div
      v-for="item in menu"
      :class="{
        actived: route.path === item.path
      }"
      class="menu-item"
      @click="to(item.path)">
      {{ formatMenuName(item.path) }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.menu {
  position: relative;
  height: 100%;
  width: 200px;
  overflow-y: auto;
  color: #fff;
  background-color: #3b3b3ba0;

  .menu-item {
    cursor: pointer;
    padding: 10px;
    transition: all 0.2s ease-in-out;
    
    &:hover {
      background-color: #616161;
    }
  }
}

.actived {
  background-color: #616161;
}
</style>
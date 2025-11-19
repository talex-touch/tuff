<script>
</script>

<script setup>
import SongItem from '@comp/music/song/SongItem.vue'

const props = defineProps(['res'])

const emits = defineEmits(['close', 'select'])

export default {
  name: 'SearchResults',
}

function close() {
  emits('close')
}

function select(song) {
  emits('select', song)
}
</script>

<template>
  <div class="SearchResults-Container cubic-transition" :class="{ active: res }">
    <span class="SearchResults-Controller" @click="close" />
    <el-scrollbar>
      <div v-if="res?.songs" class="SearchResults-Content">
        <SongItem v-for="(song, index) in res.songs" :key="song.id" :shrink="false" :playing="false" :song="song" @click="select(song)" />
      </div>
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
.SearchResults-Content {
  position: relative;
  padding: 0 10px 0 0;

  width: 100%;

  box-sizing: border-box;
}

.SearchResults-Container {
  .SearchResults-Controller {
    &:hover:before {
      opacity: .75;

      height: 5px;
      width: 20%;
    }
    &:before {
      z-index: 1;
      content: "";
      position: absolute;

      left: 50%;
      top: -40px;

      width: 10%;
      height: 3px;

      opacity: .5;
      cursor: pointer;
      border-radius: 8px;
      transform: translateX(-50%);
      transition: .25s;
      background-color: var(--el-text-color-primary);
    }
    z-index: 10;
    position: absolute;

    left: 0;
    top: 40px;

    width: 100%;
    height: 30px;

  }
  &.active {
    opacity: 1;
    pointer-events: all;
    transform: translateY(0%) scale(1);
  }
  &:after {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    background-color: var(--el-fill-color-light);
  }
  z-index: 50;
  position: relative;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
  transform: translateY(100%) scale(.8);
  box-sizing: border-box;
}

.blur .SearchResults-Container {
  &:after {
    opacity: .75;
  }
}
</style>

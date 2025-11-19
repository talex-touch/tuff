<script>
</script>

<script setup>
import SongItem from '@comp/music/song/SongItem.vue'
import { musicManager } from '@modules/music'
import { useModelWrapper } from '@modules/utils'

const props = defineProps(['modelValue'])

const emit = defineEmits(['update:modelValue'])

export default {
  name: 'PlayList',
}

const playList = musicManager.playManager.playList
const playIndex = musicManager.playManager.playIndex
const active = useModelWrapper(props, emit)
const playing = musicManager.playManager.playStatus
function play(index) {
  if (index === playIndex.value)
    return
  musicManager.playManager.play(index)
}
</script>

<template>
  <div class="PlayList-Container" :class="{ active }">
    <el-scrollbar>
      <SongItem v-for="(item, index) in playList" :key="index" simple :playing="playing" :active="playIndex === index" :shrink="playList.length > 9" :order="index + 1" :song="item" class="song-item" @click="play(index)" />
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
.blur .PlayList-Container {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: .95;
    border-radius: 8px;
    background-color: var(--el-fill-color-light);
  }
  background-color: transparent;
  backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
}
.PlayList-Container {
  &.active {
    transform: scale(1) translateX(0%);
  }
  :deep(.el-scrollbar__view) {
    margin-right: 15px;
  }
  z-index: 100;
  position: absolute;
  padding: 8px;

  width: 40%;
  height: calc(90% - 70px);

  right: 8px;
  bottom: calc(3% + 75px);

  border-radius: 8px;
  box-sizing: border-box;
  box-shadow: var(--el-box-shadow-light);
  background-color: var(--el-fill-color-light);
  transform: scale(0.9) translateX(120%);
  transition: .25s;
}
</style>

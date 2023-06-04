<template>
  <div class="Footer-Music-Function-Button" :class="{ volume: volumeModel }">
    <IconButton @click="volumeModel = !volumeModel" :select="volumeModel" small icon="volume-up" />
    <span class="other-controller">
      <IconButton small icon="dvd" />
      <span @click="playType === 4 ? playType = 1 : playType+=1">
        <IconButton v-if="playType === PlayType.SINGLE" small icon="repeat-one" />
        <IconButton v-if="playType === PlayType.LIST" small icon="order-play" />
        <IconButton v-if="playType === PlayType.CYCLE_LIST" small icon="repeat-2" />
        <IconButton v-if="playType === PlayType.RANDOM" small icon="shuffle" />
      </span>
      <IconButton :select="playListModel" @click="playListModel = !playListModel" small icon="play-list-2" />
    </span>
    <span class="volume-controller">
       <el-slider class="PlayerProgressBar-Container" @input="handleVolumeChange"
                  v-model="volume" :show-tooltip="false" />
      <span>{{ volume }}%</span>
    </span>

    <teleport to="#app">
      <PlayList v-model="playListModel" />
    </teleport>
  </div>
</template>

<script>
import IconButton from '@comp/button/IconButton.vue'

export default {
  name: "FooterFunction",
  components: { IconButton }
}
</script>

<script setup>
import { musicManager, PlayType } from '@modules/music'
import PlayList from '@comp/music/PlayList.vue'
import { ref } from 'vue'

const playListModel = ref(false)
const volumeModel = ref(false)
const playType = musicManager.playManager.playType

const volume = musicManager.playManager.volume
function handleVolumeChange(value) {
  volume.value = value
}
</script>

<style lang="scss" scoped>
.Footer-Music-Function-Button {
  &.volume {
    .other-controller {
      opacity: 0;
      transform: translateX(10px);

      pointer-events: none;
    }
    .volume-controller {

      opacity: 1;
      transform: translateX(-10px);

      pointer-events: unset;
    }
  }
  .other-controller {
    display: flex;
    flex: 1;

    justify-content: space-evenly;

    transition: all 0.2s;
  }
  .volume-controller {
    :deep(.el-slider) {

      --el-slider-height: 3px;
      --el-slider-button-size: 10px;
      --el-slider-button-wrapper-offset: -17px;
    }
    span {
      position: relative;

      top: -1px;
      right: -10px;

      font-size: 12px;

    }
    position: absolute;
    display: flex;

    justify-content: space-between;
    align-items: center;

    width: 100px;

    opacity: 0;
    transform: translateX(10px);

    pointer-events: none;
    transition: all 0.2s;
  }
  position: relative;
  display: flex;

  width: 100%;
  height: 100%;

  align-items: center;
  justify-content: space-around;
}
</style>
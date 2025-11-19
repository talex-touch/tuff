<script>
import IconButton from '@comp/button/IconButton.vue'
</script>

<script setup>
import PlayList from '@comp/music/PlayList.vue'
import { musicManager, PlayType } from '@modules/music'
import { ref } from 'vue'

export default {
  name: 'FooterFunction',
  components: { IconButton },
}

const playListModel = ref(false)
const volumeModel = ref(false)
const playType = musicManager.playManager.playType

const volume = musicManager.playManager.volume
function handleVolumeChange(value) {
  volume.value = value
}
</script>

<template>
  <div class="Footer-Music-Function-Button" :class="{ volume: volumeModel }">
    <IconButton :select="volumeModel" small icon="volume-up" @click="volumeModel = !volumeModel" />
    <span class="other-controller">
      <IconButton small icon="dvd" />
      <span @click="playType === 4 ? playType = 1 : playType += 1">
        <IconButton v-if="playType === PlayType.SINGLE" small icon="repeat-one" />
        <IconButton v-if="playType === PlayType.LIST" small icon="order-play" />
        <IconButton v-if="playType === PlayType.CYCLE_LIST" small icon="repeat-2" />
        <IconButton v-if="playType === PlayType.RANDOM" small icon="shuffle" />
      </span>
      <IconButton :select="playListModel" small icon="play-list-2" @click="playListModel = !playListModel" />
    </span>
    <span class="volume-controller">
      <el-slider
        v-model="volume" class="PlayerProgressBar-Container"
        :show-tooltip="false" @input="handleVolumeChange"
      />
      <span>{{ volume }}%</span>
    </span>

    <teleport to="#app">
      <PlayList v-model="playListModel" />
    </teleport>
  </div>
</template>

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

<script setup>
import IconButton from '@comp/button/IconButton.vue'
import PlayList from '@comp/music/PlayList.vue'
import { musicManager, PlayType } from '@modules/music'
import { ref } from 'vue'

defineOptions({
  name: 'FooterFunction',
})

const playListModel = ref(false)
const volumeModel = ref(false)
const playType = ref(musicManager.playManager.playType)

const volume = musicManager.playManager.volume
function handleVolumeChange(value) {
  volume.value = value
}

function toggleVolume() {
  volumeModel.value = !volumeModel.value
}

function togglePlayList() {
  playListModel.value = !playListModel.value
}

function cyclePlayType() {
  const nextPlayType = playType.value === PlayType.RANDOM ? PlayType.SINGLE : playType.value + 1
  playType.value = nextPlayType
  musicManager.playManager.playType = nextPlayType
}
</script>

<template>
  <div class="Footer-Music-Function-Button" :class="{ volume: volumeModel }">
    <IconButton :select="volumeModel" small icon="volume-up" label="Toggle volume" @click="toggleVolume" />
    <span class="other-controller">
      <IconButton small icon="dvd" label="Open disc view" />
      <IconButton v-if="playType === PlayType.SINGLE" small icon="repeat-one" label="Cycle play mode" @click="cyclePlayType" />
      <IconButton v-if="playType === PlayType.LIST" small icon="order-play" label="Cycle play mode" @click="cyclePlayType" />
      <IconButton v-if="playType === PlayType.CYCLE_LIST" small icon="repeat-2" label="Cycle play mode" @click="cyclePlayType" />
      <IconButton v-if="playType === PlayType.RANDOM" small icon="shuffle" label="Cycle play mode" @click="cyclePlayType" />
      <IconButton :select="playListModel" small icon="play-list-2" label="Toggle playlist" @click="togglePlayList" />
    </span>
    <span class="volume-controller">
      <TxSlider
        v-model="volume" class="PlayerProgressBar-Container"
        :show-tooltip="false" @update:model-value="handleVolumeChange"
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
    :deep(.tx-slider) {
      --tx-slider-height: 3px !important;
      --tx-slider-track-height: 3px !important;
      --tx-slider-thumb-size: 10px !important;
      --tx-slider-thumb-shadow: none;
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

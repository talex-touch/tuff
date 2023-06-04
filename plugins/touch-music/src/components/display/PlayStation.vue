<template>
  <div class="PlayStation-Container" :style="`--img: url('${song?.album?.picUrl}')`" :class="{ active: song }">

    <div class="PlayStation-Music-Main">
      <div class="PlayStation-Music-Image" v-if="song">
        <img :alt="song.name" :src="song.album.picUrl" />
      </div>

      <div class="PlayStation-Music-Main-Info" v-if="song">
        <span class="PlayStation-Music-Main-Info-Name">
          {{ song.name }}
          {{ song.duration }}
        </span>
        <Singers :singers="song.artists" />
      </div>

      <div class="Footer-Music-Action">
        <IconButton plain icon="arrow-left-s" />
        <play-pause v-model="playStatus" />
        <IconButton plain icon="arrow-right-s" />
      </div>
    </div>

  </div>
</template>

<script>
export default {
  name: "PlayStation"
}
</script>

<script setup>
import { ref, watch, reactive, computed } from 'vue'
import Singers from "@comp/music/song/Singers.vue";
import { player } from "@modules/entity/play-manager";
import PlayPause from "@comp/icon/PlayPause.vue";
import IconButton from "@comp/button/IconButton.vue";

const song = computed(() => player.song)
const playStatus = ref(false)

watch(() => playStatus.value, (value) => {
  if (value) {
    player.play()
  } else {
    player.pause()
  }
})
</script>

<style lang="scss" scoped>
.PlayStation-Music-Main {
  .Footer-Music-Action {
    display: flex;
    justify-content: center;
    align-items: center;
    align-self: center;

    margin-top: 20px;
  }
  .PlayStation-Music-Image {
    position: relative;
    display: flex;

    align-items: center;

    cursor: pointer;
    transition: all .15s;
  }
  img {
    width: 128px;
    height: 128px;

    object-fit: cover;

    border-radius: 12px;
  }
  .PlayStation-Music-Main-Info {
    .PlayStation-Music-Main-Info-Name {
      font-size: 24px;
      font-weight: 600;

      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;

      max-width: 100%;
    }
    position: relative;
    margin-top: 20px;

    text-align: center;
    justify-content: space-between;
    align-items: center;
    flex-direction: column;

    font-size: 12px;
  }
  position: relative;
  padding: 10px;
  display: flex;

  justify-content: center;
  align-items: center;
  align-self: center;

  flex-direction: column;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}

.PlayStation-Container {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    border-radius: 18px;
    background-color: var(--el-fill-color-darker);
  }
  &:after {
    z-index: -2;
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    border-radius: 18px;
    filter: blur(50px) saturate(180%);
    background-image: var(--img);
  }
  z-index: 80;
  position: relative;
  display: flex;

  flex-direction: column;
  justify-content: space-between;

  left: 5%;

  width: 90%;
  height: 45%;

  color: var(--el-text-color-primary);
  border-radius: 18px;
  box-sizing: border-box;
  overflow: hidden;
  transition: .25s;
}

html.blur .PlayStation-Container {
  &:before {
    opacity: .5;
  }
}
</style>
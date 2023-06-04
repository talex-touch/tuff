<template>
  <div class="Footer-Container" :class="{ active: song }">
    <div class="Footer-Music-Progress" v-if="song?.progress">
      <!--        <span>-->
      <!--          {{ song?.progress?.now_time }}-->
      <!--        </span>-->
      <PlayProgressBar @change="handleProgressChange" :max="song.progress.total" v-model="song.progress.current" />
      <!--      <span>-->
      <!--          {{ song?.progress?.total_time }}-->
      <!--        </span>-->
    </div>

    <div class="Footer-Music-Main">
      <div @click="screenSongModel = true" class="Footer-Music-Image" v-if="song">
        <img :alt="song?.detail?.song?.name" :src="song?.detail?.song?.al.picUrl" />
        <remix-icon name="arrow-up-s" />
      </div>

      <div class="Footer-Music-Main-Info" v-if="song">
        <span class="Footer-Music-Main-Info-Name">
          {{ song.detail?.song?.name }}
        </span>
        <Singers :singers="song.detail?.song.ar" />
      </div>
    </div>

    <div class="Footer-Music-Action" v-if="song">
      <IconButton plain @click="prevSong" icon="arrow-left-s" />
      <play-pause v-model="playStatus" />
      <IconButton plain @click="nextSong" icon="arrow-right-s" />
    </div>

<!--    <div class="Footer-Music-Function" v-if="song">-->
<!--      <FooterFunction />-->
<!--    </div>-->

    <div ref="lyricRef" class="Footer-Music-Function-Lyric" v-if="song">
      {{ lyric }}
    </div>

    <teleport to="#app">
      <FullScreenLyric v-if="song?.progress" v-model="screenSongModel" />
    </teleport>

  </div>
</template>

<script>
export default {
  name: "Footer"
}
</script>

<script setup>
import { watch, ref } from 'vue'
import { musicManager } from '@modules/music.ts'
import { sleep } from '@modules/utils.ts'
import PlayPause from '../../icon/PlayPause.vue'
import PlayProgressBar from '@comp/music/base/PlayProgressBar.vue'
import RemixIcon from '@comp/icon/RemixIcon.vue'
import FullScreenLyric from '@comp/music/FullScreenLyric.vue'
import FooterFunction from '@comp/music/FooterFunction.vue'
import Singers from '@comp/music/song/Singers.vue'
import IconButton from '@comp/button/IconButton.vue'

const screenSongModel = ref(false)

const song = ref(null)
const _song = musicManager.playManager.song

const playStatus = musicManager.playManager.playStatus

const lyricRef = ref()
const lyric = ref("")
let lyricAnimation = false

function nextSong() {
  musicManager.playManager.nextSong()
}

function prevSong() {
  musicManager.playManager.prevSong()
}

function handleProgressChange(value) {

  _song.value?.changeSeek(Math.round(value))

}

watch(() => _song, async () => {
  song.value = _song.value

  const _lyric = _song.value?.progress?.now_lyric
  if( _lyric?.length && _lyric !== lyric.value ) {
    if( lyricAnimation ) return
    lyricAnimation = true
    const style = lyricRef.value?.style
    if( !style ) return

    style.transform = 'translate(-50%, -5px) scaleX(1.05)'

    await sleep(50)

    style.filter = 'blur(3px)'

    await sleep(50)

    style.opacity = '0'

    await sleep(200)

    style.transform = 'translate(-50%, 5px) scaleX(1.05)'
    lyric.value = _lyric

    await sleep(200)

    style.opacity = '1'

    await sleep(50)

    style.filter = 'blur(0px)'

    await sleep(50)

    style.transform = 'translate(-50%, 0)'

    lyricAnimation = false
  }
}, { deep: true } )

</script>

<style lang="scss" scoped>
.Footer-Music-Function-Lyric {
  z-index: 1;
  position: absolute;
  padding: 2px 6px;

  left: 50%;
  top: -50%;

  width: max-content;
  height: max-content;

  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  background-color: var(--el-fill-color-light);

  transition: .2s;
  transform: translate(-50%, 0);
}

.Footer-Music-Action {
  :deep(.IconButton-Container) {
    position: relative;

    top: 2px;

    transform: scale(1.25);
  }
  position: relative;
  display: flex;

  justify-content: center;
  align-items: center;

  width: 50%;
}

.Footer-Music-Progress {
  :deep(.PlayerProgressBar-Container) {
    padding: 0;
    margin: 0;
    height: 5px;
  }
  position: absolute;
  display: flex;

  align-items: center;
  justify-content: space-around;

  width: 100%;
  top: 100%;

  user-select: none;
  box-sizing: border-box;

  filter: invert(.05);
}

.Footer-Music-Function {
  position: relative;
  display: flex;
  padding: 5px 20px;

  flex-direction: column;

  width: 240px;

  box-sizing: border-box;
}

.Footer-Music-Main {
  .Footer-Music-Image {
    &:hover {
      .remix {
        opacity: 1;
        transform: translate(-50%, -55%);
      }
    }
    .remix {
      position: absolute;

      left: 50%;
      top: 50%;

      opacity: 0;
      font-size: 20px;
      transition: .25s;
      pointer-events: none;
      color: var(--el-text-color-regular);
      transform: translate(-50%, -50%); // eye-view center align
    }
    position: relative;
    display: flex;

    align-items: center;

    cursor: pointer;
    transition: all .15s;
  }
  img {
    &:hover {
      filter: blur(1px) brightness(50%);
    }

    width: 128px;
    height: 128px;

    object-fit: cover;

    border-radius: 12px;
  }
  .Footer-Music-Main-Info {
    .Footer-Music-Main-Info-Name {
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

.Footer-Container {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    border-radius: 18px;
    background-color: var(--el-fill-color-darker);
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
  transition: .25s;
}

html.blur .Footer-Container {
  &:before {
    opacity: .5;
  }
  //backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
}
</style>
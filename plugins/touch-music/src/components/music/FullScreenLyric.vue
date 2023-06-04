<template>
  <div :class="{ active, play: playStatus }" class="FullScreenLyric-Wrapper">

    <BlurBackGround @click="active = false" v-if="_song?.audio?._src" :song="_song" />

    <div class="FullScreenLyric-Header">
      <div class="FullScreenLyric-Header-Content">
        <IconButton @click="changeFullScreen" plain icon="fullscreen" active-icon="fullscreen-exit" />
      </div>
      <div class="Footer-Music-Main-Info-Name">
        {{ _song?.detail?.song?.name }}
      </div>
      <div class="Footer-Music-Main-Info-Artist">
        {{ _song?.detail?.song?.ar[0].name }}
      </div>
    </div>

    <div class="FullScreenLyric-Container">
      <div class="FullScreenLyric-Main">
        <div class="FullScreenLyric-Image">
          <img class="img-bg" :alt="_song?.detail?.song?.name" :src="_song?.detail?.song?.al.picUrl" />
          <img :alt="_song?.detail?.song?.name" :src="_song?.detail?.song?.al.picUrl" />
        </div>

        <div class="FullScreenLyric-Music-Progress">
          <PlayProgressBar @change="handleProgressChange" v-if="_song?.progress" :max="_song.progress.total" v-model="_song.progress.current" />
          <div class="progress-time-wrapper">
            <span>
              {{ _song?.progress?.now_time.substring(0, 5) }}
            </span>
            <span>
              {{ _song?.progress?.total_time }}
            </span>
          </div>
        </div>

        <div class="FullScreenLyric-Controller">
          <IconButton plain @click="musicManager.playManager.prevSong" icon="arrow-left-s" />
          <play-pause v-model="playStatus" />
          <IconButton plain @click="musicManager.playManager.nextSong" icon="arrow-right-s" />
        </div>
      </div>

      <div v-if="_song?._songManager?.wordLyric?.wordLyric" class="FullScreenLyric-Lyrics">
        <LyricScroller />
<!--        <WordLyricScroller />-->
      </div>

      <WavingParticle v-else-if="_song?.audio?._sounds?.[0]?._node" :song="_song" />
    </div>

  </div>
</template>

<script>
export default {
  name: "FullScreenLyric"
}
</script>

<script setup>
import { watch, ref } from 'vue'
import { useModelWrapper } from '@modules/utils'
import { musicManager } from '@modules/music'
import PlayProgressBar from '@comp/music/base/PlayProgressBar.vue'
import WordLyricScroller from '@comp/music/word-lyric/WordLyricScroller.vue'
import WavingParticle from '@comp/music/particle/bg/WavingParticle.vue'
import BlurBackGround from '@comp/music/bg/BlurBackGround.vue'
import IconButton from '@comp/button/IconButton.vue'
import LyricScroller from '@comp/music/word-lyric/leaf/LyricScroller.vue'
import PlayPause from '@comp/icon/PlayPause.vue'

const props = defineProps(['modelValue'])
const emits = defineEmits(['update:modelValue'])

const active = useModelWrapper(props, emits)

const playStatus = musicManager.playManager.playStatus
const _song = musicManager.playManager.song

watch(() => _song.value, () => {
  if( !_song.value )
    active.value = false
})

function changeFullScreen() {
  window.$asyncMainProcessMessage('apply-for', {
    action: 'fullscreen'
  })
}

function handleProgressChange(value) {

  _song.value?.changeSeek(Math.round(value))

}
</script>

<style lang="scss" scoped>
:deep(.WavingParticle-Container) {
  mix-blend-mode: overlay;
  transform: scale(1.25)
}

.FullScreenLyric-Header-Content {
  z-index: 1;
  position: absolute;

  left: 0;
  top: -20px;

  width: 100%;
  height: 50px;

}

.FullScreenLyric-Header {
  .Footer-Music-Main-Info-Name {
    font-size: 26px;
    font-weight: 600;

  }
  .Footer-Music-Main-Info-Artist {
    position: relative;
    margin-top: 1%;

    opacity: .75;
  }
  position: absolute;
  margin-top: 3%;
  padding: 0 10px;

  top: 0;
  left: 0;
  right: 0;
  height: 50px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  color: var(--el-text-color-primary);

  filter: invert(1);
  .dark & {
    filter: invert(0);
  }
  //mix-blend-mode: lighten;
  box-sizing: border-box;
}

.FullScreenLyric-Container {
  position: relative;
  padding: 0 5%;
  display: flex;

  justify-content: center;

  top: 15%;

  height: 85%;

  box-sizing: border-box;
  overflow: hidden;
}

.FullScreenLyric-Lyrics {
  position: relative;
  display: inline-block;

  width: 50%;
  height: 100%;

}

.FullScreenLyric-Main {
  .FullScreenLyric-Controller {
    :deep(.IconButton-Container) {
      transform: scale(1.5)
    }
    position: relative;
    display: flex;

    align-items: center;
    justify-content: center;

    top: 15px;

    width: 50%;
    height: 50px;

    mix-blend-mode: overlay;
    //filter: invert(1);
  }

  .FullScreenLyric-Image {
    img {
      z-index: 1;
      position: relative;

      //min-width: 200px;
      //min-height: 200px;

      height: 100%;
      width: 100%;

      aspect-ratio: 1 / 1;

      object-fit: cover;

      border-radius: 4px;
    }
    img.img-bg {
      .play & {
        animation: breath 2s infinite;
      }
      position: absolute;

      left: 0;
      top: 0;

      //min-width: 200px;
      //min-height: 200px;

      height: 100%;
      width: 100%;

      aspect-ratio: 1 / 1;

      filter: blur(18px) opacity(.5) brightness(.75);
      transform: scale(1.1) translateY(5px);

      border-radius: 4px;
    }
    position: relative;
    display: flex;

    justify-content: center;

    width: 50%;

    aspect-ratio: 1 / 1;

  }
  .FullScreenLyric-Music-Progress {
    z-index: 1;
    .progress-time-wrapper {
      position: absolute;
      padding: 0 5px;
      display: flex;

      justify-content: space-between;

      top: 15px;

      width: 100%;
      height: 10px;

      box-sizing: border-box;
    }
    span {

      font-size: 12px;
    }
    position: relative;

    left: 0;

    //width: 248px;
    width: 55%;

    color: #eee;
    opacity: .75;
  }
  position: relative;
  display: inline-flex;

  flex-direction: column;
  justify-content: center;
  align-items: center;

  width: 50%;
  height: 100%;
}

.FullScreenLyric-Wrapper {
  &.active {
    z-index: 110;
    opacity: 1;
    transform: scale(1) translateY(0%);
    transition: .25s ease-out;
  }
  z-index: -1;
  position: absolute;
  padding: 2% 0;

  box-sizing: border-box;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  transition: .25s ease-in;
  opacity: .5;
  transform: scale(1.2) translateY(150%);
  background-color: var(--el-overlay-color);
}

@keyframes breath {
  0% {
    opacity: 0;
    transform: scale(1.1) translateY(5px);
  }
  50% {
    opacity: 1;
    transform: scale(1.1) translateY(5px);
  }
  100% {
    opacity: 0;
    transform: scale(1.1) translateY(5px);
  }
}
</style>
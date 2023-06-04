<template>
  <div @click="directSongProcess" v-if="lyric.length" ref='dom' class="WordLyricItem" :class="{ isLyric, 'start': lyricOptions.start }">
    <div class="WordLyricItem-Wrapper">
      <span v-if="!isLyric" class="WordLyricItem-Info">
        {{ _info[0].tx }} {{ _info[1].tx }}
      </span>
        <span :style="`--duration: ${item.t[1]}ms`" :data-c="item.c" v-else-if="lyricOptions.text"
              v-for="item in lyricOptions.text" :class="{ 'end': +item.t[0] + +item.t[1] <= progress.current * 1000,'start': +item.t[0] <= progress.current * 1000, 'en': _tLyric }"></span>
        <span class="WordLyricItem-Translate" :style="`--duration: ${_tLyricDuration}ms`" v-if="_tLyric">
        {{ _tLyric }}
      </span>
    </div>

    <div class="WordLyricItem-Time">
      {{ DayJS().startOf('day').add(lyricOptions.time.start_time, 'millisecond').format('mm:ss:SSS') }}
    </div>
  </div>
</template>

<script>
export default {
  name: "WordLyricItem"
}
</script>

<script setup>
import { ref, watch, reactive, computed, inject, onMounted } from 'vue'
import { musicManager } from '@modules/music'
import DayJS from 'dayjs'
import gsap from 'gsap'

const dom = ref()
const isLyric = ref(false)
const emits = defineEmits(['index'])
const props = defineProps(['lyric', 'index'])

const song = musicManager.playManager.song
const progress = song.value.progress

const lyricOptions = reactive({
  text: [],
  time: {
    start_time: 0,
    duration: 0
  },
  start: false
})

onMounted(() => {

  const el = dom.value
  if ( !el ) return

  const rect = el.getBoundingClientRect()

  const offsetTop = rect.top + window.pageYOffset - document.documentElement.clientTop

  gsap.to(el, {
    duration: 0.5,
    // opacity: 1,
    // scale: 1.2,
    scrollTrigger: {
      trigger: el.parentNode.parentNode,
      start: "top " + offsetTop + "px",
      end: "top " + (offsetTop + rect.height) + "px",
      scrub: true,
      markers: true
    }
  })

})
function directSongProcess() {
  // if ( lyricOptions.start ) {
    song.value.audio.seek(lyricOptions.time.start_time / 1000)
  // }
}

const getTransLyric = inject('trans-lyric')

const _tLyric = computed(() => getTransLyric(lyricOptions.time.start_time))
const _tLyricDuration = computed(() => {
  // const t = String(``).split(']')[0]
  // const _t = t.substring(1).replace(".", ":").split(":")

  // const [h, m, ms] = _t
  // return +h * 60 * 60 + +m * 60 + +ms
  return +lyricOptions.time.duration
})

const _info = computed(() => {
  const json = JSON.parse(props.lyric)

  return json.c
})

watch(() => progress, () => {
  lyricOptions.start = lyricOptions.time.start_time <= progress.current * 1000 && (+lyricOptions.time.start_time + +lyricOptions.time.duration) >= progress.current * 1000

  if ( lyricOptions.start && progress.current > 0 ) {
    emits('index', props.index)
  }
}, { deep: true, immediate: true })

watch(() => props.lyric, () => {
  isLyric.value = props.lyric[0] === '['
  if( !isLyric.value ) return

  const time = props.lyric.substring(1, props.lyric.indexOf(']'))

  lyricOptions.time = {
    start_time: time.substring(0, time.indexOf(',')),
    duration: time.substring(time.indexOf(',') + 1)
  }

  let text = props.lyric.substring(props.lyric.indexOf(']') + 1) //.replace("（", "(").replace("）", ")").split("(")

  const resArray = []

  while( text.length ) {

    const index = text.indexOf('(')
    const index2 = text.indexOf(')')
    const index3 = text.indexOf('(', index2)

    const _t = text.substring(index, index3 === -1 ? text.length : index3)

    const t = _t.substring(index + 1, index2)
    const ts = t.split(',')
    const c = _t.substring(index2 + 1)

    text = text.replace(_t, '')

    resArray.push({
      c,
      t: ts
    })

  }

  lyricOptions.text = resArray

}, { immediate: true })
</script>

<style lang="scss" scoped>
@keyframes shine {
  0% {
    opacity: 1;
    background-position: 200% 0;
  }
  100% {
    opacity: 1;
    background-position: 0% 0;
  }
}

@keyframes shadow {
  from {
    opacity: .25;
  }
  to {
    opacity: .75;
    //filter:
    //        drop-shadow(0 0 1px currentColor)
  }
}

.WordLyricItem {
  span:not(.WordLyricItem-Translate) {
    &.start:after {
      top: -1px;
    }
    &:before {
      content: attr(data-c);
      position: relative;

      top: 0;
      left: 0;

      width: max-content;
      opacity: .5;
    }
    &:after {
      content: attr(data-c);
      position: absolute;

      left: 0;

      opacity: 0;
      color: transparent;

      background-image: linear-gradient(to right, var(--theme-word-color, var(--el-fill-color-dark)), var(--theme-word-color, var(--el-fill-color-dark)) 50%, transparent 100%);
      -webkit-background-clip: text;
      background-size: 200% 100%;
      background-repeat: no-repeat;
    }
    position: relative;

    top: 0;

    color: var(--theme-word-color, var(--el-fill-color-dark));

    transition: .25s;
  }
  .start {
    &.end {
      &:before {
        top: 1px;

        opacity: 1;
      }
      &:after {
        display: none;
      }
    }
    &:before {
      z-index: -1;

    }
    &:after {

      animation: shine var(--duration) linear forwards;
    }

  }
}

@keyframes wordShine {
  from {
    filter:
            drop-shadow(0 0 0px currentColor)
            //drop-shadow(-2px -2px 0px currentColor)
            //drop-shadow(2px -2px 0px currentColor)
            //drop-shadow(-2px 2px 0px currentColor)
  ;
  }
  to {
    filter:
            drop-shadow(0 0 8px currentColor)
            //drop-shadow(-2px -2px 4px currentColor)
            //drop-shadow(2px -2px 4px currentColor)
            //drop-shadow(-2px 2px 4px currentColor)
  ;
  }
}

.shine .WordLyricItem .start:not(.end) {
  animation: wordShine var(--duration) linear;
  //filter:
          //drop-shadow(0 0 4px currentColor)
          //drop-shadow(0 0 2px currentColor)
          //drop-shadow(0 0 1px currentColor)
  //drop-shadow(-2px -2px 4px currentColor)
  //drop-shadow(2px -2px 4px currentColor)
  //drop-shadow(-2px 2px 4px currentColor)
;
}

.WordLyricItem {
  &:before {
    content: "";
    position: absolute;

    top: 50%;
    left: 65%;

    width: 10%;
    height: 2px;

    opacity: 0;
    border-radius: 8px;
    background: linear-gradient(to right, var(--theme-word-color, var(--el-fill-color-dark)), transparent 100%);
    transform: translateY(-50%) translateX(20px);
    transition: .25s
  }
  .WordLyricItem-Wrapper {
    &:hover {
      background-color: #ffffff11//var(--el-color-primary-light-9);
    }
    padding: 4px 8px;
    align-items: center;

    width: max-content;
    max-width: 280px;

    border-radius: 8px;
    box-sizing: border-box;
  }
  .WordLyricItem-Translate {
    display: block;
    margin: 4px 0;

    opacity: .25;

    font-size: 16px;

    color: var(--theme-word-color, var(--el-fill-color-dark));
  }
  &.start .WordLyricItem-Translate {
    font-size: 20px;

    animation: shadow var(--duration) linear forwards;
  }

  &.far-away {
    margin: 16px 0;
    font-size: 20px;
    filter: blur(1px);
  }
  &.far {
    margin: 24px 0;
    opacity: 1;
    font-size: 24px;
    filter: blur(1px);
  }
  &.start {
    margin: 32px 0;
    opacity: 1;
    font-size: 28px;
    font-weight: 600;

    line-height: 1.5em;

    filter: blur(0);
  }
  &:hover {
    .WordLyricItem-Time {
      opacity: 1;
      transform: scale(.5) translateX(0);
    }
    &:before {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
    }
    filter: blur(0);
  }
  position: relative;
  margin: 8px 0;

  font-size: 16px;
  //color: var(--theme-word-color, var(--el-fill-color-dark));

  --theme-word-color: #eee; // var(--el-bg-color-overlay);

  cursor: pointer;
  filter: blur(2px);

  height: auto;

  //overflow: hidden;
}

.WordLyricItem-Time {
  position: absolute;
  display: flex;

  align-items: center;

  top: 0;
  right: 0;

  width: max-content;
  height: 100%;

  opacity: 0;
  filter: invert(1);
  transform: scale(.55) translateX(20px);
  transition: .25s;
}
</style>
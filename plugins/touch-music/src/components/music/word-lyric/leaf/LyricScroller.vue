<template>
  <div class="LyricScroller-Container" :class="{ shine }" :style="`--theme-word-color: ${song.colors && song.colors[song.colors.length > 4 ? 1 : 0].color}`">
    <el-scrollbar ref="scroll">
      <WordLyricItem @index="handleIndex"
                     :class="{ 'start': index === ind, 'far-away': index + 2 === ind || index - 2 === ind, 'far': index + 1 === ind || index - 1 === ind }"
                     v-for="(item, index) in wordLyrics || []" :key="index" :index="index" :lyric="item" />
    </el-scrollbar>
  </div>
</template>

<script>
export default {
  name: "WordLyricScroller"
}
</script>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, provide } from 'vue'
import WordLyricItem from '@comp/music/word-lyric/WordLyricItem.vue'
import { musicManager } from '@modules/music'
import { sleep, throttleRef } from '@modules/utils'

const ind = ref(-1)
const scroll = ref()
const wordLyrics = ref([])
const tlyric = ref([])

const shine = throttleRef(false, 2400)
const song = musicManager.playManager.song

const scrollOffset = ref(0)

provide('trans-lyric', (time) => {
  const lyricList = tlyric.value

  let _lyric = ''

  // find the minimum time offset lyric
  lyricList.filter(lyric => lyric.ms <= time).forEach(lyric => {
    _lyric = lyric.lyric
  })

  return _lyric
})

onMounted(() => {

  let draw;

  watch(() => song.value, () => {
    const lyric = song.value?._songManager?.wordLyric?.wordLyric
    if( !lyric ) return

    wordLyrics.value = lyric.split('\n')

    const lyrics = song.value?._songManager?.lyric?.tlyric?.lyric?.split('\n')
    lyrics.forEach(lyrics => {
      const time = lyrics.match(/\[(\d{2}):(\d{2})\.(\d{2,3})]/)
      if( time ) {
        const ms = parseInt(time[1]) * 60 * 1000 + parseInt(time[2]) * 1000 + parseInt(time[3])
        tlyric.value.push({
          ms,
          lyric: lyrics.replace(/\[(\d{2}):(\d{2})\.(\d{2,3})]/, '')
        })
      }
    })

    // // scroller
    // nextTick(() => {
    //
    //   const el = scroll.value.$el.children[0].children[0]
    //   console.log(scroll.value, el)
    //
    //   const rect = el.getBoundingClientRect()
    //
    //
    //   scroll.value.scrollTo( 0, -rect.y )
    //
    // })

    // emphasis shadow
    const audioNode = song.value.audio._sounds[0]._node

    const oCtx = new AudioContext()
    const audioSrc = oCtx.createMediaElementSource(audioNode)
    const analyser = oCtx.createAnalyser()

    audioSrc.connect(analyser)
    analyser.connect(oCtx.destination)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    draw = (analyser, dataArray) => {
      requestAnimationFrame(() => draw(analyser, dataArray))
      analyser.getByteFrequencyData(dataArray)
      const sum = dataArray.reduce((a, b) => a + b, 0)
      const avg = sum / dataArray.length

      shine.value = avg > 100
    }

    draw(analyser, dataArray)
  }, { immediate: true })

})

async function handleIndex(i) {
  if ( ind.value === i ) return
  ind.value = i

  const el = scroll.value.$el.children[0].children[0]
  if ( !el ) return
  const target = el.children[i].offsetTop - 150

  scroll.value.scrollTo( 0, target )

}

</script>

<style lang="scss" scoped>
.LyricScroller-Container {
  :deep(.el-scrollbar__view) {
    margin-top: 100px;
    margin-bottom: 200px;

    width: 100%;
  }
  position: relative;

  width: 100%;
  height: 100%;

  //mix-blend-mode: difference;
  filter: brightness(150%);
  //.dark & {
  //  filter: brightness(80%) invert(.75);
  //}
}
</style>
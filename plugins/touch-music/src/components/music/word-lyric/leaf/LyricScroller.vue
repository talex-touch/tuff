<script>
</script>

<script setup>
import WordLyricItem from '@comp/music/word-lyric/WordLyricItem.vue'
import { musicManager } from '@modules/music'
import { provide, ref, watch } from 'vue'
import { useLyricAudioShine } from '../useLyricAudioShine'

defineOptions({
  name: 'WordLyricScroller',
})

const ind = ref(-1)
const scroll = ref()
const wordLyrics = ref([])
const tlyric = ref([])
const song = musicManager.playManager.song
const { shine } = useLyricAudioShine(song)

function parseTranslatedLyrics(lyrics) {
  if (!lyrics)
    return []

  return lyrics.split('\n').flatMap((line) => {
    const time = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]/)
    if (!time)
      return []

    return [{
      ms: Number.parseInt(time[1]) * 60 * 1000 + Number.parseInt(time[2]) * 1000 + Number.parseInt(time[3].padEnd(3, '0')),
      lyric: line.slice(time[0].length),
    }]
  })
}

provide('trans-lyric', (time) => {
  let translation = ''

  for (const lyric of tlyric.value) {
    if (lyric.ms > time)
      break
    translation = lyric.lyric
  }

  return translation
})

watch(song, (currentSong) => {
  wordLyrics.value = currentSong?._songManager?.wordLyric?.wordLyric?.split('\n') ?? []
  tlyric.value = parseTranslatedLyrics(currentSong?._songManager?.lyric?.tlyric?.lyric)
}, { immediate: true })

function handleIndex(i) {
  if (ind.value === i)
    return

  ind.value = i

  const el = scroll.value?.$el?.querySelector('.tx-scroll__content')
  if (!el)
    return

  scroll.value.scrollTo(0, el.children[i].offsetTop - 150)
}
</script>

<template>
  <div class="LyricScroller-Container" :class="{ shine }" :style="`--theme-word-color: ${song.colors && song.colors[song.colors.length > 4 ? 1 : 0].color}`">
    <TxScroll ref="scroll">
      <WordLyricItem
        v-for="(item, index) in wordLyrics || []"
        :key="index"
        :class="{ 'start': index === ind, 'far-away': index + 2 === ind || index - 2 === ind, 'far': index + 1 === ind || index - 1 === ind }" :index="index" :lyric="item" @index="handleIndex"
      />
    </TxScroll>
  </div>
</template>

<style lang="scss" scoped>
.LyricScroller-Container {
  :deep(.tx-scroll__content) {
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

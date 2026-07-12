<script>
</script>

<script setup>
import WordLyricItem from '@comp/music/word-lyric/WordLyricItem.vue'
import { musicManager } from '@modules/music'
import { onUnmounted, ref, watch } from 'vue'
import { useLyricAudioShine } from './useLyricAudioShine'

defineOptions({
  name: 'WordLyricScroller',
})

const ind = ref(-1)
const scroll = ref()
const wordLyrics = ref([])
const tlyric = ref([])
const song = musicManager.playManager.song
const { shine } = useLyricAudioShine(song)

watch(song, (currentSong) => {
  wordLyrics.value = currentSong?._songManager?.wordLyric?.wordLyric?.split('\n') ?? []
  tlyric.value = currentSong?._songManager?.lyric?.tlyric?.lyric?.split('\n') ?? []
}, { immediate: true })

let task

onUnmounted(() => {
  if (task !== undefined)
    clearTimeout(task)
})

function handleIndex(i) {
  ind.value = i

  if (task !== undefined)
    clearTimeout(task)

  task = setTimeout(() => {
    const el = scroll.value?.$el?.querySelector('.tx-scroll__content')
    if (!el)
      return

    const target = el.children[i].offsetTop - 100
    scroll.value.scrollTo(0, target)
  })
}
</script>

<template>
  <div class="WordLyric-Container" :class="{ shine }" :style="`--theme-word-color: ${song.colors && song.colors[song.colors.length > 4 ? 1 : 0].color}`">
    <TxScroll ref="scroll">
      <WordLyricItem
        v-for="(item, index) in wordLyrics || []" :key="index"
        :tlyric="tlyric[index]"
        :class="{ 'start': index === ind, 'far-away': index + 2 === ind || index - 2 === ind, 'far': index + 1 === ind || index - 1 === ind }" :index="index" :lyric="item" @index="handleIndex"
      />
    </TxScroll>
  </div>
</template>

<style lang="scss" scoped>
.WordLyric-Container {
  :deep(.tx-scroll__content) {
    width: 300px;
  }
  position: relative;

  height: 100%;

  //mix-blend-mode: difference;
  filter: brightness(150%);
  //.dark & {
  //  filter: brightness(80%) invert(.75);
  //}
}
</style>

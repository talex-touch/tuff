<template>
  <div class="Header-Container">
    <el-input v-model="searchState" @blur="searchQuery" placeholder="搜索音乐..." />

  </div>

  <div class="Header-List">
    <SearchResults @select="selectSong" @close="searchResults = null" :res="searchResults" />
  </div>
</template>

<script>
export default {
  name: "Header"
}
</script>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import SearchResults from '@comp/music/layout/SearchResults.vue'
import { SingleSong } from "@modules/entity/song-resolver";
import { axios } from "@modules/axios.js";
import { player } from "@modules/entity/play-manager";

const searchState = ref('')
const searchResults = ref()

async function searchQuery() {
  if( !searchState.value ) return []

  const res = await axios.get('/cloudsearch', { params: { keywords: searchState.value } })
  if( res.code !== 200 ) {

    return console.log("none")

  }

  searchResults.value = res.result
  const songs = res.result.songs

  return songs
}

function selectSong( song ) {
  const singleSong = new SingleSong( song )

  player.addSong( singleSong )

  if ( player.isPause ) {
    player.play()
  }
}
</script>

<style lang="scss" scoped>
.Header-Info {
  i {
    margin-top: -0.5em;
  }
  display: flex;
  padding: 0 8px;
  gap: 16px;

  align-items: center;
  box-sizing: border-box;
}

.Header-List {
  flex: 1;

  overflow: hidden;
}

.Header-Container {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    background-color: var(--el-fill-color-light);
  }
  z-index: 100;
  position: sticky;
  padding: 0 5%;
  display: flex;

  top: 0;
  align-items: center;
  justify-content: space-between;

  width: 100%;
  height: 50px;

  box-sizing: border-box;
}

.blur .Header-Container {
  &:before {
    opacity: 0.75;
    //filter: blur(10px);
  }
  //backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
}
</style>
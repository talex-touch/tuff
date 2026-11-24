<script setup>
import SearchResults from '@comp/music/layout/SearchResults.vue'
import { axios } from '@modules/axios.js'
import { player } from '@modules/entity/play-manager'
import { SingleSong } from '@modules/entity/song-resolver'
import { ref } from 'vue'

defineOptions({
  name: 'TuffMusicHeader',
})

const searchState = ref('')
const searchResults = ref()
const searchError = ref('')

async function searchQuery() {
  if (!searchState.value)
    return []

  searchError.value = ''
  try {
    const res = await axios.get('/cloudsearch', {
      params: { keywords: searchState.value },
    })
    if (res?.code !== 200) {
      searchError.value = '未找到匹配的音乐结果'
      return []
    }

    searchResults.value = res.result
    return res.result?.songs || []
  }
  catch (error) {
    const code = typeof error?.code === 'string' ? error.code : ''
    if (code.includes('PERMISSION')) {
      searchError.value = '缺少 network.internet 权限，无法搜索在线曲库'
    }
    else {
      searchError.value = '音乐搜索失败，请检查网络权限与连接'
    }
    return []
  }
}

function selectSong(song) {
  const singleSong = new SingleSong(song)

  player.addSong(singleSong)

  if (player.isPause) {
    player.play()
  }
}
</script>

<template>
  <div class="Header-Container">
    <TxInput v-model="searchState" placeholder="搜索音乐..." @blur="searchQuery" />
  </div>

  <div class="Header-List">
    <p v-if="searchError" class="Header-Error" role="status">
      {{ searchError }}
    </p>
    <SearchResults
      :res="searchResults"
      @select="selectSong"
      @close="searchResults = null"
    />
  </div>
</template>

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

.Header-Error {
  margin: 8px 16px 0;
  font-size: 12px;
  color: var(--tx-color-danger, #f56c6c);
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

    background-color: var(--tx-fill-color-light);
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

<script name="ApplicationIndex" setup lang="ts">
import AppList from './AppList.vue'
import AppConfigure from './AppConfigure.vue'
import ApplicationEmpty from './ApplicationEmpty.vue'
import { touchChannel } from '~/modules/channel/channel-core'

defineProps<{
  modelValue?: boolean
}>()

const index = ref(-1)
const curSelect = ref()
const appList: any = ref([])
let currentSearchId: string | null = null

let unregisterUpdate: (() => void) | null = null
let unregisterEnd: (() => void) | null = null

onMounted(() => {
  handleSearch('')

  unregisterUpdate = touchChannel.regChannel('core-box:search-update', (channelData) => {
    const { searchId, items } = channelData.data as any
    if (searchId !== currentSearchId) return
    // append to list
    appList.value = [...appList.value, ...items]
  })

  unregisterEnd = touchChannel.regChannel('core-box:search-end', (channelData) => {
    const { searchId } = channelData.data as any
    if (searchId !== currentSearchId) return
    console.log('[ApplicationIndex] Search ended', channelData)
  })
})

onUnmounted(() => {
  unregisterUpdate?.()
  unregisterEnd?.()
})

async function handleSearch(value: string): Promise<void> {
  appList.value = []
  curSelect.value = null
  index.value = -1

  const res = await touchChannel.send('core-box:query', { query: { text: value } })
  currentSearchId = res.sessionId
  appList.value = res.items
}

function handleSelect(item: any, _index: number): void {
  curSelect.value = item
  index.value = _index
}

function handleExecute(item: any): void {
  touchChannel.send('core-box:execute', { item })
}
</script>

<template>
  <div class="ApplicationIndex">
    <div class="ApplicationList">
      <AppList :index="index" @select="handleSelect" @search="handleSearch" :list="appList" />
    </div>
    <div class="ApplicationContent">
      <ApplicationEmpty v-if="!curSelect" />
      <AppConfigure v-else @execute="handleExecute" :data="curSelect" />
    </div>
  </div>
</template>

<style lang="scss">
.ApplicationIndex {
  position: relative;
  display: flex;
  height: 100%;

  .ApplicationList {
    min-width: 200px;
    width: 30%;
    height: 100%;
    border-right: 1px solid var(--el-border-color);

    flex-shrink: 0;
  }

  .ApplicationContent {
    flex: 1;
  }
}
</style>

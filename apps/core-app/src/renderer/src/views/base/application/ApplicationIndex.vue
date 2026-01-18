<script name="ApplicationIndex" setup lang="ts">
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import AppConfigure from './AppConfigure.vue'
import ApplicationEmpty from './ApplicationEmpty.vue'
import AppList from './AppList.vue'

defineProps<{
  modelValue?: boolean
}>()

const index = ref(-1)
const curSelect = ref()
const appList: any = ref([])
let currentSearchId: string | null = null
const transport = useTuffTransport()

let unregisterUpdate: (() => void) | null = null
let unregisterEnd: (() => void) | null = null

onMounted(() => {
  handleSearch('')

  unregisterUpdate = transport.on(CoreBoxEvents.search.update, (channelData) => {
    const { searchId, items } = channelData as any
    if (searchId !== currentSearchId) return
    // append to list
    appList.value = [...appList.value, ...items]
  })

  unregisterEnd = transport.on(CoreBoxEvents.search.end, (channelData) => {
    const { searchId } = channelData as any
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

  const res = await transport.send(CoreBoxEvents.search.query, { query: { text: value } })
  currentSearchId = res.sessionId ?? null
  appList.value = res.items
}

function handleSelect(item: any, _index: number): void {
  curSelect.value = item
  index.value = _index
}

function handleExecute(item: any): void {
  transport.send(CoreBoxEvents.item.execute, { item }).catch(() => {})
}
</script>

<template>
  <div class="ApplicationIndex">
    <div class="ApplicationList">
      <AppList :index="index" :list="appList" @select="handleSelect" @search="handleSearch" />
    </div>
    <div class="ApplicationContent">
      <ApplicationEmpty v-if="!curSelect" />
      <AppConfigure v-else :data="curSelect" @execute="handleExecute" />
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

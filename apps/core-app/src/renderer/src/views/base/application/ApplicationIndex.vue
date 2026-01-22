<script name="ApplicationIndex" setup lang="ts">
import type { ITuffIcon, TuffItem, TuffSearchResult } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import AppConfigure from './AppConfigure.vue'
import type { AppConfigureData } from './AppConfigure.vue'
import ApplicationEmpty from './ApplicationEmpty.vue'
import AppList from './AppList.vue'
import type { AppListItem } from './AppList.vue'

defineProps<{
  modelValue?: boolean
}>()

type AppListEntry = AppListItem & { raw?: TuffItem }

interface SearchUpdatePayload {
  searchId?: string
  items?: TuffItem[]
}

const index = ref(-1)
const curSelect = ref<AppListEntry | null>(null)
const appList = ref<AppListEntry[]>([])
let currentSearchId: string | null = null
const transport = useTuffTransport()

let unregisterUpdate: (() => void) | null = null
let unregisterEnd: (() => void) | null = null

onMounted(() => {
  handleSearch('')

  unregisterUpdate = transport.on(CoreBoxEvents.search.update, (channelData) => {
    const { searchId, items } = channelData as SearchUpdatePayload
    if (searchId !== currentSearchId) return
    const nextItems = items ? items.map(toAppListItem) : []
    // append to list
    appList.value = nextItems.length > 0 ? [...appList.value, ...nextItems] : appList.value
  })

  unregisterEnd = transport.on(CoreBoxEvents.search.end, (channelData) => {
    const { searchId } = channelData as SearchUpdatePayload
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

  const res = (await transport.send(CoreBoxEvents.search.query, {
    query: { text: value }
  })) as TuffSearchResult
  currentSearchId = res.sessionId ?? null
  appList.value = (res.items ?? []).map(toAppListItem)
}

function handleSelect(item: AppListItem | null, _index: number): void {
  curSelect.value = item as AppListEntry | null
  index.value = _index
}

function handleExecute(item: AppConfigureData): void {
  const rawItem = (item as AppListEntry).raw ?? (item as unknown as TuffItem)
  transport.send(CoreBoxEvents.item.execute, { item: rawItem }).catch(() => {})
}

function toAppListItem(item: TuffItem): AppListEntry {
  const iconSource = item.icon ?? item.render?.basic?.icon
  const icon =
    typeof iconSource === 'string'
      ? ({ type: 'url', value: iconSource } as ITuffIcon)
      : (iconSource as ITuffIcon | undefined)
  return {
    name: item.render?.basic?.title ?? item.id,
    icon,
    raw: item
  }
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

<script name="ApplicationIndex" setup lang="ts">
import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { CoreBoxSearchSessionChunk } from '@talex-touch/utils/transport/events/types'
import { useTuffTransport, type StreamController } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import AppConfigure from './AppConfigure.vue'
import type { AppConfigureData } from './AppConfigure.vue'
import ApplicationEmpty from './ApplicationEmpty.vue'
import AppList from './AppList.vue'
import type { AppListItem } from './AppList.vue'
import { devLog } from '~/utils/dev-log'

defineProps<{
  modelValue?: boolean
}>()

type AppListEntry = AppListItem & { raw?: TuffItem }

const index = ref(-1)
const curSelect = ref<AppListEntry | null>(null)
const appList = ref<AppListEntry[]>([])
let currentSearchId: string | null = null
let searchSequence = 0
let activeSearchController: StreamController | null = null
const transport = useTuffTransport()

onMounted(() => {
  void handleSearch('')
})

onUnmounted(() => {
  activeSearchController?.cancel()
  activeSearchController = null
})

async function handleSearch(value: string): Promise<void> {
  const sequence = ++searchSequence
  activeSearchController?.cancel()
  activeSearchController = null
  currentSearchId = null
  appList.value = []
  curSelect.value = null
  index.value = -1

  let streamEnded = false
  try {
    const controller = await transport.stream(
      CoreBoxEvents.search.session,
      {
        query: { text: value },
        activations: null,
        surface: 'application-index'
      },
      {
        onData: (chunk: CoreBoxSearchSessionChunk) => {
          if (sequence !== searchSequence) return
          switch (chunk.type) {
            case 'session':
              currentSearchId = chunk.sessionId
              return
            case 'snapshot':
              if (chunk.sessionId !== currentSearchId) return
              appList.value = (chunk.result.items ?? []).map(toAppListItem)
              return
            case 'update':
              if (chunk.sessionId !== currentSearchId) return
              appList.value = mergeAppItems(appList.value, chunk.items)
              return
            case 'complete':
              if (chunk.sessionId === currentSearchId) {
                devLog('[ApplicationIndex] Search ended', chunk)
              }
          }
        },
        onError: (error) => {
          streamEnded = true
          if (sequence === searchSequence) activeSearchController = null
          if (sequence === searchSequence) devLog('[ApplicationIndex] Search failed', error)
        },
        onEnd: () => {
          streamEnded = true
          if (sequence === searchSequence) activeSearchController = null
        }
      }
    )
    if (sequence !== searchSequence) {
      controller.cancel()
      return
    }
    if (!streamEnded) activeSearchController = controller
  } catch (error) {
    if (sequence === searchSequence) devLog('[ApplicationIndex] Search failed', error)
  }
}

function mergeAppItems(current: AppListEntry[], incoming: TuffItem[]): AppListEntry[] {
  const itemsById = new Map<string, AppListEntry>()
  for (const item of current) itemsById.set(item.raw?.id ?? item.name, item)
  for (const item of incoming) itemsById.set(item.id, toAppListItem(item))
  return [...itemsById.values()]
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
    border-right: 1px solid var(--tx-border-color);

    flex-shrink: 0;
  }

  .ApplicationContent {
    flex: 1;
  }
}
</style>

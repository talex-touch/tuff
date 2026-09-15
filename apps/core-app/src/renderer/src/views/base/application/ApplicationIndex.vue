<script name="ApplicationIndex" setup lang="ts">
import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { CoreBoxSearchSessionChunk } from '@talex-touch/utils/transport/events/types'
import { useTuffTransport, type StreamController } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import AppConfigure from './AppConfigure.vue'
import type { AppConfigureData } from './AppConfigure.vue'
import SettingFileIndexAppIndexManager from '../settings/SettingFileIndexAppIndexManager.vue'
import AppList from './AppList.vue'
import type { AppListItem } from './AppList.vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

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
              appList.value = keepApplications(chunk.result.items ?? []).map(toAppListItem)
              return
            case 'update':
              if (chunk.sessionId !== currentSearchId) return
              appList.value = mergeAppItems(appList.value, keepApplications(chunk.items))
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

/**
 * The session stream is the same one CoreBox uses, so it carries every provider's hits — files
 * included. `surface` only names the caller; it does not narrow the providers. This page lists
 * installed applications, so the source type is what decides membership.
 */
function keepApplications(items: readonly TuffItem[]): TuffItem[] {
  return items.filter((item) => item.source.type === 'application')
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
  const rawItem = item.raw ?? (item as AppListEntry).raw
  if (!rawItem) return
  transport.send(CoreBoxEvents.item.execute, { item: rawItem }).catch(() => {})
}

function toAppListItem(item: TuffItem): AppListEntry {
  const configure = toAppConfigureData(item)
  return {
    name: configure.name ?? item.id,
    icon: configure.icon as ITuffIcon | undefined,
    raw: item,
    configure
  }
}

function toAppConfigureData(item: TuffItem): AppConfigureData {
  const iconSource = item.icon ?? item.render?.basic?.icon
  const icon =
    typeof iconSource === 'string'
      ? ({ type: 'url', value: iconSource } as ITuffIcon)
      : (iconSource as ITuffIcon | undefined)
  const basic = item.render?.basic
  const app = item.meta?.app
  const extension = item.meta?.extension
  const displayName = basic?.title ?? item.id
  const keywordValues = Array.from(
    new Set([...readStringArray(item.meta?.keywords), ...readStringArray(extension?.keyWords)])
  )

  const path = app?.path || item.id
  // Application hits carry their path as the subtitle, so the header would print it twice.
  const description = basic?.description || basic?.subtitle

  return {
    name: displayName,
    desc: description === path ? undefined : description,
    path,
    icon,
    raw: item,
    details: [
      { labelKey: 'appConfigure.details.displayName', value: displayName },
      { labelKey: 'appConfigure.details.source', value: resolveSourceLabel(item) },
      { labelKey: 'appConfigure.details.bundleId', value: displayValue(app?.bundleId) },
      { labelKey: 'appConfigure.details.identityKind', value: displayValue(app?.identityKind) },
      { labelKey: 'appConfigure.details.launchKind', value: displayValue(app?.launchKind) },
      { labelKey: 'appConfigure.details.launchTarget', value: displayValue(app?.launchTarget) },
      { labelKey: 'appConfigure.details.launchArgs', value: displayValue(app?.launchArgs) },
      {
        labelKey: 'appConfigure.details.workingDirectory',
        value: displayValue(app?.workingDirectory)
      },
      { labelKey: 'appConfigure.details.displayPath', value: displayValue(app?.displayPath) },
      {
        labelKey: 'appConfigure.details.keywords',
        value: keywordValues.length > 0 ? keywordValues.join(', ') : '-'
      }
    ]
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

/**
 * The provider id (`app-provider`) is an internal identifier, not something to print. Search hits
 * are projected from the index and arrive without `source.name`, so fall back to the localized
 * source-type label rather than leaking the id.
 */
function resolveSourceLabel(item: TuffItem): string {
  const explicit = item.source.name?.trim()
  if (explicit && explicit !== item.source.id) return explicit
  const typeKey = `coreBox.sourceTypes.${item.source.type}`
  const translated = t(typeKey)
  return translated === typeKey ? displayValue(item.source.type) : translated
}

function displayValue(value: string | undefined): string {
  return value?.trim() || '-'
}
</script>

<template>
  <div class="ApplicationIndex">
    <div class="ApplicationList">
      <AppList :index="index" :list="appList" @select="handleSelect" @search="handleSearch" />
    </div>
    <div class="ApplicationContent">
      <!--
        With nothing selected the detail pane shows the index manager rather than a placeholder:
        managing which directories are scanned is the other half of this page, and it had no
        entry of its own once `/application` stopped being a sidebar destination.
      -->
      <TxScroll v-if="!curSelect" class="ApplicationContent-Manager">
        <div class="ApplicationContent-Manager-Inner">
          <SettingFileIndexAppIndexManager />
        </div>
      </TxScroll>
      <AppConfigure
        v-else
        :data="
          curSelect.configure ?? { name: curSelect.name, icon: curSelect.icon, raw: curSelect.raw }
        "
        @execute="handleExecute"
      />
    </div>
  </div>
</template>

<style lang="scss">
.ApplicationIndex {
  position: relative;
  display: flex;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.ApplicationIndex .ApplicationList {
  min-width: 200px;
  width: 30%;
  height: 100%;
  min-height: 0;
  border-right: 1px solid var(--tx-border-color);
  flex-shrink: 0;
}

.ApplicationIndex .ApplicationContent {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.ApplicationIndex .ApplicationContent-Manager {
  width: 100%;
  height: 100%;
}

.ApplicationIndex .ApplicationContent-Manager-Inner {
  padding: 1rem;
}
</style>

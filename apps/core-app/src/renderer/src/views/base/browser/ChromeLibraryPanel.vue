<script setup lang="ts">
import type {
  ChromeBookmarkNode,
  ChromeTab
} from '@talex-touch/utils/transport/sdk/domains/browser-connection'
import type { ChromeBookmarkDialogMode } from './ChromeBookmarkDialog.vue'
import { TxButton, TxIconButton } from '@talex-touch/tuffex/button'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { TxVirtualList } from '@talex-touch/tuffex/virtual-list'
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  browserProfileStatus,
  canEditBookmark,
  isOpenableBrowserUrl,
  normalizeBrowserUrlInput,
  useBrowserConnection
} from '~/modules/browser-connection/useBrowserConnection'
import ChromeBookmarkDialog from './ChromeBookmarkDialog.vue'

/**
 * The selected Chrome profile inside the Browser library: its real bookmark tree (navigable
 * folders, create / edit / move / delete written back to Chrome through Main's queue) and its
 * live tabs (activate / navigate / move / close happen in Chrome). Opening something here in Tuff
 * is always an explicit copy, in Tuff's own browsing session with its own website sign-ins.
 */
const props = defineProps<{
  active: boolean
  currentPage: { title: string; url: string } | null
  openInTuff: (url: string) => Promise<boolean>
}>()

const { t } = useI18n()
const connection = useBrowserConnection()
const { state, activeProfile, busy, describeError, sdk } = connection
const view = ref<'bookmarks' | 'tabs' | 'cookies'>('bookmarks')

const PRESET_DOMAINS = [
  { label: 'GitHub', domain: 'github.com', icon: 'i-simple-icons-github' },
  { label: 'Linux.do', domain: 'linux.do', icon: 'i-ri-terminal-box-line' },
  { label: 'Notion', domain: 'notion.so', icon: 'i-simple-icons-notion' },
  { label: 'Google', domain: 'google.com', icon: 'i-simple-icons-google' },
  { label: '知乎', domain: 'zhihu.com', icon: 'i-simple-icons-zhihu' },
  { label: '哔哩哔哩', domain: 'bilibili.com', icon: 'i-simple-icons-bilibili' },
  { label: 'Figma', domain: 'figma.com', icon: 'i-simple-icons-figma' }
]

const selectedDomains = ref<string[]>(['github.com', 'linux.do'])
const customDomainInput = ref('')
const confirmationPassword = ref('')
const cookieImportResult = ref<{ count: number; domains: string[] } | null>(null)
const cookieImportError = ref('')
const cookieImporting = ref(false)

function toggleDomain(domain: string) {
  if (selectedDomains.value.includes(domain)) {
    selectedDomains.value = selectedDomains.value.filter((d) => d !== domain)
  } else {
    selectedDomains.value.push(domain)
  }
}

function selectAllPresets() {
  selectedDomains.value = Array.from(
    new Set([...selectedDomains.value, ...PRESET_DOMAINS.map((p) => p.domain)])
  )
}

function clearSelectedDomains() {
  selectedDomains.value = []
}

function addCustomDomain() {
  const trimmed = customDomainInput.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  if (trimmed && !selectedDomains.value.includes(trimmed)) {
    selectedDomains.value.push(trimmed)
  }
  customDomainInput.value = ''
}

function removeDomain(domain: string) {
  selectedDomains.value = selectedDomains.value.filter((d) => d !== domain)
}

async function runBatchImportCookies() {
  if (!profile.value || selectedDomains.value.length === 0 || cookieImporting.value) return
  cookieImporting.value = true
  cookieImportError.value = ''
  cookieImportResult.value = null
  try {
    const res = await connection.importCookies(
      profile.value.id,
      { domains: selectedDomains.value },
      confirmationPassword.value || undefined
    )
    cookieImportResult.value = { count: res.importedCount, domains: res.domains }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    cookieImportError.value = describeError(msg)
  } finally {
    cookieImporting.value = false
  }
}
const folderId = ref<string | null>(null)
const error = ref('')
const dialogOpen = ref(false)
const dialogMode = ref<ChromeBookmarkDialogMode>('create-bookmark')
const dialogNode = ref<ChromeBookmarkNode | null>(null)
const removeTarget = ref<ChromeBookmarkNode | null>(null)
const removeConfirmed = ref(false)
const tabUrlOpen = ref(false)
const tabUrlTarget = ref<ChromeTab | null>(null)
const tabUrl = ref('')
const tabUrlError = ref('')
const tabUrlId = useId()

const profile = computed(() => activeProfile.value)
const nodes = computed(() => profile.value?.bookmarks ?? [])
const byId = computed(() => new Map(nodes.value.map((node) => [node.id, node])))
const childrenByParent = computed(() => {
  const map = new Map<string, ChromeBookmarkNode[]>()
  for (const node of nodes.value) {
    if (node.parentId === null) continue
    const list = map.get(node.parentId) ?? []
    list.push(node)
    map.set(node.parentId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.index - b.index)
  return map
})
/** Chrome's invisible root ('0') is skipped: its children (Bookmarks Bar, Other…) are the top. */
const rootId = computed(() => nodes.value.find((node) => node.parentId === null)?.id ?? null)
const currentFolder = computed(() =>
  folderId.value ? (byId.value.get(folderId.value) ?? null) : null
)
const entries = computed(() =>
  rootId.value === null
    ? []
    : (childrenByParent.value.get(currentFolder.value?.id ?? rootId.value) ?? [])
)
const breadcrumb = computed(() => {
  const trail: ChromeBookmarkNode[] = []
  let node = currentFolder.value
  while (node && node.parentId !== null) {
    trail.unshift(node)
    node = byId.value.get(node.parentId) ?? null
  }
  return trail
})
const connected = computed(() => profile.value?.status === 'connected')
const canAddHere = computed(() => Boolean(currentFolder.value?.canAddChildren))
const canSavePage = computed(() => canAddHere.value && isOpenableBrowserUrl(props.currentPage?.url))
/**
 * Windows flattened into one row list (a heading row, then its tabs in Chrome's order), so a profile
 * with thousands of tabs mounts only the rows on screen.
 */
type TabRow =
  | { key: string; kind: 'window'; windowNumber: number }
  | { key: string; kind: 'tab'; tab: ChromeTab; first: boolean; last: boolean }
const tabRows = computed<TabRow[]>(() => {
  const windows = new Map<number, ChromeTab[]>()
  for (const tab of profile.value?.tabs ?? []) {
    const list = windows.get(tab.windowId) ?? []
    list.push(tab)
    windows.set(tab.windowId, list)
  }
  const rows: TabRow[] = []
  let windowNumber = 0
  for (const [windowId, tabs] of windows) {
    tabs.sort((a, b) => a.index - b.index)
    windowNumber += 1
    rows.push({ key: `window:${windowId}`, kind: 'window', windowNumber })
    tabs.forEach((tab, index) =>
      rows.push({
        key: `tab:${tab.id}`,
        kind: 'tab',
        tab,
        first: index === 0,
        last: index === tabs.length - 1
      })
    )
  }
  return rows
})
/** Rows are a fixed height for the virtual list; the viewport grows with content up to a cap. */
const ROW_HEIGHT = 56
const MAX_LIST_HEIGHT = 480
const bookmarkListHeight = computed(() =>
  Math.min(entries.value.length * ROW_HEIGHT, MAX_LIST_HEIGHT)
)
const tabListHeight = computed(() => Math.min(tabRows.value.length * ROW_HEIGHT, MAX_LIST_HEIGHT))
const tabsPending = computed(() => Array.from(busy).some((key) => key.startsWith('tab:')))
const removeDescendants = computed(() => {
  const target = removeTarget.value
  if (!target || target.url !== null) return 0
  let count = 0
  const stack = [...(childrenByParent.value.get(target.id) ?? [])]
  while (stack.length) {
    const node = stack.pop()!
    count += 1
    stack.push(...(childrenByParent.value.get(node.id) ?? []))
  }
  return count
})

/** Removing a folder also removes everything inside; any immutable descendant blocks it in Main. */
function canRemove(node: ChromeBookmarkNode): boolean {
  if (!canEditBookmark(node)) return false
  const stack = [...(childrenByParent.value.get(node.id) ?? [])]
  while (stack.length) {
    const child = stack.pop()!
    if (!child.modifiable || child.folderType) return false
    stack.push(...(childrenByParent.value.get(child.id) ?? []))
  }
  return true
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function openDialog(mode: ChromeBookmarkDialogMode, node: ChromeBookmarkNode | null = null): void {
  dialogMode.value = mode
  dialogNode.value = node
  dialogOpen.value = true
}

async function openCopy(url: string): Promise<void> {
  error.value = ''
  if (!isOpenableBrowserUrl(url)) {
    error.value = t('chromeLibrary.notOpenable')
    return
  }
  await props.openInTuff(url)
}

async function runTab(command: Parameters<typeof connection.tab>[1]): Promise<boolean> {
  const current = profile.value
  if (!current) return false
  error.value = ''
  const failure = await connection.tab(current.id, command)
  if (failure) error.value = describeError(failure)
  return !failure
}

async function runRefresh(): Promise<void> {
  const current = profile.value
  if (!current) return
  error.value = ''
  const failure = await connection.run(`refresh:${current.id}`, () => sdk.refresh(current.id))
  if (failure) error.value = describeError(failure)
}

async function selectProfile(profileId: string): Promise<void> {
  error.value = ''
  const failure = await connection.run('select', () => sdk.selectProfile(profileId))
  if (failure) error.value = describeError(failure)
}

function askRemove(node: ChromeBookmarkNode): void {
  removeConfirmed.value = false
  removeTarget.value = node
}

async function confirmRemove(): Promise<void> {
  const target = removeTarget.value
  const current = profile.value
  if (!target || !current) return
  const recursive = removeDescendants.value > 0
  if (recursive && !removeConfirmed.value) return
  error.value = ''
  const failure = await connection.bookmark(current.id, {
    kind: 'remove',
    id: target.id,
    ...(recursive ? { recursive: true } : {})
  })
  if (failure) {
    error.value = describeError(failure)
    return
  }
  removeTarget.value = null
}

function openTabUrl(tab: ChromeTab | null): void {
  tabUrlTarget.value = tab
  tabUrl.value = tab?.url && isOpenableBrowserUrl(tab.url) ? tab.url : ''
  tabUrlError.value = ''
  tabUrlOpen.value = true
}

async function submitTabUrl(): Promise<void> {
  const target = normalizeBrowserUrlInput(tabUrl.value)
  if (!target) {
    tabUrlError.value = t('chromeLibrary.dialog.urlInvalid')
    return
  }
  const tab = tabUrlTarget.value
  const ok = await runTab(
    tab ? { kind: 'navigate', id: tab.id, url: target } : { kind: 'create', url: target }
  )
  if (ok) tabUrlOpen.value = false
  else tabUrlError.value = error.value
}

// A folder deleted in Chrome, or a profile switch, falls back to the top instead of a dead view.
watch([currentFolder, () => profile.value?.id], ([folder, profileId], [, previousProfile]) => {
  if (profileId !== previousProfile || (folderId.value && !folder)) folderId.value = null
})
watch(
  () => props.active,
  (active) => {
    if (active) return
    dialogOpen.value = false
    removeTarget.value = null
    tabUrlOpen.value = false
  }
)
</script>

<template>
  <section class="flex flex-col gap-4" :aria-label="t('chromeLibrary.title')">
    <div
      v-if="!state && connection.loading.value"
      class="flex flex-col gap-2"
      aria-busy="true"
      :aria-label="t('browserConnection.loading')"
    >
      <TxSkeleton width="40%" :height="18" :radius="6" />
      <TxSkeleton width="100%" :height="48" :radius="12" />
      <TxSkeleton width="100%" :height="48" :radius="12" />
    </div>
    <div v-else-if="!state" role="alert" class="flex flex-col items-start gap-2 py-6">
      <p class="m-0 text-sm text-[var(--tx-text-color-regular)]">
        {{ t('browserConnection.loadFailed') }}
        {{ describeError(connection.loadError.value) }}
      </p>
      <TxButton variant="flat" size="sm" icon="i-ri-refresh-line" @click="connection.load()">
        {{ t('browserConnection.retry') }}
      </TxButton>
    </div>
    <div v-else-if="!profile" class="flex flex-col items-start gap-3 py-6">
      <p class="m-0 text-sm text-[var(--tx-text-color-regular)]">
        {{ t(state.profiles.length ? 'chromeLibrary.chooseProfile' : 'chromeLibrary.noProfile') }}
      </p>
      <div v-if="state.profiles.length" class="flex flex-wrap gap-2">
        <TxButton
          v-for="item in state.profiles"
          :key="item.id"
          variant="flat"
          size="sm"
          icon="i-ri-chrome-line"
          :disabled="busy.has('select')"
          @click="selectProfile(item.id)"
        >
          {{ item.label }}
        </TxButton>
      </div>
      <p v-else class="m-0 text-xs text-[var(--tx-text-color-regular)]">
        {{ t('chromeLibrary.connectHint') }}
      </p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <span class="i-ri-chrome-line inline-flex h-5 w-5 flex-none" aria-hidden="true" />
        <strong class="min-w-0 truncate text-sm font-medium">{{ profile.label }}</strong>
        <TxStatusBadge
          :text="t(browserProfileStatus(profile).label)"
          :status="browserProfileStatus(profile).tone"
          size="sm"
        />
        <span
          v-if="profile.pendingCount"
          role="status"
          class="text-xs text-[var(--tx-color-warning)]"
          >{{ t('browserConnection.profiles.pending', { count: profile.pendingCount }) }}</span
        >
        <span class="flex-1" />
        <TxButton
          variant="ghost"
          size="sm"
          icon="i-ri-refresh-line"
          :disabled="!connected || busy.has(`refresh:${profile.id}`)"
          :title="connected ? undefined : t('browserConnection.profiles.refreshOffline')"
          @click="runRefresh"
        >
          {{ t('browserConnection.profiles.refresh') }}
        </TxButton>
      </div>
      <p
        v-if="profile.conflicts.length"
        role="status"
        class="m-0 text-xs text-[var(--tx-color-danger)]"
      >
        {{ t('chromeLibrary.conflictHint', { count: profile.conflicts.length }) }}
      </p>
      <p
        v-if="profile.error"
        role="alert"
        class="m-0 break-words text-xs text-[var(--tx-color-danger)]"
      >
        {{ describeError(profile.error) }}
      </p>
      <p v-if="error" role="alert" class="m-0 break-words text-xs text-[var(--tx-color-danger)]">
        {{ error }}
      </p>

      <div class="flex gap-2">
        <TxButton
          :variant="view === 'bookmarks' ? 'flat' : 'ghost'"
          size="sm"
          :aria-pressed="view === 'bookmarks'"
          icon="i-ri-bookmark-line"
          @click="view = 'bookmarks'"
          >{{ t('chromeLibrary.bookmarks') }}</TxButton
        >
        <TxButton
          :variant="view === 'tabs' ? 'flat' : 'ghost'"
          size="sm"
          :aria-pressed="view === 'tabs'"
          icon="i-ri-window-line"
          @click="view = 'tabs'"
          >{{ t('chromeLibrary.tabs', { count: profile.tabs.length }) }}</TxButton
        >
        <TxButton
          :variant="view === 'cookies' ? 'flat' : 'ghost'"
          size="sm"
          :aria-pressed="view === 'cookies'"
          icon="i-ri-key-line"
          @click="view = 'cookies'"
          >{{ t('chromeLibrary.cookies.title') }}</TxButton
        >
      </div>

      <template v-if="view === 'bookmarks'">
        <nav class="flex flex-wrap items-center gap-1" :aria-label="t('chromeLibrary.folderPath')">
          <TxButton
            variant="ghost"
            size="sm"
            icon="i-ri-home-4-line"
            :aria-current="currentFolder ? undefined : 'location'"
            @click="folderId = null"
            >{{ t('chromeLibrary.allBookmarks') }}</TxButton
          >
          <template v-for="(crumb, index) in breadcrumb" :key="crumb.id">
            <span class="i-ri-arrow-right-s-line inline-flex h-4 w-4" aria-hidden="true" />
            <TxButton
              variant="ghost"
              size="sm"
              :aria-current="index === breadcrumb.length - 1 ? 'location' : undefined"
              @click="folderId = crumb.id"
              >{{ crumb.title || t('chromeLibrary.untitledFolder') }}</TxButton
            >
          </template>
        </nav>

        <div v-if="currentFolder" class="flex flex-wrap gap-2">
          <TxButton
            variant="flat"
            size="sm"
            icon="i-ri-bookmark-3-line"
            :disabled="!canAddHere"
            @click="openDialog('create-bookmark')"
            >{{ t('chromeLibrary.newBookmark') }}</TxButton
          >
          <TxButton
            variant="ghost"
            size="sm"
            icon="i-ri-folder-add-line"
            :disabled="!canAddHere"
            @click="openDialog('create-folder')"
            >{{ t('chromeLibrary.newFolder') }}</TxButton
          >
          <TxButton
            variant="ghost"
            size="sm"
            icon="i-ri-add-box-line"
            :disabled="!canSavePage"
            :title="
              canSavePage
                ? currentPage?.url
                : t(canAddHere ? 'chromeLibrary.pageUnavailable' : 'chromeLibrary.folderReadOnly')
            "
            @click="openDialog('save-page')"
            >{{ t('chromeLibrary.saveCurrentHere') }}</TxButton
          >
        </div>
        <p
          v-if="currentFolder && !canAddHere"
          class="m-0 text-xs text-[var(--tx-text-color-regular)]"
        >
          {{ t('chromeLibrary.folderReadOnly') }}
        </p>

        <p
          v-if="!entries.length"
          class="m-0 py-6 text-center text-sm text-[var(--tx-text-color-regular)]"
        >
          {{ t(rootId === null ? 'chromeLibrary.notSynced' : 'chromeLibrary.folderEmpty') }}
        </p>
        <TxVirtualList
          v-else
          :items="entries"
          :item-height="ROW_HEIGHT"
          :height="bookmarkListHeight"
          item-key="id"
          :aria-label="t('chromeLibrary.bookmarks')"
        >
          <template #item="{ item: node }">
            <div
              class="flex h-full w-full items-center gap-2 rounded-xl px-2 hover:bg-[var(--tx-fill-color-light)]"
            >
              <button
                v-if="node.url === null"
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1.5 text-left focus-visible:outline-2 focus-visible:outline-[var(--tx-color-primary)]"
                :aria-label="
                  t('chromeLibrary.openFolder', {
                    title: node.title || t('chromeLibrary.untitledFolder')
                  })
                "
                @click="folderId = node.id"
              >
                <span class="i-ri-folder-3-line inline-flex h-5 w-5 flex-none" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm">{{
                    node.title || t('chromeLibrary.untitledFolder')
                  }}</span>
                  <span class="block text-xs text-[var(--tx-text-color-regular)]">{{
                    t('chromeLibrary.itemCount', {
                      count: childrenByParent.get(node.id)?.length ?? 0
                    })
                  }}</span>
                </span>
                <span class="i-ri-arrow-right-s-line inline-flex h-4 w-4" aria-hidden="true" />
              </button>
              <div v-else class="flex min-w-0 flex-1 items-center gap-3 py-1.5" :title="node.url">
                <span class="i-ri-global-line inline-flex h-5 w-5 flex-none" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm">{{ node.title || node.url }}</span>
                  <span class="block truncate text-xs text-[var(--tx-text-color-regular)]">{{
                    isOpenableBrowserUrl(node.url)
                      ? node.url
                      : t('chromeLibrary.notOpenableUrl', { url: node.url })
                  }}</span>
                </span>
              </div>
              <template v-if="node.url !== null">
                <TxIconButton
                  icon="i-ri-external-link-line"
                  size="sm"
                  :label="t('chromeLibrary.openCopyInTuff', { title: node.title || node.url })"
                  :disabled="!isOpenableBrowserUrl(node.url)"
                  @click="openCopy(node.url)"
                />
                <TxIconButton
                  icon="i-ri-chrome-line"
                  size="sm"
                  :label="t('chromeLibrary.openInChrome', { title: node.title || node.url })"
                  :disabled="!connected || !isOpenableBrowserUrl(node.url) || tabsPending"
                  @click="runTab({ kind: 'create', url: node.url })"
                />
              </template>
              <TxIconButton
                icon="i-ri-edit-line"
                size="sm"
                :label="t('chromeLibrary.edit', { title: node.title || node.url || '' })"
                :disabled="!canEditBookmark(node)"
                @click="openDialog('edit', node)"
              />
              <TxIconButton
                icon="i-ri-folder-transfer-line"
                size="sm"
                :label="t('chromeLibrary.move', { title: node.title || node.url || '' })"
                :disabled="!canEditBookmark(node)"
                @click="openDialog('move', node)"
              />
              <TxIconButton
                icon="i-ri-delete-bin-line"
                size="sm"
                :label="t('chromeLibrary.remove', { title: node.title || node.url || '' })"
                :disabled="!canRemove(node)"
                @click="askRemove(node)"
              />
            </div>
          </template>
        </TxVirtualList>
      </template>

      <template v-else-if="view === 'tabs'">
        <div class="flex flex-wrap items-center gap-2">
          <TxButton
            variant="flat"
            size="sm"
            icon="i-ri-add-line"
            :disabled="!connected || tabsPending"
            @click="openTabUrl(null)"
            >{{ t('chromeLibrary.newChromeTab') }}</TxButton
          >
          <p class="m-0 text-xs text-[var(--tx-text-color-regular)]">
            {{ t(connected ? 'chromeLibrary.tabsOwnership' : 'chromeLibrary.tabsOffline') }}
          </p>
        </div>
        <p
          v-if="!profile.tabs.length"
          class="m-0 py-6 text-center text-sm text-[var(--tx-text-color-regular)]"
        >
          {{ t('chromeLibrary.tabsEmpty') }}
        </p>
        <TxVirtualList
          v-if="tabRows.length"
          :items="tabRows"
          :item-height="ROW_HEIGHT"
          :height="tabListHeight"
          item-key="key"
          :aria-label="t('chromeLibrary.tabs', { count: profile.tabs.length })"
        >
          <template #item="{ item: row }">
            <h3
              v-if="row.kind === 'window'"
              class="m-0 self-end pb-1 text-xs font-medium text-[var(--tx-text-color-secondary)]"
            >
              {{ t('chromeLibrary.window', { index: row.windowNumber }) }}
            </h3>
            <div
              v-else
              class="flex h-full w-full items-center gap-2 rounded-xl px-2 hover:bg-[var(--tx-fill-color-light)]"
            >
              <span
                class="inline-flex h-5 w-5 flex-none"
                :class="row.tab.pinned ? 'i-ri-pushpin-line' : 'i-ri-window-line'"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1" :title="row.tab.url">
                <span class="flex items-center gap-2">
                  <span class="truncate text-sm">{{ row.tab.title || row.tab.url }}</span>
                  <TxStatusBadge
                    v-if="row.tab.active"
                    :text="t('chromeLibrary.activeTab')"
                    status="info"
                    size="sm"
                  />
                </span>
                <span class="block truncate text-xs text-[var(--tx-text-color-regular)]">{{
                  isOpenableBrowserUrl(row.tab.url) ? hostOf(row.tab.url) : row.tab.url
                }}</span>
              </span>
              <TxIconButton
                icon="i-ri-focus-3-line"
                size="sm"
                :label="t('chromeLibrary.activateTab', { title: row.tab.title || row.tab.url })"
                :disabled="!connected || tabsPending"
                @click="runTab({ kind: 'activate', id: row.tab.id })"
              />
              <TxIconButton
                icon="i-ri-arrow-up-line"
                size="sm"
                :label="t('chromeLibrary.moveTabEarlier', { title: row.tab.title || row.tab.url })"
                :disabled="!connected || tabsPending || row.first"
                @click="
                  runTab({
                    kind: 'move',
                    id: row.tab.id,
                    index: row.tab.index - 1,
                    windowId: row.tab.windowId
                  })
                "
              />
              <TxIconButton
                icon="i-ri-arrow-down-line"
                size="sm"
                :label="t('chromeLibrary.moveTabLater', { title: row.tab.title || row.tab.url })"
                :disabled="!connected || tabsPending || row.last"
                @click="
                  runTab({
                    kind: 'move',
                    id: row.tab.id,
                    index: row.tab.index + 1,
                    windowId: row.tab.windowId
                  })
                "
              />
              <TxIconButton
                icon="i-ri-links-line"
                size="sm"
                :label="t('chromeLibrary.navigateTab', { title: row.tab.title || row.tab.url })"
                :disabled="!connected || tabsPending"
                @click="openTabUrl(row.tab)"
              />
              <TxIconButton
                icon="i-ri-external-link-line"
                size="sm"
                :label="t('chromeLibrary.openCopyInTuff', { title: row.tab.title || row.tab.url })"
                :disabled="!isOpenableBrowserUrl(row.tab.url)"
                @click="openCopy(row.tab.url)"
              />
              <TxIconButton
                icon="i-ri-close-line"
                size="sm"
                :label="t('chromeLibrary.closeChromeTab', { title: row.tab.title || row.tab.url })"
                :disabled="!connected || tabsPending"
                @click="runTab({ kind: 'close', id: row.tab.id })"
              />
            </div>
          </template>
        </TxVirtualList>
      </template>
      <template v-else-if="view === 'cookies'">
        <div
          class="flex flex-col gap-4 rounded-xl border border-[var(--tx-border-color-light)] bg-[var(--tx-fill-color-light)] p-5"
        >
          <div class="flex items-start gap-3">
            <span
              class="i-ri-shield-keyhole-line mt-0.5 text-xl text-[var(--tx-color-primary)]"
              aria-hidden="true"
            />
            <div class="flex-1 min-w-0">
              <h4 class="m-0 text-sm font-semibold">{{ t('chromeLibrary.cookies.title') }}</h4>
              <p class="m-0 mt-1 text-xs text-[var(--tx-text-color-secondary)] leading-relaxed">
                {{ t('chromeLibrary.cookies.subtitle') }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-[var(--tx-text-color-primary)]">{{
                t('chromeLibrary.cookies.quickSelect')
              }}</span>
              <div class="flex gap-2">
                <TxButton variant="ghost" size="sm" @click="selectAllPresets">{{
                  t('chromeLibrary.cookies.selectAll')
                }}</TxButton>
                <TxButton variant="ghost" size="sm" @click="clearSelectedDomains">{{
                  t('chromeLibrary.cookies.clearAll')
                }}</TxButton>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="site in PRESET_DOMAINS"
                :key="site.domain"
                type="button"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer"
                :class="
                  selectedDomains.includes(site.domain)
                    ? 'border-[var(--tx-color-primary)] bg-[var(--tx-color-primary-light-9)] text-[var(--tx-color-primary)] font-medium'
                    : 'border-[var(--tx-border-color-light)] bg-[var(--tx-bg-color)] text-[var(--tx-text-color-regular)] hover:border-[var(--tx-border-color)]'
                "
                @click="toggleDomain(site.domain)"
              >
                <span :class="site.icon" class="text-sm" aria-hidden="true" />
                <span>{{ site.label }}</span>
                <span class="text-[10px] text-[var(--tx-text-color-secondary)]"
                  >({{ site.domain }})</span
                >
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[var(--tx-text-color-primary)]">{{
              t('chromeLibrary.cookies.customDomain')
            }}</label>
            <div class="flex gap-2">
              <TxInput
                v-model="customDomainInput"
                class="flex-1"
                size="sm"
                :placeholder="t('chromeLibrary.cookies.customDomainPlaceholder')"
                @keydown.enter.prevent="addCustomDomain"
              />
              <TxButton
                variant="flat"
                size="sm"
                icon="i-ri-add-line"
                :disabled="!customDomainInput.trim()"
                @click="addCustomDomain"
              >
                {{ t('chromeLibrary.cookies.addDomain') }}
              </TxButton>
            </div>
          </div>

          <div v-if="selectedDomains.length" class="flex flex-col gap-1.5">
            <span class="text-xs text-[var(--tx-text-color-secondary)]">
              {{ t('chromeLibrary.cookies.selectedDomains', { count: selectedDomains.length }) }}
            </span>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="dom in selectedDomains"
                :key="dom"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--tx-bg-color)] border border-[var(--tx-border-color-light)] text-xs text-[var(--tx-text-color-primary)]"
              >
                {{ dom }}
                <button
                  type="button"
                  class="ml-0.5 text-[var(--tx-text-color-secondary)] hover:text-[var(--tx-color-danger)] transition-colors cursor-pointer"
                  :aria-label="t('chromeLibrary.cookies.removeDomain', { domain: dom })"
                  @click="removeDomain(dom)"
                >
                  <span class="i-ri-close-line text-xs" />
                </button>
              </span>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[var(--tx-text-color-primary)]">{{
              t('chromeLibrary.cookies.passwordLabel')
            }}</label>
            <TxInput
              v-model="confirmationPassword"
              type="password"
              size="sm"
              :placeholder="t('chromeLibrary.cookies.passwordPlaceholder')"
            />
          </div>

          <div class="flex flex-col gap-2 pt-2 border-t border-[var(--tx-border-color-light)]">
            <div class="flex items-center justify-between">
              <TxButton
                variant="primary"
                size="md"
                icon="i-ri-download-cloud-line"
                :disabled="!selectedDomains.length || !connected"
                :loading="cookieImporting"
                @click="runBatchImportCookies"
              >
                {{ t('chromeLibrary.cookies.importAction') }}
              </TxButton>
              <p class="m-0 text-xs text-[var(--tx-text-color-secondary)]">
                {{ t('chromeLibrary.cookies.tip') }}
              </p>
            </div>

            <p v-if="cookieImportError" class="m-0 text-xs text-[var(--tx-color-danger)]">
              {{ t('chromeLibrary.cookies.importFailed', { error: cookieImportError }) }}
            </p>
            <div
              v-else-if="cookieImportResult"
              class="flex flex-col gap-1 rounded-lg bg-[var(--tx-color-success-light-9)] p-3 border border-[var(--tx-color-success-light-7)]"
            >
              <p class="m-0 text-xs text-[var(--tx-color-success)] font-medium">
                {{
                  cookieImportResult.count > 0
                    ? t('chromeLibrary.cookies.importSuccess', {
                        count: cookieImportResult.count,
                        domains: cookieImportResult.domains.join(', ')
                      })
                    : t('chromeLibrary.cookies.importEmpty')
                }}
              </p>
            </div>
          </div>
        </div>
      </template>

      <ChromeBookmarkDialog
        v-model="dialogOpen"
        :mode="dialogMode"
        :profile="profile"
        :node="dialogNode"
        :folder-id="currentFolder?.id ?? null"
        :page="currentPage"
      />

      <TxModal
        :model-value="Boolean(removeTarget)"
        :title="t('chromeLibrary.removeTitle')"
        :close-label="t('common.close')"
        width="420px"
        @update:model-value="!$event && (removeTarget = null)"
      >
        <div v-if="removeTarget" class="flex flex-col gap-3">
          <p class="m-0 break-words text-sm">
            {{
              t(
                removeDescendants
                  ? 'chromeLibrary.removeFolderMessage'
                  : 'chromeLibrary.removeMessage',
                {
                  title:
                    removeTarget.title || removeTarget.url || t('chromeLibrary.untitledFolder'),
                  profile: profile.label,
                  count: removeDescendants
                }
              )
            }}
          </p>
          <TxCheckbox
            v-if="removeDescendants"
            v-model="removeConfirmed"
            :label="t('chromeLibrary.removeRecursiveConfirm', { count: removeDescendants })"
          />
          <p
            v-if="error"
            role="alert"
            class="m-0 break-words text-xs text-[var(--tx-color-danger)]"
          >
            {{ error }}
          </p>
          <div class="flex justify-end gap-2">
            <TxButton variant="ghost" @click="removeTarget = null">{{
              t('common.cancel')
            }}</TxButton>
            <TxButton
              variant="danger"
              :loading="busy.has(`bookmark:${profile.id}`)"
              :disabled="
                busy.has(`bookmark:${profile.id}`) || (removeDescendants > 0 && !removeConfirmed)
              "
              @click="confirmRemove"
              >{{ t('chromeLibrary.removeAction') }}</TxButton
            >
          </div>
        </div>
      </TxModal>

      <TxModal
        v-model="tabUrlOpen"
        :title="t(tabUrlTarget ? 'chromeLibrary.navigateTitle' : 'chromeLibrary.newTabTitle')"
        :close-label="t('common.close')"
        width="420px"
      >
        <form class="flex flex-col gap-3" novalidate @submit.prevent="submitTabUrl">
          <p class="m-0 text-xs leading-normal text-[var(--tx-text-color-secondary)]">
            {{ t('chromeLibrary.tabUrlHint', { profile: profile.label }) }}
          </p>
          <label :for="tabUrlId" class="text-xs font-medium">{{
            t('chromeLibrary.dialog.url')
          }}</label>
          <TxInput
            :id="tabUrlId"
            v-model="tabUrl"
            :placeholder="t('chromeLibrary.dialog.urlPlaceholder')"
            spellcheck="false"
            autocomplete="off"
          />
          <p
            v-if="tabUrlError"
            role="alert"
            class="m-0 break-words text-xs text-[var(--tx-color-danger)]"
          >
            {{ tabUrlError }}
          </p>
          <div class="flex justify-end gap-2">
            <TxButton variant="ghost" @click="tabUrlOpen = false">{{
              t('common.cancel')
            }}</TxButton>
            <TxButton
              variant="primary"
              native-type="submit"
              :loading="tabsPending"
              :disabled="tabsPending"
            >
              {{ t(tabUrlTarget ? 'chromeLibrary.navigateAction' : 'chromeLibrary.newTabAction') }}
            </TxButton>
          </div>
        </form>
      </TxModal>
    </template>
  </section>
</template>

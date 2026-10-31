import type {
  BrowserBookmarkCommand,
  BrowserChromeTabCommand,
  BrowserConnectedProfile,
  BrowserConnectionState,
  BrowserConnectionTabsChanged,
  ChromeBookmarkNode,
  ChromeCookieFilter
} from '@talex-touch/utils/transport/sdk/domains/browser-connection'
import { createBrowserConnectionSdk } from '@talex-touch/utils/transport/sdk/domains/browser-connection'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeFailure } from '~/utils/failure-text'

/**
 * One renderer-wide view of Main's Chrome connection state.
 *
 * Module-scoped on purpose: the shell avatar (Home and Browser headers) and the Browser library all
 * read the same profiles, and per-call refs would let one surface keep showing a revoked profile
 * after another surface disconnected it.
 *
 * Two kinds of update share Main's global revision but carry different data: full snapshots (every
 * profile, bookmarks, status) and sparse tab-only patches for one profile. Ordering each kind
 * against the other would let a newer tab patch reject an older-but-unseen snapshot carrying new
 * bookmark or profile metadata (a slow first `getState`, a command reply behind a tab push). So
 * each kind is ordered against itself — snapshots by `lastFull.revision`, patches by the newest
 * patch per profile — and the shown state is the latest snapshot with the patches newer than it
 * laid over the profiles it lists.
 */
const sdk = createBrowserConnectionSdk(useTuffTransport())
const state = shallowRef<BrowserConnectionState | null>(null)
const loading = ref(false)
const loadError = ref('')
/** Keys of commands in flight, so each control disables only itself and its siblings. */
const busy = reactive(new Set<string>())
let consumers = 0
let unsubscribe: (() => void) | null = null
let unsubscribeTabs: (() => void) | null = null
let loadRun = 0
let lastFull: BrowserConnectionState | null = null
/**
 * Newest tab patch per profile that is newer than `lastFull`. A patch for a profile the snapshot
 * does not list (paired after it) waits here without resurrecting anything; Main pairs at most 16
 * profiles, and the cap below keeps a removed profile's leftovers from accumulating.
 */
const tabPatches = new Map<string, BrowserConnectionTabsChanged>()
const MAX_TAB_PATCHES = 32

function publish(): void {
  const full = lastFull
  if (!full) {
    state.value = null
    return
  }
  let revision = full.revision
  const profiles = full.profiles.map((profile) => {
    const patch = tabPatches.get(profile.id)
    if (!patch) return profile
    revision = Math.max(revision, patch.revision)
    return { ...profile, tabs: patch.tabs, lastSeenAt: patch.lastSeenAt }
  })
  state.value = { ...full, revision, profiles }
}

function apply(next: BrowserConnectionState): void {
  if (lastFull && next.revision <= lastFull.revision) return
  lastFull = next
  // The snapshot already contains every tab change at or below its revision, including the removal
  // of a revoked profile; only newer patches survive it.
  for (const [profileId, patch] of tabPatches) {
    if (patch.revision <= next.revision) tabPatches.delete(profileId)
  }
  publish()
}

/**
 * Tab/title/activation churn arrives as a tab-only patch so Main never reserializes every bookmark
 * library for it. It replaces that one profile's tabs and `lastSeenAt` and nothing else.
 */
function applyTabs(change: BrowserConnectionTabsChanged): void {
  if (lastFull && change.revision <= lastFull.revision) return
  const previous = tabPatches.get(change.profileId)
  if (previous && previous.revision >= change.revision) return
  if (!previous && tabPatches.size >= MAX_TAB_PATCHES) {
    let oldest: BrowserConnectionTabsChanged | null = null
    for (const patch of tabPatches.values()) {
      if (!oldest || patch.revision < oldest.revision) oldest = patch
    }
    if (oldest) tabPatches.delete(oldest.profileId)
  }
  tabPatches.set(change.profileId, change)
  publish()
}

async function load(): Promise<void> {
  const run = ++loadRun
  loading.value = true
  loadError.value = ''
  try {
    const next = await sdk.getState()
    if (run === loadRun) apply(next)
  } catch (failure) {
    if (run === loadRun)
      loadError.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    if (run === loadRun) loading.value = false
  }
}

function attach(): void {
  consumers += 1
  if (consumers > 1) return
  unsubscribe = sdk.onChanged(apply)
  unsubscribeTabs = sdk.onTabsChanged(applyTabs)
  void load()
}

function detach(): void {
  consumers = Math.max(0, consumers - 1)
  if (consumers > 0) return
  unsubscribe?.()
  unsubscribe = null
  unsubscribeTabs?.()
  unsubscribeTabs = null
}

/**
 * Runs one command. Returns the failure text (raw from Main, mapped by the caller) or `null` once
 * Main accepted it and its resulting state has been applied — never a local optimistic success.
 */
async function run(
  key: string,
  action: () => Promise<BrowserConnectionState | void>
): Promise<string | null> {
  // A second press while the first is in flight is reported, never treated as accepted.
  if (busy.has(key)) return 'BROWSER_ACTION_PENDING'
  busy.add(key)
  try {
    const next = await action()
    if (next) apply(next)
    return null
  } catch (failure) {
    return failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.delete(key)
  }
}

const activeProfile = computed<BrowserConnectedProfile | null>(() => {
  const current = state.value
  if (!current?.activeProfileId) return null
  return current.profiles.find((profile) => profile.id === current.activeProfileId) ?? null
})

/**
 * One honest label per profile state. `offline` is "waiting for Chrome" unless Main recorded an
 * error, and a connected profile with queued writes reads as pending, never as synced.
 */
export function browserProfileStatus(profile: BrowserConnectedProfile): {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
} {
  if (profile.status === 'conflict' || profile.conflicts.length)
    return { label: 'browserConnection.status.conflict', tone: 'danger' }
  if (profile.status === 'paused')
    return { label: 'browserConnection.status.paused', tone: 'warning' }
  if (profile.error) return { label: 'browserConnection.status.error', tone: 'danger' }
  if (profile.status === 'offline')
    return { label: 'browserConnection.status.offline', tone: 'muted' }
  if (profile.pendingCount) return { label: 'browserConnection.status.pending', tone: 'info' }
  return { label: 'browserConnection.status.connected', tone: 'success' }
}

/** Same rule Main enforces for new URLs: credential-free HTTP(S) only. */
export function isOpenableBrowserUrl(value: string | null | undefined): value is string {
  if (!value || value.length > 8192) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 33 || code === 127 || code === 92) return false
  }
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

/**
 * Turns typed input into an openable URL. A bare host (`example.com/path`) gains `https://`; any
 * other scheme, credentials or whitespace is refused rather than guessed at.
 */
export function normalizeBrowserUrlInput(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (isOpenableBrowserUrl(value)) return value
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[^\s/:]+:\d{1,5}(?:[/?#]|$)/.test(value)) return null
  const prefixed = `https://${value}`
  return isOpenableBrowserUrl(prefixed) ? prefixed : null
}

/**
 * Rename / move / remove rule, mirrored from Main: Chrome's special roots, managed and unmodifiable
 * nodes stay put. Receiving children is a separate capability (`canAddChildren`) — the Bookmarks
 * Bar is immutable yet must accept a first bookmark.
 */
export function canEditBookmark(node: ChromeBookmarkNode): boolean {
  return node.modifiable && node.parentId !== null && !node.folderType
}

export function useBrowserConnection() {
  const { t, te } = useI18n()

  onMounted(attach)
  onBeforeUnmount(detach)

  /**
   * Main reports machine codes (`BROWSER_*`). A failure of the channel itself reads in the interface
   * language; anything else is Chrome's or the system's own text, shown without the transport's
   * preface.
   */
  function describeError(raw: string | null | undefined): string {
    if (!raw) return ''
    // Transport rejections may wrap Main's message ("…: Error: BROWSER_X"), so the code is searched.
    const code = /\bBROWSER_[A-Z_]+\b/.exec(raw)?.[0]
    if (!code) return describeFailure(raw, t, raw)
    const key = `browserConnection.errors.${code}`
    return te(key) ? t(key) : t('browserConnection.errors.unknown', { code })
  }

  return {
    sdk,
    state,
    loading,
    loadError,
    busy,
    activeProfile,
    load,
    run,
    describeError,
    bookmark: (profileId: string, command: BrowserBookmarkCommand) =>
      run(`bookmark:${profileId}`, () => sdk.bookmark(profileId, command)),
    tab: (profileId: string, command: BrowserChromeTabCommand) =>
      run(`tab:${profileId}:${'id' in command ? command.id : 'new'}`, () =>
        sdk.tab(profileId, command)
      ),
    getCookies: async (profileId: string, filter: ChromeCookieFilter) => {
      const key = `cookies:${profileId}`
      if (busy.has(key)) throw new Error('BROWSER_ACTION_PENDING')
      busy.add(key)
      try {
        const res = await sdk.getCookies(profileId, filter)
        return res.cookies
      } finally {
        busy.delete(key)
      }
    },
    importCookies: async (
      profileId: string,
      filter: ChromeCookieFilter,
      confirmationPassword?: string
    ) => {
      const key = `import-cookies:${profileId}`
      if (busy.has(key)) throw new Error('BROWSER_ACTION_PENDING')
      busy.add(key)
      try {
        return await sdk.importCookies(profileId, filter, confirmationPassword)
      } finally {
        busy.delete(key)
      }
    }
  }
}

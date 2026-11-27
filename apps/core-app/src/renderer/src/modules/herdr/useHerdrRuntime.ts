import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type {
  HerdrConnectionState,
  HerdrCoreSummary,
  HerdrEnsureStartedRequest,
  HerdrMachineView,
  HerdrOscState,
  HerdrOwnership,
  HerdrProjectedConversation,
  HerdrRuntimeSnapshot,
  HerdrSdk,
  HerdrSendResult,
  HerdrSessionUpsertPayload,
  HerdrSessionView,
  HerdrStreamAttachRequest,
  HerdrStreamClosedPayload,
  HerdrStreamHandle,
  HerdrStreamHandlers,
  HerdrTemplateView,
  HerdrTerminalControlResult,
  HerdrTerminalDisplay,
  HerdrTerminalKeysResult,
  HerdrTerminalPutResult,
  HerdrTerminalRunRequest,
  HerdrTerminalSendRequest
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { ShellTerminalTab } from '~/modules/layout/useShellTerminal'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createHerdrSdk } from '@talex-touch/utils/transport/sdk/domains/herdr'
import { computed, getCurrentScope, onScopeDispose, reactive, ref, shallowRef } from 'vue'
import { isBetaFeatureEnabled } from '../../../../shared/beta-features'
import {
  resetShellTerminalTabsForTesting,
  useShellTerminal
} from '~/modules/layout/useShellTerminal'
import { closeHerdrTabEverywhere } from '~/modules/layout/useShellWorkspaceTabs'
import { appSetting } from '~/modules/storage/app-storage'
import { useProjectStore } from '~/stores/projects'
import { groupHerdrSessions, type HerdrProjectGroup } from './herdr-project-groups'

export interface HerdrProjectedSession extends HerdrSessionView {
  projectId: string | null
  projectName: string | null
  displayTitle: string
  /** Normalized app or process label (never a bare binary version like `18.16.0`). */
  appName?: string
  /** Human-readable context location (`projectName`, `labels.where`, or cwd basename). */
  locationLabel?: string | null
  /** Effective working directory (`foregroundCwd || cwd`). */
  effectiveCwd?: string
}

export type HerdrTabViewMode = 'structured' | 'terminal'

export interface HerdrDrawerTab extends ShellTerminalTab {
  viewMode: HerdrTabViewMode
  /** True once the tab has entered terminal mode (or for local PTY tabs). */
  terminalMounted: boolean
}

export interface HerdrAttachOptions {
  cols: number
  rows: number
  history?: number
  observe?: boolean
  resumed?: boolean
  resizeNotifications?: boolean
  display?: HerdrTerminalDisplay | null
  handlers?: HerdrStreamHandlers
}

/**
 * Default terminal identity for Tuff-spawned `herdr-core` sessions.
 *
 * `herdr-core` defaults to `TERM_PROGRAM=ghostty` and answers `XTVERSION` (`CSI > q`)
 * itself, which causes previewers like `yazi` to pick Kitty Graphics Protocol with
 * `U+10EEEE` placeholders (1+ MB raw RGB per frame) instead of compact truecolor IIP
 * (`OSC 1337`). Requesting `Bobcat` makes `herdr-core` advertise an IIP-capable
 * identity matching `TxTerminal`'s `XTVERSION_IIP_IDENTITY`.
 */
export const HERDR_IIP_TERM_PROGRAM = 'Bobcat'

const STATUS_SORT_WEIGHT: Record<HerdrOscState, number> = {
  blocked: 0,
  working: 1,
  error: 2,
  done: 3,
  idle: 4
}

function normalizePathForMatch(rawPath: string | null | undefined): string {
  if (!rawPath) return ''
  const normalized = rawPath.trim().replace(/\\/g, '/')
  if (normalized.length > 1) {
    return normalized.replace(/\/+$/, '')
  }
  return normalized
}

const BARE_VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/i
const SHELL_HOST_TITLE_RE = /^[^\s@]+@[^\s:]+:\s*\S+/
const CLI_CONVERSATION_FLAG_RE = /^[\w.-]+\s+--(?:conversation|resume|session)(?:=|\s|$)/i
const LEADING_TITLE_PREFIX_RE = /^(?:[π❯›>$#]\s*(?:>\s*)?)+/u
// Nerd Font / Private Use Area glyphs emitted inside CLI terminal titles.
const PUA_GLYPH_RE = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu

function pathBasename(rawPath: string | null | undefined): string {
  const normalized = normalizePathForMatch(rawPath)
  if (!normalized || normalized === '/') return ''
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

export function isBareVersionToken(value: string | null | undefined): boolean {
  if (!value) return false
  return BARE_VERSION_RE.test(value.trim())
}

export function resolveHerdrSessionApp(
  session: Partial<Pick<HerdrSessionView, 'status' | 'foregroundName' | 'argv'>> &
    Pick<HerdrSessionView, 'address'>
): string {
  const statusApp = session.status?.app?.trim()
  if (statusApp && !isBareVersionToken(statusApp)) return statusApp

  const fg = session.foregroundName?.trim()
  if (fg && !isBareVersionToken(fg)) return fg

  const argv0 = session.argv?.[0]?.trim()
  if (argv0) {
    const base = pathBasename(argv0) || argv0
    if (base && !isBareVersionToken(base)) return base
  }

  return fg || statusApp || session.address
}

export function resolveHerdrSessionLocation(
  session: Partial<Pick<HerdrSessionView, 'labels' | 'foregroundCwd' | 'cwd'>>,
  projectName?: string | null
): string | null {
  const project = projectName?.trim()
  if (project) return project

  const where = session.labels?.where?.trim()
  if (where) return where

  const dirName = pathBasename(session.foregroundCwd || session.cwd)
  return dirName || null
}

function cleanReadableTerminalTitle(
  rawTitle: string | null | undefined,
  appName: string,
  foregroundName: string | null | undefined
): string | null {
  if (!rawTitle) return null
  const trimmed = rawTitle.trim()
  if (!trimmed) return null
  if (SHELL_HOST_TITLE_RE.test(trimmed)) return null
  if (CLI_CONVERSATION_FLAG_RE.test(trimmed)) return null

  const cleaned = trimmed
    .replace(PUA_GLYPH_RE, ' ')
    .trim()
    .replace(LEADING_TITLE_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || isBareVersionToken(cleaned)) return null

  const lower = cleaned.toLowerCase()
  if (
    lower === appName.toLowerCase() ||
    (foregroundName && lower === foregroundName.trim().toLowerCase())
  ) {
    return null
  }
  return cleaned
}

export function resolveHerdrSessionTitle(
  session: Partial<
    Pick<
      HerdrSessionView,
      'name' | 'title' | 'status' | 'foregroundName' | 'argv' | 'labels' | 'foregroundCwd' | 'cwd'
    >
  > &
    Pick<HerdrSessionView, 'address'>,
  projectName?: string | null
): string {
  const name = session.name?.trim()
  if (name) return name

  const statusTitle = session.status?.title?.trim()
  if (statusTitle && !isBareVersionToken(statusTitle)) return statusTitle

  const appName = resolveHerdrSessionApp(session)
  const cleanedTitle = cleanReadableTerminalTitle(session.title, appName, session.foregroundName)
  if (cleanedTitle) return cleanedTitle

  const location = resolveHerdrSessionLocation(session, projectName)
  if (appName && appName !== session.address) {
    if (location && location.toLowerCase() !== appName.toLowerCase()) {
      return `${appName} · ${location}`
    }
    return appName
  }

  return location || session.address
}

export function matchSessionProject(
  session: Pick<HerdrSessionView, 'machine' | 'foregroundCwd' | 'cwd'>,
  projects: readonly ProjectRecord[]
): { projectId: string | null; projectName: string | null } {
  if (session.machine !== null || projects.length === 0) {
    return { projectId: null, projectName: null }
  }
  const targetPath = normalizePathForMatch(session.foregroundCwd || session.cwd)
  if (!targetPath) {
    return { projectId: null, projectName: null }
  }

  let bestMatch: ProjectRecord | null = null
  let bestLength = -1

  for (const project of projects) {
    const rootPath = normalizePathForMatch(project.rootPath)
    if (!rootPath) continue
    const matches =
      targetPath === rootPath ||
      (rootPath === '/' ? targetPath.startsWith('/') : targetPath.startsWith(`${rootPath}/`))
    if (matches && rootPath.length > bestLength) {
      bestMatch = project
      bestLength = rootPath.length
    }
  }

  return bestMatch
    ? { projectId: bestMatch.id, projectName: bestMatch.name }
    : { projectId: null, projectName: null }
}

function statusSortRank(session: HerdrSessionView): number {
  const state = session.status?.state
  return state ? (STATUS_SORT_WEIGHT[state] ?? 5) : 5
}

export function sortLiveSessions<T extends HerdrSessionView>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const rankDiff = statusSortRank(a) - statusSortRank(b)
    if (rankDiff !== 0) return rankDiff
    const timeA = a.statusMs ?? a.createdMs
    const timeB = b.statusMs ?? b.createdMs
    if (timeB !== timeA) return timeB - timeA
    if (b.createdMs !== a.createdMs) return b.createdMs - a.createdMs
    return a.address.localeCompare(b.address)
  })
}

export function sortFinishedSessions<T extends HerdrSessionView>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const timeA = a.finishedMs ?? a.statusMs ?? a.createdMs
    const timeB = b.finishedMs ?? b.statusMs ?? b.createdMs
    if (timeB !== timeA) return timeB - timeA
    return a.address.localeCompare(b.address)
  })
}

// Module-level singleton state shared across sidebar, terminal drawer, and settings.
let sdkInstance: HerdrSdk | null = null
const snapshot = shallowRef<HerdrRuntimeSnapshot | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const attachedByAddress = reactive<Record<string, boolean>>({})
const attachingByAddress = reactive<Record<string, boolean>>({})
const tabViewModes = reactive<Record<string, HerdrTabViewMode>>({})
const tabTerminalEntered = reactive<Record<string, boolean>>({})
const projectionsByAddress = reactive<Record<string, HerdrProjectedConversation>>({})
const projectionLoadingByAddress = reactive<Record<string, boolean>>({})
const projectionErrorByAddress = reactive<Record<string, string | null>>({})

const streamHandles = new Map<string, HerdrStreamHandle>()
const streamControllers = new Map<string, AbortController>()
const watchedProjectionAddresses = new Set<string>()
const projectionRequestSeq = new Map<string, number>()

let subscribed = false
let scopeConsumers = 0
let refreshRun = 0
let unsubSnapshot: (() => void) | null = null
let unsubUpsert: (() => void) | null = null
let unsubProjection: (() => void) | null = null

function getSdk(): HerdrSdk {
  if (!sdkInstance) {
    sdkInstance = createHerdrSdk(useTuffTransport())
  }
  return sdkInstance
}

function readProjectsSafe(): ProjectRecord[] {
  try {
    const store = useProjectStore()
    return Array.isArray(store?.projects) ? store.projects : []
  } catch {
    return []
  }
}

function isValidSnapshot(value: unknown): value is HerdrRuntimeSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HerdrRuntimeSnapshot).revision === 'number' &&
    Array.isArray((value as HerdrRuntimeSnapshot).sessions)
  )
}

function isValidProjection(value: unknown): value is HerdrProjectedConversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HerdrProjectedConversation).address === 'string' &&
    typeof (value as HerdrProjectedConversation).available === 'boolean' &&
    Array.isArray((value as HerdrProjectedConversation).messages)
  )
}

function applyProjectionUpdate(conversation: HerdrProjectedConversation): void {
  if (!isValidProjection(conversation)) return
  const existing = projectionsByAddress[conversation.address]
  if (existing && conversation.updatedAt < existing.updatedAt) return
  projectionsByAddress[conversation.address] = conversation
  projectionLoadingByAddress[conversation.address] = false
  projectionErrorByAddress[conversation.address] = null
}

async function unwatchProjectionInternal(address: string): Promise<void> {
  if (!address) return
  const wasWatched = watchedProjectionAddresses.delete(address)
  projectionRequestSeq.set(address, (projectionRequestSeq.get(address) ?? 0) + 1)
  if (!wasWatched) return
  const sdk = sdkInstance
  const unwatchFn = sdk?.projection?.unwatch ?? sdk?.unwatchProjection
  if (!unwatchFn) return
  await unwatchFn({ address }).catch(() => {})
}

function syncOpenTabsFromSessions(sessions: readonly HerdrSessionView[]): void {
  const shellTerminal = useShellTerminal()
  if (shellTerminal.tabs.value.length === 0) return
  const projects = readProjectsSafe()
  const byAddress = new Map(sessions.map((item) => [item.address, item]))
  for (const tab of shellTerminal.tabs.value) {
    if (tab.kind !== 'herdr' || !tab.address) continue
    const session = byAddress.get(tab.address)
    if (!session) continue
    const matched = matchSessionProject(session, projects)
    shellTerminal.updateTabMeta(tab.id, {
      title: resolveHerdrSessionTitle(session, matched.projectName),
      machine: session.machine
    })
  }
}

function applySnapshot(next: HerdrRuntimeSnapshot): void {
  if (!isValidSnapshot(next)) return
  const current = snapshot.value
  if (current) {
    if (next.revision < current.revision) return
    if (next.revision === current.revision && next.seq < current.seq) return
  }

  const prevConnection = current?.connection
  snapshot.value = next
  loading.value = false
  error.value = next.error
  syncOpenTabsFromSessions(next.sessions)

  // If connection recovered after a disconnect, trigger reattach on any open unattached live herdr tabs
  // that have actually entered terminal mode.
  if (prevConnection && prevConnection !== 'connected' && next.connection === 'connected') {
    const shellTerminal = useShellTerminal()
    const liveAddresses = new Set(
      next.sessions.filter((session) => session.state === 'live').map((session) => session.address)
    )
    for (const tab of shellTerminal.tabs.value) {
      const terminalEntered =
        tabTerminalEntered[tab.id] === true || (tabViewModes[tab.id] ?? 'terminal') === 'terminal'
      if (
        tab.kind === 'herdr' &&
        tab.address &&
        terminalEntered &&
        liveAddresses.has(tab.address) &&
        !attachedByAddress[tab.address] &&
        !attachingByAddress[tab.address]
      ) {
        shellTerminal.bumpTabReattach(tab.id)
      }
    }
  }
}

function upsertSessionLocally(session: HerdrSessionView): void {
  const current = snapshot.value
  if (!current) {
    snapshot.value = {
      revision: 0,
      seq: 0,
      enabled: isBetaFeatureEnabled(appSetting, 'herdrRuntime'),
      connection: 'connected',
      ownership: 'external',
      socketPath: null,
      session: appSetting?.herdrCore?.session || 'default',
      binaryPath: null,
      error: null,
      core: null,
      sessions: [session],
      machines: [],
      templates: [],
      updatedAt: Date.now()
    }
    loading.value = false
    syncOpenTabsFromSessions([session])
    return
  }

  const nextSessions = current.sessions.some((item) => item.address === session.address)
    ? current.sessions.map((item) => (item.address === session.address ? session : item))
    : [...current.sessions, session]

  const liveCount = nextSessions.filter((item) => item.state === 'live').length
  const finishedCount = nextSessions.length - liveCount
  snapshot.value = {
    ...current,
    sessions: nextSessions,
    core: current.core ? { ...current.core, liveCount, finishedCount } : null,
    updatedAt: Date.now()
  }
  syncOpenTabsFromSessions(nextSessions)
}

function applySessionUpsert(payload: HerdrSessionUpsertPayload): void {
  if (!payload || typeof payload.address !== 'string') return
  const current = snapshot.value
  if (current && payload.revision < current.revision) return

  // Non-removal events with no session payload (notably `doc` events where `address` is a doc name)
  // must never delete a terminal session or fabricate a connected snapshot before hydration.
  if (payload.kind === 'doc' || (payload.kind !== 'removed' && payload.session === null)) {
    if (!current) return
    snapshot.value = {
      ...current,
      revision: Math.max(current.revision, payload.revision),
      seq: Math.max(current.seq, payload.seq),
      updatedAt: Date.now()
    }
    return
  }

  const baseSessions = current?.sessions ?? []
  let nextSessions: HerdrSessionView[]

  if (payload.kind === 'removed') {
    nextSessions = baseSessions.filter((item) => item.address !== payload.address)
    delete projectionsByAddress[payload.address]
    delete projectionLoadingByAddress[payload.address]
    delete projectionErrorByAddress[payload.address]
    void unwatchProjectionInternal(payload.address)
  } else if (baseSessions.some((item) => item.address === payload.address)) {
    nextSessions = baseSessions.map((item) =>
      item.address === payload.address ? payload.session! : item
    )
  } else {
    nextSessions = [...baseSessions, payload.session!]
  }

  const liveCount = nextSessions.filter((item) => item.state === 'live').length
  const finishedCount = nextSessions.length - liveCount

  if (current) {
    snapshot.value = {
      ...current,
      revision: Math.max(current.revision, payload.revision),
      seq: Math.max(current.seq, payload.seq),
      sessions: nextSessions,
      core: current.core ? { ...current.core, liveCount, finishedCount } : null,
      updatedAt: Date.now()
    }
  } else {
    if (payload.kind === 'removed') return
    snapshot.value = {
      revision: payload.revision,
      seq: payload.seq,
      enabled: isBetaFeatureEnabled(appSetting, 'herdrRuntime'),
      connection: 'connected',
      ownership: 'external',
      socketPath: null,
      session: appSetting?.herdrCore?.session || 'default',
      binaryPath: null,
      error: null,
      core: null,
      sessions: nextSessions,
      machines: [],
      templates: [],
      updatedAt: Date.now()
    }
    loading.value = false
  }

  syncOpenTabsFromSessions(nextSessions)

  // Auto-reattach any open drawer tab that has entered terminal mode when herdr-core restarts it.
  if (payload.kind === 'restarted' && payload.session?.state === 'live') {
    const shellTerminal = useShellTerminal()
    const openTab = shellTerminal.findTabByAddress(payload.address)
    if (openTab) {
      const terminalEntered =
        tabTerminalEntered[openTab.id] === true ||
        (tabViewModes[openTab.id] ?? 'terminal') === 'terminal'
      if (terminalEntered) {
        shellTerminal.bumpTabReattach(openTab.id)
      }
    }
  }
}

async function refreshSnapshot(): Promise<HerdrRuntimeSnapshot | null> {
  const run = ++refreshRun
  if (!snapshot.value) {
    loading.value = true
  }
  try {
    const next = await getSdk().getSnapshot()
    if (run !== refreshRun) return snapshot.value
    if (isValidSnapshot(next)) {
      applySnapshot(next)
      return next
    }
    loading.value = false
    return snapshot.value
  } catch (err) {
    if (run === refreshRun) {
      error.value = err instanceof Error ? err.message : String(err)
      loading.value = false
    }
    return snapshot.value
  }
}

function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  const sdk = getSdk()
  // Subscribe before initial snapshot read so concurrent pushes are never missed.
  unsubSnapshot = sdk.onSnapshotChanged(applySnapshot)
  unsubUpsert = sdk.onSessionUpsert(applySessionUpsert)
  const onProjection = sdk.onProjectionUpdated ?? sdk.projection?.onUpdated
  unsubProjection = onProjection ? onProjection(applyProjectionUpdate) : null
  void refreshSnapshot()
}

function teardownSubscriptions(): void {
  refreshRun += 1
  unsubSnapshot?.()
  unsubUpsert?.()
  unsubProjection?.()
  unsubSnapshot = null
  unsubUpsert = null
  unsubProjection = null
  subscribed = false
  const addresses = [...watchedProjectionAddresses]
  for (const address of addresses) {
    void unwatchProjectionInternal(address)
  }
}

function resolveAddress(tabIdOrAddress: string): string {
  if (tabIdOrAddress.startsWith('herdr:')) {
    return tabIdOrAddress.slice('herdr:'.length)
  }
  const shellTerminal = useShellTerminal()
  const found = shellTerminal.tabs.value.find(
    (tab) => tab.id === tabIdOrAddress || tab.address === tabIdOrAddress
  )
  return found?.address ?? tabIdOrAddress
}

function enrichDrawerTab(tab: ShellTerminalTab): HerdrDrawerTab {
  if (tab.kind !== 'herdr') {
    return { ...tab, viewMode: 'terminal', terminalMounted: true }
  }
  const viewMode = tabViewModes[tab.id] ?? 'terminal'
  const terminalMounted = tabTerminalEntered[tab.id] === true || viewMode === 'terminal'
  return { ...tab, viewMode, terminalMounted }
}

async function watchProjection(
  address: string,
  limit?: number
): Promise<HerdrProjectedConversation | null> {
  if (!address) return null
  const seq = (projectionRequestSeq.get(address) ?? 0) + 1
  projectionRequestSeq.set(address, seq)
  watchedProjectionAddresses.add(address)
  if (!projectionsByAddress[address]) {
    projectionLoadingByAddress[address] = true
  }
  projectionErrorByAddress[address] = null
  try {
    const request = limit !== undefined ? { address, limit } : { address }
    const sdk = getSdk()
    const result = sdk.projection?.watch
      ? await sdk.projection.watch(request)
      : await sdk.watchProjection(request)
    if (projectionRequestSeq.get(address) !== seq) {
      return projectionsByAddress[address] ?? null
    }
    if (isValidProjection(result)) {
      applyProjectionUpdate(result)
      return result
    }
    projectionLoadingByAddress[address] = false
    return projectionsByAddress[address] ?? null
  } catch (err) {
    if (projectionRequestSeq.get(address) === seq) {
      projectionLoadingByAddress[address] = false
      projectionErrorByAddress[address] = err instanceof Error ? err.message : String(err)
    }
    return projectionsByAddress[address] ?? null
  }
}

async function refreshProjection(
  address: string,
  limit?: number
): Promise<HerdrProjectedConversation | null> {
  if (!address) return null
  const seq = (projectionRequestSeq.get(address) ?? 0) + 1
  projectionRequestSeq.set(address, seq)
  if (!projectionsByAddress[address]) {
    projectionLoadingByAddress[address] = true
  }
  projectionErrorByAddress[address] = null
  try {
    const request = limit !== undefined ? { address, limit } : { address }
    const sdk = getSdk()
    const result = sdk.projection?.get
      ? await sdk.projection.get(request)
      : await sdk.getProjection(request)
    if (projectionRequestSeq.get(address) !== seq) {
      return projectionsByAddress[address] ?? null
    }
    if (isValidProjection(result)) {
      applyProjectionUpdate(result)
      return result
    }
    projectionLoadingByAddress[address] = false
    return projectionsByAddress[address] ?? null
  } catch (err) {
    if (projectionRequestSeq.get(address) === seq) {
      projectionLoadingByAddress[address] = false
      projectionErrorByAddress[address] = err instanceof Error ? err.message : String(err)
    }
    return projectionsByAddress[address] ?? null
  }
}

async function unwatchProjection(address: string): Promise<void> {
  await unwatchProjectionInternal(address)
}

async function detach(tabIdOrAddress: string, options: { closeTab?: boolean } = {}): Promise<void> {
  const address = resolveAddress(tabIdOrAddress)
  const controller = streamControllers.get(address)
  streamControllers.delete(address)
  const handle = streamHandles.get(address)
  streamHandles.delete(address)

  attachedByAddress[address] = false
  attachingByAddress[address] = false

  if (options.closeTab) {
    const shellTerminal = useShellTerminal()
    const tab = shellTerminal.findTabByAddress(address)
    const closedTabId = tab?.id ?? tabIdOrAddress
    if (tab) {
      shellTerminal.removeTab(tab.id)
    } else {
      shellTerminal.removeTab(tabIdOrAddress)
    }
    delete tabViewModes[closedTabId]
    delete tabTerminalEntered[closedTabId]
    const stillOpen = shellTerminal.tabs.value.some(
      (item) => item.kind === 'herdr' && item.address === address
    )
    if (!stillOpen) {
      void unwatchProjectionInternal(address)
    }
  }

  if (handle) {
    await handle.detach().catch(() => {})
  } else if (controller) {
    controller.abort()
  }
}

async function detachAllStreams(): Promise<void> {
  const addresses = new Set<string>([...streamHandles.keys(), ...streamControllers.keys()])
  await Promise.all([...addresses].map((address) => detach(address)))
}

async function attach(
  tabIdOrAddress: string,
  options: HerdrAttachOptions
): Promise<HerdrStreamHandle> {
  const address = resolveAddress(tabIdOrAddress)
  // Detach any existing stream for this address before creating a new attachment.
  if (streamHandles.has(address) || streamControllers.has(address)) {
    await detach(address)
  }

  const controller = new AbortController()
  streamControllers.set(address, controller)
  attachingByAddress[address] = true
  attachedByAddress[address] = false

  const externalSignal = options.handlers?.signal
  const onExternalAbort = (): void => {
    controller.abort()
  }
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }
  }

  const request: HerdrStreamAttachRequest = {
    terminal: address,
    cols: options.cols,
    rows: options.rows,
    history: options.history ?? 2000,
    resizeNotifications: options.resizeNotifications ?? true,
    ...(options.observe !== undefined ? { observe: options.observe } : {}),
    ...(options.resumed !== undefined ? { resumed: options.resumed } : {}),
    ...(options.display !== undefined ? { display: options.display } : {})
  }

  try {
    const handle = await getSdk().attachStream(request, {
      ...options.handlers,
      awaitDisplay: options.handlers?.awaitDisplay ?? true,
      signal: controller.signal,
      onClosed: (payload: HerdrStreamClosedPayload) => {
        if (streamControllers.get(address) === controller) {
          streamControllers.delete(address)
        }
        if (streamHandles.get(address)?.streamId === payload.streamId) {
          streamHandles.delete(address)
        }
        attachedByAddress[address] = false
        attachingByAddress[address] = false

        options.handlers?.onClosed?.(payload)

        if (payload.reason === 'restarted') {
          const shellTerminal = useShellTerminal()
          const openTab = shellTerminal.findTabByAddress(address)
          if (openTab) {
            const terminalEntered =
              tabTerminalEntered[openTab.id] === true ||
              (tabViewModes[openTab.id] ?? 'terminal') === 'terminal'
            if (terminalEntered) {
              shellTerminal.bumpTabReattach(openTab.id)
            }
          }
        }
      }
    })

    if (streamControllers.get(address) !== controller) {
      await handle.detach().catch(() => {})
      throw new Error('HERDR_STREAM_SUPERSEDED')
    }

    streamHandles.set(address, handle)
    attachedByAddress[address] = true
    attachingByAddress[address] = false
    upsertSessionLocally(handle.terminal)
    return handle
  } catch (err) {
    if (streamControllers.get(address) === controller) {
      streamControllers.delete(address)
      attachedByAddress[address] = false
      attachingByAddress[address] = false
    }
    throw err
  } finally {
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

export function __resetHerdrRuntimeForTesting(): void {
  for (const controller of streamControllers.values()) {
    controller.abort()
  }
  streamControllers.clear()
  streamHandles.clear()
  watchedProjectionAddresses.clear()
  projectionRequestSeq.clear()
  for (const key of Object.keys(attachedByAddress)) {
    delete attachedByAddress[key]
  }
  for (const key of Object.keys(attachingByAddress)) {
    delete attachingByAddress[key]
  }
  for (const key of Object.keys(tabViewModes)) {
    delete tabViewModes[key]
  }
  for (const key of Object.keys(tabTerminalEntered)) {
    delete tabTerminalEntered[key]
  }
  for (const key of Object.keys(projectionsByAddress)) {
    delete projectionsByAddress[key]
  }
  for (const key of Object.keys(projectionLoadingByAddress)) {
    delete projectionLoadingByAddress[key]
  }
  for (const key of Object.keys(projectionErrorByAddress)) {
    delete projectionErrorByAddress[key]
  }
  teardownSubscriptions()
  sdkInstance = null
  snapshot.value = null
  loading.value = true
  error.value = null
  scopeConsumers = 0
  refreshRun = 0
  resetShellTerminalTabsForTesting()
}

export function useHerdrRuntime(options: { subscribe?: boolean } = {}) {
  if (options.subscribe !== false) {
    ensureSubscribed()

    if (getCurrentScope()) {
      scopeConsumers += 1
      onScopeDispose(() => {
        scopeConsumers = Math.max(0, scopeConsumers - 1)
        if (scopeConsumers === 0) {
          teardownSubscriptions()
        }
      })
    }
  }

  const shellTerminal = useShellTerminal()

  const herdrEnabled = computed(() => isBetaFeatureEnabled(appSetting, 'herdrRuntime'))
  const connection = computed<HerdrConnectionState>(
    () => snapshot.value?.connection ?? 'disconnected'
  )
  const ownership = computed<HerdrOwnership>(() => snapshot.value?.ownership ?? 'none')
  const core = computed<HerdrCoreSummary | null>(() => snapshot.value?.core ?? null)
  const machines = computed<HerdrMachineView[]>(() => snapshot.value?.machines ?? [])
  const connectedMachines = computed<HerdrMachineView[]>(() =>
    machines.value.filter((machine) => machine.state === 'connected')
  )
  const templates = computed<HerdrTemplateView[]>(() => snapshot.value?.templates ?? [])

  const isConnected = computed(() => connection.value === 'connected')
  const isFallback = computed(
    () => connection.value === 'fallback-pty' || connection.value === 'unavailable'
  )

  const projectedSessions = computed<HerdrProjectedSession[]>(() => {
    const rawSessions = snapshot.value?.sessions ?? []
    const projects = readProjectsSafe()
    return rawSessions.map((session) => {
      const matched = matchSessionProject(session, projects)
      const appName = resolveHerdrSessionApp(session)
      const locationLabel = resolveHerdrSessionLocation(session, matched.projectName)
      const effectiveCwd = session.foregroundCwd || session.cwd || ''
      return {
        ...session,
        projectId: matched.projectId,
        projectName: matched.projectName,
        displayTitle: resolveHerdrSessionTitle(session, matched.projectName),
        appName,
        locationLabel,
        effectiveCwd
      }
    })
  })

  const liveSessions = computed<HerdrProjectedSession[]>(() =>
    sortLiveSessions(projectedSessions.value.filter((session) => session.state === 'live'))
  )

  const finishedSessions = computed<HerdrProjectedSession[]>(() =>
    sortFinishedSessions(projectedSessions.value.filter((session) => session.state === 'finished'))
  )

  const sessions = computed<HerdrProjectedSession[]>(() => [
    ...liveSessions.value,
    ...finishedSessions.value
  ])

  const liveCount = computed(() => liveSessions.value.length)
  const blockedCount = computed(
    () => liveSessions.value.filter((session) => session.status?.state === 'blocked').length
  )
  const hasBlockedSession = computed(() => blockedCount.value > 0)

  const sessionByAddress = computed(() => {
    const map = new Map<string, HerdrProjectedSession>()
    for (const session of projectedSessions.value) {
      map.set(session.address, session)
    }
    return map
  })

  const projectGroups = computed<HerdrProjectGroup[]>(() => groupHerdrSessions(liveSessions.value))

  const projectGroupByKey = computed(() => {
    const map = new Map<string, HerdrProjectGroup>()
    for (const group of projectGroups.value) {
      map.set(group.key, group)
    }
    return map
  })

  const projectGroupByAddress = computed(() => {
    const map = new Map<string, HerdrProjectGroup>()
    for (const group of projectGroups.value) {
      for (const session of group.sessions) {
        map.set(session.address, group)
      }
    }
    return map
  })

  const drawerTabs = computed<HerdrDrawerTab[]>(() =>
    shellTerminal.tabs.value.map((tab) => enrichDrawerTab(tab))
  )

  const activeTab = computed<HerdrDrawerTab | null>(() => {
    const current = shellTerminal.activeTab.value
    return current ? enrichDrawerTab(current) : null
  })

  const unattachedLiveSessions = computed<HerdrProjectedSession[]>(() => {
    const openAddresses = new Set(
      shellTerminal.tabs.value
        .filter((tab) => tab.kind === 'herdr' && tab.address)
        .map((tab) => tab.address!)
    )
    return liveSessions.value.filter((session) => !openAddresses.has(session.address))
  })

  async function ensureStarted(request?: HerdrEnsureStartedRequest): Promise<HerdrRuntimeSnapshot> {
    error.value = null
    const next = await getSdk().ensureStarted(request)
    applySnapshot(next)
    return next
  }

  async function reconnect(): Promise<HerdrRuntimeSnapshot> {
    error.value = null
    const next = await getSdk().reconnect()
    applySnapshot(next)
    return next
  }

  async function run(request: HerdrTerminalRunRequest = {}): Promise<HerdrSessionView> {
    const session = await getSdk().run(request)
    upsertSessionLocally(session)
    return session
  }

  async function send(
    terminal: string,
    text: string,
    options: Omit<HerdrTerminalSendRequest, 'terminal' | 'text'> = {}
  ): Promise<HerdrSendResult> {
    return getSdk().send({ terminal, text, ...options })
  }

  async function keys(terminal: string, sequence: string[]): Promise<HerdrTerminalKeysResult> {
    return getSdk().keys({ terminal, keys: sequence })
  }

  async function put(
    terminal: string,
    name: string,
    dataBase64: string
  ): Promise<HerdrTerminalPutResult> {
    return getSdk().put({ terminal, name, data: dataBase64 })
  }

  async function interrupt(
    terminal: string,
    timeout?: number
  ): Promise<HerdrTerminalControlResult> {
    return getSdk().interrupt(terminal, timeout)
  }

  async function kill(terminal: string): Promise<HerdrTerminalControlResult> {
    await detach(terminal)
    const result = await getSdk().kill(terminal)
    if (result.session) {
      upsertSessionLocally(result.session)
    }
    return result
  }

  async function rm(terminal: string): Promise<HerdrTerminalControlResult> {
    await detach(terminal, { closeTab: true })
    closeHerdrTabEverywhere(terminal)
    const result = await getSdk().rm(terminal)
    if (snapshot.value) {
      applySessionUpsert({
        revision: snapshot.value.revision,
        seq: snapshot.value.seq,
        kind: 'removed',
        address: terminal,
        session: null
      })
    }
    return result
  }

  async function keep(terminal: string, enabled: boolean): Promise<HerdrTerminalControlResult> {
    const result = await getSdk().keep(terminal, enabled)
    if (result.session) {
      upsertSessionLocally(result.session)
    }
    return result
  }

  function getTabViewMode(tabId: string): HerdrTabViewMode {
    return tabViewModes[tabId] ?? 'terminal'
  }

  function setTabViewMode(tabId: string, mode: HerdrTabViewMode): void {
    const tab = shellTerminal.tabs.value.find((item) => item.id === tabId)
    if (!tab || tab.kind !== 'herdr') return
    tabViewModes[tabId] = mode
    if (mode === 'terminal') {
      tabTerminalEntered[tabId] = true
    } else if (tab.address && !watchedProjectionAddresses.has(tab.address)) {
      void watchProjection(tab.address)
    }
  }

  function openSessionStructured(
    address: string,
    options: { openDrawer?: boolean; limit?: number } = {}
  ): HerdrDrawerTab {
    const existing = sessionByAddress.value.get(address)
    const tab = shellTerminal.openHerdrTab(address, {
      title: existing?.displayTitle ?? address,
      machine: existing?.machine ?? null,
      openDrawer: options.openDrawer ?? true
    })
    tabViewModes[tab.id] = 'structured'
    if (tabTerminalEntered[tab.id] === undefined) {
      tabTerminalEntered[tab.id] = false
    }
    void watchProjection(address, options.limit)
    return enrichDrawerTab(tab)
  }

  function openTerminalTab(
    address: string,
    options: { openDrawer?: boolean } = {}
  ): HerdrDrawerTab {
    const existing = sessionByAddress.value.get(address)
    const tab = shellTerminal.openHerdrTab(address, {
      title: existing?.displayTitle ?? address,
      machine: existing?.machine ?? null,
      openDrawer: options.openDrawer ?? true
    })
    tabViewModes[tab.id] = 'terminal'
    tabTerminalEntered[tab.id] = true
    return enrichDrawerTab(tab)
  }

  async function startSession(request: HerdrTerminalRunRequest = {}): Promise<HerdrSessionView> {
    const env = request.env?.TERM_PROGRAM
      ? request.env
      : { ...request.env, TERM_PROGRAM: HERDR_IIP_TERM_PROGRAM }
    return run({ ...request, env })
  }

  async function openNewHerdrTab(request: HerdrTerminalRunRequest = {}): Promise<HerdrDrawerTab> {
    const session = await startSession(request)
    return openTerminalTab(session.address, { openDrawer: true })
  }

  async function closeTab(tabId: string): Promise<void> {
    await detach(tabId, { closeTab: true })
  }

  async function killTab(tabId: string): Promise<HerdrTerminalControlResult | null> {
    const tab = shellTerminal.tabs.value.find((item) => item.id === tabId)
    const address = tab?.address ?? (tabId.startsWith('herdr:') ? resolveAddress(tabId) : null)
    await detach(tabId, { closeTab: true })
    if (!address) return null
    return kill(address)
  }

  function getStreamHandle(tabIdOrAddress: string): HerdrStreamHandle | undefined {
    return streamHandles.get(resolveAddress(tabIdOrAddress))
  }

  function isAttached(tabIdOrAddress: string): boolean {
    return attachedByAddress[resolveAddress(tabIdOrAddress)] === true
  }

  function isAttaching(tabIdOrAddress: string): boolean {
    return attachingByAddress[resolveAddress(tabIdOrAddress)] === true
  }

  function isWatchingProjection(address: string): boolean {
    return watchedProjectionAddresses.has(address)
  }

  return {
    snapshot,
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    herdrEnabled,
    connection,
    ownership,
    core,
    machines,
    connectedMachines,
    templates,
    isConnected,
    isFallback,
    sessions,
    liveSessions,
    finishedSessions,
    liveCount,
    blockedCount,
    hasBlockedSession,
    sessionByAddress,
    projectGroups,
    projectGroupByKey,
    projectGroupByAddress,
    unattachedLiveSessions,
    drawerTabs,
    activeTabId: shellTerminal.activeTabId,
    activeTab,
    projectionsByAddress,
    projectionLoadingByAddress,
    projectionErrorByAddress,
    tabViewModes,
    refreshSnapshot,
    ensureStarted,
    reconnect,
    run,
    send,
    keys,
    put,
    interrupt,
    kill,
    rm,
    keep,
    watchProjection,
    unwatchProjection,
    refreshProjection,
    isWatchingProjection,
    getTabViewMode,
    setTabViewMode,
    openSessionStructured,
    openTerminalTab,
    startSession,
    openNewHerdrTab,
    setActiveTab: shellTerminal.setActiveTab,
    attach,
    detach,
    detachAllStreams,
    closeTab,
    killTab,
    getStreamHandle,
    isAttached,
    isAttaching
  }
}

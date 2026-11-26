<script lang="ts" name="HerdrConversationStage" setup>
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import type { CodeRunPayload } from '@talex-touch/tuffex/stream-markdown'
import type { TerminalInstance, TerminalSize } from '@talex-touch/tuffex/terminal'
import type {
  HerdrOscState,
  HerdrStreamClosedPayload,
  HerdrStreamHandle,
  HerdrTerminalDisplay
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type {
  ConversationMessage,
  ConversationTurnMeta
} from '~/modules/conversation/useHomeConversation'
import type { WorkspaceFileAiActionPayload } from '~/components/preview/workspace-file-tree'
import { useThinkingTicker } from '@talex-touch/intelligence-uikit/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxStatusHint } from '@talex-touch/tuffex/status-hint'
import { TxTerminal } from '@talex-touch/tuffex/terminal'
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  provide,
  reactive,
  ref,
  watch
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { APP_SURFACE_ROUTES } from '../../../../../shared/app-surface-routes'
import { buildActivityTurns } from '~/modules/conversation/workspace-activity'
import {
  composeHerdrMessageWithAttachments,
  formatHerdrProviderLabel,
  herdrProjectionToConversationMessages,
  resolveHerdrRunStep
} from '~/modules/herdr/herdr-conversation-adapter'
import { groupHerdrSessions } from '~/modules/herdr/herdr-project-groups'
import { useHerdrAttachments } from '~/modules/herdr/useHerdrAttachments'
import { useHerdrRuntime } from '~/modules/herdr/useHerdrRuntime'
import { type HerdrStageViewMode, useHerdrStageControl } from '~/modules/herdr/useHerdrStageControl'
import { useShellRightSidebar } from '~/modules/layout/useShellRightSidebar'
import { useShellStageActions } from '~/modules/layout/useShellStageActions'
import { useShellTerminal } from '~/modules/layout/useShellTerminal'
import { HERDR_SPACE_KEY, herdrProjectSpaceKey } from '~/modules/layout/useShellWorkspaceTabs'
import { useAccessibilitySupport } from '~/modules/platform/accessibility-support'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import { homeMessageContextKey } from './composables/home-message-context'
import { useHomeComposerLayout } from './composables/useHomeComposerLayout'
import { useHomeDictation } from './composables/useHomeDictation'
import { useHomePreviewPanels } from './composables/useHomePreviewPanels'
import { SIDE_PANEL_MIN_WIDTH } from './composables/useHomeSidePanel'
import { useMessageParts } from './composables/useMessageParts'
import { useReadAloud } from './composables/useReadAloud'
import { useTurnMetrics } from './composables/useTurnMetrics'
import HomeRunDock from './composer/HomeRunDock.vue'
import { deriveSendState, isAwaitingFirstToken } from './composer/send-state'
import HomeConversationStream from './HomeConversationStream.vue'
import HomePayloadModal from './HomePayloadModal.vue'
import HomeSidePanelSlot from './HomeSidePanelSlot.vue'
import HomeStageBlurs from './HomeStageBlurs.vue'
import TuffAIComposer from './TuffAIComposer.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const log = createRendererLogger('HerdrConversationStage')
const herdr = useHerdrRuntime()
const herdrStageControl = useHerdrStageControl()
const shellStageActions = useShellStageActions()
const screenReaderMode = useAccessibilitySupport()
const { runCommand: runTerminalCommand } = useShellTerminal()
const { dockHost: rightSidebarDockHost } = useShellRightSidebar()

const pageRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const streamEl = ref<InstanceType<typeof HomeConversationStream> | null>(null)
const streamRef = computed(() => streamEl.value?.stream ?? null)
const streamFollowing = ref(true)
const composerEl = ref<InstanceType<typeof TuffAIComposer> | null>(null)
const composerGroupRef = ref<HTMLElement | null>(null)
const inputRef = computed(() => composerEl.value?.input ?? null)
const composerRef = computed(() => composerEl.value?.box ?? null)

const draft = ref('')
const draftByAddress = new Map<string, string>()
const sending = ref(false)
const interrupting = ref(false)
const killing = ref(false)
const keepAliveActive = ref(true)

function persistDraftForAddress(targetAddress: string, value: string): void {
  if (!targetAddress) return
  if (value) {
    draftByAddress.set(targetAddress, value)
  } else {
    draftByAddress.delete(targetAddress)
  }
}

const address = computed(() => {
  const raw = route.params.address
  const value = Array.isArray(raw) ? (raw[0] ?? '') : typeof raw === 'string' ? raw : ''
  if (!value) return ''
  try {
    return decodeURIComponent(value).trim()
  } catch {
    return value.trim()
  }
})

const isStageRoute = computed(() => route.path.startsWith('/home/herdr/') && Boolean(address.value))
const isStageActive = computed(() => keepAliveActive.value && isStageRoute.value)

const session = computed(() =>
  address.value ? (herdr.sessionByAddress.value.get(address.value) ?? null) : null
)
const projection = computed(() =>
  address.value ? (herdr.projectionsByAddress[address.value] ?? null) : null
)
const projectionLoading = computed(() =>
  address.value ? Boolean(herdr.projectionLoadingByAddress[address.value]) : false
)
const projectionError = computed(() =>
  address.value ? (herdr.projectionErrorByAddress[address.value] ?? null) : null
)

const isLive = computed(() => session.value?.state === 'live')
const isFinished = computed(() => session.value?.state === 'finished')
const oscState = computed<HerdrOscState>(() => session.value?.status?.state ?? 'idle')
const isWorking = computed(() => isLive.value && oscState.value === 'working')
const isBlocked = computed(() => isLive.value && oscState.value === 'blocked')
const isStreaming = computed(() => isWorking.value)

const autoFallbackToTerminal = computed(
  () =>
    Boolean(session.value) &&
    !projectionLoading.value &&
    projection.value !== null &&
    !projection.value.available
)

const userSelectedMode = computed<HerdrStageViewMode | null>(() =>
  herdrStageControl.getSelectedMode(address.value)
)

const viewMode = computed<HerdrStageViewMode>(() => {
  if (userSelectedMode.value) return userSelectedMode.value
  if (autoFallbackToTerminal.value) return 'terminal'
  return 'chat'
})

const providerLabel = computed(() =>
  formatHerdrProviderLabel(projection.value?.provider ?? session.value?.appName ?? null)
)
const stageTitle = computed(
  () => session.value?.displayTitle || address.value || t('herdr.space.name')
)
const effectiveWorkspaceRootSource = computed(
  () =>
    session.value?.effectiveCwd || session.value?.foregroundCwd || session.value?.cwd || undefined
)
const conversationId = computed(() => (address.value ? `herdr:${address.value}` : null))
const projectId = computed(() => session.value?.projectId ?? null)

const messages = computed<ConversationMessage[]>(() =>
  herdrProjectionToConversationMessages(projection.value, session.value)
)
const activityTurns = computed(() => buildActivityTurns(messages.value))
const lastTurn = computed<ConversationTurnMeta | undefined>(() => {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const item = messages.value[i]
    if (item?.role === 'assistant' && item.meta) return item.meta
  }
  return undefined
})

const runStep = computed(() => resolveHerdrRunStep(messages.value, session.value))
const runStartedAt = computed(() => {
  const tail = messages.value[messages.value.length - 1]
  if (tail?.role === 'assistant' && tail.status === 'streaming') {
    return tail.createdAt ?? session.value?.statusMs ?? undefined
  }
  return session.value?.statusMs ?? undefined
})
const isThinkingActive = computed(() => {
  if (!isStreaming.value) return false
  const step = runStep.value
  return step.kind === 'waiting' || (step.kind === 'thinking' && !step.title)
})
const thinkingTicker = useThinkingTicker({
  active: isThinkingActive,
  locale
})

const { composerClearance, autoGrow, collapseDraft } = useHomeComposerLayout({
  input: inputRef,
  composer: composerRef,
  composerGroup: composerGroupRef
})

function resolveSidePanelAvailableWidth(): number | undefined {
  if (rightSidebarDockHost.value) {
    const mainWidth = pageRef.value?.closest<HTMLElement>('.AppShell-Main')?.clientWidth ?? 0
    const rightWidth = rightSidebarDockHost.value.clientWidth
    const combined = mainWidth + rightWidth
    if (combined > 0) return combined
  }
  const pageWidth = pageRef.value?.clientWidth
  return pageWidth && pageWidth > 0 ? pageWidth : undefined
}

const rememberedSpaceKeyByAddress = reactive<Record<string, string>>({})

watch(
  [
    address,
    () => (address.value ? (herdr.projectGroupByAddress?.value?.get(address.value) ?? null) : null)
  ],
  ([addr, group]) => {
    if (addr && group) {
      rememberedSpaceKeyByAddress[addr] = herdrProjectSpaceKey(group.key)
    }
  },
  { immediate: true }
)

const herdrSpaceKey = computed(() => {
  const addr = address.value
  if (!addr) return HERDR_SPACE_KEY
  const liveGroup = herdr.projectGroupByAddress?.value?.get(addr)
  if (liveGroup) return herdrProjectSpaceKey(liveGroup.key)
  const remembered = rememberedSpaceKeyByAddress[addr]
  if (remembered) return remembered
  if (session.value) {
    const derived = groupHerdrSessions([session.value])[0]
    if (derived) return herdrProjectSpaceKey(derived.key)
  }
  return HERDR_SPACE_KEY
})

const {
  panelOpen,
  panelWidth,
  isResizing,
  tabs: sidePanelTabs,
  activeTabId: activeSidePanelTabId,
  openLauncher,
  openFileInSidebar,
  openWebInSidebar,
  openBlankWebTab,
  openWorkspaceTool,
  updateWebTab,
  updateFileTab,
  selectTab: selectSidePanelTab,
  closeTab: closeSidePanelTab,
  closeOtherTabs: closeOtherSidePanelTabs,
  closeAllTabs: closeAllSidePanelTabs,
  startResize: startSidePanelResize,
  resetWidth: resetSidePanelWidth,
  gitAvailable,
  effectiveWorkspaceRoot,
  showCodePreview,
  openWebInBuiltInBrowser,
  openFileInBuiltInBrowser,
  openWebExternal,
  pickAndOpenFileInSidebar
} = useHomePreviewPanels({
  conversationId,
  projectId,
  spaceKey: herdrSpaceKey,
  workspaceRoot: effectiveWorkspaceRootSource,
  messages,
  bodyRef,
  getSidePanelAvailableWidth: resolveSidePanelAvailableWidth
})

const {
  pendingAttachments,
  isUploading: attachmentsUploading,
  attachPreviewProps,
  attachOpenLabel,
  addFiles,
  removeAttachment,
  resolveStagedPaths,
  isDragover,
  onPaste,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop
} = useHerdrAttachments({
  address,
  isActive: () => isStageActive.value && viewMode.value === 'chat',
  canUpload: () => isLive.value,
  putFile: (terminal, name, base64) => herdr.put(terminal, name, base64),
  focusInput: () => inputRef.value?.focus()
})

const { dictation, streamItems, voiceSendBlocked } = useHomeDictation({
  draft,
  input: () => inputRef.value,
  messages,
  isStreaming,
  isHomeRoute: isStageActive,
  sending,
  workspaceLoading: ref(false),
  workspaceLoadError: ref(null),
  router,
  onTextChange: autoGrow,
  onLeaveHome: () => {}
})

const { toggleSpeak, speakStateOf } = useReadAloud()
const { showTurnMetrics, isTurnFooterResting } = useTurnMetrics(messages)
const emptyEnteringSet: ReadonlySet<string> = new Set()

const messageParts = useMessageParts({
  submit: async (text) => {
    await sendPlainText(text)
  },
  openExternal: async (url) => {
    openWebInSidebar(url)
  },
  clearDraft: () => {
    draft.value = ''
    if (address.value) draftByAddress.delete(address.value)
    collapseDraft(false)
  },
  onSubmitError: (error) => {
    const detail = error instanceof Error ? error.message : String(error)
    toast.error(detail || t('herdr.actions.sendFailed'))
  }
})

provide(homeMessageContextKey, {
  ...messageParts,
  attachPreviewProps,
  attachOpenLabel,
  thinkingVerb: thinkingTicker.activeVerb,
  thinkingLabel: thinkingTicker.activeLabel
})

const composerModel = computed(() => ({
  label: providerLabel.value,
  scheduler: session.value?.machine ? `Herdr · ${session.value.machine}` : 'Herdr',
  effort: address.value || undefined
}))

const composerPlaceholder = computed(() =>
  isFinished.value
    ? t('herdr.stage.composerFinishedPlaceholder')
    : t('herdr.stage.composerPlaceholder', { target: stageTitle.value })
)

const hasSendableContent = computed(
  () => Boolean(draft.value.trim()) || pendingAttachments.value.length > 0
)

const sendState = computed(() => {
  if (!isLive.value || sending.value) {
    return isWorking.value ? 'streaming' : 'empty'
  }
  const tail = messages.value[messages.value.length - 1]
  return deriveSendState({
    hasText: hasSendableContent.value,
    streaming: isWorking.value,
    awaitingFirstToken: isAwaitingFirstToken(tail),
    blocked: isBlocked.value,
    dictating: dictation.active.value
  })
})

const blockedDescription = computed(() => {
  const kind = session.value?.status?.kind
  if (kind === 'permission') return t('herdr.conversation.blockedHint.permission')
  if (kind === 'question') return t('herdr.conversation.blockedHint.question')
  if (kind === 'auth') return t('herdr.conversation.blockedHint.auth')
  return t('herdr.conversation.blockedHint.generic')
})

const statusLabel = computed(() => {
  const base = t(`herdr.status.${oscState.value}`)
  if (oscState.value === 'blocked' && session.value?.status?.kind) {
    return `${base} · ${t(`herdr.blockedKind.${session.value.status.kind}`)}`
  }
  return base
})

const statusIconClass = computed(() => {
  switch (oscState.value) {
    case 'working':
      return 'i-ri-loader-4-line is-spin'
    case 'blocked':
      return 'i-ri-alert-line'
    case 'done':
      return 'i-ri-check-line'
    case 'error':
      return 'i-ri-error-warning-line'
    default:
      return 'i-ri-checkbox-blank-circle-fill is-idle-dot'
  }
})

const statusHintTone = computed<StatusTone>(() => {
  switch (oscState.value) {
    case 'done':
      return 'success'
    case 'working':
      return 'info'
    case 'blocked':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'muted'
  }
})

const statusPulseKey = computed(
  () => `${address.value}:${oscState.value}:${session.value?.statusMs ?? 0}`
)

// ── Inline TxTerminal lifecycle for `'terminal'` view mode ──────────────────────────
const terminalFontFamily = computed(() => appSetting.localAiCli?.terminalFontFamily || undefined)
let stageTerminalInstance: TerminalInstance | null = null
let stageStreamHandle: HerdrStreamHandle | null = null
let stageStreamAddress: string | null = null
let stageAttachGeneration = 0

function resolveStageTerminalDisplay(): HerdrTerminalDisplay | undefined {
  const cell = stageTerminalInstance?.getCellSizePixels?.()
  if (!cell || cell.width <= 0 || cell.height <= 0) return undefined
  return { cell: [cell.width, cell.height] }
}

function writeStageTerminal(data: string): Promise<void> {
  if (!stageTerminalInstance) return Promise.resolve()
  return stageTerminalInstance.write(data).catch((error) => {
    log.error('Failed to write output to Herdr stage terminal', { error })
  })
}

async function detachStageTerminal(): Promise<void> {
  stageAttachGeneration += 1
  const handle = stageStreamHandle
  stageStreamHandle = null
  stageStreamAddress = null
  if (handle) {
    await handle.detach().catch(() => {})
  }
}

async function attachStageTerminal(targetAddress: string): Promise<void> {
  if (!targetAddress || !stageTerminalInstance) return
  if (stageStreamHandle && stageStreamAddress === targetAddress) {
    stageTerminalInstance.fit()
    stageTerminalInstance.focus()
    return
  }

  await detachStageTerminal()
  const currentGen = ++stageAttachGeneration
  const size = stageTerminalInstance.getSize()
  const cols = size?.cols ?? 80
  const rows = size?.rows ?? 24
  const display = resolveStageTerminalDisplay()

  try {
    const handle = await herdr.attach(targetAddress, {
      cols,
      rows,
      history: 2000,
      resizeNotifications: true,
      ...(display ? { display } : {}),
      handlers: {
        awaitDisplay: true,
        onData: (data) => {
          if (currentGen !== stageAttachGeneration) return undefined
          return writeStageTerminal(data)
        },
        onClosed: (payload: HerdrStreamClosedPayload) => {
          if (currentGen !== stageAttachGeneration) return
          stageStreamHandle = null
          stageStreamAddress = null
          if (payload.reason === 'detached') return
          if (payload.reason === 'exited') {
            const code = payload.exitCode ?? payload.signal ?? 0
            void writeStageTerminal(`\r\n\x1b[90m[${t('terminal.exit', { code })}]\x1b[0m\r\n`)
          } else if (payload.reason === 'restarted') {
            void writeStageTerminal(
              `\r\n\x1b[90m[${t('terminal.herdr.restartedNotice')}]\x1b[0m\r\n`
            )
          } else if (payload.reason === 'lost') {
            void writeStageTerminal(`\r\n\x1b[90m[${t('terminal.herdr.lostNotice')}]\x1b[0m\r\n`)
          } else if (payload.reason === 'core-disconnected') {
            void writeStageTerminal(
              `\r\n\x1b[90m[${t('terminal.herdr.disconnectedNotice')}]\x1b[0m\r\n`
            )
          }
        }
      }
    })

    if (currentGen !== stageAttachGeneration) {
      await handle.detach().catch(() => {})
      return
    }

    stageStreamHandle = handle
    stageStreamAddress = targetAddress
    await nextTick()
    if (viewMode.value === 'terminal' && isStageActive.value) {
      stageTerminalInstance?.fit()
      stageTerminalInstance?.focus()
      void handle.focus(true).catch(() => {})
    }
  } catch (error) {
    if (currentGen === stageAttachGeneration) {
      log.error('Failed to attach Herdr stage terminal', { address: targetAddress, error })
      void writeStageTerminal(`\r\n\x1b[31m${t('terminal.failed')}: ${String(error)}\x1b[0m\r\n`)
    }
  }
}

function handleStageTerminalReady(instance: TerminalInstance): void {
  stageTerminalInstance = instance
  if (viewMode.value === 'terminal' && isStageActive.value && address.value) {
    void attachStageTerminal(address.value)
  }
}

function handleStageTerminalData(data: string): void {
  if (!stageStreamHandle) return
  void stageStreamHandle.write(data).catch((error) => {
    log.error('Failed to write input to Herdr stage terminal', { error })
  })
}

function handleStageTerminalResize(size: TerminalSize): void {
  if (!stageStreamHandle) return
  void stageStreamHandle.resize(size.cols, size.rows).catch(() => {})
}

function handleStageTerminalFocus(focused: boolean): void {
  if (!stageStreamHandle) return
  void stageStreamHandle.focus(focused).catch(() => {})
}

function setViewMode(mode: HerdrStageViewMode): void {
  if (address.value) {
    herdrStageControl.selectedModeByAddress[address.value] = mode
  }
  if (mode === 'chat') {
    void detachStageTerminal()
    void nextTick(() => {
      composerEl.value?.focus()
    })
  } else if (address.value && stageTerminalInstance) {
    void attachStageTerminal(address.value)
  }
}

// ── Projection watching & cleanup ───────────────────────────────────────────────────
let watchedAddress: string | null = null

function hasDrawerStructuredWatcher(targetAddress: string): boolean {
  return herdr.drawerTabs.value.some(
    (tab) => tab.kind === 'herdr' && tab.address === targetAddress && tab.viewMode === 'structured'
  )
}

function releaseWatchedProjection(targetAddress: string | null): void {
  if (!targetAddress) return
  if (!hasDrawerStructuredWatcher(targetAddress)) {
    void herdr.unwatchProjection(targetAddress)
  }
}

watch(address, (nextAddress, prevAddress) => {
  if (!prevAddress || prevAddress === nextAddress) return
  persistDraftForAddress(prevAddress, draft.value)
  draft.value = nextAddress ? (draftByAddress.get(nextAddress) ?? '') : ''
  void nextTick(() => {
    if (draft.value) {
      autoGrow()
    } else {
      collapseDraft(false)
    }
  })
})

watch(
  [address, isStageActive],
  ([nextAddress, active], [prevAddress]) => {
    if (prevAddress && prevAddress !== nextAddress) {
      streamFollowing.value = true
      void detachStageTerminal()
      releaseWatchedProjection(prevAddress)
      watchedAddress = null
    }

    if (!active) {
      void detachStageTerminal()
      if (watchedAddress) {
        releaseWatchedProjection(watchedAddress)
        watchedAddress = null
      }
      return
    }

    if (nextAddress && watchedAddress !== nextAddress) {
      watchedAddress = nextAddress
      void herdr.watchProjection(nextAddress)
    }
  },
  { immediate: true }
)

watch(viewMode, (mode) => {
  if (mode === 'chat') {
    void detachStageTerminal()
  } else if (isStageActive.value && address.value && stageTerminalInstance) {
    void attachStageTerminal(address.value)
  }
})

onActivated(() => {
  keepAliveActive.value = true
})

onDeactivated(() => {
  keepAliveActive.value = false
})

onBeforeUnmount(() => {
  stageTerminalInstance = null
  void detachStageTerminal()
  if (watchedAddress) {
    releaseWatchedProjection(watchedAddress)
    watchedAddress = null
  }
})

// ── Message sending, voice, interrupt, kill, code execution ─────────────────────────
async function sendPlainText(text: string): Promise<void> {
  const addr = address.value
  const trimmed = text.trim()
  if (!addr || !trimmed || !isLive.value) return
  await herdr.send(addr, trimmed)
  void herdr.refreshProjection(addr)
}

async function pressSend(): Promise<void> {
  const addr = address.value
  if (!addr || !isLive.value || sending.value) return

  if (dictation.active.value) {
    await dictation.stop()
  }

  if (!hasSendableContent.value) return

  sending.value = true
  composerEl.value?.launch()
  const submittedRawDraft = draft.value
  try {
    const staged = await resolveStagedPaths()
    if (staged.failed || address.value !== addr) return
    const outgoing = composeHerdrMessageWithAttachments(submittedRawDraft, staged.paths)
    if (!outgoing) return

    await herdr.send(addr, outgoing)
    if (address.value === addr) {
      if (draft.value === submittedRawDraft) {
        draft.value = ''
        draftByAddress.delete(addr)
        collapseDraft(false)
      }
      for (const id of staged.ids) {
        removeAttachment(id)
      }
      streamFollowing.value = true
      void nextTick(() => {
        streamRef.value?.scrollToBottom()
      })
    } else if (draftByAddress.get(addr) === submittedRawDraft) {
      draftByAddress.delete(addr)
    }
    void herdr.refreshProjection(addr)
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
  } finally {
    sending.value = false
  }
}

async function sendVoiceDraft(): Promise<void> {
  const clip = dictation.clip.value
  const transcript = clip?.spoken?.trim()
  if (!transcript || !isLive.value) return
  sending.value = true
  try {
    await sendPlainText(transcript)
    dictation.dismissClip()
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
  } finally {
    sending.value = false
  }
}

function handleInputKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void pressSend()
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && dictation.active.value) {
    event.preventDefault()
    void dictation.cancel({ restore: true })
  }
}

async function handleInterrupt(): Promise<void> {
  const addr = address.value
  if (!addr || interrupting.value) return
  interrupting.value = true
  try {
    await herdr.interrupt(addr)
    void herdr.refreshProjection(addr)
  } catch {
    toast.error(t('herdr.actions.interruptFailed'))
  } finally {
    interrupting.value = false
  }
}

async function handleKillSession(): Promise<void> {
  const addr = address.value
  if (!addr || killing.value) return
  killing.value = true
  try {
    await detachStageTerminal()
    await herdr.kill(addr)
  } catch {
    toast.error(t('herdr.stage.killConfirmFailed'))
  } finally {
    killing.value = false
  }
}

async function handleRefreshProjection(): Promise<void> {
  if (!address.value) return
  await herdr.refreshProjection(address.value)
}

function runCodeInTerminal(payload: CodeRunPayload): void {
  runTerminalCommand(payload.code, {
    cwd: effectiveWorkspaceRoot.value,
    lang: payload.lang
  })
}

let unregisterStageControl: (() => void) | null = null
let unregisterStageActions: (() => void) | null = null

watch(
  [address, isStageActive],
  ([nextAddress, active]) => {
    unregisterStageControl?.()
    unregisterStageControl = null
    unregisterStageActions?.()
    unregisterStageActions = null
    if (!active || !nextAddress) return
    const togglePanel = (): void => {
      panelOpen.value = !panelOpen.value
    }
    unregisterStageControl = herdrStageControl.registerActiveStage({
      address: nextAddress,
      getViewMode: () => viewMode.value,
      setViewMode,
      isPanelOpen: () => panelOpen.value,
      togglePanel,
      refreshProjection: handleRefreshProjection,
      interrupt: handleInterrupt,
      kill: handleKillSession
    })
    unregisterStageActions = shellStageActions.register({
      surface: 'herdr',
      isPanelOpen: () => panelOpen.value,
      togglePanel,
      showTurnInfo: () => viewMode.value === 'chat',
      getTurn: () => lastTurn.value,
      getMessageCount: () => messages.value.length
    })
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unregisterStageControl?.()
  unregisterStageControl = null
  unregisterStageActions?.()
  unregisterStageActions = null
})

async function copySessionCwd(): Promise<void> {
  const cwd = effectiveWorkspaceRoot.value
  if (!cwd) return
  try {
    await navigator.clipboard.writeText(cwd)
    toast.success(t('home.copied'))
  } catch {
    // ignore clipboard errors
  }
}

const compactSessionCwd = computed(() => {
  const cwd = effectiveWorkspaceRoot.value
  if (!cwd) return ''
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= 2) return cwd
  return `…/${parts.slice(-2).join('/')}`
})

function navigateHome(): void {
  void router.push(APP_SURFACE_ROUTES.home)
}

async function runFileAiAction(payload: WorkspaceFileAiActionPayload): Promise<boolean> {
  const prompt = payload.prompt.trim()
  if (!prompt) return false

  if (payload.mode === 'quote') {
    if (viewMode.value !== 'chat') {
      setViewMode('chat')
    }
    const existing = draft.value.replace(/\s+$/, '')
    draft.value = existing ? `${existing}\n\n${payload.prompt}` : payload.prompt
    await nextTick()
    const input = inputRef.value
    if (input) {
      input.focus()
      input.selectionStart = input.value.length
      input.selectionEnd = input.value.length
      autoGrow()
    }
    return true
  }

  if (!isLive.value || !address.value) {
    toast.error(t('herdr.stage.composerFinishedPlaceholder'))
    return false
  }
  try {
    await sendPlainText(prompt)
    toast.success(t('home.sidePanel.sentToAi'))
    return true
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
    return false
  }
}

function handleFileAiAction(payload: WorkspaceFileAiActionPayload): void {
  const result = runFileAiAction(payload)
  if (payload.settle) {
    payload.settle(result)
  } else {
    void result
  }
}
</script>

<template>
  <div
    ref="pageRef"
    class="HomePage HerdrStage"
    :class="{
      conversing: viewMode === 'chat',
      'is-terminal': viewMode === 'terminal',
      'is-resizing-panel': isResizing
    }"
    :style="{
      '--home-composer-height': composerClearance,
      '--home-panel-width': `${panelWidth}px`,
      '--home-panel-min-width': `${SIDE_PANEL_MIN_WIDTH}px`
    }"
    data-testid="herdr-conversation-stage"
  >
    <div class="HomePage-Split">
      <div ref="bodyRef" class="HomePage-Body">
        <!-- Session missing / ended and removed -->
        <div
          v-if="!session && !herdr.loading.value"
          class="HerdrStage-NotFound"
          data-testid="herdr-stage-not-found"
        >
          <span class="i-ri-terminal-box-line HerdrStage-NotFoundIcon" aria-hidden="true" />
          <h2 class="HerdrStage-NotFoundTitle">{{ t('herdr.stage.sessionNotFoundTitle') }}</h2>
          <p class="HerdrStage-NotFoundDesc">
            {{ t('herdr.stage.sessionNotFoundDesc', { address }) }}
          </p>
          <TxButton variant="primary" size="sm" @click="navigateHome">
            {{ t('herdr.stage.backToHome') }}
          </TxButton>
        </div>

        <!-- Mode 2: Full-bleed in-place TxTerminal -->
        <div
          v-else-if="viewMode === 'terminal'"
          class="HerdrStage-TerminalWrap"
          data-testid="herdr-stage-terminal-pane"
          @focusin="handleStageTerminalFocus(true)"
          @focusout="handleStageTerminalFocus(false)"
        >
          <TxTerminal
            :key="address"
            class="HerdrStage-Terminal"
            :font-family="terminalFontFamily"
            :read-only="false"
            :auto-focus="true"
            :auto-scroll="true"
            :screen-reader-mode="screenReaderMode"
            @ready="handleStageTerminalReady"
            @data="handleStageTerminalData"
            @resize="handleStageTerminalResize"
          />
        </div>

        <!-- Mode 1: Unified Home AI Conversation UI -->
        <template v-else>
          <HomeStageBlurs :visible="messages.length > 0" />

          <div class="HomePage-Center">
            <div
              v-if="messages.length === 0"
              class="HerdrStage-EmptyChat"
              data-testid="herdr-stage-empty-chat"
            >
              <template v-if="projectionLoading">
                <span class="i-ri-loader-4-line is-spin HerdrStage-EmptyIcon" aria-hidden="true" />
                <p class="HerdrStage-EmptyText">{{ t('herdr.conversation.loading') }}</p>
              </template>
              <template v-else-if="projectionError">
                <span class="i-ri-error-warning-line HerdrStage-EmptyIcon" aria-hidden="true" />
                <p class="HerdrStage-EmptyText">{{ projectionError }}</p>
                <div class="HerdrStage-EmptyActions">
                  <TxButton size="sm" variant="secondary" @click="handleRefreshProjection">
                    {{ t('herdr.conversation.refresh') }}
                  </TxButton>
                  <TxButton size="sm" variant="primary" @click="setViewMode('terminal')">
                    {{ t('herdr.stage.modeTerminal') }}
                  </TxButton>
                </div>
              </template>
              <template v-else-if="projection && !projection.available">
                <span class="i-ri-terminal-box-line HerdrStage-EmptyIcon" aria-hidden="true" />
                <p class="HerdrStage-EmptyText">
                  {{
                    session?.machine
                      ? t('herdr.conversation.remoteUnavailable', { machine: session.machine })
                      : t('herdr.conversation.unavailable')
                  }}
                </p>
                <TxButton size="sm" variant="primary" @click="setViewMode('terminal')">
                  {{ t('herdr.stage.modeTerminal') }}
                </TxButton>
              </template>
              <template v-else>
                <span class="i-ri-chat-3-line HerdrStage-EmptyIcon" aria-hidden="true" />
                <p class="HerdrStage-EmptyText">
                  {{ t('herdr.stage.waitingFirstMessage', { target: stageTitle }) }}
                </p>
              </template>
            </div>

            <HomeConversationStream
              v-else
              ref="streamEl"
              v-model:following="streamFollowing"
              :visible="true"
              :conversation-id="conversationId"
              :stream-items="streamItems"
              :messages="messages"
              :is-streaming="isStreaming"
              :is-compacting="false"
              :panel-open="panelOpen"
              :entering-messages="emptyEnteringSet"
              :branching="false"
              :show-turn-metrics="showTurnMetrics"
              :dictation-clip="dictation.clip.value"
              :dictating="dictation.active.value"
              :voice-send-blocked="voiceSendBlocked"
              :is-turn-footer-resting="isTurnFooterResting"
              :can-branch-from="() => false"
              :speak-state-of="speakStateOf"
              @voice-retry="dictation.recognizeClip()"
              @voice-send="sendVoiceDraft"
              @voice-dismiss="dictation.dismissClip()"
              @speak="toggleSpeak"
              @code-preview="showCodePreview"
              @code-run="runCodeInTerminal"
            />

            <HomePayloadModal />

            <div ref="composerGroupRef" class="HomePage-ComposerGroup">
              <div
                v-if="isBlocked"
                class="HerdrStage-BlockedCard"
                role="alert"
                data-testid="herdr-stage-blocked-banner"
              >
                <span class="i-ri-alert-line HerdrStage-BlockedIcon" aria-hidden="true" />
                <div class="HerdrStage-BlockedBody">
                  <div class="HerdrStage-BlockedTitle">{{ statusLabel }}</div>
                  <p class="HerdrStage-BlockedText">
                    {{ session?.status?.msg || blockedDescription }}
                  </p>
                </div>
                <TxButton
                  size="sm"
                  variant="primary"
                  data-testid="herdr-stage-blocked-takeover"
                  @click="setViewMode('terminal')"
                >
                  {{ t('herdr.stage.terminalTakeover') }}
                </TxButton>
              </div>

              <div class="HomePage-ComposerDeck">
                <TuffAIComposer
                  ref="composerEl"
                  v-model:draft="draft"
                  :placeholder="composerPlaceholder"
                  :attachments="pendingAttachments"
                  :attach-open-label="attachOpenLabel"
                  :attach-preview-props="attachPreviewProps"
                  :input-disabled="!isLive"
                  :dragover="isDragover"
                  :live="isStreaming"
                  :beam-active="false"
                  :dictation="dictation"
                  :model="composerModel"
                  :send-state="sendState"
                  :hide-permission-menu="true"
                  :readonly-model="true"
                  @input="autoGrow"
                  @input-keydown="handleInputKeydown"
                  @box-keydown="handleComposerKeydown"
                  @paste="onPaste"
                  @dragenter="onDragEnter"
                  @dragover="onDragOver"
                  @dragleave="onDragLeave"
                  @drop="onDrop"
                  @remove="removeAttachment"
                  @files="addFiles"
                  @send="pressSend"
                  @stop="handleInterrupt"
                  @mic="dictation.toggle()"
                />
              </div>

              <HomeRunDock
                v-if="isStreaming || attachmentsUploading"
                :streaming="isStreaming"
                :started-at="runStartedAt"
                :step="runStep"
                :verb="thinkingTicker.activeLabel.value"
                :context-share="null"
                context-window-text=""
              />
            </div>
          </div>
        </template>
      </div>

      <HomeSidePanelSlot
        :open="panelOpen"
        :resizing="isResizing"
        :width="panelWidth"
        :dock-to-shell="true"
        :active="isStageActive"
        :messages="messages"
        :conversation-id="conversationId"
        :workspace-root="effectiveWorkspaceRoot"
        :git-available="gitAvailable"
        :turn="lastTurn"
        :activity-turns="activityTurns"
        :gateway="[]"
        :loading="projectionLoading"
        :tabs="sidePanelTabs"
        :active-tab-id="activeSidePanelTabId"
        @locate="streamRef?.scrollToIndex($event)"
        @select-tab="selectSidePanelTab"
        @close-tab="closeSidePanelTab"
        @close-other-tabs="closeOtherSidePanelTabs"
        @close-all-tabs="closeAllSidePanelTabs"
        @close-panel="panelOpen = false"
        @open-launcher="openLauncher"
        @open-tool="openWorkspaceTool"
        @open-file-picker="pickAndOpenFileInSidebar"
        @open-file="
          openFileInSidebar({
            absolutePath: $event.path,
            displayPath: $event.displayPath,
            line: $event.line
          })
        "
        @open-web="openWebInSidebar"
        @open-blank-browser="openBlankWebTab(t('home.sidePanel.browser'))"
        @update-web-tab="updateWebTab"
        @update-file-tab="updateFileTab"
        @open-web-in-browser="openWebInBuiltInBrowser"
        @open-file-in-browser="
          openFileInBuiltInBrowser({
            absolutePath: $event.path,
            displayPath: $event.displayPath,
            line: $event.line
          })
        "
        @open-web-external="openWebExternal"
        @start-resize="startSidePanelResize"
        @reset-width="resetSidePanelWidth"
        @ai-action="handleFileAiAction"
      />
    </div>

    <footer
      v-if="session"
      class="HerdrStage-StatusBar"
      role="contentinfo"
      data-testid="herdr-stage-statusbar"
    >
      <div class="HerdrStage-StatusBarGroup">
        <TxStatusHint
          class="HerdrStage-StatusHintChip"
          :text="statusLabel"
          :tone="statusHintTone"
          size="sm"
          :pulse-key="statusPulseKey"
          data-testid="herdr-stage-status"
        >
          <template #icon>
            <span class="HerdrStage-StatusIcon" :class="statusIconClass" aria-hidden="true" />
          </template>
        </TxStatusHint>

        <span class="HerdrStage-StatusTitle" :title="stageTitle" data-testid="herdr-stage-title">
          <span
            :class="viewMode === 'terminal' ? 'i-ri-terminal-line' : 'i-ri-chat-3-line'"
            class="HerdrStage-StatusTitleIcon"
            aria-hidden="true"
          />
          <span class="HerdrStage-StatusTitleText">{{ stageTitle }}</span>
        </span>

        <span
          v-if="session.machine"
          class="HerdrStage-MachinePill"
          data-testid="herdr-stage-machine"
        >
          <span class="i-ri-server-line" aria-hidden="true" />
          <span>{{ session.machine }}</span>
        </span>

        <button
          v-if="compactSessionCwd"
          type="button"
          class="HerdrStage-StatusPath"
          :title="`${t('home.fileLink.clickToCopyPath')}: ${effectiveWorkspaceRoot}`"
          data-testid="herdr-stage-cwd"
          @click="copySessionCwd"
        >
          <span class="i-ri-folder-2-line" aria-hidden="true" />
          <span class="HerdrStage-StatusPathText">{{ compactSessionCwd }}</span>
        </button>
      </div>

      <div class="HerdrStage-StatusBarGroup is-end">
        <span
          v-if="viewMode === 'terminal' && autoFallbackToTerminal && userSelectedMode === null"
          class="HerdrStage-StatusHint"
          :title="t('herdr.stage.autoTerminalHint')"
          data-testid="herdr-stage-auto-hint"
        >
          <span class="i-ri-information-line" aria-hidden="true" />
          <span>{{ t('herdr.stage.autoTerminalShort') }}</span>
        </span>

        <span class="HerdrStage-StatusMeta">
          {{ providerLabel }}
          <template v-if="session.turn > 0">
            · {{ t('herdr.conversation.turnCount', { turn: session.turn }) }}
          </template>
        </span>
      </div>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.HomePage.HerdrStage {
  position: relative;
  --home-panel-width: 460px;
  --home-panel-min-width: 320px;
  --home-body-min-width: 480px;
  --home-chat-lane-width: min(720px, calc(100% - clamp(40px, 8%, 64px)));
  --home-z-leaving: 0;
  --home-z-flight: 1;
  --home-z-topblur: 4;
  --home-z-bottomblur: 4;
  --home-z-topbar: 6;
  --home-z-composer: 8;
  --home-live-stops: #0894ff, #c959dd 27%, #ff2e54 52%, #ff9004 74%, #0894ff;

  --tx-color-primary: var(--shell-primary);
  --tx-color-danger: var(--shell-danger);
  --tx-color-success: var(--shell-success);
  --tx-color-warning: var(--shell-warning);
  --tx-text-color-primary: var(--shell-text-primary);
  --tx-text-color-secondary: var(--shell-text-muted);
  --tx-text-color-placeholder: var(--shell-text-muted);
  --tx-border-color: var(--shell-border-strong);
  --tx-border-color-light: var(--shell-border);
  --tx-border-color-lighter: var(--shell-border);
  --tx-fill-color: var(--shell-surface);
  --tx-fill-color-light: var(--shell-surface);
  --tx-fill-color-lighter: var(--shell-surface);
  --tx-fill-color-darker: var(--shell-surface-2);
  --tx-fill-color-blank: var(--shell-bg);
  --tx-bg-color: var(--shell-bg);

  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  container-type: inline-size;
  overflow: hidden;

  &.is-resizing-panel {
    user-select: none;
    cursor: col-resize;
  }
}

.HomePage-Split {
  display: contents;
}

.HomePage-Body {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.HomePage-Center {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  justify-content: flex-start;
  height: 100%;
  min-height: 0;
  position: relative;
}

.HomePage-ComposerGroup {
  position: absolute;
  right: 0;
  bottom: 12px;
  left: 0;
  z-index: var(--home-z-composer);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
  pointer-events: none;
}

.HomePage-ComposerDeck {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-width: 0;
  pointer-events: none;
}

.HerdrStage-StatusBar {
  grid-column: 1;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 22px;
  padding: 0 8px 0 0;
  border-top: 1px solid var(--shell-border);
  background: var(--shell-surface);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  box-sizing: border-box;
  min-width: 0;
  z-index: var(--home-z-topbar);
}

.HerdrStage-StatusBarGroup {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 100%;
  min-width: 0;

  &.is-end {
    flex: none;
  }
}

.HerdrStage-StatusHintChip {
  --tx-status-hint-radius: 0;
  --tx-status-hint-pad-x: 8px;
  --tx-status-hint-pad-y: 0px;
  --tx-status-hint-icon-size: 12px;

  flex: none;
  height: 100%;
  font-size: var(--shell-fs-caption);
  line-height: 1;
}

.HerdrStage-StatusTitle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 220px;
  color: var(--shell-text-primary);
  font-weight: 500;
}

.HerdrStage-StatusTitleIcon {
  display: inline-flex;
  flex: none;
  font-size: 12px;
  color: var(--shell-text-muted);
}

.HerdrStage-StatusTitleText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HerdrStage-StatusPath {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 220px;
  padding: 0 5px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--shell-text-muted);
  font: inherit;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.HerdrStage-StatusPathText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HerdrStage-StatusHint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--shell-text-muted);
  white-space: nowrap;
}

.HerdrStage-StatusMeta {
  color: var(--shell-text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.HerdrStage-MachinePill {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 3px;
  height: 16px;
  padding: 0 6px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  white-space: nowrap;
}

.HerdrStage-StatusIcon {
  display: inline-flex;
  font-size: 11px;

  &.is-idle-dot {
    font-size: 6px;
    opacity: 0.7;
  }
}

.HerdrStage-BlockedCard {
  display: flex;
  align-items: center;
  gap: 12px;
  width: var(--home-chat-lane-width);
  padding: 10px 14px;
  border-radius: var(--shell-radius-xl);
  border: 1px solid var(--shell-warning-border);
  background: color-mix(in srgb, var(--shell-warning-soft) 90%, var(--shell-bg));
  backdrop-filter: blur(16px);
  box-shadow: 0 6px 20px var(--shell-shadow);
  box-sizing: border-box;
  pointer-events: auto;
}

.HerdrStage-BlockedIcon {
  flex: none;
  font-size: 18px;
  color: var(--shell-warning);
}

.HerdrStage-BlockedBody {
  flex: 1 1 auto;
  min-width: 0;
}

.HerdrStage-BlockedTitle {
  font-size: var(--shell-fs-sm);
  font-weight: 600;
  color: var(--shell-text-primary);
}

.HerdrStage-BlockedText {
  margin: 2px 0 0;
  font-size: var(--shell-fs-caption);
  color: var(--shell-text-secondary);
  line-height: 1.45;
}

.HerdrStage-EmptyChat,
.HerdrStage-NotFound {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  width: var(--home-chat-lane-width);
  margin: 0 auto;
  padding: 80px 20px 180px;
  text-align: center;
  box-sizing: border-box;
}

.HerdrStage-EmptyIcon,
.HerdrStage-NotFoundIcon {
  font-size: 28px;
  color: var(--shell-text-muted);
}

.HerdrStage-NotFoundTitle {
  margin: 0;
  font-size: var(--shell-fs-md);
  font-weight: 600;
  color: var(--shell-text-primary);
}

.HerdrStage-EmptyText,
.HerdrStage-NotFoundDesc {
  margin: 0;
  max-width: 420px;
  font-size: var(--shell-fs-body);
  color: var(--shell-text-secondary);
  line-height: 1.55;
}

.HerdrStage-EmptyActions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.HerdrStage-TerminalWrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--tx-bg-color);
}

.HerdrStage-Terminal {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  border-radius: 0;
  box-shadow: none;

  :deep(.xterm) {
    border-radius: 0;
  }
}

.is-spin {
  animation: herdr-stage-spin 0.9s linear infinite;
}

@keyframes herdr-stage-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spin {
    animation: none;
  }
}

:deep(.is-file-path),
:deep(.is-web-link) {
  color: var(--shell-primary);
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: pointer;

  &:hover {
    text-decoration-style: solid;
    background: color-mix(in srgb, var(--shell-primary) 10%, transparent);
  }
}
</style>

<script lang="ts" name="ShellHerdrSpace" setup>
import type { HerdrOscState } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectGroup } from '~/modules/herdr/herdr-project-groups'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import {
  TxDropdownItem,
  TxDropdownMenu,
  TxDropdownSubmenu
} from '@talex-touch/tuffex/dropdown-menu'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { computed, nextTick, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { herdrConversationRoute } from '../../../../shared/app-surface-routes'
import {
  buildHerdrProjectTabTitles,
  buildNewTerminalRequestForGroup,
  groupHerdrSessions,
  pickPrimaryHerdrProjectSession
} from '~/modules/herdr/herdr-project-groups'
import {
  isBareVersionToken,
  resolveHerdrSessionApp,
  useHerdrRuntime
} from '~/modules/herdr/useHerdrRuntime'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import {
  ensureHerdrTab,
  getLastHerdrAddressForGroup,
  HERDR_SPACE_KEY,
  herdrProjectSpaceKey,
  setLastHerdrAddressForGroup,
  setLastWorkspaceScope,
  syncHerdrProjectTabs
} from '~/modules/layout/useShellWorkspaceTabs'
import {
  onFolderAfterEnter,
  onFolderAfterLeave,
  onFolderBeforeEnter,
  onFolderBeforeLeave,
  onFolderEnter,
  onFolderLeave
} from './shell-folder-transition'
import { SHELL_MENU_CARD } from './shell-menu-panel'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { collapsed } = useShellSidebar()
const herdr = useHerdrRuntime()

const listId = 'shell-herdr-space-list'
const expanded = ref(true)
const infoOpen = ref(false)
const openMenuProjectKey = ref<string | null>(null)
const hoverPopoverOpen = reactive<Record<string, boolean>>({})
const quickSendSession = ref<HerdrProjectedSession | null>(null)
const quickSendDraft = ref('')
const quickSendSubmitting = ref(false)
const quickSendInputWrapRef = ref<HTMLElement | null>(null)
const infoGroup = ref<HerdrProjectGroup | null>(null)
const pendingKillSession = ref<HerdrProjectedSession | null>(null)
const interruptingByAddress = reactive<Record<string, boolean>>({})
const creatingSession = ref(false)

/**
 * Icon classes declared statically in this SFC so UnoCSS scans and emits every glyph.
 */
const APP_ICON_MAP: Record<string, string> = {
  claude: 'i-simple-icons-claude',
  codex: 'i-simple-icons-openai',
  pi: 'i-simple-icons-pi',
  omp: 'i-simple-icons-pi',
  'oh-my-pi': 'i-simple-icons-pi',
  gemini: 'i-simple-icons-googlegemini',
  opencode: 'i-simple-icons-opencode',
  cursor: 'i-simple-icons-cursor',
  ssh: 'i-ri-server-line'
}

const RAIL_PREVIEW_LIMIT = 5

const liveSessions = herdr.liveSessions
const liveCount = herdr.liveCount
const hasBlockedSession = herdr.hasBlockedSession
const connectedMachines = computed(() => herdr.connectedMachines?.value ?? [])
const herdrSessionName = computed(() => herdr.snapshot?.value?.session?.trim() || '')
const showRailBadge = computed(
  () => collapsed.value && (liveCount.value > 0 || herdr.loading.value)
)

const projectGroups = computed<HerdrProjectGroup[]>(
  () => herdr.projectGroups?.value ?? groupHerdrSessions(liveSessions.value)
)

const projectGroupByAddress = computed(() => {
  if (herdr.projectGroupByAddress?.value) return herdr.projectGroupByAddress.value
  const map = new Map<string, HerdrProjectGroup>()
  for (const group of projectGroups.value) {
    for (const session of group.sessions) map.set(session.address, group)
  }
  return map
})

const railPreviewGroups = computed(() => projectGroups.value.slice(0, RAIL_PREVIEW_LIMIT))
const railOverflowCount = computed(() =>
  Math.max(0, projectGroups.value.length - RAIL_PREVIEW_LIMIT)
)

const connectionState = computed(() => {
  if (herdr.isConnected.value) return 'connected'
  if (herdr.isFallback.value) return 'fallback'
  if (herdr.loading.value) return 'connecting'
  return 'disconnected'
})

const connectionLabel = computed(() => t(`herdr.space.connection.${connectionState.value}`))

const activeRouteAddress = computed<string | null>(() => {
  if (!route.path.startsWith('/home/herdr/')) return null
  const params = route.params as Record<string, unknown> | undefined
  const paramAddress = typeof params?.address === 'string' ? params.address : ''
  const raw = paramAddress || route.path.slice('/home/herdr/'.length)
  if (!raw) return null
  try {
    return decodeURIComponent(raw).trim() || null
  } catch {
    return raw.trim() || null
  }
})

const activeProjectKey = computed<string | null>(() => {
  if (!activeRouteAddress.value) return null
  return projectGroupByAddress.value.get(activeRouteAddress.value)?.key ?? null
})

function projectDisplayName(group: HerdrProjectGroup): string {
  return group.isUngrouped ? t('herdr.space.ungrouped') : group.name
}

function projectRowIcon(group: HerdrProjectGroup): string {
  if (group.machine !== null) return 'i-ri-server-line'
  if (group.isUngrouped) return 'i-ri-terminal-box-line'
  return 'i-ri-folder-2-line'
}

function resolveSessionAppLabel(session: HerdrProjectedSession): string {
  return session.appName || resolveHerdrSessionApp(session)
}

function resolveSessionAppDetail(session: HerdrProjectedSession): string {
  const app = resolveSessionAppLabel(session)
  const fg = session.foregroundName?.trim()
  if (fg && !isBareVersionToken(fg) && fg.toLowerCase() !== app.toLowerCase()) {
    return `${app} (${fg})`
  }
  return app
}

function resolveSessionIcon(session: HerdrProjectedSession): string {
  const candidates = [session.appName, session.status?.app, session.foregroundName, session.argv[0]]
  for (const raw of candidates) {
    if (!raw) continue
    const token = raw.trim().toLowerCase().split('/').pop() ?? ''
    if (Object.hasOwn(APP_ICON_MAP, token)) {
      return APP_ICON_MAP[token]!
    }
    for (const [key, icon] of Object.entries(APP_ICON_MAP)) {
      if (token.includes(key)) return icon
    }
  }
  if (session.machine !== null) return 'i-ri-server-line'
  return 'i-ri-terminal-box-line'
}

function resolveOscState(session: HerdrProjectedSession): HerdrOscState {
  return session.status?.state ?? 'idle'
}

function statusPillClass(session: HerdrProjectedSession): string {
  return `is-${resolveOscState(session)}`
}

function statusIconClass(session: HerdrProjectedSession): string {
  switch (resolveOscState(session)) {
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
}

function formatStatusLabel(session: HerdrProjectedSession): string {
  const state = resolveOscState(session)
  const baseLabel = t(`herdr.status.${state}`)
  if (state === 'blocked' && session.status?.kind) {
    const kindLabel = t(`herdr.blockedKind.${session.status.kind}`)
    return `${baseLabel} · ${kindLabel}`
  }
  return baseLabel
}

function projectSessionTitles(group: HerdrProjectGroup): Map<string, string> {
  return buildHerdrProjectTabTitles(group)
}

function resolveTargetSession(group: HerdrProjectGroup): HerdrProjectedSession | null {
  if (activeRouteAddress.value) {
    const activeInGroup = group.sessions.find((s) => s.address === activeRouteAddress.value)
    if (activeInGroup) return activeInGroup
  }
  const remembered = getLastHerdrAddressForGroup(group.key)
  if (remembered) {
    const matched = group.sessions.find((s) => s.address === remembered)
    if (matched) return matched
  }
  return pickPrimaryHerdrProjectSession(group)
}

function isProjectActive(group: HerdrProjectGroup): boolean {
  return activeProjectKey.value === group.key
}

function showProjectAttentionDot(group: HerdrProjectGroup): boolean {
  return group.hasBlocked || group.hasError
}

function projectAttentionClass(group: HerdrProjectGroup): string {
  return group.hasBlocked ? 'is-blocked' : 'is-error'
}

function setProjectMenu(groupKey: string, open: boolean): void {
  openMenuProjectKey.value = open ? groupKey : null
  if (open) {
    hoverPopoverOpen[groupKey] = false
  }
}

function openSessionInGroup(group: HerdrProjectGroup, session: HerdrProjectedSession): void {
  hoverPopoverOpen[group.key] = false
  openMenuProjectKey.value = null
  const spaceKey = herdrProjectSpaceKey(group.key)
  setLastWorkspaceScope(spaceKey)
  setLastHerdrAddressForGroup(group.key, session.address)
  syncHerdrProjectTabs(
    spaceKey,
    group.sessions.map((item) => item.address),
    { activeAddress: session.address }
  )
  void router.push(herdrConversationRoute(session.address))
}

function openProjectGroup(group: HerdrProjectGroup): void {
  const target = resolveTargetSession(group)
  if (!target) return
  hoverPopoverOpen[group.key] = false
  openMenuProjectKey.value = null
  const spaceKey = herdrProjectSpaceKey(group.key)
  setLastWorkspaceScope(spaceKey)
  setLastHerdrAddressForGroup(group.key, target.address)
  syncHerdrProjectTabs(
    spaceKey,
    group.sessions.map((item) => item.address),
    { activeAddress: target.address, restoreDismissed: true }
  )
  void router.push(herdrConversationRoute(target.address))
}

function openInDrawer(group: HerdrProjectGroup): void {
  const target = resolveTargetSession(group)
  if (!target) return
  hoverPopoverOpen[group.key] = false
  openMenuProjectKey.value = null
  herdr.openTerminalTab(target.address, { openDrawer: true })
}

function openPrimaryFromRail(): void {
  const firstGroup = projectGroups.value[0]
  if (firstGroup) {
    openProjectGroup(firstGroup)
  }
}

async function handleStartNewSession(group?: HerdrProjectGroup): Promise<void> {
  if (creatingSession.value) return
  openMenuProjectKey.value = null
  creatingSession.value = true
  try {
    const request = group ? buildNewTerminalRequestForGroup(group) : {}
    const session = await herdr.startSession(request)
    const spaceKey = group ? herdrProjectSpaceKey(group.key) : HERDR_SPACE_KEY
    setLastWorkspaceScope(spaceKey)
    if (group) {
      setLastHerdrAddressForGroup(group.key, session.address)
    }
    ensureHerdrTab(session.address, spaceKey)
    await router.push(herdrConversationRoute(session.address))
  } catch {
    toast.error(t('terminal.failed'))
  } finally {
    creatingSession.value = false
  }
}

function openQuickSendModal(group: HerdrProjectGroup): void {
  const target = resolveTargetSession(group)
  if (!target) return
  openMenuProjectKey.value = null
  hoverPopoverOpen[group.key] = false
  quickSendSession.value = target
  quickSendDraft.value = ''
  void nextTick(() => {
    requestAnimationFrame(() => {
      const input = quickSendInputWrapRef.value?.querySelector<HTMLInputElement>('input')
      input?.focus()
    })
  })
}

function closeQuickSendModal(): void {
  quickSendSession.value = null
  quickSendDraft.value = ''
}

async function submitQuickSend(): Promise<void> {
  const target = quickSendSession.value
  if (!target || quickSendSubmitting.value) return
  const text = quickSendDraft.value.trim()
  if (!text) return
  quickSendSubmitting.value = true
  try {
    await herdr.send(target.address, text)
    closeQuickSendModal()
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
  } finally {
    quickSendSubmitting.value = false
  }
}

async function handleInterruptGroup(group: HerdrProjectGroup): Promise<void> {
  openMenuProjectKey.value = null
  const target =
    group.sessions.find((s) => resolveOscState(s) === 'working') ?? resolveTargetSession(group)
  if (!target) return
  const addr = target.address
  if (interruptingByAddress[addr]) return
  interruptingByAddress[addr] = true
  try {
    await herdr.interrupt(addr)
  } catch {
    toast.error(t('herdr.actions.interruptFailed'))
  } finally {
    delete interruptingByAddress[addr]
  }
}

function openInfoModal(group: HerdrProjectGroup): void {
  openMenuProjectKey.value = null
  hoverPopoverOpen[group.key] = false
  infoGroup.value = group
}

function requestKillGroupTarget(group: HerdrProjectGroup): void {
  const target = resolveTargetSession(group)
  if (!target) return
  openMenuProjectKey.value = null
  hoverPopoverOpen[group.key] = false
  pendingKillSession.value = target
}

function onConfirmKill(): boolean {
  const target = pendingKillSession.value
  pendingKillSession.value = null
  if (!target) return true
  void herdr.kill(target.address).catch(() => {
    toast.error(t('herdr.stage.killConfirmFailed'))
  })
  return true
}

const infoRows = computed(() => {
  const group = infoGroup.value
  if (!group) return []
  const rows: Array<{ key: string; label: string; value: string; mono?: boolean }> = [
    {
      key: 'project',
      label: t('herdr.hover.project'),
      value: projectDisplayName(group)
    },
    {
      key: 'count',
      label: t('herdr.space.metaLive'),
      value: t('herdr.space.terminalCount', { count: group.sessions.length })
    }
  ]
  if (group.machine !== null) {
    rows.push({
      key: 'machine',
      label: t('herdr.hover.machine'),
      value: group.machine
    })
  }
  if (group.cwd) {
    rows.push({
      key: 'cwd',
      label: t('herdr.hover.cwd'),
      value: group.cwd,
      mono: true
    })
  }
  if (group.herdrSpaceId) {
    rows.push({
      key: 'space',
      label: t('herdr.hover.where'),
      value: group.herdrSpaceId,
      mono: true
    })
  }
  return rows
})
</script>

<template>
  <div v-if="collapsed" class="ShellHerdrSpace-Rail">
    <TxPopover
      v-if="showRailBadge"
      trigger="hover"
      placement="right"
      :offset="10"
      :open-delay="100"
      :close-delay="120"
      :match-reference-width="false"
      :max-width="280"
      :panel-radius="12"
      :panel-padding="10"
      :panel-card="SHELL_MENU_CARD"
    >
      <template #reference>
        <button
          type="button"
          class="ShellHerdrSpace-RailBtn"
          data-testid="herdr-rail-badge"
          :aria-label="
            hasBlockedSession
              ? t('herdr.sidebar.railBlockedTooltip', { count: liveCount })
              : t('herdr.sidebar.railTooltip', { count: liveCount })
          "
          @click="openPrimaryFromRail"
        >
          <span class="i-ri-terminal-box-line ShellHerdrSpace-RailIcon" aria-hidden="true" />
          <span v-if="liveCount > 0" class="ShellHerdrSpace-RailCount">{{ liveCount }}</span>
          <span
            v-if="hasBlockedSession"
            class="ShellHerdrSpace-AmberDot ShellHerdrSpace-RailDot"
            data-testid="herdr-rail-blocked-dot"
            aria-hidden="true"
          />
        </button>
      </template>

      <div class="ShellHerdrSpace-RailPopover" data-testid="herdr-rail-popover">
        <div class="ShellHerdrSpace-InfoHead">
          <span class="ShellHerdrSpace-InfoTitle">{{ t('herdr.space.name') }}</span>
          <span class="ShellHerdrSpace-InfoConn" :class="`is-${connectionState}`">
            {{ connectionLabel }}
          </span>
        </div>
        <p class="ShellHerdrSpace-InfoDesc">{{ t('herdr.space.description') }}</p>
        <div v-if="railPreviewGroups.length > 0" class="ShellHerdrSpace-RailPreviewList">
          <button
            v-for="group in railPreviewGroups"
            :key="group.key"
            type="button"
            class="ShellHerdrSpace-RailPreviewItem"
            @click="openProjectGroup(group)"
          >
            <span
              class="ShellHerdrSpace-ItemIcon"
              :class="projectRowIcon(group)"
              aria-hidden="true"
            />
            <span class="ShellHerdrSpace-RailPreviewTitle">{{ projectDisplayName(group) }}</span>
            <span class="ShellHerdrSpace-RowCount">{{ group.sessions.length }}</span>
          </button>
          <span v-if="railOverflowCount > 0" class="ShellHerdrSpace-RailMore">
            {{ t('herdr.space.railMore', { count: railOverflowCount }) }}
          </span>
        </div>
      </div>
    </TxPopover>
  </div>

  <div
    v-else
    class="ShellHerdrSpace"
    :class="{
      'is-expanded': expanded,
      'is-info-open': infoOpen,
      'has-blocked': hasBlockedSession
    }"
    data-testid="herdr-sidebar-section"
  >
    <div class="ShellHerdrSpace-Row">
      <button
        type="button"
        class="ShellHerdrSpace-Toggle"
        data-testid="herdr-section-toggle"
        :aria-expanded="expanded"
        :aria-controls="listId"
        :aria-label="
          expanded
            ? t('shell.projects.collapse', { name: t('herdr.space.name') })
            : t('shell.projects.expand', { name: t('herdr.space.name') })
        "
        @click="expanded = !expanded"
      >
        <span class="ShellHerdrSpace-Glyph" aria-hidden="true">
          <span class="ShellHerdrSpace-Folder i-ri-terminal-box-line" />
          <span
            class="ShellHerdrSpace-Chevron i-ri-arrow-right-s-line"
            :class="{ 'is-expanded': expanded }"
          />
        </span>
      </button>

      <TxTooltip
        :content="t('herdr.space.rowTooltip')"
        :reference-full-width="true"
        :anchor="{ placement: 'right', referenceClass: 'ShellHerdrSpace-NameAnchor' }"
      >
        <button
          type="button"
          class="ShellHerdrSpace-Name"
          data-testid="herdr-space-name"
          :aria-expanded="expanded"
          :aria-controls="listId"
          @click="expanded = !expanded"
        >
          <span class="ShellHerdrSpace-NameText">{{ t('herdr.space.name') }}</span>
          <span
            v-if="liveCount > 0"
            class="ShellHerdrSpace-LiveCount"
            data-testid="herdr-live-count"
          >
            {{ liveCount }}
          </span>
        </button>
      </TxTooltip>

      <TxTooltip
        v-if="hasBlockedSession"
        :content="t('herdr.status.blocked')"
        :anchor="{ placement: 'top' }"
      >
        <span
          class="ShellHerdrSpace-AmberDot"
          data-testid="herdr-blocked-dot"
          role="status"
          aria-live="polite"
          :aria-label="t('herdr.status.blocked')"
        />
      </TxTooltip>

      <div class="ShellHerdrSpace-Actions">
        <TxTooltip
          v-if="herdr.isConnected.value"
          :content="t('herdr.sidebar.newSession')"
          :anchor="{ placement: 'top' }"
        >
          <button
            type="button"
            class="ShellHerdrSpace-Add"
            data-testid="herdr-new-session-btn"
            :disabled="creatingSession"
            :aria-label="t('herdr.sidebar.newSession')"
            @click="handleStartNewSession()"
          >
            <span class="ShellHerdrSpace-ActionIcon i-ri-add-line" aria-hidden="true" />
          </button>
        </TxTooltip>

        <TxPopover
          v-model="infoOpen"
          trigger="hover"
          placement="right"
          :offset="10"
          :open-delay="100"
          :close-delay="140"
          :match-reference-width="false"
          :max-width="268"
          :panel-radius="12"
          :panel-padding="10"
          :panel-card="SHELL_MENU_CARD"
        >
          <template #reference>
            <button
              class="ShellHerdrSpace-Info"
              :class="{ 'is-quiet': herdr.isConnected.value }"
              type="button"
              data-testid="herdr-space-info"
              :aria-label="t('herdr.space.infoLabel')"
            >
              <span class="ShellHerdrSpace-InfoIcon i-ri-information-line" aria-hidden="true" />
            </button>
          </template>

          <div class="ShellHerdrSpace-InfoCard" data-testid="herdr-space-info-card">
            <div class="ShellHerdrSpace-InfoHead">
              <span class="ShellHerdrSpace-InfoTitle">{{ t('herdr.space.name') }}</span>
              <span class="ShellHerdrSpace-InfoConn" :class="`is-${connectionState}`">
                {{ connectionLabel }}
              </span>
            </div>
            <p class="ShellHerdrSpace-InfoDesc">{{ t('herdr.space.description') }}</p>
            <dl class="ShellHerdrSpace-InfoMeta">
              <div class="ShellHerdrSpace-InfoRow">
                <dt>{{ t('herdr.space.metaLive') }}</dt>
                <dd>{{ liveCount }}</dd>
              </div>
              <div v-if="connectedMachines.length > 0" class="ShellHerdrSpace-InfoRow">
                <dt>{{ t('herdr.space.metaMachines') }}</dt>
                <dd>{{ connectedMachines.map((machine) => machine.name).join(', ') }}</dd>
              </div>
              <div v-if="herdrSessionName" class="ShellHerdrSpace-InfoRow">
                <dt>{{ t('herdr.space.metaSession') }}</dt>
                <dd>
                  <code>{{ herdrSessionName }}</code>
                </dd>
              </div>
            </dl>
          </div>
        </TxPopover>
      </div>
    </div>

    <Transition
      name="folder-expand"
      @before-enter="onFolderBeforeEnter"
      @enter="onFolderEnter"
      @after-enter="onFolderAfterEnter"
      @before-leave="onFolderBeforeLeave"
      @leave="onFolderLeave"
      @after-leave="onFolderAfterLeave"
    >
      <div v-if="expanded" :id="listId" class="ShellHerdrSpace-Children">
        <div class="ShellHerdrSpace-ChildrenInner">
          <div
            v-if="herdr.loading.value && projectGroups.length === 0"
            class="ShellHerdrSpace-SkeletonWrap"
            data-testid="herdr-loading-skeleton"
          >
            <TxRowSkeleton :rows="2" leading title-width="64%" />
          </div>

          <p
            v-else-if="herdr.isFallback.value && projectGroups.length === 0"
            class="ShellHerdrSpace-Hint"
            role="status"
            aria-live="polite"
            data-testid="herdr-fallback-hint"
          >
            <span class="i-ri-information-line ShellHerdrSpace-HintIcon" aria-hidden="true" />
            <span>{{ t('herdr.sidebar.fallbackHint') }}</span>
          </p>

          <p
            v-else-if="projectGroups.length === 0"
            class="ShellHerdrSpace-Hint"
            data-testid="herdr-empty-hint"
          >
            {{ t('herdr.sidebar.empty') }}
          </p>

          <ul v-else class="ShellHerdrSpace-List">
            <li
              v-for="group in projectGroups"
              :key="group.key"
              class="ShellHerdrSpace-Item"
              :class="[
                `is-${group.status}`,
                {
                  'is-active': isProjectActive(group),
                  'is-loading': group.hasWorking,
                  'is-menu-open': openMenuProjectKey === group.key
                }
              ]"
              :data-project-key="group.key"
              data-testid="herdr-project-row"
            >
              <TxPopover
                v-model="hoverPopoverOpen[group.key]"
                trigger="hover"
                placement="right-start"
                :offset="12"
                :open-delay="360"
                :close-delay="120"
                :reference-full-width="true"
                reference-class="ShellHerdrSpace-ItemAnchor"
                :match-reference-width="false"
                :max-width="312"
                :panel-radius="12"
                :panel-padding="10"
                :panel-card="SHELL_MENU_CARD"
                :disabled="openMenuProjectKey === group.key || quickSendSession !== null"
              >
                <template #reference>
                  <button
                    type="button"
                    class="ShellHerdrSpace-ItemOpen"
                    data-testid="herdr-project-open"
                    :title="group.cwd || projectDisplayName(group)"
                    :aria-current="isProjectActive(group) ? 'page' : undefined"
                    :aria-label="`${projectDisplayName(group)} · ${t('herdr.space.terminalCount', { count: group.sessions.length })}`"
                    @click="openProjectGroup(group)"
                  >
                    <span
                      v-if="group.hasWorking"
                      class="ShellHerdrSpace-LoadingIndicator"
                      :title="t('herdr.status.working')"
                      aria-hidden="true"
                    >
                      <TxSpinner :size="13" :stroke-width="1.5" class="ShellHerdrSpace-Spinner" />
                    </span>
                    <span
                      v-else
                      class="ShellHerdrSpace-ItemIcon"
                      :class="projectRowIcon(group)"
                      aria-hidden="true"
                    />
                    <span class="ShellHerdrSpace-ItemTitle">{{ projectDisplayName(group) }}</span>
                    <span
                      v-if="showProjectAttentionDot(group)"
                      class="ShellHerdrSpace-StatusDot"
                      :class="projectAttentionClass(group)"
                      role="status"
                      :aria-label="
                        group.hasBlocked ? t('herdr.status.blocked') : t('herdr.status.error')
                      "
                      data-testid="herdr-row-status-dot"
                    />
                    <span
                      v-if="group.sessions.length > 1"
                      class="ShellHerdrSpace-RowCount"
                      data-testid="herdr-project-count"
                    >
                      {{ group.sessions.length }}
                    </span>
                  </button>
                </template>

                <div class="ShellHerdrSpace-HoverCard" data-testid="herdr-project-hover-card">
                  <div class="ShellHerdrSpace-HoverHead">
                    <span
                      class="ShellHerdrSpace-ItemIcon"
                      :class="projectRowIcon(group)"
                      aria-hidden="true"
                    />
                    <span class="ShellHerdrSpace-HoverTitle">{{ projectDisplayName(group) }}</span>
                    <span class="ShellHerdrSpace-Badge">
                      {{ t('herdr.space.terminalCount', { count: group.sessions.length }) }}
                    </span>
                  </div>

                  <p v-if="group.cwd" class="ShellHerdrSpace-HoverPath">
                    <code>{{ group.cwd }}</code>
                  </p>

                  <div class="ShellHerdrSpace-HoverTerminalList">
                    <button
                      v-for="session in group.sessions"
                      :key="session.address"
                      type="button"
                      class="ShellHerdrSpace-HoverTerminalBtn"
                      :class="{ 'is-active': activeRouteAddress === session.address }"
                      data-testid="herdr-hover-terminal-btn"
                      @click="openSessionInGroup(group, session)"
                    >
                      <span
                        class="ShellHerdrSpace-ItemIcon"
                        :class="resolveSessionIcon(session)"
                        aria-hidden="true"
                      />
                      <span class="ShellHerdrSpace-HoverTerminalTitle">
                        {{
                          projectSessionTitles(group).get(session.address) || session.displayTitle
                        }}
                      </span>
                      <span
                        class="ShellHerdrSpace-StatusPill ShellHerdrSpace-StatusPill--compact"
                        :class="statusPillClass(session)"
                        data-testid="herdr-status-pill"
                      >
                        <span
                          class="ShellHerdrSpace-StatusIcon"
                          :class="statusIconClass(session)"
                          aria-hidden="true"
                        />
                        <span class="ShellHerdrSpace-StatusText">
                          {{ formatStatusLabel(session) }}
                        </span>
                      </span>
                    </button>
                  </div>

                  <p class="ShellHerdrSpace-HoverHint">{{ t('herdr.hover.actionHint') }}</p>
                </div>
              </TxPopover>

              <TxDropdownMenu
                :model-value="openMenuProjectKey === group.key"
                placement="bottom-end"
                :panel-card="SHELL_MENU_CARD"
                @update:model-value="setProjectMenu(group.key, $event)"
              >
                <template #trigger>
                  <button
                    class="ShellHerdrSpace-ItemAction"
                    type="button"
                    data-testid="herdr-project-more"
                    :aria-label="t('shell.projects.projectActions')"
                  >
                    <span class="i-ri-more-2-fill" aria-hidden="true" />
                  </button>
                </template>

                <TxDropdownItem
                  data-testid="herdr-menu-new-terminal"
                  :disabled="creatingSession || !herdr.isConnected.value"
                  @select="handleStartNewSession(group)"
                >
                  <span class="i-ri-add-line mr-1.5" aria-hidden="true" />
                  {{ t('herdr.actions.newProjectTerminal') }}
                </TxDropdownItem>

                <TxDropdownSubmenu
                  v-if="group.sessions.length > 0"
                  :min-width="210"
                  data-testid="herdr-menu-switch-terminal"
                >
                  <span class="ShellHerdrSpace-SubmenuRow">
                    <span class="i-ri-terminal-box-line mr-1.5" aria-hidden="true" />
                    <span>{{ t('herdr.actions.switchTerminal') }}</span>
                  </span>
                  <template #menu>
                    <TxDropdownItem
                      v-for="session in group.sessions"
                      :key="session.address"
                      data-testid="herdr-menu-terminal-item"
                      @select="openSessionInGroup(group, session)"
                    >
                      <span class="ShellHerdrSpace-SubmenuItem">
                        <span
                          class="ShellHerdrSpace-ItemIcon"
                          :class="resolveSessionIcon(session)"
                          aria-hidden="true"
                        />
                        <span class="ShellHerdrSpace-SubmenuTitle">
                          {{
                            projectSessionTitles(group).get(session.address) || session.displayTitle
                          }}
                        </span>
                      </span>
                    </TxDropdownItem>
                  </template>
                </TxDropdownSubmenu>

                <TxDropdownItem
                  data-testid="herdr-menu-quick-send"
                  @select="openQuickSendModal(group)"
                >
                  <span class="i-ri-send-plane-2-line mr-1.5" aria-hidden="true" />
                  {{ t('herdr.actions.quickSend') }}
                </TxDropdownItem>

                <TxDropdownItem data-testid="herdr-menu-attach" @select="openInDrawer(group)">
                  <span class="i-ri-terminal-window-line mr-1.5" aria-hidden="true" />
                  {{ t('herdr.actions.attach') }}
                </TxDropdownItem>

                <TxDropdownItem
                  data-testid="herdr-menu-interrupt"
                  @select="handleInterruptGroup(group)"
                >
                  <span class="i-ri-stop-circle-line mr-1.5" aria-hidden="true" />
                  {{ t('herdr.actions.interrupt') }}
                </TxDropdownItem>

                <TxDropdownItem data-testid="herdr-menu-info" @select="openInfoModal(group)">
                  <span class="i-ri-information-line mr-1.5" aria-hidden="true" />
                  {{ t('herdr.actions.projectInfo') }}
                </TxDropdownItem>

                <TxDropdownItem
                  danger
                  data-testid="herdr-menu-kill"
                  @select="requestKillGroupTarget(group)"
                >
                  <span class="i-ri-shut-down-line mr-1.5" aria-hidden="true" />
                  {{ t('terminal.herdr.kill') }}
                </TxDropdownItem>
              </TxDropdownMenu>
            </li>
          </ul>
        </div>
      </div>
    </Transition>

    <TxModal
      :model-value="quickSendSession !== null"
      :title="
        quickSendSession
          ? `${t('herdr.actions.quickSend')} · ${quickSendSession.displayTitle}`
          : t('herdr.actions.quickSend')
      "
      width="420px"
      :close-label="t('common.close')"
      @update:model-value="
        (open: boolean) => {
          if (!open) closeQuickSendModal()
        }
      "
    >
      <form
        ref="quickSendInputWrapRef"
        class="ShellHerdrSpace-SendForm"
        data-testid="herdr-card-send-form"
        @submit.prevent="submitQuickSend"
      >
        <TxInput
          v-model="quickSendDraft"
          class="ShellHerdrSpace-SendInput"
          :placeholder="t('herdr.actions.sendPlaceholder')"
          :aria-label="t('herdr.actions.sendPlaceholder')"
          data-testid="herdr-card-send-input"
        />
        <TxButton
          native-type="submit"
          size="sm"
          variant="primary"
          :loading="quickSendSubmitting"
          :disabled="!quickSendDraft.trim()"
          data-testid="herdr-card-send-submit"
        >
          {{ t('herdr.actions.sendSubmit') }}
        </TxButton>
      </form>
    </TxModal>

    <TxModal
      :model-value="infoGroup !== null"
      :title="infoGroup ? projectDisplayName(infoGroup) : t('herdr.actions.projectInfo')"
      width="440px"
      :close-label="t('common.close')"
      @update:model-value="
        (open: boolean) => {
          if (!open) infoGroup = null
        }
      "
    >
      <div
        v-if="infoGroup"
        class="ShellHerdrSpace-ModalBody"
        data-testid="herdr-project-info-modal"
      >
        <dl class="ShellHerdrSpace-ModalInfo">
          <div v-for="row of infoRows" :key="row.key" class="ShellHerdrSpace-ModalInfoRow">
            <dt>{{ row.label }}</dt>
            <dd :class="{ 'is-mono': row.mono }">{{ row.value }}</dd>
          </div>
        </dl>

        <div class="ShellHerdrSpace-ModalTerminals">
          <div
            v-for="session in infoGroup.sessions"
            :key="session.address"
            class="ShellHerdrSpace-ModalTerminalRow"
          >
            <span
              class="ShellHerdrSpace-ItemIcon"
              :class="resolveSessionIcon(session)"
              aria-hidden="true"
            />
            <span class="ShellHerdrSpace-ModalTerminalTitle">
              {{ projectSessionTitles(infoGroup).get(session.address) || session.displayTitle }}
            </span>
            <code class="ShellHerdrSpace-ModalTerminalMeta">
              {{ resolveSessionAppDetail(session) }} · {{ session.address }}
            </code>
          </div>
        </div>
      </div>
    </TxModal>

    <TxBottomDialog
      v-if="pendingKillSession"
      :title="t('herdr.actions.killConfirmTitle')"
      :message="t('herdr.actions.killConfirmLabel', { title: pendingKillSession.displayTitle })"
      :close-label="t('common.close')"
      :btns="[
        { content: t('common.cancel'), type: 'info', onClick: () => true },
        {
          content: t('terminal.herdr.kill'),
          type: 'error',
          onClick: onConfirmKill
        }
      ]"
      :close="
        () => {
          pendingKillSession = null
        }
      "
    />
  </div>
</template>

<style lang="scss" scoped>
.ShellHerdrSpace-Rail {
  display: flex;
  justify-content: center;
  width: 100%;
  flex-shrink: 0;
}

.ShellHerdrSpace-RailBtn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 38px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary),
      0 0 0 3px var(--tx-color-primary-light-9);
  }
}

.ShellHerdrSpace-RailIcon {
  display: inline-flex;
  font-size: 14px;
}

.ShellHerdrSpace-RailCount {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.ShellHerdrSpace-RailDot {
  position: absolute;
  top: 4px;
  right: 4px;
}

.ShellHerdrSpace {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/**
 * Matches ShellProjectFolder-Row and ShellTemporarySpace-Row box metrics — 1px transparent border
 * around the shared row padding — so Herdr Space aligns column-for-column with every other Space.
 */
.ShellHerdrSpace-Row {
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  color: var(--shell-text-regular);

  &:hover {
    background: var(--shell-surface-2);
  }
}

.ShellHerdrSpace-Toggle {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  align-self: stretch;
  padding: var(--shell-row-pad-y) calc(var(--shell-row-gap) / 2) var(--shell-row-pad-y)
    var(--shell-row-pad-x);
  border: none;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.ShellHerdrSpace-Glyph {
  display: grid;
  flex: 0 0 auto;
  width: var(--shell-row-icon);
  min-width: var(--shell-row-icon);
  height: var(--shell-row-icon);
  min-height: var(--shell-row-icon);
  font-size: var(--shell-row-icon);

  > span {
    display: block;
    grid-area: 1 / 1;
    width: 100%;
    height: 100%;
  }
}

.ShellHerdrSpace-Chevron {
  visibility: hidden;
  transition: transform 0.26s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  &.is-expanded {
    transform: rotate(90deg);
  }
}

.ShellHerdrSpace > .ShellHerdrSpace-Row:hover,
.ShellHerdrSpace-Toggle:focus-visible {
  .ShellHerdrSpace-Folder {
    visibility: hidden;
  }

  .ShellHerdrSpace-Chevron {
    visibility: visible;
  }
}

.ShellHerdrSpace-Row :deep(.ShellHerdrSpace-NameAnchor) {
  display: flex;
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
}

.ShellHerdrSpace-Name {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  align-self: stretch;
  gap: 6px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: var(--shell-row-pad-y) 0 var(--shell-row-pad-y) calc(var(--shell-row-gap) / 2);
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.ShellHerdrSpace-NameText {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ShellHerdrSpace-LiveCount {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  line-height: 1;
}

.ShellHerdrSpace-AmberDot {
  display: inline-block;
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--shell-warning);
}

.ShellHerdrSpace-Actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  align-items: center;
  margin-right: 3px;
}

.ShellHerdrSpace-Add {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover:not(:disabled),
  &:focus-visible {
    color: var(--shell-text-regular);
    background: var(--shell-info-soft);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .ShellHerdrSpace-Row:hover &,
  .ShellHerdrSpace-Row:has(:focus-visible) & {
    opacity: 1;
  }
}

.ShellHerdrSpace-Info {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-warning);
  cursor: pointer;
  transition: opacity 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover,
  &:focus-visible,
  .is-info-open & {
    background: var(--shell-warning-soft);
  }

  &.is-quiet {
    color: var(--shell-text-muted);
    opacity: 0;

    &:hover,
    &:focus-visible,
    .is-info-open & {
      color: var(--shell-text-regular);
      background: var(--shell-info-soft);
    }

    .ShellHerdrSpace-Row:hover &,
    .ShellHerdrSpace-Row:has(:focus-visible) &,
    .is-info-open & {
      opacity: 1;
    }
  }
}

.ShellHerdrSpace-ActionIcon,
.ShellHerdrSpace-InfoIcon {
  display: inline-flex;
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  font-size: 14px;
}

/**
 * Nested rows indent into the Space name column via `--shell-rows-indent`, matching
 * ShellProjectFolder-Children and ShellTemporarySpace-Children so hover/active pills span full width.
 */
.ShellHerdrSpace-Children {
  --shell-rows-indent: calc(var(--shell-row-icon) + var(--shell-row-gap));

  overflow: hidden;
}

.ShellHerdrSpace-ChildrenInner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
}

.ShellHerdrSpace-SkeletonWrap {
  --tx-skeleton-row-gap: 8px;
  --tx-skeleton-row-padding-block: 6px;
  --tx-skeleton-row-padding-inline: 8px;
  --tx-skeleton-row-leading-size: 14px;

  padding-left: calc(var(--shell-row-pad-x) + var(--shell-rows-indent, 0px) - 8px);
}

.ShellHerdrSpace-Hint {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  min-height: var(--shell-row-min-height);
  margin: 0;
  padding: var(--shell-row-pad-y) var(--shell-row-pad-x) var(--shell-row-pad-y)
    calc(var(--shell-row-pad-x) + var(--shell-rows-indent, 0px));
  border: 1px solid transparent;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}

.ShellHerdrSpace-HintIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 14px;
}

.ShellHerdrSpace-List {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/**
 * Matches ShellProjectRows-Row box metrics and states: borderless single-line project row that
 * highlights on hover or selection, with one hover-revealed ⋯ trigger on the trailing edge.
 */
.ShellHerdrSpace-Item {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: var(--shell-row-min-height);
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);

  &:hover:not(.is-active) {
    background: var(--shell-surface-2);
  }

  &.is-active {
    background: var(--shell-primary-soft);
  }

  &.is-loading.is-active {
    border-color: color-mix(in srgb, var(--shell-primary) 32%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 24%, transparent);
  }
}

.ShellHerdrSpace-Item :deep(.ShellHerdrSpace-ItemAnchor) {
  display: flex;
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
}

.ShellHerdrSpace-ItemOpen {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: var(--shell-row-pad-y) 4px var(--shell-row-pad-y)
    calc(var(--shell-row-pad-x) + var(--shell-rows-indent, 0px));
  border: none;
  border-radius: inherit;
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }

  .is-active & {
    color: var(--shell-primary);
    font-weight: 500;
  }
}

.ShellHerdrSpace-LoadingIndicator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--shell-primary);
}

.ShellHerdrSpace-Spinner {
  color: var(--shell-primary);
  flex-shrink: 0;
}

.ShellHerdrSpace-ItemIcon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--shell-text-muted);

  .is-active & {
    color: var(--shell-primary);
  }
}

.ShellHerdrSpace-ItemTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-RowCount {
  flex: 0 0 auto;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;

  .is-active & {
    color: var(--shell-primary);
  }
}

.ShellHerdrSpace-StatusDot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;

  &.is-blocked {
    background: var(--shell-warning);
  }

  &.is-error {
    background: var(--shell-danger);
  }
}

.ShellHerdrSpace-ItemAction {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 3px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
  -webkit-app-region: no-drag;

  &:focus-visible,
  .ShellHerdrSpace-Item:hover &,
  .is-menu-open & {
    opacity: 1;
  }

  &:hover {
    color: var(--shell-text-regular);
  }
}

.ShellHerdrSpace-SubmenuRow,
.ShellHerdrSpace-SubmenuItem {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
}

.ShellHerdrSpace-SubmenuTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-SendForm {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.ShellHerdrSpace-SendInput {
  flex: 1 1 auto;
  min-width: 0;
}

.ShellHerdrSpace-ModalBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/** Matches ShellProjectRows-Info layout for selectable project metadata. */
.ShellHerdrSpace-ModalInfo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  font-size: var(--shell-fs-sm);

  .ShellHerdrSpace-ModalInfoRow {
    display: grid;
    grid-template-columns: 88px 1fr;
    gap: 10px;
    align-items: baseline;
  }

  dt {
    color: var(--shell-text-muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--shell-text-regular);
  }

  .is-mono {
    font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: var(--shell-fs-caption);
    user-select: text;
  }
}

.ShellHerdrSpace-ModalTerminals {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--shell-border);
}

.ShellHerdrSpace-ModalTerminalRow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: var(--shell-fs-sm);
}

.ShellHerdrSpace-ModalTerminalTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-ModalTerminalMeta {
  flex: 0 0 auto;
  color: var(--shell-text-muted);
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--shell-fs-caption);
}

/** Teleported popover cards: standalone scoped selectors because TxPopover teleports under body. */
.ShellHerdrSpace-InfoCard,
.ShellHerdrSpace-RailPopover,
.ShellHerdrSpace-HoverCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ShellHerdrSpace-InfoHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ShellHerdrSpace-InfoTitle {
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.ShellHerdrSpace-InfoConn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;

  &.is-connected {
    background: var(--tx-color-success-light-9);
    color: color-mix(in srgb, var(--tx-color-success) 45%, var(--tx-text-color-primary));
  }

  &.is-connecting {
    background: var(--tx-color-primary-light-9);
    color: color-mix(in srgb, var(--tx-color-primary) 50%, var(--tx-text-color-primary));
  }

  &.is-fallback {
    background: var(--tx-color-warning-light-9);
    color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-text-color-primary));
  }

  &.is-disconnected {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-regular);
  }
}

.ShellHerdrSpace-InfoDesc {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
  text-wrap: pretty;
}

.ShellHerdrSpace-InfoMeta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-lighter);
  font-size: 12px;
}

.ShellHerdrSpace-InfoRow {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;

  dt {
    color: var(--tx-text-color-secondary);
  }

  dd {
    margin: 0;
    color: var(--tx-text-color-regular);
    overflow-wrap: anywhere;

    code {
      font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 0.9em;
    }
  }
}

.ShellHerdrSpace-HoverHead {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ShellHerdrSpace-HoverTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-HoverPath {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;

  code {
    font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  }
}

.ShellHerdrSpace-HoverTerminalList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.ShellHerdrSpace-HoverTerminalBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-primary);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

.ShellHerdrSpace-HoverTerminalTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-StatusPill {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;

  &.ShellHerdrSpace-StatusPill--compact {
    height: 18px;
    padding: 0 6px;
  }

  &.is-working {
    background: var(--tx-color-primary-light-9);
    color: color-mix(in srgb, var(--tx-color-primary) 50%, var(--tx-text-color-primary));
  }

  &.is-blocked {
    background: var(--tx-color-warning-light-9);
    color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-text-color-primary));
  }

  &.is-done {
    background: var(--tx-color-success-light-9);
    color: color-mix(in srgb, var(--tx-color-success) 45%, var(--tx-text-color-primary));
  }

  &.is-error {
    background: var(--tx-color-danger-light-9);
    color: color-mix(in srgb, var(--tx-color-danger) 55%, var(--tx-text-color-primary));
  }

  &.is-idle {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-regular);
  }
}

.ShellHerdrSpace-StatusIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 11px;

  &.is-idle-dot {
    font-size: 6px;
  }

  &.is-spin {
    animation: herdr-space-spin 1.1s linear infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }
}

.ShellHerdrSpace-StatusText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-Badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-size: 11px;
  line-height: 1;
}

.ShellHerdrSpace-HoverHint {
  margin: 0;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-lighter);
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.ShellHerdrSpace-RailPreviewList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.ShellHerdrSpace-RailPreviewItem {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-primary);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light);
  }
}

.ShellHerdrSpace-RailPreviewTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-RailMore {
  padding: 4px 6px 0;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
}

.folder-expand-enter-active {
  transition: height 0.28s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  .ShellHerdrSpace-ChildrenInner {
    transition:
      opacity 0.22s ease-out,
      transform 0.28s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }
}

.folder-expand-leave-active {
  transition: height 0.22s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  .ShellHerdrSpace-ChildrenInner {
    transition:
      opacity 0.16s ease-out,
      transform 0.22s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }
}

.folder-expand-enter-from .ShellHerdrSpace-ChildrenInner {
  opacity: 0;
  transform: translateY(-6px);
}

.folder-expand-leave-to .ShellHerdrSpace-ChildrenInner {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .ShellHerdrSpace-Chevron,
  .folder-expand-enter-active,
  .folder-expand-leave-active,
  .folder-expand-enter-active .ShellHerdrSpace-ChildrenInner,
  .folder-expand-leave-active .ShellHerdrSpace-ChildrenInner {
    transition-duration: 0.01ms;
  }

  .folder-expand-enter-from .ShellHerdrSpace-ChildrenInner,
  .folder-expand-leave-to .ShellHerdrSpace-ChildrenInner {
    transform: none;
  }
}

@keyframes herdr-space-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

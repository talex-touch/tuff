<script lang="ts" name="ShellHerdrSpace" setup>
import type { HerdrOscState } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { herdrConversationRoute } from '../../../../shared/app-surface-routes'
import {
  isBareVersionToken,
  resolveHerdrSessionApp,
  resolveHerdrSessionLocation,
  useHerdrRuntime
} from '~/modules/herdr/useHerdrRuntime'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
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
const hoverPopoverOpen = reactive<Record<string, boolean>>({})
const sendPopoverOpen = reactive<Record<string, boolean>>({})
const sendDrafts = reactive<Record<string, string>>({})
const sendingByAddress = reactive<Record<string, boolean>>({})
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
const railPreviewSessions = computed(() => liveSessions.value.slice(0, RAIL_PREVIEW_LIMIT))
const railOverflowCount = computed(() =>
  Math.max(0, liveSessions.value.length - RAIL_PREVIEW_LIMIT)
)

const connectionState = computed(() => {
  if (herdr.isConnected.value) return 'connected'
  if (herdr.isFallback.value) return 'fallback'
  if (herdr.loading.value) return 'connecting'
  return 'disconnected'
})

const connectionLabel = computed(() => t(`herdr.space.connection.${connectionState.value}`))

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

function resolveSessionCwd(session: HerdrProjectedSession): string {
  return session.effectiveCwd || session.foregroundCwd || session.cwd || ''
}

function resolveSessionWhere(session: HerdrProjectedSession): string {
  return session.labels?.where?.trim() || ''
}

function resolveSessionCommand(session: HerdrProjectedSession): string {
  if (!Array.isArray(session.argv) || session.argv.length === 0) return ''
  return session.argv.join(' ').trim()
}

function resolveLocationBadge(session: HerdrProjectedSession): string | null {
  if (session.projectName) return null
  const location = session.locationLabel ?? resolveHerdrSessionLocation(session, null)
  if (!location) return null
  if (session.displayTitle.toLowerCase().includes(location.toLowerCase())) {
    return null
  }
  return location
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

function hasProgress(session: HerdrProjectedSession): boolean {
  return typeof session.status?.progress === 'number' && Number.isFinite(session.status.progress)
}

function clampedProgress(session: HerdrProjectedSession): number {
  const value = session.status?.progress
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isSessionActive(session: HerdrProjectedSession): boolean {
  return route.path === herdrConversationRoute(session.address)
}

function openStructuredView(session: HerdrProjectedSession): void {
  hoverPopoverOpen[session.address] = false
  void router.push(herdrConversationRoute(session.address))
}

function openInDrawer(session: HerdrProjectedSession): void {
  hoverPopoverOpen[session.address] = false
  herdr.openTerminalTab(session.address, { openDrawer: true })
}

function openPrimaryFromRail(): void {
  const blocked = liveSessions.value.find((session) => session.status?.state === 'blocked')
  const target = blocked ?? liveSessions.value[0]
  if (target) {
    openStructuredView(target)
  }
}

function onSendPopoverChange(address: string, open: boolean): void {
  sendPopoverOpen[address] = open
  if (open) {
    hoverPopoverOpen[address] = false
  }
}

async function handleStartNewSession(): Promise<void> {
  if (creatingSession.value) return
  creatingSession.value = true
  try {
    await herdr.openNewHerdrTab({})
  } catch {
    toast.error(t('terminal.failed'))
  } finally {
    creatingSession.value = false
  }
}

async function submitQuickSend(session: HerdrProjectedSession): Promise<void> {
  const addr = session.address
  const rawDraft = sendDrafts[addr] ?? ''
  const text = rawDraft.trim()
  if (!text || sendingByAddress[addr]) return
  sendingByAddress[addr] = true
  try {
    await herdr.send(addr, text)
    if (sendDrafts[addr] === rawDraft) {
      sendDrafts[addr] = ''
      sendPopoverOpen[addr] = false
    }
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
  } finally {
    delete sendingByAddress[addr]
  }
}

async function handleInterrupt(session: HerdrProjectedSession): Promise<void> {
  const addr = session.address
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
        <div v-if="railPreviewSessions.length > 0" class="ShellHerdrSpace-RailPreviewList">
          <button
            v-for="session in railPreviewSessions"
            :key="session.address"
            type="button"
            class="ShellHerdrSpace-RailPreviewItem"
            @click="openStructuredView(session)"
          >
            <span
              class="ShellHerdrSpace-CardIcon"
              :class="resolveSessionIcon(session)"
              aria-hidden="true"
            />
            <span class="ShellHerdrSpace-RailPreviewTitle">{{ session.displayTitle }}</span>
            <span
              class="ShellHerdrSpace-StatusPill ShellHerdrSpace-StatusPill--compact"
              :class="statusPillClass(session)"
            >
              {{ formatStatusLabel(session) }}
            </span>
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
            @click="handleStartNewSession"
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
            v-if="herdr.loading.value && liveSessions.length === 0"
            class="ShellHerdrSpace-SkeletonWrap"
            data-testid="herdr-loading-skeleton"
          >
            <TxRowSkeleton
              :rows="2"
              leading
              description
              trailing
              title-width="64%"
              desc-width="46%"
            />
          </div>

          <p
            v-else-if="herdr.isFallback.value && liveSessions.length === 0"
            class="ShellHerdrSpace-Hint"
            role="status"
            aria-live="polite"
            data-testid="herdr-fallback-hint"
          >
            <span class="i-ri-information-line ShellHerdrSpace-HintIcon" aria-hidden="true" />
            <span>{{ t('herdr.sidebar.fallbackHint') }}</span>
          </p>

          <p
            v-else-if="liveSessions.length === 0"
            class="ShellHerdrSpace-Hint"
            data-testid="herdr-empty-hint"
          >
            {{ t('herdr.sidebar.empty') }}
          </p>

          <ul v-else class="ShellHerdrSpace-List">
            <li
              v-for="session in liveSessions"
              :key="session.address"
              class="ShellHerdrSpace-Card"
              :class="[
                `is-${resolveOscState(session)}`,
                {
                  'is-active': isSessionActive(session),
                  'is-attached': herdr.isAttached(session.address),
                  'is-send-open': Boolean(sendPopoverOpen[session.address])
                }
              ]"
              :data-address="session.address"
              data-testid="herdr-task-card"
            >
              <!-- Hover detail popover wraps the card body only; actions remain siblings to avoid nested popover cascades. -->
              <TxPopover
                v-model="hoverPopoverOpen[session.address]"
                trigger="hover"
                placement="right-start"
                :offset="12"
                :open-delay="180"
                :close-delay="100"
                :reference-full-width="true"
                :match-reference-width="false"
                :max-width="304"
                :panel-radius="12"
                :panel-padding="10"
                :panel-card="SHELL_MENU_CARD"
                :disabled="Boolean(sendPopoverOpen[session.address])"
              >
                <template #reference>
                  <button
                    type="button"
                    class="ShellHerdrSpace-CardMain"
                    data-testid="herdr-card-open"
                    :aria-label="`${session.displayTitle} · ${formatStatusLabel(session)}`"
                    @click="openStructuredView(session)"
                  >
                    <span class="ShellHerdrSpace-CardHead">
                      <span
                        class="ShellHerdrSpace-CardIcon"
                        :class="resolveSessionIcon(session)"
                        aria-hidden="true"
                      />
                      <span class="ShellHerdrSpace-CardTitle">{{ session.displayTitle }}</span>
                    </span>

                    <span class="ShellHerdrSpace-MetaRow">
                      <span
                        class="ShellHerdrSpace-StatusPill"
                        :class="statusPillClass(session)"
                        role="status"
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

                      <span
                        v-if="session.machine !== null"
                        class="ShellHerdrSpace-Badge ShellHerdrSpace-Badge--remote"
                        data-testid="herdr-remote-badge"
                      >
                        <span
                          class="i-ri-server-line ShellHerdrSpace-BadgeIcon"
                          aria-hidden="true"
                        />
                        <span class="ShellHerdrSpace-BadgeText">{{ session.machine }}</span>
                      </span>

                      <span
                        v-if="session.projectName"
                        class="ShellHerdrSpace-Badge ShellHerdrSpace-Badge--project"
                        data-testid="herdr-project-badge"
                      >
                        <span
                          class="i-ri-folder-2-line ShellHerdrSpace-BadgeIcon"
                          aria-hidden="true"
                        />
                        <span class="ShellHerdrSpace-BadgeText">{{ session.projectName }}</span>
                      </span>

                      <span
                        v-else-if="resolveLocationBadge(session)"
                        class="ShellHerdrSpace-Badge ShellHerdrSpace-Badge--location"
                        data-testid="herdr-location-badge"
                      >
                        <span
                          class="i-ri-folder-2-line ShellHerdrSpace-BadgeIcon"
                          aria-hidden="true"
                        />
                        <span class="ShellHerdrSpace-BadgeText">
                          {{ resolveLocationBadge(session) }}
                        </span>
                      </span>
                    </span>

                    <span v-if="session.status?.msg" class="ShellHerdrSpace-Message">
                      {{ session.status.msg }}
                    </span>

                    <span
                      v-if="hasProgress(session)"
                      class="ShellHerdrSpace-Progress"
                      role="progressbar"
                      :aria-valuenow="clampedProgress(session)"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      :aria-label="session.displayTitle"
                      data-testid="herdr-progress-bar"
                    >
                      <span
                        class="ShellHerdrSpace-ProgressFill"
                        :class="{ 'is-blocked': resolveOscState(session) === 'blocked' }"
                        :style="{ width: `${clampedProgress(session)}%` }"
                      />
                    </span>
                  </button>
                </template>

                <div class="ShellHerdrSpace-HoverCard" data-testid="herdr-task-hover-card">
                  <div class="ShellHerdrSpace-HoverHead">
                    <span
                      class="ShellHerdrSpace-CardIcon"
                      :class="resolveSessionIcon(session)"
                      aria-hidden="true"
                    />
                    <span class="ShellHerdrSpace-HoverTitle">{{ session.displayTitle }}</span>
                    <span class="ShellHerdrSpace-StatusPill" :class="statusPillClass(session)">
                      <span
                        class="ShellHerdrSpace-StatusIcon"
                        :class="statusIconClass(session)"
                        aria-hidden="true"
                      />
                      <span class="ShellHerdrSpace-StatusText">
                        {{ formatStatusLabel(session) }}
                      </span>
                    </span>
                  </div>

                  <p v-if="session.status?.msg" class="ShellHerdrSpace-HoverMsg">
                    {{ session.status.msg }}
                  </p>

                  <dl class="ShellHerdrSpace-HoverMeta">
                    <div class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.app') }}</dt>
                      <dd>
                        <code>{{ resolveSessionAppDetail(session) }}</code>
                      </dd>
                    </div>
                    <div class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.address') }}</dt>
                      <dd>
                        <code>{{ session.address }}</code>
                        <span v-if="session.turn > 0" class="ShellHerdrSpace-HoverTurn">
                          · {{ t('herdr.conversation.turnCount', { turn: session.turn }) }}
                        </span>
                      </dd>
                    </div>
                    <div v-if="session.machine !== null" class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.machine') }}</dt>
                      <dd>{{ session.machine }}</dd>
                    </div>
                    <div v-if="session.projectName" class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.project') }}</dt>
                      <dd>{{ session.projectName }}</dd>
                    </div>
                    <div
                      v-if="
                        resolveSessionWhere(session) &&
                        resolveSessionWhere(session) !== session.projectName
                      "
                      class="ShellHerdrSpace-HoverRow"
                    >
                      <dt>{{ t('herdr.hover.where') }}</dt>
                      <dd>{{ resolveSessionWhere(session) }}</dd>
                    </div>
                    <div v-if="resolveSessionCwd(session)" class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.cwd') }}</dt>
                      <dd class="is-path">
                        <code>{{ resolveSessionCwd(session) }}</code>
                      </dd>
                    </div>
                    <div v-if="resolveSessionCommand(session)" class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.command') }}</dt>
                      <dd class="is-path">
                        <code>{{ resolveSessionCommand(session) }}</code>
                      </dd>
                    </div>
                    <div class="ShellHerdrSpace-HoverRow">
                      <dt>{{ t('herdr.hover.attachment') }}</dt>
                      <dd>
                        {{
                          herdr.isAttached(session.address)
                            ? t('herdr.hover.attachmentAttached')
                            : t('herdr.hover.attachmentBackground')
                        }}
                      </dd>
                    </div>
                  </dl>

                  <p class="ShellHerdrSpace-HoverHint">{{ t('herdr.hover.actionHint') }}</p>
                </div>
              </TxPopover>

              <div class="ShellHerdrSpace-CardActions">
                <TxPopover
                  :model-value="Boolean(sendPopoverOpen[session.address])"
                  placement="right-start"
                  :width="244"
                  :panel-padding="10"
                  panel-background="refraction"
                  :panel-card="SHELL_MENU_CARD"
                  @update:model-value="onSendPopoverChange(session.address, $event)"
                >
                  <template #reference>
                    <TxTooltip
                      :content="t('herdr.actions.quickSend')"
                      :disabled="Boolean(sendPopoverOpen[session.address])"
                      :anchor="{ placement: 'top' }"
                    >
                      <button
                        type="button"
                        class="ShellHerdrSpace-ActionBtn"
                        data-testid="herdr-card-send-trigger"
                        :aria-label="t('herdr.actions.quickSend')"
                      >
                        <span class="i-ri-send-plane-2-line" aria-hidden="true" />
                      </button>
                    </TxTooltip>
                  </template>

                  <form
                    class="ShellHerdrSpace-SendForm"
                    data-testid="herdr-card-send-form"
                    @submit.prevent="submitQuickSend(session)"
                  >
                    <TxInput
                      v-model="sendDrafts[session.address]"
                      class="ShellHerdrSpace-SendInput"
                      :placeholder="t('herdr.actions.sendPlaceholder')"
                      :aria-label="t('herdr.actions.sendPlaceholder')"
                      data-testid="herdr-card-send-input"
                    />
                    <TxButton
                      native-type="submit"
                      size="sm"
                      variant="primary"
                      :loading="Boolean(sendingByAddress[session.address])"
                      :disabled="!(sendDrafts[session.address] ?? '').trim()"
                      data-testid="herdr-card-send-submit"
                    >
                      {{ t('herdr.actions.sendSubmit') }}
                    </TxButton>
                  </form>
                </TxPopover>

                <TxTooltip :content="t('herdr.actions.interrupt')" :anchor="{ placement: 'top' }">
                  <button
                    type="button"
                    class="ShellHerdrSpace-ActionBtn"
                    data-testid="herdr-card-interrupt"
                    :disabled="Boolean(interruptingByAddress[session.address])"
                    :aria-label="t('herdr.actions.interrupt')"
                    @click="handleInterrupt(session)"
                  >
                    <span class="i-ri-stop-circle-line" aria-hidden="true" />
                  </button>
                </TxTooltip>

                <TxTooltip
                  :content="
                    herdr.isAttached(session.address)
                      ? t('herdr.actions.attached')
                      : t('herdr.actions.attach')
                  "
                  :anchor="{ placement: 'top' }"
                >
                  <button
                    type="button"
                    class="ShellHerdrSpace-ActionBtn"
                    :class="{ 'is-attached': herdr.isAttached(session.address) }"
                    data-testid="herdr-card-attach"
                    :aria-label="
                      herdr.isAttached(session.address)
                        ? t('herdr.actions.attached')
                        : t('herdr.actions.attach')
                    "
                    @click="openInDrawer(session)"
                  >
                    <span class="i-ri-terminal-window-line" aria-hidden="true" />
                  </button>
                </TxTooltip>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
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
  border-radius: 999px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.ShellHerdrSpace-AmberDot {
  display: inline-block;
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tx-color-warning);
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
  color: var(--shell-text-muted);
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover,
  &:focus-visible,
  .is-info-open & {
    color: var(--shell-text-regular);
    background: var(--shell-info-soft);
    opacity: 1;
  }

  .ShellHerdrSpace-Row:hover &,
  .ShellHerdrSpace-Row:has(:focus-visible) & {
    opacity: 1;
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

.ShellHerdrSpace-Children {
  overflow: hidden;
}

.ShellHerdrSpace-ChildrenInner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
  padding-left: 10px;
}

.ShellHerdrSpace-SkeletonWrap {
  --tx-skeleton-row-gap: 8px;
  --tx-skeleton-row-padding-block: 6px;
  --tx-skeleton-row-padding-inline: 8px;
  --tx-skeleton-row-leading-size: 16px;
  --tx-skeleton-row-trailing-width: 28px;
  --tx-skeleton-row-trailing-height: 16px;
}

.ShellHerdrSpace-Hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 8px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.ShellHerdrSpace-HintIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 14px;
}

.ShellHerdrSpace-List {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 2px 0;
  list-style: none;
}

.ShellHerdrSpace-Card {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  min-width: 0;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);

  &:hover {
    background: var(--shell-surface-2);
    box-shadow: inset 0 0 0 1px var(--tx-border-color);
  }

  &.is-blocked {
    box-shadow: inset 0 0 0 1px var(--tx-color-warning);
  }

  &.is-attached {
    background: var(--tx-fill-color-light);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--tx-color-primary) 34%, var(--tx-border-color-lighter));
  }

  &.is-active {
    background: var(
      --shell-primary-soft,
      color-mix(in srgb, var(--shell-primary) 12%, transparent)
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--shell-primary) 48%, var(--tx-border-color-lighter));
  }
}

.ShellHerdrSpace-CardMain {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  border: none;
  border-radius: inherit;
  background: transparent;
  color: var(--tx-text-color-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.ShellHerdrSpace-CardHead {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 22px;
  padding-right: 72px;
}

.ShellHerdrSpace-CardIcon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--tx-text-color-regular);
}

.ShellHerdrSpace-CardTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-CardActions {
  position: absolute;
  top: 7px;
  right: 7px;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  opacity: 0.62;
  transition: opacity 0.15s ease;

  .ShellHerdrSpace-Card:hover &,
  .ShellHerdrSpace-Card:focus-within &,
  .ShellHerdrSpace-Card.is-attached &,
  .ShellHerdrSpace-Card.is-send-open & {
    opacity: 1;
  }
}

.ShellHerdrSpace-ActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  &.is-attached {
    color: var(--tx-color-primary);
  }
}

.ShellHerdrSpace-SendForm {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.ShellHerdrSpace-SendInput {
  flex: 1 1 auto;
  min-width: 0;
}

.ShellHerdrSpace-MetaRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
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
  align-items: center;
  gap: 3px;
  max-width: 100%;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-size: 11px;
  line-height: 1;
}

.ShellHerdrSpace-BadgeIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 11px;
}

.ShellHerdrSpace-BadgeText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-Message {
  display: block;
  width: 100%;
  margin: 0;
  overflow: hidden;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellHerdrSpace-Progress {
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 999px;
  background: var(--tx-fill-color-dark);
  overflow: hidden;
}

.ShellHerdrSpace-ProgressFill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--tx-color-primary);
  transition: width 180ms ease;

  &.is-blocked {
    background: var(--tx-color-warning);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
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

.ShellHerdrSpace-InfoMeta,
.ShellHerdrSpace-HoverMeta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-lighter);
  font-size: 12px;
}

.ShellHerdrSpace-InfoRow,
.ShellHerdrSpace-HoverRow {
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
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.ShellHerdrSpace-HoverTitle {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ShellHerdrSpace-HoverMsg {
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-wrap: pretty;
}

.ShellHerdrSpace-HoverTurn {
  color: var(--tx-text-color-secondary);
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
  padding: 2px 6px 0;
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

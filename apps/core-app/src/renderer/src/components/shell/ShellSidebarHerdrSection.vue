<script lang="ts" name="ShellSidebarHerdrSection" setup>
import type { HerdrOscState } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useHerdrRuntime } from '~/modules/herdr/useHerdrRuntime'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { SHELL_MENU_CARD } from './shell-menu-panel'

const { t } = useI18n()
const { collapsed } = useShellSidebar()
const herdr = useHerdrRuntime()

const listId = 'shell-sidebar-herdr-list'
const expanded = ref(true)
const sendPopoverOpen = reactive<Record<string, boolean>>({})
const sendDrafts = reactive<Record<string, string>>({})
const sendingAddress = ref<string | null>(null)
const interruptingAddress = ref<string | null>(null)
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
  ssh: 'i-ri-server-line'
}

const liveSessions = herdr.liveSessions
const liveCount = herdr.liveCount
const hasBlockedSession = herdr.hasBlockedSession
const showRailBadge = computed(
  () => collapsed.value && (liveCount.value > 0 || herdr.loading.value)
)

function resolveSessionIcon(session: HerdrProjectedSession): string {
  const candidates = [session.status?.app, session.foregroundName, session.argv[0]]
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

function openStructuredView(session: HerdrProjectedSession): void {
  herdr.openSessionStructured(session.address, { openDrawer: true })
}

function openInDrawer(session: HerdrProjectedSession): void {
  herdr.openTerminalTab(session.address, { openDrawer: true })
}

function openPrimaryFromRail(): void {
  const blocked = liveSessions.value.find((session) => session.status?.state === 'blocked')
  const target = blocked ?? liveSessions.value[0]
  if (target) {
    openStructuredView(target)
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
  const text = (sendDrafts[session.address] ?? '').trim()
  if (!text || sendingAddress.value === session.address) return
  sendingAddress.value = session.address
  try {
    await herdr.send(session.address, text)
    sendDrafts[session.address] = ''
    sendPopoverOpen[session.address] = false
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
  } finally {
    sendingAddress.value = null
  }
}

async function handleInterrupt(session: HerdrProjectedSession): Promise<void> {
  if (interruptingAddress.value === session.address) return
  interruptingAddress.value = session.address
  try {
    await herdr.interrupt(session.address)
  } catch {
    toast.error(t('herdr.actions.interruptFailed'))
  } finally {
    interruptingAddress.value = null
  }
}
</script>

<template>
  <div v-if="collapsed" class="ShellSidebarHerdr-Rail">
    <button
      v-if="showRailBadge"
      type="button"
      class="ShellSidebarHerdr-RailBtn"
      data-testid="herdr-rail-badge"
      :title="
        hasBlockedSession
          ? t('herdr.sidebar.railBlockedTooltip', { count: liveCount })
          : t('herdr.sidebar.railTooltip', { count: liveCount })
      "
      :aria-label="
        hasBlockedSession
          ? t('herdr.sidebar.railBlockedTooltip', { count: liveCount })
          : t('herdr.sidebar.railTooltip', { count: liveCount })
      "
      @click="openPrimaryFromRail"
    >
      <span class="i-ri-terminal-box-line ShellSidebarHerdr-RailIcon" aria-hidden="true" />
      <span v-if="liveCount > 0" class="ShellSidebarHerdr-RailCount">{{ liveCount }}</span>
      <span
        v-if="hasBlockedSession"
        class="ShellSidebarHerdr-AmberDot ShellSidebarHerdr-RailDot"
        data-testid="herdr-rail-blocked-dot"
        aria-hidden="true"
      />
    </button>
  </div>

  <section
    v-else
    class="ShellSidebarHerdr"
    data-testid="herdr-sidebar-section"
    :aria-label="t('herdr.sidebar.title')"
  >
    <div class="ShellSidebarHerdr-Header">
      <button
        type="button"
        class="ShellSidebarHerdr-HeaderToggle"
        data-testid="herdr-section-toggle"
        :aria-expanded="expanded"
        :aria-controls="listId"
        @click="expanded = !expanded"
      >
        <span
          class="ShellSidebarHerdr-Chevron"
          :class="expanded ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'"
          aria-hidden="true"
        />
        <span class="ShellSidebarHerdr-HeaderTitle">{{ t('herdr.sidebar.title') }}</span>
        <span class="ShellSidebarHerdr-LiveCount" data-testid="herdr-live-count">
          {{ liveCount }}
        </span>
        <span
          v-if="hasBlockedSession"
          class="ShellSidebarHerdr-AmberDot"
          data-testid="herdr-blocked-dot"
          role="status"
          aria-live="polite"
          :title="t('herdr.status.blocked')"
          :aria-label="t('herdr.status.blocked')"
        />
      </button>

      <button
        v-if="herdr.isConnected.value"
        type="button"
        class="ShellSidebarHerdr-HeaderAction"
        data-testid="herdr-new-session-btn"
        :disabled="creatingSession"
        :title="t('herdr.sidebar.newSession')"
        :aria-label="t('herdr.sidebar.newSession')"
        @click="handleStartNewSession"
      >
        <span class="i-ri-add-line" aria-hidden="true" />
      </button>
    </div>

    <div v-if="expanded" :id="listId" class="ShellSidebarHerdr-Body">
      <div
        v-if="herdr.loading.value && liveSessions.length === 0"
        class="ShellSidebarHerdr-SkeletonWrap"
        data-testid="herdr-loading-skeleton"
      >
        <TxRowSkeleton :rows="2" leading description trailing title-width="64%" desc-width="46%" />
      </div>

      <p
        v-else-if="herdr.isFallback.value && liveSessions.length === 0"
        class="ShellSidebarHerdr-Hint"
        role="status"
        aria-live="polite"
        data-testid="herdr-fallback-hint"
      >
        <span class="i-ri-information-line ShellSidebarHerdr-HintIcon" aria-hidden="true" />
        <span>{{ t('herdr.sidebar.fallbackHint') }}</span>
      </p>

      <p
        v-else-if="liveSessions.length === 0"
        class="ShellSidebarHerdr-Hint"
        data-testid="herdr-empty-hint"
      >
        {{ t('herdr.sidebar.empty') }}
      </p>

      <ul v-else class="ShellSidebarHerdr-List">
        <li
          v-for="session in liveSessions"
          :key="session.address"
          class="ShellSidebarHerdr-Card"
          :class="[
            `is-${resolveOscState(session)}`,
            { 'is-attached': herdr.isAttached(session.address) }
          ]"
          :data-address="session.address"
          data-testid="herdr-task-card"
        >
          <div class="ShellSidebarHerdr-CardTop">
            <button
              type="button"
              class="ShellSidebarHerdr-CardTitleBtn"
              data-testid="herdr-card-open"
              :title="t('herdr.actions.openCardView')"
              @click="openStructuredView(session)"
            >
              <span
                class="ShellSidebarHerdr-CardIcon"
                :class="resolveSessionIcon(session)"
                aria-hidden="true"
              />
              <span class="ShellSidebarHerdr-CardTitle">{{ session.displayTitle }}</span>
            </button>

            <div class="ShellSidebarHerdr-CardActions">
              <TxPopover
                v-model="sendPopoverOpen[session.address]"
                placement="right-start"
                :width="244"
                :panel-padding="10"
                panel-background="refraction"
                :panel-card="SHELL_MENU_CARD"
              >
                <template #reference>
                  <button
                    type="button"
                    class="ShellSidebarHerdr-ActionBtn"
                    data-testid="herdr-card-send-trigger"
                    :title="t('herdr.actions.quickSend')"
                    :aria-label="t('herdr.actions.quickSend')"
                  >
                    <span class="i-ri-send-plane-2-line" aria-hidden="true" />
                  </button>
                </template>

                <form
                  class="ShellSidebarHerdr-SendForm"
                  data-testid="herdr-card-send-form"
                  @submit.prevent="submitQuickSend(session)"
                >
                  <TxInput
                    v-model="sendDrafts[session.address]"
                    class="ShellSidebarHerdr-SendInput"
                    :placeholder="t('herdr.actions.sendPlaceholder')"
                    :aria-label="t('herdr.actions.sendPlaceholder')"
                    data-testid="herdr-card-send-input"
                  />
                  <TxButton
                    native-type="submit"
                    size="sm"
                    variant="primary"
                    :loading="sendingAddress === session.address"
                    :disabled="!(sendDrafts[session.address] ?? '').trim()"
                    data-testid="herdr-card-send-submit"
                  >
                    {{ t('herdr.actions.sendSubmit') }}
                  </TxButton>
                </form>
              </TxPopover>

              <button
                type="button"
                class="ShellSidebarHerdr-ActionBtn"
                data-testid="herdr-card-interrupt"
                :disabled="interruptingAddress === session.address"
                :title="t('herdr.actions.interrupt')"
                :aria-label="t('herdr.actions.interrupt')"
                @click="handleInterrupt(session)"
              >
                <span class="i-ri-stop-circle-line" aria-hidden="true" />
              </button>

              <button
                type="button"
                class="ShellSidebarHerdr-ActionBtn"
                :class="{ 'is-attached': herdr.isAttached(session.address) }"
                data-testid="herdr-card-attach"
                :title="
                  herdr.isAttached(session.address)
                    ? t('herdr.actions.attached')
                    : t('herdr.actions.attach')
                "
                :aria-label="
                  herdr.isAttached(session.address)
                    ? t('herdr.actions.attached')
                    : t('herdr.actions.attach')
                "
                @click="openInDrawer(session)"
              >
                <span class="i-ri-terminal-window-line" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div class="ShellSidebarHerdr-MetaRow">
            <span
              class="ShellSidebarHerdr-StatusPill"
              :class="statusPillClass(session)"
              role="status"
              data-testid="herdr-status-pill"
            >
              <span
                class="ShellSidebarHerdr-StatusIcon"
                :class="statusIconClass(session)"
                aria-hidden="true"
              />
              <span class="ShellSidebarHerdr-StatusText">{{ formatStatusLabel(session) }}</span>
            </span>

            <span
              v-if="session.machine !== null"
              class="ShellSidebarHerdr-Badge ShellSidebarHerdr-Badge--remote"
              data-testid="herdr-remote-badge"
            >
              <span class="i-ri-server-line ShellSidebarHerdr-BadgeIcon" aria-hidden="true" />
              <span>{{ session.machine }}</span>
            </span>

            <span
              v-if="session.projectName"
              class="ShellSidebarHerdr-Badge ShellSidebarHerdr-Badge--project"
              data-testid="herdr-project-badge"
            >
              <span class="i-ri-folder-2-line ShellSidebarHerdr-BadgeIcon" aria-hidden="true" />
              <span>{{ session.projectName }}</span>
            </span>
          </div>

          <p
            v-if="session.status?.msg"
            class="ShellSidebarHerdr-Message"
            :title="session.status.msg"
          >
            {{ session.status.msg }}
          </p>

          <div
            v-if="hasProgress(session)"
            class="ShellSidebarHerdr-Progress"
            role="progressbar"
            :aria-valuenow="clampedProgress(session)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="session.displayTitle"
            data-testid="herdr-progress-bar"
          >
            <div
              class="ShellSidebarHerdr-ProgressFill"
              :class="{ 'is-blocked': resolveOscState(session) === 'blocked' }"
              :style="{ width: `${clampedProgress(session)}%` }"
            />
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.ShellSidebarHerdr-Rail {
  display: flex;
  justify-content: center;
  width: 100%;
  flex-shrink: 0;
}

.ShellSidebarHerdr-RailBtn {
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

.ShellSidebarHerdr-RailIcon {
  display: inline-flex;
  font-size: 14px;
}

.ShellSidebarHerdr-RailCount {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.ShellSidebarHerdr-RailDot {
  position: absolute;
  top: 4px;
  right: 4px;
}

.ShellSidebarHerdr {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  flex-shrink: 0;
  padding-top: 6px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.ShellSidebarHerdr-Header {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 2px;
}

.ShellSidebarHerdr-HeaderToggle {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 5px;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.ShellSidebarHerdr-Chevron {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 14px;
}

.ShellSidebarHerdr-HeaderTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellSidebarHerdr-LiveCount {
  display: inline-flex;
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

.ShellSidebarHerdr-AmberDot {
  display: inline-block;
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tx-color-warning);
}

.ShellSidebarHerdr-HeaderAction {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.ShellSidebarHerdr-Body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.ShellSidebarHerdr-SkeletonWrap {
  --tx-skeleton-row-gap: 8px;
  --tx-skeleton-row-padding-block: 6px;
  --tx-skeleton-row-padding-inline: 8px;
  --tx-skeleton-row-leading-size: 16px;
  --tx-skeleton-row-trailing-width: 28px;
  --tx-skeleton-row-trailing-height: 16px;
}

.ShellSidebarHerdr-Hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 8px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.ShellSidebarHerdr-HintIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 14px;
}

.ShellSidebarHerdr-List {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ShellSidebarHerdr-Card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 9px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);

  &.is-blocked {
    box-shadow: inset 0 0 0 1px var(--tx-color-warning);
  }

  &.is-attached {
    background: var(--tx-fill-color-light);
  }
}

.ShellSidebarHerdr-CardTop {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ShellSidebarHerdr-CardTitleBtn {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 22px;
  padding: 0 2px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--tx-text-color-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &:hover {
    color: var(--tx-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.ShellSidebarHerdr-CardIcon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--tx-text-color-regular);
}

.ShellSidebarHerdr-CardTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellSidebarHerdr-CardActions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}

.ShellSidebarHerdr-ActionBtn {
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

.ShellSidebarHerdr-SendForm {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.ShellSidebarHerdr-SendInput {
  flex: 1 1 auto;
  min-width: 0;
}

.ShellSidebarHerdr-MetaRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.ShellSidebarHerdr-StatusPill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;

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

.ShellSidebarHerdr-StatusIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 11px;

  &.is-idle-dot {
    font-size: 7px;
  }

  &.is-spin {
    @media (prefers-reduced-motion: no-preference) {
      animation: herdr-status-spin 1s linear infinite;
    }
  }
}

@keyframes herdr-status-spin {
  from {
    rotate: 0deg;
  }
  to {
    rotate: 360deg;
  }
}

.ShellSidebarHerdr-StatusText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellSidebarHerdr-Badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 112px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-size: 11px;
  line-height: 1;

  > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ShellSidebarHerdr-BadgeIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 11px;
}

.ShellSidebarHerdr-Message {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellSidebarHerdr-Progress {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--tx-fill-color-dark);
}

.ShellSidebarHerdr-ProgressFill {
  height: 100%;
  border-radius: 999px;
  background: var(--tx-color-primary);
  transition: width 180ms ease;

  &.is-blocked {
    background: var(--tx-color-warning);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
</style>

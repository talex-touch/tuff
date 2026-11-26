<script lang="ts" name="ShellHerdrConversationView" setup>
import type {
  HerdrOscState,
  HerdrProjectedConversation,
  HerdrProjectedProvider,
  HerdrProjectedToolCall
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { herdrConversationRoute } from '../../../../shared/app-surface-routes'
import { useHerdrRuntime } from '~/modules/herdr/useHerdrRuntime'
import { vTdsLiveAnimation } from '~/modules/style/live-animation-clock'

const props = defineProps<{
  address: string
}>()

const emit = defineEmits<{
  (e: 'switch-terminal'): void
}>()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const herdr = useHerdrRuntime()

const markdownLabels = computed(() => ({
  blockedImageText: t('home.image.blocked'),
  loadImageOnceText: t('home.image.loadOnce'),
  allowSessionImagesText: t('home.image.allowSession'),
  copyTableText: t('home.table.copyTable'),
  copiedTableText: t('home.table.copiedTable'),
  codePreviewText: t('home.code.preview'),
  codeSourceText: t('home.code.source'),
  codeFrameLabelFormatter: (lang: string) => t('home.code.frameLabel', { lang }),
  copyCodeText: t('home.copy'),
  copiedCodeText: t('home.copied'),
  runCodeText: t('home.code.run'),
  ranCodeText: t('home.code.ran'),
  runCodeTitle: t('home.code.runInTerminal'),
  diagramZoomLabel: t('home.diagram.zoom'),
  diagramPreviewLabel: t('home.diagram.preview'),
  diagramCloseLabel: t('home.diagram.close'),
  diagramDownloadLabel: t('home.diagram.download'),
  diagramCopyFailedText: t('home.diagram.copyFailed'),
  diagramErrorText: t('home.diagram.failed')
}))

function handleOpenInMainStage(): void {
  if (!props.address) return
  void router.push(herdrConversationRoute(props.address))
}

const timelineRef = ref<HTMLDivElement | null>(null)
const draft = ref('')
const sending = ref(false)
const interrupting = ref(false)
const refreshing = ref(false)
const expandedReasoning = reactive<Record<string, boolean>>({})
const expandedTools = reactive<Record<string, boolean>>({})

const PROVIDER_META: Record<HerdrProjectedProvider, { label: string; icon: string }> = {
  claude: { label: 'Claude Code', icon: 'i-simple-icons-claude' },
  codex: { label: 'Codex', icon: 'i-simple-icons-openai' },
  pi: { label: 'Pi', icon: 'i-simple-icons-pi' },
  'oh-my-pi': { label: 'OMP', icon: 'i-simple-icons-pi' }
}

const session = computed(() => herdr.sessionByAddress.value.get(props.address) ?? null)
const projection = computed<HerdrProjectedConversation | null>(
  () => herdr.projectionsByAddress[props.address] ?? null
)
const isLoadingProjection = computed(
  () => herdr.projectionLoadingByAddress[props.address] === true && projection.value === null
)

const oscState = computed<HerdrOscState>(() => session.value?.status?.state ?? 'idle')
const isBlocked = computed(() => oscState.value === 'blocked')
const isWorking = computed(() => oscState.value === 'working')
const isLive = computed(() => (session.value?.state ?? 'live') === 'live')

const providerBadge = computed<{ label: string; icon: string }>(() => {
  const fromProjection = projection.value?.provider
  if (fromProjection && Object.hasOwn(PROVIDER_META, fromProjection)) {
    return PROVIDER_META[fromProjection]
  }
  const candidates = [
    session.value?.status?.app,
    session.value?.foregroundName,
    session.value?.argv?.[0]
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const token = raw.trim().toLowerCase().split('/').pop() ?? ''
    if (token.includes('claude')) return PROVIDER_META.claude
    if (token.includes('codex')) return PROVIDER_META.codex
    if (token === 'omp' || token.includes('oh-my-pi')) return PROVIDER_META['oh-my-pi']
    if (token === 'pi') return PROVIDER_META.pi
  }
  return {
    label: t('herdr.conversation.providerShell'),
    icon: 'i-ri-terminal-box-line'
  }
})

const statusLabel = computed(() => {
  const base = t(`herdr.status.${oscState.value}`)
  if (oscState.value === 'blocked' && session.value?.status?.kind) {
    return `${base} · ${t(`herdr.blockedKind.${session.value.status.kind}`)}`
  }
  return base
})

const statusIcon = computed(() => {
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

const hasProgress = computed(() => {
  const value = session.value?.status?.progress
  return typeof value === 'number' && Number.isFinite(value)
})

const clampedProgress = computed(() => {
  const value = session.value?.status?.progress
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
})

const blockedDescription = computed(() => {
  const msg = session.value?.status?.msg?.trim()
  if (msg) return msg
  const kind = session.value?.status?.kind
  if (kind) {
    return t(`herdr.conversation.blockedHint.${kind}`)
  }
  return t('herdr.conversation.blockedHint.generic')
})

const effectiveCwd = computed(() => session.value?.foregroundCwd || session.value?.cwd || '')

const effectiveProcess = computed(
  () =>
    session.value?.appName ||
    session.value?.status?.app ||
    session.value?.foregroundName ||
    session.value?.argv?.[0] ||
    props.address
)

function toolStatusIcon(status: HerdrProjectedToolCall['status']): string {
  switch (status) {
    case 'running':
      return 'i-ri-loader-4-line is-spin'
    case 'failed':
      return 'i-ri-error-warning-line'
    default:
      return 'i-ri-check-line'
  }
}

function hasToolDetails(tool: HerdrProjectedToolCall): boolean {
  return Boolean(tool.argsPreview?.trim() || tool.outputPreview?.trim())
}

function toggleReasoning(messageId: string): void {
  expandedReasoning[messageId] = !expandedReasoning[messageId]
}

function toggleTool(toolId: string): void {
  expandedTools[toolId] = !expandedTools[toolId]
}

function formatMessageTime(timestamp: number | null): string {
  if (!timestamp) return ''
  try {
    return new Date(timestamp).toLocaleTimeString(locale.value, {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

function scrollToBottom(): void {
  const el = timelineRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

async function ensureWatching(address: string): Promise<void> {
  if (!address) return
  if (!herdr.isWatchingProjection(address)) {
    await herdr.watchProjection(address)
  }
}

async function handleRefresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await herdr.refreshProjection(props.address)
  } finally {
    refreshing.value = false
  }
}

async function handleSend(): Promise<void> {
  const text = draft.value.trim()
  if (!text || sending.value || !isLive.value) return
  sending.value = true
  try {
    await herdr.send(props.address, text)
    draft.value = ''
  } catch {
    toast.error(t('herdr.actions.sendFailed'))
  } finally {
    sending.value = false
  }
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void handleSend()
  }
}

async function handleInterrupt(): Promise<void> {
  if (interrupting.value) return
  interrupting.value = true
  try {
    await herdr.interrupt(props.address)
  } catch {
    toast.error(t('herdr.actions.interruptFailed'))
  } finally {
    interrupting.value = false
  }
}

watch(
  () => props.address,
  (nextAddress) => {
    void ensureWatching(nextAddress)
  }
)

watch(
  () => projection.value?.messages.length ?? 0,
  () => {
    void nextTick(scrollToBottom)
  }
)

onMounted(() => {
  void ensureWatching(props.address)
  void nextTick(scrollToBottom)
})

onBeforeUnmount(() => {
  const stillOpenInDrawer = herdr.drawerTabs.value.some(
    (tab) => tab.kind === 'herdr' && tab.address === props.address
  )
  const openInMainStage = route.path === herdrConversationRoute(props.address)
  if (!stillOpenInDrawer && !openInMainStage) {
    void herdr.unwatchProjection(props.address)
  }
})
</script>

<template>
  <div class="ShellHerdrConv" data-testid="herdr-conversation-view">
    <!-- Header strip -->
    <header class="ShellHerdrConv-Header">
      <div class="ShellHerdrConv-HeaderMeta">
        <span class="ShellHerdrConv-ProviderBadge" data-testid="herdr-conv-provider">
          <span class="ShellHerdrConv-BadgeIcon" :class="providerBadge.icon" aria-hidden="true" />
          <span>{{ providerBadge.label }}</span>
        </span>

        <span
          class="ShellHerdrConv-StatusPill"
          :class="`is-${oscState}`"
          role="status"
          aria-live="polite"
          data-testid="herdr-conv-status-pill"
        >
          <span
            v-tds-live-animation="oscState === 'working' ? 'spin' : false"
            class="ShellHerdrConv-StatusIcon"
            :class="statusIcon"
            aria-hidden="true"
          />
          <span>{{ statusLabel }}</span>
        </span>

        <span
          v-if="session && session.turn > 0"
          class="ShellHerdrConv-MetaChip"
          data-testid="herdr-conv-turn"
        >
          {{ t('herdr.conversation.turnCount', { turn: session.turn }) }}
        </span>

        <span
          v-if="session?.machine"
          class="ShellHerdrConv-MetaChip"
          data-testid="herdr-conv-remote"
        >
          <span class="i-ri-server-line ShellHerdrConv-BadgeIcon" aria-hidden="true" />
          <span>{{ session.machine }}</span>
        </span>

        <span
          v-if="session?.projectName"
          class="ShellHerdrConv-MetaChip"
          data-testid="herdr-conv-project"
        >
          <span class="i-ri-folder-2-line ShellHerdrConv-BadgeIcon" aria-hidden="true" />
          <span>{{ session.projectName }}</span>
        </span>
      </div>

      <div class="ShellHerdrConv-HeaderActions">
        <button
          type="button"
          class="ShellHerdrConv-IconBtn"
          :title="t('herdr.stage.openInMainStage')"
          :aria-label="t('herdr.stage.openInMainStage')"
          data-testid="herdr-conv-open-stage"
          @click="handleOpenInMainStage"
        >
          <span class="i-ri-external-link-line" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="ShellHerdrConv-IconBtn"
          :disabled="refreshing"
          :title="t('herdr.conversation.refresh')"
          :aria-label="t('herdr.conversation.refresh')"
          data-testid="herdr-conv-refresh"
          @click="handleRefresh"
        >
          <span
            v-tds-live-animation="refreshing ? 'spin' : false"
            class="i-ri-refresh-line"
            :class="{ 'is-spin': refreshing }"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>

    <div
      v-if="hasProgress"
      class="ShellHerdrConv-Progress"
      role="progressbar"
      :aria-valuenow="clampedProgress"
      aria-valuemin="0"
      aria-valuemax="100"
      data-testid="herdr-conv-progress"
    >
      <div
        class="ShellHerdrConv-ProgressFill"
        :class="{ 'is-blocked': isBlocked }"
        :style="{ width: `${clampedProgress}%` }"
      />
    </div>

    <!-- Prominent amber Blocked Action Banner -->
    <div
      v-if="isBlocked"
      class="ShellHerdrConv-BlockedBanner"
      role="status"
      aria-live="polite"
      data-testid="herdr-conv-blocked-banner"
    >
      <div class="ShellHerdrConv-BlockedContent">
        <span class="i-ri-alert-line ShellHerdrConv-BlockedIcon" aria-hidden="true" />
        <div class="ShellHerdrConv-BlockedText">
          <span class="ShellHerdrConv-BlockedTitle">{{ statusLabel }}</span>
          <span class="ShellHerdrConv-BlockedDesc">{{ blockedDescription }}</span>
        </div>
      </div>

      <TxButton
        size="sm"
        variant="warning"
        data-testid="herdr-conv-takeover-btn"
        @click="emit('switch-terminal')"
      >
        {{ t('herdr.conversation.takeOverTerminal') }}
      </TxButton>
    </div>

    <!-- Main timeline or graceful non-JSONL view -->
    <div ref="timelineRef" class="ShellHerdrConv-Body">
      <div
        v-if="isLoadingProjection"
        class="ShellHerdrConv-Skeleton"
        data-testid="herdr-conv-skeleton"
      >
        <TxRowSkeleton :rows="3" leading description title-width="48%" desc-width="76%" />
      </div>

      <div
        v-else-if="projection && !projection.available"
        class="ShellHerdrConv-NonJsonl"
        data-testid="herdr-conv-non-jsonl"
      >
        <div class="ShellHerdrConv-NonJsonlHead">
          <span class="i-ri-terminal-box-line ShellHerdrConv-NonJsonlIcon" aria-hidden="true" />
          <div class="ShellHerdrConv-NonJsonlHeading">
            <h4 class="ShellHerdrConv-NonJsonlTitle">
              {{ t('herdr.conversation.nonJsonlTitle') }}
            </h4>
            <p class="ShellHerdrConv-NonJsonlDesc">
              {{ t('herdr.conversation.nonJsonlDesc') }}
            </p>
          </div>
          <TxButton
            size="sm"
            variant="primary"
            data-testid="herdr-conv-open-terminal-btn"
            @click="emit('switch-terminal')"
          >
            {{ t('herdr.conversation.openRawTerminal') }}
          </TxButton>
        </div>

        <dl class="ShellHerdrConv-StatusGrid">
          <div class="ShellHerdrConv-StatusItem">
            <dt>{{ t('herdr.conversation.metaProcess') }}</dt>
            <dd>
              <code>{{ effectiveProcess }}</code>
            </dd>
          </div>
          <div class="ShellHerdrConv-StatusItem">
            <dt>{{ t('herdr.conversation.metaState') }}</dt>
            <dd>
              {{
                isLive ? t('herdr.conversation.stateLive') : t('herdr.conversation.stateFinished')
              }}
            </dd>
          </div>
          <div
            v-if="effectiveCwd"
            class="ShellHerdrConv-StatusItem ShellHerdrConv-StatusItem--wide"
          >
            <dt>{{ t('herdr.conversation.metaCwd') }}</dt>
            <dd>
              <code>{{ effectiveCwd }}</code>
            </dd>
          </div>
        </dl>
      </div>

      <div
        v-else-if="projection && projection.available"
        class="ShellHerdrConv-Timeline"
        data-testid="herdr-conv-timeline"
      >
        <p
          v-if="projection.truncated"
          class="ShellHerdrConv-Truncated"
          data-testid="herdr-conv-truncated"
        >
          <span class="i-ri-history-line" aria-hidden="true" />
          <span>{{ t('herdr.conversation.truncatedNotice') }}</span>
        </p>

        <p
          v-if="projection.messages.length === 0"
          class="ShellHerdrConv-Empty"
          data-testid="herdr-conv-empty"
        >
          {{ t('herdr.conversation.noMessages') }}
        </p>

        <article
          v-for="msg in projection.messages"
          :key="msg.id"
          class="ShellHerdrConv-Message"
          :class="`is-${msg.role}`"
          data-testid="herdr-conv-message"
        >
          <div class="ShellHerdrConv-MessageHead">
            <span class="ShellHerdrConv-RoleLabel">
              {{ t(`herdr.conversation.role.${msg.role}`) }}
            </span>
            <span v-if="formatMessageTime(msg.timestamp)" class="ShellHerdrConv-Time">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <div v-if="msg.reasoning" class="ShellHerdrConv-Reasoning">
            <button
              type="button"
              class="ShellHerdrConv-ReasoningToggle"
              :aria-expanded="Boolean(expandedReasoning[msg.id])"
              data-testid="herdr-conv-reasoning-toggle"
              @click="toggleReasoning(msg.id)"
            >
              <span
                :class="
                  expandedReasoning[msg.id] ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'
                "
                aria-hidden="true"
              />
              <span>{{ t('herdr.conversation.reasoning') }}</span>
            </button>
            <pre
              v-if="expandedReasoning[msg.id]"
              class="ShellHerdrConv-ReasoningBody"
              data-testid="herdr-conv-reasoning-body"
              >{{ msg.reasoning }}</pre
            >
          </div>

          <TxStreamMarkdown
            v-if="msg.text && msg.role === 'assistant'"
            class="ShellHerdrConv-MessageMarkdown"
            :content="msg.text"
            :streaming="false"
            v-bind="markdownLabels"
          />
          <p v-else-if="msg.text" class="ShellHerdrConv-MessageText">{{ msg.text }}</p>

          <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="ShellHerdrConv-Tools">
            <div
              v-for="tool in msg.toolCalls"
              :key="tool.id"
              class="ShellHerdrConv-ToolCard"
              :class="`is-${tool.status}`"
              data-testid="herdr-conv-tool-card"
            >
              <button
                type="button"
                class="ShellHerdrConv-ToolChip"
                :disabled="!hasToolDetails(tool)"
                :aria-expanded="hasToolDetails(tool) ? Boolean(expandedTools[tool.id]) : undefined"
                data-testid="herdr-conv-tool-chip"
                @click="hasToolDetails(tool) && toggleTool(tool.id)"
              >
                <span
                  v-tds-live-animation="tool.status === 'running' ? 'spin' : false"
                  class="ShellHerdrConv-ToolIcon"
                  :class="toolStatusIcon(tool.status)"
                  aria-hidden="true"
                />
                <span class="ShellHerdrConv-ToolName">{{ tool.name }}</span>
                <span class="ShellHerdrConv-ToolState">
                  {{ t(`herdr.conversation.toolStatus.${tool.status}`) }}
                </span>
                <span
                  v-if="hasToolDetails(tool)"
                  class="ShellHerdrConv-ToolChevron"
                  :class="
                    expandedTools[tool.id] ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'
                  "
                  aria-hidden="true"
                />
              </button>

              <div
                v-if="expandedTools[tool.id] && hasToolDetails(tool)"
                class="ShellHerdrConv-ToolDetail"
                data-testid="herdr-conv-tool-detail"
              >
                <div v-if="tool.argsPreview" class="ShellHerdrConv-ToolBlock">
                  <span class="ShellHerdrConv-ToolBlockLabel">
                    {{ t('herdr.conversation.toolArgs') }}
                  </span>
                  <pre class="ShellHerdrConv-CodePre">{{ tool.argsPreview }}</pre>
                </div>
                <div v-if="tool.outputPreview" class="ShellHerdrConv-ToolBlock">
                  <span class="ShellHerdrConv-ToolBlockLabel">
                    {{ t('herdr.conversation.toolOutput') }}
                  </span>
                  <pre class="ShellHerdrConv-CodePre">{{ tool.outputPreview }}</pre>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Bottom native composer -->
    <form class="ShellHerdrConv-Composer" @submit.prevent="handleSend">
      <textarea
        v-model="draft"
        class="ShellHerdrConv-Input"
        rows="1"
        :disabled="!isLive || sending"
        :placeholder="t('herdr.actions.sendPlaceholder')"
        :aria-label="t('herdr.actions.sendPlaceholder')"
        data-testid="herdr-conv-composer-input"
        @keydown="handleComposerKeydown"
      />

      <div class="ShellHerdrConv-ComposerActions">
        <TxButton
          v-if="isWorking"
          native-type="button"
          size="sm"
          variant="warning"
          :loading="interrupting"
          data-testid="herdr-conv-stop-btn"
          @click="handleInterrupt"
        >
          {{ t('herdr.actions.interrupt') }}
        </TxButton>

        <TxButton
          native-type="submit"
          size="sm"
          variant="primary"
          :loading="sending"
          :disabled="!isLive || !draft.trim()"
          data-testid="herdr-conv-send-btn"
        >
          {{ t('herdr.actions.sendSubmit') }}
        </TxButton>
      </div>
    </form>
  </div>
</template>

<style lang="scss" scoped>
.ShellHerdrConv {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
}

.ShellHerdrConv-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-fill-color-lighter);
  flex-shrink: 0;
}

.ShellHerdrConv-HeaderMeta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ShellHerdrConv-ProviderBadge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  font-size: 12px;
  font-weight: 500;
}

.ShellHerdrConv-BadgeIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
}

.ShellHerdrConv-StatusPill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
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

.ShellHerdrConv-StatusIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;

  &.is-idle-dot {
    font-size: 7px;
  }
}

.ShellHerdrConv-MetaChip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-size: 11px;
}

.ShellHerdrConv-HeaderActions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.ShellHerdrConv-IconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-regular);
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
    opacity: 0.45;
    cursor: default;
  }
}

.ShellHerdrConv-Progress {
  width: 100%;
  height: 3px;
  background: var(--tx-fill-color-dark);
  flex-shrink: 0;
}

.ShellHerdrConv-ProgressFill {
  height: 100%;
  background: var(--tx-color-primary);
  transition: width 180ms ease;

  &.is-blocked {
    background: var(--tx-color-warning);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.ShellHerdrConv-BlockedBanner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: var(--tx-color-warning-light-9);
  border-bottom: 1px solid var(--tx-color-warning);
  color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-text-color-primary));
  flex-shrink: 0;
}

.ShellHerdrConv-BlockedContent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.ShellHerdrConv-BlockedIcon {
  display: inline-flex;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 15px;
}

.ShellHerdrConv-BlockedText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ShellHerdrConv-BlockedTitle {
  font-size: 13px;
  font-weight: 600;
}

.ShellHerdrConv-BlockedDesc {
  font-size: 12px;
  text-wrap: pretty;
}

.ShellHerdrConv-Body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
  box-sizing: border-box;
  scrollbar-width: thin;
}

.ShellHerdrConv-Skeleton {
  --tx-skeleton-row-padding-block: 8px;
  --tx-skeleton-row-padding-inline: 4px;
}

.ShellHerdrConv-NonJsonl {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}

.ShellHerdrConv-NonJsonlHead {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ShellHerdrConv-NonJsonlIcon {
  display: inline-flex;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 16px;
  color: var(--tx-text-color-regular);
}

.ShellHerdrConv-NonJsonlHeading {
  flex: 1 1 auto;
  min-width: 0;
}

.ShellHerdrConv-NonJsonlTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.ShellHerdrConv-NonJsonlDesc {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  text-wrap: pretty;
}

.ShellHerdrConv-StatusGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;
}

.ShellHerdrConv-StatusItem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  dt {
    font-size: 11px;
    color: var(--tx-text-color-secondary);
  }

  dd {
    margin: 0;
    font-size: 13px;
    color: var(--tx-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    code {
      font-size: 0.9em;
    }
  }
}

.ShellHerdrConv-StatusItem--wide {
  grid-column: 1 / -1;
}

.ShellHerdrConv-Timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ShellHerdrConv-Truncated {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: center;
  margin: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.ShellHerdrConv-Empty {
  margin: 12px 0;
  text-align: center;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.ShellHerdrConv-Message {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);

  &.is-user {
    background: var(--tx-color-primary-light-9);
    box-shadow: inset 0 0 0 1px var(--tx-border-color);
  }
}

.ShellHerdrConv-MessageHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ShellHerdrConv-RoleLabel {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-regular);
}

.ShellHerdrConv-Time {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.ShellHerdrConv-MessageText {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tx-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
  text-wrap: pretty;
}

.ShellHerdrConv-Reasoning {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ShellHerdrConv-ReasoningToggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  height: 22px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-dark);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.ShellHerdrConv-ReasoningBody {
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.ShellHerdrConv-Tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ShellHerdrConv-ToolCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
}

.ShellHerdrConv-ToolChip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-regular);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  font-family: inherit;
  font-size: 12px;
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
    cursor: default;
  }

  .is-running & {
    background: var(--tx-color-primary-light-9);
    color: color-mix(in srgb, var(--tx-color-primary) 50%, var(--tx-text-color-primary));
  }

  .is-completed & {
    background: var(--tx-color-success-light-9);
    color: color-mix(in srgb, var(--tx-color-success) 45%, var(--tx-text-color-primary));
  }

  .is-failed & {
    background: var(--tx-color-danger-light-9);
    color: color-mix(in srgb, var(--tx-color-danger) 55%, var(--tx-text-color-primary));
  }
}

.ShellHerdrConv-ToolIcon,
.ShellHerdrConv-ToolChevron {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
}

.ShellHerdrConv-ToolName {
  font-weight: 500;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ShellHerdrConv-ToolState {
  font-size: 11px;
  opacity: 0.85;
}

.ShellHerdrConv-ToolDetail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.ShellHerdrConv-ToolBlock {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ShellHerdrConv-ToolBlockLabel {
  font-size: 11px;
  font-weight: 500;
  color: var(--tx-text-color-secondary);
}

.ShellHerdrConv-CodePre {
  margin: 0;
  font-size: 0.9em;
  line-height: 1.4;
  color: var(--tx-text-color-regular);
  white-space: pre-wrap;
  word-break: break-word;
}

.ShellHerdrConv-Composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-fill-color-lighter);
  flex-shrink: 0;
}

.ShellHerdrConv-Input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 32px;
  max-height: 88px;
  padding: 6px 10px;
  box-sizing: border-box;
  border: none;
  border-radius: 8px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  resize: none;

  &::placeholder {
    color: var(--tx-text-color-placeholder);
  }

  &:focus-visible {
    outline: none;
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary),
      0 0 0 3px var(--tx-color-primary-light-9);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ShellHerdrConv-ComposerActions {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
}

.is-spin {
  @media (prefers-reduced-motion: no-preference) {
    animation: herdr-conv-spin 1080ms steps(12, end) infinite;
  }
}

html[data-live-anim-clock='active'] .is-spin,
html.tds-reduced-motion .is-spin,
html[data-live-anim-state='suppressed'] .is-spin {
  animation: none;
}

html.is-window-moving .is-spin,
html[data-live-anim-state='paused'] .is-spin {
  animation-play-state: paused;
}

@keyframes herdr-conv-spin {
  from {
    rotate: 0deg;
  }
  to {
    rotate: 360deg;
  }
}
</style>

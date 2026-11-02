<script lang="ts" name="HomePreviewActivity" setup>
import type { WorkspacePendingRun } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type {
  ActivityGatewayApproval,
  ActivityTool,
  ActivityTurn
} from '~/modules/conversation/workspace-activity'
import { computed, ref } from 'vue'
import {
  INTERRUPTED_TOOL_CALL_ERROR,
  describeToolCallError
} from '@talex-touch/intelligence-uikit/utils'
import { isStoppedTurn } from '~/modules/conversation/useTurnFailureWording'
import { useI18n } from 'vue-i18n'
import HomePreviewEmpty from './HomePreviewEmpty.vue'

/**
 * The conversation's work, turn by turn: each reply's terminal state and the tools it called, plus
 * whatever Main is waiting on right now.
 *
 * The two approval kinds stay visibly different — a tool request (gateway, keyed by request id) and
 * an agent run (orchestrator, keyed by run id) — and a tool request that Main did not attribute to
 * this conversation is labelled as external or as another conversation's, never as this one's.
 * Deciding happens on the cards in the composer stack; this tab only reports.
 */
const props = defineProps<{
  turns: ActivityTurn[]
  gateway: ActivityGatewayApproval[]
  run?: WorkspacePendingRun
  loading: boolean
}>()

defineEmits<{ (event: 'locate', messageIndex: number): void }>()

const { t } = useI18n()

function toolErrorText(error: string): string {
  return error === INTERRUPTED_TOOL_CALL_ERROR
    ? t('home.toolInterrupted')
    : describeToolCallError(error, t)
}

/** Main stores a reply the reader or the app stopped as failed; the row says it stopped. */
function turnState(turn: ActivityTurn): string {
  return turn.status === 'failed' && isStoppedTurn(turn.error) ? 'stopped' : turn.status
}

const TOOL_ICON: Record<ActivityTool['status'], string> = {
  pending: 'i-ri-time-line',
  running: 'i-ri-loader-4-line',
  done: 'i-ri-check-line',
  error: 'i-ri-error-warning-line'
}

const TURN_ICON: Record<ActivityTurn['status'], string> = {
  streaming: 'i-ri-loader-4-line',
  complete: 'i-ri-chat-check-line',
  failed: 'i-ri-error-warning-line'
}
const ordered = computed(() => [...props.turns].reverse())
const hasPending = computed(() => props.gateway.length > 0 || Boolean(props.run))

type JsonTab = 'request' | 'response' | 'all'
const expandedJsonTurns = ref<Set<string>>(new Set())
const copiedJsonTurns = ref<Set<string>>(new Set())
const activeJsonTabs = ref<Record<string, JsonTab>>({})

function toggleJson(messageId: string): void {
  if (expandedJsonTurns.value.has(messageId)) {
    expandedJsonTurns.value.delete(messageId)
  } else {
    expandedJsonTurns.value.add(messageId)
  }
}

function setJsonTab(messageId: string, tab: JsonTab): void {
  activeJsonTabs.value[messageId] = tab
}

function getJsonToDisplay(turn: ActivityTurn): string {
  const tab = activeJsonTabs.value[turn.messageId] ?? 'request'
  if (tab === 'request')
    return JSON.stringify(turn.request ?? turn.rawPayload?.request ?? turn.rawPayload, null, 2)
  if (tab === 'response')
    return JSON.stringify(turn.response ?? turn.rawPayload?.response ?? turn.rawPayload, null, 2)
  return JSON.stringify(turn.rawPayload, null, 2)
}

async function copyJson(turn: ActivityTurn): Promise<void> {
  try {
    const text = getJsonToDisplay(turn)
    await navigator.clipboard.writeText(text)
    copiedJsonTurns.value.add(turn.messageId)
    setTimeout(() => {
      copiedJsonTurns.value.delete(turn.messageId)
    }, 2000)
  } catch {
    // ignore
  }
}

function formatLatency(ms?: number): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
function formatTokens(count?: number): string {
  if (count === undefined || count === null || !Number.isFinite(count)) return ''
  if (count < 1000) return `${count}`
  return `${(count / 1000).toFixed(1)}k`
}

function contextBadgeText(turn: ActivityTurn): string {
  const count = turn.request?.contextMessagesCount ?? turn.request?.contextMessages?.length ?? 0
  const tokens = turn.request?.contextTokens ?? turn.tokens?.prompt
  if (tokens) {
    return t('home.workspace.activity.contextUsage', { count, tokens: formatTokens(tokens) })
  }
  return t('home.workspace.activity.contextCount', { count })
}

function contextBadgeTitle(turn: ActivityTurn): string {
  const count = turn.request?.contextMessagesCount ?? turn.request?.contextMessages?.length ?? 0
  const tokens = turn.request?.contextTokens ?? turn.tokens?.prompt ?? 0
  const chars = turn.request?.contextCharacters ?? 0
  return t('home.workspace.activity.contextUsageDetail', { count, tokens, chars })
}
</script>

<template>
  <div class="HomePreviewActivity" :aria-busy="loading || undefined">
    <section
      v-if="hasPending"
      class="HomePreviewActivity-Pending"
      :aria-label="t('home.workspace.activity.waiting')"
    >
      <h3 class="HomePreview-GroupLabel">{{ t('home.workspace.activity.waiting') }}</h3>
      <div v-if="run" class="HomePreviewActivity-Approval">
        <span class="i-ri-shield-user-line HomePreviewActivity-ApprovalIcon" aria-hidden="true" />
        <span class="HomePreviewActivity-Text">
          <span class="HomePreview-Name">{{ t('home.workspace.activity.runApproval') }}</span>
          <span class="HomePreview-Detail" :title="run.runId">
            {{ t('home.workspace.activity.runId', { id: run.runId }) }}
          </span>
        </span>
      </div>
      <div v-for="request in gateway" :key="request.requestId" class="HomePreviewActivity-Approval">
        <span class="i-ri-tools-line HomePreviewActivity-ApprovalIcon" aria-hidden="true" />
        <span class="HomePreviewActivity-Text">
          <span class="HomePreview-Name">{{ request.tool }}</span>
          <span class="HomePreview-Detail">
            {{ t(`home.workspace.gateway.origin.${request.origin}`) }} ·
            {{ t(`home.workspace.gateway.risk.${request.risk}`) }}
          </span>
        </span>
      </div>
    </section>

    <HomePreviewEmpty
      v-if="!loading && turns.length === 0"
      icon="i-ri-terminal-box-line"
      :text="t('home.workspace.activity.empty')"
    />

    <ol class="HomePreviewActivity-Turns">
      <li v-for="turn in ordered" :key="turn.messageId" class="HomePreviewActivity-Turn">
        <div class="HomePreviewActivity-TurnCard">
          <button
            class="HomePreviewActivity-TurnHead"
            :class="`is-${turn.status}`"
            type="button"
            :title="t('home.preview.locate')"
            @click="$emit('locate', turn.messageIndex)"
          >
            <span
              :class="TURN_ICON[turn.status]"
              class="HomePreviewActivity-Icon"
              aria-hidden="true"
            />
            <span class="HomePreviewActivity-HeadTitle">
              <span class="HomePreview-Name">{{
                t(`home.workspace.activity.turn.${turnState(turn)}`)
              }}</span>
              <span v-if="turn.latencyMs" class="HomePreviewActivity-Latency">
                {{ formatLatency(turn.latencyMs) }}
              </span>
            </span>
          </button>

          <!-- 上下文提问摘要与请求附件 -->
          <div
            v-if="turn.userPrompt || turn.request?.attachments?.length || turn.request?.voice"
            class="HomePreviewActivity-Query"
            :title="turn.userPrompt"
            @click="$emit('locate', turn.messageIndex)"
          >
            <div v-if="turn.userPrompt" class="HomePreviewActivity-QueryMain">
              <span class="i-ri-chat-1-line HomePreviewActivity-QueryIcon" aria-hidden="true" />
              <span class="HomePreviewActivity-QueryText">{{ turn.userPrompt }}</span>
            </div>
            <div
              v-if="turn.request?.attachments?.length || turn.request?.voice"
              class="HomePreviewActivity-QueryAttachments"
            >
              <span
                v-for="(att, attIdx) in turn.request.attachments"
                :key="attIdx"
                class="HomePreviewActivity-AttachmentTag"
                :title="att.name"
              >
                <span
                  :class="att.kind === 'image' ? 'i-ri-image-line' : 'i-ri-attachment-line'"
                  aria-hidden="true"
                />
                <span>{{ att.name || t('home.workspace.activity.attachment') }}</span>
              </span>
              <span v-if="turn.request.voice" class="HomePreviewActivity-AttachmentTag is-voice">
                <span class="i-ri-mic-line" aria-hidden="true" />
                <span>{{ t('home.workspace.activity.voiceClip') }}</span>
              </span>
            </div>
          </div>

          <!-- 调度器与模型元数据信息徽标 -->
          <div class="HomePreviewActivity-MetaBadges">
            <span
              v-if="turn.coordinator"
              class="HomePreviewActivity-Badge"
              :title="t('home.workspace.activity.coordinator')"
            >
              <span class="i-ri-robot-2-line" aria-hidden="true" />
              <span>{{ turn.coordinator }}</span>
            </span>
            <span
              v-if="turn.model"
              class="HomePreviewActivity-Badge is-model"
              :title="t('home.panel.model')"
            >
              <span class="i-ri-sparkling-line" aria-hidden="true" />
              <span>{{ turn.model }}</span>
            </span>
            <span
              v-if="turn.tokens?.total"
              class="HomePreviewActivity-Badge"
              :title="`输入: ${turn.tokens.prompt ?? 0} · 输出: ${turn.tokens.completion ?? 0}`"
            >
              <span class="i-ri-database-2-line" aria-hidden="true" />
              <span>{{ turn.tokens.total }} tokens</span>
            </span>
            <!-- 首字响应时间 (TTFT) -->
            <span
              v-if="turn.ttftMs"
              class="HomePreviewActivity-Badge is-ttft"
              :title="t('home.workspace.activity.ttftTitle', { time: formatLatency(turn.ttftMs) })"
            >
              <span class="i-ri-speed-line" aria-hidden="true" />
              <span>{{
                t('home.workspace.activity.ttft', { time: formatLatency(turn.ttftMs) })
              }}</span>
            </span>

            <!-- 上下文消息与占用规模 -->
            <span
              v-if="
                turn.request?.contextMessages?.length ||
                turn.request?.contextTokens ||
                turn.tokens?.prompt
              "
              class="HomePreviewActivity-Badge is-context"
              :title="contextBadgeTitle(turn)"
            >
              <span class="i-ri-chat-history-line" aria-hidden="true" />
              <span>{{ contextBadgeText(turn) }}</span>
            </span>
          </div>

          <!-- 工具执行列表 -->
          <ul v-if="turn.tools.length" class="HomePreviewActivity-Tools">
            <li v-for="tool in turn.tools" :key="tool.key">
              <button
                class="HomePreviewActivity-Tool"
                :class="`is-${tool.status}`"
                type="button"
                :title="t('home.preview.locate')"
                @click="$emit('locate', turn.messageIndex)"
              >
                <span
                  :class="TOOL_ICON[tool.status]"
                  class="HomePreviewActivity-Icon"
                  aria-hidden="true"
                />
                <span class="HomePreviewActivity-Text">
                  <span class="HomePreview-Name">{{ tool.name }}</span>
                  <span v-if="tool.error" class="HomePreviewActivity-Error">{{
                    toolErrorText(tool.error)
                  }}</span>
                  <span v-else-if="tool.summary" class="HomePreview-Detail">{{
                    tool.summary
                  }}</span>
                </span>
              </button>
            </li>
          </ul>

          <!-- 查看与复制 JSON 操作 -->
          <div class="HomePreviewActivity-Actions">
            <button
              class="HomePreviewActivity-ActionBtn"
              type="button"
              @click="toggleJson(turn.messageId)"
            >
              <span
                :class="
                  expandedJsonTurns.has(turn.messageId)
                    ? 'i-ri-arrow-down-s-line'
                    : 'i-ri-arrow-right-s-line'
                "
                aria-hidden="true"
              />
              <span>{{
                expandedJsonTurns.has(turn.messageId)
                  ? t('home.workspace.activity.hideJson')
                  : t('home.workspace.activity.json')
              }}</span>
            </button>
            <button
              v-if="expandedJsonTurns.has(turn.messageId)"
              class="HomePreviewActivity-ActionBtn is-copy"
              type="button"
              @click="copyJson(turn)"
            >
              <span
                :class="
                  copiedJsonTurns.has(turn.messageId) ? 'i-ri-check-line' : 'i-ri-file-copy-line'
                "
                aria-hidden="true"
              />
              <span>{{
                copiedJsonTurns.has(turn.messageId)
                  ? t('home.workspace.activity.copiedJson')
                  : t('home.workspace.activity.copyJson')
              }}</span>
            </button>
          </div>

          <!-- JSON 展开面板 -->
          <div v-if="expandedJsonTurns.has(turn.messageId)" class="HomePreviewActivity-JsonPanel">
            <!-- 切换 请求明细 / 响应明细 / 完整数据 -->
            <div class="HomePreviewActivity-JsonTabs">
              <button
                type="button"
                class="HomePreviewActivity-JsonTab"
                :class="{
                  'is-active': (activeJsonTabs[turn.messageId] ?? 'request') === 'request'
                }"
                @click="setJsonTab(turn.messageId, 'request')"
              >
                <span class="i-ri-upload-2-line" aria-hidden="true" />
                <span>{{ t('home.workspace.activity.requestTab') }}</span>
              </button>
              <button
                type="button"
                class="HomePreviewActivity-JsonTab"
                :class="{ 'is-active': activeJsonTabs[turn.messageId] === 'response' }"
                @click="setJsonTab(turn.messageId, 'response')"
              >
                <span class="i-ri-download-2-line" aria-hidden="true" />
                <span>{{ t('home.workspace.activity.responseTab') }}</span>
              </button>
              <button
                type="button"
                class="HomePreviewActivity-JsonTab"
                :class="{ 'is-active': activeJsonTabs[turn.messageId] === 'all' }"
                @click="setJsonTab(turn.messageId, 'all')"
              >
                <span class="i-ri-braces-line" aria-hidden="true" />
                <span>{{ t('home.workspace.activity.allTab') }}</span>
              </button>
            </div>
            <pre
              class="HomePreviewActivity-JsonCode"
            ><code>{{ getJsonToDisplay(turn) }}</code></pre>
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewActivity {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.HomePreviewActivity-Pending {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.HomePreviewActivity-Approval {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-warning-soft);
}

.HomePreviewActivity-ApprovalIcon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-warning);
  font-size: 14px;
}

.HomePreviewActivity-Turns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.HomePreviewActivity-Turn {
  display: flex;
  flex-direction: column;
}

.HomePreviewActivity-TurnCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface-1);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    border-color: var(--shell-border-hover, var(--shell-border));
  }
}

.HomePreviewActivity-TurnHead {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }

  &.is-failed .HomePreviewActivity-Icon,
  &.is-error .HomePreviewActivity-Icon {
    color: var(--shell-danger);
  }

  &.is-complete .HomePreviewActivity-Icon,
  &.is-done .HomePreviewActivity-Icon {
    color: var(--shell-primary);
  }
}

.HomePreviewActivity-HeadTitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.HomePreviewActivity-Latency {
  flex: none;
  padding: 1px 5px;
  border-radius: var(--shell-radius-xs);
  background: var(--shell-surface-2);
  color: var(--shell-primary);
  font-size: 11px;
  font-family: var(--shell-font-mono, monospace);
  font-weight: 500;
}

.HomePreviewActivity-Query {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px;
  border-radius: var(--shell-radius-xs);
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;

  &:hover {
    color: var(--shell-text);
  }
}

.HomePreviewActivity-QueryMain {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.HomePreviewActivity-QueryAttachments {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: 18px;
}

.HomePreviewActivity-AttachmentTag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 4px;
  border-radius: var(--shell-radius-xs);
  background: var(--shell-surface-3, rgba(0, 0, 0, 0.15));
  font-size: 10px;
  color: var(--shell-text-muted);

  &.is-voice {
    color: var(--shell-primary);
  }
}

.HomePreviewActivity-QueryIcon {
  flex: none;
  font-size: 12px;
}

.HomePreviewActivity-QueryText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomePreviewActivity-MetaBadges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.HomePreviewActivity-Badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: var(--shell-radius-xs);
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: 11px;
  line-height: 1.2;

  &.is-model {
    color: var(--shell-text);
    font-weight: 500;
  }
  &.is-ttft {
    color: var(--shell-primary);
    font-weight: 500;
  }

  &.is-context {
    color: var(--shell-text-muted);
  }

  span:first-child {
    font-size: 11px;
  }
}

.HomePreviewActivity-Tools {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 0 6px;
  padding: 0 0 0 6px;
  border-left: 2px solid var(--shell-border);
  list-style: none;
}

.HomePreviewActivity-Tool {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  padding: 3px 4px;
  border: none;
  border-radius: var(--shell-radius-xs);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-error .HomePreviewActivity-Icon {
    color: var(--shell-danger);
  }

  &.is-done .HomePreviewActivity-Icon {
    color: var(--shell-primary);
  }
}

.HomePreviewActivity-Actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 2px;
}

.HomePreviewActivity-ActionBtn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  border: none;
  border-radius: var(--shell-radius-xs);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text);
  }

  &.is-copy {
    color: var(--shell-primary);
  }
}

.HomePreviewActivity-JsonPanel {
  margin-top: 4px;
  padding: 6px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-3, rgba(0, 0, 0, 0.25));
  border: 1px solid var(--shell-border);
  max-height: 240px;
  overflow-y: auto;
}

.HomePreviewActivity-JsonTabs {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--shell-border);
}

.HomePreviewActivity-JsonTab {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-xs);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text);
  }

  &.is-active {
    background: var(--shell-primary-soft, rgba(100, 100, 255, 0.15));
    color: var(--shell-primary);
    font-weight: 500;
  }
}
.HomePreviewActivity-JsonCode {
  margin: 0;
  padding: 0;
  font-family: var(--shell-font-mono, monospace);
  font-size: 11px;
  line-height: 1.4;
  color: var(--shell-text-muted);
  white-space: pre-wrap;
  word-break: break-all;
}

.HomePreviewActivity-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-muted);
  font-size: 14px;
}

.is-streaming .HomePreviewActivity-Icon,
.is-running .HomePreviewActivity-Icon {
  animation: home-activity-spin 0.9s linear infinite;
}

@keyframes home-activity-spin {
  to {
    transform: rotate(360deg);
  }
}

.HomePreviewActivity-Text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomePreviewActivity-Error {
  color: var(--shell-danger);
  font-size: var(--shell-fs-caption);
  line-height: 1.4;
  word-break: break-word;
}

@media (prefers-reduced-motion: reduce) {
  .is-streaming .HomePreviewActivity-Icon,
  .is-running .HomePreviewActivity-Icon {
    animation: none;
  }
}
</style>

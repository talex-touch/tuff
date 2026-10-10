<script lang="ts" name="HomePreviewActivity" setup>
import type { WorkspacePendingRun } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type {
  ActivityGatewayApproval,
  ActivityTool,
  ActivityTurn
} from '~/modules/conversation/workspace-activity'
import { computed } from 'vue'
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
          <span class="HomePreviewActivity-Text">
            <span class="HomePreview-Name">{{
              t(`home.workspace.activity.turn.${turn.status}`)
            }}</span>
            <span v-if="turn.model || turn.errorCode" class="HomePreview-Detail">
              {{ turn.model }}<template v-if="turn.model && turn.errorCode"> · </template
              >{{ turn.errorCode }}
            </span>
          </span>
        </button>
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
                <span v-if="tool.error" class="HomePreviewActivity-Error">{{ tool.error }}</span>
                <span v-else-if="tool.summary" class="HomePreview-Detail">{{ tool.summary }}</span>
              </span>
            </button>
          </li>
        </ul>
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
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.HomePreviewActivity-Turn {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.HomePreviewActivity-TurnHead,
.HomePreviewActivity-Tool {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

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

.HomePreviewActivity-Tools {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 0 0 14px;
  padding: 0 0 0 8px;
  border-left: 1px solid var(--shell-border);
  list-style: none;
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

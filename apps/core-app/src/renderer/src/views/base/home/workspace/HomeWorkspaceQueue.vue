<script lang="ts" name="HomeWorkspaceQueue" setup>
import type {
  ConversationWorkspaceStatus,
  WorkspaceQueuedInput
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { WorkspaceQueueAction } from '~/modules/conversation/useAgentWorkspace'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Main's pending inputs for this conversation, above the composer.
 *
 * The list is Main's queue as broadcast — a row exists only once Main persisted it, and each control
 * is one request Main applies with the upstream TurnQueue rules: promoted rows run before ordinary
 * ones in the order they were promoted, ordinary rows keep arrival order and never move across the
 * promoted head. Promoting decides what runs after the current turn; it never interrupts it.
 *
 * A held queue (after Stop, a failure or a restart) stays visible with its reason and runs again
 * only on an explicit Continue (A7).
 */
const props = defineProps<{
  items: WorkspaceQueuedInput[]
  status: ConversationWorkspaceStatus
  held: boolean
  limit: number
  pending: { queueId: string; action: WorkspaceQueueAction } | null
  resuming: boolean
}>()

const emit = defineEmits<{
  (event: 'action', queueId: string, action: WorkspaceQueueAction): void
  (event: 'resume'): void
}>()

const { t } = useI18n()

const expanded = ref(false)
const COLLAPSED_ROWS = 2

const promotedCount = computed(
  () => props.items.filter((item) => item.priority === 'promoted').length
)

const visibleItems = computed(() =>
  expanded.value ? props.items : props.items.slice(0, COLLAPSED_ROWS)
)

/** Why the queue is not draining, in the words of the state Main reported. */
const heldReason = computed(() => {
  if (!props.held) return null
  switch (props.status) {
    case 'interrupted':
      return t('home.workspace.queue.heldInterrupted')
    case 'failed':
      return t('home.workspace.queue.heldFailed')
    case 'cancelled':
      return t('home.workspace.queue.heldStopped')
    case 'pending_approval':
      return t('home.workspace.queue.heldApproval')
    default:
      return t('home.workspace.queue.held')
  }
})

const canResume = computed(
  () => props.held && props.status !== 'running' && props.status !== 'pending_approval'
)

function isPromoted(item: WorkspaceQueuedInput): boolean {
  return item.priority === 'promoted'
}

/** Ordinary rows move within the ordinary run only; the promoted head is not theirs to cross. */
function canMove(item: WorkspaceQueuedInput, direction: 'up' | 'down'): boolean {
  if (isPromoted(item)) return false
  const index = props.items.indexOf(item)
  if (direction === 'up') return index > promotedCount.value
  return index < props.items.length - 1
}

function isPending(item: WorkspaceQueuedInput, action?: WorkspaceQueueAction): boolean {
  return (
    props.pending?.queueId === item.id && (action === undefined || props.pending.action === action)
  )
}

function act(item: WorkspaceQueuedInput, action: WorkspaceQueueAction): void {
  if (props.pending) return
  if ((action === 'up' || action === 'down') && !canMove(item, action)) return
  if (action === 'promote' && isPromoted(item)) return
  emit('action', item.id, action)
}

/** Alt+↑/↓ reorders the focused row, Delete removes it — the list stays usable without a pointer. */
function onRowKeydown(event: KeyboardEvent, item: WorkspaceQueuedInput): void {
  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault()
    act(item, event.key === 'ArrowUp' ? 'up' : 'down')
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    act(item, 'remove')
  }
}
</script>

<template>
  <section
    class="HomeWorkspaceQueue"
    :class="{ 'is-held': held }"
    :aria-label="t('home.workspace.queue.title')"
  >
    <header class="HomeWorkspaceQueue-Head">
      <span class="HomeWorkspaceQueue-Title">
        <span
          :class="held ? 'i-ri-pause-circle-line' : 'i-ri-play-list-2-line'"
          class="HomeWorkspaceQueue-HeadIcon"
          aria-hidden="true"
        />
        <span>{{ t('home.workspace.queue.count', { count: items.length, max: limit }) }}</span>
      </span>
      <span v-if="heldReason" class="HomeWorkspaceQueue-Held" role="status">{{ heldReason }}</span>
      <button
        v-if="canResume"
        class="HomeWorkspaceQueue-Resume"
        type="button"
        :aria-busy="resuming || undefined"
        :disabled="resuming"
        @click="emit('resume')"
      >
        <span class="i-ri-play-line" aria-hidden="true" />
        <span>{{ t('home.workspace.queue.resume') }}</span>
      </button>
    </header>

    <ol v-if="items.length" class="HomeWorkspaceQueue-List">
      <li
        v-for="(item, index) in visibleItems"
        :key="item.id"
        class="HomeWorkspaceQueue-Row"
        :class="{ 'is-pending': isPending(item) }"
        tabindex="0"
        :aria-label="t('home.workspace.queue.rowLabel', { position: index + 1, text: item.text })"
        :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown Delete'"
        @keydown="onRowKeydown($event, item)"
      >
        <span class="HomeWorkspaceQueue-Position" aria-hidden="true">
          <span v-if="isPromoted(item)" class="HomeWorkspaceQueue-Next">
            {{ t('home.workspace.queue.next') }}
          </span>
          <span v-else>{{ index + 1 }}</span>
        </span>
        <span class="HomeWorkspaceQueue-Body">
          <span class="HomeWorkspaceQueue-Text">{{ item.text }}</span>
          <span
            v-if="item.attachments?.length || item.settings.mode === 'agent'"
            class="HomeWorkspaceQueue-Meta"
          >
            <span v-if="item.settings.mode === 'agent'">{{ t('home.workspace.mode.agent') }}</span>
            <span v-if="item.attachments?.length">
              {{ t('home.workspace.queue.attachments', { count: item.attachments.length }) }}
            </span>
          </span>
        </span>
        <span class="HomeWorkspaceQueue-Actions">
          <button
            class="HomeWorkspaceQueue-Btn"
            type="button"
            :aria-label="t('home.workspace.queue.promote')"
            :title="t('home.workspace.queue.promote')"
            :disabled="isPromoted(item) || pending !== null"
            @click="act(item, 'promote')"
          >
            <span class="i-ri-skip-up-line" />
          </button>
          <button
            class="HomeWorkspaceQueue-Btn"
            type="button"
            tabindex="-1"
            :aria-label="t('home.workspace.queue.up')"
            :title="t('home.workspace.queue.up')"
            :disabled="!canMove(item, 'up') || pending !== null"
            @click="act(item, 'up')"
          >
            <span class="i-ri-arrow-up-s-line" />
          </button>
          <button
            class="HomeWorkspaceQueue-Btn"
            type="button"
            tabindex="-1"
            :aria-label="t('home.workspace.queue.down')"
            :title="t('home.workspace.queue.down')"
            :disabled="!canMove(item, 'down') || pending !== null"
            @click="act(item, 'down')"
          >
            <span class="i-ri-arrow-down-s-line" />
          </button>
          <button
            class="HomeWorkspaceQueue-Btn is-danger"
            type="button"
            tabindex="-1"
            :aria-label="t('home.workspace.queue.remove')"
            :title="t('home.workspace.queue.remove')"
            :disabled="pending !== null"
            @click="act(item, 'remove')"
          >
            <span
              :class="
                isPending(item, 'remove') ? 'i-ri-loader-4-line is-spinning' : 'i-ri-close-line'
              "
            />
          </button>
        </span>
      </li>
    </ol>

    <button
      v-if="items.length > COLLAPSED_ROWS"
      class="HomeWorkspaceQueue-More"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{
        expanded
          ? t('home.workspace.queue.collapse')
          : t('home.workspace.queue.expand', { count: items.length - COLLAPSED_ROWS })
      }}
    </button>
  </section>
</template>

<style lang="scss" scoped>
.HomeWorkspaceQueue {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: var(--home-chat-lane-width);
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
  box-sizing: border-box;
  pointer-events: auto;

  &.is-held {
    border-color: var(--shell-warning-border);
  }
}

.HomeWorkspaceQueue-Head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
}

.HomeWorkspaceQueue-Title {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.HomeWorkspaceQueue-HeadIcon {
  color: var(--shell-text-secondary);
}

.is-held .HomeWorkspaceQueue-HeadIcon {
  color: var(--shell-warning);
}

.HomeWorkspaceQueue-Held {
  flex: 1;
  min-width: 0;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;
}

.HomeWorkspaceQueue-Resume {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  height: 26px;
  margin-left: auto;
  padding: 0 12px;
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--shell-primary) 16%, transparent);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }
}

.HomeWorkspaceQueue-List {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 168px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.HomeWorkspaceQueue-Row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 5px 4px 5px 6px;
  border-radius: var(--shell-radius-sm);

  &:hover,
  &:focus-within {
    background: var(--shell-surface);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }

  &.is-pending {
    opacity: 0.6;
  }
}

.HomeWorkspaceQueue-Position {
  flex: none;
  min-width: 18px;
  margin-top: 1px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.HomeWorkspaceQueue-Next {
  display: inline-block;
  padding: 0 6px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary-soft);
  color: var(--shell-primary);
}

.HomeWorkspaceQueue-Body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.HomeWorkspaceQueue-Text {
  display: -webkit-box;
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.HomeWorkspaceQueue-Meta {
  display: flex;
  gap: 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.HomeWorkspaceQueue-Actions {
  display: flex;
  flex: none;
  gap: 1px;
  opacity: 0;

  .HomeWorkspaceQueue-Row:hover &,
  .HomeWorkspaceQueue-Row:focus-within & {
    opacity: 1;
  }
}

/* A pointerless reader still sees the actions: the row's own shortcuts are announced instead. */
@media (hover: none) {
  .HomeWorkspaceQueue-Actions {
    opacity: 1;
  }
}

.HomeWorkspaceQueue-Btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-danger:hover:not(:disabled) {
    color: var(--shell-danger);
  }

  &:disabled {
    cursor: default;
    opacity: 0.35;
  }
}

.is-spinning {
  animation: home-queue-spin 0.9s linear infinite;
}

@keyframes home-queue-spin {
  to {
    transform: rotate(360deg);
  }
}

.HomeWorkspaceQueue-More {
  align-self: flex-start;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}
</style>

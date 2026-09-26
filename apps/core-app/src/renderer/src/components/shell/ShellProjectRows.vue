<script lang="ts">
/**
 * The one delete waiting for its confirming click, sidebar-wide. Every open folder and the Chats
 * section render their own copy of this component, so arming a row disarms whichever copy held the
 * previous one through this hand-off; the pointer and focus rules alone would let two stay armed.
 */
let disarmActiveDelete: (() => void) | null = null
</script>

<script setup lang="ts">
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** How long an armed delete waits for its second click before it turns back into the trash can. */
const DELETE_CONFIRM_WINDOW_MS = 3000

const props = withDefaults(
  defineProps<{
    rows: ConversationProjectRow[]
    activeId: string | null
    dispatchDisabled?: boolean
  }>(),
  { dispatchDisabled: false }
)

const emit = defineEmits<{
  openConversation: [id: string]
  removeConversation: [id: string]
  continueSession: [session: LocalAiCliSessionSummary]
  forgetSession: [sessionRef: string]
}>()

const { t } = useI18n()
const openSessionMenuRef = ref<string | null>(null)
/** The conversation whose trash can has turned into 「确认？」, if any. */
const armedId = ref<string | null>(null)
let disarmTimer: number | null = null

function sessionDisabledReason(session: LocalAiCliSessionSummary): string | undefined {
  if (session.state === 'missing') return t('shell.projects.sessionMissing')
  if (session.state === 'conflict') return t('shell.projects.sessionConflict')
  if (props.dispatchDisabled) return t('shell.projects.sessionArchived')
  return undefined
}

function setSessionMenu(sessionRef: string, open: boolean): void {
  openSessionMenuRef.value = open ? sessionRef : null
}

function conversationTitle(conversation: ConversationRecord): string {
  return conversation.title || t('shell.history.untitled')
}

function deleteLabel(conversation: ConversationRecord): string {
  return armedId.value === conversation.id
    ? t('shell.history.deleteConfirmLabel', { title: conversationTitle(conversation) })
    : t('shell.history.delete')
}

function disarm(): void {
  if (disarmTimer !== null) {
    window.clearTimeout(disarmTimer)
    disarmTimer = null
  }
  armedId.value = null
  if (disarmActiveDelete === disarm) disarmActiveDelete = null
}

function arm(id: string): void {
  if (disarmActiveDelete !== null && disarmActiveDelete !== disarm) disarmActiveDelete()
  disarm()
  armedId.value = id
  disarmActiveDelete = disarm
  disarmTimer = window.setTimeout(disarm, DELETE_CONFIRM_WINDOW_MS)
}

/**
 * The first press arms, the second deletes. Enter and Space arrive here as clicks, from the native
 * button, so the keyboard takes the same two steps.
 */
function onDelete(id: string): void {
  if (armedId.value !== id) {
    arm(id)
    return
  }
  disarm()
  emit('removeConversation', id)
}

/** Pointer leaving the row, or focus leaving the button, gives the trash can back. */
function release(id: string): void {
  if (armedId.value === id) disarm()
}

/**
 * Escape backs out of an armed delete, and is only claimed when there is one to back out of. A held
 * Enter repeats the button's click, which would arm and delete in one press; only a fresh press may
 * take the second step.
 */
function onDeleteKeydown(event: KeyboardEvent, id: string): void {
  if (event.key === 'Enter' && event.repeat) {
    event.preventDefault()
    return
  }
  if (event.key !== 'Escape' || armedId.value !== id) return
  event.preventDefault()
  event.stopPropagation()
  disarm()
}

onBeforeUnmount(disarm)
</script>

<template>
  <template v-for="row in rows" :key="row.key">
    <div
      v-if="row.kind === 'conversation'"
      class="ShellProjectRows-Row"
      :class="{ active: row.conversation.id === activeId }"
      @mouseleave="release(row.conversation.id)"
    >
      <button
        class="ShellProjectRows-Open"
        type="button"
        :title="conversationTitle(row.conversation)"
        :aria-current="row.conversation.id === activeId ? 'page' : undefined"
        @click="emit('openConversation', row.conversation.id)"
      >
        {{ conversationTitle(row.conversation) }}
      </button>
      <!-- One button in both states, so focus stays put when the icon turns into 「确认？」. -->
      <button
        class="ShellProjectRows-Action ShellProjectRows-Delete"
        :class="{ 'is-armed': armedId === row.conversation.id }"
        type="button"
        :title="deleteLabel(row.conversation)"
        :aria-label="deleteLabel(row.conversation)"
        @click.stop="onDelete(row.conversation.id)"
        @blur="release(row.conversation.id)"
        @keydown="onDeleteKeydown($event, row.conversation.id)"
      >
        <span v-if="armedId === row.conversation.id" class="ShellProjectRows-Confirm">
          {{ t('shell.history.deleteConfirm') }}
        </span>
        <span v-else class="i-ri-delete-bin-6-line" aria-hidden="true" />
      </button>
    </div>

    <div v-else class="ShellProjectRows-Row ShellProjectRows-Row--session">
      <button
        class="ShellProjectRows-Open ShellProjectRows-Session"
        type="button"
        :disabled="dispatchDisabled || row.session.state !== 'available'"
        :title="sessionDisabledReason(row.session) || row.session.title"
        @click="emit('continueSession', row.session)"
      >
        <span class="ShellProjectRows-Provider">{{ row.session.provider }}</span>
        <span>{{ row.session.title || t('shell.projects.untitledSession') }}</span>
      </button>
      <TxDropdownMenu
        :model-value="openSessionMenuRef === row.session.sessionRef"
        placement="bottom-end"
        @update:model-value="setSessionMenu(row.session.sessionRef, $event)"
      >
        <template #trigger>
          <button
            class="ShellProjectRows-Action"
            type="button"
            :aria-label="t('shell.projects.sessionActions')"
          >
            <span class="i-ri-more-2-fill" />
          </button>
        </template>
        <TxDropdownItem
          :disabled="dispatchDisabled || row.session.state !== 'available'"
          @select="emit('continueSession', row.session)"
        >
          {{ t('shell.projects.continue') }}
        </TxDropdownItem>
        <TxDropdownItem danger @select="emit('forgetSession', row.session.sessionRef)">
          {{ t('shell.projects.forgetPointer') }}
        </TxDropdownItem>
      </TxDropdownMenu>
    </div>
  </template>
</template>

<style scoped lang="scss">
/**
 * ShellNavItem's box: a 1px transparent border around the title's line, set in the nav label's type,
 * which is what gives a nav row its height; the icon's share stands as a floor in case the icon ever
 * outgrows that line. Rows at the top level start their text in the nav icons' column; a project
 * folder sets `--shell-rows-indent` so its rows start in the nav labels' column.
 */
.ShellProjectRows-Row {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: var(--shell-row-min-height);
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  transition: background-color 0.15s ease;

  &:hover:not(.active) {
    background: var(--shell-surface-2);
  }

  &.active {
    background: var(--shell-primary-soft);
  }
}

.ShellProjectRows-Open {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  padding: var(--shell-row-pad-y) var(--shell-row-pad-x) var(--shell-row-pad-y)
    calc(var(--shell-row-pad-x) + var(--shell-rows-indent, 0px));
  border: none;
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  white-space: nowrap;
  text-align: left;
  text-overflow: ellipsis;
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:disabled {
    color: var(--shell-text-muted);
    cursor: not-allowed;
  }

  .active & {
    color: var(--shell-primary);
    font-weight: 500;
  }
}

.ShellProjectRows-Session {
  display: flex;
  gap: 6px;
  align-items: center;

  > span:last-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.ShellProjectRows-Provider {
  flex: 0 0 auto;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  text-transform: uppercase;
}

.ShellProjectRows-Action {
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
  transition:
    opacity 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:focus-visible,
  .ShellProjectRows-Row:hover & {
    opacity: 1;
  }

  &:hover {
    color: var(--shell-danger);
  }
}

/**
 * Armed, the trash can's slot becomes a small danger chip reading 「确认？」: same slot, same 24px
 * height, so the row keeps its height and the title ellipsizes to make room. `interpolate-size`
 * is what lets `width` run between the icon's 24px and the label's own width; `auto` does not
 * interpolate without it. The label is clipped while the slot grows, so it is uncovered rather
 * than spilling over the title.
 */
.ShellProjectRows-Delete {
  interpolate-size: allow-keywords;
  overflow: hidden;
  white-space: nowrap;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    width 0.18s ease,
    padding 0.18s ease;

  &.is-armed {
    width: auto;
    padding: 0 8px;
    box-shadow: inset 0 0 0 1px var(--shell-danger-border);
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
    opacity: 1;
  }
}

.ShellProjectRows-Confirm {
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  line-height: 1;
}

/** Reduced motion swaps icon and label outright; the fade that reveals the button stays. */
@media (prefers-reduced-motion: reduce) {
  .ShellProjectRows-Delete {
    transition:
      opacity 0.15s ease,
      color 0.15s ease;
  }
}
</style>

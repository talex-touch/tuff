<script setup lang="ts">
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConversationLoading } from '~/modules/conversation/useConversationLoading'
import { SHELL_MENU_CARD } from './shell-menu-panel'

const props = withDefaults(
  defineProps<{
    rows: ConversationProjectRow[]
    activeId: string | null
    dispatchDisabled?: boolean
    /** Project names by id, for the info dialog's 所属项目 row. */
    projectNames?: Record<string, string>
  }>(),
  { dispatchDisabled: false, projectNames: () => ({}) }
)

const emit = defineEmits<{
  openConversation: [id: string]
  removeConversation: [id: string]
  renameConversation: [id: string, title: string]
  copyConversation: [conversation: ConversationRecord]
  openConversationFile: [conversation: ConversationRecord]
  continueSession: [session: LocalAiCliSessionSummary]
  forgetSession: [sessionRef: string]
}>()

const { t, d } = useI18n()
const { isConversationLoading } = useConversationLoading()
const openConversationMenuRef = ref<string | null>(null)
const openSessionMenuRef = ref<string | null>(null)
const pendingDeleteConversation = ref<ConversationRecord | null>(null)
const infoConversation = ref<ConversationRecord | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const MENU_CARD = SHELL_MENU_CARD

function sessionDisabledReason(session: LocalAiCliSessionSummary): string | undefined {
  if (session.state === 'missing') return t('shell.projects.sessionMissing')
  if (session.state === 'conflict') return t('shell.projects.sessionConflict')
  if (props.dispatchDisabled) return t('shell.projects.sessionArchived')
  return undefined
}

function setConversationMenu(id: string, open: boolean): void {
  openConversationMenuRef.value = open ? id : null
}

function setSessionMenu(sessionRef: string, open: boolean): void {
  openSessionMenuRef.value = open ? sessionRef : null
}

function conversationTitle(conversation: ConversationRecord): string {
  return conversation.title || t('shell.history.untitled')
}

function requestDelete(conversation: ConversationRecord): void {
  openConversationMenuRef.value = null
  pendingDeleteConversation.value = conversation
}

function onConfirmDelete(): boolean {
  if (pendingDeleteConversation.value) {
    emit('removeConversation', pendingDeleteConversation.value.id)
    pendingDeleteConversation.value = null
  }
  return true
}

/**
 * Rename in place, as the project folder does: the field replaces the title inside the row and the
 * menu closes behind it. Focus lands on the frame after it mounts — the menu hands focus back to its
 * trigger on close, which would otherwise take the caret straight back.
 */
function beginRename(conversation: ConversationRecord): void {
  openConversationMenuRef.value = null
  renamingId.value = conversation.id
  renameDraft.value = conversation.title
  void nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function cancelRename(): void {
  renamingId.value = null
  renameDraft.value = ''
}

/**
 * Enter saves, Escape abandons — except while an IME composes: macOS Chromium sends the Enter that
 * picks a candidate before `v-model` holds the composed text, and the Escape that closes the
 * candidate list arrives with `isComposing` set. `keyCode` 229 covers engines that end the
 * composition before the key reaches us.
 */
function onRenameKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
}

function commitRename(): void {
  const id = renamingId.value
  if (!id) return
  const title = renameDraft.value.trim().slice(0, 80)
  if (!title) {
    cancelRename()
    return
  }
  renamingId.value = null
  emit('renameConversation', id, title)
}

function requestCopy(conversation: ConversationRecord): void {
  openConversationMenuRef.value = null
  emit('copyConversation', conversation)
}

function requestOpenFile(conversation: ConversationRecord): void {
  openConversationMenuRef.value = null
  emit('openConversationFile', conversation)
}

function requestInfo(conversation: ConversationRecord): void {
  openConversationMenuRef.value = null
  infoConversation.value = conversation
}

function projectNameFor(conversation: ConversationRecord): string {
  if (!conversation.projectId) return t('router.home')
  return props.projectNames[conversation.projectId] ?? t('router.home')
}

function formatTimestamp(value: number): string {
  return d(value, 'long')
}

const infoRows = computed(() => {
  const conversation = infoConversation.value
  if (!conversation) return []
  return [
    { key: 'id', label: t('shell.history.infoId'), value: conversation.id },
    { key: 'project', label: t('shell.history.infoProject'), value: projectNameFor(conversation) },
    {
      key: 'created',
      label: t('shell.history.infoCreated'),
      value: formatTimestamp(conversation.createdAt)
    },
    {
      key: 'updated',
      label: t('shell.history.infoUpdated'),
      value: formatTimestamp(conversation.updatedAt)
    }
  ]
})
</script>

<template>
  <template v-for="row in rows" :key="row.key">
    <div
      v-if="row.kind === 'conversation'"
      class="ShellProjectRows-Row"
      :class="{
        active: row.conversation.id === activeId,
        'is-loading': isConversationLoading(row.conversation.id),
        'is-menu-open': openConversationMenuRef === row.conversation.id
      }"
    >
      <button
        v-if="renamingId !== row.conversation.id"
        class="ShellProjectRows-Open"
        type="button"
        :title="conversationTitle(row.conversation)"
        :aria-current="row.conversation.id === activeId ? 'page' : undefined"
        @click="emit('openConversation', row.conversation.id)"
      >
        <Transition name="shell-spinner-slide">
          <span
            v-if="isConversationLoading(row.conversation.id)"
            class="ShellProjectRows-LoadingIndicator"
            :title="t('shell.history.loading')"
            :aria-label="t('shell.history.loading')"
          >
            <TxSpinner
              :size="13"
              :stroke-width="1.5"
              class="ShellProjectRows-Spinner ShellProjectRows-TxSpinner"
            />
          </span>
        </Transition>
        <span class="ShellProjectRows-Title">{{ conversationTitle(row.conversation) }}</span>
      </button>
      <input
        v-else
        ref="renameInputRef"
        v-model="renameDraft"
        class="ShellProjectRows-Rename"
        type="text"
        maxlength="80"
        :aria-label="t('shell.history.rename')"
        :placeholder="t('shell.history.renamePlaceholder')"
        @keydown="onRenameKeydown"
        @blur="commitRename"
      />
      <TxDropdownMenu
        v-if="renamingId !== row.conversation.id"
        :model-value="openConversationMenuRef === row.conversation.id"
        placement="bottom-end"
        :panel-card="MENU_CARD"
        @update:model-value="setConversationMenu(row.conversation.id, $event)"
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
        <TxDropdownItem @select="beginRename(row.conversation)">
          <span class="i-ri-edit-line mr-1.5" />
          {{ t('shell.history.rename') }}
        </TxDropdownItem>
        <TxDropdownItem @select="requestCopy(row.conversation)">
          <span class="i-ri-file-copy-line mr-1.5" />
          {{ t('shell.history.copy') }}
        </TxDropdownItem>
        <TxDropdownItem @select="requestOpenFile(row.conversation)">
          <span class="i-ri-folder-open-line mr-1.5" />
          {{ t('shell.history.openFile') }}
        </TxDropdownItem>
        <TxDropdownItem @select="requestInfo(row.conversation)">
          <span class="i-ri-information-line mr-1.5" />
          {{ t('shell.history.info') }}
        </TxDropdownItem>
        <TxDropdownItem danger @select="requestDelete(row.conversation)">
          <span class="i-ri-delete-bin-line mr-1.5" />
          {{ t('shell.history.delete') }}
        </TxDropdownItem>
      </TxDropdownMenu>
    </div>

    <div
      v-else
      class="ShellProjectRows-Row ShellProjectRows-Row--session"
      :class="{ 'is-menu-open': openSessionMenuRef === row.session.sessionRef }"
    >
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
        :panel-card="MENU_CARD"
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

  <TxBottomDialog
    v-if="pendingDeleteConversation"
    :title="t('shell.history.deleteConfirmTitle')"
    :message="
      t('shell.history.deleteConfirmLabel', { title: conversationTitle(pendingDeleteConversation) })
    "
    :close-label="t('common.close')"
    :btns="[
      { content: t('common.cancel'), type: 'info', onClick: () => true },
      {
        content: t('shell.history.delete'),
        type: 'error',
        onClick: onConfirmDelete
      }
    ]"
    :close="
      () => {
        pendingDeleteConversation = null
      }
    "
  />

  <!--
    Read-only facts about the thread. A dialog rather than a tooltip: the id is long enough to want
    selecting, and the times are what a user checks before deleting or branching a conversation.
  -->
  <TxModal
    :model-value="infoConversation !== null"
    :title="t('shell.history.infoTitle')"
    width="420px"
    :close-label="t('common.close')"
    @update:model-value="
      (open: boolean) => {
        if (!open) infoConversation = null
      }
    "
  >
    <dl class="ShellProjectRows-Info">
      <div v-for="row of infoRows" :key="row.key" class="ShellProjectRows-InfoRow">
        <dt>{{ row.label }}</dt>
        <dd :class="{ 'is-id': row.key === 'id' }">{{ row.value }}</dd>
      </div>
    </dl>
  </TxModal>
</template>

<style scoped lang="scss">
/**
 * ShellNavItem's box: a 1px transparent border around the title's line, set in the nav label's type,
 * which is what gives a nav row its height; the icon's share stands as a floor in case the icon ever
 * outgrows that line. Rows at the top level start their text in the nav icons' column; a project
 * folder sets `--shell-rows-indent` so its rows start in the nav labels' column.
 */
.ShellProjectRows-Row {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: var(--shell-row-min-height);
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);

  &:hover:not(.active) {
    background: var(--shell-surface-2);
  }

  &.active {
    background: var(--shell-primary-soft);
  }

  &.is-loading.active {
    border-color: color-mix(in srgb, var(--shell-primary) 32%, transparent);
    animation: shell-row-glow-pulse 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;

    &::before {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      padding: 1px;
      background: conic-gradient(
        from var(--shell-row-spin-angle, 0deg) in srgb,
        transparent 0deg,
        transparent 40deg,
        var(--shell-primary) 100deg,
        color-mix(in srgb, var(--shell-primary) 70%, #93c5fd) 140deg,
        transparent 180deg
      );
      pointer-events: none;
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: shell-row-spin-angle 2.4s linear infinite;
      z-index: 2;
    }
  }
}

.ShellProjectRows-Open {
  display: flex;
  align-items: center;
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
  text-align: left;
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

.ShellProjectRows-Title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/**
 * The inline rename field, sized to sit exactly where the title did: the row keeps its height
 * because the field wears the same type and line box, and only the border and the inset padding
 * distinguish it.
 */
.ShellProjectRows-Rename {
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  margin: 0 4px 0 0;
  padding: calc(var(--shell-row-pad-y) - 1px) var(--shell-row-pad-x)
    calc(var(--shell-row-pad-y) - 1px) calc(var(--shell-row-pad-x) + var(--shell-rows-indent, 0px));
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  outline: none;
  -webkit-app-region: no-drag;

  &:focus {
    border-color: var(--shell-primary);
  }
}

/** The info dialog's rows: a quiet label column, and values that keep their own line breaks. */
.ShellProjectRows-Info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  font-size: var(--shell-fs-sm);

  .ShellProjectRows-InfoRow {
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

  .is-id {
    font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: var(--shell-fs-caption);
    user-select: text;
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
  transition: opacity 0.15s ease;
  -webkit-app-region: no-drag;

  &:focus-visible,
  .ShellProjectRows-Row:hover &,
  .is-menu-open & {
    opacity: 1;
  }

  &:hover {
    color: var(--shell-text-regular);
  }
}

.ShellProjectRows-LoadingIndicator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: 7px;
  color: var(--shell-primary);
  pointer-events: none;
  vertical-align: middle;
}

.ShellProjectRows-TxSpinner {
  color: var(--shell-primary);
  flex-shrink: 0;
}

.ShellProjectRows-Spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.shell-spinner-slide-enter-active,
.shell-spinner-slide-leave-active {
  transition:
    width 0.24s cubic-bezier(0.2, 0, 0, 1),
    margin-right 0.24s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.2s cubic-bezier(0.2, 0, 0, 1),
    transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  overflow: hidden;
  flex-shrink: 0;
}

.shell-spinner-slide-enter-from,
.shell-spinner-slide-leave-to {
  width: 0 !important;
  margin-right: 0 !important;
  opacity: 0;
  transform: scale(0.5);
}

@property --shell-row-spin-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes shell-row-spin-angle {
  to {
    --shell-row-spin-angle: 360deg;
  }
}

@keyframes shell-row-glow-pulse {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 20%, transparent),
      inset 0 0 8px color-mix(in srgb, var(--shell-primary) 12%, transparent);
  }
  50% {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 50%, transparent),
      inset 0 0 12px color-mix(in srgb, var(--shell-primary) 28%, transparent);
  }
}

/** Reduced motion swaps icon and label outright; the fade that reveals the button stays. */
@media (prefers-reduced-motion: reduce) {
  .ShellProjectRows-Row.is-loading.active {
    animation: none;
    border-color: var(--shell-primary-border);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);

    &::before {
      display: none;
    }
  }

  .shell-spinner-slide-enter-active,
  .shell-spinner-slide-leave-active {
    transition: opacity 0.15s ease;
  }
}
</style>

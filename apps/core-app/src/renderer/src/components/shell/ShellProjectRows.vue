<script setup lang="ts">
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { TxBottomDialog } from '@talex-touch/tuffex/dialog'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConversationLoading } from '~/modules/conversation/useConversationLoading'

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
const { isConversationLoading } = useConversationLoading()
const openConversationMenuRef = ref<string | null>(null)
const openSessionMenuRef = ref<string | null>(null)
const pendingDeleteConversation = ref<ConversationRecord | null>(null)
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
      <div
        v-if="isConversationLoading(row.conversation.id)"
        class="ShellProjectRows-LoadingIndicator"
        :title="t('shell.history.loading')"
        :aria-label="t('shell.history.loading')"
      >
        <TxSpinner :size="13" class="ShellProjectRows-Spinner ShellProjectRows-TxSpinner" />
      </div>
      <button
        class="ShellProjectRows-Open"
        type="button"
        :title="conversationTitle(row.conversation)"
        :aria-current="row.conversation.id === activeId ? 'page' : undefined"
        @click="emit('openConversation', row.conversation.id)"
      >
        {{ conversationTitle(row.conversation) }}
      </button>
      <TxDropdownMenu
        :model-value="openConversationMenuRef === row.conversation.id"
        placement="bottom-end"
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
    :message="t('shell.history.deleteConfirmLabel', { title: conversationTitle(pendingDeleteConversation) })"
    :close-label="t('common.close')"
    :btns="[
      { content: t('common.cancel'), type: 'info', onClick: () => true },
      {
        content: t('shell.history.delete'),
        type: 'error',
        onClick: onConfirmDelete
      }
    ]"
    :close="() => { pendingDeleteConversation = null }"
  />
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

  &.is-loading {
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
  .is-loading & {
    padding-left: 5px;
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

.ShellProjectRows-LoadingIndicator {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 8px;
  margin-right: -2px;
  color: var(--shell-primary);
  pointer-events: none;
  z-index: 3;
}

.ShellProjectRows-TxSpinner {
  color: var(--shell-primary);
}

.ShellProjectRows-Spinner {
  display: inline-block;
  box-sizing: border-box;
  width: 12px;
  height: 12px;
  border: 1.5px solid color-mix(in srgb, var(--shell-primary) 28%, transparent);
  border-top-color: var(--shell-primary);
  border-radius: 50%;
  animation: shell-spinner-rotate 0.75s linear infinite;
}

.ShellProjectRows-Row:has(.ShellProjectRows-Delete.is-armed) .ShellProjectRows-LoadingIndicator {
  display: none;
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

@keyframes shell-spinner-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
/** Reduced motion swaps icon and label outright; the fade that reveals the button stays. */
@media (prefers-reduced-motion: reduce) {
  .ShellProjectRows-Row.is-loading {
    animation: none;
    border-color: var(--shell-primary-border);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);

    &::before {
      display: none;
    }
  }

  .ShellProjectRows-Spinner {
    animation: none;
    border-top-color: var(--shell-primary);
  }

  .ShellProjectRows-Delete {
    transition: opacity 0.15s ease;
  }
}
</style>

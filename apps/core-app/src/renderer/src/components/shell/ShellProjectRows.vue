<script setup lang="ts">
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

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

function sessionDisabledReason(session: LocalAiCliSessionSummary): string | undefined {
  if (session.state === 'missing') return t('shell.projects.sessionMissing')
  if (session.state === 'conflict') return t('shell.projects.sessionConflict')
  if (props.dispatchDisabled) return t('shell.projects.sessionArchived')
  return undefined
}

function setSessionMenu(sessionRef: string, open: boolean): void {
  openSessionMenuRef.value = open ? sessionRef : null
}
</script>

<template>
  <template v-for="row in rows" :key="row.key">
    <div
      v-if="row.kind === 'conversation'"
      class="ShellProjectRows-Row"
      :class="{ active: row.conversation.id === activeId }"
    >
      <button
        class="ShellProjectRows-Open"
        type="button"
        :title="row.conversation.title || t('shell.history.untitled')"
        :aria-current="row.conversation.id === activeId ? 'page' : undefined"
        @click="emit('openConversation', row.conversation.id)"
      >
        {{ row.conversation.title || t('shell.history.untitled') }}
      </button>
      <button
        class="ShellProjectRows-Action"
        type="button"
        :title="t('shell.history.delete')"
        :aria-label="t('shell.history.delete')"
        @click.stop="emit('removeConversation', row.conversation.id)"
      >
        <span class="i-ri-delete-bin-6-line" />
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
.ShellProjectRows-Row {
  display: flex;
  align-items: center;
  width: 100%;
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
  padding: 6px 9px;
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
</style>

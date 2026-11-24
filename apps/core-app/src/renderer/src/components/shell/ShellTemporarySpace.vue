<script lang="ts" name="ShellTemporarySpace" setup>
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  onFolderAfterEnter,
  onFolderAfterLeave,
  onFolderBeforeEnter,
  onFolderBeforeLeave,
  onFolderEnter,
  onFolderLeave
} from './shell-folder-transition'
import { SHELL_MENU_CARD } from './shell-menu-panel'
import ShellProjectRows from './ShellProjectRows.vue'

/**
 * The temporary space row in the Spaces sidebar: groups conversations without a backing project
 * folder under one collapsible folder row, carrying a hover-revealed new-chat button and the
 * restart-cleanup notice behind an interactive popover.
 */
withDefaults(
  defineProps<{
    rows: ConversationProjectRow[]
    /** Conversation on screen, for the nested rows' own highlight. */
    activeId: string | null
    /** A blank conversation outside every project is on screen. */
    current?: boolean
    expanded?: boolean
    /** Whether the user has acknowledged the restart-cleanup notice. */
    noticeRead?: boolean
    /** Project names by id, forwarded to the rows' info dialog. */
    projectNames?: Record<string, string>
  }>(),
  {
    current: false,
    expanded: true,
    noticeRead: false,
    projectNames: () => ({})
  }
)

const emit = defineEmits<{
  toggle: []
  enter: []
  markNoticeRead: []
  openConversation: [id: string]
  removeConversation: [id: string]
  renameConversation: [id: string, title: string]
  copyConversation: [conversation: ConversationRecord]
  openConversationFile: [conversation: ConversationRecord]
  continueSession: [session: LocalAiCliSessionSummary]
  forgetSession: [sessionRef: string]
}>()

const NOTICE_CARD = SHELL_MENU_CARD

const { t } = useI18n()
const noticeOpen = ref(false)

function onMarkNoticeRead(): void {
  noticeOpen.value = false
  emit('markNoticeRead')
}
</script>

<template>
  <div
    class="ShellTemporarySpace"
    :class="{
      'is-current': current,
      'is-expanded': expanded,
      'is-notice-open': noticeOpen
    }"
  >
    <div class="ShellTemporarySpace-Row">
      <button
        class="ShellTemporarySpace-Toggle"
        type="button"
        :aria-expanded="expanded"
        :aria-label="
          expanded
            ? t('shell.projects.collapse', { name: t('shell.spaces.temporary') })
            : t('shell.projects.expand', { name: t('shell.spaces.temporary') })
        "
        @click="emit('toggle')"
      >
        <span class="ShellTemporarySpace-Glyph" aria-hidden="true">
          <span
            class="ShellTemporarySpace-Folder"
            :class="expanded ? 'i-ri-folder-open-line' : 'i-ri-folder-line'"
          />
          <span
            class="ShellTemporarySpace-Chevron i-ri-arrow-right-s-line"
            :class="{ 'is-expanded': expanded }"
          />
        </span>
      </button>

      <button
        class="ShellTemporarySpace-Name"
        type="button"
        :aria-current="current ? 'page' : undefined"
        @click="emit('enter')"
      >
        {{ t('shell.spaces.temporary') }}
      </button>

      <div class="ShellTemporarySpace-Actions">
        <button
          class="ShellTemporarySpace-Add"
          type="button"
          :title="t('shell.newChat')"
          :aria-label="t('shell.newChat')"
          @click="emit('enter')"
        >
          <span class="ShellTemporarySpace-ActionIcon i-ri-add-line" aria-hidden="true" />
        </button>

        <TxPopover
          v-model="noticeOpen"
          trigger="hover"
          placement="right"
          :offset="10"
          :open-delay="100"
          :close-delay="140"
          :match-reference-width="false"
          :max-width="248"
          :panel-radius="12"
          :panel-padding="10"
          :panel-card="NOTICE_CARD"
        >
          <template #reference>
            <button
              class="ShellTemporarySpace-Notice"
              :class="{ 'is-read': noticeRead }"
              type="button"
              :aria-label="t('shell.spaces.temporaryNotice')"
            >
              <span
                class="ShellTemporarySpace-NoticeIcon"
                :class="noticeRead ? 'i-ri-information-line' : 'i-ri-error-warning-line'"
                aria-hidden="true"
              />
            </button>
          </template>

          <div class="ShellTemporarySpace-NoticeCard">
            <p class="ShellTemporarySpace-NoticeText">
              {{ t('shell.spaces.temporaryNotice') }}
            </p>
            <div v-if="!noticeRead" class="ShellTemporarySpace-NoticeActions">
              <TxButton
                class="ShellTemporarySpace-MarkRead"
                size="sm"
                variant="flat"
                icon="i-ri-check-line"
                @click="onMarkNoticeRead"
              >
                {{ t('shell.spaces.temporaryNoticeMarkRead') }}
              </TxButton>
            </div>
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
      <div v-if="expanded" class="ShellTemporarySpace-Children">
        <div class="ShellTemporarySpace-ChildrenInner">
          <ShellProjectRows
            :rows="rows"
            :active-id="activeId"
            :project-names="projectNames"
            @open-conversation="emit('openConversation', $event)"
            @remove-conversation="emit('removeConversation', $event)"
            @rename-conversation="(id, title) => emit('renameConversation', id, title)"
            @copy-conversation="emit('copyConversation', $event)"
            @open-conversation-file="emit('openConversationFile', $event)"
            @continue-session="emit('continueSession', $event)"
            @forget-session="emit('forgetSession', $event)"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.ShellTemporarySpace {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/**
 * Matches ShellProjectFolder-Row's exact box metrics — 1px transparent border around the shared row
 * padding — so the temporary space aligns column-for-column with project folders and nav rows.
 */
.ShellTemporarySpace-Row {
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

  .is-current > & {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

.ShellTemporarySpace-Toggle {
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

.ShellTemporarySpace-Glyph {
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

.ShellTemporarySpace-Chevron {
  visibility: hidden;
  transition: transform 0.26s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  &.is-expanded {
    transform: rotate(90deg);
  }
}

.ShellTemporarySpace > .ShellTemporarySpace-Row:hover,
.ShellTemporarySpace-Toggle:focus-visible {
  .ShellTemporarySpace-Folder {
    visibility: hidden;
  }

  .ShellTemporarySpace-Chevron {
    visibility: visible;
  }
}

.ShellTemporarySpace-Name {
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
  overflow: hidden;
  padding: var(--shell-row-pad-y) 0 var(--shell-row-pad-y) calc(var(--shell-row-gap) / 2);
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  white-space: nowrap;
  text-align: left;
  text-overflow: ellipsis;
  cursor: pointer;
  -webkit-app-region: no-drag;

  .is-current & {
    font-weight: 500;
  }
}

/**
 * Trailing action buttons: right edge sits on the shared 24px action column (3px right margin,
 * matching ShellProjectFolder-More). The new-chat + reveals on row hover/focus; the notice icon
 * stays visible in warning ink until marked read, then turns muted and hides until hover/focus or
 * while its popover is open.
 */
.ShellTemporarySpace-Actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  align-items: center;
  margin-right: 3px;
}

.ShellTemporarySpace-Add {
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

  &:hover,
  &:focus-visible {
    color: var(--shell-text-regular);
    background: var(--shell-info-soft);
  }

  .ShellTemporarySpace-Row:hover &,
  .ShellTemporarySpace-Row:has(:focus-visible) & {
    opacity: 1;
  }
}

.ShellTemporarySpace-Notice {
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
  color: var(--shell-warning);
  cursor: pointer;
  transition: opacity 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover,
  &:focus-visible,
  .is-notice-open & {
    background: var(--shell-warning-soft);
  }

  &.is-read {
    color: var(--shell-text-muted);
    opacity: 0;

    &:hover,
    &:focus-visible,
    .is-notice-open & {
      color: var(--shell-text-regular);
      background: var(--shell-info-soft);
    }

    .ShellTemporarySpace-Row:hover &,
    .ShellTemporarySpace-Row:has(:focus-visible) &,
    .is-notice-open & {
      opacity: 1;
    }
  }
}

.ShellTemporarySpace-ActionIcon,
.ShellTemporarySpace-NoticeIcon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  font-size: 14px;
}

/** Teleported popover content: standalone scoped selectors because the panel mounts under body. */
.ShellTemporarySpace-NoticeCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ShellTemporarySpace-NoticeText {
  margin: 0;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.ShellTemporarySpace-NoticeActions {
  display: flex;
  justify-content: flex-end;
}

.ShellTemporarySpace-Children {
  --shell-rows-indent: calc(var(--shell-row-icon) + var(--shell-row-gap));

  overflow: hidden;
}

.ShellTemporarySpace-ChildrenInner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
}

.folder-expand-enter-active {
  transition: height 0.28s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  .ShellTemporarySpace-ChildrenInner {
    transition:
      opacity 0.22s ease-out,
      transform 0.28s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }
}

.folder-expand-leave-active {
  transition: height 0.22s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  .ShellTemporarySpace-ChildrenInner {
    transition:
      opacity 0.16s ease-out,
      transform 0.22s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }
}

.folder-expand-enter-from .ShellTemporarySpace-ChildrenInner {
  opacity: 0;
  transform: translateY(-6px);
}

.folder-expand-leave-to .ShellTemporarySpace-ChildrenInner {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .ShellTemporarySpace-Chevron,
  .folder-expand-enter-active,
  .folder-expand-leave-active,
  .folder-expand-enter-active .ShellTemporarySpace-ChildrenInner,
  .folder-expand-leave-active .ShellTemporarySpace-ChildrenInner {
    transition-duration: 0.01ms;
  }

  .folder-expand-enter-from .ShellTemporarySpace-ChildrenInner,
  .folder-expand-leave-to .ShellTemporarySpace-ChildrenInner {
    transform: none;
  }
}
</style>

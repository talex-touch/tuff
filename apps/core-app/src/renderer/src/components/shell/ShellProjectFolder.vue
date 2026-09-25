<script lang="ts" name="ShellProjectFolder" setup>
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ShellProjectRows from './ShellProjectRows.vue'

/**
 * One project in the sidebar: a folder row and, while it is open, the project's conversations and
 * local agent sessions beneath it, indented to the name column.
 *
 * Every action leaves as an event. The list keeps the single copy of each behaviour — rename, pin,
 * archive, discovery and the lock that runs discovery one project at a time — and the rows of the
 * Chats section share the list's row handlers too, so nothing here duplicates them.
 */
const props = withDefaults(
  defineProps<{
    project: ProjectRecord
    rows: ConversationProjectRow[]
    /** Conversation on screen, for the nested rows' own highlight. */
    activeId: string | null
    /** This project owns the blank conversation on screen. */
    current?: boolean
    expanded?: boolean
    /**
     * Read-only form for the archived section: no toggle — the rows always show, as they did before
     * folders existed — a name that leads nowhere, and a menu that can only unarchive.
     */
    archived?: boolean
    renaming?: boolean
    /** Project whose session discovery is in flight, if any. */
    discoveringProjectId?: string | null
  }>(),
  {
    current: false,
    expanded: false,
    archived: false,
    renaming: false,
    discoveringProjectId: null
  }
)

const emit = defineEmits<{
  toggle: []
  enter: []
  runAgent: []
  discover: []
  beginRename: []
  rename: [name: string]
  cancelRename: []
  togglePinned: []
  toggleArchived: []
  openConversation: [id: string]
  removeConversation: [id: string]
  continueSession: [session: LocalAiCliSessionSummary]
  forgetSession: [sessionRef: string]
}>()

const { t } = useI18n()
const menuOpen = ref(false)
const draft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.renaming,
  (renaming) => {
    if (!renaming) return
    draft.value = props.project.name
    void focusRenameInput()
  },
  { immediate: true }
)

/**
 * `autofocus` only acts while the page loads, so the field is focused by hand, its text selected to
 * type over. Not until the frame after it mounts: rename is chosen from this row's own menu, which
 * closes in the same update and reacts to that after the render. A menu that hands focus back to
 * its trigger on close, as the ARIA menu pattern does, would otherwise take it straight back.
 */
async function focusRenameInput(): Promise<void> {
  await nextTick()
  requestAnimationFrame(() => {
    if (!props.renaming) return
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

/**
 * Enter saves and Escape abandons, but not while an IME is composing. macOS Chromium sends the Enter
 * that picks a candidate — before `v-model` has the composed text — and the Escape that closes the
 * candidate list with `isComposing` set; both belong to the IME. `keyCode` 229 covers engines that
 * end the composition before the key arrives.
 */
function onRenameKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('rename', draft.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancelRename')
  }
}
</script>

<template>
  <div
    class="ShellProjectFolder"
    :class="{
      'is-current': current,
      'is-expanded': expanded,
      'is-menu-open': menuOpen,
      'is-archived': archived
    }"
  >
    <div class="ShellProjectFolder-Row">
      <span v-if="archived" class="ShellProjectFolder-Toggle" aria-hidden="true">
        <span class="ShellProjectFolder-Glyph">
          <span
            class="ShellProjectFolder-Folder"
            :class="rows.length ? 'i-ri-folder-open-line' : 'i-ri-folder-line'"
          />
        </span>
      </span>
      <button
        v-else
        class="ShellProjectFolder-Toggle"
        type="button"
        :aria-expanded="expanded"
        :aria-label="
          expanded
            ? t('shell.projects.collapse', { name: project.name })
            : t('shell.projects.expand', { name: project.name })
        "
        @click="emit('toggle')"
      >
        <span class="ShellProjectFolder-Glyph" aria-hidden="true">
          <span
            class="ShellProjectFolder-Folder"
            :class="expanded ? 'i-ri-folder-open-line' : 'i-ri-folder-line'"
          />
          <span
            class="ShellProjectFolder-Chevron"
            :class="expanded ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'"
          />
        </span>
      </button>

      <input
        v-if="renaming"
        ref="renameInputRef"
        v-model="draft"
        class="ShellProjectFolder-Rename"
        type="text"
        :aria-label="t('shell.projects.rename')"
        @keydown="onRenameKeydown"
      />
      <span
        v-else-if="archived"
        class="ShellProjectFolder-Name"
        :title="project.rootPath"
        :aria-current="current ? 'page' : undefined"
      >
        {{ project.name }}
      </span>
      <button
        v-else
        class="ShellProjectFolder-Name"
        type="button"
        :title="project.rootPath"
        :aria-current="current ? 'page' : undefined"
        @click="emit('enter')"
      >
        {{ project.name }}
      </button>

      <TxDropdownMenu v-model="menuOpen" placement="bottom-end">
        <template #trigger>
          <button
            class="ShellProjectFolder-More"
            type="button"
            :aria-label="t('shell.projects.projectActions')"
          >
            <span class="i-ri-more-2-fill" />
          </button>
        </template>
        <TxDropdownItem v-if="archived" @select="emit('toggleArchived')">
          {{ t('shell.projects.unarchive') }}
        </TxDropdownItem>
        <template v-else>
          <TxDropdownItem @select="emit('enter')">
            {{ t('shell.projects.newChat') }}
          </TxDropdownItem>
          <TxDropdownItem @select="emit('runAgent')">
            {{ t('shell.projects.runLocalAgent') }}
          </TxDropdownItem>
          <TxDropdownItem :disabled="discoveringProjectId !== null" @select="emit('discover')">
            {{
              discoveringProjectId === project.id
                ? t('shell.projects.discoveringSessions')
                : t('shell.projects.discoverSessions')
            }}
          </TxDropdownItem>
          <TxDropdownItem @select="emit('beginRename')">
            {{ t('shell.projects.rename') }}
          </TxDropdownItem>
          <TxDropdownItem @select="emit('togglePinned')">
            {{ project.pinned ? t('shell.projects.unpin') : t('shell.projects.pin') }}
          </TxDropdownItem>
          <TxDropdownItem @select="emit('toggleArchived')">
            {{ t('shell.projects.archive') }}
          </TxDropdownItem>
        </template>
      </TxDropdownMenu>
    </div>

    <!-- Archived: its rows or nothing — an empty box would still take a gap in the column. -->
    <div v-if="archived ? rows.length > 0 : expanded" class="ShellProjectFolder-Children">
      <ShellProjectRows
        v-if="rows.length"
        :rows="rows"
        :active-id="activeId"
        :dispatch-disabled="archived"
        @open-conversation="emit('openConversation', $event)"
        @remove-conversation="emit('removeConversation', $event)"
        @continue-session="emit('continueSession', $event)"
        @forget-session="emit('forgetSession', $event)"
      />
      <p v-else class="ShellProjectFolder-Empty">
        {{ t('shell.projects.empty') }}
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ShellProjectFolder {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/**
 * ShellNavItem's box — a 1px transparent border around the shared row padding — so the glyph sits in
 * the nav icons' column, the name in the nav labels' column, and the row is exactly as tall.
 */
.ShellProjectFolder-Row {
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  color: var(--shell-text-regular);
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--shell-surface-2);
  }

  .is-current > & {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

/**
 * The icon column plus half the gap to the name. The hit area runs right up to the name's, with no
 * dead strip between them, while the glyph still lands exactly where a nav row draws its icon.
 */
.ShellProjectFolder-Toggle {
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

  .is-archived & {
    cursor: default;
  }
}

/**
 * Folder and chevron share one icon cell. Pinned like ShellNavItem's icon: the generated icon class
 * sizes itself in `em` and sets no `display`, so an unpinned glyph would ride the inherited font
 * size, or measure 0×0 as an inline box.
 */
.ShellProjectFolder-Glyph {
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

/**
 * The folder says what the row is; under the pointer, or with the toggle focused from the keyboard,
 * the same cell shows the chevron that says what the button does. Swapping in place keeps the icon
 * column one glyph wide, so the name stays in the nav labels' column.
 */
.ShellProjectFolder-Chevron {
  visibility: hidden;
}

.ShellProjectFolder:not(.is-archived) > .ShellProjectFolder-Row:hover,
.ShellProjectFolder-Toggle:focus-visible {
  .ShellProjectFolder-Folder {
    visibility: hidden;
  }

  .ShellProjectFolder-Chevron {
    visibility: visible;
  }
}

.ShellProjectFolder-Name {
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

  .is-archived & {
    cursor: default;
  }
}

.ShellProjectFolder-Rename {
  flex: 1 1 auto;
  min-width: 0;
  // Keeps the typed text where the name it replaces sat: the name is inset half a gap, the field by
  // its own 1px border and 6px padding.
  margin: 0 4px 0 calc(var(--shell-row-gap) / 2 - 7px);
  padding: 3px 6px;
  border: 1px solid var(--shell-primary);
  border-radius: var(--shell-radius-sm);
  outline: none;
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-body);
  -webkit-app-region: no-drag;
}

/**
 * Hidden until it can be wanted: under the pointer, with keyboard focus anywhere in the row, while its
 * menu is open, and on the current project. It keeps its space while hidden, so a long name ellipsizes
 * short of it instead of running underneath.
 */
.ShellProjectFolder-More {
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

  &:hover {
    color: var(--shell-text-regular);
  }

  .ShellProjectFolder-Row:hover &,
  .ShellProjectFolder-Row:has(:focus-visible) &,
  .is-menu-open &,
  .is-current & {
    opacity: 1;
  }
}

/**
 * Nested rows start their text in the name column. ShellProjectRows adds this indent to its own inset,
 * which is how one component serves both the flush Chats section and a folder's children.
 */
.ShellProjectFolder-Children {
  --shell-rows-indent: calc(var(--shell-row-icon) + var(--shell-row-gap));

  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ShellProjectFolder-Empty {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: var(--shell-row-min-height);
  margin: 0;
  padding: var(--shell-row-pad-y) var(--shell-row-pad-x) var(--shell-row-pad-y)
    calc(var(--shell-row-pad-x) + var(--shell-rows-indent));
  border: 1px solid transparent;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}
</style>

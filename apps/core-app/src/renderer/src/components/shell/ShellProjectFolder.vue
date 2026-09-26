<script lang="ts" name="ShellProjectFolder" setup>
import type {
  LocalAiCliProviderId,
  LocalAiCliSessionSummary
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { ConversationProjectRow } from '~/modules/conversation/conversation-project-groups'
import type { LocalAiAgentBlocker } from '~/modules/conversation/local-ai-agents'
import {
  TxDropdownItem,
  TxDropdownMenu,
  TxDropdownSubmenu
} from '@talex-touch/tuffex/dropdown-menu'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '~/stores/projects'
import ShellProjectRows from './ShellProjectRows.vue'

/**
 * One project in the sidebar: a folder row and, while it is open, the project's conversations and
 * local agent sessions beneath it, indented to the name column.
 *
 * Every action leaves as an event. The list keeps the single copy of each behaviour — rename, pin,
 * archive, discovery and the lock that runs discovery one project at a time — and the rows of the
 * Chats section share the list's row handlers too, so nothing here duplicates them. The one thing
 * read here is what the agent submenu lists, from the project store, which every folder shares.
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
  /** Open the project in the omni panel's local agent view, with this agent already chosen. */
  runAgent: [provider: LocalAiCliProviderId]
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

/**
 * Brand marks for the agent submenu, keyed by the CLI's provider id. Written in this SFC rather
 * than in `local-ai-agents.ts`: UnoCSS generates the classes it finds in templates and SFCs, and a
 * class named only in a `.ts` table renders as an empty box (see `uno.config.ts`). pi and omp share
 * pi's mark, as they do in `modules/intelligence/provider-icons.ts`.
 */
const AGENT_ICONS = {
  pi: 'i-simple-icons-pi',
  'oh-my-pi': 'i-simple-icons-pi',
  codex: 'i-simple-icons-openai',
  claude: 'i-simple-icons-claude'
} satisfies Record<LocalAiCliProviderId, string>
/** For a CLI the main process lists before this table learns its mark. */
const AGENT_FALLBACK_ICON = 'i-ri-terminal-box-line'

const { t } = useI18n()
const projectStore = useProjectStore()
const { localAiAgents, localAiAgentsPhase, localAiBetaAvailable } = storeToRefs(projectStore)
const menuOpen = ref(false)
const draft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

/** What the agent submenu says in place of the agents while it has none to offer. */
const agentsNote = computed(() => {
  switch (localAiAgentsPhase.value) {
    case 'loading':
      return t('shell.projects.agentsLoading')
    case 'failed':
      return t('shell.projects.agentsFailed')
    default:
      return t('shell.projects.agentsNone')
  }
})

/**
 * The agents are read afresh whenever this menu opens, not when the submenu does: the version
 * probes behind the list are then already running by the time the pointer reaches the submenu.
 */
watch(menuOpen, (open) => {
  if (open && !props.archived && localAiBetaAvailable.value !== false) {
    void projectStore.refreshLocalAiAgents()
  }
})

// Known before the menu opens, so the 「本机代理」 group never appears and then vanishes. An
// archived project's menu only unarchives, so it never asks.
onMounted(() => {
  if (!props.archived) projectStore.ensureLocalAiStatus()
})

function agentIcon(id: string): string {
  return Object.hasOwn(AGENT_ICONS, id)
    ? AGENT_ICONS[id as LocalAiCliProviderId]
    : AGENT_FALLBACK_ICON
}

function agentBlockerLabel(blocker: LocalAiAgentBlocker): string {
  switch (blocker) {
    case 'not-installed':
      return t('shell.projects.agentNotInstalled')
    case 'turned-off':
      return t('shell.projects.agentTurnedOff')
    case 'unsupported':
      return t('shell.projects.agentUnavailable')
  }
}

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
        <!--
          Three groups, each under a small heading: what starts a conversation, what reaches for a
          local agent CLI, and what changes the project itself. Each is a `group` so its heading is
          announced; the heading row is `aria-hidden` so the name is not read twice, and it takes no
          focus, so arrow keys go item to item.
        -->
        <template v-else>
          <div
            class="ShellProjectFolder-MenuGroup"
            role="group"
            :aria-label="t('shell.projects.chats')"
          >
            <div class="ShellProjectFolder-MenuLabel" aria-hidden="true">
              {{ t('shell.projects.chats') }}
            </div>
            <TxDropdownItem @select="emit('enter')">
              {{ t('shell.projects.newChat') }}
            </TxDropdownItem>
          </div>
          <!-- Local agents are a macOS beta: a build known to lack it leaves the whole group out
               rather than offering actions that cannot run. Unknown (a read that failed) still
               shows it, with the submenu saying why it has nothing. -->
          <template v-if="localAiBetaAvailable !== false">
            <div class="ShellProjectFolder-MenuDivider" role="separator" />
            <div
              class="ShellProjectFolder-MenuGroup"
              role="group"
              :aria-label="t('shell.projects.groupLocalAgents')"
            >
              <div class="ShellProjectFolder-MenuLabel" aria-hidden="true">
                {{ t('shell.projects.groupLocalAgents') }}
              </div>
              <TxDropdownSubmenu :min-width="200">
                {{ t('shell.projects.openInLocalAgent') }}
                <template #menu>
                  <template v-if="localAiAgentsPhase === 'ready'">
                    <!-- Every CLI Tuff knows, in the main process's order; a blocked one says why. -->
                    <TxDropdownItem
                      v-for="agent in localAiAgents"
                      :key="agent.id"
                      :disabled="agent.blocker !== null"
                      @select="emit('runAgent', agent.id)"
                    >
                      <span class="ShellProjectFolder-Agent">
                        <span
                          class="ShellProjectFolder-AgentIcon"
                          :class="agentIcon(agent.id)"
                          aria-hidden="true"
                        />
                        {{ agent.label }}
                      </span>
                      <template v-if="agent.blocker" #right>
                        <span class="ShellProjectFolder-AgentNote">
                          {{ agentBlockerLabel(agent.blocker) }}
                        </span>
                      </template>
                    </TxDropdownItem>
                  </template>
                  <div v-else class="ShellProjectFolder-MenuNote" role="none">
                    {{ agentsNote }}
                  </div>
                </template>
              </TxDropdownSubmenu>
              <!-- The hint sits on the label, not the item: TxDropdownItem's root is TxCardItem,
                   which takes `title` as a prop, so on the item it would never reach the DOM. -->
              <TxDropdownItem :disabled="discoveringProjectId !== null" @select="emit('discover')">
                <span :title="t('shell.projects.adoptSessionsHint')">
                  {{
                    discoveringProjectId === project.id
                      ? t('shell.projects.discoveringSessions')
                      : t('shell.projects.adoptSessions')
                  }}
                </span>
              </TxDropdownItem>
            </div>
          </template>
          <div class="ShellProjectFolder-MenuDivider" role="separator" />
          <div
            class="ShellProjectFolder-MenuGroup"
            role="group"
            :aria-label="t('shell.projects.groupProject')"
          >
            <div class="ShellProjectFolder-MenuLabel" aria-hidden="true">
              {{ t('shell.projects.groupProject') }}
            </div>
            <TxDropdownItem @select="emit('beginRename')">
              {{ t('shell.projects.rename') }}
            </TxDropdownItem>
            <TxDropdownItem @select="emit('togglePinned')">
              {{ project.pinned ? t('shell.projects.unpin') : t('shell.projects.pin') }}
            </TxDropdownItem>
            <TxDropdownItem @select="emit('toggleArchived')">
              {{ t('shell.projects.archive') }}
            </TxDropdownItem>
          </div>
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

/**
 * The menu's own furniture. Its panels are teleported out of this row, so these are standalone
 * selectors; they still carry this component's scope id because this template renders them. The
 * group keeps the panel's own 4px rhythm, and headings and notes start where an item's text does.
 */
.ShellProjectFolder-MenuGroup {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ShellProjectFolder-MenuLabel {
  padding: 4px 10px 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.ShellProjectFolder-MenuDivider {
  margin: 0 6px;
  border-top: 1px solid var(--shell-border);
}

/** Inline-flex so the mark is a flex item: an icon class sizes itself but sets no `display`. */
.ShellProjectFolder-Agent {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  max-width: 100%;
  vertical-align: top;
}

.ShellProjectFolder-AgentIcon {
  flex: none;
  width: 14px;
  height: 14px;
  font-size: 14px;
}

.ShellProjectFolder-AgentNote {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.ShellProjectFolder-MenuNote {
  padding: 8px 10px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
}
</style>

<script lang="ts" name="ShellConversationList" setup>
import type {
  LocalAiCliProviderId,
  LocalAiCliSessionSummary
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { omniPanelShowEvent } from '../../../../shared/events/omni-panel'
import { projectConversationGroups } from '~/modules/conversation/conversation-project-groups'
import { continueLocalAiSession } from '~/modules/conversation/local-ai-session-entry'
import { useConversationEntry } from '~/modules/conversation/useConversationEntry'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { useConversationLoading } from '~/modules/conversation/useConversationLoading'
import { blankConversationOwner, useProjectFolders } from '~/modules/layout/useProjectFolders'
import { useProjectStore } from '~/stores/projects'
import MetaHintBadge from './MetaHintBadge.vue'
import ShellProjectFolder from './ShellProjectFolder.vue'
import ShellProjectRows from './ShellProjectRows.vue'

const { t, locale } = useI18n()
const { isConversationLoading } = useConversationLoading()
/**
 * The skeleton's folder-name bars, one per row. In pixels because a percentage has nothing to resolve
 * against in a content-sized box; at the narrowest sidebar the widest still stops short of the ⋯.
 */
const SKELETON_NAME_WIDTHS = [96, 72, 108] as const
const route = useRoute()
const router = useRouter()
const transport = useTuffTransport()
const history = useConversationHistory()
const projectStore = useProjectStore()
const { enterConversation, enterPickedProjectConversation } = useConversationEntry()
const { projects, localAiSessions, activeProjectId } = storeToRefs(projectStore)
const folders = useProjectFolders({
  activeProjectId: () => projectStore.activeProjectId,
  projects: () => projectStore.projects
})
const { collapsed } = useShellSidebar()
const archivedOpen = ref(false)
const renamingProjectId = ref<string | null>(null)
const discoveringProjectId = ref<string | null>(null)
/**
 * Whether the first load has settled. Until it has, an empty list means "not known yet" rather than
 * "none", and the Projects section's empty state would flash in ahead of the real folders.
 */
const loaded = ref(false)

onMounted(() => {
  void Promise.all([history.refresh(), projectStore.initialize()]).finally(() => {
    loaded.value = true
  })
})

const groups = computed(() =>
  projectConversationGroups(projects.value, history.conversations.value, localAiSessions.value)
)
const activeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
/** The folder row that is current: the one owning the blank conversation on screen, if any. */
const currentProjectId = computed(
  () => blankConversationOwner(route.path, activeProjectId.value) ?? null
)
const showSkeleton = computed(
  () => !loaded.value && history.conversations.value.length === 0 && projects.value.length === 0
)

function openConversation(id: string): void {
  if (activeId.value === id) return
  void router.push(`/home/c/${id}`)
}

async function removeConversation(id: string): Promise<void> {
  const wasActive = activeId.value === id
  try {
    await history.remove(id)
  } catch {
    return
  }
  if (wasActive) await router.push('/home')
}

/** Opens the project in the omni panel's local agent view with the agent the menu picked chosen. */
async function openProjectAgent(projectId: string, provider: LocalAiCliProviderId): Promise<void> {
  await transport.send(omniPanelShowEvent, {
    captureSelection: false,
    source: 'project-local-ai',
    localAi: { projectId, provider }
  })
}

/** Shared with Home's 「为你准备」 card, which resumes the same sessions from the blank state. */
async function continueSession(session: LocalAiCliSessionSummary): Promise<void> {
  await continueLocalAiSession(transport, session)
}

function beginRename(project: ProjectRecord): void {
  renamingProjectId.value = project.id
}

function cancelRename(): void {
  renamingProjectId.value = null
}

async function saveRename(project: ProjectRecord, name: string): Promise<void> {
  try {
    await projectStore.rename(project.id, name)
    cancelRename()
  } catch {
    toast.error(t('shell.projects.renameFailed'))
  }
}

async function togglePinned(project: ProjectRecord): Promise<void> {
  try {
    await projectStore.setPinned(project.id, !project.pinned)
  } catch {
    toast.error(t('shell.projects.actionFailed'))
  }
}

async function toggleArchived(project: ProjectRecord): Promise<void> {
  try {
    await projectStore.setArchived(project.id, !project.archived)
  } catch {
    toast.error(t('shell.projects.actionFailed'))
  }
}

async function discoverSessions(project: ProjectRecord): Promise<void> {
  if (discoveringProjectId.value) return
  discoveringProjectId.value = project.id
  try {
    const result = await projectStore.discoverSessions(project.id)
    if (result.incomplete) {
      toast.warning(t('shell.projects.discoveryPartial', { count: result.discovered }))
    } else if (result.discovered > 0) {
      toast.success(t('shell.projects.discoveryComplete', { count: result.discovered }))
    } else {
      toast.info(t('shell.projects.discoveryEmpty'))
    }
  } catch {
    toast.error(t('shell.projects.discoveryFailed'))
  } finally {
    discoveringProjectId.value = null
  }
}

async function forgetSession(sessionRef: string): Promise<void> {
  try {
    await projectStore.forgetSession(sessionRef)
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('NATIVE_SESSION_BUSY')
        ? t('shell.projects.sessionBusy')
        : t('shell.projects.actionFailed')
    toast.error(message)
  }
}
interface RailConversationRow {
  key: string
  kind: 'conversation' | 'session'
  id?: string
  title: string
  projectName?: string
  updatedAt: number
  session?: LocalAiCliSessionSummary
}

const railRows = computed<RailConversationRow[]>(() => {
  const list: RailConversationRow[] = []

  for (const group of groups.value.active) {
    for (const row of group.rows) {
      if (row.kind === 'conversation') {
        list.push({
          key: row.key,
          kind: 'conversation',
          id: row.conversation.id,
          title: row.conversation.title || t('shell.history.untitled'),
          projectName: group.project?.name,
          updatedAt: row.updatedAt
        })
      } else {
        list.push({
          key: row.key,
          kind: 'session',
          title: row.session.title || row.session.provider || t('shell.projects.untitledSession'),
          projectName: group.project?.name,
          updatedAt: row.updatedAt,
          session: row.session
        })
      }
    }
  }

  for (const row of groups.value.home.rows) {
    if (row.kind === 'conversation') {
      list.push({
        key: row.key,
        kind: 'conversation',
        id: row.conversation.id,
        title: row.conversation.title || t('shell.history.untitled'),
        updatedAt: row.updatedAt
      })
    } else {
      list.push({
        key: row.key,
        kind: 'session',
        title: row.session.title || row.session.provider || t('shell.projects.untitledSession'),
        updatedAt: row.updatedAt,
        session: row.session
      })
    }
  }

  return list.sort((a, b) => b.updatedAt - a.updatedAt)
})

function shortTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return t('shell.projects.railUntitled')

  const emojiMatch = /^\p{Extended_Pictographic}/u.exec(trimmed)
  if (emojiMatch) return emojiMatch[0]

  const isCjk = /[\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(trimmed)
  if (isCjk) {
    return trimmed.slice(0, 2)
  }

  return trimmed.slice(0, 3)
}

function formatRowTime(timestamp?: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) {
    return date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(locale.value, { month: 'numeric', day: 'numeric' })
}

function onRailRowClick(row: RailConversationRow): void {
  if (row.kind === 'conversation' && row.id) {
    openConversation(row.id)
  } else if (row.kind === 'session' && row.session) {
    void continueSession(row.session)
  }
}
</script>

<template>
  <nav class="ShellConversationList" :aria-label="t('shell.history.label')">
    <!--
      Built from the loaded Projects section's own boxes — its section, its header, rows on the shared
      row metrics with a square in the icon column and a bar in the name column, on a line of the
      name's type — so each placeholder sits where the real title and folders land and nothing moves
      when the data arrives.
    -->
    <div
      v-if="showSkeleton"
      class="ShellConversationList-Section ShellConversationList-Skeleton"
      aria-hidden="true"
    >
      <template v-if="collapsed">
        <TxSkeleton v-for="i in 3" :key="i" :width="38" :height="32" :radius="6" />
      </template>
      <template v-else>
        <div class="ShellConversationList-SectionHeader">
          <TxSkeleton :width="56" :height="9" :radius="3" />
        </div>
        <div
          v-for="width in SKELETON_NAME_WIDTHS"
          :key="width"
          class="ShellConversationList-SkeletonRow"
        >
          <TxSkeleton width="var(--shell-row-icon)" height="var(--shell-row-icon)" :radius="4" />
          <div class="ShellConversationList-SkeletonName">
            <TxSkeleton :width="width" :height="10" :radius="3" />
          </div>
        </div>
      </template>
    </div>

    <!-- Rail mode: compact buttons with hover popover -->
    <div v-else-if="collapsed" class="ShellConversationList-RailList">
      <TxPopover
        v-for="row in railRows"
        :key="row.key"
        trigger="hover"
        placement="right"
        :offset="10"
        :open-delay="100"
        :close-delay="80"
        panel-shadow="soft"
      >
        <template #reference>
          <button
            class="ShellConversationList-RailItem"
            :class="{
              active: row.kind === 'conversation' && row.id === activeId,
              'is-loading': Boolean(row.id && isConversationLoading(row.id))
            }"
            type="button"
            :aria-label="row.title"
            @click="onRailRowClick(row)"
          >
            <span class="ShellConversationList-RailShortTitle">{{ shortTitle(row.title) }}</span>
            <span
              v-if="row.id && isConversationLoading(row.id)"
              class="ShellConversationList-RailLoadingDot"
              aria-hidden="true"
            />
          </button>
        </template>

        <div class="ShellConversationList-RailPopover">
          <div class="ShellConversationList-RailPopoverHeader">
            <span class="ShellConversationList-RailPopoverTitle">{{ row.title }}</span>
            <span
              v-if="row.id && isConversationLoading(row.id)"
              class="ShellConversationList-RailPopoverLoading"
            >
              {{ t('shell.history.loading') }}
            </span>
            <button
              v-if="row.kind === 'conversation' && row.id"
              class="ShellConversationList-RailPopoverDelete"
              :title="t('shell.history.delete')"
              :aria-label="t('shell.history.delete')"
              @click.stop="removeConversation(row.id)"
            >
              <span class="i-ri-delete-bin-6-line" />
            </button>
          </div>
          <div
            v-if="row.projectName || formatRowTime(row.updatedAt)"
            class="ShellConversationList-RailPopoverMeta"
          >
            <span v-if="row.projectName" class="ShellConversationList-RailPopoverProject">
              <i class="i-ri-folder-2-line" />
              {{ row.projectName }}
            </span>
            <span v-if="formatRowTime(row.updatedAt)" class="ShellConversationList-RailPopoverTime">
              {{ formatRowTime(row.updatedAt) }}
            </span>
          </div>
        </div>
      </TxPopover>
    </div>

    <template v-else>
      <!-- Always present, even with no projects: the section title's + is where new projects start. -->
      <section class="ShellConversationList-Section ShellConversationList-Section--projects">
        <div class="ShellConversationList-SectionHeader">
          <span class="ShellConversationList-SectionTitle">{{ t('shell.projects.section') }}</span>
          <MetaHintBadge command="new-project" />
          <button
            class="ShellConversationList-SectionAction"
            type="button"
            :title="t('shell.newProject')"
            :aria-label="t('shell.newProject')"
            @click="enterPickedProjectConversation"
          >
            <span class="i-ri-add-line" />
          </button>
        </div>

        <template v-for="group in groups.active" :key="group.key">
          <ShellProjectFolder
            v-if="group.project"
            :project="group.project"
            :rows="group.rows"
            :active-id="activeId"
            :current="group.project.id === currentProjectId"
            :expanded="folders.isExpanded(group.project.id)"
            :renaming="renamingProjectId === group.project.id"
            :discovering-project-id="discoveringProjectId"
            @toggle="folders.toggle(group.project.id)"
            @enter="enterConversation(group.project.id)"
            @run-agent="openProjectAgent(group.project.id, $event)"
            @discover="discoverSessions(group.project)"
            @begin-rename="beginRename(group.project)"
            @rename="saveRename(group.project, $event)"
            @cancel-rename="cancelRename"
            @toggle-pinned="togglePinned(group.project)"
            @toggle-archived="toggleArchived(group.project)"
            @open-conversation="openConversation"
            @remove-conversation="removeConversation"
            @continue-session="continueSession"
            @forget-session="forgetSession"
          />
        </template>

        <!-- Only once the load has settled: before that, no folders means "not known yet". -->
        <button
          v-if="loaded && !groups.active.length"
          class="ShellConversationList-NewFromFolder"
          type="button"
          @click="enterPickedProjectConversation"
        >
          <span class="ShellConversationList-NewFromFolderIcon i-ri-folder-add-line" />
          <span class="ShellConversationList-NewFromFolderLabel">
            {{ t('shell.projects.newFromFolder') }}
          </span>
        </button>
      </section>

      <section
        v-if="groups.home.rows.length"
        class="ShellConversationList-Section ShellConversationList-Section--chats"
      >
        <div class="ShellConversationList-SectionHeader">
          <span class="ShellConversationList-SectionTitle">{{ t('shell.projects.chats') }}</span>
          <MetaHintBadge command="new-chat" />
          <!-- The Projects title's + in the same place, for a new chat outside every project. -->
          <button
            class="ShellConversationList-SectionAction ShellConversationList-SectionAction--reveal"
            type="button"
            :title="t('shell.newChat')"
            :aria-label="t('shell.newChat')"
            @click="enterConversation(null)"
          >
            <span class="i-ri-add-line" />
          </button>
        </div>
        <ShellProjectRows
          :rows="groups.home.rows"
          :active-id="activeId"
          @open-conversation="openConversation"
          @remove-conversation="removeConversation"
          @continue-session="continueSession"
          @forget-session="forgetSession"
        />
      </section>

      <section v-if="groups.archived.length" class="ShellConversationList-Archived">
        <button
          class="ShellConversationList-ArchivedToggle"
          type="button"
          :aria-expanded="archivedOpen"
          @click="archivedOpen = !archivedOpen"
        >
          <span :class="archivedOpen ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'" />
          {{ t('shell.projects.archived') }}
        </button>
        <div v-if="archivedOpen" class="ShellConversationList-ArchivedBody">
          <template v-for="group in groups.archived" :key="group.key">
            <ShellProjectFolder
              v-if="group.project"
              :project="group.project"
              :rows="group.rows"
              :active-id="activeId"
              :current="group.project.id === currentProjectId"
              archived
              @toggle-archived="toggleArchived(group.project)"
              @open-conversation="openConversation"
              @remove-conversation="removeConversation"
              @continue-session="continueSession"
              @forget-session="forgetSession"
            />
          </template>
        </div>
      </section>
    </template>
  </nav>
</template>

<style lang="scss" scoped>
.ShellConversationList {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-height: 0;
  // With the column's own 6px gap, the first section title sits as far below the nav as the
  // sections sit from each other.
  padding-top: 6px;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 2px;
    transition: background-color 0.2s ease;
  }

  &:hover {
    scrollbar-color: var(--shell-border-strong) transparent;

    &::-webkit-scrollbar-thumb {
      background: var(--shell-border-strong);
    }
  }
  .is-rail & {
    gap: 4px;
    align-items: center;
    padding-top: 2px;
  }
}

.ShellConversationList-Section,
.ShellConversationList-ArchivedBody {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/**
 * Shorter than a row and set in caption type, so it reads as a label over the rows rather than as
 * one of them. The title starts where a row's first column does (its 1px border plus the row
 * padding): under the nav icons, and level with the Chats rows' text.
 */
.ShellConversationList-SectionHeader {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  min-height: 24px;
  padding-left: calc(var(--shell-row-pad-x) + 1px);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  letter-spacing: 0.4px;
}

.ShellConversationList-SectionTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/** Right edge on the folder rows' ⋯ column: their 1px border plus 3px margin. */
.ShellConversationList-SectionAction {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 4px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-md);
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:hover {
    color: var(--shell-text-regular);
    background: var(--shell-surface-2);
  }
}

/**
 * The Chats title's +, out of sight until it can be wanted: the pointer over the title, the button
 * focused from the keyboard, or the command key held, so its ⌘N badge has a button to label. It
 * keeps its box while hidden, so showing it moves nothing.
 */
.ShellConversationList-SectionAction--reveal {
  opacity: 0;
  transition: opacity 0.15s ease;

  .ShellConversationList-SectionHeader:hover &,
  .ShellConversationList-SectionHeader:has(.MetaHintBadge) &,
  &:focus-visible {
    opacity: 1;
  }
}

/**
 * A folder row's box, which is ShellNavItem's: its 1px transparent border and the shared row padding
 * and gap. Like those rows it declares no height: the icon square and the name column give it one, as
 * a nav row's icon and label give it its height. That puts the square in the icon column and the bar
 * in the name column, on the lines where the folder rows that replace them are drawn.
 */
.ShellConversationList-SkeletonRow {
  display: flex;
  gap: var(--shell-row-gap);
  align-items: center;
  padding: var(--shell-row-pad-y) var(--shell-row-pad-x);
  border: 1px solid transparent;
}

/**
 * One line of a folder name: the name's type, the line-height the column inherits, `1lh` tall. That
 * line, not the 16px icon, is the tallest thing in a loaded row — 19.5px of 13px type at the page's
 * 1.5, which makes rows 33.5px — so a placeholder row built on it is exactly as tall as the row it
 * stands in for, and neither number is written down here.
 */
.ShellConversationList-SkeletonName {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  height: 1lh;
  font-size: var(--shell-fs-body);
}

/** Laid out as a nav row, in muted ink: an offer, not an item. */
.ShellConversationList-NewFromFolder {
  display: flex;
  gap: var(--shell-row-gap);
  align-items: center;
  width: 100%;
  padding: var(--shell-row-pad-y) var(--shell-row-pad-x);
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-muted);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-regular);
  }
}

.ShellConversationList-NewFromFolderIcon {
  flex: 0 0 auto;
  width: var(--shell-row-icon);
  min-width: var(--shell-row-icon);
  height: var(--shell-row-icon);
  min-height: var(--shell-row-icon);
  font-size: var(--shell-row-icon);
}

.ShellConversationList-NewFromFolderLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ShellConversationList-ArchivedToggle {
  display: flex;
  gap: 4px;
  align-items: center;
  width: 100%;
  min-height: 24px;
  padding: 0 0 0 calc(var(--shell-row-pad-x) + 1px);
  border: none;
  background: transparent;
  color: var(--shell-text-muted);
  font: inherit;
  font-size: var(--shell-fs-caption);
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.ShellConversationList-ArchivedBody {
  margin-top: 2px;
}

.ShellConversationList-RailList {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  width: 100%;
}

.ShellConversationList-RailItem {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 38px;
  height: 32px;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  user-select: none;
  -webkit-app-region: no-drag;

  &:hover:not(.active) {
    background: var(--shell-surface-2);
  }

  &.active {
    border-color: transparent;
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &.is-loading {
    border-color: color-mix(in srgb, var(--shell-primary) 32%, transparent);
    animation: shell-rail-glow-pulse 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;

    &::before {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      padding: 1px;
      background: conic-gradient(
        from var(--shell-rail-spin-angle, 0deg) in srgb,
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
      animation: shell-rail-spin-angle 2.4s linear infinite;
      z-index: 2;
    }
  }
}

.ShellConversationList-RailShortTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.ShellConversationList-RailPopover {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 260px;
  min-width: 160px;
  padding: 8px 10px;
}

.ShellConversationList-RailPopoverHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ShellConversationList-RailPopoverTitle {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--shell-fs-body);
  font-weight: 500;
  color: var(--shell-text-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ShellConversationList-RailLoadingDot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--shell-primary);
  box-shadow: 0 0 5px var(--shell-primary);
  pointer-events: none;
  animation: shell-rail-dot-pulse 1.4s ease-in-out infinite;
  z-index: 3;
}

.ShellConversationList-RailPopoverLoading {
  flex: 0 0 auto;
  font-size: var(--shell-fs-caption);
  color: var(--shell-primary);
  font-weight: 500;
}

@property --shell-rail-spin-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes shell-rail-spin-angle {
  to {
    --shell-rail-spin-angle: 360deg;
  }
}

@keyframes shell-rail-glow-pulse {
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

@keyframes shell-rail-dot-pulse {
  0%,
  100% {
    transform: scale(0.85);
    opacity: 0.65;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ShellConversationList-RailItem.is-loading {
    animation: none;
    border-color: var(--shell-primary-border);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);

    &::before {
      display: none;
    }
  }

  .ShellConversationList-RailLoadingDot {
    animation: none;
  }
}

.ShellConversationList-RailPopoverDelete {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-md);
  cursor: pointer;

  &:hover {
    color: var(--shell-danger, #ef4444);
    background: var(--shell-surface-2);
  }
}

.ShellConversationList-RailPopoverMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--shell-fs-caption);
  color: var(--shell-text-muted);
}

.ShellConversationList-RailPopoverProject {
  display: flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ShellConversationList-RailPopoverTime {
  flex-shrink: 0;
  margin-left: auto;
}
</style>

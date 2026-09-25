<script lang="ts" name="ShellConversationList" setup>
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { omniPanelShowEvent } from '../../../../shared/events/omni-panel'
import { projectConversationGroups } from '~/modules/conversation/conversation-project-groups'
import { useConversationEntry } from '~/modules/conversation/useConversationEntry'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { blankConversationOwner, useProjectFolders } from '~/modules/layout/useProjectFolders'
import { useProjectStore } from '~/stores/projects'
import MetaHintBadge from './MetaHintBadge.vue'
import ShellProjectFolder from './ShellProjectFolder.vue'
import ShellProjectRows from './ShellProjectRows.vue'

const { t } = useI18n()
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

async function openProjectAgent(projectId: string): Promise<void> {
  await transport.send(omniPanelShowEvent, {
    captureSelection: false,
    source: 'project-local-ai',
    localAi: { projectId }
  })
}

async function continueSession(session: LocalAiCliSessionSummary): Promise<void> {
  if (session.state !== 'available') return
  await transport.send(omniPanelShowEvent, {
    captureSelection: false,
    source: 'project-local-ai',
    localAi: {
      projectId: session.projectId ?? undefined,
      sessionRef: session.sessionRef,
      provider: session.provider
    }
  })
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
            @run-agent="openProjectAgent(group.project.id)"
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

  .is-rail & {
    display: none;
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
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    color: var(--shell-text-regular);
    background: var(--shell-surface-2);
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
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
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
</style>

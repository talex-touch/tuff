<script lang="ts" name="ShellConversationList" setup>
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { omniPanelShowEvent } from '../../../../shared/events/omni-panel'
import { projectConversationGroups } from '~/modules/conversation/conversation-project-groups'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { useProjectStore } from '~/stores/projects'
import ShellProjectRows from './ShellProjectRows.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const transport = useTuffTransport()
const history = useConversationHistory()
const projectStore = useProjectStore()
const { projects, localAiSessions, loading: projectsLoading } = storeToRefs(projectStore)
const archivedOpen = ref(false)
const renamingProjectId = ref<string | null>(null)
const renameValue = ref('')
const openProjectMenuId = ref<string | null>(null)

onMounted(() => {
  void Promise.all([history.refresh(), projectStore.initialize()])
})

const groups = computed(() =>
  projectConversationGroups(projects.value, history.conversations.value, localAiSessions.value)
)
const activeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
const showSkeleton = computed(
  () =>
    (history.loading.value || projectsLoading.value) &&
    history.conversations.value.length === 0 &&
    projects.value.length === 0
)
const hasRows = computed(
  () =>
    groups.value.home.rows.length > 0 ||
    groups.value.active.length > 0 ||
    groups.value.archived.length > 0
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

async function beginProjectConversation(projectId: string): Promise<void> {
  projectStore.beginConversation(projectId)
  await router.push('/home')
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
  renameValue.value = project.name
}

function cancelRename(): void {
  renamingProjectId.value = null
  renameValue.value = ''
}

async function saveRename(project: ProjectRecord): Promise<void> {
  try {
    await projectStore.rename(project.id, renameValue.value)
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

function setProjectMenu(projectId: string, open: boolean): void {
  openProjectMenuId.value = open ? projectId : null
}
</script>

<template>
  <nav
    v-if="showSkeleton || hasRows"
    class="ShellConversationList"
    :aria-label="t('shell.history.label')"
  >
    <div v-if="showSkeleton" class="ShellConversationList-Skeleton" aria-hidden="true">
      <TxSkeleton :width="56" :height="9" :radius="3" />
      <TxSkeleton :lines="3" :height="28" :radius="8" :gap="4" />
    </div>

    <template v-else>
      <section v-if="groups.home.rows.length" class="ShellConversationList-Group">
        <div class="ShellConversationList-GroupHeader">
          <span>{{ t('shell.projects.home') }}</span>
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

      <section v-for="group in groups.active" :key="group.key" class="ShellConversationList-Group">
        <div
          v-if="group.project"
          class="ShellConversationList-GroupHeader ShellConversationList-ProjectHeader"
        >
          <input
            v-if="renamingProjectId === group.project.id"
            v-model="renameValue"
            class="ShellConversationList-Rename"
            type="text"
            autofocus
            :aria-label="t('shell.projects.rename')"
            @keydown.enter.prevent="saveRename(group.project)"
            @keydown.escape.prevent="cancelRename"
          />
          <span v-else :title="group.project.rootPath">{{ group.project.name }}</span>
          <TxDropdownMenu
            :model-value="openProjectMenuId === group.project.id"
            placement="bottom-end"
            @update:model-value="setProjectMenu(group.project.id, $event)"
          >
            <template #trigger>
              <button
                class="ShellConversationList-More"
                type="button"
                :aria-label="t('shell.projects.projectActions')"
              >
                <span class="i-ri-more-2-fill" />
              </button>
            </template>
            <TxDropdownItem @select="beginProjectConversation(group.project.id)">
              {{ t('shell.projects.newChat') }}
            </TxDropdownItem>
            <TxDropdownItem @select="openProjectAgent(group.project.id)">
              {{ t('shell.projects.runLocalAgent') }}
            </TxDropdownItem>
            <TxDropdownItem @select="beginRename(group.project)">
              {{ t('shell.projects.rename') }}
            </TxDropdownItem>
            <TxDropdownItem @select="togglePinned(group.project)">
              {{ group.project.pinned ? t('shell.projects.unpin') : t('shell.projects.pin') }}
            </TxDropdownItem>
            <TxDropdownItem @select="toggleArchived(group.project)">
              {{ t('shell.projects.archive') }}
            </TxDropdownItem>
          </TxDropdownMenu>
        </div>
        <ShellProjectRows
          :rows="group.rows"
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
          <div
            v-for="group in groups.archived"
            :key="group.key"
            class="ShellConversationList-Group"
          >
            <div
              v-if="group.project"
              class="ShellConversationList-GroupHeader ShellConversationList-ProjectHeader"
            >
              <span :title="group.project.rootPath">{{ group.project.name }}</span>
              <TxDropdownMenu placement="bottom-end">
                <template #trigger>
                  <button
                    class="ShellConversationList-More"
                    type="button"
                    :aria-label="t('shell.projects.projectActions')"
                  >
                    <span class="i-ri-more-2-fill" />
                  </button>
                </template>
                <TxDropdownItem @select="toggleArchived(group.project)">
                  {{ t('shell.projects.unarchive') }}
                </TxDropdownItem>
              </TxDropdownMenu>
            </div>
            <ShellProjectRows
              :rows="group.rows"
              :active-id="activeId"
              dispatch-disabled
              @open-conversation="openConversation"
              @remove-conversation="removeConversation"
              @continue-session="continueSession"
              @forget-session="forgetSession"
            />
          </div>
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
  gap: 6px;
  width: 100%;
  min-height: 0;
  overflow-y: auto;

  .is-rail & {
    display: none;
  }
}

.ShellConversationList-Skeleton,
.ShellConversationList-Group,
.ShellConversationList-ArchivedBody {
  display: flex;
  flex-direction: column;
}

.ShellConversationList-Skeleton {
  gap: 8px;
  padding: 8px 10px 4px;
}

.ShellConversationList-Group {
  gap: 2px;
}

.ShellConversationList-GroupHeader {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 8px 6px 4px 10px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  letter-spacing: 0.4px;

  > span:first-child {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.ShellConversationList-More {
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
  transition:
    opacity 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:focus-visible,
  .ShellConversationList-ProjectHeader:hover & {
    opacity: 1;
  }
}

.ShellConversationList-Rename {
  width: 100%;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid var(--shell-primary);
  border-radius: var(--shell-radius-sm);
  outline: none;
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font: inherit;
  -webkit-app-region: no-drag;
}

.ShellConversationList-ArchivedToggle {
  display: flex;
  gap: 4px;
  align-items: center;
  width: 100%;
  padding: 8px 10px 4px;
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
  gap: 4px;
}
</style>

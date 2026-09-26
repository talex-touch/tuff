import type { WatchSource } from 'vue'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { computed, watch } from 'vue'
import { appSetting } from '~/modules/storage/app-storage'

/**
 * Which project folders in the sidebar are open.
 *
 * The state lives in `appSetting.shell.expandedProjectIds`, beside the sidebar width, so a folder
 * the user opened is still open after a restart. It is a rendering preference only: opening a
 * folder changes nothing about the project or its conversations.
 */

/**
 * Who owns the blank conversation on screen, which is what decides the sidebar's one "current" row.
 *
 * - `undefined` — not the blank Home conversation: a stored thread lights its own row, and any other
 *   page lights its own nav item.
 * - `null` — a blank conversation outside every project: New Chat is current.
 * - a project id — a blank conversation inside that project: its folder row is current.
 *
 * New Chat and the folder rows live in two components. Both read this, so the rule that keeps them
 * from lighting up together exists once.
 */
export function blankConversationOwner(
  path: string,
  activeProjectId: string | null
): string | null | undefined {
  return path === '/home' ? activeProjectId : undefined
}

/**
 * The persisted ids, tolerating every shape the file on disk can hold. App settings hydrate one
 * level deep, so a `shell` block saved before this field existed replaces the default wholesale and
 * the field is simply absent; a hand-edited file can hold anything at all.
 */
export function readExpandedProjectIds(): string[] {
  const shell = appSetting.shell as { expandedProjectIds?: unknown } | undefined
  const stored = shell?.expandedProjectIds
  if (!Array.isArray(stored)) return []
  return [...new Set(stored.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

/** Always a fresh array, so the auto-saving settings store sees exactly one change per write. */
function writeExpandedProjectIds(ids: string[]): void {
  // Configs from before the `shell` block exist, and the storage layer hands back what is on disk.
  if (!appSetting.shell || typeof appSetting.shell !== 'object') {
    appSetting.shell = { ...appSettingOriginData.shell, expandedProjectIds: ids }
    return
  }
  appSetting.shell.expandedProjectIds = ids
}

/**
 * The project the follow-watcher last saw. Module scope rather than per call: the conversation list
 * unmounts whenever the sidebar swaps to the settings rail, and a remount must not count as the
 * current project changing — that would reopen a folder the user had just closed. A project that
 * genuinely became current while the list was away (⌘⇧N from settings) still differs from this, so
 * it still opens.
 */
let followedProjectId: string | null | undefined

export interface ProjectFolderSources {
  /** Project of the conversation on screen. Becoming a project opens that project's folder. */
  activeProjectId: WatchSource<string | null>
  /** Every known project, archived ones included. Each fresh snapshot drops ids that left it. */
  projects: WatchSource<readonly { id: string }[]>
}

export interface ProjectFolders {
  isExpanded: (projectId: string) => boolean
  toggle: (projectId: string) => void
  expand: (projectId: string) => void
  /** Forgets ids outside `liveIds`. Writes only when something was actually dropped. */
  prune: (liveIds: Iterable<string>) => void
}

/**
 * @param sources - Pass these from the component that renders the folders: it installs the two
 * watchers — open the current project's folder, prune after each project list load — in that
 * component's scope.
 */
export function useProjectFolders(sources?: ProjectFolderSources): ProjectFolders {
  const expandedIds = computed(() => new Set(readExpandedProjectIds()))

  function isExpanded(projectId: string): boolean {
    return expandedIds.value.has(projectId)
  }

  function setExpanded(projectId: string, expanded: boolean): void {
    const current = readExpandedProjectIds()
    if (current.includes(projectId) === expanded) return
    writeExpandedProjectIds(
      expanded ? [...current, projectId] : current.filter((id) => id !== projectId)
    )
  }

  function toggle(projectId: string): void {
    setExpanded(projectId, !isExpanded(projectId))
  }

  function expand(projectId: string): void {
    setExpanded(projectId, true)
  }

  function prune(liveIds: Iterable<string>): void {
    const live = new Set(liveIds)
    const current = readExpandedProjectIds()
    const kept = current.filter((id) => live.has(id))
    if (kept.length !== current.length) writeExpandedProjectIds(kept)
  }

  if (sources) {
    // Only a change opens a folder: closing the current project's folder has to stick until the
    // user moves to another conversation.
    watch(
      sources.activeProjectId,
      (projectId) => {
        if (projectId === followedProjectId) return
        followedProjectId = projectId
        if (projectId) expand(projectId)
      },
      { immediate: true }
    )

    // Deliberately not immediate: until the store's first load lands, `projects` is its empty
    // placeholder, and pruning against that would close every folder on every start. A failed
    // load keeps the previous snapshot, so it never fires this either.
    watch(sources.projects, (projects) => prune(projects.map((project) => project.id)))
  }

  return { isExpanded, toggle, expand, prune }
}

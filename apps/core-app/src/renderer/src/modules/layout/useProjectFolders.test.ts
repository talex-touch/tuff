import type { EffectScope, Ref } from 'vue'
import type { ProjectFolders } from './useProjectFolders'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'

const appSettingTarget: Record<string, unknown> = {}

vi.mock('~/modules/storage/app-storage', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return { appSetting: vue.reactive(appSettingTarget) }
})

const { blankConversationOwner, readExpandedProjectIds, useProjectFolders } =
  await import('./useProjectFolders')

function resetSettings(shell?: Record<string, unknown>): void {
  for (const key of Object.keys(appSettingTarget)) delete appSettingTarget[key]
  if (shell) appSettingTarget.shell = reactive(shell)
}

function storedIds(): unknown {
  return (appSettingTarget.shell as { expandedProjectIds?: unknown } | undefined)
    ?.expandedProjectIds
}

/**
 * Mounts the folders the way the conversation list does, in a scope that `stop()` tears down like an
 * unmount. Every test starts from `activeProjectId: null`, which is also where a fresh store starts.
 */
function mountFolders(
  activeProjectId: Ref<string | null>,
  projects: Ref<{ id: string }[]>
): { folders: ProjectFolders; scope: EffectScope } {
  const scope = effectScope()
  const folders = scope.run(() =>
    useProjectFolders({ activeProjectId, projects: () => projects.value })
  )!
  return { folders, scope }
}

describe('blankConversationOwner', () => {
  it('names the owner only on the blank Home conversation', () => {
    expect(blankConversationOwner('/home', null)).toBeNull()
    expect(blankConversationOwner('/home', 'p1')).toBe('p1')
    expect(blankConversationOwner('/home/c/c1', 'p1')).toBeUndefined()
    expect(blankConversationOwner('/store', null)).toBeUndefined()
  })
})

describe('useProjectFolders', () => {
  beforeEach(() => {
    resetSettings()
  })

  it('starts collapsed on configs that predate the field or hold something else', () => {
    expect(readExpandedProjectIds()).toEqual([])

    resetSettings({ sidebarWidth: 260, sidebarCollapsed: false })
    expect(readExpandedProjectIds()).toEqual([])

    resetSettings({ expandedProjectIds: 'p1' })
    expect(readExpandedProjectIds()).toEqual([])

    resetSettings({ expandedProjectIds: ['p1', 4, '', null, 'p1', 'p2'] })
    expect(readExpandedProjectIds()).toEqual(['p1', 'p2'])
  })

  it('creates the shell block on the first toggle instead of dropping it', () => {
    const { folders, scope } = mountFolders(ref(null), ref([]))

    folders.toggle('p1')

    expect(appSettingTarget.shell).toMatchObject({
      sidebarWidth: 260,
      sidebarCollapsed: false,
      expandedProjectIds: ['p1']
    })
    expect(folders.isExpanded('p1')).toBe(true)

    folders.toggle('p1')
    expect(storedIds()).toEqual([])
    expect(folders.isExpanded('p1')).toBe(false)
    scope.stop()
  })

  it('keeps the rest of an existing shell block and writes a new list each time', () => {
    resetSettings({ sidebarWidth: 330, sidebarCollapsed: true, expandedProjectIds: ['p1'] })
    const before = storedIds()
    const { folders, scope } = mountFolders(ref(null), ref([]))

    folders.expand('p2')

    expect(storedIds()).toEqual(['p1', 'p2'])
    expect(storedIds()).not.toBe(before)
    expect(appSettingTarget.shell).toMatchObject({ sidebarWidth: 330, sidebarCollapsed: true })

    const afterExpand = storedIds()
    folders.expand('p2')
    expect(storedIds()).toBe(afterExpand)
    scope.stop()
  })

  it('opens the folder of the project that becomes current, and only on a change', async () => {
    const active = ref<string | null>(null)
    const { folders, scope } = mountFolders(active, ref([]))

    active.value = 'p1'
    await nextTick()
    expect(folders.isExpanded('p1')).toBe(true)

    // Closing the current project's folder sticks; nothing re-opens it until the project changes.
    folders.toggle('p1')
    await nextTick()
    expect(folders.isExpanded('p1')).toBe(false)

    active.value = null
    await nextTick()
    active.value = 'p1'
    await nextTick()
    expect(folders.isExpanded('p1')).toBe(true)
    scope.stop()
  })

  it('does not treat a remount as the current project changing', async () => {
    const active = ref<string | null>(null)
    const first = mountFolders(active, ref([]))
    active.value = 'p1'
    await nextTick()
    first.folders.toggle('p1')
    first.scope.stop()

    const second = mountFolders(active, ref([]))
    await nextTick()
    expect(second.folders.isExpanded('p1')).toBe(false)

    // A project that became current while the list was away still opens when it comes back.
    second.scope.stop()
    active.value = 'p2'
    const third = mountFolders(active, ref([]))
    await nextTick()
    expect(third.folders.isExpanded('p2')).toBe(true)
    third.scope.stop()
  })

  it('prunes ids whose project left the loaded list, and writes only when it dropped one', async () => {
    resetSettings({ expandedProjectIds: ['p1', 'gone'] })
    const projects = ref<{ id: string }[]>([])
    const { scope } = mountFolders(ref(null), projects)

    // The empty placeholder before the first load must not count as "every project is gone".
    await nextTick()
    expect(storedIds()).toEqual(['p1', 'gone'])

    projects.value = [{ id: 'p1' }, { id: 'p2' }]
    await nextTick()
    expect(storedIds()).toEqual(['p1'])

    const kept = storedIds()
    projects.value = [{ id: 'p1' }, { id: 'p3' }]
    await nextTick()
    expect(storedIds()).toBe(kept)
    scope.stop()
  })
})

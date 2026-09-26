import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import type { LocalAiAgentChoice, LocalAiAgentsPhase } from '~/modules/conversation/local-ai-agents'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createLocalAiCliSdk } from '@talex-touch/utils/transport/sdk/domains/local-ai-cli'
import { createProjectSdk } from '@talex-touch/utils/transport/sdk/domains/project'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isLocalAiCliStatus, localAiAgentChoices } from '~/modules/conversation/local-ai-agents'

export const useProjectStore = defineStore('projects', () => {
  const transport = useTuffTransport()
  const projectSdk = createProjectSdk(transport)
  const localAiSdk = createLocalAiCliSdk(transport)
  const projects = ref<ProjectRecord[]>([])
  const localAiSessions = ref<LocalAiCliSessionSummary[]>([])
  const localAiAgents = ref<LocalAiAgentChoice[]>([])
  const localAiAgentsPhase = ref<LocalAiAgentsPhase>('loading')
  /**
   * Whether this build offers local agents at all (the macOS beta gate): `null` until a status
   * read succeeds. Project menus leave the whole 「本机代理」 group out when it is `false`.
   */
  const localAiBetaAvailable = ref<boolean | null>(null)
  const loading = ref(false)
  const pendingProjectId = ref<string | null | undefined>(undefined)
  const activeProjectId = ref<string | null>(null)
  let initialized = false
  let disposeProjectChanged: (() => void) | null = null
  let disposeSessionChanged: (() => void) | null = null
  let refreshGeneration = 0
  let localAiAgentsInFlight: Promise<void> | null = null

  async function refresh(): Promise<void> {
    const generation = ++refreshGeneration
    loading.value = true
    try {
      const [nextProjects, nextSessions] = await Promise.all([
        projectSdk.list(),
        localAiSdk.session.list()
      ])
      if (generation !== refreshGeneration) return
      // Both SDK calls are typed as arrays, but a channel error reply resolves as `undefined`
      // rather than rejecting, so a snapshot that is not a pair of arrays must never replace the
      // last good one -- an undefined `localAiSessions` broke every consumer of this store.
      if (!Array.isArray(nextProjects) || !Array.isArray(nextSessions)) return
      projects.value = nextProjects
      localAiSessions.value = nextSessions
    } catch {
      // Keep the last SQLite snapshot visible; the next typed change notification retries.
    } finally {
      if (generation === refreshGeneration) loading.value = false
    }
  }

  async function initialize(): Promise<void> {
    if (!initialized) {
      initialized = true
      disposeProjectChanged = projectSdk.onChanged(() => {
        void refresh()
      })
      disposeSessionChanged = localAiSdk.session.onChanged(() => {
        void refresh()
      })
    }
    await refresh()
  }

  async function selectDirectory(): Promise<ProjectRecord | null> {
    const project = await projectSdk.selectDirectory()
    if (project) await refresh()
    return project
  }

  async function rename(id: string, name: string): Promise<ProjectRecord> {
    const project = await projectSdk.rename(id, name)
    await refresh()
    return project
  }

  async function setPinned(id: string, pinned: boolean): Promise<ProjectRecord> {
    const project = await projectSdk.setPinned(id, pinned)
    await refresh()
    return project
  }

  async function setArchived(id: string, archived: boolean): Promise<ProjectRecord> {
    const project = await projectSdk.setArchived(id, archived)
    await refresh()
    return project
  }

  async function discoverSessions(projectId: string) {
    const result = await localAiSdk.session.discover(projectId)
    await refresh()
    return result
  }

  async function forgetSession(sessionRef: string): Promise<boolean> {
    const result = await localAiSdk.session.forget(sessionRef)
    if (result.forgotten) await refresh()
    return result.forgotten
  }

  async function loadLocalAiAgents(): Promise<void> {
    if (localAiAgentsPhase.value === 'failed') localAiAgentsPhase.value = 'loading'
    try {
      const status: unknown = await localAiSdk.getStatus()
      if (!isLocalAiCliStatus(status)) throw new Error('LOCAL_AI_CLI_STATUS_INVALID')
      localAiBetaAvailable.value = status.betaAvailable
      const agents = localAiAgentChoices(status)
      localAiAgents.value = agents
      localAiAgentsPhase.value = agents.length > 0 ? 'ready' : 'none'
    } catch {
      // A list already on screen stays: one failed read says nothing new about what is installed.
      if (localAiAgentsPhase.value === 'loading') localAiAgentsPhase.value = 'failed'
    }
  }

  /**
   * Which local agent CLIs a project can be opened in, read afresh each time a project menu opens:
   * a CLI can be installed, or switched off in Settings, while the app runs. A call made while a
   * read is in flight joins it, because every read makes the main process probe each CLI's version.
   */
  function refreshLocalAiAgents(): Promise<void> {
    localAiAgentsInFlight ??= loadLocalAiAgents().finally(() => {
      localAiAgentsInFlight = null
    })
    return localAiAgentsInFlight
  }

  /**
   * Reads the agent status once, so project menus know whether to offer the 「本机代理」 group
   * before they are opened. With the beta off the main process answers without probing any CLI.
   */
  function ensureLocalAiStatus(): void {
    if (localAiBetaAvailable.value === null) void refreshLocalAiAgents()
  }

  function beginConversation(projectId: string | null): void {
    pendingProjectId.value = projectId
    activeProjectId.value = projectId
  }

  function setActiveProjectId(projectId: string | null): void {
    activeProjectId.value = projectId
  }

  function consumePendingProjectId(): string | null {
    const projectId = pendingProjectId.value
    pendingProjectId.value = undefined
    if (projectId !== undefined) {
      activeProjectId.value = projectId
    }
    return projectId ?? null
  }

  function dispose(): void {
    disposeProjectChanged?.()
    disposeSessionChanged?.()
    disposeProjectChanged = null
    disposeSessionChanged = null
    initialized = false
  }

  return {
    projects,
    localAiSessions,
    localAiAgents,
    localAiAgentsPhase,
    localAiBetaAvailable,
    loading,
    pendingProjectId,
    activeProjectId,
    setActiveProjectId,
    initialize,
    refresh,
    selectDirectory,
    rename,
    setPinned,
    setArchived,
    discoverSessions,
    forgetSession,
    refreshLocalAiAgents,
    ensureLocalAiStatus,
    beginConversation,
    consumePendingProjectId,
    dispose
  }
})

import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'

export type ConversationProjectRow =
  | { kind: 'conversation'; key: string; updatedAt: number; conversation: ConversationRecord }
  | { kind: 'session'; key: string; updatedAt: number; session: LocalAiCliSessionSummary }

export interface ConversationProjectGroup {
  key: string
  project: ProjectRecord | null
  rows: ConversationProjectRow[]
}

export interface ConversationProjectProjection {
  home: ConversationProjectGroup
  active: ConversationProjectGroup[]
  archived: ConversationProjectGroup[]
}

function orderProjects(left: ProjectRecord, right: ProjectRecord): number {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
  if (left.lastOpenedAt !== right.lastOpenedAt) return right.lastOpenedAt - left.lastOpenedAt
  return left.id.localeCompare(right.id)
}

export function projectConversationGroups(
  projects: readonly ProjectRecord[],
  conversations: readonly ConversationRecord[],
  sessions: readonly LocalAiCliSessionSummary[]
): ConversationProjectProjection {
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const rowsByProject = new Map<string, ConversationProjectRow[]>()
  const homeRows: ConversationProjectRow[] = []

  const append = (projectId: string | null, row: ConversationProjectRow): void => {
    if (!projectId || !projectsById.has(projectId)) {
      homeRows.push(row)
      return
    }
    const rows = rowsByProject.get(projectId)
    if (rows) rows.push(row)
    else rowsByProject.set(projectId, [row])
  }

  for (const conversation of conversations) {
    append(conversation.projectId, {
      kind: 'conversation',
      key: `conversation:${conversation.id}`,
      updatedAt: conversation.updatedAt,
      conversation
    })
  }
  for (const session of sessions) {
    append(session.projectId, {
      kind: 'session',
      key: `session:${session.sessionRef}`,
      updatedAt: session.lastSeenAt,
      session
    })
  }

  const toGroup = (project: ProjectRecord): ConversationProjectGroup => ({
    key: `project:${project.id}`,
    project,
    rows: [...(rowsByProject.get(project.id) ?? [])].sort(
      (left, right) => right.updatedAt - left.updatedAt || left.key.localeCompare(right.key)
    )
  })
  const orderedProjects = [...projects].sort(orderProjects)
  return {
    home: {
      key: 'home',
      project: null,
      rows: homeRows.sort(
        (left, right) => right.updatedAt - left.updatedAt || left.key.localeCompare(right.key)
      )
    },
    active: orderedProjects.filter((project) => !project.archived).map(toGroup),
    archived: orderedProjects.filter((project) => project.archived).map(toGroup)
  }
}

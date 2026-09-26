import type { ClipboardItem } from '@talex-touch/utils/transport/events'
import type {
  LocalAiCliProviderId,
  LocalAiCliSessionSummary
} from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import { classifyClipboardContent } from '@talex-touch/utils/clipboard'
import { orderProjects } from '~/modules/conversation/conversation-project-groups'

/** How far back a conversation or a local session still counts as something to pick up. */
export const HOME_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** How long a copied text is still "what you just copied". */
export const HOME_CLIPBOARD_FRESH_MS = 30 * 60 * 1000

export interface HomeProjectSignal {
  id: string
  name: string
  pinned: boolean
  lastOpenedAt: number
}

export interface HomeConversationSignal {
  id: string
  title: string
  /** The stored owner; may name a project that no longer exists, in which case `projectName` is null. */
  projectId: string | null
  projectName: string | null
  updatedAt: number
}

export interface HomeSessionSignal {
  sessionRef: string
  provider: LocalAiCliProviderId
  title: string
  projectId: string | null
  projectName: string | null
  lastSeenAt: number
}

/**
 * The one clipboard record Home may offer. Its text is only ever handed to the composer after the
 * user picks the row; nothing that builds the model summary reads it.
 */
export interface HomeClipboardSignal {
  id: number
  text: string
  createdAt: number
}

/**
 * Everything Home push knows about this machine, derived from renderer state that already exists:
 * the conversation history, the project store and one clipboard history row.
 */
export interface HomeSignals {
  /** Any stored conversation at all, however old — what switches the guide to 「为你准备」. */
  hasHistory: boolean
  /** Owner of the blank conversation on screen, when it is a project's. */
  activeProject: HomeProjectSignal | null
  /** Inside {@link HOME_RECENT_WINDOW_MS}, newest first, archived projects left out. */
  recentConversations: HomeConversationSignal[]
  /** Resumable (`available`) sessions inside the window, newest first, archived projects left out. */
  sessions: HomeSessionSignal[]
  /** Not archived, pinned first, then most recently opened — the sidebar's order. */
  projects: HomeProjectSignal[]
  clipboard: HomeClipboardSignal | null
}

export interface HomeSignalSources {
  conversations: readonly ConversationRecord[]
  projects: readonly ProjectRecord[]
  sessions: readonly LocalAiCliSessionSummary[]
  /** The newest text record from clipboard history — never a live system clipboard read. */
  clipboard: ClipboardItem | null
  activeProjectId: string | null
  now: number
}

function isWithin(timestamp: number, now: number, windowMs: number): boolean {
  return Number.isFinite(timestamp) && now - timestamp <= windowMs
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toProjectSignal(project: ProjectRecord): HomeProjectSignal {
  return {
    id: project.id,
    name: textOf(project.name),
    pinned: project.pinned === true,
    lastOpenedAt: project.lastOpenedAt
  }
}

/**
 * The clipboard row Home may offer, or null.
 *
 * Text only, copied inside {@link HOME_CLIPBOARD_FRESH_MS}, and not a secret. Main's
 * `retentionReason === 'protected'` is the first test, but it is not enough on its own: a secret
 * the user also starred reports `favorite`, and with key protection switched off a secret reports
 * `policy`. The shared classifier is the second opinion, and it also turns away verification
 * codes — a credential that is still live for a few minutes is not "something to work with".
 */
export function selectClipboardSignal(
  item: ClipboardItem | null | undefined,
  now: number
): HomeClipboardSignal | null {
  if (!item || String(item.type) !== 'text') return null
  const text = typeof item.value === 'string' ? item.value : ''
  if (!text.trim()) return null
  if (!isWithin(item.createdAt, now, HOME_CLIPBOARD_FRESH_MS)) return null
  if (item.retentionReason === 'protected') return null
  if (classifyClipboardContent({ type: 'text', content: text }).retentionClass !== 'ordinary') {
    return null
  }
  return { id: item.id, text, createdAt: item.createdAt }
}

/**
 * Normalizes the renderer's stores into {@link HomeSignals}. Pure: the caller passes `now`.
 *
 * Archived projects drop out everywhere a row would lead into them — the sidebar refuses to resume
 * their sessions, and offering their threads as "pick up where you left off" would undo the
 * archive. A conversation whose project no longer exists is kept, as the sidebar keeps it under
 * Home.
 */
export function collectHomeSignals(sources: HomeSignalSources): HomeSignals {
  const { now } = sources
  const projectsById = new Map(sources.projects.map((project) => [project.id, project]))
  const isArchived = (projectId: string | null): boolean =>
    projectId !== null && projectsById.get(projectId)?.archived === true
  const projectNameOf = (projectId: string | null): string | null => {
    const project = projectId ? projectsById.get(projectId) : undefined
    return project ? textOf(project.name) || null : null
  }

  const active = sources.activeProjectId ? projectsById.get(sources.activeProjectId) : undefined

  const recentConversations = sources.conversations
    .filter(
      (conversation) =>
        isWithin(conversation.updatedAt, now, HOME_RECENT_WINDOW_MS) &&
        !isArchived(conversation.projectId)
    )
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    .map((conversation) => ({
      id: conversation.id,
      title: textOf(conversation.title),
      projectId: conversation.projectId,
      projectName: projectNameOf(conversation.projectId),
      updatedAt: conversation.updatedAt
    }))

  const sessions = sources.sessions
    .filter(
      (session) =>
        session.state === 'available' &&
        isWithin(session.lastSeenAt, now, HOME_RECENT_WINDOW_MS) &&
        !isArchived(session.projectId)
    )
    .sort(
      (left, right) =>
        right.lastSeenAt - left.lastSeenAt || left.sessionRef.localeCompare(right.sessionRef)
    )
    .map((session) => ({
      sessionRef: session.sessionRef,
      provider: session.provider,
      title: textOf(session.title),
      projectId: session.projectId,
      projectName: projectNameOf(session.projectId),
      lastSeenAt: session.lastSeenAt
    }))

  const projects = sources.projects
    .filter((project) => !project.archived)
    .sort(orderProjects)
    .map(toProjectSignal)

  return {
    hasHistory: sources.conversations.length > 0,
    activeProject: active ? toProjectSignal(active) : null,
    recentConversations,
    sessions,
    projects,
    clipboard: selectClipboardSignal(sources.clipboard, now)
  }
}

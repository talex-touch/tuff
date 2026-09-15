import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import type { ConversationRecord } from '@talex-touch/utils/transport/sdk/domains/conversation'
import type { ProjectRecord } from '@talex-touch/utils/transport/sdk/domains/project'
import { describe, expect, it } from 'vitest'
import { projectConversationGroups } from './conversation-project-groups'

function project(overrides: Partial<ProjectRecord> & Pick<ProjectRecord, 'id'>): ProjectRecord {
  return {
    rootPath: `/work/${overrides.id}`,
    name: overrides.id,
    pinned: false,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    ...overrides
  }
}

function conversation(
  overrides: Partial<ConversationRecord> & Pick<ConversationRecord, 'id'>
): ConversationRecord {
  return {
    title: overrides.id,
    projectId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function session(
  overrides: Partial<LocalAiCliSessionSummary> & Pick<LocalAiCliSessionSummary, 'sessionRef'>
): LocalAiCliSessionSummary {
  return {
    projectId: null,
    provider: 'pi',
    title: overrides.sessionRef,
    state: 'available',
    origin: 'tuff',
    createdAt: 1,
    updatedAt: 1,
    lastSeenAt: 1,
    ...overrides
  }
}

describe('projectConversationGroups', () => {
  it('keeps Home first and gathers unowned or orphaned rows there', () => {
    // An owner id with no surviving project row must degrade to Home: dropping those rows would
    // make a conversation disappear from the sidebar without ever being deleted.
    const projection = projectConversationGroups(
      [project({ id: 'p1' })],
      [
        conversation({ id: 'c-home', projectId: null }),
        conversation({ id: 'c-orphan', projectId: 'deleted-project' })
      ],
      [
        session({ sessionRef: 's-home', projectId: null }),
        session({ sessionRef: 's-orphan', projectId: 'deleted-project' })
      ]
    )

    expect(projection.home.key).toBe('home')
    expect(projection.home.project).toBeNull()
    expect(projection.home.rows.map((row) => row.key)).toEqual([
      'conversation:c-home',
      'conversation:c-orphan',
      'session:s-home',
      'session:s-orphan'
    ])
    expect(projection.active).toEqual([
      { key: 'project:p1', project: expect.objectContaining({ id: 'p1' }), rows: [] }
    ])
    expect(projection.archived).toEqual([])
  })

  it('orders active projects pinned first and then by most recent open', () => {
    const projection = projectConversationGroups(
      [
        project({ id: 'recent', lastOpenedAt: 30 }),
        project({ id: 'older', lastOpenedAt: 10 }),
        project({ id: 'pinned-old', pinned: true, lastOpenedAt: 1 }),
        project({ id: 'tie-b', lastOpenedAt: 5 }),
        project({ id: 'tie-a', lastOpenedAt: 5 })
      ],
      [],
      []
    )

    expect(projection.active.map((group) => group.project?.id)).toEqual([
      'pinned-old',
      'recent',
      'older',
      'tie-a',
      'tie-b'
    ])
  })

  it('separates archived projects into their own collection without detaching their rows', () => {
    const projection = projectConversationGroups(
      [project({ id: 'live' }), project({ id: 'filed', archived: true })],
      [conversation({ id: 'c-filed', projectId: 'filed' })],
      [session({ sessionRef: 's-filed', projectId: 'filed' })]
    )

    expect(projection.active.map((group) => group.project?.id)).toEqual(['live'])
    expect(projection.archived).toHaveLength(1)
    const filed = projection.archived[0]!
    expect(filed.key).toBe('project:filed')
    expect(filed.rows.map((row) => row.key)).toEqual(['conversation:c-filed', 'session:s-filed'])
    // Archiving is not deletion: the filed row must not fall back into Home.
    expect(projection.home.rows).toEqual([])
  })

  it('sorts rows newest first and namespaces keys so ids cannot collide across row kinds', () => {
    const projection = projectConversationGroups(
      [project({ id: 'p1' })],
      [
        conversation({ id: 'shared', projectId: 'p1', updatedAt: 5 }),
        conversation({ id: 'same-time-b', projectId: 'p1', updatedAt: 7 }),
        conversation({ id: 'same-time-a', projectId: 'p1', updatedAt: 7 })
      ],
      [session({ sessionRef: 'shared', projectId: 'p1', lastSeenAt: 5 })]
    )

    const rows = projection.active[0]!.rows
    const keys = rows.map((row) => row.key)
    expect(keys).toEqual([
      'conversation:same-time-a',
      'conversation:same-time-b',
      'conversation:shared',
      'session:shared'
    ])
    expect(new Set(keys).size).toBe(rows.length)
    expect(rows[3]!.kind).toBe('session')
    expect(rows[2]!.kind).toBe('conversation')
  })
})

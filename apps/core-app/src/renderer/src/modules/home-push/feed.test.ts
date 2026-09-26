import { describe, expect, it } from 'vitest'
import { buildHomeFeed, HOME_FEED_MAX_ITEMS, resolveHomePushMode } from './feed'
import {
  clipboardItem,
  conversation,
  DAY,
  fakeT,
  HOUR,
  MINUTE,
  NOW,
  project,
  session,
  signalsOf
} from './home-push.fixtures'

describe('buildHomeFeed', () => {
  it('orders rows by kind: current project, conversations, sessions, clipboard, projects', () => {
    const feed = buildHomeFeed(
      signalsOf({
        projects: [
          project({ id: 'p1', name: 'talex-touch' }),
          project({ id: 'p2', name: 'notes' })
        ],
        conversations: [
          conversation({ id: 'home-chat', updatedAt: NOW - HOUR }),
          conversation({ id: 'p1-chat', projectId: 'p1', updatedAt: NOW - 3 * HOUR })
        ],
        sessions: [session({ sessionRef: 'loose', updatedAt: NOW })],
        clipboard: clipboardItem(),
        activeProjectId: 'p1'
      }),
      fakeT
    )

    expect(feed.map((item) => item.kind)).toEqual([
      'current-project',
      'conversation',
      'session',
      'clipboard'
    ])
    expect(feed[0]?.action).toEqual({ kind: 'open-conversation', conversationId: 'p1-chat' })
  })

  it(`never lists more than ${HOME_FEED_MAX_ITEMS}`, () => {
    const feed = buildHomeFeed(
      signalsOf({
        conversations: Array.from({ length: 9 }, (_, index) =>
          conversation({ id: `c${index}`, updatedAt: NOW - index * HOUR })
        )
      }),
      fakeT
    )
    expect(feed).toHaveLength(HOME_FEED_MAX_ITEMS)
    // A single kind fills the card in its own recency order.
    expect(feed.map((item) => item.id)).toEqual([
      'feed:conversation:c0',
      'feed:conversation:c1',
      'feed:conversation:c2',
      'feed:conversation:c3'
    ])
  })

  /**
   * A week of chats must not push the waiting session, the clipboard or a project off the card:
   * every kind gets its newest row before any kind gets a second.
   */
  it('gives every kind a row before any kind gets a second', () => {
    const feed = buildHomeFeed(
      signalsOf({
        projects: [project({ id: 'p1' })],
        conversations: ['a', 'b', 'c', 'd'].map((id, index) =>
          conversation({ id, updatedAt: NOW - index * HOUR })
        ),
        sessions: [
          session({ sessionRef: 's1' }),
          session({ sessionRef: 's2', lastSeenAt: NOW - 5 * HOUR })
        ],
        clipboard: clipboardItem()
      }),
      fakeT
    )
    expect(feed.map((item) => item.id)).toEqual([
      'feed:conversation:a',
      'feed:session:s1',
      'feed:clipboard:7',
      'feed:project:p1'
    ])
  })

  it('puts the current project’s threads and sessions first, interleaved by recency', () => {
    const feed = buildHomeFeed(
      signalsOf({
        projects: [project({ id: 'p1', name: 'talex-touch' })],
        conversations: [conversation({ id: 'p1-old', projectId: 'p1', updatedAt: NOW - 2 * DAY })],
        sessions: [session({ sessionRef: 'p1-new', projectId: 'p1', lastSeenAt: NOW - MINUTE })],
        activeProjectId: 'p1'
      }),
      fakeT
    )
    expect(feed.map((item) => item.id)).toEqual(['feed:session:p1-new', 'feed:conversation:p1-old'])
    // The blank conversation's own project is not offered as somewhere to go.
    expect(feed.some((item) => item.kind === 'project')).toBe(false)
  })

  it('resumes a session through a plain snapshot of its opaque refs', () => {
    const [item] = buildHomeFeed(
      signalsOf({
        projects: [project({ id: 'p1', name: 'talex-touch' })],
        sessions: [
          session({ sessionRef: 'ref-9', projectId: 'p1', provider: 'codex', title: 'fix' })
        ]
      }),
      fakeT
    )
    expect(item?.action).toEqual({
      kind: 'continue-session',
      session: { state: 'available', sessionRef: 'ref-9', provider: 'codex', projectId: 'p1' }
    })
    expect(item?.label).toBe('home.push.feed.continueSession{"provider":"codex","title":"fix"}')
  })

  it('prefills the clipboard text without ever sending it', () => {
    const feed = buildHomeFeed(
      signalsOf({ clipboard: clipboardItem({ value: 'line one\nline two' }) }),
      fakeT
    )
    expect(feed).toHaveLength(1)
    expect(feed[0]?.action).toEqual({ kind: 'prefill', text: 'line one\nline two' })
    // The excerpt on the card is one line.
    expect(feed[0]?.description).toBe(
      'home.push.feed.clipboardExcerpt{"excerpt":"line one line two"}'
    )
  })

  it('leaves out a stale or secret clipboard record', () => {
    expect(
      buildHomeFeed(signalsOf({ clipboard: clipboardItem({ createdAt: NOW - 2 * HOUR }) }), fakeT)
    ).toEqual([])
    expect(
      buildHomeFeed(
        signalsOf({ clipboard: clipboardItem({ retentionReason: 'protected' }) }),
        fakeT
      )
    ).toEqual([])
  })

  it('enters a recent project from the feed', () => {
    const [item] = buildHomeFeed(
      signalsOf({ projects: [project({ id: 'p2', name: 'sheet-music', pinned: true })] }),
      fakeT
    )
    expect(item?.action).toEqual({ kind: 'enter-project', projectId: 'p2' })
    expect(item?.description).toBe('home.push.feed.pinnedProjectDesc')
  })
})

describe('resolveHomePushMode', () => {
  it('guides a user with no history at all', () => {
    const signals = signalsOf({ projects: [project({ id: 'p1' })], clipboard: clipboardItem() })
    expect(resolveHomePushMode(signals, buildHomeFeed(signals, fakeT))).toBe('guide')
  })

  it('switches to 「为你准备」 once there is history', () => {
    const signals = signalsOf({ conversations: [conversation({ id: 'c' })] })
    expect(resolveHomePushMode(signals, buildHomeFeed(signals, fakeT))).toBe('feed')
  })

  it('falls back to the guide when history exists but the feed comes out empty', () => {
    // Only a month-old thread: history exists, nothing is recent enough to offer.
    const signals = signalsOf({
      conversations: [conversation({ id: 'c', updatedAt: NOW - 30 * DAY })]
    })
    const feed = buildHomeFeed(signals, fakeT)
    expect(feed).toEqual([])
    expect(resolveHomePushMode(signals, feed)).toBe('guide')
  })
})

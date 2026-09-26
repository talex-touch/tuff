import { describe, expect, it } from 'vitest'
import {
  clipboardItem,
  conversation,
  fakeT,
  HOUR,
  NOW,
  project,
  session,
  signalsOf
} from './home-push.fixtures'
import {
  buildHomeSummary,
  fingerprintHomeOpening,
  HOME_SUMMARY_MAX_PROJECTS,
  HOME_SUMMARY_MAX_TITLES,
  stripPathLikeTokens
} from './summary'

describe('buildHomeSummary', () => {
  const richSignals = () =>
    signalsOf({
      projects: [
        project({
          id: 'p1',
          name: 'talex-touch',
          rootPath: '/Users/tagzixian/Workspace/Projects/talex-touch'
        }),
        project({ id: 'p2', name: 'sheet-music', rootPath: '/Users/tagzixian/Music/sheet-music' })
      ],
      conversations: [
        conversation({ id: 'c1', title: '整理下载目录', projectId: null }),
        conversation({ id: 'c2', title: '软著材料', projectId: 'p1', updatedAt: NOW - 2 * HOUR })
      ],
      sessions: [session({ sessionRef: 'ref-1', projectId: 'p1', title: 'refactor the box' })],
      clipboard: clipboardItem({ value: 'the secret launch date is friday' }),
      activeProjectId: 'p1'
    })

  it('names the current project, recent titles, other projects and a session count', () => {
    const summary = buildHomeSummary(richSignals(), fakeT)

    expect(summary.split('\n')).toEqual([
      'home.opening.summary.currentProject{"name":"talex-touch"}',
      // The current project's thread first, however recency ordered the two.
      'home.opening.summary.recentConversations{"titles":"home.opening.summary.quote{\\"text\\":\\"软著材料\\"}home.opening.summary.separatorhome.opening.summary.quote{\\"text\\":\\"整理下载目录\\"}"}',
      'home.opening.summary.projects{"names":"sheet-music"}',
      'home.opening.summary.localSessionsIn{"count":1,"names":"talex-touch"}'
    ])
  })

  it('carries titles, names and counts only: no root path, no clipboard, no session title', () => {
    const summary = buildHomeSummary(richSignals(), fakeT)

    expect(summary).not.toContain('/Users/')
    expect(summary).not.toContain('Workspace')
    expect(summary).not.toContain('the secret launch date')
    expect(summary).not.toContain('refactor the box')
  })

  it('replaces a path the user typed into a title', () => {
    const summary = buildHomeSummary(
      signalsOf({
        conversations: [
          conversation({ id: 'c', title: '看看 /Users/me/private/notes.md 这个文件' })
        ]
      }),
      fakeT
    )
    expect(summary).not.toContain('/Users/me')
    expect(summary).toContain('看看 … 这个文件')
  })

  it(`lists at most ${HOME_SUMMARY_MAX_TITLES} titles and ${HOME_SUMMARY_MAX_PROJECTS} projects`, () => {
    const summary = buildHomeSummary(
      signalsOf({
        projects: ['a', 'b', 'c', 'd', 'e'].map((id) => project({ id })),
        conversations: ['1', '2', '3', '4', '5'].map((id, index) =>
          conversation({ id, title: `topic ${id}`, updatedAt: NOW - index * HOUR })
        )
      }),
      fakeT
    )
    expect(summary).toContain('topic 3')
    expect(summary).not.toContain('topic 4')
    expect(summary).toContain(
      'home.opening.summary.projects{"names":"ahome.opening.summary.separatorbhome.opening.summary.separatorc"}'
    )
  })

  it('says there is nothing rather than sending an empty message', () => {
    expect(buildHomeSummary(signalsOf(), fakeT)).toBe('home.opening.summary.empty')
  })

  it('counts sessions without a project name when none has one', () => {
    const summary = buildHomeSummary(
      signalsOf({ sessions: [session({ sessionRef: 'a' }), session({ sessionRef: 'b' })] }),
      fakeT
    )
    expect(summary).toBe('home.opening.summary.localSessions{"count":2}')
  })
})

describe('stripPathLikeTokens', () => {
  it.each([
    ['open /Users/me/a/b.txt now', 'open … now'],
    ['C:\\work\\report.docx', '…'],
    ['see (~/Downloads/x.zip)', 'see (…)']
  ])('replaces the absolute path in %s', (input, output) => {
    expect(stripPathLikeTokens(input)).toBe(output)
  })

  it.each(['https://github.com/talex/touch', 'a/b/c', '数据/2024/报告', '1/2 cup', '~/Downloads'])(
    'leaves %s alone',
    (input) => {
      expect(stripPathLikeTokens(input)).toBe(input)
    }
  )
})

describe('fingerprintHomeOpening', () => {
  it('is stable for the same prompt and summary and changes with either', () => {
    const base = fingerprintHomeOpening('prompt', 'summary')
    expect(fingerprintHomeOpening('prompt', 'summary')).toBe(base)
    expect(fingerprintHomeOpening('prompt', 'summary!')).not.toBe(base)
    // The prompt carries the locale: switching language must not replay the other one's opening.
    expect(fingerprintHomeOpening('prompt (en)', 'summary')).not.toBe(base)
  })
})

import type { HerdrProjectedSession } from './useHerdrRuntime'
import { describe, expect, it } from 'vitest'
import {
  buildHerdrProjectTabTitles,
  buildNewTerminalRequestForGroup,
  groupHerdrSessions,
  HERDR_UNGROUPED_PROJECT_KEY,
  parseHerdrWhereLabel,
  pickPrimaryHerdrProjectSession
} from './herdr-project-groups'

function makeSession(overrides: Partial<HerdrProjectedSession> = {}): HerdrProjectedSession {
  return {
    address: 't1',
    machine: null,
    name: null,
    title: '',
    argv: ['/bin/zsh', '-l'],
    cwd: '/',
    foregroundName: 'zsh',
    foregroundCwd: '/',
    foregroundPid: 100,
    state: 'live',
    status: null,
    statusMs: null,
    reported: false,
    turn: 0,
    keep: true,
    template: null,
    parent: null,
    labels: {},
    cols: 120,
    rows: 40,
    pid: 100,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 1000,
    finishedMs: null,
    projectId: null,
    projectName: null,
    displayTitle: 'zsh',
    appName: 'zsh',
    locationLabel: null,
    effectiveCwd: '/',
    ...overrides
  }
}

describe('herdr-project-groups', () => {
  it('parses where labels with and without slot numbers', () => {
    expect(parseHerdrWhereLabel('thunder-sing-damaged / 2')).toEqual({
      project: 'thunder-sing-damaged',
      slot: 2
    })
    expect(parseHerdrWhereLabel('Work / 1')).toEqual({ project: 'Work', slot: 1 })
    expect(parseHerdrWhereLabel('standalone')).toEqual({ project: 'standalone', slot: null })
    expect(parseHerdrWhereLabel('')).toBeNull()
  })

  it('groups terminals by herdr.space, matched project, cwd, and ungrouped fallback', () => {
    const sessions: HerdrProjectedSession[] = [
      makeSession({
        address: 't96',
        cwd: '/Users/dev/thunder-sing',
        foregroundCwd: '/private/tmp/thunder-sing-damaged',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 2' },
        status: { state: 'done', app: 'omp' },
        displayTitle: 'KSING: 部署 VOD 打分结算服务',
        appName: 'omp',
        createdMs: 200
      }),
      makeSession({
        address: 't85',
        cwd: '/Users/dev/thunder-vap',
        foregroundCwd: '/private/tmp/thunder-sing-damaged',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 1' },
        displayTitle: 'zsh · thunder-sing-damaged / 1',
        createdMs: 100
      }),
      makeSession({
        address: 't87',
        cwd: '/Users/dev/thunder-sing',
        foregroundCwd: '/private/tmp/thunder-sing-damaged',
        effectiveCwd: '/private/tmp/thunder-sing-damaged',
        labels: { 'herdr.space': 'sp-sing', where: 'thunder-sing-damaged / 2' },
        status: { state: 'done', app: 'antigravity' },
        displayTitle: 'antigravity · thunder-sing-damaged / 2',
        appName: 'antigravity',
        createdMs: 150
      }),
      makeSession({
        address: 't9d',
        cwd: '/Users/dev',
        foregroundCwd: '/Users/dev/thunder-opensi',
        effectiveCwd: '/Users/dev/thunder-opensi',
        labels: { 'herdr.space': 'sp-opensi', where: 'thunder-opensi / 1' },
        status: { state: 'working', app: 'antigravity' },
        displayTitle: 'antigravity · thunder-opensi / 1',
        appName: 'antigravity',
        createdMs: 300
      }),
      makeSession({
        address: 't9h',
        cwd: '/',
        foregroundCwd: '/Users/dev/Downloads/contact-sheets',
        effectiveCwd: '/Users/dev/Downloads/contact-sheets',
        displayTitle: 'Yazi: contact-sheets',
        appName: 'yazi',
        createdMs: 400
      }),
      makeSession({
        address: 't100',
        cwd: '/',
        foregroundCwd: '/Users/dev/Downloads/contact-sheets',
        effectiveCwd: '/Users/dev/Downloads/contact-sheets',
        displayTitle: 'Yazi: contact-sheets',
        appName: 'yazi',
        createdMs: 410
      }),
      makeSession({ address: 't9g', createdMs: 500 }),
      makeSession({ address: 't101', createdMs: 510 })
    ]

    const groups = groupHerdrSessions(sessions)
    expect(groups.map((g) => ({ name: g.name, key: g.key, count: g.sessions.length }))).toEqual([
      { name: 'thunder-opensi', key: 'hs:sp-opensi', count: 1 },
      { name: 'thunder-sing-damaged', key: 'hs:sp-sing', count: 3 },
      { name: 'contact-sheets', key: 'cwd:/Users/dev/Downloads/contact-sheets', count: 2 },
      { name: '', key: HERDR_UNGROUPED_PROJECT_KEY, count: 2 }
    ])

    // Sessions inside thunder-sing-damaged keep stable slot -> creation order for top tabs.
    const singGroup = groups[1]!
    expect(singGroup.sessions.map((s) => s.address)).toEqual(['t85', 't87', 't96'])
    expect(singGroup.cwd).toBe('/private/tmp/thunder-sing-damaged')

    // Redundant project name prefix is stripped from top tab titles; duplicates get address suffix.
    const singTitles = buildHerdrProjectTabTitles(singGroup)
    expect(singTitles.get('t85')).toBe('zsh · 1')
    expect(singTitles.get('t87')).toBe('antigravity · 2')
    expect(singTitles.get('t96')).toBe('KSING: 部署 VOD 打分结算服务')

    const yaziTitles = buildHerdrProjectTabTitles(groups[2]!)
    expect(yaziTitles.get('t9h')).toBe('Yazi: contact-sheets · t9h')
    expect(yaziTitles.get('t100')).toBe('Yazi: contact-sheets · t100')

    // Spawning a new terminal inside a Herdr space group preserves cwd, space id, and next slot.
    expect(buildNewTerminalRequestForGroup(singGroup)).toEqual({
      cwd: '/private/tmp/thunder-sing-damaged',
      labels: {
        'herdr.space': 'sp-sing',
        where: 'thunder-sing-damaged / 3'
      }
    })
  })

  it('picks blocked or working terminal first when entering a project', () => {
    const sessions = [
      makeSession({ address: 't1', status: { state: 'idle' }, createdMs: 1 }),
      makeSession({ address: 't2', status: { state: 'working' }, createdMs: 2 }),
      makeSession({ address: 't3', status: { state: 'blocked', kind: 'permission' }, createdMs: 3 })
    ]
    const [group] = groupHerdrSessions(sessions)
    expect(pickPrimaryHerdrProjectSession(group!)?.address).toBe('t3')
  })
})

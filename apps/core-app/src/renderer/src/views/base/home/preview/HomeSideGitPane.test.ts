// @vitest-environment jsdom
import type { WorkspaceGitStatusResult } from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gitMocks = vi.hoisted(() => ({
  status: vi.fn(),
  diff: vi.fn(),
  branches: vi.fn(),
  log: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  discard: vi.fn(),
  commit: vi.fn(),
  checkout: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: { template: '<div class="skeleton-stub" />' }
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => true
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/workspace-git', () => ({
  createWorkspaceGitSdk: () => gitMocks
}))

import HomeSideGitPane from './HomeSideGitPane.vue'

function sampleStatus(overrides: Partial<WorkspaceGitStatusResult> = {}): WorkspaceGitStatusResult {
  return {
    available: true,
    isRepo: true,
    cwd: '/repo',
    repoRoot: '/repo',
    branch: 'task/feat/git',
    detached: false,
    headShortOid: 'abc1234',
    upstream: 'origin/task/feat/git',
    ahead: 1,
    behind: 2,
    hasRemote: true,
    files: [
      {
        path: 'src/staged.ts',
        indexStatus: 'M',
        worktreeStatus: '.',
        staged: true,
        unstaged: false,
        untracked: false,
        conflicted: false,
        status: 'modified'
      },
      {
        path: 'src/dirty.ts',
        indexStatus: '.',
        worktreeStatus: 'M',
        staged: false,
        unstaged: true,
        untracked: false,
        conflicted: false,
        status: 'modified'
      }
    ],
    stagedCount: 1,
    unstagedCount: 1,
    untrackedCount: 0,
    conflictedCount: 0,
    ...overrides
  }
}

describe('HomeSideGitPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gitMocks.status.mockResolvedValue(sampleStatus())
    gitMocks.diff.mockResolvedValue({
      path: 'src/dirty.ts',
      staged: false,
      diff: '@@ -1,1 +1,1 @@\n-old\n+new',
      additions: 1,
      deletions: 1,
      binary: false,
      truncated: false,
      empty: false
    })
    gitMocks.branches.mockResolvedValue({
      current: 'task/feat/git',
      detached: false,
      branches: [
        { name: 'task/feat/git', current: true, isRemote: false, shortOid: 'abc1234' },
        { name: 'main', current: false, isRemote: false, shortOid: 'def5678' }
      ]
    })
    gitMocks.log.mockResolvedValue({
      commits: [
        {
          hash: 'abc1234567890',
          shortHash: 'abc1234',
          subject: 'Add git sidebar panel',
          author: 'Alice',
          relativeDate: '2 minutes ago',
          authoredAt: Date.now(),
          refs: ['HEAD -> task/feat/git']
        }
      ]
    })
    gitMocks.stage.mockResolvedValue({ ok: true, status: sampleStatus() })
    gitMocks.unstage.mockResolvedValue({ ok: true, status: sampleStatus() })
    gitMocks.discard.mockResolvedValue({
      ok: true,
      status: sampleStatus({ files: [sampleStatus().files[0]!], unstagedCount: 0 })
    })
    gitMocks.commit.mockResolvedValue({
      ok: true,
      summary: '[task/feat/git abc1234] Commit msg',
      status: sampleStatus({ files: [], stagedCount: 0, unstagedCount: 0 })
    })
    gitMocks.checkout.mockResolvedValue({
      ok: true,
      summary: 'main',
      status: sampleStatus({ branch: 'main' })
    })
    gitMocks.fetch.mockResolvedValue({ ok: true, status: sampleStatus() })
    gitMocks.pull.mockResolvedValue({ ok: true, status: sampleStatus({ behind: 0 }) })
    gitMocks.push.mockResolvedValue({ ok: true, status: sampleStatus({ ahead: 0 }) })
  })

  it('loads status, renders unified diff on file click, and commits staged changes', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    expect(wrapper.find('.HomeSideGit-BranchName').text()).toBe('task/feat/git')
    expect(wrapper.find('.HomeSideGit-Ahead').text()).toBe('↑1')
    expect(wrapper.find('.HomeSideGit-Behind').text()).toBe('↓2')

    const fileButtons = wrapper.findAll('.HomeSideGit-FileMain')
    expect(fileButtons).toHaveLength(2)

    await fileButtons[1]!.trigger('click')
    await flushPromises()
    expect(gitMocks.diff).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      path: 'src/dirty.ts',
      staged: false,
      untracked: false
    })
    expect(wrapper.find('.HomeSideGit-DiffPane').exists()).toBe(true)
    expect(wrapper.find('.HomeSideGit-DiffCode').text()).toContain('+new')

    await wrapper.find('.HomeSideGit-CommitInput').setValue('feat: ship git panel')
    await wrapper.find('.HomeSideGit-CommitBtn').trigger('click')
    await flushPromises()
    expect(gitMocks.commit).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      message: 'feat: ship git panel'
    })
  })

  it('requires secondary confirmation before discard, pull, and push', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    // Discard opens confirmation bar instead of immediately calling sdk.discard.
    await wrapper.find('button[aria-label="home.git.discard"]').trigger('click')
    expect(gitMocks.discard).not.toHaveBeenCalled()
    expect(wrapper.find('.HomeSideGit-ConfirmBar.is-danger').exists()).toBe(true)

    await wrapper.find('.HomeSideGit-ConfirmBtn.is-danger').trigger('click')
    await flushPromises()
    expect(gitMocks.discard).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      path: 'src/dirty.ts',
      untracked: false
    })

    // Push requires explicit confirmation too; cancel must not call push.
    await wrapper.find('button[aria-label="home.git.push"]').trigger('click')
    expect(gitMocks.push).not.toHaveBeenCalled()
    const cancelBtn = wrapper.findAll('.HomeSideGit-ConfirmBtn')[1]!
    await cancelBtn.trigger('click')
    expect(wrapper.find('.HomeSideGit-ConfirmBar').exists()).toBe(false)
    expect(gitMocks.push).not.toHaveBeenCalled()

    await wrapper.find('button[aria-label="home.git.push"]').trigger('click')
    await wrapper.find('.HomeSideGit-ConfirmBtn.is-primary').trigger('click')
    await flushPromises()
    expect(gitMocks.push).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      setUpstream: true
    })

    // Fetch is read-only and executes directly.
    await wrapper.find('button[aria-label="home.git.fetch"]').trigger('click')
    await flushPromises()
    expect(gitMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('loads branches and commit history tabs and switches branches cleanly', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    const tabs = wrapper.findAll('[role="tab"]')
    await tabs[1]!.trigger('click')
    await flushPromises()
    expect(gitMocks.branches).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.HomeSideGit-BranchRow')).toHaveLength(2)

    // Switch to `main`.
    await wrapper.findAll('.HomeSideGit-BranchRow')[1]!.trigger('click')
    await flushPromises()
    expect(gitMocks.checkout).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      branch: 'main'
    })

    // Open History tab.
    await tabs[2]!.trigger('click')
    await flushPromises()
    expect(gitMocks.log).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.HomeSideGit-LogSubject').text()).toBe('Add git sidebar panel')
  })

  it('renders non-repository empty state gracefully', async () => {
    gitMocks.status.mockResolvedValue(
      sampleStatus({ isRepo: false, repoRoot: undefined, branch: '', files: [] })
    )
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/tmp/not-a-repo', conversationId: 'c-2', active: true }
    })
    await flushPromises()
    expect(wrapper.find('.HomeSideGit-EmptyTitle').text()).toBe('home.git.notRepo')
  })
})

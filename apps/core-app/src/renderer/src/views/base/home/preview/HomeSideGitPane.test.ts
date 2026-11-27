// @vitest-environment jsdom
import type { WorkspaceGitStatusResult } from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gitMocks = vi.hoisted(() => ({
  status: vi.fn(),
  diff: vi.fn(),
  branches: vi.fn(),
  log: vi.fn(),
  commitFiles: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  discard: vi.fn(),
  commit: vi.fn(),
  checkout: vi.fn(),
  renameBranch: vi.fn(),
  deleteBranch: vi.fn(),
  setUpstream: vi.fn(),
  saveRemote: vi.fn(),
  removeRemote: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  push: vi.fn()
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: toastMocks
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: { template: '<div class="skeleton-stub" />' }
}))

vi.mock('@talex-touch/tuffex/context-menu', () => ({
  TxContextMenu: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    methods: {
      openAt(this: { $emit: (event: string, value: boolean) => void }) {
        this.$emit('update:modelValue', true)
      }
    },
    template:
      '<div data-testid="git-branch-context-menu" :data-open="String(modelValue)"><slot name="menu" /></div>'
  },
  TxContextMenuDivider: { template: '<hr />' },
  TxContextMenuItem: {
    props: ['disabled'],
    emits: ['select'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'select\')"><slot /><slot name="right" /></button>'
  }
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

import { buildBranchTree } from './git-branch-tree'
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
    window.localStorage.clear()
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
        {
          name: 'task/feat/git',
          current: true,
          isRemote: false,
          shortOid: 'abc1234',
          subject: 'Add git sidebar panel',
          author: 'TalexDreamSoul',
          authors: [
            {
              name: 'TalexDreamSoul',
              email: '12345+TalexDreamSoul@users.noreply.github.com',
              avatarUrl: 'https://avatars.githubusercontent.com/u/12345?s=64'
            },
            {
              name: 'Alice Dev',
              email: 'alice@example.com',
              avatarUrl: 'https://www.gravatar.com/avatar/abcdef?s=64&d=404'
            }
          ]
        },
        {
          name: 'task/fix/icons',
          current: false,
          isRemote: false,
          shortOid: 'eee1111',
          subject: 'Fix missing icons'
        },
        { name: 'main', current: false, isRemote: false, shortOid: 'def5678', subject: 'Main tip' },
        {
          name: 'origin/dependabot/cargo/packages/tuff-native/napi-3.16.2',
          current: false,
          isRemote: true,
          shortOid: 'b68942f',
          subject: 'chore(deps): bump napi'
        },
        {
          name: 'origin/master',
          current: false,
          isRemote: true,
          shortOid: '1d8834c',
          subject: 'Remote master'
        },
        {
          name: 'workmac/agent',
          current: false,
          isRemote: true,
          shortOid: '2a3b4c5',
          subject: 'Agent work'
        }
      ],
      remotes: [
        {
          name: 'origin',
          fetchUrl: 'git@github.com:talex-touch/tuff.git',
          pushUrl: 'git@github.com:talex-touch/tuff.git',
          host: 'github.com',
          provider: 'github',
          displayLabel: 'GitHub',
          webUrl: 'https://github.com/talex-touch/tuff'
        },
        {
          name: 'workmac',
          fetchUrl: 'git@g.ktvsky.com:talex/tuff.git',
          pushUrl: 'git@g.ktvsky.com:talex/tuff.git',
          host: 'g.ktvsky.com',
          provider: 'custom',
          displayLabel: 'g.ktvsky.com',
          webUrl: 'https://g.ktvsky.com/talex/tuff'
        }
      ]
    })
    gitMocks.log.mockResolvedValue({
      commits: [
        {
          hash: 'abc1234567890',
          shortHash: 'abc1234',
          subject: 'Add git sidebar panel',
          author: 'TalexDreamSoul',
          authorEmail: '12345+TalexDreamSoul@users.noreply.github.com',
          avatarUrl: 'https://avatars.githubusercontent.com/u/12345?s=64',
          relativeDate: '2 minutes ago',
          authoredAt: Date.now(),
          refs: ['HEAD -> task/feat/git']
        }
      ]
    })
    gitMocks.commitFiles.mockResolvedValue({
      hash: 'abc1234567890',
      totalAdditions: 12,
      totalDeletions: 3,
      files: [
        {
          path: 'apps/core-app/src/main/git.ts',
          status: 'modified',
          additions: 10,
          deletions: 3,
          binary: false
        },
        {
          path: 'apps/core-app/src/main/new.ts',
          status: 'added',
          additions: 2,
          deletions: 0,
          binary: false
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
    gitMocks.renameBranch.mockResolvedValue({
      ok: true,
      summary: 'main-v2',
      status: sampleStatus()
    })
    gitMocks.deleteBranch.mockResolvedValue({ ok: true, summary: 'main', status: sampleStatus() })
    gitMocks.setUpstream.mockResolvedValue({
      ok: true,
      summary: 'origin/master',
      status: sampleStatus()
    })
    gitMocks.saveRemote.mockResolvedValue({ ok: true, summary: 'origin', status: sampleStatus() })
    gitMocks.removeRemote.mockResolvedValue({
      ok: true,
      summary: 'workmac',
      status: sampleStatus()
    })
    gitMocks.fetch.mockResolvedValue({ ok: true, status: sampleStatus() })
    gitMocks.pull.mockResolvedValue({ ok: true, status: sampleStatus({ behind: 0 }) })
    gitMocks.push.mockResolvedValue({ ok: true, status: sampleStatus({ ahead: 0 }) })
  })

  it('loads status, renders unified diff on file click, and commits staged changes with toast feedback', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    // Top header bar is removed; branch info & sync counters live in the compact bottom footer bar.
    expect(wrapper.find('.HomeSideGit-TopBar').exists()).toBe(false)
    const footer = wrapper.find('[data-testid="git-footer-bar"]')
    expect(footer.exists()).toBe(true)
    expect(footer.find('.HomeSideGit-BranchName').text()).toBe('task/feat/git')
    expect(footer.find('.HomeSideGit-Ahead').text()).toBe('1')
    expect(footer.find('.HomeSideGit-Behind').text()).toBe('2')

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
    expect(toastMocks.success).toHaveBeenCalledWith('home.git.committed')
  })

  it('requires secondary confirmation before discard, pull, and push', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

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

    await wrapper.find('button[aria-label="home.git.fetch"]').trigger('click')
    await flushPromises()
    expect(gitMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('builds slash branch trees, previews on single click, switches on double-click or context menu with toast, and merges search/create input', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    const tabs = wrapper.findAll('[role="tab"]')
    await tabs[1]!.trigger('click')
    await flushPromises()
    expect(gitMocks.branches).toHaveBeenCalledTimes(1)

    // Only one merged input exists for filtering & creating branches.
    expect(wrapper.findAll('.HomeSideGit-ComboInput')).toHaveLength(1)

    // Local & remote branches are grouped into slash tree folders and render author avatar stacks.
    const folderLabels = wrapper.findAll('.HomeSideGit-FolderLabel').map((node) => node.text())
    expect(folderLabels).toContain('task')
    expect(folderLabels).toContain('feat')
    expect(folderLabels).toContain('fix')
    expect(folderLabels).toContain('origin')

    const currentBranchRow = wrapper.find('.HomeSideGit-BranchRow.is-current')
    const stackAvatars = currentBranchRow.findAll('.HomeSideGit-AvatarStack .HomeSideGit-Avatar')
    expect(stackAvatars).toHaveLength(2)

    // Single-click previews branch without immediately calling checkout.
    const mainRow = wrapper
      .findAll('.HomeSideGit-BranchRow')
      .find((row) => row.find('.HomeSideGit-BranchRowName').text() === 'main')
    expect(mainRow).toBeTruthy()
    await mainRow!.trigger('click')
    await flushPromises()

    expect(gitMocks.checkout).not.toHaveBeenCalled()
    expect(gitMocks.log).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      ref: 'main',
      limit: 8
    })
    expect(wrapper.find('[data-testid="git-branch-preview"]').exists()).toBe(true)

    // Double-click switches to the branch and pops a toast notification.
    await mainRow!.trigger('dblclick')
    await flushPromises()
    expect(gitMocks.checkout).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      branch: 'main'
    })
    expect(toastMocks.success).toHaveBeenCalledWith('home.git.switchedBranch')

    // Filtering auto-expands compacted remote folders (dependabot/cargo/packages/tuff-native).
    await wrapper.find('.HomeSideGit-ComboInput').setValue('napi')
    await flushPromises()
    expect(wrapper.findAll('.HomeSideGit-BranchRowName').map((n) => n.text())).toContain(
      'napi-3.16.2'
    )

    // Typing a new branch name enables creating & switching from the same merged bar.
    await wrapper.find('.HomeSideGit-ComboInput').setValue('feat/new-tree')
    await wrapper.find('.HomeSideGit-BranchCombo').trigger('submit')
    await flushPromises()
    expect(gitMocks.checkout).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      branch: 'feat/new-tree',
      create: true
    })
    expect(toastMocks.success).toHaveBeenCalledWith('home.git.createdBranch')
  })

  it('renders commit history with standard-protocol author avatars and initials fallback', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    const tabs = wrapper.findAll('[role="tab"]')
    await tabs[2]!.trigger('click')
    await flushPromises()

    expect(gitMocks.log).toHaveBeenCalledWith({ cwd: '/repo', conversationId: 'c-1', limit: 40 })
    expect(wrapper.find('.HomeSideGit-LogSubject').text()).toBe('Add git sidebar panel')
    const avatarImg = wrapper.find('.HomeSideGit-AvatarImg')
    expect(avatarImg.exists()).toBe(true)
    expect(avatarImg.attributes('src')).toBe('https://avatars.githubusercontent.com/u/12345?s=64')
    expect(wrapper.find('.HomeSideGit-AvatarInitials').text()).toBe('TD')

    // When image fails to load, fallback initials stay cleanly rendered without broken <img>.
    await avatarImg.trigger('error')
    expect(wrapper.find('.HomeSideGit-AvatarImg').exists()).toBe(false)
    expect(wrapper.find('.HomeSideGit-AvatarInitials').text()).toBe('TD')

    // Clicking a commit row expands its collapsible file diff tree and opens per-file unified diff on click.
    await wrapper.find('[data-commit-hash="abc1234567890"]').trigger('click')
    await flushPromises()
    expect(gitMocks.commitFiles).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      hash: 'abc1234567890'
    })
    const commitTree = wrapper.find('[data-testid="git-commit-tree-abc1234"]')
    expect(commitTree.exists()).toBe(true)
    expect(commitTree.find('.HomeSideGit-CommitTreeFolder').text()).toContain(
      'apps/core-app/src/main'
    )

    const fileBtn = commitTree.find('[data-commit-file="apps/core-app/src/main/git.ts"]')
    expect(fileBtn.exists()).toBe(true)
    await fileBtn.trigger('click')
    await flushPromises()
    expect(gitMocks.diff).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      commitHash: 'abc1234567890',
      path: 'apps/core-app/src/main/git.ts'
    })
    expect(wrapper.find('[data-testid="git-commit-diff-pane"]').exists()).toBe(true)
  })

  it('renders GitHub and custom domain badges on remotes and supports right-click editing of branches and remotes', async () => {
    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await flushPromises()

    // Provider/domain badges sit directly on remote root folders.
    const originRoot = wrapper.find('[data-remote-root="origin"]')
    const workmacRoot = wrapper.find('[data-remote-root="workmac"]')
    expect(originRoot.find('.HomeSideGit-RemoteBadge').text()).toBe('GitHub')
    expect(originRoot.find('.i-ri-github-fill').exists()).toBe(true)
    expect(workmacRoot.find('.HomeSideGit-RemoteBadge').text()).toBe('g.ktvsky.com')

    // Right-click remote root -> edit remote URL and save.
    await workmacRoot.trigger('contextmenu')
    await wrapper.find('[data-testid="git-ctx-edit-remote"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="git-remote-editor"]').exists()).toBe(true)

    await wrapper
      .find('[data-testid="git-edit-remote-fetch-url"]')
      .setValue('https://g.ktvsky.com/team/tuff.git')
    await wrapper.find('[data-testid="git-remote-editor"] form').trigger('submit')
    await flushPromises()
    expect(gitMocks.saveRemote).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      mode: 'edit',
      name: 'workmac',
      originalName: 'workmac',
      fetchUrl: 'https://g.ktvsky.com/team/tuff.git',
      pushUrl: ''
    })

    // Right-click remote root -> remove remote requires secondary confirmation.
    await workmacRoot.trigger('contextmenu')
    await wrapper.find('[data-testid="git-ctx-remove-remote"]').trigger('click')
    expect(gitMocks.removeRemote).not.toHaveBeenCalled()
    await wrapper.find('.HomeSideGit-ConfirmBtn.is-danger').trigger('click')
    await flushPromises()
    expect(gitMocks.removeRemote).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      name: 'workmac'
    })

    // Right-click local branch `main` -> edit rename + upstream.
    const mainRow = wrapper
      .findAll('.HomeSideGit-BranchRow')
      .find((row) => row.find('.HomeSideGit-BranchRowName').text() === 'main')
    await mainRow!.trigger('contextmenu')
    await wrapper.find('[data-testid="git-ctx-edit-branch"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="git-branch-editor"]').exists()).toBe(true)

    await wrapper.find('[data-testid="git-edit-branch-name"]').setValue('main-v2')
    await wrapper.find('[data-testid="git-edit-branch-upstream"]').setValue('origin/master')
    await wrapper.find('[data-testid="git-branch-editor"] form').trigger('submit')
    await flushPromises()
    expect(gitMocks.renameBranch).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      oldName: 'main',
      newName: 'main-v2'
    })
    expect(gitMocks.setUpstream).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      branch: 'main-v2',
      upstream: 'origin/master'
    })
  })

  it('opens remote context menu even when remote metadata is missing and remembers the active sub-tab', async () => {
    gitMocks.branches.mockResolvedValue({
      current: 'task/feat/git',
      detached: false,
      branches: [
        { name: 'task/feat/git', current: true, isRemote: false, shortOid: 'abc1234' },
        { name: 'workmac/agent', current: false, isRemote: true, shortOid: '2a3b4c5' }
      ]
    })

    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await flushPromises()
    expect(window.localStorage.getItem('tuff.home.gitSubTab')).toBe('branches')

    const workmacRoot = wrapper.find('[data-remote-root="workmac"]')
    await workmacRoot.trigger('contextmenu')
    await wrapper.find('[data-testid="git-ctx-edit-remote"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="git-remote-editor"]').exists()).toBe(true)
    expect(
      (wrapper.find('[data-testid="git-edit-remote-name"]').element as HTMLInputElement).value
    ).toBe('workmac')

    // Remount restores persisted `branches` sub-tab automatically.
    wrapper.unmount()
    const remounted = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()
    expect(remounted.findAll('[role="tab"]')[1]!.attributes('aria-selected')).toBe('true')
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

  it('groups slash-containing remote names cleanly, passes fullRef on preview, refreshes preview commits when shortOid changes, and preserves editors on partial failures', async () => {
    const slashTree = buildBranchTree(
      [
        {
          name: 'team/upstream/feat/demo',
          fullRef: 'refs/remotes/team/upstream/feat/demo',
          remoteName: 'team/upstream',
          current: false,
          isRemote: true,
          shortOid: '111aaaa'
        }
      ],
      'remote',
      undefined,
      ['team/upstream'],
      ['team/upstream']
    )
    expect(slashTree).toHaveLength(1)
    expect(slashTree[0]).toMatchObject({
      kind: 'folder',
      label: 'team/upstream',
      remoteName: 'team/upstream',
      depth: 0
    })

    gitMocks.branches
      .mockResolvedValueOnce({
        current: 'task/feat/git',
        detached: false,
        branches: [
          {
            name: 'task/feat/git',
            fullRef: 'refs/heads/task/feat/git',
            current: true,
            isRemote: false,
            shortOid: 'abc1234'
          },
          {
            name: 'main',
            fullRef: 'refs/heads/main',
            current: false,
            isRemote: false,
            shortOid: 'def5678'
          }
        ],
        remotes: [
          {
            name: 'empty-remote',
            fetchUrl: 'https://github.com/org/empty.git',
            pushUrl: 'https://github.com/org/empty.git',
            host: 'github.com',
            provider: 'github',
            displayLabel: 'GitHub'
          }
        ]
      })
      .mockResolvedValueOnce({
        current: 'task/feat/git',
        detached: false,
        branches: [
          {
            name: 'task/feat/git',
            fullRef: 'refs/heads/task/feat/git',
            current: true,
            isRemote: false,
            shortOid: 'abc1234'
          },
          {
            name: 'main',
            fullRef: 'refs/heads/main',
            current: false,
            isRemote: false,
            shortOid: '999ffff'
          }
        ],
        remotesError: 'git remote failed'
      })

    const wrapper = mount(HomeSideGitPane, {
      props: { cwd: '/repo', conversationId: 'c-1', active: true }
    })
    await flushPromises()

    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await flushPromises()

    // Branch trees use semantic lists rather than incomplete role="tree" widgets.
    expect(wrapper.find('[role="tree"]').exists()).toBe(false)
    expect(wrapper.find('[role="treeitem"]').exists()).toBe(false)

    // Keyboard-accessible remote actions button works even on a remote with 0 branches.
    const emptyActionsBtn = wrapper.find('[data-testid="git-remote-actions-empty-remote"]')
    expect(emptyActionsBtn.exists()).toBe(true)
    await emptyActionsBtn.trigger('click')
    await wrapper.find('[data-testid="git-ctx-edit-remote"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="git-remote-editor"]').exists()).toBe(true)

    // Previewing `main` passes canonical `fullRef` (`refs/heads/main`), and a refresh that
    // updates `shortOid` reloads commits while a remotesError keeps the remote list intact.
    const mainRow = wrapper
      .findAll('.HomeSideGit-BranchRow')
      .find((row) => row.find('.HomeSideGit-BranchRowName').text() === 'main')
    await mainRow!.trigger('click')
    await flushPromises()
    expect(gitMocks.log).toHaveBeenCalledWith({
      cwd: '/repo',
      conversationId: 'c-1',
      ref: 'refs/heads/main',
      limit: 8
    })

    // Refresh branches -> `shortOid` changed from def5678 to 999ffff -> triggers second log call.
    const refreshBtn = wrapper.find('button[aria-label="home.git.refresh"]')
    await refreshBtn.trigger('click')
    await flushPromises()
    expect(gitMocks.log).toHaveBeenCalledTimes(2)
    // Existing remote `empty-remote` is preserved despite `remotesError`.
    expect(wrapper.find('[data-remote-root="empty-remote"]').exists()).toBe(true)

    // When rename succeeds but setUpstream fails, branch editor stays open on the renamed branch.
    gitMocks.setUpstream.mockResolvedValueOnce({ ok: false, error: 'Upstream missing' })
    gitMocks.branches.mockResolvedValueOnce({
      current: 'task/feat/git',
      detached: false,
      branches: [
        {
          name: 'task/feat/git',
          fullRef: 'refs/heads/task/feat/git',
          current: true,
          isRemote: false,
          shortOid: 'abc1234'
        },
        {
          name: 'main-renamed',
          fullRef: 'refs/heads/main-renamed',
          current: false,
          isRemote: false,
          shortOid: '999ffff'
        },
        {
          name: 'origin/main',
          fullRef: 'refs/remotes/origin/main',
          current: false,
          isRemote: true,
          shortOid: '999ffff'
        }
      ],
      remotes: []
    })
    await mainRow!.trigger('contextmenu')
    await wrapper.find('[data-testid="git-ctx-edit-branch"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="git-edit-branch-name"]').setValue('main-renamed')
    // Manually include option in upstream select or use existing option after next branch load;
    // set value via input dispatch to simulate selecting an upstream before submit.
    const selectEl = wrapper.find('[data-testid="git-edit-branch-upstream"]')
    const option = document.createElement('option')
    option.value = 'origin/main'
    option.text = 'origin/main'
    selectEl.element.appendChild(option)
    await selectEl.setValue('origin/main')
    await wrapper.find('[data-testid="git-branch-editor"] form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="git-branch-editor"]').exists()).toBe(true)
    expect(
      (wrapper.find('[data-testid="git-edit-branch-upstream"]').element as HTMLSelectElement).value
    ).toBe('origin/main')
  })
})

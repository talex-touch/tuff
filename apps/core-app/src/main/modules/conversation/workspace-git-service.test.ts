import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../local-ai-cli/workspace-root', () => ({
  peekConversationWorkspaceRoot: () => undefined
}))

vi.mock('../project/project-store', () => ({
  getProject: () => null
}))

vi.mock('./conversation-store', () => ({
  getConversation: () => null
}))

import {
  assertSafeRepoRelativePath,
  checkoutWorkspaceGitBranch,
  commitWorkspaceGitChanges,
  discardWorkspaceGitFile,
  fetchWorkspaceGit,
  isValidBranchName,
  listWorkspaceGitBranches,
  pullWorkspaceGit,
  pushWorkspaceGit,
  readWorkspaceGitDiff,
  readWorkspaceGitLog,
  readWorkspaceGitStatus,
  stageWorkspaceGitFiles,
  unstageWorkspaceGitFiles
} from './workspace-git-service'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      LC_ALL: 'C',
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test Author',
      GIT_COMMITTER_EMAIL: 'test@example.com'
    }
  })
  return stdout
}

async function initTempRepo(root: string): Promise<void> {
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.name', 'Test Author'])
  await git(root, ['config', 'user.email', 'test@example.com'])
}

describe('workspace-git-service', () => {
  const tempDirs: string[] = []

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('validates repo-relative paths and branch names against injection and traversal', () => {
    expect(assertSafeRepoRelativePath('/repo', 'src/index.ts')).toBe('src/index.ts')
    expect(() => assertSafeRepoRelativePath('/repo', '../secret.txt')).toThrow(
      'GIT_PATH_OUTSIDE_REPO'
    )
    expect(() => assertSafeRepoRelativePath('/repo', '/etc/passwd')).toThrow(
      'GIT_PATH_OUTSIDE_REPO'
    )
    expect(isValidBranchName('task/feat/git-panel')).toBe(true)
    expect(isValidBranchName('-bad-flag')).toBe(false)
    expect(isValidBranchName('a..b')).toBe(false)
    expect(isValidBranchName('has space')).toBe(false)
  })

  it('reports non-repository directories cleanly', async () => {
    const plainDir = await makeTempDir('tuff-git-nonrepo-')
    const status = await readWorkspaceGitStatus({ cwd: plainDir })
    expect(status.available).toBe(true)
    expect(status.isRepo).toBe(false)
    expect(status.files).toEqual([])
  })

  it('supports unborn repo status/unstage, diff, stage, discard, commit, branches, and log', async () => {
    const repo = await makeTempDir('tuff-git-repo-')
    await initTempRepo(repo)

    // Unborn repository handles log and staging/unstaging cleanly.
    const emptyLog = await readWorkspaceGitLog({ cwd: repo })
    expect(emptyLog.commits).toEqual([])

    await fs.writeFile(path.join(repo, 'hello.txt'), 'line 1\nline 2\n', 'utf8')
    const untrackedDiff = await readWorkspaceGitDiff({
      cwd: repo,
      path: 'hello.txt',
      untracked: true
    })
    expect(untrackedDiff.empty).toBe(false)
    expect(untrackedDiff.additions).toBe(2)
    expect(untrackedDiff.diff).toContain('+line 1')

    const stagedFirst = await stageWorkspaceGitFiles({ cwd: repo, paths: ['hello.txt'] })
    expect(stagedFirst.ok).toBe(true)
    expect(stagedFirst.status?.stagedCount).toBe(1)

    const unstagedFirst = await unstageWorkspaceGitFiles({ cwd: repo, paths: ['hello.txt'] })
    expect(unstagedFirst.ok).toBe(true)
    expect(unstagedFirst.status?.stagedCount).toBe(0)
    expect(unstagedFirst.status?.untrackedCount).toBe(1)

    // Stage and commit initial file.
    await stageWorkspaceGitFiles({ cwd: repo, all: true })
    const committed = await commitWorkspaceGitChanges({ cwd: repo, message: 'Initial commit' })
    expect(committed.ok).toBe(true)
    expect(committed.status?.files).toHaveLength(0)

    const logAfter = await readWorkspaceGitLog({ cwd: repo })
    expect(logAfter.commits).toHaveLength(1)
    expect(logAfter.commits[0]!.subject).toBe('Initial commit')

    // Modify tracked file -> inspect diff -> discard restores original content.
    await fs.writeFile(path.join(repo, 'hello.txt'), 'line 1\nchanged\n', 'utf8')
    const worktreeDiff = await readWorkspaceGitDiff({ cwd: repo, path: 'hello.txt' })
    expect(worktreeDiff.additions).toBe(1)
    expect(worktreeDiff.deletions).toBe(1)
    expect(worktreeDiff.diff).toContain('+changed')

    // Refuses to delete a tracked file if untracked: true is mistakenly passed.
    const wrongDiscard = await discardWorkspaceGitFile({
      cwd: repo,
      path: 'hello.txt',
      untracked: true
    })
    expect(wrongDiscard.ok).toBe(false)

    const restored = await discardWorkspaceGitFile({ cwd: repo, path: 'hello.txt' })
    expect(restored.ok).toBe(true)
    expect(await fs.readFile(path.join(repo, 'hello.txt'), 'utf8')).toBe('line 1\nline 2\n')

    // Untracked file discard removes the untracked file safely.
    await fs.writeFile(path.join(repo, 'scratch.tmp'), 'temp', 'utf8')
    const removedUntracked = await discardWorkspaceGitFile({
      cwd: repo,
      path: 'scratch.tmp',
      untracked: true
    })
    expect(removedUntracked.ok).toBe(true)
    await expect(fs.stat(path.join(repo, 'scratch.tmp'))).rejects.toThrow()

    // Branch creation & switching.
    const created = await checkoutWorkspaceGitBranch({
      cwd: repo,
      branch: 'feat/sidebar-git',
      create: true
    })
    expect(created.ok).toBe(true)
    expect(created.status?.branch).toBe('feat/sidebar-git')

    const branchList = await listWorkspaceGitBranches({ cwd: repo })
    expect(branchList.current).toBe('feat/sidebar-git')
    expect(branchList.branches.map((b) => b.name)).toContain('main')
    expect(branchList.branches.map((b) => b.name)).toContain('feat/sidebar-git')

    const switchedBack = await checkoutWorkspaceGitBranch({ cwd: repo, branch: 'main' })
    expect(switchedBack.ok).toBe(true)
    expect(switchedBack.status?.branch).toBe('main')
  })

  it('supports push, fetch, and pull against a bare remote repository', async () => {
    const bare = await makeTempDir('tuff-git-bare-')
    const repoA = await makeTempDir('tuff-git-a-')
    const repoB = await makeTempDir('tuff-git-b-')

    await git(bare, ['init', '--bare', '-b', 'main'])
    await initTempRepo(repoA)
    await git(repoA, ['remote', 'add', 'origin', bare])

    await fs.writeFile(path.join(repoA, 'README.md'), '# Tuff\n', 'utf8')
    await stageWorkspaceGitFiles({ cwd: repoA, all: true })
    await commitWorkspaceGitChanges({ cwd: repoA, message: 'Add readme' })

    const pushed = await pushWorkspaceGit({ cwd: repoA, setUpstream: true })
    expect(pushed.ok).toBe(true)
    expect(pushed.status?.upstream).toBe('origin/main')
    expect(pushed.status?.ahead).toBe(0)

    // Clone into repoB and push a second commit, then fetch & pull from repoA.
    await git(repoB, ['clone', bare, '.'])
    await git(repoB, ['config', 'user.name', 'Test Author'])
    await git(repoB, ['config', 'user.email', 'test@example.com'])
    await fs.writeFile(path.join(repoB, 'notes.txt'), 'from remote\n', 'utf8')
    await stageWorkspaceGitFiles({ cwd: repoB, all: true })
    await commitWorkspaceGitChanges({ cwd: repoB, message: 'Remote commit' })
    const pushedB = await pushWorkspaceGit({ cwd: repoB })
    expect(pushedB.ok).toBe(true)

    const fetchedA = await fetchWorkspaceGit({ cwd: repoA })
    expect(fetchedA.ok).toBe(true)
    expect(fetchedA.status?.behind).toBe(1)

    const pulledA = await pullWorkspaceGit({ cwd: repoA })
    expect(pulledA.ok).toBe(true)
    expect(pulledA.status?.behind).toBe(0)
    expect(await fs.readFile(path.join(repoA, 'notes.txt'), 'utf8')).toBe('from remote\n')
  })
})

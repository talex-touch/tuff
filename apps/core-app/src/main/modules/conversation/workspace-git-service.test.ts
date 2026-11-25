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
  deleteWorkspaceGitBranch,
  discardWorkspaceGitFile,
  fetchWorkspaceGit,
  isValidBranchName,
  isValidRemoteName,
  listWorkspaceGitBranches,
  parseGitRemoteUrl,
  pullWorkspaceGit,
  pushWorkspaceGit,
  readWorkspaceGitDiff,
  readWorkspaceGitLog,
  readWorkspaceGitStatus,
  removeWorkspaceGitRemote,
  renameWorkspaceGitBranch,
  resolveCommitAuthorAvatarUrl,
  saveWorkspaceGitRemote,
  setWorkspaceGitBranchUpstream,
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
    expect(assertSafeRepoRelativePath('/repo', ' notes.txt')).toBe(' notes.txt')
    expect(assertSafeRepoRelativePath('/repo', '..notes.txt')).toBe('..notes.txt')
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
    expect(logAfter.commits[0]!.authorEmail).toBe('test@example.com')
    expect(logAfter.commits[0]!.avatarUrl).toMatch(
      /^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{64}\?s=64&d=404$/
    )

    // Standard-protocol avatar URL resolution: Gravatar SHA-256 + GitHub noreply addresses.
    expect(resolveCommitAuthorAvatarUrl('  Test@Example.com ')).toBe(
      resolveCommitAuthorAvatarUrl('test@example.com')
    )
    expect(resolveCommitAuthorAvatarUrl('424242+TalexDreamSoul@users.noreply.github.com')).toBe(
      'https://avatars.githubusercontent.com/u/424242?s=64'
    )
    expect(resolveCommitAuthorAvatarUrl('octocat@users.noreply.github.com')).toBe(
      'https://github.com/octocat.png?size=64'
    )
    expect(resolveCommitAuthorAvatarUrl('not-an-email')).toBeUndefined()

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

    // Preview commits on another branch via `ref` without switching HEAD, and reject invalid refs.
    await checkoutWorkspaceGitBranch({ cwd: repo, branch: 'feat/sidebar-git' })
    await fs.writeFile(path.join(repo, 'feature.txt'), 'feat\n', 'utf8')
    await stageWorkspaceGitFiles({ cwd: repo, all: true })
    await commitWorkspaceGitChanges({ cwd: repo, message: 'Feature-only commit' })
    await checkoutWorkspaceGitBranch({ cwd: repo, branch: 'main' })

    const previewLog = await readWorkspaceGitLog({ cwd: repo, ref: 'feat/sidebar-git', limit: 5 })
    expect(previewLog.commits[0]!.subject).toBe('Feature-only commit')

    const badRefLog = await readWorkspaceGitLog({ cwd: repo, ref: '--exec=evil' })
    expect(badRefLog.commits).toEqual([])
    expect(badRefLog.error).toBeTruthy()
  }, 15_000)

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
  }, 15_000)

  it('handles unborn edited unstage, literal pathspecs, nonrecursive directory guard, symlink diff containment, missing branch checkout, and pushRemote', async () => {
    const repo = await makeTempDir('tuff-git-hardened-')
    const outside = await makeTempDir('tuff-git-outside-')
    const barePrimary = await makeTempDir('tuff-git-remote-a-')
    const bareSecondary = await makeTempDir('tuff-git-remote-b-')
    await initTempRepo(repo)
    await git(barePrimary, ['init', '--bare', '-b', 'main'])
    await git(bareSecondary, ['init', '--bare', '-b', 'main'])

    // Stage a new file, edit it before the first commit, then unstage without losing edits.
    await fs.writeFile(path.join(repo, 'first.txt'), 'v1\n', 'utf8')
    await stageWorkspaceGitFiles({ cwd: repo, paths: ['first.txt'] })
    await fs.writeFile(path.join(repo, 'first.txt'), 'v2-edited\n', 'utf8')
    const unstagedEdited = await unstageWorkspaceGitFiles({ cwd: repo, paths: ['first.txt'] })
    expect(unstagedEdited.ok).toBe(true)
    expect(await fs.readFile(path.join(repo, 'first.txt'), 'utf8')).toBe('v2-edited\n')

    // Commit files including glob-like filename `draft[1].txt` and `draft1.txt`.
    await fs.writeFile(path.join(repo, 'draft[1].txt'), 'bracket\n', 'utf8')
    await fs.writeFile(path.join(repo, 'draft1.txt'), 'plain\n', 'utf8')
    await fs.writeFile(path.join(repo, '.gitignore'), 'scratch/keep.db\n', 'utf8')
    await stageWorkspaceGitFiles({ cwd: repo, all: true })
    await commitWorkspaceGitChanges({ cwd: repo, message: 'Seed' })

    // Literal pathspec discard on `draft[1].txt` must not touch `draft1.txt`.
    await fs.writeFile(path.join(repo, 'draft[1].txt'), 'bracket-mod\n', 'utf8')
    await fs.writeFile(path.join(repo, 'draft1.txt'), 'plain-mod\n', 'utf8')
    const discardBracket = await discardWorkspaceGitFile({ cwd: repo, path: 'draft[1].txt' })
    expect(discardBracket.ok).toBe(true)
    expect(await fs.readFile(path.join(repo, 'draft[1].txt'), 'utf8')).toBe('bracket\n')
    expect(await fs.readFile(path.join(repo, 'draft1.txt'), 'utf8')).toBe('plain-mod\n')

    // Never recursively delete an untracked directory (preserving ignored files inside).
    await fs.mkdir(path.join(repo, 'scratch'))
    await fs.writeFile(path.join(repo, 'scratch', 'draft.txt'), 'tmp', 'utf8')
    await fs.writeFile(path.join(repo, 'scratch', 'keep.db'), 'db', 'utf8')
    const dirDiscard = await discardWorkspaceGitFile({
      cwd: repo,
      path: 'scratch',
      untracked: true
    })
    expect(dirDiscard.ok).toBe(false)
    expect(await fs.readFile(path.join(repo, 'scratch', 'keep.db'), 'utf8')).toBe('db')

    // Untracked symlink preview must render link target, never outside file contents.
    const secretFile = path.join(outside, 'secret.txt')
    await fs.writeFile(secretFile, 'TOP-SECRET-CONTENT', 'utf8')
    await fs.symlink(secretFile, path.join(repo, 'escape-link'))
    const linkDiff = await readWorkspaceGitDiff({
      cwd: repo,
      path: 'escape-link',
      untracked: true
    })
    expect(linkDiff.diff).toContain('120000')
    expect(linkDiff.diff).not.toContain('TOP-SECRET-CONTENT')

    // Missing branch matching tracked file name must fail closed without restoring edits.
    const missingBranch = await checkoutWorkspaceGitBranch({ cwd: repo, branch: 'draft1.txt' })
    expect(missingBranch.ok).toBe(false)
    expect(await fs.readFile(path.join(repo, 'draft1.txt'), 'utf8')).toBe('plain-mod\n')

    // Multiple remotes fail closed unless branch pushRemote or remote.pushDefault is set.
    await git(repo, ['remote', 'add', 'alpha', barePrimary])
    await git(repo, ['remote', 'add', 'beta', bareSecondary])
    const ambiguousPush = await pushWorkspaceGit({ cwd: repo, setUpstream: true })
    expect(ambiguousPush.ok).toBe(false)

    await git(repo, ['config', 'branch.main.pushRemote', 'beta'])
    const configuredPush = await pushWorkspaceGit({ cwd: repo, setUpstream: true })
    expect(configuredPush.ok).toBe(true)
    expect(configuredPush.status?.upstream).toBe('beta/main')
  }, 15_000)

  it('parses remote provider/domain URLs safely and supports editing branches and remotes', async () => {
    expect(isValidRemoteName('origin')).toBe(true)
    expect(isValidRemoteName('fork-crosery')).toBe(true)
    expect(isValidRemoteName('-bad')).toBe(false)
    expect(isValidRemoteName('a/b')).toBe(false)

    expect(parseGitRemoteUrl('git@github.com:talex-touch/tuff.git')).toMatchObject({
      provider: 'github',
      host: 'github.com',
      displayLabel: 'GitHub',
      webUrl: 'https://github.com/talex-touch/tuff',
      hasCredentials: false
    })
    expect(parseGitRemoteUrl('https://user:secret@github.com/talex-touch/tuff.git')).toMatchObject({
      provider: 'github',
      displayLabel: 'GitHub',
      safeUrl: 'https://github.com/talex-touch/tuff.git',
      webUrl: 'https://github.com/talex-touch/tuff',
      hasCredentials: true
    })
    expect(parseGitRemoteUrl('git@g.ktvsky.com:team/tuff.git')).toMatchObject({
      provider: 'custom',
      host: 'g.ktvsky.com',
      displayLabel: 'g.ktvsky.com',
      webUrl: 'https://g.ktvsky.com/team/tuff'
    })
    expect(parseGitRemoteUrl('ssh://git@g.ktvsky.com:2222/team/tuff.git')).toMatchObject({
      provider: 'custom',
      host: 'g.ktvsky.com',
      displayLabel: 'g.ktvsky.com',
      webUrl: 'https://g.ktvsky.com/team/tuff'
    })
    const workmacParsed = parseGitRemoteUrl('workmac:/Users/dev/repo')
    expect(workmacParsed).toMatchObject({
      provider: 'custom',
      host: 'workmac',
      displayLabel: 'workmac'
    })
    expect(workmacParsed.webUrl).toBeUndefined()

    const localParsed = parseGitRemoteUrl('/tmp/bare-repo.git')
    expect(localParsed).toMatchObject({
      provider: 'local',
      displayLabel: 'Local'
    })
    expect(localParsed.webUrl).toBeUndefined()

    const bare = await makeTempDir('tuff-git-edit-bare-')
    const repo = await makeTempDir('tuff-git-edit-repo-')
    await git(bare, ['init', '--bare', '-b', 'main'])
    await initTempRepo(repo)
    await fs.writeFile(path.join(repo, 'app.txt'), 'init\n', 'utf8')
    await stageWorkspaceGitFiles({ cwd: repo, all: true })
    await commitWorkspaceGitChanges({ cwd: repo, message: 'Init' })

    // Add remote, fetch/push, inspect remotes list, rename/edit remote, remove remote.
    const addedRemote = await saveWorkspaceGitRemote({
      cwd: repo,
      mode: 'add',
      name: 'upstream',
      fetchUrl: bare
    })
    expect(addedRemote.ok).toBe(true)

    const pushed = await pushWorkspaceGit({ cwd: repo, setUpstream: true })
    expect(pushed.ok).toBe(true)

    const fetchedOne = await fetchWorkspaceGit({ cwd: repo, remote: 'upstream' })
    expect(fetchedOne.ok).toBe(true)

    const editedRemote = await saveWorkspaceGitRemote({
      cwd: repo,
      mode: 'edit',
      originalName: 'upstream',
      name: 'origin',
      fetchUrl: bare
    })
    expect(editedRemote.ok).toBe(true)

    const listed = await listWorkspaceGitBranches({ cwd: repo })
    expect(listed.remotes?.some((r) => r.name === 'origin' && r.provider === 'local')).toBe(true)

    // Create, rename, set/unset upstream, and delete local branch (refusing current branch).
    await checkoutWorkspaceGitBranch({ cwd: repo, branch: 'feat/old', create: true })
    await checkoutWorkspaceGitBranch({ cwd: repo, branch: 'main' })

    const renamed = await renameWorkspaceGitBranch({
      cwd: repo,
      oldName: 'feat/old',
      newName: 'feat/renamed'
    })
    expect(renamed.ok).toBe(true)

    const setUp = await setWorkspaceGitBranchUpstream({
      cwd: repo,
      branch: 'feat/renamed',
      upstream: 'origin/main'
    })
    expect(setUp.ok).toBe(true)

    const unsetUp = await setWorkspaceGitBranchUpstream({
      cwd: repo,
      branch: 'feat/renamed',
      upstream: null
    })
    expect(unsetUp.ok).toBe(true)

    const deleteCurrent = await deleteWorkspaceGitBranch({ cwd: repo, branch: 'main' })
    expect(deleteCurrent.ok).toBe(false)

    const deleted = await deleteWorkspaceGitBranch({ cwd: repo, branch: 'feat/renamed' })
    expect(deleted.ok).toBe(true)

    const removedRemote = await removeWorkspaceGitRemote({ cwd: repo, name: 'origin' })
    expect(removedRemote.ok).toBe(true)

    // Also cleans up stale remote-tracking refs when `.git/config` has no matching remote entry.
    const headOid = (await git(repo, ['rev-parse', 'HEAD'])).trim()
    await git(repo, ['update-ref', 'refs/remotes/workmac/agent', headOid])
    const prunedStale = await removeWorkspaceGitRemote({ cwd: repo, name: 'workmac' })
    expect(prunedStale.ok).toBe(true)
    const afterPrune = await listWorkspaceGitBranches({ cwd: repo })
    expect(afterPrune.branches.some((b) => b.name === 'workmac/agent')).toBe(false)
  }, 15_000)
})

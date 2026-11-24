import { execFile } from 'node:child_process'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { isLinkedWorktreeGitFile } from '@talex-touch/utils/common/file-filter-service'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GitWorktreeError,
  GitWorktreeManager,
  isGitWorktreeError,
  type GitWorktreeErrorCode
} from './index'

const execFileAsync = promisify(execFile)

const GIT_REPO_OVERRIDE_ENV_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_SUPER_PREFIX',
  'GIT_PREFIX'
] as const

async function runGit(cwd: string, args: string[]): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    LC_ALL: 'C'
  }
  for (const key of GIT_REPO_OVERRIDE_ENV_VARS) {
    delete env[key]
  }
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env
  })
  return stdout.trim()
}

async function initGitRepo(repoDir: string): Promise<{ initialCommit: string }> {
  await mkdir(repoDir, { recursive: true })
  await runGit(repoDir, ['init', '-b', 'main'])
  await runGit(repoDir, ['config', 'user.email', 'worktree-test@tuff.local'])
  await runGit(repoDir, ['config', 'user.name', 'Tuff Worktree Test'])
  await runGit(repoDir, ['config', 'commit.gpgsign', 'false'])
  await writeFile(path.join(repoDir, 'README.md'), '# Sample Repo\nline 2\n', 'utf8')
  await mkdir(path.join(repoDir, 'packages', 'app'), { recursive: true })
  await writeFile(
    path.join(repoDir, 'packages', 'app', 'index.ts'),
    'export const value = 1\n',
    'utf8'
  )
  await runGit(repoDir, ['add', '.'])
  await runGit(repoDir, ['commit', '-m', 'initial commit'])
  const initialCommit = await runGit(repoDir, ['rev-parse', 'HEAD'])
  return { initialCommit }
}

async function expectWorktreeError(
  promise: Promise<unknown>,
  expectedCode: GitWorktreeErrorCode
): Promise<GitWorktreeError> {
  try {
    await promise
  } catch (error) {
    expect(isGitWorktreeError(error)).toBe(true)
    const wtError = error as GitWorktreeError
    expect(wtError.code).toBe(expectedCode)
    return wtError
  }
  throw new Error(`Expected GitWorktreeError(${expectedCode}) but promise resolved`)
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath)
    return true
  } catch {
    return false
  }
}

describe('GitWorktreeManager', () => {
  let sandboxDir = ''
  let baseDir = ''
  let repoDir = ''

  beforeEach(async () => {
    sandboxDir = await mkdtemp(path.join(tmpdir(), 'tuff-worktree-test-'))
    baseDir = path.join(sandboxDir, 'managed-worktrees')
    repoDir = path.join(sandboxDir, 'repo')
  })

  afterEach(async () => {
    if (sandboxDir) {
      await rm(sandboxDir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  it('acquires a linked worktree outside the repo root, keeps metadata outside the worktree, and preserves subdir in effectiveCwd', async () => {
    const { initialCommit } = await initGitRepo(repoDir)
    const canonicalRepo = await realpath(repoDir)
    const manager = new GitWorktreeManager({ baseDir })

    const subdir = path.join(repoDir, 'packages', 'app')
    const lease = await manager.acquireWorktree({
      runId: 'run-alpha',
      conversationId: 'conv-1',
      repoRoot: subdir
    })

    expect(lease.runId).toBe('run-alpha')
    expect(lease.conversationId).toBe('conv-1')
    expect(lease.repoRoot).toBe(canonicalRepo)
    expect(lease.baseRef).toBe('HEAD')
    expect(lease.baseCommit).toBe(initialCommit)
    expect(lease.branchName).toMatch(/^tuff\/wt\/wt-run-alpha-[0-9a-f]{12}$/)
    expect(lease.effectiveCwd).toBe(path.join(lease.worktreePath, 'packages', 'app'))

    // Linked worktree sits under baseDir and NOT inside repoRoot.
    const canonicalBase = await realpath(baseDir)
    expect(lease.worktreePath.startsWith(`${canonicalBase}${path.sep}`)).toBe(true)
    expect(lease.worktreePath.startsWith(`${canonicalRepo}${path.sep}`)).toBe(false)

    // .git file inside worktree matches the file-index linked worktree contract.
    const gitFile = await readFile(path.join(lease.worktreePath, '.git'), 'utf8')
    expect(isLinkedWorktreeGitFile(gitFile)).toBe(true)

    // Lease JSON is persisted under <baseDir>/.meta/<worktreeId>.json, leaving worktree clean.
    const metaPath = path.join(canonicalBase, '.meta', `${lease.worktreeId}.json`)
    expect(await pathExists(metaPath)).toBe(true)
    const persisted = JSON.parse(await readFile(metaPath, 'utf8'))
    expect(persisted.worktreeId).toBe(lease.worktreeId)

    // Defensive lease copies from getLease / listLeases.
    const fetched = manager.getLease(lease.worktreeId)
    expect(fetched).toEqual(lease)
    expect(manager.listLeases()).toHaveLength(1)

    const status = await manager.inspectWorktree(lease.worktreeId)
    expect(status).toMatchObject({
      worktreeId: lease.worktreeId,
      worktreePath: lease.worktreePath,
      branchName: lease.branchName,
      headCommit: initialCommit,
      dirty: false,
      changedFiles: [],
      ahead: 0,
      behind: 0
    })

    const released = await manager.releaseWorktree(lease.worktreeId)
    expect(released).toEqual({
      worktreeId: lease.worktreeId,
      removed: true,
      branchDeleted: true
    })
    expect(await pathExists(lease.worktreePath)).toBe(false)
    expect(await pathExists(metaPath)).toBe(false)
    expect(manager.getLease(lease.worktreeId)).toBeUndefined()
  })

  it('supports detached HEAD mode and custom baseRef / branchPrefix', async () => {
    const { initialCommit } = await initGitRepo(repoDir)
    await runGit(repoDir, ['checkout', '-b', 'feature/base'])
    await writeFile(path.join(repoDir, 'feature.txt'), 'from feature\n', 'utf8')
    await runGit(repoDir, ['add', 'feature.txt'])
    await runGit(repoDir, ['commit', '-m', 'feature commit'])
    const featureCommit = await runGit(repoDir, ['rev-parse', 'HEAD'])
    await runGit(repoDir, ['checkout', 'main'])

    const manager = new GitWorktreeManager({ baseDir })

    const detachedLease = await manager.acquireWorktree({
      runId: 'run-detached',
      repoRoot: repoDir,
      baseRef: 'feature/base',
      detached: true
    })
    expect(detachedLease.branchName).toBeNull()
    expect(detachedLease.baseCommit).toBe(featureCommit)
    expect(await pathExists(path.join(detachedLease.worktreePath, 'feature.txt'))).toBe(true)

    const detachedStatus = await manager.inspectWorktree(detachedLease.worktreeId)
    expect(detachedStatus.branchName).toBeNull()
    expect(detachedStatus.headCommit).toBe(featureCommit)

    const customLease = await manager.acquireWorktree({
      runId: 'run-custom',
      repoRoot: repoDir,
      baseRef: initialCommit,
      branchPrefix: 'agent/iso'
    })
    expect(customLease.branchName).toMatch(/^agent\/iso\/wt-run-custom-[0-9a-f]{12}$/)
    expect(await pathExists(path.join(customLease.worktreePath, 'feature.txt'))).toBe(false)

    // Keep branch when deleteBranch: false.
    const releaseKeepBranch = await manager.releaseWorktree(customLease.worktreeId, {
      deleteBranch: false
    })
    expect(releaseKeepBranch).toEqual({
      worktreeId: customLease.worktreeId,
      removed: true,
      branchDeleted: false
    })
    const remainingBranches = await runGit(repoDir, ['branch', '--list', customLease.branchName!])
    expect(remainingBranches).toContain(customLease.branchName!)

    const releaseDetached = await manager.releaseWorktree(detachedLease.worktreeId)
    expect(releaseDetached).toEqual({
      worktreeId: detachedLease.worktreeId,
      removed: true,
      branchDeleted: false
    })
  })

  it('isolates parallel multi-worktree edits, commits, and ahead/behind status from each other and the main repo', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })

    const [wt1, wt2, wt3] = await Promise.all([
      manager.acquireWorktree({ runId: 'parallel-1', repoRoot: repoDir, baseRef: 'main' }),
      manager.acquireWorktree({ runId: 'parallel-2', repoRoot: repoDir, baseRef: 'main' }),
      manager.acquireWorktree({ runId: 'parallel-3', repoRoot: repoDir, baseRef: 'main' })
    ])

    expect(new Set([wt1.worktreePath, wt2.worktreePath, wt3.worktreePath]).size).toBe(3)

    // Worktree 1: unstaged modification + untracked file.
    await writeFile(path.join(wt1.worktreePath, 'README.md'), '# Modified by wt1\n', 'utf8')
    await writeFile(path.join(wt1.worktreePath, 'notes.txt'), 'wt1-only\n', 'utf8')

    // Worktree 2: 2 commits ahead of main.
    await writeFile(path.join(wt2.worktreePath, 'commit1.txt'), 'c1\n', 'utf8')
    await runGit(wt2.worktreePath, ['add', 'commit1.txt'])
    await runGit(wt2.worktreePath, ['commit', '-m', 'wt2 commit 1'])
    await writeFile(path.join(wt2.worktreePath, 'commit2.txt'), 'c2\n', 'utf8')
    await runGit(wt2.worktreePath, ['add', 'commit2.txt'])
    await runGit(wt2.worktreePath, ['commit', '-m', 'wt2 commit 2'])

    // Advance main in original repo by 1 commit so worktrees become 1 behind main.
    await writeFile(path.join(repoDir, 'main-advance.txt'), 'main\n', 'utf8')
    await runGit(repoDir, ['add', 'main-advance.txt'])
    await runGit(repoDir, ['commit', '-m', 'advance main'])

    // Main repo never saw wt1 or wt2 edits; wt3 stays clean.
    expect(await pathExists(path.join(repoDir, 'notes.txt'))).toBe(false)
    expect(await pathExists(path.join(wt3.worktreePath, 'notes.txt'))).toBe(false)
    expect(await pathExists(path.join(wt3.worktreePath, 'commit1.txt'))).toBe(false)

    const [s1, s2, s3] = await Promise.all([
      manager.inspectWorktree(wt1.worktreeId),
      manager.inspectWorktree(wt2.worktreeId),
      manager.inspectWorktree(wt3.worktreeId)
    ])

    expect(s1.dirty).toBe(true)
    expect(s1.changedFiles.map((f) => f.path).sort()).toEqual(['README.md', 'notes.txt'])
    expect(s1.ahead).toBe(0)
    expect(s1.behind).toBe(1)

    expect(s2.dirty).toBe(false)
    expect(s2.ahead).toBe(2)
    expect(s2.behind).toBe(1)

    expect(s3.dirty).toBe(false)
    expect(s3.changedFiles).toEqual([])
    expect(s3.ahead).toBe(0)
    expect(s3.behind).toBe(1)

    await manager.disposeAll({ force: true })
  })

  it('extracts unified diffs for modified, renamed, binary, and untracked files while enforcing streaming byte truncation', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })
    const lease = await manager.acquireWorktree({ runId: 'run-diff', repoRoot: repoDir })

    // Tracked edit + staged rename + untracked text + untracked binary.
    await writeFile(
      path.join(lease.worktreePath, 'README.md'),
      '# Updated Title\nline 2\nline 3\n',
      'utf8'
    )
    await runGit(lease.worktreePath, ['mv', 'packages/app/index.ts', 'packages/app/main.ts'])
    await writeFile(
      path.join(lease.worktreePath, 'new-file.txt'),
      'hello world\nsecond line\n',
      'utf8'
    )
    await writeFile(
      path.join(lease.worktreePath, 'blob.bin'),
      Buffer.from([0x00, 0x01, 0x02, 0xff])
    )

    // Untracked symlink pointing outside worktree MUST NOT leak target file contents.
    const externalSecret = path.join(sandboxDir, 'secret-outside.txt')
    await writeFile(externalSecret, 'TOP_SECRET_CANARY_9999\n', 'utf8')
    await symlink(externalSecret, path.join(lease.worktreePath, 'leak-link.txt'))

    const fullDiff = await manager.getWorktreeDiff(lease.worktreeId)
    expect(fullDiff.truncated).toBe(false)
    expect(fullDiff.byteLength).toBe(Buffer.byteLength(fullDiff.patch, 'utf8'))
    expect(fullDiff.patch).toContain('README.md')
    expect(fullDiff.patch).toContain('+# Updated Title')
    expect(fullDiff.patch).toContain('new-file.txt')
    expect(fullDiff.patch).toContain('+hello world')
    expect(fullDiff.patch).toContain('Binary files /dev/null and b/blob.bin differ')
    expect(fullDiff.patch).not.toContain('TOP_SECRET_CANARY_9999')

    const renamedEntry = fullDiff.status.changedFiles.find((f) => f.kind === 'renamed')
    expect(renamedEntry).toMatchObject({
      path: 'packages/app/main.ts',
      previousPath: 'packages/app/index.ts',
      staged: true
    })

    // Generate a large tracked diff with multi-byte UTF-8 characters (> 5 MiB to exceed default execFile maxBuffer!)
    // and assert streaming bounded truncation returns cleanly with byteLength <= maxBytes and valid UTF-8.
    const utf8Line = '中文测试内容🚀-0123456789abcdef-line-padding-for-streaming-diff-check\n'
    const bigContent = utf8Line.repeat(75_000) // ~5.5 MiB
    await writeFile(path.join(lease.worktreePath, 'README.md'), bigContent, 'utf8')

    const maxBytes = 1024
    const truncatedDiff = await manager.getWorktreeDiff(lease.worktreeId, { maxBytes })
    expect(truncatedDiff.truncated).toBe(true)
    expect(truncatedDiff.byteLength).toBeLessThanOrEqual(maxBytes)
    expect(Buffer.byteLength(truncatedDiff.patch, 'utf8')).toBe(truncatedDiff.byteLength)
    expect(truncatedDiff.patch).not.toContain('\uFFFD')
    expect(truncatedDiff.patch).toContain('diff --git a/README.md b/README.md')

    await manager.releaseWorktree(lease.worktreeId, { force: true })
  })

  it('refuses to release a dirty worktree unless force is true and reports changedFiles', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })
    const lease = await manager.acquireWorktree({ runId: 'run-dirty', repoRoot: repoDir })

    await writeFile(path.join(lease.worktreePath, 'README.md'), 'dirty edit\n', 'utf8')
    await writeFile(path.join(lease.worktreePath, 'untracked.txt'), 'new\n', 'utf8')

    const dirtyError = await expectWorktreeError(
      manager.releaseWorktree(lease.worktreeId),
      'WORKTREE_DIRTY'
    )
    expect(dirtyError.changedFiles?.slice().sort()).toEqual(['README.md', 'untracked.txt'])
    expect(await pathExists(lease.worktreePath)).toBe(true)
    expect(manager.getLease(lease.worktreeId)).toBeDefined()

    const forced = await manager.releaseWorktree(lease.worktreeId, { force: true })
    expect(forced).toEqual({
      worktreeId: lease.worktreeId,
      removed: true,
      branchDeleted: true
    })
    expect(await pathExists(lease.worktreePath)).toBe(false)

    await expectWorktreeError(manager.releaseWorktree(lease.worktreeId), 'WORKTREE_NOT_FOUND')
  })

  it('reaps stale orphaned worktrees while protecting active runs, dirty trees, young leases, and symlinks', async () => {
    await initGitRepo(repoDir)
    let clock = 1_000_000
    const writerMgr = new GitWorktreeManager({ baseDir, now: () => clock })

    const activeLease = await writerMgr.acquireWorktree({ runId: 'run-active', repoRoot: repoDir })
    const staleCleanLease = await writerMgr.acquireWorktree({
      runId: 'run-stale-clean',
      repoRoot: repoDir
    })
    const staleDirtyLease = await writerMgr.acquireWorktree({
      runId: 'run-stale-dirty',
      repoRoot: repoDir
    })
    await writeFile(path.join(staleDirtyLease.worktreePath, 'wip.txt'), 'keep me\n', 'utf8')

    clock += 60_000
    const youngLease = await writerMgr.acquireWorktree({ runId: 'run-young', repoRoot: repoDir })

    // Place a symlink decoy inside baseDir pointing outside — MUST never be deleted even under force: true!
    const outsideVictimDir = path.join(sandboxDir, 'victim-dir')
    await mkdir(outsideVictimDir, { recursive: true })
    await writeFile(path.join(outsideVictimDir, 'precious.txt'), 'do not delete', 'utf8')
    await symlink(outsideVictimDir, path.join(baseDir, 'wt-symlink-decoy'))

    // Simulate a fresh manager after app restart with clock advanced by 5s past youngLease.
    clock += 5_000
    const reaperMgr = new GitWorktreeManager({ baseDir, now: () => clock })

    const firstPass = await reaperMgr.reapOrphans({
      maxAgeMs: 30_000,
      activeRunIds: ['run-active'],
      force: false
    })

    expect(firstPass.reapedIds).toEqual([staleCleanLease.worktreeId])
    expect(firstPass.skippedActiveIds).toEqual([activeLease.worktreeId])
    expect(firstPass.skippedDirtyIds).toEqual([staleDirtyLease.worktreeId])
    expect(firstPass.failedIds).toEqual(['wt-symlink-decoy'])

    expect(await pathExists(staleCleanLease.worktreePath)).toBe(false)
    expect(await pathExists(activeLease.worktreePath)).toBe(true)
    expect(await pathExists(staleDirtyLease.worktreePath)).toBe(true)
    expect(await pathExists(youngLease.worktreePath)).toBe(true)
    expect(await pathExists(path.join(outsideVictimDir, 'precious.txt'))).toBe(true)

    // Forced reap with maxAgeMs=0 reaps staleDirty + young, still skips activeLease AND never touches symlink victim!
    const secondPass = await reaperMgr.reapOrphans({
      maxAgeMs: 0,
      activeRunIds: ['run-active'],
      force: true
    })
    expect(secondPass.reapedIds.sort()).toEqual(
      [staleDirtyLease.worktreeId, youngLease.worktreeId].sort()
    )
    expect(secondPass.skippedActiveIds).toEqual([activeLease.worktreeId])
    expect(secondPass.failedIds).toEqual(['wt-symlink-decoy'])
    expect(await pathExists(path.join(outsideVictimDir, 'precious.txt'))).toBe(true)

    // Clean up remaining active lease via reaperMgr (loading persisted metadata).
    await reaperMgr.releaseWorktree(activeLease.worktreeId)
  })

  it('rejects non-git dirs, bare repos, .git metadata dirs, path traversal, symlink escapes, nested worktrees, and unsafe git refs', async () => {
    await initGitRepo(repoDir)
    const otherRepoDir = path.join(sandboxDir, 'other-repo')
    await initGitRepo(otherRepoDir)

    const nonGitDir = path.join(sandboxDir, 'not-a-repo')
    await mkdir(nonGitDir, { recursive: true })

    const bareRepoDir = path.join(sandboxDir, 'bare.git')
    await mkdir(bareRepoDir, { recursive: true })
    await runGit(bareRepoDir, ['init', '--bare'])

    const manager = new GitWorktreeManager({ baseDir })

    // Non-git, bare repo, .git dir, missing path, file path, relative path.
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r1', repoRoot: nonGitDir }),
      'WORKTREE_NOT_GIT_REPO'
    )
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r2', repoRoot: bareRepoDir }),
      'WORKTREE_BARE_REPO'
    )
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r3', repoRoot: path.join(repoDir, '.git') }),
      'WORKTREE_INVALID_REPO'
    )
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r4', repoRoot: path.join(sandboxDir, 'does-not-exist') }),
      'WORKTREE_INVALID_REPO'
    )
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r5', repoRoot: path.join(repoDir, 'README.md') }),
      'WORKTREE_INVALID_REPO'
    )
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r6', repoRoot: 'relative/path' }),
      'WORKTREE_INVALID_REPO'
    )

    // Path traversal segments in repoRoot & worktreeId.
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r7', repoRoot: `${repoDir}/packages/../..` }),
      'WORKTREE_PATH_ESCAPE'
    )
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r8', repoRoot: '../outside' }),
      'WORKTREE_PATH_ESCAPE'
    )
    await expectWorktreeError(manager.inspectWorktree('../escape'), 'WORKTREE_PATH_ESCAPE')
    await expectWorktreeError(manager.releaseWorktree('wt/escape'), 'WORKTREE_PATH_ESCAPE')

    // Symlink inside repo escaping outside to non-git dir AND to another git repo.
    const escapeNonGitLink = path.join(repoDir, 'escape-non-git')
    await symlink(nonGitDir, escapeNonGitLink)
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r9', repoRoot: escapeNonGitLink }),
      'WORKTREE_PATH_ESCAPE'
    )

    const escapeOtherRepoLink = path.join(repoDir, 'packages', 'escape-other-repo')
    await symlink(otherRepoDir, escapeOtherRepoLink)
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r10', repoRoot: escapeOtherRepoLink }),
      'WORKTREE_PATH_ESCAPE'
    )

    // baseDir inside repoRoot MUST be rejected (keeps linked worktrees out of repo tree).
    const insideRepoManager = new GitWorktreeManager({
      baseDir: path.join(repoDir, '.worktrees')
    })
    await expectWorktreeError(
      insideRepoManager.acquireWorktree({ runId: 'r11', repoRoot: repoDir }),
      'WORKTREE_PATH_ESCAPE'
    )

    // Nested managed worktree MUST be rejected.
    const validLease = await manager.acquireWorktree({ runId: 'r-parent', repoRoot: repoDir })
    await expectWorktreeError(
      manager.acquireWorktree({ runId: 'r-nested', repoRoot: validLease.worktreePath }),
      'WORKTREE_PATH_ESCAPE'
    )

    // Symlink swap attack on managed worktreePath before release MUST fail closed and leave victim untouched.
    const victimDir = path.join(sandboxDir, 'swap-victim')
    await mkdir(victimDir, { recursive: true })
    await writeFile(path.join(victimDir, 'keep.txt'), 'safe', 'utf8')
    await rm(validLease.worktreePath, { recursive: true, force: true })
    await symlink(victimDir, validLease.worktreePath)

    await expectWorktreeError(
      manager.inspectWorktree(validLease.worktreeId),
      'WORKTREE_PATH_ESCAPE'
    )
    await expectWorktreeError(
      manager.releaseWorktree(validLease.worktreeId, { force: true }),
      'WORKTREE_PATH_ESCAPE'
    )
    expect(await pathExists(path.join(victimDir, 'keep.txt'))).toBe(true)

    // Option injection / invalid refs.
    for (const badRef of [
      '-f',
      '--upload-pack=evil',
      'HEAD..main',
      'HEAD@{0}',
      'bad ref',
      'a\nb',
      'nonexistent-ref'
    ]) {
      await expectWorktreeError(
        manager.acquireWorktree({ runId: 'r-ref', repoRoot: repoDir, baseRef: badRef }),
        'WORKTREE_INVALID_REF'
      )
    }
    for (const badPrefix of ['-evil', 'a..b', 'a@{0}', 'a b', 'a/.hidden', 'foo.lock']) {
      await expectWorktreeError(
        manager.acquireWorktree({ runId: 'r-prefix', repoRoot: repoDir, branchPrefix: badPrefix }),
        'WORKTREE_INVALID_REF'
      )
    }
  })

  it('disposeAll cleans clean worktrees while preserving dirty ones unless force is true', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })

    const cleanLease = await manager.acquireWorktree({ runId: 'run-clean', repoRoot: repoDir })
    const dirtyLease = await manager.acquireWorktree({ runId: 'run-dirty', repoRoot: repoDir })
    await writeFile(path.join(dirtyLease.worktreePath, 'unsaved.txt'), 'unsaved\n', 'utf8')

    await manager.disposeAll({ force: false })
    expect(await pathExists(cleanLease.worktreePath)).toBe(false)
    expect(await pathExists(dirtyLease.worktreePath)).toBe(true)
    expect(manager.getLease(cleanLease.worktreeId)).toBeUndefined()
    expect(manager.getLease(dirtyLease.worktreeId)).toBeDefined()

    await manager.disposeAll({ force: true })
    expect(await pathExists(dirtyLease.worktreePath)).toBe(false)
    expect(manager.listLeases()).toHaveLength(0)
  })

  it('enforces bounded git command timeouts on both execFile and streaming diff', async () => {
    await initGitRepo(repoDir)

    const slowGitScript = path.join(sandboxDir, 'slow-git.sh')
    await writeFile(
      slowGitScript,
      `#!/bin/sh
if [ "$1" = "-C" ] && [ "$3" = "-c" ] && [ "$5" = "diff" ]; then
  sleep 5
  exit 0
fi
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then
  sleep 5
  exit 0
fi
exec git "$@"
`,
      'utf8'
    )
    await chmod(slowGitScript, 0o755)

    // 1. execFile timeout during acquireWorktree.
    const timeoutAcquireMgr = new GitWorktreeManager({
      baseDir,
      gitBinary: slowGitScript,
      gitTimeoutMs: 200
    })
    await expectWorktreeError(
      timeoutAcquireMgr.acquireWorktree({ runId: 'r-timeout', repoRoot: repoDir }),
      'WORKTREE_GIT_TIMEOUT'
    )

    // 2. Streaming diff timeout via spawnBoundedGitDiff.
    const normalMgr = new GitWorktreeManager({ baseDir })
    const lease = await normalMgr.acquireWorktree({ runId: 'r-diff-timeout', repoRoot: repoDir })

    const diffSlowGitScript = path.join(sandboxDir, 'slow-diff-git.sh')
    await writeFile(
      diffSlowGitScript,
      `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "diff" ]; then
    sleep 5
    exit 0
  fi
done
exec git "$@"
`,
      'utf8'
    )
    await chmod(diffSlowGitScript, 0o755)

    const timeoutDiffMgr = new GitWorktreeManager({
      baseDir,
      gitBinary: diffSlowGitScript,
      gitTimeoutMs: 200
    })
    await expectWorktreeError(
      timeoutDiffMgr.getWorktreeDiff(lease.worktreeId),
      'WORKTREE_GIT_TIMEOUT'
    )

    await normalMgr.releaseWorktree(lease.worktreeId, { force: true })
  })

  it('handles unregistered linked worktrees, tampered metadata, omitted activeRunIds, and committed branch preservation', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })

    // 1. Live in-memory lease is protected when activeRunIds is omitted.
    const liveLease = await manager.acquireWorktree({ runId: 'run-live', repoRoot: repoDir })
    const livePass = await manager.reapOrphans()
    expect(livePass.skippedActiveIds).toEqual([liveLease.worktreeId])
    expect(livePass.reapedIds).toEqual([])

    // 2. Unregistered linked worktree (missing .meta JSON): dirty skipped until force, clean reaped.
    const helperMgr = new GitWorktreeManager({ baseDir })
    const unregClean = await helperMgr.acquireWorktree({
      runId: 'run-unreg-clean',
      repoRoot: repoDir
    })
    const unregDirty = await helperMgr.acquireWorktree({
      runId: 'run-unreg-dirty',
      repoRoot: repoDir
    })
    await writeFile(path.join(unregDirty.worktreePath, 'draft.txt'), 'draft\n', 'utf8')
    const canonicalBase = await realpath(baseDir)
    await rm(path.join(canonicalBase, '.meta', `${unregClean.worktreeId}.json`))
    await rm(path.join(canonicalBase, '.meta', `${unregDirty.worktreeId}.json`))

    // 3. Tampered metadata pointing outside baseDir fails closed and never deletes target.
    const outsideTarget = path.join(sandboxDir, 'outside-meta-target')
    await mkdir(outsideTarget, { recursive: true })
    await writeFile(path.join(outsideTarget, 'safe.txt'), 'safe', 'utf8')
    await writeFile(
      path.join(canonicalBase, '.meta', 'wt-tampered-0001.json'),
      JSON.stringify({
        ...liveLease,
        worktreeId: 'wt-tampered-0001',
        worktreePath: outsideTarget,
        effectiveCwd: outsideTarget
      }),
      'utf8'
    )

    await expectWorktreeError(manager.inspectWorktree('wt-tampered-0001'), 'WORKTREE_PATH_ESCAPE')
    await expectWorktreeError(
      manager.releaseWorktree('wt-tampered-0001', { force: true }),
      'WORKTREE_PATH_ESCAPE'
    )

    const reapRes = await manager.reapOrphans({ force: false })
    expect(reapRes.reapedIds).toEqual([unregClean.worktreeId])
    expect(reapRes.skippedDirtyIds).toEqual([unregDirty.worktreeId])
    expect(reapRes.skippedActiveIds).toEqual([liveLease.worktreeId])
    expect(reapRes.failedIds).toContain('wt-tampered-0001')
    expect(await pathExists(path.join(outsideTarget, 'safe.txt'))).toBe(true)

    const forceReap = await manager.reapOrphans({ force: true })
    expect(forceReap.reapedIds).toContain(unregDirty.worktreeId)
    expect(await pathExists(unregDirty.worktreePath)).toBe(false)
    expect(await pathExists(path.join(outsideTarget, 'safe.txt'))).toBe(true)

    // 4. Committed changes appear in getWorktreeDiff and unmerged branch is preserved when force=false.
    await writeFile(
      path.join(liveLease.worktreePath, 'committed.ts'),
      'export const committed = true\n',
      'utf8'
    )
    await runGit(liveLease.worktreePath, ['add', 'committed.ts'])
    await runGit(liveLease.worktreePath, ['commit', '-m', 'agent work'])

    const committedDiff = await manager.getWorktreeDiff(liveLease.worktreeId)
    expect(committedDiff.status.dirty).toBe(false)
    expect(committedDiff.status.ahead).toBe(1)
    expect(committedDiff.patch).toContain('+export const committed = true')

    const released = await manager.releaseWorktree(liveLease.worktreeId, {
      force: false,
      deleteBranch: true
    })
    expect(released).toEqual({
      worktreeId: liveLease.worktreeId,
      removed: true,
      branchDeleted: false
    })
    const preservedBranch = await runGit(repoDir, ['branch', '--list', liveLease.branchName!])
    expect(preservedBranch).toContain(liveLease.branchName!)
  })

  it('bounds untracked multi-byte UTF-8 diffs without splitting codepoints', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })
    const lease = await manager.acquireWorktree({ runId: 'run-untracked-utf8', repoRoot: repoDir })

    await writeFile(
      path.join(lease.worktreePath, 'untracked-utf8.txt'),
      '你好世界🎉'.repeat(500) + '\n',
      'utf8'
    )

    const diff = await manager.getWorktreeDiff(lease.worktreeId, { maxBytes: 257 })
    expect(diff.truncated).toBe(true)
    expect(diff.byteLength).toBeLessThanOrEqual(257)
    expect(Buffer.byteLength(diff.patch, 'utf8')).toBe(diff.byteLength)
    expect(diff.patch).not.toContain('\uFFFD')
    expect(diff.patch).toContain('diff --git a/untracked-utf8.txt b/untracked-utf8.txt')

    await manager.releaseWorktree(lease.worktreeId, { force: true })
  })

  it('rejects git option injection via tampered persisted .meta lease fields', async () => {
    await initGitRepo(repoDir)
    const creator = new GitWorktreeManager({ baseDir })
    const lease = await creator.acquireWorktree({ runId: 'run-meta-ref', repoRoot: repoDir })
    const canonicalBase = await realpath(baseDir)
    const metaPath = path.join(canonicalBase, '.meta', `${lease.worktreeId}.json`)
    const injectedOutputFile = path.join(sandboxDir, 'git-option-injected.txt')

    const tamperedCases: Array<Record<string, unknown>> = [
      { baseCommit: `--output=${injectedOutputFile}` },
      { baseCommit: 'not-a-commit-sha' },
      { baseRef: '--exec=pwn' },
      { baseRef: 'HEAD..main' },
      { branchName: '-f' },
      { branchName: 'bad..branch' },
      { branchName: 'bad@{0}' }
    ]

    for (const override of tamperedCases) {
      await writeFile(metaPath, JSON.stringify({ ...lease, ...override }), 'utf8')
      const reloaded = new GitWorktreeManager({ baseDir })

      await expectWorktreeError(reloaded.inspectWorktree(lease.worktreeId), 'WORKTREE_PATH_ESCAPE')
      await expectWorktreeError(reloaded.getWorktreeDiff(lease.worktreeId), 'WORKTREE_PATH_ESCAPE')
      await expectWorktreeError(
        reloaded.releaseWorktree(lease.worktreeId, { force: true }),
        'WORKTREE_PATH_ESCAPE'
      )

      const reapRes = await reloaded.reapOrphans({ force: false })
      expect(reapRes.failedIds).toContain(lease.worktreeId)
      expect(await pathExists(injectedOutputFile)).toBe(false)
    }

    // Restore clean metadata and release cleanly.
    await writeFile(metaPath, JSON.stringify(lease), 'utf8')
    await creator.releaseWorktree(lease.worktreeId, { force: true })
  })

  it('reattaches a persisted worktree for the matching runId and fails closed on mismatch or missing dir', async () => {
    await initGitRepo(repoDir)
    const creator = new GitWorktreeManager({ baseDir })
    const lease = await creator.acquireWorktree({ runId: 'run-reattach-1', repoRoot: repoDir })
    await writeFile(path.join(lease.worktreePath, 'partial.txt'), 'wip-content\n', 'utf8')

    const restarted = new GitWorktreeManager({ baseDir })
    expect(restarted.getLease(lease.worktreeId)).toBeUndefined()

    await expectWorktreeError(
      restarted.reattachWorktree(lease.worktreeId, 'wrong-run-id'),
      'WORKTREE_PATH_ESCAPE'
    )
    expect(restarted.getLease(lease.worktreeId)).toBeUndefined()

    const reattached = await restarted.reattachWorktree(lease.worktreeId, 'run-reattach-1')
    expect(reattached.worktreeId).toBe(lease.worktreeId)
    expect(reattached.effectiveCwd).toBe(lease.effectiveCwd)
    expect(restarted.getLease(lease.worktreeId)?.runId).toBe('run-reattach-1')
    expect(await readFile(path.join(reattached.worktreePath, 'partial.txt'), 'utf8')).toBe(
      'wip-content\n'
    )

    // Remove directory on disk -> fail closed with WORKTREE_NOT_FOUND on next restart
    await rm(lease.worktreePath, { recursive: true, force: true })
    const thirdBoot = new GitWorktreeManager({ baseDir })
    await expectWorktreeError(
      thirdBoot.reattachWorktree(lease.worktreeId, 'run-reattach-1'),
      'WORKTREE_NOT_FOUND'
    )

    // Replace with an ordinary non-git directory -> fail closed with WORKTREE_INVALID_REPO
    await mkdir(lease.worktreePath, { recursive: true })
    await writeFile(path.join(lease.worktreePath, 'plain.txt'), 'not a git worktree\n', 'utf8')
    const fourthBoot = new GitWorktreeManager({ baseDir })
    await expectWorktreeError(
      fourthBoot.reattachWorktree(lease.worktreeId, 'run-reattach-1'),
      'WORKTREE_INVALID_REPO'
    )

    // Replace with a worktree belonging to a DIFFERENT git repository -> fail closed
    await rm(lease.worktreePath, { recursive: true, force: true })
    const otherRepo = path.join(sandboxDir, 'other-repo')
    await mkdir(otherRepo, { recursive: true })
    await initGitRepo(otherRepo)
    await runGit(otherRepo, ['worktree', 'add', '--detach', lease.worktreePath, 'HEAD'])
    const fifthBoot = new GitWorktreeManager({ baseDir })
    await expectWorktreeError(
      fifthBoot.reattachWorktree(lease.worktreeId, 'run-reattach-1'),
      'WORKTREE_INVALID_REPO'
    )

    await runGit(otherRepo, ['worktree', 'remove', '--force', lease.worktreePath]).catch(
      () => undefined
    )
    await creator.releaseWorktree(lease.worktreeId, { force: true }).catch(() => undefined)
  })

  it('finds persisted leases by runId and fails closed if .meta contains corrupt records', async () => {
    await initGitRepo(repoDir)
    const creator = new GitWorktreeManager({ baseDir })
    const lease = await creator.acquireWorktree({ runId: 'run-legacy-lookup', repoRoot: repoDir })

    const restarted = new GitWorktreeManager({ baseDir })
    const found = await restarted.findPersistedLeaseByRunId('run-legacy-lookup')
    expect(found?.worktreeId).toBe(lease.worktreeId)
    expect(await restarted.findPersistedLeaseByRunId('run-not-present')).toBeNull()

    // Corrupt metadata file prevents proving an unknown run had no worktree -> fail closed
    const canonicalBase = await realpath(baseDir)
    const corruptMeta = path.join(canonicalBase, '.meta', 'wt-corrupt-lookup.json')
    await writeFile(corruptMeta, '{not-json', 'utf8')
    await expectWorktreeError(
      restarted.findPersistedLeaseByRunId('run-not-present'),
      'WORKTREE_PATH_ESCAPE'
    )
    await rm(corruptMeta, { force: true })

    // Invalid worktree id containing ".." is treated as corrupt without aborting scan before valid lease
    const badIdMeta = path.join(canonicalBase, '.meta', 'wt-00-bad..name.json')
    await writeFile(badIdMeta, '{"runId":"other"}', 'utf8')
    const foundPastBadId = await new GitWorktreeManager({ baseDir }).findPersistedLeaseByRunId(
      'run-legacy-lookup'
    )
    expect(foundPastBadId?.worktreeId).toBe(lease.worktreeId)
    await expectWorktreeError(
      new GitWorktreeManager({ baseDir }).findPersistedLeaseByRunId('run-not-present'),
      'WORKTREE_PATH_ESCAPE'
    )
    await rm(badIdMeta, { force: true })

    // Non-regular .json entry (symlink) is classified as corrupt without following it
    const symlinkTarget = path.join(sandboxDir, 'outside-lease.json')
    await writeFile(symlinkTarget, JSON.stringify({ runId: 'run-not-present' }), 'utf8')
    const symlinkMeta = path.join(canonicalBase, '.meta', 'wt-symlink-lease.json')
    await symlink(symlinkTarget, symlinkMeta)
    await expectWorktreeError(
      new GitWorktreeManager({ baseDir }).findPersistedLeaseByRunId('run-not-present'),
      'WORKTREE_PATH_ESCAPE'
    )
    await rm(symlinkMeta, { force: true })

    await creator.releaseWorktree(lease.worktreeId, { force: true })
  })

  it('reattaches cleanly despite inherited GIT_DIR/GIT_WORK_TREE overrides and newline-containing baseDir paths', async () => {
    await initGitRepo(repoDir)
    const otherRepo = path.join(sandboxDir, 'override-repo')
    await initGitRepo(otherRepo)

    const targetBaseDir =
      process.platform === 'win32'
        ? path.join(sandboxDir, 'managed-worktrees-env')
        : path.join(sandboxDir, 'managed\nworktrees')
    const creator = new GitWorktreeManager({ baseDir: targetBaseDir })
    const lease = await creator.acquireWorktree({ runId: 'run-env-newline', repoRoot: repoDir })

    const prevGitDir = process.env.GIT_DIR
    const prevGitWorkTree = process.env.GIT_WORK_TREE
    process.env.GIT_DIR = path.join(otherRepo, '.git')
    process.env.GIT_WORK_TREE = otherRepo
    try {
      const restarted = new GitWorktreeManager({ baseDir: targetBaseDir })
      const reattached = await restarted.reattachWorktree(lease.worktreeId, 'run-env-newline')
      expect(reattached.worktreeId).toBe(lease.worktreeId)
      expect(reattached.worktreePath).toBe(lease.worktreePath)
    } finally {
      if (prevGitDir === undefined) delete process.env.GIT_DIR
      else process.env.GIT_DIR = prevGitDir
      if (prevGitWorkTree === undefined) delete process.env.GIT_WORK_TREE
      else process.env.GIT_WORK_TREE = prevGitWorkTree
      await creator.releaseWorktree(lease.worktreeId, { force: true })
    }
  })

  it('preserves leases in preserveRunIds during disposeAll while releasing others', async () => {
    await initGitRepo(repoDir)
    const manager = new GitWorktreeManager({ baseDir })
    const preserved = await manager.acquireWorktree({ runId: 'run-keep-1', repoRoot: repoDir })
    const disposable = await manager.acquireWorktree({ runId: 'run-drop-1', repoRoot: repoDir })

    await manager.disposeAll({ force: false, preserveRunIds: ['run-keep-1'] })

    expect(manager.getLease(preserved.worktreeId)).toBeDefined()
    expect(await pathExists(preserved.worktreePath)).toBe(true)
    expect(manager.getLease(disposable.worktreeId)).toBeUndefined()
    expect(await pathExists(disposable.worktreePath)).toBe(false)

    await manager.releaseWorktree(preserved.worktreeId, { force: true })
  })
})

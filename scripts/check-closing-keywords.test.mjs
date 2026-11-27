import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findAccidentalBodyClosers,
  findAccidentalCommitClosers,
  findAllClosers,
  findNegatedClosers,
  findQuotedClosers,
  inspectPullRequest,
  isStandaloneCloserTrailer,
  parseArgs,
  readCommitsFromRange,
  REGRESSION_6448F5F9C_BODY,
  REWRITTEN_6448F5F9C_BODY,
} from './check-closing-keywords.mjs'

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'check-closing-keywords.mjs')
const tempDirs = []

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-closing-keywords-'))
  tempDirs.push(dir)
  return dir
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test Author',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim()
}

function initGitRepo() {
  const dir = makeTempDir()
  git(dir, ['init', '-b', 'master'])
  fs.writeFileSync(path.join(dir, 'README.md'), 'init\n')
  git(dir, ['add', 'README.md'])
  git(dir, ['commit', '-m', 'chore: initial commit'])
  const baseSha = git(dir, ['rev-parse', 'HEAD'])
  return { dir, baseSha }
}

function addCommit(dir, fileName, content, message) {
  fs.writeFileSync(path.join(dir, fileName), content)
  git(dir, ['add', fileName])
  git(dir, ['commit', '-m', message])
  return git(dir, ['rev-parse', 'HEAD'])
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  })
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('check-closing-keywords', () => {
  it('catches the exact #1772 -> #1748 regression from commit 6448f5f9c and passes once rewritten', () => {
    const failures = findAccidentalCommitClosers(REGRESSION_6448F5F9C_BODY, 'commit 6448f5f9c')
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      source: 'commit 6448f5f9c',
      issue: 1748,
      reason: 'negated',
      lineNumber: 4,
    })
    expect(failures[0].line).toContain('said "This does not close #1748"')

    expect(findAccidentalCommitClosers(REWRITTEN_6448F5F9C_BODY, 'commit 6448f5f9c')).toEqual([])
  })

  it('catches bare prose, quoted, backticked, and fenced closers in plain-text commit messages', () => {
    const bareProse = findAccidentalCommitClosers(
      'docs: explain parser\n\nGitHub matched the literal close #1748 inside that explanation.',
      'commit abc123456',
    )
    expect(bareProse).toHaveLength(1)
    expect(bareProse[0]).toMatchObject({
      source: 'commit abc123456',
      issue: 1748,
      reason: 'prose',
      phrase: 'close #1748',
      line: 'GitHub matched the literal close #1748 inside that explanation.',
    })

    const quoted = findAccidentalCommitClosers(
      'docs: explain trap\n\nThe message quoted "fixes #900" in passing.',
    )
    expect(quoted).toHaveLength(1)
    expect(quoted[0]).toMatchObject({ issue: 900, reason: 'quoted', phrase: '"fixes #900"' })

    const backticked = findAccidentalCommitClosers(
      'docs: explain trap\n\nGitHub parses `resolves #901` even inside backticks in commit bodies.',
    )
    expect(backticked).toHaveLength(1)
    expect(backticked[0]).toMatchObject({ issue: 901, reason: 'quoted', phrase: '`resolves #901`' })

    const fenced = findAccidentalCommitClosers(
      'docs: example\n\n```\nclose #902\n```',
    )
    expect(fenced).toHaveLength(1)
    expect(fenced[0]).toMatchObject({ issue: 902, reason: 'quoted', line: 'close #902' })

    const bulleted = findAccidentalCommitClosers(
      'Examples:\n- close #903',
    )
    expect(bulleted).toHaveLength(1)
    expect(bulleted[0]).toMatchObject({ issue: 903, reason: 'prose', line: '- close #903' })
  })

  it('allows unambiguous standalone closing-keyword trailers in commit messages', () => {
    for (const trailer of [
      'Fixes #1792',
      'Closes: #1792',
      'Resolves #1853',
      'Closes #487 #491 #503 #502',
      'Closes #889. Closes #734.',
      'Fixes #1, #2, and #3',
      'Fixes #1, closes #2',
    ]) {
      expect(isStandaloneCloserTrailer(trailer), trailer).toBe(true)
      expect(findAccidentalCommitClosers(`feat(ci): update\n\n${trailer}`), trailer).toEqual([])
    }

    for (const nonTrailer of [
      '- Fixes #1792',
      '* Closes #1792',
      '"Fixes #1792"',
      '`Fixes #1792`',
      'This does not close #1748',
      'GitHub matched close #1748 in prose',
      'fix(ci): close #1748',
    ]) {
      expect(isStandaloneCloserTrailer(nonTrailer), nonTrailer).toBe(false)
    }
  })

  it('catches negated and quoted closers in Markdown PR bodies while ignoring Markdown code spans', () => {
    expect(findNegatedClosers('It does not fix #213.')[0]?.issue).toBe(213)
    expect(findNegatedClosers('This does not close: #308.')[0]?.issue).toBe(308)
    expect(findQuotedClosers('Explaining "close #1748" in a PR body')[0]).toMatchObject({
      issue: 1748,
      reason: 'quoted',
    })
    expect(findQuotedClosers('Explaining \'fixes #1749\' in a PR body')[0]).toMatchObject({
      issue: 1749,
      reason: 'quoted',
    })
    expect(findAccidentalBodyClosers('This PR\'s body fixes #42')).toEqual([])
    expect(findAccidentalBodyClosers('Write `close #1748` in inline code.')).toEqual([])
    expect(findAccidentalBodyClosers('```\ndoes not close #1748\n```')).toEqual([])
    expect(findAccidentalBodyClosers('Refs #1748\n\nFixes #1792')).toEqual([])
    expect(findAllClosers('Fixes #1792 and closes #1776')).toEqual([1792, 1776])
  })

  it('scans constituent commits via --commits base..head and fails when a commit body closes #1748 despite a clean PR body', () => {
    const { dir, baseSha } = initGitRepo()
    addCommit(dir, 'a.txt', '1\n', 'feat(core-app): add topology verifier\n\nRefs #1748')
    const headSha = addCommit(dir, 'b.txt', '2\n', REGRESSION_6448F5F9C_BODY)

    const bodyFile = path.join(dir, 'pr-body.md')
    const titleFile = path.join(dir, 'pr-title.txt')
    fs.writeFileSync(bodyFile, '#1748 is still open.\n')
    fs.writeFileSync(titleFile, 'test(core-app): add search-split topology verifier (#1772)')

    const result = runCli(
      ['--body', bodyFile, '--title-file', titleFile, '--commits', `${baseSha}..${headSha}`],
      dir,
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('#1748')
    expect(result.stderr).toContain(headSha.slice(0, 9))
    expect(result.stderr).toContain('said "This does not close #1748"')
  })

  it('passes via CLI once the commit phrase is rewritten, and catches bare prose close #N in commits', () => {
    const { dir, baseSha } = initGitRepo()
    const cleanHead = addCommit(dir, 'a.txt', '1\n', `${REWRITTEN_6448F5F9C_BODY}\n\nFixes #1792`)

    const bodyFile = path.join(dir, 'pr-body.md')
    const titleFile = path.join(dir, 'pr-title.txt')
    fs.writeFileSync(bodyFile, '#1748 is still open.\n\nFixes #1792\n')
    fs.writeFileSync(titleFile, 'fix(ci): guard commit bodies against closing keywords (#1792)')

    const okResult = runCli(
      ['--body', bodyFile, '--title-file', titleFile, '--commits', `${baseSha}..${cleanHead}`],
      dir,
    )
    expect(okResult.status).toBe(0)
    expect(okResult.stdout).toContain('1 commit(s)')
    expect(okResult.stdout).toContain('#1792')

    const proseHead = addCommit(
      dir,
      'b.txt',
      '2\n',
      'docs(ci): document bug\n\nGitHub matched bare close #1748 in prose.',
    )
    const proseResult = runCli(
      ['--body', bodyFile, '--title-file', titleFile, '--commits', `${baseSha}..${proseHead}`],
      dir,
    )
    expect(proseResult.status).toBe(1)
    expect(proseResult.stderr).toContain('#1748 (prose)')
    expect(proseResult.stderr).toContain('line: GitHub matched bare close #1748 in prose.')
  })

  it('checks PR title safely via --title-file even when the title looks like a CLI flag', () => {
    const { dir, baseSha } = initGitRepo()
    const headSha = addCommit(dir, 'a.txt', '1\n', 'chore: clean commit')
    const bodyFile = path.join(dir, 'pr-body.md')
    const titleFile = path.join(dir, 'pr-title.txt')

    fs.writeFileSync(bodyFile, 'Clean body.')
    fs.writeFileSync(titleFile, '--self-test does not close #1748')

    const result = runCli(
      ['--body', bodyFile, '--title-file', titleFile, '--commits', `${baseSha}..${headSha}`],
      dir,
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[PR title:1] #1748')
    expect(parseArgs(['--title', '--self-test']).selfTest).toBe(false)
  })

  it('fails loudly (exit 2) when --commits cannot be resolved instead of passing vacuously', () => {
    const { dir } = initGitRepo()
    expect(() => readCommitsFromRange('deadbeef..cafebabe', { cwd: dir })).toThrow(/fetch-depth: 0/)

    const result = runCli(['--commits', 'deadbeef..cafebabe'], dir)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('fetch-depth: 0')
  })

  it('passes its own --self-test CLI mode and inspects combined PR inputs cleanly', () => {
    const selfTestResult = runCli(['--self-test'], process.cwd())
    expect(selfTestResult.status).toBe(0)
    expect(selfTestResult.stdout).toContain('cases passed')

    const combined = inspectPullRequest({
      body: 'Clean body.\n\nFixes #1792',
      title: 'fix(ci): guard commit bodies (#1792)',
      commits: [{ sha: '123456789abcdef', shortSha: '123456789', message: 'fix(ci): scan commits\n\nRefs #1748' }],
    })
    expect(combined.findings).toEqual([])
    expect(combined.deliberateClosers).toEqual([1792])
  })
})

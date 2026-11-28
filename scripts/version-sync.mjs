#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path, { dirname, join } from 'node:path'
import process, { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const VERSION_FILES = ['package.json', 'apps/core-app/package.json']
const isInteractive = Boolean(input.isTTY && output.isTTY)

export const SEMVER_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i
export const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i
export const GIT_BRANCH_PATTERN = /^[\w./-]+$/

export function assertValidVersion(version) {
  if (typeof version !== 'string' || !SEMVER_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid semantic version: ${String(version)}`)
  }
  return version
}

export function assertValidTag(tag) {
  if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag)) {
    throw new Error(`Invalid release tag: ${String(tag)}`)
  }
  return tag
}

export function assertValidBranch(branch) {
  if (
    typeof branch !== 'string'
    || !GIT_BRANCH_PATTERN.test(branch)
    || branch.startsWith('-')
    || branch.includes('..')
    || branch.endsWith('.lock')
  ) {
    throw new Error(`Invalid git branch name: ${String(branch)}`)
  }
  return branch
}

const log = {
  title(message) {
    console.log(chalk.bold.cyan(message))
  },
  info(message) {
    console.log(chalk.cyan(`INFO  ${message}`))
  },
  success(message) {
    console.log(chalk.green(`DONE  ${message}`))
  },
  warn(message) {
    console.warn(chalk.yellow(`WARN  ${message}`))
  },
  error(message) {
    console.error(chalk.red(`ERROR ${message}`))
  },
}

function runFile(bin, args = [], options = {}) {
  execFileSync(bin, args, { stdio: 'inherit', cwd: rootDir, ...options })
}

function execPnpmSync(args, options = {}) {
  const execOptions = { stdio: 'inherit', cwd: rootDir, ...options }
  try {
    return execFileSync('pnpm', args, execOptions)
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return execFileSync('corepack', ['pnpm', ...args], execOptions)
    }
    throw error
  }
}

function getGitStatusLines() {
  const status = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf-8',
    cwd: rootDir,
  }).trim()
  if (!status)
    return []
  return status.split('\n').filter(Boolean)
}

function getChangedFiles() {
  const lines = getGitStatusLines()
  return lines
    .map(line => line.slice(3).trim())
    .map(entry => (entry.includes(' -> ') ? entry.split(' -> ').pop() : entry))
    .filter(Boolean)
}

function readRootVersion() {
  const content = readFileSync(join(rootDir, 'package.json'), 'utf-8')
  const data = JSON.parse(content)
  return assertValidVersion(data.version)
}

function tagExists(tag) {
  assertValidTag(tag)
  const existing = execFileSync('git', ['tag', '-l', '--', tag], {
    encoding: 'utf-8',
    cwd: rootDir,
  }).trim()
  return Boolean(existing)
}

function ensureTagNotExists(tag) {
  if (tagExists(tag)) {
    log.error(`Tag already exists: ${tag}`)
    process.exit(1)
  }
}

function stageFiles(files) {
  if (!files.length) {
    return
  }
  runFile('git', ['add', '--', ...files])
}

function formatFileList(files) {
  if (!files.length)
    return ''
  return files.map(file => `  - ${file}`).join('\n')
}

async function confirmAction(question) {
  if (!isInteractive) {
    log.warn('No TTY detected. Skipping interactive confirmation.')
    return false
  }
  const rl = createInterface({ input, output })
  try {
    const answer = await rl.question(`${question} (y/N): `)
    const normalized = answer.trim().toLowerCase()
    return normalized === 'y' || normalized === 'yes'
  }
  finally {
    rl.close()
  }
}

/**
 * 读取当前分支名。detached HEAD 返回 null。
 */
function getCurrentBranch() {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8',
      cwd: rootDir,
    }).trim()
    return branch === 'HEAD' ? null : assertValidBranch(branch)
  }
  catch (error) {
    log.error(`Failed to read current branch: ${error.message}`)
    process.exit(1)
  }
}

/**
 * 校验发布分支。
 *
 * 这个脚本会打 tag 并 push，而 build-and-release.yml 监听 `push: tags: v*.*.*`，
 * 所以从任意分支跑一次 `pnpm version:sync --patch` 就能从未合并的代码发出一个正式签名版本。
 *
 * 默认只允许仓库默认分支。发布确实经常从长期集成分支打（本仓库 master 落后集成分支
 * 数百个提交），所以这里不是硬禁：交互式下提示确认，非交互式下直接失败。
 * 常用分支可用 TALEX_RELEASE_BRANCHES=a,b 免去每次确认。
 */
async function ensureReleaseBranch() {
  const branch = getCurrentBranch()
  if (!branch) {
    log.error('HEAD is detached. A release must be tagged from a branch.')
    process.exit(1)
  }

  const allowed = (process.env.TALEX_RELEASE_BRANCHES ?? 'master')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)

  if (allowed.includes(branch)) {
    log.success(`On release branch ${branch}.`)
    return branch
  }

  log.warn(`Current branch is ${branch}, which is not a release branch (${allowed.join(', ')}).`)
  log.warn('Tagging here publishes a signed release built from this branch\'s code.')

  if (!isInteractive) {
    log.error('Refusing to release from a non-release branch without confirmation.')
    log.error(`Set TALEX_RELEASE_BRANCHES=${branch} if this is intentional.`)
    process.exit(1)
  }

  const shouldContinue = await confirmAction(`Release from ${branch} anyway?`)
  if (!shouldContinue) {
    log.info('Cancelled.')
    process.exit(1)
  }

  return branch
}

/**
 * 检查是否有未提交的更改
 * 注意：bumpp 会修改 package.json 和 apps/core-app/package.json，这是预期的
 * 所以只需要在脚本最开始执行时检查一次即可
 */
function checkUncommittedChanges() {
  try {
    // 检查是否有未暂存的更改或已暂存但未提交的更改
    const lines = getGitStatusLines()
    if (lines.length) {
      log.error('Working tree is not clean.')
      log.error('Please commit or stash changes before running version sync.')
      console.error(formatFileList(lines))
      process.exit(1)
    }

    log.success('Git working tree is clean.')
  }
  catch (error) {
    log.error(`Failed to read git status: ${error.message}`)
    process.exit(1)
  }
}

/**
 * 执行版本同步
 * 注意：bumpp 已经配置为同时更新 package.json 和 apps/core-app/package.json
 * 先检查 git 状态，再运行 bumpp、更新 lockfile，最后提交并打 tag
 */
async function runVersionSync() {
  // 获取命令行参数（bumpp 的参数）
  const bumppArgs = process.argv.slice(2)

  log.title('Version sync')

  // 1. 检查未提交的更改（只在开始时检查一次）
  log.info('Checking git status...')
  checkUncommittedChanges()

  // 分支校验放在 bumpp 之前：从错误分支跑时不应该先把版本文件改脏再失败
  log.info('Checking release branch...')
  const releaseBranch = await ensureReleaseBranch()

  const versionBefore = readRootVersion()

  // 2. 运行 bumpp
  // bumpp 会根据 .bumpprc.json 配置自动更新 package.json 和 apps/core-app/package.json
  log.info('Running bumpp (no commit/tag)...')
  try {
    const finalArgs = [...bumppArgs, '--yes', '--no-commit', '--no-tag', '--no-push']
    execPnpmSync(['exec', 'bumpp', ...finalArgs], {
      env: { ...process.env, TALEX_VERSION_SYNC_CHILD: '1' },
    })
  }
  catch {
    log.error('bumpp failed.')
    process.exit(1)
  }

  const versionAfter = readRootVersion()

  log.info('Syncing core package version...')
  try {
    runFile(process.execPath, ['scripts/sync-core-package.mjs'])
  }
  catch {
    log.error('sync-core-package failed.')
    process.exit(1)
  }

  log.info('Running pnpm install --lockfile-only --ignore-scripts...')
  try {
    execPnpmSync(['install', '--lockfile-only', '--ignore-scripts'])
  }
  catch {
    log.error('pnpm install failed.')
    process.exit(1)
  }

  const changedFiles = getChangedFiles()
  if (versionAfter === versionBefore) {
    const tagName = assertValidTag(`v${versionAfter}`)
    if (tagExists(tagName)) {
      log.info(`Tag ${tagName} already exists. Nothing to do.`)
      return
    }

    if (changedFiles.length) {
      log.warn('Uncommitted changes detected after pnpm install:')
      console.warn(formatFileList(changedFiles))
    }

    const shouldTag = await confirmAction(`Tag and push ${tagName} from current HEAD?`)
    if (!shouldTag) {
      log.info('Cancelled.')
      return
    }

    try {
      log.info('Creating annotated tag...')
      runFile('git', ['tag', '-a', tagName, '-m', `release: ${tagName}`])
      log.info(`Pushing tag ${tagName}...`)
      runFile('git', ['push', 'origin', '--', tagName])
    }
    catch {
      log.error('Failed to create or push tag.')
      process.exit(1)
    }

    log.success(`Tag ${tagName} created and pushed.`)
    return
  }

  if (!changedFiles.length) {
    log.warn('No changes detected after bump. Nothing to commit.')
    return
  }

  const tagName = assertValidTag(`v${versionAfter}`)
  ensureTagNotExists(tagName)

  const lockfiles = changedFiles.filter(file => file.endsWith('pnpm-lock.yaml'))
  const filesToCommit = Array.from(new Set([...VERSION_FILES, ...lockfiles]))
  stageFiles(filesToCommit)

  log.info('Committing version update...')
  runFile('git', ['commit', '-m', `release: ${tagName}`])

  log.info('Creating annotated tag...')
  runFile('git', ['tag', '-a', tagName, '-m', `release: ${tagName}`])

  log.info(`Pushing commits to ${releaseBranch}...`)
  runFile('git', ['push', 'origin', '--', `HEAD:${releaseBranch}`])

  log.info(`Pushing tag ${tagName}...`)
  runFile('git', ['push', 'origin', '--', tagName])

  log.success(`Version sync completed. Tag ${tagName} created and pushed.`)
}

function invokedDirectly() {
  if (!process.argv[1])
    return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(__filename)
  }
  catch {
    return path.resolve(process.argv[1]) === __filename
  }
}

if (invokedDirectly()) {
  if (process.env.TALEX_VERSION_SYNC_CHILD === '1') {
    log.warn('Detected recursive version script call. Skipping.')
    process.exit(0)
  }
  runVersionSync().catch((error) => {
    log.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const VERSION_FILES = ['package.json', 'apps/core-app/package.json']
const isInteractive = Boolean(input.isTTY && output.isTTY)

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

if (process.env.TALEX_VERSION_SYNC_CHILD === '1') {
  log.warn('Detected recursive version script call. Skipping.')
  process.exit(0)
}

function runCommand(command, options = {}) {
  execSync(command, { stdio: 'inherit', cwd: rootDir, ...options })
}

function getGitStatusLines() {
  const status = execSync('git status --porcelain', {
    encoding: 'utf-8',
    cwd: rootDir,
  }).trim()
  if (!status) return []
  return status.split('\n').filter(Boolean)
}

function getChangedFiles() {
  const lines = getGitStatusLines()
  return lines
    .map((line) => line.slice(3).trim())
    .map((path) => (path.includes(' -> ') ? path.split(' -> ').pop() : path))
    .filter(Boolean)
}

function readRootVersion() {
  const content = readFileSync(join(rootDir, 'package.json'), 'utf-8')
  const data = JSON.parse(content)
  return data.version
}

function tagExists(tag) {
  const existing = execSync(`git tag -l "${tag}"`, {
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
  const args = files.map((file) => `"${file}"`).join(' ')
  execSync(`git add -- ${args}`, { stdio: 'inherit', cwd: rootDir })
}

function formatFileList(files) {
  if (!files.length) return ''
  return files.map((file) => `  - ${file}`).join('\n')
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

  const versionBefore = readRootVersion()

  // 2. 运行 bumpp
  // bumpp 会根据 .bumpprc.json 配置自动更新 package.json 和 apps/core-app/package.json
  log.info('Running bumpp (no commit/tag)...')
  try {
    const finalArgs = [...bumppArgs, '--yes', '--no-commit', '--no-tag', '--no-push']
    runCommand(`bumpp ${finalArgs.join(' ')}`, {
      env: { ...process.env, TALEX_VERSION_SYNC_CHILD: '1' },
    })
  }
  catch (error) {
    log.error('bumpp failed.')
    process.exit(1)
  }

  const versionAfter = readRootVersion()

  log.info('Syncing core package version...')
  try {
    runCommand('node scripts/sync-core-package.mjs')
  }
  catch (error) {
    log.error('sync-core-package failed.')
    process.exit(1)
  }

  log.info('Running pnpm install --lockfile-only --ignore-scripts...')
  try {
    runCommand('pnpm install --lockfile-only --ignore-scripts')
  }
  catch (error) {
    log.error('pnpm install failed.')
    process.exit(1)
  }

  const changedFiles = getChangedFiles()
  if (versionAfter === versionBefore) {
    const tagName = `v${versionAfter}`
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
      runCommand(`git tag ${tagName}`)
      runCommand(`git push origin ${tagName}`)
    }
    catch (error) {
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

  const tagName = `v${versionAfter}`
  ensureTagNotExists(tagName)

  const lockfiles = changedFiles.filter((file) => file.endsWith('pnpm-lock.yaml'))
  const filesToCommit = Array.from(new Set([...VERSION_FILES, ...lockfiles]))
  stageFiles(filesToCommit)

  log.info('Committing version update...')
  runCommand(`git commit -m "release: ${tagName}"`)

  log.info('Creating tag...')
  runCommand(`git tag ${tagName}`)

  log.info('Pushing commits and tags...')
  runCommand('git push --follow-tags')

  log.success(`Version sync completed. Tag ${tagName} created and pushed.`)
}

// 执行主流程
runVersionSync().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

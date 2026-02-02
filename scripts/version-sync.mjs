#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const VERSION_FILES = ['package.json', 'apps/core-app/package.json']

function runCommand(command) {
  execSync(command, { stdio: 'inherit', cwd: rootDir })
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

function ensureTagNotExists(tag) {
  const existing = execSync(`git tag -l "${tag}"`, {
    encoding: 'utf-8',
    cwd: rootDir,
  }).trim()
  if (existing) {
    console.error(`❌ Tag 已存在: ${tag}`)
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
      console.error('❌ 错误: 检测到未提交的更改')
      console.error('\n请先提交所有更改后再执行版本更新')
      console.error('\n当前未提交的文件:')
      console.error(lines.join('\n'))
      process.exit(1)
    }

    console.log('✅ Git 工作区干净，可以继续')
  }
  catch (error) {
    console.error('❌ 检查 git 状态时出错:', error.message)
    process.exit(1)
  }
}

/**
 * 执行版本同步
 * 注意：bumpp 已经配置为同时更新 package.json 和 apps/core-app/package.json
 * 先检查 git 状态，再运行 bumpp、更新 lockfile，最后提交并打 tag
 */
function runVersionSync() {
  // 获取命令行参数（bumpp 的参数）
  const bumppArgs = process.argv.slice(2)

  console.log('🚀 开始版本同步流程...\n')

  // 1. 检查未提交的更改（只在开始时检查一次）
  console.log('📋 检查 git 状态...')
  checkUncommittedChanges()

  // 2. 运行 bumpp
  // bumpp 会根据 .bumpprc.json 配置自动更新 package.json 和 apps/core-app/package.json
  console.log('\n📦 运行 bumpp 更新版本（暂不提交/打 tag）...')
  try {
    const finalArgs = [...bumppArgs, '--no-commit', '--no-tag', '--no-push']
    runCommand(`bumpp ${finalArgs.join(' ')}`)
  }
  catch (error) {
    console.error('❌ bumpp 执行失败')
    process.exit(1)
  }

  console.log('\n📦 运行 pnpm install 更新 lockfile...')
  try {
    runCommand('pnpm install')
  }
  catch (error) {
    console.error('❌ pnpm install 执行失败')
    process.exit(1)
  }

  const version = readRootVersion()
  const tagName = `v${version}`
  ensureTagNotExists(tagName)

  const changedFiles = getChangedFiles()
  if (!changedFiles.length) {
    console.error('❌ 未检测到版本或 lockfile 变更，终止提交')
    process.exit(1)
  }

  const lockfiles = changedFiles.filter((file) => file.endsWith('pnpm-lock.yaml'))
  const filesToCommit = Array.from(new Set([...VERSION_FILES, ...lockfiles]))
  stageFiles(filesToCommit)

  console.log('\n🧾 提交版本变更...')
  runCommand(`git commit -m "release: ${tagName}"`)

  console.log('\n🏷️ 创建 tag...')
  runCommand(`git tag ${tagName}`)

  console.log('\n✨ 版本同步完成!')
  console.log('📝 已提交并创建 tag（未 push）')
}

// 执行主流程
runVersionSync()

#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

/**
 * 检查是否有未提交的更改
 * 注意：bumpp 会修改 package.json 和 apps/core-app/package.json，这是预期的
 * 所以只需要在脚本最开始执行时检查一次即可
 */
function checkUncommittedChanges() {
  try {
    // 检查是否有未暂存的更改或已暂存但未提交的更改
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
      cwd: rootDir,
    }).trim()

    if (status) {
      console.error('❌ 错误: 检测到未提交的更改')
      console.error('\n请先提交所有更改后再执行版本更新')
      console.error('\n当前未提交的文件:')
      console.error(status)
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
 * 所以只需要在开始时检查 git 状态，然后运行 bumpp 即可
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
  // 并创建 commit 和 tag
  console.log('\n📦 运行 bumpp 更新版本...')
  try {
    execSync(`bumpp ${bumppArgs.join(' ')}`, {
      stdio: 'inherit',
      cwd: rootDir,
    })
  }
  catch (error) {
    console.error('❌ bumpp 执行失败')
    process.exit(1)
  }

  console.log('\n✨ 版本同步完成!')
  console.log('📝 bumpp 已自动更新 package.json 和 apps/core-app/package.json')
}

// 执行主流程
runVersionSync()

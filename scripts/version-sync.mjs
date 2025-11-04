#!/usr/bin/env node

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const coreAppPackagePath = join(rootDir, 'apps/core-app/package.json')
const rootPackagePath = join(rootDir, 'package.json')

/**
 * 检查是否有未提交的更改
 */
function checkUncommittedChanges() {
  try {
    // 检查是否有未暂存的更改或已暂存但未提交的更改
    const status = execSync('git status --porcelain', { 
      encoding: 'utf-8',
      cwd: rootDir
    }).trim()
    
    if (status) {
      console.error('❌ 错误: 检测到未提交的更改')
      console.error('\n请先提交所有更改后再执行版本更新')
      console.error('\n当前未提交的文件:')
      console.error(status)
      process.exit(1)
    }
    
    console.log('✅ Git 工作区干净，可以继续')
  } catch (error) {
    console.error('❌ 检查 git 状态时出错:', error.message)
    process.exit(1)
  }
}

/**
 * 读取 package.json 的版本号
 */
function readVersion(packagePath) {
  try {
    const content = readFileSync(packagePath, 'utf-8')
    const pkg = JSON.parse(content)
    return pkg.version
  } catch (error) {
    console.error(`❌ 读取 ${packagePath} 失败:`, error.message)
    process.exit(1)
  }
}

/**
 * 更新 package.json 的版本号
 */
function updateVersion(packagePath, newVersion) {
  try {
    const content = readFileSync(packagePath, 'utf-8')
    const pkg = JSON.parse(content)
    const oldVersion = pkg.version
    pkg.version = newVersion
    
    // 保持格式，使用 JSON.stringify 并格式化
    const updated = JSON.stringify(pkg, null, 2) + '\n'
    writeFileSync(packagePath, updated, 'utf-8')
    
    console.log(`✅ 已更新 ${packagePath.replace(rootDir, '.')} 版本: ${oldVersion} → ${newVersion}`)
  } catch (error) {
    console.error(`❌ 更新 ${packagePath} 失败:`, error.message)
    process.exit(1)
  }
}

/**
 * 执行版本同步
 */
function runVersionSync() {
  // 获取命令行参数（bumpp 的参数）
  const bumppArgs = process.argv.slice(2)
  
  console.log('🚀 开始版本同步流程...\n')
  
  // 1. 检查未提交的更改
  console.log('📋 检查 git 状态...')
  checkUncommittedChanges()
  
  // 2. 运行 bumpp 更新根目录版本
  console.log('\n📦 运行 bumpp 更新根目录版本...')
  try {
    execSync(`bumpp ${bumppArgs.join(' ')}`, {
      stdio: 'inherit',
      cwd: rootDir
    })
  } catch (error) {
    console.error('❌ bumpp 执行失败')
    process.exit(1)
  }
  
  // 3. 读取更新后的版本号
  const newVersion = readVersion(rootPackagePath)
  console.log(`\n📌 根目录版本已更新为: ${newVersion}`)
  
  // 4. 同步更新 apps/core-app/package.json
  console.log('\n🔄 同步更新 apps/core-app/package.json...')
  const oldCoreVersion = readVersion(coreAppPackagePath)
  
  if (oldCoreVersion === newVersion) {
    console.log('✅ apps/core-app/package.json 版本已是最新，无需更新')
  } else {
    updateVersion(coreAppPackagePath, newVersion)
    
    // 5. 检查是否有未提交的更改（bumpp 可能已经创建了 commit）
    try {
      const status = execSync('git status --porcelain', { 
        encoding: 'utf-8',
        cwd: rootDir
      }).trim()
      
      if (status) {
        // 检查最近的 commit 和 tag
        const lastCommit = execSync('git log -1 --format=%s', { 
          encoding: 'utf-8',
          cwd: rootDir
        }).trim()
        
        const lastCommitHash = execSync('git rev-parse HEAD', {
          encoding: 'utf-8',
          cwd: rootDir
        }).trim()
        
        // 检查是否有 tag 指向当前的 commit
        const tagsOnCommit = execSync(`git tag --points-at ${lastCommitHash}`, {
          encoding: 'utf-8',
          cwd: rootDir
        }).trim()
        
        // 如果最后的 commit 是版本更新相关的，且没有 tag，则添加到该 commit
        if ((lastCommit.includes('chore: release') || lastCommit.includes('release')) && !tagsOnCommit) {
          console.log('\n📝 将 core-app 版本更新添加到版本更新 commit 中...')
          execSync('git add apps/core-app/package.json', {
            stdio: 'inherit',
            cwd: rootDir
          })
          execSync('git commit --amend --no-edit', {
            stdio: 'inherit',
            cwd: rootDir
          })
          console.log('✅ 已更新版本更新 commit')
        } else {
          // 如果有 tag 或不是版本更新 commit，则创建新的 commit
          console.log('\n📝 创建 commit 记录 core-app 版本更新...')
          execSync('git add apps/core-app/package.json', {
            stdio: 'inherit',
            cwd: rootDir
          })
          execSync(`git commit -m "chore: sync core-app version to ${newVersion}"`, {
            stdio: 'inherit',
            cwd: rootDir
          })
        }
      }
    } catch (error) {
      console.warn('⚠️  无法自动提交 core-app 版本更新，请手动提交:', error.message)
    }
  }
  
  console.log('\n✨ 版本同步完成!')
}

// 执行主流程
runVersionSync()


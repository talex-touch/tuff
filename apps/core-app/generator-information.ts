import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import fse from 'fs-extra'

import pkg from './package.json'
import { createLogger } from './src/main/utils/logger'

const log = createLogger('BuildInfo')

log.info('[Talex-Touch] Generate Information ...')

/**
 * 生成构建标识符：基于时间戳后6位的哈希
 */
function generateBuildIdentifier(timestamp: number): string {
  // 提取时间戳后6位
  const lastSixDigits = timestamp % 1000000

  // 使用 MD5 哈希
  const hash = crypto.createHash('md5').update(String(lastSixDigits)).digest('hex')

  // 取前7个字符作为标识符
  return hash.substring(0, 7)
}

/**
 * 获取 Git commit hash
 */
function getGitCommitHash(): string | null {
  // 优先从环境变量获取（GitHub Actions 提供 GITHUB_SHA）
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA
  }

  // 本地 dev 环境：使用 git 命令
  try {
    const projectRoot = path.join(__dirname, '..')
    const hash = execSync('git rev-parse HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return hash || null
  } catch {
    // 没有就留空
    return null
  }
}

/**
 * 获取构建 channel（RELEASE/SNAPSHOT/BETA）
 */
function getBuildChannel(buildType: string): string {
  if (buildType === 'release') {
    return 'RELEASE'
  } else if (buildType === 'snapshot') {
    return 'SNAPSHOT'
  } else if (buildType === 'beta') {
    return 'BETA'
  }
  return 'UNKNOWN'
}

/**
 * 生成统一的构建信息
 */
function generateBuildInfo() {
  const buildTime = Date.now()
  const buildType = process.env.BUILD_TYPE || 'release'
  const isSnapshot = buildType === 'snapshot'
  const isBeta = buildType === 'beta'
  const isRelease = buildType === 'release'

  // 获取 Git commit hash
  const gitCommitHash = getGitCommitHash()

  // 生成构建标识符
  const buildIdentifier = generateBuildIdentifier(buildTime)

  // 获取构建 channel
  const channel = getBuildChannel(buildType)

  return {
    version: pkg.version,
    buildTime,
    buildIdentifier,
    buildType,
    channel,
    isSnapshot,
    isBeta,
    isRelease,
    gitCommitHash: gitCommitHash || undefined
  }
}

export default function generatorInformation(): Plugin {
  const virtualModuleId = 'talex-touch:information'
  const resolvedVirtualModuleId = `\0${virtualModuleId}`

  let config

  return {
    enforce: 'pre',
    name: 'generator-information',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      return null
    },
    buildStart() {
      // 生成构建信息
      const buildInfo = generateBuildInfo()

      // 写入统一的 signature.json
      const signaturePath = path.join(__dirname, 'signature.json')
      fse.writeJsonSync(signaturePath, buildInfo, { encoding: 'utf8', spaces: 2 })

      log.info(`[Talex-Touch] Generated signature.json with build type: ${buildInfo.buildType}`)
      log.info(`[Talex-Touch] Build identifier: ${buildInfo.buildIdentifier}`)
      log.info(`[Talex-Touch] Channel: ${buildInfo.channel}`)
      log.info(`[Talex-Touch] Git commit: ${buildInfo.gitCommitHash || 'N/A'}`)
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return

      const devMode = config.command === 'serve'

      // 开发模式：实时生成构建信息
      if (devMode) {
        const buildInfo = generateBuildInfo()
        const information = {
          refuse: false,
          ...buildInfo
        }

        return `
          const information = ${JSON.stringify(information)}
          export const packageJson = ${JSON.stringify(pkg)}

          export default information
        `
      }

      // 生产模式：从 signature.json 读取
      const signaturePath = path.join(__dirname, 'signature.json')
      const information = {
        buildTime: -1,
        refuse: true,
        buildType: 'unknown',
        isSnapshot: false,
        isBeta: false,
        isRelease: false
      }

      if (fse.existsSync(signaturePath)) {
        try {
          const buildInfo = fse.readJsonSync(signaturePath, { encoding: 'utf8' })
          Object.assign(information, {
            refuse: false,
            ...buildInfo
          })
        } catch (error) {
          log.warn('[Talex-Touch] Failed to read signature.json:', { error })
        }
      }

      return `
        const information = ${JSON.stringify(information)}
        export const packageJson = ${JSON.stringify(pkg)}

        export default information
      `
    }
  }
}

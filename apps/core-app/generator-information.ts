import fse from 'fs-extra'
import pkg from './package.json'
import path from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'

import type { Plugin } from 'vite'

console.log('[Talex-Touch] Generate Information ...')

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
 * 生成官方构建签名（基于私钥 TUFF_ENCRYPTION_KEY）
 */
function generateOfficialSignature(
  version: string,
  buildTime: number,
  buildType: string,
  gitCommitHash: string | null
): { officialSignature: string | null; hasOfficialKey: boolean } {
  // 直接使用环境变量中的私钥
  const encryptionKey = process.env.TUFF_ENCRYPTION_KEY

  if (!encryptionKey) {
    return {
      officialSignature: null,
      hasOfficialKey: false
    }
  }

  // 构建签名载荷
  const payload = JSON.stringify({
    version,
    buildTime,
    buildType,
    gitCommitHash
  })

  // 使用 HMAC-SHA256 生成签名（私钥作为密钥）
  const hmac = crypto.createHmac('sha256', encryptionKey)
  hmac.update(payload)
  const signature = hmac.digest('hex')

  return {
    officialSignature: signature,
    hasOfficialKey: true
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

  // 生成官方签名（基于 SSH 密钥指纹）
  const { officialSignature, hasOfficialKey } = generateOfficialSignature(
    pkg.version,
    buildTime,
    buildType,
    gitCommitHash
  )

  return {
    version: pkg.version,
    buildTime,
    buildIdentifier,
    buildType,
    channel,
    isSnapshot,
    isBeta,
    isRelease,
    gitCommitHash: gitCommitHash || undefined,
    officialSignature: officialSignature || undefined,
    hasOfficialKey
  }
}

export default function generatorInformation(): Plugin {
  const virtualModuleId = 'talex-touch:information'
  const resolvedVirtualModuleId = '\0' + virtualModuleId

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

      console.log(`[Talex-Touch] Generated signature.json with build type: ${buildInfo.buildType}`)
      console.log(`[Talex-Touch] Build identifier: ${buildInfo.buildIdentifier}`)
      console.log(`[Talex-Touch] Channel: ${buildInfo.channel}`)
      console.log(`[Talex-Touch] Git commit: ${buildInfo.gitCommitHash || 'N/A'}`)
      console.log(`[Talex-Touch] Official build: ${buildInfo.hasOfficialKey ? 'Yes' : 'No'}`)
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
          console.warn('[Talex-Touch] Failed to read signature.json:', error)
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

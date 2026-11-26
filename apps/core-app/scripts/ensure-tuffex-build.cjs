const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { resolvePnpmBuildInvocation } = require('./lib/touch-translation-runtime-sync')

const TUFFEX_PACKAGE_NAME = '@talex-touch/tuffex'
const REQUIRED_TUFFEX_ARTIFACTS = ['dist/es/index.d.ts', 'dist/es/index.js']

function isTruthyFlag(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true'
}

function hasBuiltTuffexArtifacts(workspaceRoot) {
  const tuffexRoot = path.join(workspaceRoot, 'packages', 'tuffex')
  return REQUIRED_TUFFEX_ARTIFACTS.every((relativePath) => {
    const fullPath = path.join(tuffexRoot, relativePath)
    try {
      const stats = fs.statSync(fullPath)
      return stats.isFile() && stats.size > 0
    } catch {
      return false
    }
  })
}

function shouldSkipTuffexBuild(options = {}) {
  const env = options.env || process.env
  const workspaceRoot = options.workspaceRoot || path.resolve(__dirname, '..', '..', '..')
  if (!isTruthyFlag(env.TUFF_SKIP_TUFFEX_BUILD)) {
    return { skip: false, reason: 'flag-not-set' }
  }
  if (!hasBuiltTuffexArtifacts(workspaceRoot)) {
    return { skip: false, reason: 'artifacts-missing' }
  }
  return { skip: true, reason: 'prebuilt-artifacts-present' }
}

function ensureTuffexBuild(options = {}) {
  const env = options.env || process.env
  const workspaceRoot = options.workspaceRoot || path.resolve(__dirname, '..', '..', '..')
  const decision = shouldSkipTuffexBuild({ env, workspaceRoot })
  if (decision.skip) {
    console.log(
      `[typecheck:web] Reusing prebuilt ${TUFFEX_PACKAGE_NAME} artifacts (TUFF_SKIP_TUFFEX_BUILD=1)`
    )
    return { built: false, skipped: true, reason: decision.reason }
  }

  const runPackageBuild =
    options.runPackageBuild ||
    (() => {
      const { executable, args } = resolvePnpmBuildInvocation(TUFFEX_PACKAGE_NAME, {
        comSpec: env.ComSpec,
        platform: options.platform
      })
      execFileSync(executable, args, {
        cwd: workspaceRoot,
        env,
        stdio: 'inherit'
      })
    })

  runPackageBuild(TUFFEX_PACKAGE_NAME)
  return { built: true, skipped: false, reason: decision.reason }
}

module.exports = {
  REQUIRED_TUFFEX_ARTIFACTS,
  TUFFEX_PACKAGE_NAME,
  ensureTuffexBuild,
  hasBuiltTuffexArtifacts,
  shouldSkipTuffexBuild
}

if (require.main === module) {
  ensureTuffexBuild()
}

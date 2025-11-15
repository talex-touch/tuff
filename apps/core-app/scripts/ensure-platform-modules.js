/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const workspaceRoot = path.join(projectRoot, '..', '..')
const workspaceNodeModules = path.join(workspaceRoot, 'node_modules')
const targetNodeModules = path.join(projectRoot, 'node_modules')

const baseModules = [
  '@libsql/client',
  '@libsql/core',
  '@libsql/hrana-client',
  '@libsql/isomorphic-fetch',
  '@libsql/isomorphic-ws',
  'libsql',
  '@neon-rs/load',
  'detect-libc'
]

const platformModuleMap = {
  darwin: {
    arm64: ['@libsql/darwin-arm64'],
    x64: ['@libsql/darwin-x64']
  },
  linux: {
    x64: ['@libsql/linux-x64-gnu', '@libsql/linux-x64-musl'],
    arm64: ['@libsql/linux-arm64-gnu', '@libsql/linux-arm64-musl'],
    arm: ['@libsql/linux-arm-gnueabihf', '@libsql/linux-arm-musleabihf']
  },
  win32: {
    x64: ['@libsql/win32-x64-msvc']
  }
}

const moduleRootOverrides = {
  'detect-libc': resolveDetectLibcRoot()
}

function resolveDetectLibcRoot() {
  const candidates = [
    path.join(workspaceRoot, 'node_modules', '.pnpm'),
    path.join(workspaceRoot, 'node_modules'),
    path.join(projectRoot, 'node_modules')
  ]

  for (const basePath of candidates) {
    try {
      const resolved = require.resolve('detect-libc/package.json', { paths: [basePath] })
      return path.dirname(resolved)
    } catch {
      continue
    }
  }
  return null
}

function resolveModuleRoot(moduleName) {
  const overrideRoot = moduleRootOverrides[moduleName]
  if (overrideRoot && fs.existsSync(overrideRoot)) {
    return overrideRoot
  }

  const directPath = path.join(workspaceNodeModules, moduleName)
  if (fs.existsSync(directPath)) return directPath

  try {
    const pkgPath = require.resolve(path.join(moduleName, 'package.json'), {
      paths: [workspaceRoot]
    })
    return path.dirname(pkgPath)
  } catch (err) {
    console.warn(`[ensure-modules] Cannot resolve ${moduleName}: ${err.message}`)
    return null
  }
}

const copiedModules = new Set()
let modulesToCopy = new Set()

function copyModuleRecursive(moduleName, depth = 0) {
  if (copiedModules.has(moduleName)) {
    return
  }
  if (depth > 20) {
    console.warn(`[ensure-modules] Max recursion depth reached for ${moduleName}`)
    return
  }

  const sourceDir = resolveModuleRoot(moduleName)
  if (!sourceDir) {
    return
  }

  const pkgJsonPath = path.join(sourceDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    console.warn(`[ensure-modules] package.json missing for ${moduleName}`)
    return
  }

  const targetDir = path.join(targetNodeModules, moduleName)
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })

  try {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
    }
    fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
    copiedModules.add(moduleName)
    console.log(`[ensure-modules] Copied ${moduleName}`)
  } catch (err) {
    console.warn(`[ensure-modules] Failed to copy ${moduleName}: ${err.message}`)
    return
  }

  let pkgJson
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  } catch (err) {
    console.warn(`[ensure-modules] Failed to read package.json for ${moduleName}: ${err.message}`)
    return
  }

  const optionalDeps = pkgJson.optionalDependencies || {}
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.peerDependencies || {}),
    ...optionalDeps
  }

  for (const depName of Object.keys(allDeps)) {
    if (depName.startsWith('@talex-touch/')) continue
    copyModuleRecursive(depName, depth + 1)
  }
}

function ensurePlatformModules(targetPlatform, targetArch) {
  copiedModules.clear()

  const platformKey = targetPlatform === 'mac' ? 'darwin' : targetPlatform === 'win' ? 'win32' : targetPlatform
  const archKey = targetArch || (platformKey === 'darwin' ? 'arm64' : 'x64')

  modulesToCopy = new Set(baseModules)
  const platformModules = platformModuleMap[platformKey]
  if (platformModules) {
    const archModules = platformModules[archKey]
    if (archModules && archModules.length > 0) {
      archModules.forEach(mod => modulesToCopy.add(mod))
    } else {
      console.warn(`[ensure-modules] No platform modules defined for ${platformKey}/${archKey}`)
    }
  }

  modulesToCopy.forEach(moduleName => {
    copyModuleRecursive(moduleName)
  })
}

module.exports = ensurePlatformModules

if (require.main === module) {
  const target = process.env.BUILD_TARGET || process.platform
  const arch = process.env.BUILD_ARCH || process.arch
  ensurePlatformModules(target, arch)
}

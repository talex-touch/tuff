const fs = require('fs')
const path = require('path')
const projectRoot = path.join(__dirname, '..')
const workspaceRoot = path.join(projectRoot, '..', '..')
const appPackageJson = require('../package.json')

const outDir = path.join(projectRoot, 'out')
const outPackageJsonPath = path.join(outDir, 'package.json')

const outNodeModulesPath = path.join(outDir, 'node_modules')

// Core modules that must remain external and be copied into out/node_modules
// ONLY include modules with native binaries (.node files) that cannot be bundled into asar
const baseModulesToCopy = [
  // libsql 相关（包含 .node 原生模块，必须外部化）
  '@libsql/client',
  '@libsql/core',
  '@libsql/hrana-client',
  '@libsql/isomorphic-fetch',
  '@libsql/isomorphic-ws',
  'libsql',
  '@neon-rs/load',
  'detect-libc'

  // 其他包已移除，改为打包进 asar 以减小体积：
  // - electron-log: 纯 JS，可以打包
  // - electron-updater: 纯 JS，可以打包
  // - @sentry/electron: 虽然大，但可以打包
  // - tesseract.js: WASM 可以打包
  // - compressing: 纯 JS，可以打包
  // - original-fs: 纯 JS，可以打包
]

// Map build targets to platform-specific libsql binaries
const platformModuleMap = {
  darwin: {
    arm64: ['@libsql/darwin-arm64'],
    x64: ['@libsql/darwin-x64']
  },
  linux: {
    arm64: ['@libsql/linux-arm64-gnu', '@libsql/linux-arm64-musl'],
    arm: ['@libsql/linux-arm-gnueabihf', '@libsql/linux-arm-musleabihf'],
    x64: ['@libsql/linux-x64-gnu', '@libsql/linux-x64-musl']
  },
  win32: {
    x64: ['@libsql/win32-x64-msvc']
  }
}

// Flatten platform-specific packages to ensure they are not declared as dependencies
const platformSpecificPackages = new Set(
  Object.values(platformModuleMap)
    .flatMap(archMap => Object.values(archMap))
    .flat()
)

const skipRecursiveModules = new Set(['electron', '@sentry/node-native'])

function normalizeTargetPlatform(rawTarget) {
  if (!rawTarget) {
    return null
  }
  const lowered = rawTarget.toLowerCase()
  if (lowered === 'mac' || lowered === 'darwin' || lowered === 'osx') {
    return 'darwin'
  }
  if (lowered === 'win' || lowered === 'windows' || lowered === 'win32') {
    return 'win32'
  }
  if (lowered === 'linux') {
    return 'linux'
  }
  return null
}

function detectTargetPlatform() {
  return (
    normalizeTargetPlatform(process.env.BUILD_TARGET) ||
    normalizeTargetPlatform(process.env.ELECTRON_PLATFORM) ||
    process.platform
  )
}

function detectTargetArch(targetPlatform) {
  const archFromEnv = process.env.BUILD_ARCH || process.env.ELECTRON_ARCH
  if (archFromEnv) {
    return archFromEnv.toLowerCase()
  }
  if (targetPlatform === 'darwin') {
    return 'arm64'
  }
  if (targetPlatform === 'win32' || targetPlatform === 'linux') {
    return 'x64'
  }
  return process.arch.toLowerCase()
}

const targetPlatform = detectTargetPlatform()
const targetArch = detectTargetArch(targetPlatform)

const modulesToCopy = new Set(baseModulesToCopy)
const platformModules = platformModuleMap[targetPlatform]

if (platformModules) {
  if (platformModules[targetArch]) {
    platformModules[targetArch].forEach(moduleName => modulesToCopy.add(moduleName))
  } else {
    console.warn(
      `Warning: No exact libsql binary mapping for ${targetPlatform}/${targetArch}, including all variants for this platform`
    )
    Object.values(platformModules).forEach(moduleList => {
      moduleList.forEach(moduleName => modulesToCopy.add(moduleName))
    })
  }
} else {
  console.warn(
    `Warning: Unsupported platform ${targetPlatform}, falling back to copying all libsql binaries`
  )
  platformSpecificPackages.forEach(moduleName => modulesToCopy.add(moduleName))
}
console.log(
  `prepare-out-package-json: target=${targetPlatform}/${targetArch}, copying ${modulesToCopy.size} modules`
)

const moduleRootOverrides = {
  'detect-libc': resolveDetectLibcRoot()
}

function resolveDetectLibcRoot() {
  const candidates = []
  try {
    const libsqlDetectLibc = path.join(
      path.dirname(require.resolve('libsql/package.json')),
      'node_modules',
      'detect-libc'
    )
    candidates.push(libsqlDetectLibc)
  } catch (err) {
    // ignore; fallback to other candidates
  }

  candidates.push(path.join(workspaceRoot, 'node_modules', 'detect-libc'))
  candidates.push(path.join(projectRoot, 'node_modules', 'detect-libc'))

  for (const candidate of candidates) {
    const pkgJsonPath = path.join(candidate, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
        if (pkg.version && pkg.version.startsWith('1.')) {
          continue
        }
        return candidate
      } catch {
        return candidate
      }
    }
  }

  return path.join(workspaceRoot, 'node_modules', 'detect-libc')
}

function findPackageRoot(resolvedPath, moduleName) {
  let dir = path.dirname(resolvedPath)
  while (dir && dir !== path.dirname(dir)) {
    const pkgJsonPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
        // Check if this package.json has a name field matching the module name
        // This ensures we find the root of the package, not a subdirectory with its own package.json
        if (pkgJson.name === moduleName || pkgJson.name === moduleName.replace(/^@[^/]+\//, '')) {
          return dir
        }
      } catch (e) {
        // If we can't parse package.json, continue searching
      }
    }
    dir = path.dirname(dir)
  }
  throw new Error(`package.json not found for resolved path: ${resolvedPath}`)
}

function resolveModuleRoot(moduleName) {
  const overrideRoot = moduleRootOverrides[moduleName]
  if (overrideRoot) {
    const pkgJsonPath = path.join(overrideRoot, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      return overrideRoot
    }
  }
  try {
    const entryPath = require.resolve(moduleName)
    return findPackageRoot(entryPath, moduleName)
  } catch (err) {
    try {
      const pkgPath = require.resolve(`${moduleName}/package.json`)
      return path.dirname(pkgPath)
    } catch (err2) {
      // Fallback: try to find it in node_modules directly
      const possiblePaths = [
        path.join(projectRoot, 'node_modules', moduleName),
        path.join(__dirname, '../../..', 'node_modules', moduleName)
      ]
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath) && fs.existsSync(path.join(possiblePath, 'package.json'))) {
          return possiblePath
        }
      }
      throw err2
    }
  }
}

// Parse lockfile to get specifiers
function parseLockfileSpecifiers() {
  const lockfilePath = path.join(__dirname, '../../pnpm-lock.yaml')
  const specifiers = {}

  if (!fs.existsSync(lockfilePath)) {
    return specifiers
  }

  try {
    const lockfileContent = fs.readFileSync(lockfilePath, 'utf8')
    // Try to find apps/core-app/out first (what electron-builder compares against)
    // Otherwise fall back to apps/core-app
    let sectionMatch = lockfileContent.match(/^  apps\/core-app\/out:[\s\S]*?(?=\n  [a-z]|\n$)/m)
    if (!sectionMatch) {
      sectionMatch = lockfileContent.match(/^  apps\/core-app:[\s\S]*?(?=\n  [a-z]|\n$)/m)
    }

    if (sectionMatch) {
      const section = sectionMatch[0]
      // Extract specifiers: match "package-name:" followed by "specifier: value"
      // Pattern: package name with colon, then specifier on next line
      // Use a regex that matches the entire pattern: package name, then specifier
      // Package name can be scoped (@scope/name) or non-scoped (name), with optional quotes
      const specifierPattern = /^\s+([^:\n]+?):\s*\n\s+specifier:\s+(.+)$/gm
      let match
      while ((match = specifierPattern.exec(section)) !== null) {
        let pkgName = match[1].trim()
        // Remove quotes if present
        pkgName = pkgName.replace(/^['"]|['"]$/g, '')
        let specifier = match[2].trim()
        // Remove quotes from specifier value if present
        specifier = specifier.replace(/^['"]|['"]$/g, '')
        specifiers[pkgName] = specifier
      }
    }
  } catch (err) {
    console.warn(`Warning: Failed to parse lockfile: ${err.message}`)
  }

  return specifiers
}

const lockfileSpecifiers = parseLockfileSpecifiers()

// Build dependencies object for external modules (excluding platform-specific packages)
const externalDependencies = {}
modulesToCopy.forEach((moduleName) => {
  const versionSpecifier = getModuleVersion(moduleName)
  externalDependencies[moduleName] = versionSpecifier

  if (moduleName === 'detect-libc') {
    try {
      const moduleRoot = resolveModuleRoot(moduleName)
      const detectedVersion = getPackageVersion(moduleRoot)
      const major = parseInt(String(detectedVersion).split('.')[0], 10)
      if (!Number.isFinite(major) || Number.isNaN(major) || major < 2) {
        throw new Error(
          `Detected detect-libc@${detectedVersion} (from ${moduleRoot}). Expected >=2. Install detect-libc@^2.0.4 before building.`
        )
      }
    } catch (err) {
      console.error(`prepare-out-package-json: detect-libc validation failed: ${err.message}`)
      throw err
    }
  }
})

console.log('prepare-out-package-json: external module versions:')
modulesToCopy.forEach((moduleName) => {
  let moduleSource = 'unknown'
  try {
    moduleSource = resolveModuleRoot(moduleName)
  } catch (err) {
    moduleSource = `not found (${err.message})`
  }
  console.log(`  - ${moduleName}@${externalDependencies[moduleName]} (source: ${moduleSource})`)
})

function getModuleVersion(moduleName) {
  // First, check if we have a specifier from the lockfile
  if (lockfileSpecifiers[moduleName]) {
    return lockfileSpecifiers[moduleName]
  }

  // Then check original package.json dependencies
  if (appPackageJson.dependencies?.[moduleName]) {
    return appPackageJson.dependencies[moduleName]
  }

  if (appPackageJson.devDependencies?.[moduleName]) {
    return appPackageJson.devDependencies[moduleName]
  }

  // Try to read the installed package version directly
  const installedVersion = getInstalledModuleVersion(moduleName)
  if (installedVersion) {
    return installedVersion
  }

  // Fallback to * for transitive dependencies
  return '*'
}

function getInstalledModuleVersion(moduleName) {
  try {
    const moduleRoot = resolveModuleRoot(moduleName)
    if (!moduleRoot) {
      return null
    }
    const pkgJsonPath = path.join(moduleRoot, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      return null
    }
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    if (pkgJson.version) {
      // Use caret to allow compatible patch/minor updates when reinstalling
      return `^${pkgJson.version}`
    }
  } catch (err) {
    // Ignore resolution errors and fall back to default handling
  }
  return null
}

function getPackageVersion(moduleRoot) {
  const pkgJsonPath = path.join(moduleRoot, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`package.json not found for module root: ${moduleRoot}`)
  }
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  if (!pkgJson.version) {
    throw new Error(`module at ${moduleRoot} does not specify a version`)
  }
  return pkgJson.version
}

// Use converted version from environment variable if available (for beta -> snapshot conversion)
// Otherwise use version from package.json
const finalVersion = process.env.APP_VERSION || appPackageJson.version || '0.0.0'

const minimalPackageJson = {
  name: '@talex-touch/core-app',
  version: finalVersion,
  description: 'A powerful productivity launcher and automation tool',
  main: './main/index.js',
  author: 'TalexDreamSoul',
  homepage: 'https://talex-touch.tagzxia.com',
  dependencies: externalDependencies
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPackageJsonPath, JSON.stringify(minimalPackageJson, null, 2))

try {
  fs.rmSync(outNodeModulesPath, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50
  })
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.warn(`[prepare-out] Failed to clean node_modules (${err.code}). Continuing...`)
  }
}
fs.mkdirSync(outNodeModulesPath, { recursive: true })

// Set to track already copied modules (to avoid infinite loops and duplicates)
const copiedModules = new Set()

// Function to recursively copy a module and its dependencies
function copyModuleRecursive(moduleName, depth = 0) {
  // Avoid infinite recursion
  if (depth > 10) {
    return
  }

  // Skip if already copied
  if (copiedModules.has(moduleName)) {
    return
  }

  if (skipRecursiveModules.has(moduleName)) {
    console.log(`Skipping optional/peer dependency "${moduleName}"`)
    return
  }

  try {
    const sourceDir = resolveModuleRoot(moduleName)
    const pkgJsonPath = path.join(sourceDir, 'package.json')

    if (!fs.existsSync(pkgJsonPath)) {
      return
    }

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))

    // Copy the module
    const targetDir = path.join(outNodeModulesPath, moduleName)
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })

    // Only copy if not already copied (to avoid overwriting)
    if (!copiedModules.has(moduleName)) {
      // Remove target directory if it exists to ensure clean copy
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true })
      }
      fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true, force: true })
      copiedModules.add(moduleName)
    }

    // Recursively copy dependencies (including @types packages)
    const optionalDeps = pkgJson.optionalDependencies || {}
    const allDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.peerDependencies || {}),
      ...optionalDeps
    }

    // For packages that have @types dependencies, also copy @types packages
    // This is needed for electron-builder 26.0.12 dependency resolution
    for (const [depName, depVersion] of Object.entries(allDeps)) {
      // Skip workspace dependencies and internal packages
      if (depName.startsWith('@talex-touch/')) {
        continue
      }
      if (skipRecursiveModules.has(depName)) {
        console.log(`Skipping optional dependency "${depName}" of "${moduleName}"`)
        continue
      }
      if (optionalDeps[depName] && !modulesToCopy.has(depName)) {
        // Skip irrelevant optional deps (e.g. libsql binaries for other platforms)
        continue
      }

      try {
        copyModuleRecursive(depName, depth + 1)
      } catch (err) {
        // Silently skip optional dependencies that can't be resolved
        if (!pkgJson.optionalDependencies?.[depName]) {
          // Only warn for non-optional dependencies
          if (depth === 0) {
            console.warn(`Warning: failed to copy dependency "${depName}" of "${moduleName}": ${err.message}`)
          }
        }
      }
    }
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' && depth === 0) {
      console.warn(`Warning: failed to copy dependency "${moduleName}": ${err.message}`)
    }
  }
}

// Copy all modules and their dependencies recursively
modulesToCopy.forEach((moduleName) => {
  copyModuleRecursive(moduleName)
})

// Verify that platform-specific modules were copied
const platformModulesToVerify = platformModuleMap[targetPlatform]?.[targetArch] || []
if (platformModulesToVerify.length > 0) {
  console.log(`\n=== Verifying platform-specific modules (${targetPlatform}/${targetArch}) ===`)
  platformModulesToVerify.forEach((moduleName) => {
    const modulePath = path.join(outNodeModulesPath, moduleName)
    if (fs.existsSync(modulePath)) {
      const pkgJsonPath = path.join(modulePath, 'package.json')
      if (fs.existsSync(pkgJsonPath)) {
        console.log(`  ✓ ${moduleName} copied successfully`)
      } else {
        console.warn(`  ⚠ ${moduleName} directory exists but package.json is missing`)
      }
    } else {
      console.error(`  ✗ ${moduleName} was NOT copied! This will cause runtime errors.`)
      process.exit(1)
    }
  })
}

// Copy resources directory to out directory (excluding start.sh to avoid duplication)
const resourcesSourceDir = path.join(projectRoot, 'resources')
const resourcesTargetDir = path.join(outDir, 'resources')
if (fs.existsSync(resourcesSourceDir)) {
  try {
    if (fs.existsSync(resourcesTargetDir)) {
      fs.rmSync(resourcesTargetDir, { recursive: true, force: true })
    }
    fs.mkdirSync(resourcesTargetDir, { recursive: true })

    // Copy resources directory
    fs.cpSync(resourcesSourceDir, resourcesTargetDir, { recursive: true, dereference: true })
    console.log('Copied resources directory to out/resources')
  } catch (err) {
    console.warn(`Warning: failed to copy resources directory: ${err.message}`)
  }
} else {
  console.warn(`Warning: resources directory not found at ${resourcesSourceDir}`)
}

console.log('Generated out/package.json for electron-builder')

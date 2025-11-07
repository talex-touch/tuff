const fs = require('fs')
const path = require('path')
const projectRoot = path.join(__dirname, '..')
const appPackageJson = require('../package.json')

const outDir = path.join(projectRoot, 'out')
const outPackageJsonPath = path.join(outDir, 'package.json')

const outNodeModulesPath = path.join(outDir, 'node_modules')

// Core modules that must remain external and be copied into out/node_modules
const baseModulesToCopy = [
  '@libsql/client',
  '@libsql/core',
  '@libsql/hrana-client',
  '@libsql/isomorphic-fetch',
  '@libsql/isomorphic-ws',
  'libsql',
  '@neon-rs/load',
  'detect-libc',
  'js-base64',
  'promise-limit',
  // Copy node-fetch dependency required by @libsql/hrana-client
  'node-fetch'
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
  if (platformSpecificPackages.has(moduleName)) {
    return
  }
  externalDependencies[moduleName] = getModuleVersion(moduleName)
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
  
  // Fallback to * for transitive dependencies
  return '*'
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

fs.rmSync(outNodeModulesPath, { recursive: true, force: true })
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

const fs = require('fs')
const path = require('path')
const projectRoot = path.join(__dirname, '..')
const appPackageJson = require('../package.json')

const outDir = path.join(projectRoot, 'out')
const outPackageJsonPath = path.join(outDir, 'package.json')

const outNodeModulesPath = path.join(outDir, 'node_modules')

// Modules that should be copied to out/node_modules (including nested dependencies via recursion)
const modulesToCopy = [
  '@libsql/client',
  '@libsql/core',
  '@libsql/hrana-client',
  '@libsql/isomorphic-fetch',
  '@libsql/isomorphic-ws',
  // Platform-specific packages are optional dependencies and will be copied recursively
  // but should NOT be listed in package.json dependencies to avoid electron-builder resolution issues
  '@libsql/darwin-arm64',
  '@libsql/darwin-x64',
  '@libsql/linux-arm-gnueabihf',
  '@libsql/linux-arm-musleabihf',
  '@libsql/linux-arm64-gnu',
  '@libsql/linux-arm64-musl',
  '@libsql/linux-x64-gnu',
  '@libsql/linux-x64-musl',
  '@libsql/win32-x64-msvc',
  'libsql',
  '@neon-rs/load',
  'detect-libc',
  'js-base64',
  'promise-limit',
  '@electron-toolkit/preload',
  '@electron-toolkit/utils',
  'path-browserify',
  'lottie-web',
  // Copy node-fetch dependency required by @libsql/hrana-client
  // to fix electron-builder dependency resolution issue
  'node-fetch',
  // Copy @sentry/electron for error tracking
  '@sentry/electron'
]

// Platform-specific packages that should be copied but NOT listed in package.json
// These are optional dependencies that electron-builder 26.0.12 has trouble resolving
const platformSpecificPackages = new Set([
  '@libsql/darwin-arm64',
  '@libsql/darwin-x64',
  '@libsql/linux-arm-gnueabihf',
  '@libsql/linux-arm-musleabihf',
  '@libsql/linux-arm64-gnu',
  '@libsql/linux-arm64-musl',
  '@libsql/linux-x64-gnu',
  '@libsql/linux-x64-musl',
  '@libsql/win32-x64-msvc'
])

// Build dependencies object for external modules (excluding platform-specific packages)
const externalDependencies = {}
modulesToCopy.forEach((moduleName) => {
  // Skip platform-specific packages - they are optional dependencies
  // and should not be listed in package.json to avoid electron-builder resolution issues
  if (platformSpecificPackages.has(moduleName)) {
    return
  }

  // Try to get version from appPackageJson.dependencies
  // If not found, use '*' as placeholder (actual version will be in copied package.json)
  externalDependencies[moduleName] =
    appPackageJson.dependencies?.[moduleName] ||
    appPackageJson.devDependencies?.[moduleName] ||
    '*'
})

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
    const allDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.peerDependencies || {}),
      ...(pkgJson.optionalDependencies || {})
    }

    // For packages that have @types dependencies, also copy @types packages
    // This is needed for electron-builder 26.0.12 dependency resolution
    for (const [depName, depVersion] of Object.entries(allDeps)) {
      // Skip workspace dependencies and internal packages
      if (depName.startsWith('@talex-touch/')) {
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

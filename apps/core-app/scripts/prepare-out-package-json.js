const fs = require('fs')
const path = require('path')
const projectRoot = path.join(__dirname, '..')
const appPackageJson = require('../package.json')

const outDir = path.join(projectRoot, 'out')
const outPackageJsonPath = path.join(outDir, 'package.json')

const outNodeModulesPath = path.join(outDir, 'node_modules')
const modulesToCopy = [
  '@libsql/client',
  '@libsql/core',
  '@libsql/hrana-client',
  '@libsql/isomorphic-fetch',
  '@libsql/isomorphic-ws',
  '@libsql/darwin-arm64',
  '@libsql/darwin-x64',
  '@libsql/linux-arm-gnueabihf',
  '@libsql/linux-arm-musleabihf',
  '@libsql/linux-arm64-gnu',
  '@libsql/linux-arm64-musl',
  '@libsql/linux-x64-gnu',
  '@libsql/linux-x64-musl',
  '@libsql/win32-x64-msvc',
  '@libsql/win32-arm64-msvc',
  'libsql',
  '@neon-rs/load',
  'detect-libc',
  'js-base64',
  'promise-limit',
  '@electron-toolkit/preload',
  '@electron-toolkit/utils'
]

// Build dependencies object for external modules
const externalDependencies = {}
modulesToCopy.forEach((moduleName) => {
  // Try to get version from appPackageJson.dependencies
  // If not found, use '*' as placeholder (actual version will be in copied package.json)
  externalDependencies[moduleName] =
    appPackageJson.dependencies?.[moduleName] ||
    appPackageJson.devDependencies?.[moduleName] ||
    '*'
})

const minimalPackageJson = {
  name: '@talex-touch/core-app',
  version: appPackageJson.version || '0.0.0',
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

modulesToCopy.forEach((moduleName) => {
  try {
    const sourceDir = resolveModuleRoot(moduleName)
    const targetDir = path.join(outNodeModulesPath, moduleName)
    fs.mkdirSync(path.dirname(targetDir), { recursive: true })
    fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Warning: failed to copy dependency "${moduleName}": ${err.message}`)
    }
  }
})

// Copy resources directory to out directory
const resourcesSourceDir = path.join(projectRoot, 'resources')
const resourcesTargetDir = path.join(outDir, 'resources')
if (fs.existsSync(resourcesSourceDir)) {
  try {
    if (fs.existsSync(resourcesTargetDir)) {
      fs.rmSync(resourcesTargetDir, { recursive: true, force: true })
    }
    fs.cpSync(resourcesSourceDir, resourcesTargetDir, { recursive: true, dereference: true })
    console.log('Copied resources directory to out/resources')
  } catch (err) {
    console.warn(`Warning: failed to copy resources directory: ${err.message}`)
  }
} else {
  console.warn(`Warning: resources directory not found at ${resourcesSourceDir}`)
}

console.log('Generated out/package.json for electron-builder')

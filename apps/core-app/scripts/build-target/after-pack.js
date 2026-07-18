const fs = require('node:fs')
const path = require('node:path')
const plist = require('simple-plist')
const {
  findPackagedResourcesDir,
  getPlatformRuntimeRootModules,
  syncMissingPackagedRuntimeModules,
  syncPackagedResourceModules
} = require('./runtime-modules')
const { OFFICIAL_PLUGIN_BUILD_TARGETS } = require('../lib/touch-translation-runtime-sync')

function ensureMacMainAppLsuiElement(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager?.appInfo?.productFilename || 'tuff'
  const plistPath = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Info.plist')
  const info = plist.readFileSync(plistPath)

  if (info.LSUIElement !== true) {
    info.LSUIElement = true
    plist.writeFileSync(plistPath, info)
    console.log(`[afterPack] Set LSUIElement=true in ${plistPath}`)
  }

  const verified = plist.readFileSync(plistPath)
  if (verified.LSUIElement !== true) {
    throw new Error(`[afterPack] Failed to verify LSUIElement=true in ${plistPath}`)
  }
}

function dirSizeBytes(dir) {
  let total = 0
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += dirSizeBytes(entryPath)
    } else {
      try {
        total += fs.statSync(entryPath).size
      } catch {
        // ignore unreadable entry
      }
    }
  }
  return total
}

function safeRemoveDir(dir) {
  try {
    const size = dirSizeBytes(dir)
    fs.rmSync(dir, { recursive: true, force: true })
    return size
  } catch (error) {
    console.warn(`[afterPack] Failed to prune ${dir}: ${error.message}`)
    return 0
  }
}

// ffprobe-static ships binaries for every platform/arch (darwin|linux|win32 × x64|ia32|arm64).
// Only the build target's binary is usable, so drop the rest to cut hundreds of MB per build.
function resolveTargetArchNames(context) {
  let archName
  try {
    const { Arch } = require('electron-builder')
    archName = Arch[context.arch]
  } catch {
    archName = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }[context.arch]
  }
  if (archName === 'universal') return ['x64', 'arm64']
  if (archName === 'armv7l') return ['arm']
  return archName ? [archName] : []
}

function pruneCrossPlatformFfprobeBinaries(context) {
  const platformKey = context.electronPlatformName // 'darwin' | 'win32' | 'linux'
  const keepArchs = new Set(resolveTargetArchNames(context))
  if (!platformKey || keepArchs.size === 0) {
    console.warn(
      `[afterPack] Skip ffprobe-static prune: platform=${platformKey} arch=${context.arch}`
    )
    return
  }

  const resourcesDir = findPackagedResourcesDir(context.appOutDir, '[afterPack]')
  if (!resourcesDir) return

  // ffprobe-static is copied both into app.asar.unpacked (asarUnpack) and Resources/node_modules
  // (syncPackagedResourceModules); prune both.
  const binDirs = [
    path.join(resourcesDir, 'node_modules', 'ffprobe-static', 'bin'),
    path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'ffprobe-static', 'bin')
  ]

  let removedBytes = 0
  for (const binDir of binDirs) {
    if (!fs.existsSync(binDir)) continue
    let platformEntries
    try {
      platformEntries = fs.readdirSync(binDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const platformEntry of platformEntries) {
      if (!platformEntry.isDirectory()) continue
      const platformDir = path.join(binDir, platformEntry.name)
      if (platformEntry.name !== platformKey) {
        removedBytes += safeRemoveDir(platformDir)
        continue
      }
      let archEntries
      try {
        archEntries = fs.readdirSync(platformDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const archEntry of archEntries) {
        if (archEntry.isDirectory() && !keepArchs.has(archEntry.name)) {
          removedBytes += safeRemoveDir(path.join(platformDir, archEntry.name))
        }
      }
    }
  }

  if (removedBytes > 0) {
    console.log(
      `[afterPack] Pruned cross-platform ffprobe-static binaries: freed ~${(
        removedBytes /
        1024 /
        1024
      ).toFixed(0)}MB (kept ${platformKey}/${[...keepArchs].join(',')})`
    )
  }
}

function collectGeneratedPluginEntries(rootDir) {
  const generatedEntries = []
  const queue = [rootDir]

  while (queue.length > 0) {
    const currentDir = queue.shift()
    if (!currentDir) continue

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(rootDir, entryPath)
      if (entry.isDirectory()) {
        if (entry.name === 'dist') generatedEntries.push(relativePath)
        queue.push(entryPath)
      } else if (entry.name.toLowerCase().endsWith('.tpex')) {
        generatedEntries.push(relativePath)
      }
    }
  }

  return generatedEntries
}

function verifyPackagedOfficialPluginSeeds(context) {
  const resourcesDir = findPackagedResourcesDir(context.appOutDir, '[afterPack]')
  if (!resourcesDir) {
    throw new Error('[afterPack] Cannot locate packaged resources for official plugin verification')
  }

  const projectDir = context.packager?.projectDir
  if (!projectDir) {
    throw new Error('[afterPack] Cannot resolve CoreApp project directory')
  }
  const workspaceRoot = path.resolve(projectDir, '..', '..')

  for (const target of OFFICIAL_PLUGIN_BUILD_TARGETS) {
    const seedRoot = path.join(resourcesDir, 'bundled-plugins', target.pluginName)
    const seedManifestPath = path.join(seedRoot, 'manifest.json')
    const canonicalPackagePath = path.join(
      workspaceRoot,
      'plugins',
      target.pluginName,
      'package.json'
    )

    if (!fs.existsSync(seedManifestPath) || !fs.existsSync(canonicalPackagePath)) {
      throw new Error(`[afterPack] Missing packaged official plugin seed: ${target.pluginName}`)
    }

    const seedManifest = JSON.parse(fs.readFileSync(seedManifestPath, 'utf8'))
    const canonicalPackage = JSON.parse(fs.readFileSync(canonicalPackagePath, 'utf8'))
    if (
      seedManifest.name !== target.pluginName ||
      typeof canonicalPackage.version !== 'string' ||
      seedManifest.version !== canonicalPackage.version
    ) {
      throw new Error(
        `[afterPack] Official plugin seed mismatch for ${target.pluginName}: ` +
          `package=${String(canonicalPackage.version)}, manifest=${String(seedManifest.version)}`
      )
    }

    const generatedEntries = collectGeneratedPluginEntries(seedRoot)
    if (generatedEntries.length > 0) {
      throw new Error(
        `[afterPack] Official plugin seed contains generated package artifacts for ${target.pluginName}: ` +
          generatedEntries.join(', ')
      )
    }

    console.log(
      `[afterPack] Verified official plugin seed ${target.pluginName}@${seedManifest.version}`
    )
  }
}

function verifyPackagedEverythingNative(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const resourcesDir = findPackagedResourcesDir(context.appOutDir)
  if (!resourcesDir) {
    throw new Error('[afterPack] Unable to locate packaged Resources for Everything verification')
  }

  const nativePackageRoot = path.join(resourcesDir, 'node_modules', '@talex-touch', 'tuff-native')
  const requiredPaths = [
    path.join(nativePackageRoot, 'package.json'),
    path.join(nativePackageRoot, 'everything.js'),
    path.join(nativePackageRoot, 'everything-resources.js'),
    path.join(nativePackageRoot, 'native-loader.js'),
    path.join(nativePackageRoot, 'build', 'Release', 'tuff_native_everything.node')
  ]
  const missingPaths = requiredPaths.filter((entryPath) => !fs.existsSync(entryPath))
  if (missingPaths.length > 0) {
    throw new Error(
      `[afterPack] Packaged Everything runtime is incomplete: ${missingPaths.join(', ')}`
    )
  }

  console.log(
    `[afterPack] Verified packaged Everything runtime: ${path.join(
      nativePackageRoot,
      'build',
      'Release',
      'tuff_native_everything.node'
    )}`
  )
}

module.exports = async function afterPack(context) {
  ensureMacMainAppLsuiElement(context)
  const targetArch = resolveTargetArchNames(context)[0]
  const requiredModules = getPlatformRuntimeRootModules(context.electronPlatformName, targetArch)

  syncPackagedResourceModules(context.appOutDir, {
    logPrefix: '[afterPack]'
  })
  syncMissingPackagedRuntimeModules(context.appOutDir, {
    logPrefix: '[afterPack]',
    requiredModules
  })
  verifyPackagedEverythingNative(context)
  verifyPackagedOfficialPluginSeeds(context)
  pruneCrossPlatformFfprobeBinaries(context)
}

// Exposed for testing the prune logic in isolation.
module.exports.pruneCrossPlatformFfprobeBinaries = pruneCrossPlatformFfprobeBinaries
module.exports.verifyPackagedOfficialPluginSeeds = verifyPackagedOfficialPluginSeeds
module.exports.verifyPackagedEverythingNative = verifyPackagedEverythingNative

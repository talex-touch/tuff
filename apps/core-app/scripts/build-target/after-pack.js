const fs = require('node:fs')
const path = require('node:path')
const plist = require('simple-plist')
const {
  findPackagedResourcesDir,
  getPlatformRuntimeRootModules,
  requiredNativeAddonNames,
  syncMissingPackagedRuntimeModules,
  syncPackagedResourceModules
} = require('./runtime-modules')
const { OFFICIAL_PLUGIN_BUILD_TARGETS } = require('../lib/touch-translation-runtime-sync')
const { createPackagedBuildAttestation } = require('./build-attestation')
const {
  verifyPackagedBundle: verifyPackagedPiDesktopReuseLegal
} = require('../legal/pi-desktop-reuse-legal.cjs')

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

/**
 * Every addon the build machine produced also reached the packaged app.
 *
 * The presence check in build-target.js proves the addon existed before packaging; this proves it
 * survived packaging. They are different failures — the release build that shipped without its
 * audio component was the first kind, but `@talex-touch/tuff-native` is also *copied out of the
 * asar* into `Resources/node_modules` (runtime-modules.js, `location: 'resources'`), and a sync
 * filter that dropped `build/Release` would produce the second kind with the first check green.
 *
 * Strict only on CI, the same rule build-target.js uses for its own list: a developer's tree can
 * legitimately be missing a Rust-built addon (it is built by the dev wrapper, skipped under
 * `TUFF_DISABLE_NATIVE_AUDIO=1`), and refusing to package locally over that would be a worse trade
 * than the warning. The release pipeline builds the addons itself and runs with CI=true.
 */
function verifyPackagedNativeAddons(context, options = {}) {
  const strict = options.strict ?? process.env.CI === 'true'
  const resourcesDir = findPackagedResourcesDir(context.appOutDir, '[afterPack]')
  if (!resourcesDir) {
    throw new Error('[afterPack] Unable to locate packaged Resources for native addon verification')
  }

  const nativePackageRoot = path.join(resourcesDir, 'node_modules', '@talex-touch', 'tuff-native')
  const addonNames = requiredNativeAddonNames(context.electronPlatformName)
  const missing = addonNames.filter(
    (addonName) => !fs.existsSync(path.join(nativePackageRoot, 'build', 'Release', addonName))
  )
  if (missing.length === 0) {
    console.log(
      `[afterPack] Verified packaged native addons: ${addonNames.join(', ')} in ${path.join(
        nativePackageRoot,
        'build',
        'Release'
      )}`
    )
    return
  }

  const message =
    `[afterPack] Packaged native addons missing from ${path.join(nativePackageRoot, 'build', 'Release')}: ` +
    `${missing.join(', ')}. Build them with \`pnpm -C packages/tuff-native run build:audio\`.`
  if (strict) {
    throw new Error(message)
  }
  console.warn(`[afterPack] Warning: ${message}`)
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
function verifyPackagedMacFileEvents(context) {
  if (context.electronPlatformName !== 'darwin') return

  const resourcesDir = findPackagedResourcesDir(context.appOutDir, '[afterPack]')
  if (!resourcesDir) {
    throw new Error('[afterPack] Unable to locate packaged Resources for fsevents verification')
  }
  const nativePath = path.join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'fsevents',
    'fsevents.node'
  )
  if (!fs.existsSync(nativePath)) {
    throw new Error(`[afterPack] Packaged macOS file events backend is missing: ${nativePath}`)
  }
  console.log(`[afterPack] Verified packaged macOS file events backend: ${nativePath}`)
}

function verifyPackagedFdBinary(context) {
  const targetArch = resolveTargetArchNames(context)[0]
  const platformKey = context.electronPlatformName
  const supported = {
    'darwin-arm64': true,
    'linux-x64': true,
    'linux-arm64': true,
    'win32-x64': true,
    'win32-arm64': true
  }
  const targetKey = `${platformKey}-${targetArch}`
  if (!Object.prototype.hasOwnProperty.call(supported, targetKey)) {
    console.warn(`[afterPack] Bundled fd unavailable for ${targetKey}; legacy walker will be used`)
    return
  }

  const resourcesDir = findPackagedResourcesDir(context.appOutDir, '[afterPack]')
  if (!resourcesDir) {
    throw new Error('[afterPack] Unable to locate packaged Resources for fd verification')
  }
  const packageName = `fd-${targetKey}`
  const binaryName = platformKey === 'win32' ? 'fd.exe' : 'fd'
  const candidates = [
    path.join(
      resourcesDir,
      'app.asar.unpacked',
      'node_modules',
      '@prebuilt-binary',
      packageName,
      'bin',
      binaryName
    ),
    path.join(
      resourcesDir,
      'app.asar.unpacked',
      'node_modules',
      '@prebuilt-binary',
      'fd',
      'node_modules',
      '@prebuilt-binary',
      packageName,
      'bin',
      binaryName
    )
  ]
  const binaryPath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!binaryPath) {
    throw new Error(
      `[afterPack] Packaged fd binary is missing for ${targetKey}: ${candidates.join(', ')}`
    )
  }
  if (platformKey !== 'win32') {
    fs.chmodSync(binaryPath, 0o755)
    fs.accessSync(binaryPath, fs.constants.X_OK)
  }

  for (const licenseName of ['fd-LICENSE-MIT.txt', 'fd-LICENSE-APACHE.txt']) {
    const licensePath = path.join(resourcesDir, 'licenses', licenseName)
    if (!fs.existsSync(licensePath)) {
      throw new Error(`[afterPack] Packaged fd license is missing: ${licensePath}`)
    }
  }
  console.log(`[afterPack] Verified packaged fd backend: ${binaryPath}`)
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
  verifyPackagedNativeAddons(context)
  verifyPackagedMacFileEvents(context)
  verifyPackagedFdBinary(context)
  verifyPackagedOfficialPluginSeeds(context)
  pruneCrossPlatformFfprobeBinaries(context)

  const resourcesDir = findPackagedResourcesDir(context.appOutDir, '[afterPack]')
  if (!resourcesDir) {
    throw new Error('[afterPack] Cannot locate packaged resources for build attestation')
  }
  const legal = verifyPackagedPiDesktopReuseLegal({
    appRoot: context.packager.projectDir,
    resourcesDir
  })
  console.log(`[afterPack] Verified packaged pi-desktop-reuse legal bundle: ${legal.packagedDir}`)
  const attestation = await createPackagedBuildAttestation({
    resourcesDir,
    projectDir: context.packager.projectDir,
    appId: context.packager.config?.appId || 'com.tagzxia.app.tuff',
    version: context.packager.appInfo.version,
    platform: context.electronPlatformName,
    arch: targetArch,
    commit: process.env.GITHUB_SHA
  })
  if (attestation.created) {
    console.log(`[afterPack] Created official build attestation (${attestation.keyFingerprint})`)
  } else {
    console.log(`[afterPack] Skipped build attestation: ${attestation.reason}`)
  }
}

// Exposed for testing the prune logic in isolation.
module.exports.pruneCrossPlatformFfprobeBinaries = pruneCrossPlatformFfprobeBinaries
module.exports.verifyPackagedOfficialPluginSeeds = verifyPackagedOfficialPluginSeeds
module.exports.verifyPackagedEverythingNative = verifyPackagedEverythingNative
module.exports.verifyPackagedNativeAddons = verifyPackagedNativeAddons
module.exports.verifyPackagedMacFileEvents = verifyPackagedMacFileEvents
module.exports.verifyPackagedFdBinary = verifyPackagedFdBinary

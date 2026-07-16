const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const TOUCH_TRANSLATION_PLUGIN_NAME = 'touch-translation'

const OFFICIAL_PLUGIN_BUILD_TARGETS = Object.freeze([
  {
    packageName: '@talex-touch/touch-translation-plugin',
    pluginName: TOUCH_TRANSLATION_PLUGIN_NAME
  },
  {
    packageName: '@talex-touch/touch-intelligence-plugin',
    pluginName: 'touch-intelligence'
  }
])

const OFFICIAL_PLUGIN_BUILD_PREREQUISITES = Object.freeze([
  '@talex-touch/tuff-cli-core',
  '@talex-touch/unplugin-export-plugin',
  '@talex-touch/tuff-cli',
  '@talex-touch/tuffex'
])

function copyDirectoryContents(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true })

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    fs.cpSync(sourcePath, targetPath, {
      force: true,
      recursive: true
    })
  }
}

function replaceDirectoryContents(sourceDir, targetDir) {
  fs.rmSync(targetDir, { force: true, recursive: true })
  copyDirectoryContents(sourceDir, targetDir)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function resolvePnpmBuildInvocation(packageName, options = {}) {
  const buildArgs = ['--filter', packageName, 'run', 'build']
  const platform = options.platform || process.platform

  if (platform !== 'win32') {
    return { executable: 'pnpm', args: buildArgs }
  }

  return {
    executable: options.comSpec || process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', 'pnpm.cmd', ...buildArgs]
  }
}

function buildOfficialPluginPackages(options = {}) {
  const projectRoot = options.projectRoot || path.join(__dirname, '..', '..')
  const workspaceRoot = options.workspaceRoot || path.resolve(projectRoot, '..', '..')
  const packageNames = [
    ...OFFICIAL_PLUGIN_BUILD_PREREQUISITES,
    ...OFFICIAL_PLUGIN_BUILD_TARGETS.map((entry) => entry.packageName)
  ]
  const runPackageBuild =
    options.runPackageBuild ||
    ((packageName) => {
      const { executable, args } = resolvePnpmBuildInvocation(packageName)
      execFileSync(executable, args, {
        cwd: workspaceRoot,
        env: process.env,
        stdio: 'inherit'
      })
    })

  for (const packageName of packageNames) {
    runPackageBuild(packageName)
  }

  return packageNames
}

function writeBundledPackageVersion(sourcePackagePath, bundledPackagePath) {
  if (!fs.existsSync(sourcePackagePath)) {
    return
  }

  const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'))
  const bundledPackageExists = fs.existsSync(bundledPackagePath)
  const bundledPackage = bundledPackageExists
    ? JSON.parse(fs.readFileSync(bundledPackagePath, 'utf8'))
    : {
        name: sourcePackage.name,
        private: true,
        version: sourcePackage.version,
        type: sourcePackage.type
      }
  const nextVersion = typeof sourcePackage.version === 'string' ? sourcePackage.version : undefined

  if (!nextVersion || (bundledPackageExists && bundledPackage.version === nextVersion)) {
    return
  }

  fs.writeFileSync(
    bundledPackagePath,
    `${JSON.stringify({ ...bundledPackage, version: nextVersion }, null, 2)}\n`,
    'utf8'
  )
}

function syncOfficialPluginBundledRuntime(pluginName, options = {}) {
  const target = OFFICIAL_PLUGIN_BUILD_TARGETS.find((entry) => entry.pluginName === pluginName)
  if (!target) {
    throw new Error(`[official-plugin-sync] Unsupported official plugin: ${pluginName}`)
  }

  const projectRoot = options.projectRoot || path.join(__dirname, '..', '..')
  const workspaceRoot = options.workspaceRoot || path.resolve(projectRoot, '..', '..')
  const canonicalPluginRoot = path.join(workspaceRoot, 'plugins', pluginName)
  const canonicalBuildRoot = path.join(canonicalPluginRoot, 'dist', 'build')
  const canonicalPackagePath = path.join(canonicalPluginRoot, 'package.json')
  const canonicalManifestPath = path.join(canonicalBuildRoot, 'manifest.json')
  const bundledPluginRoot = path.join(projectRoot, 'resources', 'bundled-plugins', pluginName)
  const runtimePluginRoots = Array.isArray(options.runtimePluginRoots)
    ? options.runtimePluginRoots.filter(Boolean)
    : []

  if (
    !fs.existsSync(canonicalBuildRoot) ||
    !fs.existsSync(canonicalPackagePath) ||
    !fs.existsSync(canonicalManifestPath)
  ) {
    return {
      pluginName,
      reason: 'missing-canonical-build',
      skipped: true,
      synced: false
    }
  }

  const canonicalPackage = readJson(canonicalPackagePath)
  const canonicalManifest = readJson(canonicalManifestPath)
  const canonicalVersion = canonicalPackage.version
  if (
    canonicalManifest.name !== pluginName ||
    typeof canonicalVersion !== 'string' ||
    canonicalManifest.version !== canonicalVersion
  ) {
    throw new Error(
      `[official-plugin-sync] Canonical build mismatch for ${pluginName}: ` +
        `package=${String(canonicalVersion)}, manifest=${String(canonicalManifest.version)}`
    )
  }

  replaceDirectoryContents(canonicalBuildRoot, bundledPluginRoot)
  writeBundledPackageVersion(canonicalPackagePath, path.join(bundledPluginRoot, 'package.json'))

  const syncedRuntimePluginRoots = []
  for (const runtimePluginRoot of runtimePluginRoots) {
    copyDirectoryContents(canonicalBuildRoot, runtimePluginRoot)
    writeBundledPackageVersion(canonicalPackagePath, path.join(runtimePluginRoot, 'package.json'))
    syncedRuntimePluginRoots.push(runtimePluginRoot)
  }

  return {
    bundledPluginRoot,
    canonicalBuildRoot,
    canonicalVersion,
    packageName: target.packageName,
    pluginName,
    syncedRuntimePluginRoots,
    skipped: false,
    synced: true
  }
}

function syncOfficialPluginBundledRuntimes(options = {}) {
  const pluginNames = Array.isArray(options.pluginNames)
    ? options.pluginNames
    : OFFICIAL_PLUGIN_BUILD_TARGETS.map((entry) => entry.pluginName)
  return pluginNames.map((pluginName) => syncOfficialPluginBundledRuntime(pluginName, options))
}

function syncTouchTranslationBundledRuntime(options = {}) {
  return syncOfficialPluginBundledRuntime(TOUCH_TRANSLATION_PLUGIN_NAME, options)
}

module.exports = {
  OFFICIAL_PLUGIN_BUILD_PREREQUISITES,
  OFFICIAL_PLUGIN_BUILD_TARGETS,
  TOUCH_TRANSLATION_PLUGIN_NAME,
  buildOfficialPluginPackages,
  resolvePnpmBuildInvocation,
  syncOfficialPluginBundledRuntime,
  syncOfficialPluginBundledRuntimes,
  syncTouchTranslationBundledRuntime
}

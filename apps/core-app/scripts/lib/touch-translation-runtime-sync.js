const fs = require('fs')
const path = require('path')

const TOUCH_TRANSLATION_PLUGIN_NAME = 'touch-translation'

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

function writeBundledPackageVersion(sourcePackagePath, bundledPackagePath) {
  if (!fs.existsSync(sourcePackagePath) || !fs.existsSync(bundledPackagePath)) {
    return
  }

  const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'))
  const bundledPackage = JSON.parse(fs.readFileSync(bundledPackagePath, 'utf8'))
  const nextVersion = typeof sourcePackage.version === 'string' ? sourcePackage.version : undefined

  if (!nextVersion || bundledPackage.version === nextVersion) {
    return
  }

  fs.writeFileSync(
    bundledPackagePath,
    `${JSON.stringify({ ...bundledPackage, version: nextVersion }, null, 2)}\n`,
    'utf8'
  )
}

function syncTouchTranslationBundledRuntime(options = {}) {
  const projectRoot = options.projectRoot || path.join(__dirname, '..', '..')
  const workspaceRoot = options.workspaceRoot || path.resolve(projectRoot, '..', '..')

  const canonicalPluginRoot = path.join(workspaceRoot, 'plugins', TOUCH_TRANSLATION_PLUGIN_NAME)
  const canonicalBuildRoot = path.join(canonicalPluginRoot, 'dist', 'build')
  const canonicalDistRoot = path.join(canonicalPluginRoot, 'dist')
  const bundledPluginRoot = path.join(
    projectRoot,
    'tuff',
    'modules',
    'plugins',
    TOUCH_TRANSLATION_PLUGIN_NAME
  )

  if (!fs.existsSync(canonicalBuildRoot) || !fs.existsSync(canonicalDistRoot)) {
    return {
      reason: 'missing-canonical-build',
      skipped: true,
      synced: false
    }
  }

  copyDirectoryContents(canonicalBuildRoot, bundledPluginRoot)
  copyDirectoryContents(canonicalDistRoot, path.join(bundledPluginRoot, 'dist'))
  writeBundledPackageVersion(
    path.join(canonicalPluginRoot, 'package.json'),
    path.join(bundledPluginRoot, 'package.json')
  )

  return {
    bundledPluginRoot,
    canonicalBuildRoot,
    canonicalDistRoot,
    skipped: false,
    synced: true
  }
}

module.exports = {
  TOUCH_TRANSLATION_PLUGIN_NAME,
  syncTouchTranslationBundledRuntime
}

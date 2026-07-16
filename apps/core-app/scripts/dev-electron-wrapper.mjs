#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(__dirname, '..')
const markerVersion = 5
const defaultDevBundleIdentifier = 'com.tagzxia.app.tuff.dev'
const defaultDevBundleName = 'Tuff Dev'
const signArgs = ['--force', '--sign', '-', '--timestamp=none']
const NULL_BYTE_PATTERN = /\0/
const CMD_ESCAPE_PATTERN = /([()%!^"<>&|])/g

function readCommandPathEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) return null
  if (NULL_BYTE_PATTERN.test(value)) throw new Error(`${name}_NULL_BYTE`)
  return value
}

function isNodeScriptPath(value) {
  return /\.(?:c|m)?js$/i.test(value)
}

function quoteWindowsCmdArg(value) {
  return `"${assertCommandArg(value).replace(CMD_ESCAPE_PATTERN, '$1$1')}"`
}

function assertCommandSegment(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${label}_EMPTY`)
  if (NULL_BYTE_PATTERN.test(normalized)) throw new Error(`${label}_NULL_BYTE`)
  return normalized
}

function assertCommandArg(value) {
  if (NULL_BYTE_PATTERN.test(value)) throw new Error('ARG_NULL_BYTE')
  return value
}

function readNonEmptyEnv(name, fallback) {
  const value = process.env[name]?.trim()
  return value || fallback
}

function isTruthyEnv(name) {
  const value = process.env[name]?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

function hasNonEmptyEnv(name) {
  return Boolean(process.env[name]?.trim())
}

function shouldUseCustomDevElectronDist() {
  return (
    isTruthyEnv('TUFF_DEV_ELECTRON_CUSTOM_BUNDLE') ||
    isTruthyEnv('TUFF_DEV_ELECTRON_PREPARE_ONLY') ||
    hasNonEmptyEnv('TUFF_DEV_ELECTRON_BUNDLE_ID') ||
    hasNonEmptyEnv('TUFF_DEV_ELECTRON_BUNDLE_NAME')
  )
}

function sanitizePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function runElectronVite(env) {
  const args = ['exec', 'electron-vite', 'dev', ...process.argv.slice(2)].map(assertCommandArg)
  const npmExecPath = readCommandPathEnv('npm_execpath')
  const command =
    process.platform === 'win32' && npmExecPath && isNodeScriptPath(npmExecPath)
      ? assertCommandSegment(process.execPath, 'NODE')
      : process.platform === 'win32'
        ? assertCommandSegment(process.env.ComSpec || 'cmd.exe', 'COMMAND')
        : assertCommandSegment('pnpm', 'COMMAND')
  const commandArgs =
    command === process.execPath && npmExecPath
      ? [npmExecPath, ...args]
      : process.platform === 'win32'
        ? ['/d', '/s', '/c', ['pnpm', ...args].map(quoteWindowsCmdArg).join(' ')]
        : args

  const child = spawn(command, commandArgs, {
    cwd: appRoot,
    env,
    shell: false,
    stdio: 'inherit'
  })

  child.on('error', (error) => {
    console.error('[dev] Failed to launch electron-vite dev', error)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

function readElectronPackageRoot() {
  return path.dirname(require.resolve('electron'))
}

function getElectronVersion(electronDist) {
  const versionPath = path.join(electronDist, 'version')
  return fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8').trim() : 'unknown'
}

function ensureDevElectronDist() {
  if (process.platform !== 'darwin' || !shouldUseCustomDevElectronDist()) return null

  const bundleIdentifier = readNonEmptyEnv(
    'TUFF_DEV_ELECTRON_BUNDLE_ID',
    defaultDevBundleIdentifier
  )
  const bundleName = readNonEmptyEnv('TUFF_DEV_ELECTRON_BUNDLE_NAME', defaultDevBundleName)
  const electronRoot = readElectronPackageRoot()
  const sourceDist = path.join(electronRoot, 'dist')
  const sourceApp = path.join(sourceDist, 'Electron.app')
  if (!fs.existsSync(sourceApp)) {
    throw new Error(`Electron.app not found: ${sourceApp}`)
  }

  const electronVersion = getElectronVersion(sourceDist)
  const devRoot =
    bundleIdentifier === defaultDevBundleIdentifier
      ? path.join(appRoot, '.dev-electron', 'darwin')
      : path.join(
          appRoot,
          '.dev-electron',
          'darwin',
          'variants',
          sanitizePathSegment(bundleIdentifier)
        )
  const devDist = path.join(devRoot, 'dist')
  const devApp = path.join(devDist, 'Electron.app')
  const markerPath = path.join(devRoot, 'metadata.json')
  const expectedMarker = {
    markerVersion,
    electronVersion,
    bundleIdentifier,
    bundleExecutable: 'Electron',
    bundleName,
    lsuiElement: true
  }

  let shouldRefresh = !fs.existsSync(devApp)
  if (!shouldRefresh && fs.existsSync(markerPath)) {
    try {
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
      shouldRefresh = JSON.stringify(marker) !== JSON.stringify(expectedMarker)
    } catch {
      shouldRefresh = true
    }
  } else if (!shouldRefresh) {
    shouldRefresh = true
  }

  if (shouldRefresh) {
    fs.rmSync(devRoot, { recursive: true, force: true })
    fs.mkdirSync(devRoot, { recursive: true })
    fs.cpSync(sourceDist, devDist, { recursive: true, verbatimSymlinks: true })
  }

  patchDevAppPlist(devApp, { bundleIdentifier, bundleName })
  signDevApp(devApp)
  fs.writeFileSync(markerPath, `${JSON.stringify(expectedMarker, null, 2)}\n`)
  return devDist
}

function patchDevAppPlist(devApp, options) {
  const plist = require('simple-plist')
  const plistPath = path.join(devApp, 'Contents', 'Info.plist')
  const info = plist.readFileSync(plistPath)

  info.CFBundleIdentifier = options.bundleIdentifier
  info.CFBundleName = options.bundleName
  info.CFBundleDisplayName = options.bundleName
  info.CFBundleExecutable = 'Electron'
  info.LSUIElement = true
  delete info.LSBackgroundOnly

  plist.writeFileSync(plistPath, info)

  const verified = plist.readFileSync(plistPath)
  if (
    verified.CFBundleIdentifier !== options.bundleIdentifier ||
    verified.CFBundleExecutable !== 'Electron' ||
    verified.LSUIElement !== true
  ) {
    throw new Error(`Failed to patch dev Electron Info.plist: ${plistPath}`)
  }
}

function listChildPaths(root) {
  if (!fs.existsSync(root)) return []

  return fs.readdirSync(root).map((entry) => path.join(root, entry))
}

function findBundlePaths(root, extension) {
  const pending = [root]
  const results = []

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || !fs.existsSync(current)) continue

    const stat = fs.lstatSync(current)
    if (!stat.isDirectory()) continue

    if (current.endsWith(extension)) {
      results.push(current)
      continue
    }

    for (const child of listChildPaths(current)) {
      if (fs.lstatSync(child).isDirectory()) pending.push(child)
    }
  }

  return results
}

function replaceWithSymlink(targetPath, linkTarget) {
  if (fs.existsSync(targetPath)) {
    const stat = fs.lstatSync(targetPath)
    if (stat.isSymbolicLink() && fs.readlinkSync(targetPath) === linkTarget) return
    fs.rmSync(targetPath, { recursive: true, force: true })
  }

  fs.symlinkSync(linkTarget, targetPath)
}

function normalizeVersionedFramework(frameworkPath) {
  const versionPath = path.join(frameworkPath, 'Versions', 'A')
  if (!fs.existsSync(versionPath)) return

  replaceWithSymlink(path.join(frameworkPath, 'Versions', 'Current'), 'A')

  for (const versionEntry of fs.readdirSync(versionPath)) {
    replaceWithSymlink(
      path.join(frameworkPath, versionEntry),
      path.join('Versions', 'Current', versionEntry)
    )
  }
}

function normalizeDevAppFrameworks(devApp) {
  const frameworksRoot = path.join(devApp, 'Contents', 'Frameworks')
  for (const frameworkPath of findBundlePaths(frameworksRoot, '.framework')) {
    normalizeVersionedFramework(frameworkPath)
  }
}

function signPath(targetPath) {
  execFileSync('codesign', [...signArgs, targetPath], { stdio: 'pipe' })
}

function signBundlePaths(paths) {
  const sortedPaths = [...new Set(paths)]
    .filter((targetPath) => fs.existsSync(targetPath))
    .sort((a, b) => b.length - a.length)

  for (const targetPath of sortedPaths) {
    signPath(targetPath)
  }
}

function removeQuarantine(targetPath) {
  try {
    execFileSync('xattr', ['-dr', 'com.apple.quarantine', targetPath], { stdio: 'pipe' })
  } catch {
    // The attribute is optional; signing remains the source of truth for this bundle.
  }
}

function signDevApp(devApp) {
  try {
    normalizeDevAppFrameworks(devApp)
    removeQuarantine(devApp)

    const frameworksRoot = path.join(devApp, 'Contents', 'Frameworks')
    const helperApps = findBundlePaths(frameworksRoot, '.app')
    const frameworkVersions = findBundlePaths(frameworksRoot, '.framework').map((frameworkPath) =>
      path.join(frameworkPath, 'Versions', 'A')
    )

    signBundlePaths([...helperApps, ...frameworkVersions])
    execFileSync('codesign', [...signArgs, devApp], {
      stdio: 'pipe'
    })
    execFileSync('codesign', ['--verify', '--strict', devApp], {
      stdio: 'pipe'
    })
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim()
    throw new Error(
      `[dev] Failed to ad-hoc sign Tuff Dev Electron bundle.${stderr ? `\n${stderr}` : ''}`
    )
  }
}

const env = {
  ...process.env,
  TUFF_DEV_PARENT_PID: String(process.pid),
  NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192'
}

const devElectronDist = ensureDevElectronDist()
if (devElectronDist) {
  env.ELECTRON_OVERRIDE_DIST_PATH = devElectronDist
  env.ELECTRON_EXEC_PATH = path.join(
    devElectronDist,
    'Electron.app',
    'Contents',
    'MacOS',
    'Electron'
  )
  console.log(`[dev] Using Tuff Dev Electron bundle: ${devElectronDist}`)
}

if (process.env.TUFF_DEV_ELECTRON_PREPARE_ONLY === '1') {
  process.exit(0)
}

runElectronVite(env)

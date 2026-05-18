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
const markerVersion = 4
const defaultDevBundleIdentifier = 'com.tagzxia.app.tuff.dev'
const defaultDevBundleName = 'Tuff Dev'

function readNonEmptyEnv(name, fallback) {
  const value = process.env[name]?.trim()
  return value || fallback
}

function sanitizePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function runElectronVite(env) {
  const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(pnpmBin, ['exec', 'electron-vite', 'dev', ...process.argv.slice(2)], {
    cwd: appRoot,
    env,
    stdio: 'inherit'
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
  if (process.platform !== 'darwin') return null

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

function signDevApp(devApp) {
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', devApp], {
      stdio: 'pipe'
    })
    execFileSync('codesign', ['--verify', '--deep', '--strict', devApp], {
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

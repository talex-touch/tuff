#!/usr/bin/env node
/* eslint-disable no-console */
import type { RollupWatcher } from 'rollup'
import type { Locale } from '../cli/i18n'
import type { BuildConfig, DevConfig } from '../types'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import {
  getEnvOrDefault,
  getTuffBaseUrl,
  normalizeBaseUrl,
  setRuntimeEnv,
} from '@talex-touch/utils/env'
import { networkClient } from '@talex-touch/utils/network'
import {
  CATEGORY_REQUIRED_MIN_VERSION,
  CURRENT_SDK_VERSION,
} from '@talex-touch/utils/plugin'
import {
  normalizePermissionId,
  permissionRegistry,
} from '@talex-touch/utils/permission'
import { parseBuildArgs, parseDevArgs } from '../cli/args'
import { runCreate } from '../cli/commands'
import {
  initI18n,
  setLocale,
  t,
} from '../cli/i18n'
import {
  askConfirm,
  askLanguageSwitch,
  askSelect,
  askText,
  colors,
  printHeader,
  printInfo,
  printList,
  printWarning,
  styled,
} from '../cli/prompts'
import { ensureCliDeviceInfo } from '../cli/device'
import { listRepositories, trackRepository } from '../cli/repositories'
import { getCliConfigPath, readCliConfig, writeCliConfig } from '../cli/runtime-config'
import { build } from '../core/exporter'
import { clearAuthToken, getAuthToken, getAuthTokenPath, readAuthState, saveAuthToken } from '../core/auth'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

const ASCII_TUFF = `
_________  _   _  _____  _____
|__   __| | | | ||  ___||  ___|
   | |    | | | || |_   | |_   
   | |    | | | ||  _|  |  _|  
   | |    \\ \\_/ /| |    | |    
   |_|     \\___/ \\_|    \\_|    
`

const OFFICIAL_SITE_URL = 'https://tuff.tagzxia.com'
const GITHUB_REPO_URL = 'https://github.com/talex-touch/tuff'
const DEFAULT_LOCAL_BASE_URL = 'http://localhost:3200'
const DEVICE_AUTH_TIMEOUT_MS = 2 * 60 * 1000
const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

let cliLocalMode = false
let cliCustomBase = false

function resolveLocalBaseUrl(): string {
  const envUrl = getEnvOrDefault(
    'TUFF_LOCAL_BASE_URL',
    getEnvOrDefault(
      'NEXUS_API_BASE_LOCAL',
      getEnvOrDefault('AUTH_ORIGIN', DEFAULT_LOCAL_BASE_URL),
    ),
  )
  return normalizeBaseUrl(envUrl)
}

function applyLocalRuntime(): void {
  const localBaseUrl = resolveLocalBaseUrl()
  setRuntimeEnv({
    VITE_NEXUS_URL: localBaseUrl,
  })
}

function resolveSiteBaseUrl(): string {
  return cliCustomBase ? getTuffBaseUrl() : OFFICIAL_SITE_URL
}

function getTermsUrl(): string {
  return `${resolveSiteBaseUrl()}/protocol`
}

function getPrivacyUrl(): string {
  return `${resolveSiteBaseUrl()}/privacy`
}

// Initialize i18n with system locale
initI18n()

if (process.env.TUFF_CLI_ENTRY !== '@talex-touch/tuff-cli') {
  console.warn(
    '[DEPRECATED] `@talex-touch/unplugin-export-plugin` CLI entry is deprecated. Please use `@talex-touch/tuff-cli`.',
  )
}

function printHelp() {
  console.log('Usage: tuff <command> [options]')
  console.log('')
  console.log('Commands:')
  console.log('  create      Create a new Tuff plugin from template')
  console.log('  build       Run Vite build and package .tpex output')
  console.log('  builder     Package existing build output into .tpex')
  console.log('  dev         Start Vite dev server for plugin development')
  console.log('  publish     Publish plugin package to Tuff Nexus')
  console.log('  validate    Validate manifest.json and permission declarations')
  console.log('  login       Authenticate with Tuff Nexus')
  console.log('  logout      Clear authentication')
  console.log('  help        Show this help message')
  console.log('  about       Display tool information')
  console.log('')
  console.log('Options:')
  console.log('  --lang=en|zh   Set CLI language (default: system language)')
  console.log('  --local        Use local Nexus base URL (default: http://localhost:3200)')
  console.log('  --api-base     Override Nexus API base URL (e.g. https://staging.example.com)')
  console.log('  --config-dir   Override CLI config directory (default: ~/.tuff)')
  console.log('  --non-interactive  Disable interactive prompts')
  console.log('')
  console.log('Run `tuff <command> --help` for command-specific help.')
  console.log('')
  console.log('Interactive mode:')
  console.log('  Run `tuff` without arguments to enter interactive mode.')
}

function printAbout() {
  console.log('Talex Touch · Tuff DevKit')
  console.log(`Version: ${pkg.version}`)
  console.log('')
  console.log('Tools:')
  console.log('  - create:  Create new plugins from templates')
  console.log('  - build:   Run Vite build and package .tpex output')
  console.log('  - builder: Package existing build output into .tpex')
  console.log('  - dev:     Start a Vite dev server for plugin development')
  console.log('  - publish: Publish plugin packages to Nexus server')
  console.log('  - validate: Validate manifest compatibility and permissions')
}

function printBuildHelp() {
  console.log('Usage: tuff build [options]')
  console.log('')
  console.log('Options:')
  console.log('  --watch         Watch files and rebuild on changes')
  console.log('  --dev           Use development mode (no minify, sourcemap)')
  console.log('  --output <dir>  Output directory (default: dist)')
  console.log('  --help, -h      Show this help message')
  console.log('')
}

function printDevHelp() {
  console.log('Usage: tuff dev [options]')
  console.log('')
  console.log('Options:')
  console.log('  --port <port>   Dev server port')
  console.log('  --host [host]   Dev server host (omit value to listen on all)')
  console.log('  --open          Open browser on start')
  console.log('  --help, -h      Show this help message')
  console.log('')
}

function printValidateHelp() {
  console.log('Usage: tuff validate [options]')
  console.log('')
  console.log('Options:')
  console.log('  --manifest <path>  Manifest file path (default: ./manifest.json)')
  console.log('  --strict           Treat warnings as errors')
  console.log('  --help, -h         Show this help message')
  console.log('')
}

function printAsciiLogo(): void {
  console.log(ASCII_TUFF)
}

function openBrowser(url: string): void {
  const platform = process.platform
  try {
    if (platform === 'darwin') {
      const child = spawn('open', [url], { stdio: 'ignore', detached: true })
      child.unref()
      return
    }
    if (platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true })
      child.unref()
      return
    }
    const child = spawn('xdg-open', [url], { stdio: 'ignore', detached: true })
    child.unref()
  }
  catch {
    // Ignore
  }
}

async function startDeviceAuth(): Promise<{
  deviceCode: string
  userCode: string
  authorizeUrl: string
  expiresAt: string
  intervalSeconds: number
}> {
  const baseUrl = getTuffBaseUrl()
  const { deviceId, deviceName, devicePlatform } = await ensureCliDeviceInfo()
  const payload = {
    deviceId,
    deviceName,
    devicePlatform,
    clientType: 'cli',
  }
  const response = await networkClient.request<{
    deviceCode: string
    userCode: string
    authorizeUrl: string
    expiresAt: string
    intervalSeconds: number
    message?: string
  }>({
    method: 'POST',
    url: `${baseUrl}/api/app-auth/device/start`,
    headers: {
      'content-type': 'application/json',
    },
    body: payload,
    validateStatus: ALL_HTTP_STATUS
  })
  if (response.status < 200 || response.status >= 300) {
    const message =
      typeof response.data?.message === 'string' ? response.data.message : `HTTP ${response.status}`
    throw new Error(message)
  }
  return response.data
}

async function pollDeviceAuth(
  deviceCode: string,
  intervalSeconds: number,
): Promise<{
  status: 'approved' | 'expired' | 'cancelled' | 'timeout' | 'rejected' | 'browser_closed'
  token?: string
  grantType?: 'short' | 'long'
  ttlSeconds?: number
  refreshable?: boolean
  reason?: string
  message?: string | null
  requestIp?: string | null
  currentIp?: string | null
}> {
  const baseUrl = getTuffBaseUrl()
  const intervalMs = Math.max(1000, intervalSeconds * 1000)
  const startAt = Date.now()

  return await new Promise((resolve) => {
    const timer = setInterval(async () => {
      if (Date.now() - startAt > DEVICE_AUTH_TIMEOUT_MS) {
        clearInterval(timer)
        resolve({ status: 'timeout' })
        return
      }
      try {
        const res = await networkClient.request<{
          status?: string
          appToken?: string
          grantType?: 'short' | 'long'
          ttlSeconds?: number
          refreshable?: boolean
          reason?: string
          message?: string | null
          requestIp?: string | null
          currentIp?: string | null
        }>({
          method: 'GET',
          url: `${baseUrl}/api/app-auth/device/poll`,
          query: { device_code: deviceCode },
          headers: {
            'cache-control': 'no-cache',
          },
          validateStatus: ALL_HTTP_STATUS
        })
        if (res.status < 200 || res.status >= 300)
          return
        const data = res.data
        if (data?.status === 'approved' && data.appToken) {
          clearInterval(timer)
          resolve({
            status: 'approved',
            token: data.appToken,
            grantType: data.grantType,
            ttlSeconds: data.ttlSeconds,
            refreshable: data.refreshable,
          })
        }
        else if (data?.status === 'expired') {
          clearInterval(timer)
          resolve({ status: 'expired' })
        }
        else if (data?.status === 'cancelled') {
          clearInterval(timer)
          resolve({ status: 'cancelled' })
        }
        else if (data?.status === 'rejected') {
          clearInterval(timer)
          resolve({
            status: 'rejected',
            reason: data.reason,
            message: data.message,
            requestIp: data.requestIp,
            currentIp: data.currentIp,
          })
        }
        else if (data?.status === 'browser_closed') {
          clearInterval(timer)
          resolve({ status: 'browser_closed' })
        }
      }
      catch {
        // Ignore transient errors
      }
    }, intervalMs)
  })
}

async function abortDeviceAuth(deviceCode: string): Promise<void> {
  const baseUrl = getTuffBaseUrl()
  try {
    await networkClient.request({
      method: 'POST',
      url: `${baseUrl}/api/app-auth/device/abort`,
      headers: {
        'content-type': 'application/json',
      },
      body: { deviceCode },
      validateStatus: ALL_HTTP_STATUS
    })
  }
  catch {
    // Ignore
  }
}

async function loadPublishModule() {
  return await import('../core/publish')
}

async function runPublishWithTracking(): Promise<void> {
  await trackRepository('publish')
  await (await loadPublishModule()).runPublish()
}

async function runBuilder() {
  console.log('Running: tuff builder')
  await build()
}

async function runBuild(args: string[] = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printBuildHelp()
    return
  }

  await trackRepository('build')

  const { watch, dev, outputDir } = parseBuildArgs(args)

  const cliOverrides: BuildConfig = {}
  if (watch !== undefined)
    cliOverrides.watch = watch
  if (outputDir)
    cliOverrides.outDir = outputDir
  if (dev) {
    cliOverrides.minify = false
    cliOverrides.sourcemap = true
  }

  const { resolveBuildConfig } = await import('../core/config')
  const buildConfig = await resolveBuildConfig(process.cwd(), cliOverrides)
  const resolvedOutput = buildConfig.outDir ?? 'dist'
  const mode = dev ? 'development' : 'production'

  const exporterOptions = {
    outDir: buildConfig.outDir,
    minify: buildConfig.minify,
    sourcemap: buildConfig.sourcemap,
  }

  try {
    const [{ build: viteBuild }, { default: TouchPluginExport }] = await Promise.all([
      import('vite'),
      import('../vite'),
    ])
    const viteResult = await viteBuild({
      root: process.cwd(),
      mode,
      plugins: [TouchPluginExport()],
      build: {
        outDir: resolvedOutput,
        minify: buildConfig.minify,
        sourcemap: buildConfig.sourcemap,
        watch: buildConfig.watch ? {} : undefined,
      },
    })

    if (!buildConfig.watch) {
      await build(exporterOptions)
      return
    }

    if (!viteResult || typeof (viteResult as RollupWatcher).on !== 'function')
      throw new Error('Vite watch mode did not return a watcher')

    const watcher = viteResult as RollupWatcher
    let packaging = false
    let pending = false

    const runPackage = async () => {
      if (packaging) {
        pending = true
        return
      }
      packaging = true
      try {
        await build(exporterOptions)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`tuff build failed: ${message}`)
        process.exitCode = 1
      }
      finally {
        packaging = false
        if (pending) {
          pending = false
          await runPackage()
        }
      }
    }

    watcher.on('event', (event) => {
      if (event.code === 'END') {
        void runPackage()
      }
      else if (event.code === 'ERROR') {
        const message = event.error instanceof Error ? event.error.message : String(event.error)
        console.error(`tuff build failed: ${message}`)
        process.exitCode = 1
      }
    })

    const shutdown = async () => {
      await watcher.close()
      process.exit(0)
    }

    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`tuff build failed: ${message}`)
    process.exitCode = 1
  }
}

async function runDev(args: string[] = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printDevHelp()
    return
  }

  await trackRepository('dev')

  const { host, port, open } = parseDevArgs(args)

  try {
    const [{ createServer }, { default: TouchPluginExport }] = await Promise.all([
      import('vite'),
      import('../vite'),
    ])
    const { resolveDevConfig } = await import('../core/config')
    const cliOverrides: DevConfig = {}
    if (host !== undefined)
      cliOverrides.host = host
    if (port !== undefined)
      cliOverrides.port = port
    if (open !== undefined)
      cliOverrides.open = open

    const devConfig = await resolveDevConfig(process.cwd(), cliOverrides)

    const server = await createServer({
      root: process.cwd(),
      plugins: [TouchPluginExport()],
      server: {
        host: devConfig.host,
        port: devConfig.port,
        open: devConfig.open,
      },
    })

    await server.listen()
    server.printUrls()

    const shutdown = async () => {
      await server.close()
      process.exit(0)
    }

    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`tuff dev failed: ${message}`)
    process.exitCode = 1
  }
}

interface ValidateOptions {
  manifestPath: string
  strict: boolean
}

function parseValidateArgs(args: string[]): ValidateOptions {
  let strict = false
  let manifestPath = path.resolve(process.cwd(), 'manifest.json')

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--strict') {
      strict = true
      continue
    }
    if (arg === '--manifest') {
      const next = args[i + 1]
      if (!next || next.startsWith('-')) {
        throw new Error('Missing value for --manifest')
      }
      manifestPath = path.resolve(process.cwd(), next)
      i += 1
      continue
    }
    if (arg.startsWith('--manifest=')) {
      const value = arg.slice('--manifest='.length)
      if (!value) {
        throw new Error('Missing value for --manifest')
      }
      manifestPath = path.resolve(process.cwd(), value)
      continue
    }
  }

  return { manifestPath, strict }
}

function collectRawPermissionIds(manifest: Record<string, unknown>): string[] {
  const permissions = manifest.permissions
  if (Array.isArray(permissions)) {
    return permissions.filter((id): id is string => typeof id === 'string')
  }
  if (!permissions || typeof permissions !== 'object') {
    return []
  }
  const required = Array.isArray((permissions as { required?: unknown }).required)
    ? ((permissions as { required?: unknown[] }).required || [])
    : []
  const optional = Array.isArray((permissions as { optional?: unknown }).optional)
    ? ((permissions as { optional?: unknown[] }).optional || [])
    : []
  return [...required, ...optional].filter((id): id is string => typeof id === 'string')
}

async function runValidate(args: string[] = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printValidateHelp()
    return
  }

  const options = parseValidateArgs(args)
  if (!(await fs.pathExists(options.manifestPath))) {
    throw new Error(`Manifest not found: ${options.manifestPath}`)
  }

  let manifest: Record<string, unknown>
  try {
    manifest = (await fs.readJson(options.manifestPath)) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in manifest: ${message}`)
  }

  const errors: string[] = []
  const warnings: string[] = []

  const name = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  if (!name) {
    errors.push('Missing required field: "name"')
  }
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : ''
  if (!version) {
    errors.push('Missing required field: "version"')
  }

  const sdkapi = manifest.sdkapi
  if (typeof sdkapi !== 'number' || !Number.isFinite(sdkapi)) {
    errors.push(`Missing or invalid "sdkapi". Current required sdkapi: ${CURRENT_SDK_VERSION}`)
  } else if (sdkapi < CURRENT_SDK_VERSION) {
    warnings.push(`Outdated sdkapi (${sdkapi}). Recommended: ${CURRENT_SDK_VERSION}`)
  }

  const category = typeof manifest.category === 'string' ? manifest.category.trim() : ''
  if (typeof sdkapi === 'number' && sdkapi >= CATEGORY_REQUIRED_MIN_VERSION && !category) {
    errors.push(
      `Missing required "category" when sdkapi >= ${CATEGORY_REQUIRED_MIN_VERSION}`,
    )
  }

  const rawPermissionIds = collectRawPermissionIds(manifest)
  const normalizedPermissionIds = [...new Set(rawPermissionIds.map(id => normalizePermissionId(id)))]
  const unknownPermissions = normalizedPermissionIds.filter(id => !permissionRegistry.has(id))
  if (unknownPermissions.length > 0) {
    errors.push(`Unknown permissions: ${unknownPermissions.join(', ')}`)
  }

  if (normalizedPermissionIds.length === 0) {
    warnings.push('No declared permissions found in manifest.permissions')
  }

  const resultWarnings = options.strict ? [...warnings] : warnings
  if (options.strict && warnings.length > 0) {
    errors.push('Strict mode enabled: warnings treated as errors')
  }

  if (errors.length > 0) {
    errors.forEach((message) => console.error(`✖ ${message}`))
    if (resultWarnings.length > 0) {
      resultWarnings.forEach((message) => console.warn(`⚠ ${message}`))
    }
    throw new Error(`Manifest validation failed (${errors.length} error(s))`)
  }

  console.log(`✔ Manifest is valid: ${options.manifestPath}`)
  if (warnings.length > 0) {
    warnings.forEach((message) => console.warn(`⚠ ${message}`))
  }
}

async function ensureOnboarding(): Promise<boolean> {
  const config = await readCliConfig()
  const hasLangFlag = process.argv.some(arg => arg.startsWith('--lang='))
  if (config.locale && !hasLangFlag) {
    setLocale(config.locale)
  }

  if (config.onboardingCompleted && config.termsAcceptedAt) {
    return true
  }

  printHeader(t('onboarding.title'), t('onboarding.subtitle'))

  const selectedLocale = await askLanguageSwitch()

  printHeader(t('onboarding.termsTitle'))
  printInfo(t('onboarding.termsIntro'))
  printList([
    t('onboarding.termsItem1'),
    t('onboarding.termsItem2'),
    t('onboarding.termsItem3'),
    t('onboarding.termsLink', { url: getTermsUrl() }),
    t('onboarding.privacyLink', { url: getPrivacyUrl() }),
  ])

  const accepted = await askConfirm(t('onboarding.termsConfirm'), false)
  if (!accepted) {
    printInfo(t('onboarding.termsDeclined'))
    return false
  }

  await writeCliConfig({
    locale: selectedLocale,
    onboardingCompleted: true,
    termsAcceptedAt: new Date().toISOString(),
  })

  return true
}

async function ensureAuthenticated(): Promise<boolean> {
  const baseUrl = normalizeBaseUrl(getTuffBaseUrl())
  const authState = await readAuthState()
  if (authState?.token && authState.baseUrl) {
    const storedBase = normalizeBaseUrl(authState.baseUrl)
    if (storedBase !== baseUrl) {
      await clearAuthToken()
      printInfo(t('notice.baseChanged', { from: storedBase, to: baseUrl }))
    }
  }

  const existingToken = await getAuthToken()
  if (existingToken) {
    return true
  }

  if (cliLocalMode) {
    printInfo(t('notice.localMode', { url: baseUrl }))
  }
  else if (cliCustomBase) {
    printInfo(t('notice.customMode', { url: baseUrl }))
  }

  printHeader(t('onboarding.loginTitle'), t('onboarding.loginSubtitle'))

  const loginMethod = await askSelect(t('onboarding.loginSelect'), [
    { label: t('onboarding.loginOptionToken'), value: 'token' },
    { label: t('onboarding.loginOptionOauth'), value: 'oauth' },
    { label: t('onboarding.loginOptionExit'), value: 'exit' },
  ])

  if (loginMethod === 'exit')
    return false

  if (loginMethod === 'token') {
    const token = await askText(t('onboarding.tokenPrompt'), {
      hint: t('onboarding.tokenHint'),
      validate: value => (value.trim() ? true : t('onboarding.tokenInvalid')),
    })
    const device = await ensureCliDeviceInfo()
    await saveAuthToken(token.trim(), {
      baseUrl,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      devicePlatform: device.devicePlatform,
    })
    printInfo(t('onboarding.tokenWarning'))
    printInfo(t('onboarding.loginSuccess'))
    return true
  }

  while (true) {
    printInfo(t('onboarding.oauthPreparing'))
    try {
      const auth = await startDeviceAuth()
      openBrowser(auth.authorizeUrl)
      printInfo(t('onboarding.oauthOpenHint', { url: auth.authorizeUrl }))
      printInfo(t('onboarding.oauthWaiting'))

      while (true) {
        const result = await pollDeviceAuth(auth.deviceCode, auth.intervalSeconds || 3)
        if (result.status === 'browser_closed') {
          printWarning(t('onboarding.oauthTabClosed'))
          const action = await askSelect(t('onboarding.oauthTabClosedPrompt'), [
            { label: t('onboarding.oauthTabClosedReopen'), value: 'reopen' },
            { label: t('onboarding.oauthTabClosedClose'), value: 'close' },
          ])
          if (action === 'reopen') {
            openBrowser(auth.authorizeUrl)
            printInfo(t('onboarding.oauthReopened', { url: auth.authorizeUrl }))
            continue
          }
          await abortDeviceAuth(auth.deviceCode)
          printInfo(t('onboarding.oauthClosedByUser'))
          return false
        }

        if (result.status === 'rejected') {
          printWarning(t('onboarding.oauthRejected'))
          if (result.reason === 'ip_mismatch') {
            printWarning(t('onboarding.oauthRejectedReasonIpMismatch', {
              requestIp: result.requestIp || '-',
              currentIp: result.currentIp || '-',
            }))
          }
          else {
            printWarning(t('onboarding.oauthRejectedReasonGeneric', {
              reason: result.message || result.reason || 'unknown',
            }))
          }
          const retry = await askConfirm(t('onboarding.oauthRetryConfirm'), true)
          if (!retry)
            return false
          printInfo(t('onboarding.oauthRetrying'))
          break
        }

        if (result.status !== 'approved' || !result.token) {
          if (result.status === 'cancelled') {
            printInfo(t('onboarding.oauthCancelled'))
          }
          else if (result.status === 'expired') {
            printInfo(t('onboarding.oauthExpired'))
          }
          else {
            printInfo(t('onboarding.oauthTimeout'))
          }
          return false
        }

        const device = await ensureCliDeviceInfo()
        await saveAuthToken(result.token, {
          baseUrl,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          devicePlatform: device.devicePlatform,
        })
        printInfo(t('onboarding.tokenWarning'))
        if (result.grantType === 'short') {
          printWarning(t('onboarding.authModeShortHint', {
            duration: formatDuration(result.ttlSeconds),
          }))
          printWarning(t('onboarding.authRefreshDeniedShort'))
        }
        else if (result.grantType === 'long') {
          printInfo(t('onboarding.authModeLongHint', {
            duration: formatDuration(result.ttlSeconds),
          }))
        }
        printInfo(t('onboarding.loginSuccess'))
        return true
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      printInfo(t('onboarding.oauthFailed', { error: message }))
      return false
    }
  }
}

interface AccountProfile {
  id?: string
  name?: string | null
  email?: string | null
  role?: string | null
}

async function fetchAccountProfile(): Promise<AccountProfile | null> {
  const token = await getAuthToken()
  if (!token)
    return null
  try {
    const response = await networkClient.request<AccountProfile>({
      method: 'GET',
      url: `${getTuffBaseUrl()}/api/auth/me`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: ALL_HTTP_STATUS
    })
    if (response.status < 200 || response.status >= 300)
      return null
    return response.data
  }
  catch {
    return null
  }
}

async function fetchUserPlugins(): Promise<{ total: number, plugins: any[] } | null> {
  const token = await getAuthToken()
  if (!token)
    return null
  try {
    const response = await networkClient.request<{ total?: number, plugins?: any[] }>({
      method: 'GET',
      url: `${getTuffBaseUrl()}/api/dashboard/plugins`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: ALL_HTTP_STATUS
    })
    if (response.status < 200 || response.status >= 300)
      return null
    const data = response.data
    return {
      total: typeof data.total === 'number' ? data.total : (data.plugins?.length ?? 0),
      plugins: Array.isArray(data.plugins) ? data.plugins : [],
    }
  }
  catch {
    return null
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value)
    return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return parsed.toLocaleString()
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0)
    return '-'
  if (seconds % (60 * 60 * 24) === 0)
    return `${Math.floor(seconds / (60 * 60 * 24))}d`
  if (seconds % (60 * 60) === 0)
    return `${Math.floor(seconds / (60 * 60))}h`
  if (seconds % 60 === 0)
    return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

async function showAccountSummary(): Promise<void> {
  printHeader(t('account.title'))
  const profile = await fetchAccountProfile()
  const authState = await readAuthState()
  if (profile) {
    const name = profile.name || profile.email || profile.id || t('account.userFallback')
    printInfo(t('account.greeting', { name }))
    if (profile.email)
      printInfo(t('account.email', { email: profile.email }))
    if (profile.role)
      printInfo(t('account.role', { role: profile.role }))
  }
  else {
    printInfo(t('account.profileUnavailable'))
  }

  if (authState?.baseUrl)
    printInfo(t('account.baseUrl', { url: authState.baseUrl }))
  if (authState?.savedAt)
    printInfo(t('account.savedAt', { date: formatTimestamp(authState.savedAt) }))
  if (authState?.deviceName)
    printInfo(t('account.deviceName', { name: authState.deviceName }))
  if (authState?.deviceId)
    printInfo(t('account.deviceId', { id: authState.deviceId }))
}

async function showRemotePlugins(): Promise<void> {
  printHeader(t('account.pluginsTitle'))
  const result = await fetchUserPlugins()
  if (!result || result.total === 0) {
    printInfo(t('account.pluginsEmpty'))
    return
  }

  printInfo(t('account.pluginsCount', { count: result.total }))
  const items = result.plugins.slice(0, 10).map((plugin: any) => {
    const name = plugin?.name || plugin?.title || plugin?.slug || t('account.pluginUnknown')
    const version = plugin?.latestVersion?.version || plugin?.latestVersion?.tag || ''
    return version ? `${name} · ${version}` : name
  })
  printList(items)
}

async function showLocalRepositories(): Promise<void> {
  printHeader(t('repositories.title'))
  const entries = await listRepositories()
  if (entries.length === 0) {
    printInfo(t('repositories.empty'))
    return
  }
  const lines = entries.slice(0, 10).map((entry) => {
    const version = entry.version ? ` · ${entry.version}` : ''
    const when = formatTimestamp(entry.lastOpenedAt)
    return `${entry.name}${version} · ${entry.path} · ${when}`
  })
  printList(lines, 2)
}

async function runTemplatePicker(): Promise<void> {
  printHeader(t('templates.title'), t('templates.subtitle'))
  const choice = await askSelect(t('templates.select'), [
    { label: t('templates.official'), value: 'official' },
  ])
  if (choice === 'official') {
    await runCreate({ template: 'default' })
  }
}

async function runPluginMenu(): Promise<void> {
  while (true) {
    printHeader(t('plugins.title'))
    const action = await askSelect(t('plugins.selectAction'), [
      { label: t('plugins.create'), value: 'create' },
      { label: t('plugins.templates'), value: 'templates' },
      { label: t('plugins.build'), value: 'build' },
      { label: t('plugins.dev'), value: 'dev' },
      { label: t('plugins.publish'), value: 'publish' },
      { label: t('plugins.repositories'), value: 'repos' },
      { label: t('common.back'), value: 'back' },
    ])

    if (action === 'back')
      return
    if (action === 'create')
      await runCreate()
    else if (action === 'templates')
      await runTemplatePicker()
    else if (action === 'build')
      await runBuild()
    else if (action === 'dev')
      await runDev()
    else if (action === 'publish')
      await runPublishWithTracking()
    else if (action === 'repos')
      await showLocalRepositories()
  }
}

async function runAccountMenu(): Promise<void> {
  while (true) {
    printHeader(t('account.menuTitle'))
    const action = await askSelect(t('account.selectAction'), [
      { label: t('account.summary'), value: 'summary' },
      { label: t('account.remotePlugins'), value: 'remote-plugins' },
      { label: t('account.localRepos'), value: 'local-repos' },
      { label: t('common.back'), value: 'back' },
    ])
    if (action === 'back')
      return
    if (action === 'summary')
      await showAccountSummary()
    else if (action === 'remote-plugins')
      await showRemotePlugins()
    else if (action === 'local-repos')
      await showLocalRepositories()
  }
}

async function runSettingsMenu(): Promise<'logout' | void> {
  while (true) {
    printHeader(t('settings.title'))
    const action = await askSelect(t('settings.selectAction'), [
      { label: t('settings.language'), value: 'language' },
      { label: t('settings.relogin'), value: 'relogin' },
      { label: t('settings.logout'), value: 'logout' },
      { label: t('common.back'), value: 'back' },
    ])

    if (action === 'back')
      return
    if (action === 'language') {
      const newLocale = await askLanguageSwitch()
      await writeCliConfig({ locale: newLocale })
      printInfo(t('settings.languageChanged', { lang: t(`settings.languages.${newLocale}`) }))
      continue
    }
    if (action === 'relogin') {
      const authState = await readAuthState()
      const localBase = resolveLocalBaseUrl()
      if (!cliLocalMode && authState?.baseUrl) {
        const storedBase = normalizeBaseUrl(authState.baseUrl)
        const normalizedLocal = normalizeBaseUrl(localBase)
        if (storedBase === normalizedLocal) {
          const useLocal = await askConfirm(
            t('settings.reloginUseLocal', { url: localBase }),
            true,
          )
          if (useLocal) {
            setRuntimeEnv({
              VITE_NEXUS_URL: localBase,
            })
            cliLocalMode = true
            cliCustomBase = true
            printInfo(t('settings.localModeEnabled', { url: localBase }))
          }
          else {
            printInfo(t('settings.localModeSkipped', { url: localBase }))
          }
        }
      }
      await clearAuthToken()
      const ok = await ensureAuthenticated()
      if (!ok)
        return 'logout'
      continue
    }
    if (action === 'logout') {
      await clearAuthToken()
      printInfo(t('settings.logoutSuccess'))
      return 'logout'
    }
  }
}

async function runHelpMenu(): Promise<void> {
  while (true) {
    printHeader(t('help.title'))
    const action = await askSelect(t('help.selectAction'), [
      { label: t('help.official'), value: 'official' },
      { label: t('help.terms'), value: 'terms' },
      { label: t('help.privacy'), value: 'privacy' },
      { label: t('help.github'), value: 'github' },
      { label: t('common.back'), value: 'back' },
    ])
    if (action === 'back')
      return
    if (action === 'official') {
      const siteUrl = resolveSiteBaseUrl()
      openBrowser(siteUrl)
      printInfo(t('help.opened', { url: siteUrl }))
    }
    else if (action === 'terms') {
      openBrowser(getTermsUrl())
      printInfo(t('help.opened', { url: getTermsUrl() }))
    }
    else if (action === 'privacy') {
      openBrowser(getPrivacyUrl())
      printInfo(t('help.opened', { url: getPrivacyUrl() }))
    }
    else if (action === 'github') {
      openBrowser(GITHUB_REPO_URL)
      printInfo(t('help.opened', { url: GITHUB_REPO_URL }))
    }
  }
}

/**
 * Interactive menu mode
 */
async function runInteractiveMode(): Promise<void> {
  printAsciiLogo()
  const onboardingReady = await ensureOnboarding()
  if (!onboardingReady)
    return

  const authenticated = await ensureAuthenticated()
  if (!authenticated)
    return

  printInfo(t('welcome.storageHint', {
    cli: getCliConfigPath(),
    auth: getAuthTokenPath(),
  }))
  const profile = await fetchAccountProfile()
  const greetingName = profile?.name || profile?.email || ''
  const greeting = greetingName
    ? t('welcome.greeting', { name: greetingName })
    : t('welcome.subtitle')

  while (true) {
    printHeader(
      t('welcome.title'),
      `${greeting} · ${t('welcome.version', { version: pkg.version })}`,
    )

    const action = await askSelect(t('welcome.selectAction'), [
      { label: t('menu.plugins'), value: 'plugins' },
      { label: t('menu.account'), value: 'account' },
      { label: t('menu.settings'), value: 'settings' },
      { label: t('menu.help'), value: 'help' },
      { label: t('menu.exit'), value: 'exit' },
    ])

    if (action === 'plugins') {
      await runPluginMenu()
      continue
    }
    if (action === 'account') {
      await runAccountMenu()
      continue
    }
    if (action === 'settings') {
      const outcome = await runSettingsMenu()
      if (outcome === 'logout')
        return
      continue
    }
    if (action === 'help') {
      await runHelpMenu()
      continue
    }
    if (action === 'exit') {
      console.log(styled('👋 Bye!', colors.cyan))
      return
    }
  }
}

/**
 * Parse --lang flag from args
 */
interface GlobalFlags {
  args: string[]
  lang: Locale | null
  local: boolean
  apiBase: string | null
  configDir: string | null
  nonInteractive: boolean
}

function parseGlobalFlags(argv: string[]): GlobalFlags {
  let lang: Locale | null = null
  let local = false
  let apiBase: string | null = null
  let configDir: string | null = null
  let nonInteractive = false
  const args: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--lang=')) {
      const value = arg.slice(7).toLowerCase()
      if (value === 'en' || value === 'zh')
        lang = value
      continue
    }
    if (arg === '--lang') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --lang')
      const value = next.toLowerCase()
      if (value !== 'en' && value !== 'zh')
        throw new Error(`Invalid --lang value: ${next}`)
      lang = value as Locale
      i += 1
      continue
    }
    if (arg === '--local') {
      local = true
      continue
    }
    if (arg === '--non-interactive') {
      nonInteractive = true
      continue
    }
    if (arg === '--api-base') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --api-base')
      apiBase = next
      i += 1
      continue
    }
    if (arg.startsWith('--api-base=')) {
      apiBase = arg.slice(11)
      if (!apiBase)
        throw new Error('Missing value for --api-base')
      continue
    }
    if (arg === '--config-dir') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --config-dir')
      configDir = next
      i += 1
      continue
    }
    if (arg.startsWith('--config-dir=')) {
      configDir = arg.slice(13)
      if (!configDir)
        throw new Error('Missing value for --config-dir')
      continue
    }
    args.push(arg)
  }

  return { args, lang, local, apiBase, configDir, nonInteractive }
}

async function main() {
  // Check for language flag
  const {
    args: cliArgs,
    lang,
    local,
    apiBase,
    configDir,
    nonInteractive,
  } = parseGlobalFlags(process.argv.slice(2))
  if (lang)
    setLocale(lang)
  if (configDir) {
    process.env.TUFF_CONFIG_DIR = path.resolve(configDir)
  }
  if (nonInteractive) {
    process.env.TUFF_NON_INTERACTIVE = '1'
  }

  const hasCustomBase = Boolean(apiBase) || local
  if (apiBase) {
    const normalized = normalizeBaseUrl(apiBase)
    setRuntimeEnv({
      VITE_NEXUS_URL: normalized,
    })
  }
  else if (local) {
    applyLocalRuntime()
  }
  cliCustomBase = hasCustomBase
  cliLocalMode = local

  const command = (cliArgs[0] || '').toLowerCase()
  const commandArgs = cliArgs.slice(1)
  const hasHelpFlag = cliArgs.includes('--help') || cliArgs.includes('-h')

  try {
    if (command === '--help' || command === '-h') {
      printHelp()
      return
    }
    if (command === 'create') {
      // Parse create options from args
      const nameArg = commandArgs[0]
      await runCreate({
        name: nameArg && !nameArg.startsWith('-') ? nameArg : undefined,
      })
    }
    else if (command === 'build') {
      await runBuild(commandArgs)
    }
    else if (command === 'builder') {
      await runBuilder()
    }
    else if (command === 'dev') {
      await runDev(commandArgs)
    }
    else if (command === 'validate') {
      await runValidate(commandArgs)
    }
    else if (command === 'publish') {
      const { printPublishHelp } = await loadPublishModule()
      if (hasHelpFlag) {
        printPublishHelp()
      }
      else {
        await runPublishWithTracking()
      }
    }
    else if (command === 'login') {
      await (await loadPublishModule()).login()
    }
    else if (command === 'logout') {
      await (await loadPublishModule()).logout()
    }
    else if (command === 'about') {
      printAbout()
    }
    else if (command === 'help') {
      printHelp()
    }
    else if (command === '') {
      if (nonInteractive) {
        throw new Error('Non-interactive mode requires a command.')
      }
      // Interactive mode when no command
      await runInteractiveMode()
    }
    else {
      throw new Error(`Unknown command: ${command}`)
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(message)
    if (command !== 'help' && command !== 'about')
      console.error('Run `tuff help` to see available commands.')
    process.exitCode = 1
  }
}

main()

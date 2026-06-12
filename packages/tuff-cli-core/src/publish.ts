/* eslint-disable no-console */
import type { NetworkResponse } from '@talex-touch/utils/network'
import type { PublishConfig } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { getTuffBaseUrl, NEXUS_BASE_URL, normalizeBaseUrl } from '@talex-touch/utils/env'
import { networkClient } from '@talex-touch/utils/network'
import fs from 'fs-extra'
import { parsePublishArgs } from './args'
import { clearAuthToken, getAuthToken, getAuthTokenPath, readAuthState, saveAuthToken } from './auth'
import { resolvePublishConfig } from './config'
import { ensureCliDeviceInfo } from './device'

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)
const CLI_COMMAND_NAME = process.env.TUFF_CLI_COMMAND || 'tuffcli'

interface PackageInfo {
  path: string
  filename: string
  size: number
  sha256: string
  mtimeMs: number
}

interface PackageJsonInfo {
  name: string
  version: string
}

interface ManifestInfo {
  id?: string
  name: string
  version: string
  homepage?: string
}

interface DashboardPluginVersionSummary {
  manifest?: {
    id?: string
    name?: string
    version?: string
  } | null
}

interface DashboardPluginSummary {
  id?: string
  slug?: string
  name?: string
  latestVersion?: DashboardPluginVersionSummary | null
  versions?: DashboardPluginVersionSummary[]
}

interface DashboardPluginsResponse {
  plugins?: DashboardPluginSummary[]
  total?: number
}

interface DashboardPublishedVersion {
  id?: string
  version?: string
  status?: string
  channel?: string
}

interface DashboardPublishResponse {
  version?: DashboardPublishedVersion
}

interface AuthTokenDiagnostics {
  kind: 'apiKey' | 'appJwt' | 'opaque'
  expired?: boolean
  expiresAt?: string
  issuer?: string
  audience?: string
  tokenType?: string
  grantType?: string
  hasDeviceId?: boolean
}

interface PublisherAuthResponse {
  ok?: boolean
  userId?: string
  authType?: 'session' | 'app' | 'apiKey' | 'admin'
  role?: string | null
  scopes?: string[]
}

export interface PublishAuthRuntime {
  refreshAppJwt: () => Promise<string | null>
  onAuthRefreshFailure?: (reason: string) => Promise<void> | void
}

interface ResolvedPublishAuth {
  token: string
  preflightPlugins: DashboardPluginsResponse | null
}

function getDashboardPluginsUrl(): string {
  return `${getTuffBaseUrl()}/api/dashboard/plugins`
}

function getDashboardPluginVersionsUrl(pluginId: string): string {
  return `${getTuffBaseUrl()}/api/dashboard/plugins/${encodeURIComponent(pluginId)}/versions`
}

function getPublisherAuthUrl(): string {
  return `${getTuffBaseUrl()}/api/dashboard/auth/publisher`
}

function formatResponseSnippet(data: unknown): string {
  const raw = typeof data === 'string' ? data : JSON.stringify(data)
  return (raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function isHtmlResponse(response: NetworkResponse<string>): boolean {
  const contentType = response.headers['content-type']?.toLowerCase() ?? ''
  const data = typeof response.data === 'string' ? response.data.trimStart() : ''
  return contentType.includes('text/html') || data.toLowerCase().startsWith('<!doctype html') || data.startsWith('<html')
}

function parseJsonResponse<T>(response: NetworkResponse<string>, context: string): T {
  if (response.status < 200 || response.status >= 300) {
    const suffix = response.status === 401
      ? ` Run \`${CLI_COMMAND_NAME} login\` to authorize this CLI with Nexus.`
      : ''
    throw new Error(`${context} failed: HTTP ${response.status}. ${formatResponseSnippet(response.data)}${suffix}`)
  }

  if (isHtmlResponse(response)) {
    throw new Error(`${context} returned HTML instead of JSON. ${formatResponseSnippet(response.data)}`)
  }

  try {
    const parsed = JSON.parse(response.data) as T
    if (!parsed || typeof parsed !== 'object')
      throw new Error('Response is not an object')
    return parsed
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${context} returned invalid JSON: ${message}. ${formatResponseSnippet(response.data)}`)
  }
}

function decodeBase64UrlJson(input: string): Record<string, unknown> | null {
  try {
    let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
    while (normalized.length % 4 !== 0)
      normalized += '='
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as Record<string, unknown>
  }
  catch {
    return null
  }
}

function inspectAuthToken(token: string): AuthTokenDiagnostics {
  if (token.startsWith('tuff_'))
    return { kind: 'apiKey' }

  const parts = token.split('.')
  if (parts.length !== 3)
    return { kind: 'opaque' }

  const payload = decodeBase64UrlJson(parts[1] ?? '')
  if (!payload)
    return { kind: 'opaque' }

  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  return {
    kind: 'appJwt',
    expired: typeof exp === 'number' ? exp <= Math.floor(Date.now() / 1000) : undefined,
    expiresAt: typeof exp === 'number' ? new Date(exp * 1000).toISOString() : undefined,
    issuer: typeof payload.iss === 'string' ? payload.iss : undefined,
    audience: typeof payload.aud === 'string' ? payload.aud : undefined,
    tokenType: typeof payload.typ === 'string' ? payload.typ : undefined,
    grantType: typeof payload.gt === 'string' ? payload.gt : undefined,
    hasDeviceId: typeof payload.deviceId === 'string' && payload.deviceId.length > 0,
  }
}

function formatAuthDiagnostics(diagnostics: AuthTokenDiagnostics): string {
  if (diagnostics.kind === 'apiKey') {
    return 'Detected a Nexus API key. Ensure it has both plugin:read and plugin:publish scopes.'
  }
  if (diagnostics.kind === 'appJwt') {
    const parts = [
      `Detected an app JWT (${diagnostics.grantType ?? 'unknown'} grant).`,
      diagnostics.expiresAt ? `Expires at ${diagnostics.expiresAt}.` : '',
      diagnostics.expired ? 'The token is expired.' : '',
      'If it is not expired, Nexus may be rejecting it because APP_AUTH_JWT_SECRET/AUTH_SECRET changed or the device was revoked.',
    ].filter(Boolean)
    return parts.join(' ')
  }
  return `Detected an opaque bearer token. Use \`${CLI_COMMAND_NAME} login\` or a valid \`tuff_\` API key.`
}

async function createDeviceHeaders(): Promise<Record<string, string>> {
  const authState = await readAuthState()
  const headers: Record<string, string> = {
    'X-Device-Client': 'cli',
  }
  if (authState?.deviceId)
    headers['X-Device-Id'] = authState.deviceId
  if (authState?.deviceName)
    headers['X-Device-Name'] = authState.deviceName
  if (authState?.devicePlatform)
    headers['X-Device-Platform'] = authState.devicePlatform
  return headers
}

async function requestJsonWithAuth(token: string, url: string): Promise<NetworkResponse<string>> {
  const deviceHeaders = await createDeviceHeaders()
  return await networkClient.request<string>({
    method: 'GET',
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      ...deviceHeaders,
    },
    responseType: 'text',
    validateStatus: ALL_HTTP_STATUS,
  })
}

function isExpiredAppJwtDiagnostics(diagnostics: AuthTokenDiagnostics): boolean {
  return diagnostics.kind === 'appJwt' && diagnostics.expired === true
}

function hasRequiredApiKeyScopes(response: PublisherAuthResponse): boolean {
  if (response.authType !== 'apiKey')
    return true
  const scopes = Array.isArray(response.scopes) ? response.scopes : []
  return scopes.includes('plugin:read') && scopes.includes('plugin:publish')
}

async function resolvePublisherAccess(
  token: string,
  options: PublishConfig,
  runtime?: PublishAuthRuntime,
): Promise<ResolvedPublishAuth> {
  try {
    const preflightPlugins = await preflightPublisherAccess(token)
    return {
      token,
      preflightPlugins,
    }
  }
  catch (error) {
    const diagnostics = inspectAuthToken(token)
    if (!runtime || options.nonInteractive || !isExpiredAppJwtDiagnostics(diagnostics))
      throw error

    const refreshedToken = await runtime.refreshAppJwt()
    if (!refreshedToken) {
      await runtime.onAuthRefreshFailure?.('refresh-returned-empty-token')
      throw new Error('Publish authentication expired and automatic browser refresh did not produce a new token.')
    }

    const preflightPlugins = await preflightPublisherAccess(refreshedToken)
    return {
      token: refreshedToken,
      preflightPlugins,
    }
  }
}

function throwPublisherAuthError(
  response: NetworkResponse<string>,
  diagnostics: AuthTokenDiagnostics,
  url: string,
): never {
  const hint = formatAuthDiagnostics(diagnostics)
  if (response.status === 401) {
    throw new Error(`Publisher authentication was rejected by Nexus before publish (${url}). ${hint} Run \`${CLI_COMMAND_NAME} login\` to refresh this CLI session.`)
  }
  if (response.status === 403) {
    throw new Error(`Publisher credentials are valid but not allowed to publish (${url}). ${hint}`)
  }

  parseJsonResponse<PublisherAuthResponse>(response, `Validate publisher access (${url})`)
  throw new Error(`Validate publisher access (${url}) failed unexpectedly.`)
}

async function fetchDashboardPlugins(token: string): Promise<DashboardPluginsResponse> {
  const pluginsUrl = getDashboardPluginsUrl()
  const pluginsRes = await requestJsonWithAuth(token, pluginsUrl)
  return parseJsonResponse<DashboardPluginsResponse>(pluginsRes, `Fetch Dashboard plugins (${pluginsUrl})`)
}

async function preflightPublisherAccess(token: string): Promise<DashboardPluginsResponse | null> {
  const diagnostics = inspectAuthToken(token)
  const url = getPublisherAuthUrl()
  const response = await requestJsonWithAuth(token, url)

  if (response.status >= 200 && response.status < 300) {
    const payload = parseJsonResponse<PublisherAuthResponse>(response, `Validate publisher access (${url})`)
    if (!hasRequiredApiKeyScopes(payload)) {
      throw new Error(`Publisher API key is missing required scopes (${url}). Expected plugin:read and plugin:publish.`)
    }
    return null
  }

  if (response.status === 404) {
    return await fetchDashboardPlugins(token)
  }

  throwPublisherAuthError(response, diagnostics, url)
}

function normalizeManifestIdToSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function resolveDashboardSlug(manifest: ManifestInfo, pkg: PackageJsonInfo): string {
  const source = manifest.id || manifest.name || pkg.name
  const slug = normalizeManifestIdToSlug(source)
  if (!slug) {
    throw new Error('Cannot resolve Dashboard plugin identifier from manifest.id or manifest.name.')
  }
  return slug
}

function versionManifestIds(plugin: DashboardPluginSummary): string[] {
  const ids = new Set<string>()
  const latestId = plugin.latestVersion?.manifest?.id
  if (latestId)
    ids.add(latestId)
  for (const version of plugin.versions ?? []) {
    const id = version.manifest?.id
    if (id)
      ids.add(id)
  }
  return [...ids]
}

function findDashboardPlugin(
  plugins: DashboardPluginSummary[],
  slug: string,
  manifest: ManifestInfo,
): DashboardPluginSummary {
  const exact = plugins.filter(plugin => plugin.slug === slug)
  const manifestId = manifest.id?.trim()
  const manifestMatches = manifestId
    ? plugins.filter(plugin => plugin.slug === manifestId || versionManifestIds(plugin).includes(manifestId))
    : []
  const candidates = exact.length ? exact : manifestMatches

  if (candidates.length === 1 && candidates[0]?.id)
    return candidates[0]

  if (candidates.length > 1) {
    const ids = candidates
      .map(plugin => `${plugin.name ?? plugin.slug ?? 'unknown'} (${plugin.id ?? 'no-id'})`)
      .join(', ')
    throw new Error(`Multiple Dashboard plugins match "${slug}": ${ids}`)
  }

  const available = plugins
    .map(plugin => plugin.slug || plugin.name)
    .filter(Boolean)
    .slice(0, 8)
    .join(', ')
  throw new Error(`Dashboard plugin "${slug}" was not found.${available ? ` Available: ${available}` : ''}`)
}

async function calculateSha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function scanPackages(packageDirs: string[]): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = []

  for (const dir of packageDirs) {
    if (!(await fs.pathExists(dir)))
      continue

    const files = await fs.readdir(dir)

    for (const file of files) {
      if (!file.endsWith('.tpex'))
        continue

      const filePath = path.join(dir, file)
      const stat = await fs.stat(filePath)

      if (!stat.isFile())
        continue

      console.log(`  Found: ${file}`)

      const sha256 = await calculateSha256(filePath)

      packages.push({
        path: filePath,
        filename: file,
        size: stat.size,
        sha256,
        mtimeMs: stat.mtimeMs,
      })
    }
  }

  return packages
}

async function readPackageJson(): Promise<PackageJsonInfo | null> {
  const pkgPath = path.join(process.cwd(), 'package.json')

  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath)
    return { name: pkg.name, version: pkg.version }
  }

  return null
}

async function readManifest(): Promise<ManifestInfo | null> {
  const manifestPath = path.join(process.cwd(), 'manifest.json')

  if (await fs.pathExists(manifestPath)) {
    const manifest = await fs.readJson(manifestPath)
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      homepage: manifest.homepage,
    }
  }

  return null
}

function resolveDashboardPublishUrlFromPlugins(
  pluginsPayload: DashboardPluginsResponse,
  slug: string,
  manifest: ManifestInfo,
): string {
  if (!Array.isArray(pluginsPayload.plugins))
    throw new Error('Dashboard plugins response is missing `plugins`.')

  const plugin = findDashboardPlugin(pluginsPayload.plugins, slug, manifest)
  if (!plugin.id)
    throw new Error(`Dashboard plugin "${slug}" is missing id.`)

  return getDashboardPluginVersionsUrl(plugin.id)
}

async function resolveDashboardPublishUrl(token: string, slug: string, manifest: ManifestInfo): Promise<string> {
  return resolveDashboardPublishUrlFromPlugins(await fetchDashboardPlugins(token), slug, manifest)
}

function createPublishForm(
  pkg: PackageJsonInfo,
  manifest: ManifestInfo,
  tag: string,
  channel: NonNullable<PublishConfig['channel']>,
  notes: string,
  target: PackageInfo,
  content: Buffer,
): FormData {
  const form = new FormData()
  form.set('name', manifest.name)
  form.set('version', pkg.version)
  form.set('tag', tag)
  form.set('channel', channel)
  form.set('notes', notes)
  form.set('changelog', notes)
  if (manifest.homepage)
    form.set('homepage', manifest.homepage)
  const packageBody = new ArrayBuffer(content.byteLength)
  new Uint8Array(packageBody).set(content)
  form.set('package', new Blob([packageBody]), target.filename)
  return form
}

async function publishPackage(
  token: string,
  url: string,
  form: FormData,
): Promise<DashboardPublishedVersion> {
  const deviceHeaders = await createDeviceHeaders()
  const publishRes = await networkClient.request<string>({
    method: 'POST',
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      ...deviceHeaders,
    },
    body: form as unknown as BodyInit,
    responseType: 'text',
    validateStatus: ALL_HTTP_STATUS,
  })

  const payload = parseJsonResponse<DashboardPublishResponse>(publishRes, `Publish plugin package (${url})`)
  const version = payload.version

  if (!version?.id || !version.version || !version.status) {
    throw new Error(`Publish response is missing version.id/version/status. ${formatResponseSnippet(payload)}`)
  }

  return version
}

export async function login(): Promise<void> {
  console.log('\n🔐 Tuff Authentication\n')

  const token = process.argv[3]
  const baseUrl = normalizeBaseUrl(getTuffBaseUrl())
  const defaultBase = normalizeBaseUrl(NEXUS_BASE_URL)
  if (baseUrl !== defaultBase) {
    console.log(`ℹ Using custom Nexus base: ${baseUrl}`)
  }

  if (!token) {
    console.log(`Run \`${CLI_COMMAND_NAME} login\` from the main CLI to authorize this device in your browser.`)
    console.log(`Token compatibility: \`${CLI_COMMAND_NAME} login <token>\``)
    console.log('')
    console.log('Get tokens from the Tuff Nexus dashboard:')
    console.log('  https://tuff.tagzxia.com/dashboard')
    return
  }

  const device = await ensureCliDeviceInfo()
  await saveAuthToken(token, {
    baseUrl,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    devicePlatform: device.devicePlatform,
  })
  console.log(`✓ Token saved to ${getAuthTokenPath()}`)
  console.log('⚠️  Keep your token safe and do not share it.')
  console.log('✓ Successfully logged in!')
}

export async function logout(): Promise<void> {
  const tokenPath = getAuthTokenPath()

  if (await fs.pathExists(tokenPath)) {
    await clearAuthToken()
    console.log('✓ Logged out successfully')
  }
  else {
    console.log('ℹ No active session found')
  }
}

export async function publish(options: PublishConfig = {}, runtime?: PublishAuthRuntime): Promise<void> {
  console.log('\n📦 Tuff Plugin Publisher\n')

  const token = await getAuthToken()
  if (!token) {
    console.error(`❌ Not authenticated. Run \`${CLI_COMMAND_NAME} login\` first.`)
    process.exitCode = 1
    return
  }

  const pkg = await readPackageJson()
  if (!pkg?.name || !pkg?.version) {
    console.error('❌ No package.json found in current directory')
    process.exitCode = 1
    return
  }

  const manifest = await readManifest()
  if (!manifest?.name || !manifest?.version) {
    console.error('❌ No manifest.json found in current directory')
    process.exitCode = 1
    return
  }

  if (manifest.version !== pkg.version) {
    console.error(`❌ Version mismatch: manifest.json=${manifest.version} package.json=${pkg.version}`)
    process.exitCode = 1
    return
  }

  const dashboardSlug = resolveDashboardSlug(manifest, pkg)
  const tag = options.tag || pkg.version
  const channel = options.channel || (
    tag.includes('snapshot') || tag.includes('alpha')
      ? 'SNAPSHOT'
      : tag.includes('beta')
        ? 'BETA'
        : 'RELEASE'
  )
  const notes = options.notes?.trim() || `Release v${pkg.version}`

  console.log(`Plugin: ${manifest.name}`)
  console.log(`Version: ${pkg.version}`)
  console.log(`Dashboard plugin: ${dashboardSlug}`)
  console.log(`Tag: ${tag}`)
  console.log(`Channel: ${channel}`)
  console.log('')

  console.log('🔍 Scanning for plugin packages...')
  const distPath = path.join(process.cwd(), 'dist')
  const packages = await scanPackages([path.join(distPath, 'build'), distPath])

  if (packages.length === 0) {
    console.error('❌ No .tpex package found in dist/build or dist/')
    console.log(`   Build your plugin first with \`${CLI_COMMAND_NAME} build\``)
    process.exitCode = 1
    return
  }

  const sorted = [...packages].sort((a, b) => b.mtimeMs - a.mtimeMs)
  const target = sorted[0]

  if (!target) {
    console.error('❌ No .tpex package found in dist/build or dist/')
    process.exitCode = 1
    return
  }

  if (packages.length > 1) {
    console.log(`\n⚠ Found ${packages.length} packages, using latest: ${target.filename}\n`)
  }

  const sizeMB = (target.size / 1024 / 1024).toFixed(2)

  console.log('📋 Publish Summary:')
  console.log('─'.repeat(50))
  console.log(`  Tag:      ${tag}`)
  console.log(`  Channel:  ${channel}`)
  console.log(`  Package:  ${target.filename} (${sizeMB} MB)`)
  console.log(`  Sha256:   ${target.sha256}`)
  console.log('─'.repeat(50))

  if (options.dryRun) {
    console.log('\n🏃 Dry run mode - no changes will be made')
    return
  }

  let authToken = token
  let preflightPlugins: DashboardPluginsResponse | null = null
  try {
    const resolved = await resolvePublisherAccess(token, options, runtime)
    authToken = resolved.token
    preflightPlugins = resolved.preflightPlugins
  }
  catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
    return
  }

  console.log('\n📤 Publishing plugin package...')

  try {
    const publishUrl = options.apiUrl || (preflightPlugins
      ? resolveDashboardPublishUrlFromPlugins(preflightPlugins, dashboardSlug, manifest)
      : await resolveDashboardPublishUrl(authToken, dashboardSlug, manifest))
    const content = await fs.readFile(target.path)
    const form = createPublishForm(pkg, manifest, tag, channel, notes, target, content)
    const version = await publishPackage(authToken, publishUrl, form)
    const submitted = version.status === 'approved' ? 'published' : 'submitted'

    console.log(`\n✅ Plugin package ${submitted} successfully.`)
    console.log(`   Version: ${version.version}`)
    console.log(`   Status:  ${version.status}`)
    if (version.channel)
      console.log(`   Channel: ${version.channel}`)
    console.log(`   Package: ${target.filename}`)
  }
  catch (error) {
    console.error(`\n❌ Publish failed: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}

export async function runPublish(): Promise<void> {
  const args = process.argv.slice(3)
  const cliOverrides: PublishConfig = parsePublishArgs(args)

  const resolved = await resolvePublishConfig(process.cwd(), cliOverrides)
  await publish(resolved)
}

export function printPublishHelp(): void {
  console.log(`Usage: ${CLI_COMMAND_NAME} publish [options]`)
  console.log('')
  console.log('Options:')
  console.log('  --tag <tag>        Release tag (default: {package.version})')
  console.log('  --channel <ch>     Channel: RELEASE, BETA, SNAPSHOT (auto-detected)')
  console.log('  --notes <text>     Changelog/notes (supports Markdown)')
  console.log('  --dry-run          Preview without publishing')
  console.log('  --api-url <url>    Custom publish API URL')
  console.log('')
  console.log('Example:')
  console.log(`  ${CLI_COMMAND_NAME} publish --tag 1.2.0 --channel RELEASE`)
  console.log(`  ${CLI_COMMAND_NAME} publish --dry-run`)
}

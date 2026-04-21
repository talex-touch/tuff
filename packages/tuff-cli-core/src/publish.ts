/* eslint-disable no-console */
import type { NetworkResponse } from '@talex-touch/utils/network'
import type { Buffer } from 'node:buffer'
import type { PublishConfig } from './types'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { getTuffBaseUrl, NEXUS_BASE_URL, normalizeBaseUrl } from '@talex-touch/utils/env'
import { networkClient } from '@talex-touch/utils/network'
import fs from 'fs-extra'
import { parsePublishArgs } from './args'
import { getAuthToken, getAuthTokenPath, saveAuthToken } from './auth'
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

function getDashboardPluginsUrl(): string {
  return `${getTuffBaseUrl()}/api/dashboard/plugins`
}

function getDashboardPluginVersionsUrl(pluginId: string): string {
  return `${getTuffBaseUrl()}/api/dashboard/plugins/${encodeURIComponent(pluginId)}/versions`
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

async function resolveDashboardPublishUrl(token: string, slug: string, manifest: ManifestInfo): Promise<string> {
  const pluginsUrl = getDashboardPluginsUrl()
  const pluginsRes = await networkClient.request<string>({
    method: 'GET',
    url: pluginsUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: 'text',
    validateStatus: ALL_HTTP_STATUS,
  })
  const payload = parseJsonResponse<DashboardPluginsResponse>(pluginsRes, `Fetch Dashboard plugins (${pluginsUrl})`)

  if (!Array.isArray(payload.plugins))
    throw new Error('Dashboard plugins response is missing `plugins`.')

  const plugin = findDashboardPlugin(payload.plugins, slug, manifest)
  if (!plugin.id)
    throw new Error(`Dashboard plugin "${slug}" is missing id.`)

  return getDashboardPluginVersionsUrl(plugin.id)
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
  const publishRes = await networkClient.request<string>({
    method: 'POST',
    url,
    headers: {
      Authorization: `Bearer ${token}`,
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
    await fs.remove(tokenPath)
    console.log('✓ Logged out successfully')
  }
  else {
    console.log('ℹ No active session found')
  }
}

export async function publish(options: PublishConfig = {}): Promise<void> {
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

  console.log('\n📤 Publishing plugin package...')

  try {
    const publishUrl = options.apiUrl || await resolveDashboardPublishUrl(token, dashboardSlug, manifest)
    const content = await fs.readFile(target.path)
    const form = createPublishForm(pkg, manifest, tag, channel, notes, target, content)
    const version = await publishPackage(token, publishUrl, form)
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

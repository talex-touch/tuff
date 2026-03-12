#!/usr/bin/env node
/* eslint-disable no-console */
import type { PublishConfig } from '../types'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { NEXUS_BASE_URL, getTuffBaseUrl, normalizeBaseUrl } from '@talex-touch/utils/env'
import { networkClient } from '@talex-touch/utils/network'
import fs from 'fs-extra'
import { parsePublishArgs } from '../cli/args'
import { ensureCliDeviceInfo } from '../cli/device'
import { getAuthToken, getAuthTokenPath, saveAuthToken } from './auth'
import { resolvePublishConfig } from './config'

interface PackageInfo {
  path: string
  filename: string
  size: number
  sha256: string
  mtimeMs: number
}

function getDefaultApiUrl(): string {
  return `${getTuffBaseUrl()}/api/store/plugins/publish`
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

async function readPackageJson(): Promise<{ name: string, version: string } | null> {
  const pkgPath = path.join(process.cwd(), 'package.json')

  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath)
    return { name: pkg.name, version: pkg.version }
  }

  return null
}

async function readManifest(): Promise<{ name: string, version: string } | null> {
  const manifestPath = path.join(process.cwd(), 'manifest.json')

  if (await fs.pathExists(manifestPath)) {
    const manifest = await fs.readJson(manifestPath)
    return { name: manifest.name, version: manifest.version }
  }

  return null
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
    console.log('Usage: tuff login <token>')
    console.log('')
    console.log('Get your token from the Tuff Nexus dashboard:')
    console.log('  https://tuff.tagzxia.com/dashboard')
    console.log('')
    console.log('Or set the TUFF_AUTH_TOKEN environment variable.')
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
    console.error('❌ Not authenticated. Run `tuff login <token>` first.')
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

  console.log(`Plugin: ${manifest.name}`)
  console.log(`Version: ${pkg.version}`)

  const tag = options.tag || pkg.version
  const channel = options.channel || (
    tag.includes('snapshot') || tag.includes('alpha')
      ? 'SNAPSHOT'
      : tag.includes('beta')
        ? 'BETA'
        : 'RELEASE'
  )

  console.log(`Tag: ${tag}`)
  console.log(`Channel: ${channel}`)
  console.log('')

  console.log('🔍 Scanning for plugin packages...')
  const distPath = path.join(process.cwd(), 'dist')
  const packages = await scanPackages([path.join(distPath, 'build'), distPath])

  if (packages.length === 0) {
    console.error('❌ No .tpex package found in dist/build or dist/')
    console.log('   Build your plugin first with `tuff build`')
    process.exitCode = 1
    return
  }

  const sorted = [...packages].sort((a, b) => b.mtimeMs - a.mtimeMs)
  const target = sorted[0]

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

  const apiUrl = options.apiUrl || getDefaultApiUrl()

  console.log('\n📤 Publishing plugin package...')

  try {
    const content = await fs.readFile(target.path)
    const form = new FormData()
    form.set('name', manifest.name)
    form.set('version', pkg.version)
    form.set('tag', tag)
    form.set('channel', channel)

    if (options.notes) {
      form.set('notes', options.notes)
      form.set('changelog', options.notes)
    }

    form.set('package', new Blob([content]), target.filename)

    const publishRes = await networkClient.request<string>({
      method: 'POST',
      url: apiUrl,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form as unknown as BodyInit,
      responseType: 'text',
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100)
    })

    if (publishRes.status < 200 || publishRes.status >= 300) {
      throw new Error(`Failed to publish package: ${publishRes.data || `HTTP ${publishRes.status}`}`)
    }

    console.log('\n✅ Plugin package published successfully!')
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
  console.log('Usage: tuff publish [options]')
  console.log('')
  console.log('Options:')
  console.log('  --tag <tag>        Release tag (default: {package.version})')
  console.log('  --channel <ch>     Channel: RELEASE, BETA, SNAPSHOT (auto-detected)')
  console.log('  --notes <text>     Changelog/notes (supports Markdown)')
  console.log('  --dry-run          Preview without publishing')
  console.log('  --api-url <url>    Custom publish API URL')
  console.log('')
  console.log('Example:')
  console.log('  tuff publish --tag 1.2.0 --channel RELEASE')
  console.log('  tuff publish --dry-run')
}

#!/usr/bin/env node
/* eslint-disable no-console */
import process from 'node:process'
import path from 'pathe'
import fs from 'fs-extra'
import { createHash } from 'node:crypto'

interface PublishOptions {
  tag?: string
  channel?: 'RELEASE' | 'BETA' | 'SNAPSHOT'
  notes?: string
  dryRun?: boolean
  apiUrl?: string
}

interface AssetInfo {
  path: string
  filename: string
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'x64' | 'arm64' | 'universal'
  size: number
  sha256: string
}

const DEFAULT_API_URL = 'https://tuff.tagzxia.com/api/releases'

async function getAuthToken(): Promise<string | null> {
  const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.tuff', 'auth.json')

  try {
    if (await fs.pathExists(tokenPath)) {
      const auth = await fs.readJson(tokenPath)
      return auth.token || null
    }
  }
  catch {
    // Ignore
  }

  return process.env.TUFF_AUTH_TOKEN || null
}

async function saveAuthToken(token: string): Promise<void> {
  const tuffDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.tuff')
  await fs.ensureDir(tuffDir)

  const tokenPath = path.join(tuffDir, 'auth.json')
  await fs.writeJson(tokenPath, { token, savedAt: new Date().toISOString() })

  console.log(`✓ Token saved to ${tokenPath}`)
}

async function calculateSha256(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function detectPlatform(filename: string): 'darwin' | 'win32' | 'linux' {
  const lower = filename.toLowerCase()

  if (lower.includes('.dmg') || lower.includes('mac') || lower.includes('darwin'))
    return 'darwin'
  if (lower.includes('.exe') || lower.includes('win') || lower.includes('windows'))
    return 'win32'
  if (lower.includes('.appimage') || lower.includes('.deb') || lower.includes('.rpm') || lower.includes('linux'))
    return 'linux'

  return 'darwin'
}

function detectArch(filename: string): 'x64' | 'arm64' | 'universal' {
  const lower = filename.toLowerCase()

  if (lower.includes('universal'))
    return 'universal'
  if (lower.includes('arm64') || lower.includes('aarch64'))
    return 'arm64'
  if (lower.includes('x64') || lower.includes('amd64') || lower.includes('x86_64'))
    return 'x64'

  return 'x64'
}

async function scanAssets(distPath: string): Promise<AssetInfo[]> {
  const assets: AssetInfo[] = []
  const extensions = ['.dmg', '.exe', '.AppImage', '.deb', '.rpm', '.zip', '.tar.gz']

  if (!(await fs.pathExists(distPath))) {
    console.warn(`⚠ Dist directory not found: ${distPath}`)
    return assets
  }

  const files = await fs.readdir(distPath)

  for (const file of files) {
    const ext = extensions.find(e => file.endsWith(e))
    if (!ext)
      continue

    const filePath = path.join(distPath, file)
    const stat = await fs.stat(filePath)

    if (!stat.isFile())
      continue

    console.log(`  Found: ${file}`)

    const sha256 = await calculateSha256(filePath)

    assets.push({
      path: filePath,
      filename: file,
      platform: detectPlatform(file),
      arch: detectArch(file),
      size: stat.size,
      sha256,
    })
  }

  return assets
}

async function readPackageJson(): Promise<{ name: string, version: string } | null> {
  const pkgPath = path.join(process.cwd(), 'package.json')

  if (await fs.pathExists(pkgPath)) {
    const pkg = await fs.readJson(pkgPath)
    return { name: pkg.name, version: pkg.version }
  }

  return null
}

export async function login(): Promise<void> {
  console.log('\n🔐 Tuff Authentication\n')

  const token = process.argv[3]

  if (!token) {
    console.log('Usage: tuff login <token>')
    console.log('')
    console.log('Get your token from the Tuff Nexus dashboard:')
    console.log('  https://tuff.talex.link/dashboard')
    console.log('')
    console.log('Or set the TUFF_AUTH_TOKEN environment variable.')
    return
  }

  await saveAuthToken(token)
  console.log('✓ Successfully logged in!')
}

export async function logout(): Promise<void> {
  const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.tuff', 'auth.json')

  if (await fs.pathExists(tokenPath)) {
    await fs.remove(tokenPath)
    console.log('✓ Logged out successfully')
  }
  else {
    console.log('ℹ No active session found')
  }
}

export async function publish(options: PublishOptions = {}): Promise<void> {
  console.log('\n📦 Tuff Release Publisher\n')

  // Check authentication
  const token = await getAuthToken()
  if (!token) {
    console.error('❌ Not authenticated. Run `tuff login <token>` first.')
    process.exitCode = 1
    return
  }

  // Read package.json
  const pkg = await readPackageJson()
  if (!pkg) {
    console.error('❌ No package.json found in current directory')
    process.exitCode = 1
    return
  }

  console.log(`Project: ${pkg.name}`)
  console.log(`Version: ${pkg.version}`)

  // Determine tag and channel
  const tag = options.tag || `v${pkg.version}`
  const channel = options.channel || (
    tag.includes('snapshot') || tag.includes('alpha') ? 'SNAPSHOT'
      : tag.includes('beta') ? 'BETA'
        : 'RELEASE'
  )

  console.log(`Tag: ${tag}`)
  console.log(`Channel: ${channel}`)
  console.log('')

  // Scan for assets
  console.log('🔍 Scanning for release assets...')
  const distPath = path.join(process.cwd(), 'dist')
  const assets = await scanAssets(distPath)

  if (assets.length === 0) {
    console.error('❌ No release assets found in dist/')
    console.log('   Build your project first with `pnpm core:build:release`')
    process.exitCode = 1
    return
  }

  console.log(`\n✓ Found ${assets.length} asset(s)\n`)

  // Summary
  console.log('📋 Release Summary:')
  console.log('─'.repeat(50))
  console.log(`  Tag:     ${tag}`)
  console.log(`  Channel: ${channel}`)
  console.log(`  Assets:`)
  for (const asset of assets) {
    const sizeMB = (asset.size / 1024 / 1024).toFixed(2)
    console.log(`    - ${asset.filename} (${asset.platform}/${asset.arch}, ${sizeMB} MB)`)
  }
  console.log('─'.repeat(50))

  if (options.dryRun) {
    console.log('\n🏃 Dry run mode - no changes will be made')
    return
  }

  const apiUrl = options.apiUrl || DEFAULT_API_URL

  console.log('\n📤 Publishing to Nexus...')

  try {
    // Step 1: Create release
    console.log('  Creating release...')

    const createRes = await fetch(`${apiUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        tag,
        name: `${pkg.name} ${tag}`,
        channel,
        version: pkg.version,
        notes: options.notes || `Release ${tag}`,
      }),
    })

    if (!createRes.ok) {
      const error = await createRes.text()
      throw new Error(`Failed to create release: ${error}`)
    }

    console.log('  ✓ Release created')

    // Step 2: Link assets (using GitHub URLs or upload)
    console.log('  Linking assets...')

    for (const asset of assets) {
      // For now, we'll just log what would be uploaded
      // In production, you'd upload to R2/S3 or link to GitHub
      console.log(`    → ${asset.filename}`)

      // Link as GitHub asset (assuming GitHub release exists)
      const githubUrl = `https://github.com/talex-touch/tuff/releases/download/${tag}/${asset.filename}`

      const linkRes = await fetch(`${apiUrl}/${encodeURIComponent(tag)}/link-github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform: asset.platform,
          arch: asset.arch,
          filename: asset.filename,
          downloadUrl: githubUrl,
          size: asset.size,
          sha256: asset.sha256,
        }),
      })

      if (!linkRes.ok) {
        const error = await linkRes.text()
        console.warn(`    ⚠ Failed to link ${asset.filename}: ${error}`)
      }
      else {
        console.log(`    ✓ Linked ${asset.filename}`)
      }
    }

    // Step 3: Publish
    console.log('  Publishing release...')

    const publishRes = await fetch(`${apiUrl}/${encodeURIComponent(tag)}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!publishRes.ok) {
      const error = await publishRes.text()
      throw new Error(`Failed to publish: ${error}`)
    }

    console.log('\n✅ Release published successfully!')
    console.log(`   View at: https://tuff.talex.link/updates?channel=${channel.toLowerCase()}`)
  }
  catch (error) {
    console.error(`\n❌ Publish failed: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}

export async function runPublish(): Promise<void> {
  const args = process.argv.slice(3)

  const options: PublishOptions = {
    dryRun: args.includes('--dry-run'),
  }

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) {
      options.tag = args[++i]
    }
    else if (args[i] === '--channel' && args[i + 1]) {
      options.channel = args[++i] as 'RELEASE' | 'BETA' | 'SNAPSHOT'
    }
    else if (args[i] === '--notes' && args[i + 1]) {
      options.notes = args[++i]
    }
    else if (args[i] === '--api-url' && args[i + 1]) {
      options.apiUrl = args[++i]
    }
  }

  await publish(options)
}

export function printPublishHelp(): void {
  console.log('Usage: tuff publish [options]')
  console.log('')
  console.log('Options:')
  console.log('  --tag <tag>        Release tag (default: v{package.version})')
  console.log('  --channel <ch>     Channel: RELEASE, BETA, SNAPSHOT (auto-detected)')
  console.log('  --notes <text>     Release notes')
  console.log('  --dry-run          Preview without publishing')
  console.log('  --api-url <url>    Custom API URL')
  console.log('')
  console.log('Example:')
  console.log('  tuff publish --tag v2.5.0 --channel RELEASE')
  console.log('  tuff publish --dry-run')
}

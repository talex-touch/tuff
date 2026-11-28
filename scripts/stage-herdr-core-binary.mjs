#!/usr/bin/env node
/**
 * Opt-in staging script for bundling a verified `herdr-core` binary alongside Tuff.
 *
 * Opt-in gating:
 *   When neither `TUFF_BUNDLE_HERDR_CORE=1` nor `--from <path>` is supplied, exits 0
 *   without touching `apps/core-app/resources/herdr-core` so default builds stay unaffected.
 *
 * Fail-closed integrity:
 *   Requires an explicit 64-hex SHA-256 digest (`--sha256` or `HERDR_CORE_BINARY_SHA256`)
 *   and verifies it in constant time before writing any file into the target directory.
 *   Stages the executable plus Apache-2.0 `LICENSE-APACHE-2.0.txt`, `NOTICE.txt`, and
 *   `manifest.json`.
 */
import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, realpathSync } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(scriptDir, '..')
export const DEFAULT_STAGE_TARGET_DIR = path.resolve(
  REPO_ROOT,
  'apps/core-app/resources/herdr-core',
)
export const DEFAULT_APACHE_LICENSE_SOURCE = path.resolve(
  REPO_ROOT,
  'apps/core-app/resources/licenses/fd-LICENSE-APACHE.txt',
)

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i

export function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function verifyFileSha256(filePath, expectedSha256) {
  const expected = typeof expectedSha256 === 'string' ? expectedSha256.trim().toLowerCase() : ''
  if (!SHA256_HEX_RE.test(expected)) {
    throw new Error(
      'SHA-256 verification failed: --sha256 / HERDR_CORE_BINARY_SHA256 must be a 64-character hex digest',
    )
  }

  const actual = (await computeFileSha256(filePath)).toLowerCase()
  const actualBuf = Buffer.from(actual, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error(
      `SHA-256 mismatch for ${filePath}: expected ${expected}, got ${actual}`,
    )
  }

  return actual
}

export function parseStageArgs(argv, env = process.env) {
  const parsed = {
    help: false,
    from: '',
    sha256: '',
    version: '',
    targetDir: '',
    platform: process.platform,
    arch: process.arch,
    licenseSource: '',
    cliFromProvided: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    const readValue = (flag) => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`)
      }
      i += 1
      return next
    }
    if (arg === '--from') {
      parsed.from = readValue('--from')
      parsed.cliFromProvided = true
    }
    else if (arg === '--sha256') {
      parsed.sha256 = readValue('--sha256')
    }
    else if (arg === '--version') {
      parsed.version = readValue('--version')
    }
    else if (arg === '--target') {
      parsed.targetDir = readValue('--target')
    }
    else if (arg === '--platform') {
      parsed.platform = readValue('--platform')
    }
    else if (arg === '--arch') {
      parsed.arch = readValue('--arch')
    }
    else if (arg === '--license') {
      parsed.licenseSource = readValue('--license')
    }
    else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  const envOptIn = env.TUFF_BUNDLE_HERDR_CORE === '1' || env.TUFF_BUNDLE_HERDR_CORE === 'true'
  const from = (parsed.from || env.HERDR_CORE_BINARY_PATH || '').trim()
  const sha256 = (parsed.sha256 || env.HERDR_CORE_BINARY_SHA256 || '').trim()
  const version = (parsed.version || env.HERDR_CORE_VERSION || '').trim()
  const targetDir = (parsed.targetDir || env.HERDR_CORE_STAGE_DIR || DEFAULT_STAGE_TARGET_DIR).trim()
  const licenseSource = (parsed.licenseSource || DEFAULT_APACHE_LICENSE_SOURCE).trim()

  return {
    help: parsed.help,
    optIn: envOptIn || parsed.cliFromProvided,
    from,
    sha256,
    version: version || null,
    targetDir,
    platform: parsed.platform,
    arch: parsed.arch,
    licenseSource,
  }
}

export async function stageHerdrCoreBinary(options) {
  if (!options.optIn) {
    return {
      staged: false,
      skipped: true,
      reason: 'opt-in disabled (set TUFF_BUNDLE_HERDR_CORE=1 or pass --from)',
    }
  }

  const fromPath = typeof options.from === 'string' ? options.from.trim() : ''
  if (!fromPath) {
    throw new Error(
      'herdr-core staging enabled, but no source binary was provided (--from or HERDR_CORE_BINARY_PATH)',
    )
  }

  const resolvedFrom = path.resolve(fromPath)
  let sourceStat
  try {
    sourceStat = await stat(resolvedFrom)
  }
  catch (error) {
    throw new Error(
      `Source herdr-core binary not readable at ${resolvedFrom}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!sourceStat.isFile()) {
    throw new Error(`Source herdr-core path is not a regular file: ${resolvedFrom}`)
  }

  // Fail-closed: verify SHA-256 and Apache-2.0 license text BEFORE touching targetDir.
  const verifiedSha256 = await verifyFileSha256(resolvedFrom, options.sha256)
  const licenseSource = path.resolve(options.licenseSource || DEFAULT_APACHE_LICENSE_SOURCE)
  const licenseText = await readFile(licenseSource, 'utf8')
  if (!licenseText.includes('Apache License')) {
    throw new Error(`License source at ${licenseSource} does not contain Apache-2.0 license text`)
  }

  const targetDir = path.resolve(options.targetDir || DEFAULT_STAGE_TARGET_DIR)
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const binaryName = platform === 'win32' ? 'herdr-core.exe' : 'herdr-core'

  await mkdir(targetDir, { recursive: true })

  const binaryPath = path.join(targetDir, binaryName)
  await copyFile(resolvedFrom, binaryPath)
  if (platform !== 'win32') {
    await chmod(binaryPath, 0o755)
  }

  const licensePath = path.join(targetDir, 'LICENSE-APACHE-2.0.txt')
  await writeFile(licensePath, licenseText, 'utf8')

  const noticePath = path.join(targetDir, 'NOTICE.txt')
  const noticeBody = [
    'Tuff Optional Bundled Component Notice',
    '======================================',
    '',
    'Component: herdr-core',
    'License: Apache License, Version 2.0 (see LICENSE-APACHE-2.0.txt)',
    `Version: ${options.version || 'unspecified'}`,
    `Target: ${platform}/${arch}`,
    `Binary: ${binaryName}`,
    `SHA-256: ${verifiedSha256}`,
    '',
    'This optional binary was staged explicitly with TUFF_BUNDLE_HERDR_CORE=1',
    'and redistributed unaltered under the terms of the Apache License 2.0.',
    '',
  ].join('\n')
  await writeFile(noticePath, noticeBody, 'utf8')

  const manifestPath = path.join(targetDir, 'manifest.json')
  const manifest = {
    name: 'herdr-core',
    binary: binaryName,
    version: options.version || null,
    platform,
    arch,
    sha256: verifiedSha256,
    license: 'Apache-2.0',
    noticeFile: 'NOTICE.txt',
    licenseFile: 'LICENSE-APACHE-2.0.txt',
    stagedAt: new Date().toISOString(),
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  return {
    staged: true,
    skipped: false,
    targetDir,
    binaryPath,
    noticePath,
    licensePath,
    manifestPath,
    sha256: verifiedSha256,
    manifest,
  }
}

function printUsage() {
  console.log([
    'Usage: node scripts/stage-herdr-core-binary.mjs [options]',
    '',
    'Options:',
    '  --from <path>       Source herdr-core executable (or HERDR_CORE_BINARY_PATH)',
    '  --sha256 <hex>      Required 64-hex SHA-256 digest (or HERDR_CORE_BINARY_SHA256)',
    '  --version <semver>  Optional version label recorded in NOTICE.txt & manifest.json',
    '  --target <dir>      Target staging directory (default: apps/core-app/resources/herdr-core)',
    '  --platform <os>     Target platform (default: host process.platform)',
    '  --arch <arch>       Target CPU arch (default: host process.arch)',
    '  --license <path>    Path to Apache-2.0 license text',
    '  -h, --help          Show this help text',
    '',
    'Opt-in: set TUFF_BUNDLE_HERDR_CORE=1 or pass --from. Without opt-in, exits 0 cleanly.',
  ].join('\n'))
}

async function main() {
  const options = parseStageArgs(process.argv.slice(2), process.env)
  if (options.help) {
    printUsage()
    return
  }

  const result = await stageHerdrCoreBinary(options)
  if (result.skipped) {
    console.log(`[stage-herdr-core] Skipped: ${result.reason}`)
    return
  }

  console.log(
    `[stage-herdr-core] Staged ${result.binaryPath} (sha256 ${result.sha256}) with Apache-2.0 NOTICE and manifest`,
  )
}

function invokedDirectly() {
  if (!process.argv[1])
    return false
  const self = fileURLToPath(import.meta.url)
  try {
    return realpathSync(process.argv[1]) === realpathSync(self)
  }
  catch {
    return path.resolve(process.argv[1]) === self
  }
}

if (invokedDirectly()) {
  main().catch((error) => {
    console.error(`[stage-herdr-core] Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}

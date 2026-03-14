import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

function getArgValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  return process.argv[index + 1] ?? fallback
}

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function toBool(value) {
  return value === true || value === 'true' || value === '1'
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf8')
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase()
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

const repoRoot = process.cwd()
const tag = getArgValue('--tag', 'v2.4.7')
const version = getArgValue('--version', tag.replace(/^v/, ''))
const stage = String(getArgValue('--stage', 'gate-d')).trim().toLowerCase()
const strict = toBool(getArgValue('--strict', hasFlag('--strict')))
const manifestArg = getArgValue('--manifest')
const baseUrlArg = getArgValue('--base-url')
const timeoutMs = Number(getArgValue('--timeout-ms', '20000')) || 20000

const checks = []

function pushCheck(name, status, detail, meta = {}) {
  checks.push({ name, status, detail, ...meta })
}

function resolveNotes(versionValue) {
  const base = path.join(repoRoot, 'notes', `update_${versionValue}`)
  const sharedPath = `${base}.md`
  const zhPath = `${base}.zh.md`
  const enPath = `${base}.en.md`

  const shared = readTextIfExists(sharedPath)
  let zh = readTextIfExists(zhPath)
  let en = readTextIfExists(enPath)

  if (!zh && shared) zh = shared
  if (!en && shared) en = shared

  const zhLen = zh?.trim().length ?? 0
  const enLen = en?.trim().length ?? 0

  if (zhLen > 0 && enLen > 0) {
    pushCheck('notes', 'pass', 'Release notes zh/en are present and non-empty.', {
      files: {
        shared: fs.existsSync(sharedPath) ? sharedPath : null,
        zh: fs.existsSync(zhPath) ? zhPath : null,
        en: fs.existsSync(enPath) ? enPath : null
      },
      lengths: { zh: zhLen, en: enLen }
    })
    return
  }

  pushCheck('notes', 'fail', 'Release notes zh/en are missing or empty.', {
    files: {
      shared: fs.existsSync(sharedPath) ? sharedPath : null,
      zh: fs.existsSync(zhPath) ? zhPath : null,
      en: fs.existsSync(enPath) ? enPath : null
    },
    lengths: { zh: zhLen, en: enLen }
  })
}

function checkVersionBaseline(versionValue) {
  const rootPkgPath = path.join(repoRoot, 'package.json')
  const corePkgPath = path.join(repoRoot, 'apps', 'core-app', 'package.json')
  const rootVersion = readJson(rootPkgPath).version
  const coreVersion = readJson(corePkgPath).version
  const ok = rootVersion === versionValue && coreVersion === versionValue

  const mismatchStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'version-baseline',
    ok ? 'pass' : mismatchStatus,
    ok
      ? `Root/Core version match target ${versionValue}.`
      : `Root/Core version drift detected (target ${versionValue}).`,
    { rootVersion, coreVersion, targetVersion: versionValue }
  )
}

function checkRiskP0() {
  const riskPath = path.join(repoRoot, 'docs', 'plan-prd', '01-project', 'RISK-REGISTER-2026-02.md')
  const raw = fs.readFileSync(riskPath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const p0Rows = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|\s*-+/.test(trimmed)) continue
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map(item => item.trim())
    if (cells.length < 10) continue
    if (cells[1] !== 'P0') continue

    const riskId = cells[0]
    const status = cells[cells.length - 1]
    p0Rows.push({ riskId, status })
  }

  const blocking = p0Rows.filter((item) => {
    const status = normalizeStatus(item.status)
    return status === 'open' || status === 'in progress'
  })

  if (blocking.length === 0) {
    pushCheck('risk-p0', 'pass', 'No P0 risk is Open/In Progress.', { p0Rows })
    return
  }

  pushCheck('risk-p0', 'fail', 'P0 risk has blocking Open/In Progress items.', { blocking, p0Rows })
}

function checkManifest() {
  const manifestPath = manifestArg
    ? path.resolve(repoRoot, manifestArg)
    : path.join(repoRoot, 'release-assets', 'tuff-release-manifest.json')

  if (!fs.existsSync(manifestPath)) {
    const missingStatus = stage === 'gate-e' ? 'fail' : 'pending'
    pushCheck(
      'manifest',
      missingStatus,
      'Local manifest file not found. This is expected before release assets are downloaded.',
      { manifestPath }
    )
    return
  }

  const scriptPath = path.join(repoRoot, 'scripts', 'update-validate-release-manifest.mjs')
  try {
    const output = execFileSync('node', [scriptPath, '--manifest', manifestPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    pushCheck('manifest', 'pass', 'Manifest validation passed.', {
      manifestPath,
      output: output.trim()
    })
  } catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : ''
    const stderr = error?.stderr ? String(error.stderr) : ''
    pushCheck('manifest', 'fail', 'Manifest validation failed.', {
      manifestPath,
      output: `${stdout}\n${stderr}`.trim()
    })
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function checkRemoteRelease(baseUrlValue) {
  const baseUrl = normalizeBaseUrl(baseUrlValue)
  if (!baseUrl) {
    return
  }

  const releaseUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}?assets=true`
  let releasePayload
  try {
    const response = await fetchWithTimeout(releaseUrl)
    if (!response.ok) {
      pushCheck('remote-release', 'fail', `Failed to fetch remote release metadata (${response.status}).`, {
        url: releaseUrl,
        httpStatus: response.status
      })
      return
    }
    releasePayload = await response.json()
  } catch (error) {
    pushCheck('remote-release', 'fail', 'Failed to fetch remote release metadata.', {
      url: releaseUrl,
      error: error instanceof Error ? error.message : String(error)
    })
    return
  }

  const release = releasePayload?.release
  if (!release || typeof release !== 'object') {
    pushCheck('remote-release', 'fail', 'Remote release payload is missing `release` object.', {
      url: releaseUrl
    })
    return
  }

  pushCheck('remote-release', 'pass', 'Remote release metadata fetched.', {
    url: releaseUrl,
    tag: release.tag,
    version: release.version,
    channel: release.channel,
    releaseStatus: release.status
  })

  const notes = release.notes ?? {}
  const notesHtml = release.notesHtml ?? {}
  const notesValid =
    typeof notes.zh === 'string' &&
    notes.zh.trim().length > 0 &&
    typeof notes.en === 'string' &&
    notes.en.trim().length > 0
  const notesHtmlValid =
    typeof notesHtml.zh === 'string' &&
    notesHtml.zh.trim().length > 0 &&
    typeof notesHtml.en === 'string' &&
    notesHtml.en.trim().length > 0

  pushCheck(
    'remote-notes',
    notesValid && notesHtmlValid ? 'pass' : 'fail',
    notesValid && notesHtmlValid
      ? 'Remote notes/notesHtml both satisfy {zh,en} non-empty.'
      : 'Remote notes or notesHtml does not satisfy {zh,en} non-empty.',
    {
      notesKeys: Object.keys(notes || {}),
      notesHtmlKeys: Object.keys(notesHtml || {}),
      notesZhLen: typeof notes.zh === 'string' ? notes.zh.length : 0,
      notesEnLen: typeof notes.en === 'string' ? notes.en.length : 0,
      notesHtmlZhLen: typeof notesHtml.zh === 'string' ? notesHtml.zh.length : 0,
      notesHtmlEnLen: typeof notesHtml.en === 'string' ? notesHtml.en.length : 0
    }
  )

  const assets = Array.isArray(release.assets) ? release.assets : []
  pushCheck(
    'remote-assets-matrix',
    assets.length > 0 ? 'pass' : 'fail',
    assets.length > 0 ? 'Remote assets list is non-empty.' : 'Remote assets list is empty.',
    {
      count: assets.length,
      matrix: assets.map((item) => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename
      }))
    }
  )

  const hasManifest = assets.some((item) => item?.filename === 'tuff-release-manifest.json')
  const manifestMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-manifest-asset',
    hasManifest ? 'pass' : manifestMissingStatus,
    hasManifest
      ? 'Remote manifest asset exists.'
      : 'Remote manifest asset is missing (`tuff-release-manifest.json`).',
    { hasManifest, assetCount: assets.length }
  )

  const missingIntegrity = assets.filter((item) => !item?.sha256 || !item?.signatureUrl)
  const integrityMissingStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-asset-integrity',
    missingIntegrity.length === 0 ? 'pass' : integrityMissingStatus,
    missingIntegrity.length === 0
      ? 'Remote assets all contain sha256 and signatureUrl.'
      : 'Remote assets missing sha256 or signatureUrl.',
    {
      missing: missingIntegrity.map((item) => ({
        platform: item?.platform,
        arch: item?.arch,
        filename: item?.filename,
        hasSha256: Boolean(item?.sha256),
        hasSignatureUrl: Boolean(item?.signatureUrl)
      }))
    }
  )

  const matrixKeys = new Map()
  for (const item of assets) {
    const platform = typeof item?.platform === 'string' ? item.platform : ''
    const arch = typeof item?.arch === 'string' ? item.arch : ''
    if (!platform || !arch) continue
    matrixKeys.set(`${platform}/${arch}`, { platform, arch })
  }

  const signatureResults = []
  const downloadResults = []

  for (const pair of matrixKeys.values()) {
    const signatureUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/signature/${pair.platform}/${pair.arch}`
    const downloadUrl = `${baseUrl}/api/releases/${encodeURIComponent(tag)}/download/${pair.platform}/${pair.arch}`

    try {
      const signatureResp = await fetchWithTimeout(signatureUrl, { redirect: 'manual' })
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: signatureResp.status
      })
    } catch (error) {
      signatureResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      const downloadResp = await fetchWithTimeout(downloadUrl, { redirect: 'manual' })
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: downloadResp.status
      })
    } catch (error) {
      downloadResults.push({
        platform: pair.platform,
        arch: pair.arch,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const allSignatureOk = signatureResults.every((item) => item.status === 200)
  const signatureStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'remote-signature-endpoint',
    allSignatureOk ? 'pass' : signatureStatus,
    allSignatureOk
      ? 'Remote signature endpoint returns 200 for all matrix entries.'
      : 'Remote signature endpoint is not ready for all matrix entries.',
    { results: signatureResults }
  )

  const allDownloadOk = downloadResults.every((item) => [200, 302, 307, 308].includes(item.status))
  pushCheck(
    'remote-download-endpoint',
    allDownloadOk ? 'pass' : 'fail',
    allDownloadOk
      ? 'Remote download endpoint is available for all matrix entries.'
      : 'Remote download endpoint has unavailable entries.',
    { results: downloadResults }
  )

  const channel = typeof release.channel === 'string' && release.channel ? release.channel : 'RELEASE'
  const latestUrl = `${baseUrl}/api/releases/latest?channel=${encodeURIComponent(channel)}`
  try {
    const latestResp = await fetchWithTimeout(latestUrl)
    const latestPayload = await latestResp.json()
    const latestTag = latestPayload?.release?.tag
    const latestOk = latestResp.ok && latestTag === tag
    pushCheck(
      'remote-latest',
      latestOk ? 'pass' : 'warn',
      latestOk
        ? `Latest release for channel ${channel} matches ${tag}.`
        : `Latest release for channel ${channel} does not match ${tag}.`,
      { url: latestUrl, httpStatus: latestResp.status, latestTag, expectedTag: tag }
    )
  } catch (error) {
    pushCheck('remote-latest', 'warn', 'Failed to query remote latest release.', {
      url: latestUrl,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function main() {
  resolveNotes(version)
  checkVersionBaseline(version)
  checkRiskP0()
  checkManifest()
  if (baseUrlArg) {
    await checkRemoteRelease(baseUrlArg)
  }

  const failedChecks = checks.filter(item => item.status === 'fail')
  const result = failedChecks.length > 0 ? 'fail' : 'pass'

  const summary = {
    tag,
    version,
    stage,
    strict,
    baseUrl: baseUrlArg ? normalizeBaseUrl(baseUrlArg) : null,
    result,
    checks
  }

  console.log(JSON.stringify(summary, null, 2))

  if (strict && result === 'fail') {
    process.exit(1)
  }
}
await main()

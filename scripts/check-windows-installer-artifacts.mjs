#!/usr/bin/env node
/**
 * Asserts the Windows build produced the installer and updater metadata for the version
 * being released.
 *
 * Three things have to agree, and a mismatch in any of them ships a broken update channel:
 *   1. `tuff-<version>-setup.exe` exists in the dist tree.
 *   2. `latest.yml` (electron-updater's Windows feed) was generated.
 *   3. The `version:` field inside `latest.yml` equals the CoreApp manifest version.
 *
 * This was 109 lines of PowerShell inlined in build-and-release.yml. It referenced no GitHub
 * context at all -- pure filesystem assertions -- but living inside the workflow meant it could
 * only ever be exercised by pushing a tag and watching a Windows runner. Extracted here so the
 * logic is unit-testable via `--self-test` and runs on any platform.
 *
 * Diagnostics on failure are deliberately verbose: when this fires, the build already burned a
 * Windows runner, so the log has to explain what *was* produced, not just what was missing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join('apps', 'core-app', 'dist')
const MANIFEST = path.join('apps', 'core-app', 'package.json')

/** electron-updater writes the Windows feed under this exact name. */
const UPDATER_METADATA = 'latest.yml'

/**
 * Matches the `version: 1.2.3` line in the updater feed.
 *
 * A version is a run of non-space characters, so the value is captured with `\S` rather than a
 * lazy `.+?` between two `\s*` runs -- that shape lets the quantifiers trade the same whitespace
 * back and forth and backtrack polynomially on a hostile line.
 */
const METADATA_VERSION = /^version:[^\S\n]*(\S+)[^\S\n]*$/m

/**
 * Directories electron-builder fills with the *unpacked* application. The installer and the
 * updater feed both sit at the top of `dist`, so descending into these adds tens of thousands of
 * Electron-internal files to the failure diagnostics and buries the one line that matters.
 */
const UNPACKED_DIRS = /^(?:mac|linux|win)(?:-[a-z0-9]+)*$/i

/**
 * Walks a directory tree, returning files as `{ name, relativePath, size }`.
 * Returns `[]` for a missing directory so callers can distinguish "absent" from "empty"
 * themselves rather than crashing here.
 */
export function listFiles(dir, root = dir, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return found
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (UNPACKED_DIRS.test(entry.name))
        continue
      listFiles(full, root, found)
    }
    else {
      found.push({ name: entry.name, relativePath: path.relative(root, full), size: statSync(full).size })
    }
  }
  return found
}

/**
 * The whole contract, as a pure function over a file listing.
 *
 * `files` is the dist listing; `metadataText` is the contents of `latest.yml` (or `null` when it
 * was not produced). Returns `{ ok, errors, installer, metadataVersion }` -- `errors` collects
 * every distinct failure rather than stopping at the first, so one run reports the full picture.
 */
export function checkWindowsArtifacts({ files, expectedVersion, metadataText }) {
  const errors = []

  if (!expectedVersion)
    errors.push('CoreApp package version is missing from apps/core-app/package.json')

  const exeFiles = files.filter(file => file.name.toLowerCase().endsWith('.exe'))
  const expectedInstallerName = `tuff-${expectedVersion}-setup.exe`
  const installer = exeFiles.find(file => file.name === expectedInstallerName) ?? null

  if (files.length === 0)
    errors.push(`Dist directory is empty or absent: ${DIST}. The build may have failed silently.`)
  else if (exeFiles.length === 0)
    errors.push(`No .exe files were produced in ${DIST}.`)
  else if (!installer)
    errors.push(`Expected versioned installer not found: ${expectedInstallerName}`)

  let metadataVersion = null
  if (metadataText === null || metadataText === undefined) {
    errors.push('Windows updater metadata latest.yml was not generated.')
  }
  else {
    const match = METADATA_VERSION.exec(metadataText)
    if (!match) {
      errors.push('Windows updater metadata has no version field.')
    }
    else {
      metadataVersion = match[1]
      if (metadataVersion !== expectedVersion) {
        errors.push(
          `Windows updater version mismatch: expected ${expectedVersion}, got ${metadataVersion}`,
        )
      }
    }
  }

  return { ok: errors.length === 0, errors, installer, metadataVersion }
}

function describeProducedFiles(files) {
  if (files.length === 0)
    return ['  (dist tree is empty)']
  return files
    .slice(0, 20)
    .map(file => `  - ${file.relativePath} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
}

function selfTest() {
  let failures = 0
  const check = (label, condition) => {
    if (!condition) {
      console.error(`[self-test] FAIL ${label}`)
      failures += 1
    }
  }

  const goodFiles = [
    { name: 'tuff-2.4.14-setup.exe', relativePath: 'tuff-2.4.14-setup.exe', size: 90_000_000 },
    { name: 'latest.yml', relativePath: 'latest.yml', size: 300 },
  ]

  check(
    'accepts a matching installer and updater feed',
    checkWindowsArtifacts({
      files: goodFiles,
      expectedVersion: '2.4.14',
      metadataText: 'version: 2.4.14\npath: tuff-2.4.14-setup.exe\n',
    }).ok,
  )

  check(
    'rejects a prerelease feed that disagrees with the manifest',
    !checkWindowsArtifacts({
      files: goodFiles,
      expectedVersion: '2.4.14',
      metadataText: 'version: 2.4.13\n',
    }).ok,
  )

  check(
    'rejects a build that produced no updater feed at all',
    !checkWindowsArtifacts({
      files: goodFiles,
      expectedVersion: '2.4.14',
      metadataText: null,
    }).ok,
  )

  check(
    'rejects an unversioned installer that would ship under the wrong name',
    !checkWindowsArtifacts({
      files: [{ name: 'tuff-setup.exe', relativePath: 'tuff-setup.exe', size: 1 }],
      expectedVersion: '2.4.14',
      metadataText: 'version: 2.4.14\n',
    }).ok,
  )

  check(
    'rejects an empty dist tree',
    !checkWindowsArtifacts({ files: [], expectedVersion: '2.4.14', metadataText: null }).ok,
  )

  // A beta tag carries punctuation that a loose version compare would smooth over.
  check(
    'holds prerelease identifiers exactly',
    !checkWindowsArtifacts({
      files: [{
        name: 'tuff-2.4.14-beta.40-setup.exe',
        relativePath: 'tuff-2.4.14-beta.40-setup.exe',
        size: 1,
      }],
      expectedVersion: '2.4.14-beta.40',
      metadataText: 'version: 2.4.14-beta.4\n',
    }).ok,
  )

  if (failures === 0)
    console.log('[check-windows-installer-artifacts] self-test passed')
  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

const distRoot = path.join(ROOT, DIST)
const files = listFiles(distRoot)
const expectedVersion = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8')).version

const metadataFile = files.find(file => file.name === UPDATER_METADATA)
const metadataText = metadataFile
  ? readFileSync(path.join(distRoot, metadataFile.relativePath), 'utf8')
  : null

const result = checkWindowsArtifacts({ files, expectedVersion, metadataText })

if (!result.ok) {
  console.error('[check-windows-installer-artifacts] Windows release artifacts are not publishable:')
  for (const error of result.errors)
    console.error(`  - ${error}`)
  console.error('')
  console.error(`Files produced under ${DIST}:`)
  for (const line of describeProducedFiles(files))
    console.error(line)
  process.exit(1)
}

console.log(
  `[check-windows-installer-artifacts] ${result.installer.name} and ${UPDATER_METADATA} `
  + `both match CoreApp version ${expectedVersion}`,
)

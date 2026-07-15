#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getArgValue, hasFlag } from './lib/argv-utils.mjs'
import { publishPackages } from './package-publish.config.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const argv = process.argv
const filterValue = getArgValue(argv, '--filter')
const explicitTag = getArgValue(argv, '--tag')
const dryRun = hasFlag(argv, '--dry-run')
const skipBuild = hasFlag(argv, '--skip-build')
const skipTests = hasFlag(argv, '--skip-tests')
const skipGitCheck = hasFlag(argv, '--skip-git-check')
const sleepBuffer = new SharedArrayBuffer(4)
const sleepArray = new Int32Array(sleepBuffer)

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizePackagePath(packagePath) {
  return packagePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function run(command, options = {}) {
  execFileSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
    ...options,
  })
}

function runOutput(command, options = {}) {
  return execFileSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    ...options,
  }).trim()
}

function execPnpmSync(args, options) {
  return execFileSync('corepack', ['pnpm', ...args], options)
}

function sleep(ms) {
  Atomics.wait(sleepArray, 0, 0, ms)
}

function getPackageInfo() {
  if (!filterValue) {
    throw new Error('Missing --filter. Example: node scripts/publish-package.mjs --filter @talex-touch/tuffex')
  }

  const matched = publishPackages.filter((packageInfo) => {
    return packageInfo.name === filterValue
      || normalizePackagePath(packageInfo.path) === normalizePackagePath(filterValue)
  })

  if (matched.length !== 1) {
    throw new Error(`Expected exactly one publish package for --filter ${filterValue}, got ${matched.length}`)
  }

  return matched[0]
}

function ensureCleanGit() {
  if (skipGitCheck)
    return

  const status = runOutput('git status --porcelain')
  if (status) {
    throw new Error(`Working tree is not clean. Commit or stash changes before publishing.\n${status}`)
  }
}

function getDistTag(version) {
  if (explicitTag)
    return explicitTag
  return version.includes('-') ? 'next' : 'latest'
}

function npmVersionExists(packageName, version) {
  try {
    runOutput(`npm view "${packageName}@${version}" version`)
    return true
  }
  catch {
    return false
  }
}

function waitForPackage(packageName, timeoutAttempts = 12) {
  const packageInfo = publishPackages.find(item => item.name === packageName)
  if (!packageInfo) {
    throw new Error(`Cannot wait for unknown package ${packageName}`)
  }

  const manifest = readJson(path.join(repoRoot, packageInfo.path, 'package.json'))
  for (let attempt = 1; attempt <= timeoutAttempts; attempt += 1) {
    if (npmVersionExists(packageName, manifest.version)) {
      console.log(`[publish-package] ${packageName}@${manifest.version} is available on npm.`)
      return
    }
    if (attempt === timeoutAttempts)
      break
    console.log(`[publish-package] Waiting for ${packageName}@${manifest.version} (${attempt}/${timeoutAttempts})...`)
    sleep(10_000)
  }

  throw new Error(`${packageName}@${manifest.version} is not available on npm`)
}

function packPackage(packageInfo, tempRoot) {
  const destination = path.join(tempRoot, packageInfo.name.replace(/[@/]/g, '_'))
  fs.mkdirSync(destination, { recursive: true })
  const output = execPnpmSync(['pack', '--pack-destination', destination], {
    cwd: path.join(repoRoot, packageInfo.path),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const packedPath = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .find(line => line.endsWith('.tgz'))

  if (packedPath) {
    if (path.isAbsolute(packedPath))
      return packedPath

    const destinationPath = path.join(destination, packedPath)
    if (fs.existsSync(destinationPath))
      return destinationPath

    return path.join(repoRoot, packageInfo.path, packedPath)
  }

  const packedFiles = fs.readdirSync(destination)
    .filter(fileName => fileName.endsWith('.tgz'))
    .map(fileName => path.join(destination, fileName))

  if (packedFiles.length !== 1) {
    throw new Error(`Unable to locate packed tarball for ${packageInfo.name}`)
  }

  return packedFiles[0]
}

function verifyRegistryManifest(packageInfo, version) {
  const fields = ['dependencies', 'peerDependencies', 'optionalDependencies']
  for (const field of fields) {
    try {
      const value = runOutput(`npm view "${packageInfo.name}@${version}" ${field} --json`)
      if (/"(?:catalog|workspace|file|link):/.test(value)) {
        throw new Error(`Registry manifest still contains forbidden protocol in ${field}: ${value}`)
      }
    }
    catch (error) {
      if (String(error?.message || error).includes('Registry manifest still contains'))
        throw error
    }
  }
}

function main() {
  const packageInfo = getPackageInfo()
  const manifest = readJson(path.join(repoRoot, packageInfo.path, 'package.json'))
  const distTag = getDistTag(manifest.version)

  ensureCleanGit()

  if (!skipTests && packageInfo.testCommand)
    run(packageInfo.testCommand)
  for (const command of packageInfo.preBuildCommands ?? []) {
    if (!skipBuild)
      run(command)
  }
  if (!skipBuild && packageInfo.buildCommand)
    run(packageInfo.buildCommand)

  for (const packageName of packageInfo.waitForPackages ?? []) {
    waitForPackage(packageName)
  }

  run(`node scripts/validate-publish-manifests.mjs --filter "${packageInfo.name}" --pack`)

  if (npmVersionExists(packageInfo.name, manifest.version)) {
    console.log(`[publish-package] ${packageInfo.name}@${manifest.version} already exists on npm. Skipping publish.`)
    verifyRegistryManifest(packageInfo, manifest.version)
    return
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-publish-package-'))
  try {
    const tarballPath = packPackage(packageInfo, tempRoot)
    const access = packageInfo.access ?? 'public'
    const publishCommand = dryRun
      ? `npm publish "${tarballPath}" --access ${access} --tag "${distTag}" --dry-run`
      : `npm publish "${tarballPath}" --access ${access} --tag "${distTag}"`
    run(publishCommand)

    if (!dryRun) {
      verifyRegistryManifest(packageInfo, manifest.version)
    }
  }
  finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

try {
  main()
}
catch (error) {
  console.error('[publish-package] Failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
}

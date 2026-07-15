#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getArgValue, hasFlag } from './lib/argv-utils.mjs'
import {
  dependencyFieldPaths,
  ignoredPackages,
  packedForbiddenProtocols,
  publishPackages,
  sourceForbiddenProtocols,
} from './package-publish.config.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const argv = process.argv
const shouldPack = hasFlag(argv, '--pack')
const jsonOutput = hasFlag(argv, '--json')
const filterValue = getArgValue(argv, '--filter')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/')
}

function normalizePackagePath(packagePath) {
  return toPosixPath(packagePath).replace(/^\.\//, '').replace(/\/$/, '')
}

function matchesPattern(value, pattern) {
  const normalizedValue = normalizePackagePath(value)
  const normalizedPattern = normalizePackagePath(pattern)
  if (!normalizedPattern.includes('*')) {
    return normalizedValue === normalizedPattern
  }
  const escaped = normalizedPattern
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`).test(normalizedValue)
}

function isIgnoredPackage(packagePath) {
  return ignoredPackages.some(pattern => matchesPattern(packagePath, pattern))
}

function getByPath(target, fieldPath) {
  return fieldPath.split('.').reduce((current, key) => current?.[key], target)
}

function getDependencyEntries(manifest, fieldPath) {
  const value = getByPath(manifest, fieldPath)
  if (!value)
    return []

  if (Array.isArray(value)) {
    return value.map(dependencyName => ({ dependencyName, spec: dependencyName }))
  }

  if (typeof value !== 'object')
    return []

  return Object.entries(value).map(([dependencyName, spec]) => ({
    dependencyName,
    spec: String(spec),
  }))
}

function findForbiddenSpecIssues({ manifest, manifestPath, packageInfo, forbiddenProtocols, phase }) {
  const issues = []

  for (const fieldPath of dependencyFieldPaths) {
    const entries = getDependencyEntries(manifest, fieldPath)
    for (const { dependencyName, spec } of entries) {
      const matchedProtocol = forbiddenProtocols.find(protocol => spec.startsWith(protocol))
      if (!matchedProtocol)
        continue

      issues.push({
        package: packageInfo.name,
        packagePath: packageInfo.path,
        manifestPath,
        phase,
        field: fieldPath,
        dependency: dependencyName,
        value: spec,
        protocol: matchedProtocol,
        reason: `${matchedProtocol} cannot appear in ${phase} publish manifest`,
      })
    }
  }

  return issues
}

function getPublishPackageByFilter() {
  if (!filterValue)
    return publishPackages
  const filters = filterValue.split(',').map(item => item.trim()).filter(Boolean)
  return publishPackages.filter((packageInfo) => {
    return filters.some((filter) => {
      return packageInfo.name === filter || normalizePackagePath(packageInfo.path) === normalizePackagePath(filter)
    })
  })
}

function assertPublishConfig(packages) {
  const issues = []
  const names = new Set()
  const paths = new Set()

  for (const packageInfo of packages) {
    const normalizedPath = normalizePackagePath(packageInfo.path)
    const packageJsonPath = path.join(repoRoot, normalizedPath, 'package.json')

    if (names.has(packageInfo.name)) {
      issues.push({ package: packageInfo.name, packagePath: normalizedPath, reason: 'Duplicate publish package name' })
    }
    if (paths.has(normalizedPath)) {
      issues.push({ package: packageInfo.name, packagePath: normalizedPath, reason: 'Duplicate publish package path' })
    }
    names.add(packageInfo.name)
    paths.add(normalizedPath)

    if (isIgnoredPackage(normalizedPath)) {
      issues.push({ package: packageInfo.name, packagePath: normalizedPath, reason: 'Publish package is also listed in ignoredPackages' })
      continue
    }

    if (!fs.existsSync(packageJsonPath)) {
      issues.push({ package: packageInfo.name, packagePath: normalizedPath, reason: 'package.json not found' })
      continue
    }

    const manifest = readJson(packageJsonPath)
    if (manifest.name !== packageInfo.name) {
      issues.push({
        package: packageInfo.name,
        packagePath: normalizedPath,
        manifestPath: packageJsonPath,
        reason: `Configured name does not match manifest name ${manifest.name}`,
      })
    }
    if (manifest.private === true) {
      issues.push({
        package: packageInfo.name,
        packagePath: normalizedPath,
        manifestPath: packageJsonPath,
        reason: 'Publish package must not be private',
      })
    }
  }

  return issues
}

function getSourceIssues(packages) {
  return packages.flatMap((packageInfo) => {
    const manifestPath = path.join(repoRoot, packageInfo.path, 'package.json')
    const manifest = readJson(manifestPath)
    return findForbiddenSpecIssues({
      manifest,
      manifestPath,
      packageInfo,
      forbiddenProtocols: sourceForbiddenProtocols,
      phase: 'source',
    })
  })
}

function execPnpmSync(args, options) {
  return execFileSync('corepack', ['pnpm', ...args], options)
}

function runPack(packageInfo, tempRoot) {
  const packageDir = path.join(repoRoot, packageInfo.path)
  const destination = path.join(tempRoot, packageInfo.name.replace(/[@/]/g, '_'))
  fs.mkdirSync(destination, { recursive: true })

  const output = execPnpmSync(['pack', '--pack-destination', destination], {
    cwd: packageDir,
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

    return path.join(packageDir, packedPath)
  }

  const packedFiles = fs.readdirSync(destination)
    .filter(fileName => fileName.endsWith('.tgz'))
    .map(fileName => path.join(destination, fileName))

  if (packedFiles.length !== 1) {
    throw new Error(`Unable to locate packed tarball for ${packageInfo.name}`)
  }

  return packedFiles[0]
}

function readPackedManifest(packageInfo, tarballPath, tempRoot) {
  const extractDir = path.join(tempRoot, `${packageInfo.name.replace(/[@/]/g, '_')}-extract`)
  fs.mkdirSync(extractDir, { recursive: true })
  execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir, 'package/package.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const manifestPath = path.join(extractDir, 'package', 'package.json')
  return {
    manifestPath,
    manifest: readJson(manifestPath),
  }
}

function getPackedIssues(packages) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-publish-manifests-'))
  const packed = []
  const issues = []

  try {
    for (const packageInfo of packages) {
      const tarballPath = runPack(packageInfo, tempRoot)
      const { manifest, manifestPath } = readPackedManifest(packageInfo, tarballPath, tempRoot)
      packed.push({ package: packageInfo.name, tarballPath, manifestPath })
      issues.push(...findForbiddenSpecIssues({
        manifest,
        manifestPath,
        packageInfo,
        forbiddenProtocols: packedForbiddenProtocols,
        phase: 'packed',
      }))
    }
  }
  finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  return { issues, packed }
}

function printIssues(issues) {
  console.error('[publish-manifest] Validation failed:')
  for (const issue of issues) {
    console.error(`- package: ${issue.package}`)
    if (issue.packagePath)
      console.error(`  packagePath: ${issue.packagePath}`)
    if (issue.manifestPath)
      console.error(`  manifestPath: ${toPosixPath(path.relative(repoRoot, issue.manifestPath))}`)
    if (issue.phase)
      console.error(`  phase: ${issue.phase}`)
    if (issue.field)
      console.error(`  field: ${issue.field}`)
    if (issue.dependency)
      console.error(`  dependency: ${issue.dependency}`)
    if (issue.value)
      console.error(`  value: ${issue.value}`)
    console.error(`  reason: ${issue.reason}`)
  }
}

function main() {
  const packages = getPublishPackageByFilter()
  if (filterValue && packages.length === 0) {
    console.error(`[publish-manifest] No publish package matched --filter ${filterValue}`)
    process.exit(1)
  }

  const configIssues = assertPublishConfig(packages)
  const sourceIssues = configIssues.length > 0 ? [] : getSourceIssues(packages)
  const packedResult = shouldPack && configIssues.length === 0 && sourceIssues.length === 0
    ? getPackedIssues(packages)
    : { issues: [], packed: [] }
  const issues = [...configIssues, ...sourceIssues, ...packedResult.issues]

  const summary = {
    result: issues.length === 0 ? 'pass' : 'fail',
    mode: shouldPack ? 'source+pack' : 'source',
    checkedPackages: packages.map(packageInfo => packageInfo.name),
    packed: packedResult.packed.map(item => ({ package: item.package })),
    issues,
  }

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2))
  }
  else if (issues.length > 0) {
    printIssues(issues)
  }
  else {
    console.log(`[publish-manifest] Validation passed (${summary.mode}): ${summary.checkedPackages.join(', ')}`)
  }

  if (issues.length > 0) {
    process.exit(1)
  }
}

main()

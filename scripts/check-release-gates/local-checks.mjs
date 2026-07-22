import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath))
    return null
  return fs.readFileSync(filePath, 'utf8')
}

function checkNotes({ repoRoot, version, pushCheck }) {
  const base = path.join(repoRoot, 'notes', `update_${version}`)
  const sharedPath = `${base}.md`
  const zhPath = `${base}.zh.md`
  const enPath = `${base}.en.md`

  const shared = readTextIfExists(sharedPath)
  let zh = readTextIfExists(zhPath)
  let en = readTextIfExists(enPath)

  if (!zh && shared)
    zh = shared
  if (!en && shared)
    en = shared

  const zhLen = zh?.trim().length ?? 0
  const enLen = en?.trim().length ?? 0

  if (zhLen > 0 && enLen > 0) {
    pushCheck(
      'notes',
      'pass',
      'Release notes zh/en are present and non-empty.',
      {
        files: {
          shared: fs.existsSync(sharedPath) ? sharedPath : null,
          zh: fs.existsSync(zhPath) ? zhPath : null,
          en: fs.existsSync(enPath) ? enPath : null,
        },
        lengths: { zh: zhLen, en: enLen },
      },
    )
    return
  }

  pushCheck('notes', 'fail', 'Release notes zh/en are missing or empty.', {
    files: {
      shared: fs.existsSync(sharedPath) ? sharedPath : null,
      zh: fs.existsSync(zhPath) ? zhPath : null,
      en: fs.existsSync(enPath) ? enPath : null,
    },
    lengths: { zh: zhLen, en: enLen },
  })
}

function checkVersionBaseline({ repoRoot, version, stage, pushCheck }) {
  const rootPkgPath = path.join(repoRoot, 'package.json')
  const corePkgPath = path.join(repoRoot, 'apps', 'core-app', 'package.json')
  const rootVersion = readJson(rootPkgPath).version
  const coreVersion = readJson(corePkgPath).version
  const ok = rootVersion === version && coreVersion === version

  const mismatchStatus = stage === 'gate-e' ? 'fail' : 'warn'
  pushCheck(
    'version-baseline',
    ok ? 'pass' : mismatchStatus,
    ok
      ? `Root/Core version match target ${version}.`
      : `Root/Core version drift detected (target ${version}).`,
    { rootVersion, coreVersion, targetVersion: version },
  )
}

function checkManifest({ repoRoot, stage, manifestArg, pushCheck }) {
  const manifestPath = manifestArg
    ? path.resolve(repoRoot, manifestArg)
    : path.join(repoRoot, 'release-assets', 'tuff-release-manifest.json')

  if (!fs.existsSync(manifestPath)) {
    const missingStatus = stage === 'gate-e' ? 'fail' : 'pending'
    pushCheck(
      'manifest',
      missingStatus,
      'Local manifest file not found. This is expected before release assets are downloaded.',
      { manifestPath },
    )
    return
  }

  const scriptPath = path.join(
    repoRoot,
    'scripts',
    'update-validate-release-manifest.mjs',
  )
  try {
    const output = execFileSync(
      'node',
      [scriptPath, '--manifest', manifestPath],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    pushCheck('manifest', 'pass', 'Manifest validation passed.', {
      manifestPath,
      output: output.trim(),
    })
  }
  catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : ''
    const stderr = error?.stderr ? String(error.stderr) : ''
    pushCheck('manifest', 'fail', 'Manifest validation failed.', {
      manifestPath,
      output: `${stdout}\n${stderr}`.trim(),
    })
  }
}

function checkPublishManifestMode({
  repoRoot,
  pushCheck,
  name,
  args,
  passDetail,
  failDetail,
}) {
  const scriptPath = path.join(
    repoRoot,
    'scripts',
    'validate-publish-manifests.mjs',
  )
  try {
    const output = execFileSync('node', [scriptPath, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    pushCheck(name, 'pass', passDetail, {
      output: output.trim(),
    })
  }
  catch (error) {
    const stdout = error?.stdout ? String(error.stdout) : ''
    const stderr = error?.stderr ? String(error.stderr) : ''
    pushCheck(name, 'fail', failDetail, {
      output: `${stdout}\n${stderr}`.trim(),
    })
  }
}

function checkPublishManifests({ repoRoot, pushCheck }) {
  checkPublishManifestMode({
    repoRoot,
    pushCheck,
    name: 'publish-manifests',
    args: [],
    passDetail: 'Publish package source manifests are npm-compatible.',
    failDetail: 'Publish package source manifest validation failed.',
  })

  checkPublishManifestMode({
    repoRoot,
    pushCheck,
    name: 'publish-manifests-pack',
    args: ['--pack'],
    passDetail:
      'Publish package source and packed manifests are npm-compatible.',
    failDetail: 'Publish package packed manifest validation failed.',
  })
}

export function runLocalReleaseGateChecks({
  repoRoot,
  version,
  stage,
  manifestArg,
  pushCheck,
}) {
  if (stage !== 'gate-e')
    checkNotes({ repoRoot, version, pushCheck })
  checkVersionBaseline({ repoRoot, version, stage, pushCheck })
  checkManifest({ repoRoot, stage, manifestArg, pushCheck })
  checkPublishManifests({ repoRoot, pushCheck })
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from '../../../scripts/lib/argv-utils.mjs'

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return {
    exitCode: typeof result.status === 'number' ? result.status : 1,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
    error: result.error?.message ?? null
  }
}

function parseCodeSignDetails(output) {
  const authorities = []
  let teamIdentifier = null
  let signatureKind = null

  for (const line of output.split(/\r?\n/)) {
    const authorityMatch = line.match(/^Authority=(.+)$/)
    if (authorityMatch) authorities.push(authorityMatch[1].trim())

    const teamMatch = line.match(/^TeamIdentifier=(.+)$/)
    if (teamMatch) teamIdentifier = teamMatch[1].trim()

    const signatureMatch = line.match(/^Signature=(.+)$/)
    if (signatureMatch) signatureKind = signatureMatch[1].trim()
  }

  const developerIdAuthority = authorities.some((authority) =>
    authority.startsWith('Developer ID Application:')
  )
  const adHoc = signatureKind === 'adhoc' || authorities.length === 0 || !teamIdentifier

  return {
    authorities,
    teamIdentifier,
    signatureKind,
    developerIdAuthority,
    adHoc
  }
}

export async function verifyMacosReleaseSigning({ appBundle, outputPath, mode = 'developer-id' }) {
  if (process.platform !== 'darwin')
    throw new Error('macOS release signing verification must run on a macOS host')
  if (mode !== 'waived' && mode !== 'developer-id')
    throw new Error(`Unsupported macOS native signing mode: ${mode}`)

  const appPath = resolve(appBundle)
  const codesignVerify = run('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=4',
    appPath
  ])
  const codesignDetailsResult = run('/usr/bin/codesign', ['-dv', '--verbose=4', appPath])
  const details = parseCodeSignDetails(codesignDetailsResult.output)
  const gatekeeper = run('/usr/sbin/spctl', [
    '--assess',
    '--type',
    'execute',
    '--verbose=4',
    appPath
  ])
  const notarization = run('/usr/bin/xcrun', ['stapler', 'validate', appPath])

  const gatekeeperDisabled = /override=security disabled/i.test(gatekeeper.output)
  const checks = {
    codesign:
      codesignVerify.exitCode === 0 &&
      codesignDetailsResult.exitCode === 0 &&
      details.developerIdAuthority &&
      !details.adHoc,
    gatekeeper: gatekeeper.exitCode === 0 && !gatekeeperDisabled,
    notarization: notarization.exitCode === 0
  }
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  const evidence = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    appBundle: basename(appPath),
    mode,
    status: mode === 'waived' ? 'waived' : failures.length === 0 ? 'pass' : 'fail',
    policyReason: mode === 'waived' ? 'apple-developer-not-configured' : null,
    signingKind:
      details.developerIdAuthority && !details.adHoc ? 'developer-id' : 'ad-hoc-or-missing',
    teamIdentifier: details.teamIdentifier,
    authorities: details.authorities,
    checks,
    failures
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')

  if (mode === 'developer-id' && evidence.status !== 'pass') {
    throw new Error(`macOS release signing verification failed: ${failures.join(', ')}`)
  }

  return evidence
}

async function main() {
  const argv = process.argv.slice(2)
  const appBundle = getArgValue(argv, '--app-bundle')
  const mode = getArgValue(argv, '--mode', 'developer-id')
  const outputPath = resolve(getArgValue(argv, '--output', 'dist/release-signing-evidence.json'))
  if (!appBundle) {
    throw new Error(
      'Usage: node scripts/verify-macos-release-signing.mjs --mode <waived|developer-id> --app-bundle <path.app> [--output <json>]'
    )
  }

  const evidence = await verifyMacosReleaseSigning({
    appBundle,
    outputPath,
    mode
  })
  console.log(JSON.stringify(evidence, null, 2))
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (
  entryPath &&
  basename(process.argv[1]) === 'verify-macos-release-signing.mjs' &&
  import.meta.url === entryPath
) {
  main().catch((error) => {
    console.error(
      `[verify-macos-release-signing] ${error instanceof Error ? error.message : String(error)}`
    )
    process.exit(1)
  })
}

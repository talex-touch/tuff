#!/usr/bin/env node
import { basename } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function readGroup(env, keys) {
  const present = keys.filter(key => hasValue(env[key]))
  return {
    any: present.length > 0,
    complete: present.length === keys.length,
    missing: keys.filter(key => !hasValue(env[key])),
  }
}

function assertCompleteGroup(group, label) {
  if (group.any && !group.complete) {
    throw new Error(`Partial ${label} configuration; missing: ${group.missing.join(', ')}`)
  }
}

export function resolveMacosReleaseSigningMode(env = process.env) {
  const certificate = readGroup(env, ['CSC_LINK', 'CSC_KEY_PASSWORD'])
  const apiKey = readGroup(env, [
    'APPLE_API_KEY_CONTENT',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
  ])
  const appleId = readGroup(env, [
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ])

  assertCompleteGroup(certificate, 'Developer ID certificate')
  assertCompleteGroup(apiKey, 'Apple API key notarization')
  assertCompleteGroup(appleId, 'Apple ID notarization')

  const anyAppleConfiguration = certificate.any || apiKey.any || appleId.any
  if (!anyAppleConfiguration) {
    return {
      mode: 'waived',
      notarizationMethod: null,
      policyReason: 'apple-developer-not-configured',
    }
  }

  if (!certificate.complete) {
    throw new Error('Apple notarization credentials require CSC_LINK and CSC_KEY_PASSWORD')
  }
  if (!apiKey.complete && !appleId.complete) {
    throw new Error(
      'Developer ID certificate requires one complete Apple notarization credential set',
    )
  }

  return {
    mode: 'developer-id',
    notarizationMethod: apiKey.complete ? 'api-key' : 'apple-id',
    policyReason: null,
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const format = getArgValue(argv, '--format', 'json')
  const result = resolveMacosReleaseSigningMode()
  if (format === 'shell') {
    console.log(`${result.mode}\t${result.notarizationMethod ?? 'none'}`)
    return
  }
  if (format !== 'json')
    throw new Error(`Unsupported output format: ${format}`)
  console.log(JSON.stringify(result))
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (
  entryPath
  && basename(process.argv[1]) === 'resolve-macos-release-signing-mode.mjs'
  && import.meta.url === entryPath
) {
  main().catch((error) => {
    console.error(
      `[resolve-macos-release-signing-mode] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}

import process from 'node:process'
import { corePairKey, REQUIRED_CORE_PAIRS } from './release-artifacts.mjs'

export const UPDATE_DOWNGRADE_EVIDENCE_SCHEMA
  = 'tuff-update-downgrade-evidence/v1'
export const UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION = 1

const RESULTS = new Set(['pass', 'fail', 'blocked', 'static-only'])
const EXECUTION_MODES = new Set(['runtime', 'static-only'])
const NATIVE_TRUST = new Set([
  'pass',
  'not-applicable',
  'not-assessed',
  'waived:apple-developer-not-configured',
])

function canonicalize(value) {
  if (Array.isArray(value))
    return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    )
  }
  return value
}

export function serializeCanonicalUpdateDowngradeEvidence(payload) {
  return `${JSON.stringify(canonicalize(payload))}\n`
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function validateUpdateDowngradeEvidence(
  payload,
  { currentVersion, targetVersion, rollbackFromVersion } = {},
) {
  const issues = []
  const records = Array.isArray(payload?.evidence) ? payload.evidence : []
  const byPair = new Map()

  if (payload?.schema !== UPDATE_DOWNGRADE_EVIDENCE_SCHEMA)
    issues.push(`schema must be ${UPDATE_DOWNGRADE_EVIDENCE_SCHEMA}`)
  if (payload?.schemaVersion !== UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION) {
    issues.push(
      `schemaVersion must be ${UPDATE_DOWNGRADE_EVIDENCE_SCHEMA_VERSION}`,
    )
  }
  if (!Array.isArray(payload?.evidence))
    issues.push('evidence must be an array')

  for (const [index, record] of records.entries()) {
    const label = `evidence[${index}]`
    const platform = nonEmptyString(record?.platform)
    const arch = nonEmptyString(record?.arch)
    const pair = platform && arch ? corePairKey(platform, arch) : null
    const result = nonEmptyString(record?.result)
    const executionMode = nonEmptyString(record?.executionMode)
    const nativeTrust = nonEmptyString(record?.nativeTrust)

    for (const field of [
      'currentVersion',
      'targetVersion',
      'rollbackFromVersion',
    ]) {
      if (!nonEmptyString(record?.[field]))
        issues.push(`${label}.${field} is required`)
    }
    if (!pair)
      issues.push(`${label}.platform and ${label}.arch are required`)
    if (!RESULTS.has(result))
      issues.push(`${label}.result is invalid`)
    if (!EXECUTION_MODES.has(executionMode))
      issues.push(`${label}.executionMode is invalid`)
    if (!NATIVE_TRUST.has(nativeTrust))
      issues.push(`${label}.nativeTrust is invalid`)
    if (currentVersion && record?.currentVersion !== currentVersion)
      issues.push(`${label}.currentVersion must match ${currentVersion}`)
    if (targetVersion && record?.targetVersion !== targetVersion)
      issues.push(`${label}.targetVersion must match ${targetVersion}`)
    if (
      rollbackFromVersion
      && record?.rollbackFromVersion !== rollbackFromVersion
    ) {
      issues.push(
        `${label}.rollbackFromVersion must match ${rollbackFromVersion}`,
      )
    }
    if (pair && byPair.has(pair))
      issues.push(`${label} duplicates ${pair}`)
    if (pair)
      byPair.set(pair, record)

    if (executionMode === 'static-only' && result !== 'static-only')
      issues.push(`${label}.static-only evidence must have result static-only`)
    if (executionMode === 'runtime') {
      if (record?.hostPlatform !== platform || record?.hostArch !== arch) {
        issues.push(
          `${label}.runtime evidence must identify the matching execution host`,
        )
      }
      if (
        record?.hostPlatform !== process.platform
        || record?.hostArch !== process.arch
      ) {
        issues.push(`${label}.runtime evidence is not from this host`)
      }
      if (record?.packagedIsolatedProfile !== true) {
        issues.push(
          `${label}.runtime evidence requires packagedIsolatedProfile=true`,
        )
      }
      if (result !== 'pass')
        issues.push(`${label}.runtime evidence must have result pass`)
      if (nativeTrust !== 'pass')
        issues.push(`${label}.runtime evidence must have nativeTrust pass`)
    }
    if (pair !== 'darwin/arm64' && executionMode !== 'static-only') {
      issues.push(
        `${label}.${pair} must be static-only on this release acceptance host`,
      )
    }
    if (
      nativeTrust === 'waived:apple-developer-not-configured'
      && result === 'pass'
    ) {
      issues.push(`${label}.Apple Developer waiver cannot produce a pass`)
    }
  }

  for (const pair of REQUIRED_CORE_PAIRS) {
    if (!byPair.has(pair))
      issues.push(`evidence is missing required pair ${pair}`)
  }

  return {
    valid: issues.length === 0,
    issues,
    evidence: REQUIRED_CORE_PAIRS.map(pair => byPair.get(pair)).filter(
      Boolean,
    ),
    byPair,
  }
}

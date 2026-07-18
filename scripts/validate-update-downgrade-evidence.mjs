import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'
import {
  serializeCanonicalUpdateDowngradeEvidence,
  validateUpdateDowngradeEvidence,
} from './lib/update-downgrade-evidence.mjs'

export async function validateUpdateDowngradeEvidenceFile({
  evidencePath,
  currentVersion,
  targetVersion,
  rollbackFromVersion,
}) {
  const rawEvidence = await readFile(evidencePath, 'utf8')
  const payload = JSON.parse(rawEvidence)
  if (rawEvidence !== serializeCanonicalUpdateDowngradeEvidence(payload))
    throw new Error('Update downgrade evidence must use canonical JSON bytes')
  const result = validateUpdateDowngradeEvidence(payload, {
    currentVersion,
    targetVersion,
    rollbackFromVersion,
  })
  if (!result.valid) {
    throw new Error(
      `Invalid update downgrade evidence: ${result.issues.join('; ')}`,
    )
  }
  return result
}

async function main() {
  const argv = process.argv.slice(2)
  const evidencePath = getArgValue(argv, '--evidence')
  const currentVersion = getArgValue(argv, '--current-version')
  const targetVersion = getArgValue(argv, '--target-version')
  const rollbackFromVersion = getArgValue(argv, '--rollback-from-version')
  if (
    !evidencePath
    || !currentVersion
    || !targetVersion
    || !rollbackFromVersion
  ) {
    throw new Error(
      'Usage: node scripts/validate-update-downgrade-evidence.mjs --evidence <json> --current-version <version> --target-version <version> --rollback-from-version <version>',
    )
  }
  const result = await validateUpdateDowngradeEvidenceFile({
    evidencePath,
    currentVersion,
    targetVersion,
    rollbackFromVersion,
  })
  console.log(
    JSON.stringify(
      {
        schema: 'tuff-update-downgrade-evidence/v1',
        status: 'pass',
        pairs: result.evidence.map(item => ({
          platform: item.platform,
          arch: item.arch,
          result: item.result,
          executionMode: item.executionMode,
          nativeTrust: item.nativeTrust,
        })),
      },
      null,
      2,
    ),
  )
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (
  entryPath
  && basename(process.argv[1]) === 'validate-update-downgrade-evidence.mjs'
  && import.meta.url === entryPath
) {
  main().catch((error) => {
    console.error(
      `[validate-update-downgrade-evidence] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  serializeCanonicalPluginReleaseEvidence,
  verifyPluginReleaseEvidenceFile,
} from './lib/plugin-release-evidence.mjs'

function failureOutput(issues) {
  return {
    contractVersion: 'talex.plugin-release-evidence/v1',
    status: 'failed',
    issues: [...issues].sort((left, right) => left.localeCompare(right)),
  }
}

export async function runPluginReleaseEvidenceCli(argv = process.argv.slice(2)) {
  const manifestPath = argv.find(value => !value.startsWith('--'))
  const strict = argv.includes('--strict')
  const writeOutput = argv.includes('--write-output')
  if (!manifestPath || !strict) {
    throw new Error('Usage: node scripts/plugin-release-evidence.mjs <manifest.json> --strict [--write-output]')
  }

  let result = await verifyPluginReleaseEvidenceFile(manifestPath, {
    skipStrictOutput: writeOutput,
  })
  if (!result.valid || !result.summary) {
    console.error(serializeCanonicalPluginReleaseEvidence(failureOutput(result.issues)).trimEnd())
    return 1
  }

  if (writeOutput) {
    const reportDir = path.dirname(path.resolve(manifestPath))
    const strictOutputPath = path.resolve(reportDir, result.manifest.documents.strictOutputRef)
    const exitCodePath = path.resolve(reportDir, result.manifest.documents.exitCodeRef)
    for (const outputPath of [strictOutputPath, exitCodePath]) {
      const relative = path.relative(reportDir, outputPath)
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Strict output paths must stay inside the report directory')
      }
      await mkdir(path.dirname(outputPath), { recursive: true })
    }
    await writeFile(strictOutputPath, serializeCanonicalPluginReleaseEvidence(result.summary), 'utf8')
    await writeFile(exitCodePath, '0\n', 'utf8')
    result = await verifyPluginReleaseEvidenceFile(manifestPath)
    if (!result.valid || !result.summary) {
      console.error(serializeCanonicalPluginReleaseEvidence(failureOutput(result.issues)).trimEnd())
      return 1
    }
  }

  console.log(serializeCanonicalPluginReleaseEvidence(result.summary).trimEnd())
  return 0
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entryUrl && import.meta.url === entryUrl) {
  runPluginReleaseEvidenceCli()
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      console.error(`[plugin-release-evidence] ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    })
}

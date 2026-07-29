#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getArgValue } from './lib/argv-utils.mjs'
import {
  compareReleaseNotesVersions,
  inferReleaseNotesChannel,
  loadReleaseNotesContractConfig,
  resolveReleaseNotesEnforcement,
  validateReleaseNotesAtRepo,
} from './lib/release-notes-contract.mjs'

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function buildReleaseNotesCatalog({ repoRoot, currentVersion }) {
  const config = loadReleaseNotesContractConfig(repoRoot)
  const notesDir = path.join(repoRoot, 'notes')
  const versions = fs
    .readdirSync(notesDir)
    .map(fileName => /^update_(.+)\.zh\.md$/.exec(fileName)?.[1] ?? '')
    .filter(Boolean)
    .filter((version) => {
      const enforcement = resolveReleaseNotesEnforcement({ version, config })
      return enforcement.enforced && compareReleaseNotesVersions(version, currentVersion) <= 0
    })

  const currentEnforcement = resolveReleaseNotesEnforcement({
    version: currentVersion,
    config,
  })
  if (currentEnforcement.enforced && !versions.includes(currentVersion)) {
    throw new Error(`Current release notes are missing for ${currentVersion}.`)
  }

  const entries = versions.map((version) => {
    const { enforcement, validation } = validateReleaseNotesAtRepo({ repoRoot, version })
    if (!enforcement.enforced || !validation?.valid || !validation.documents) {
      const reasons = validation?.errors.map(error => error.code).join(', ') || 'missing-pair'
      throw new Error(`Invalid release notes for ${version}: ${reasons}`)
    }

    const entry = {
      version,
      tag: `v${version}`,
      channel: inferReleaseNotesChannel(version),
      summary: {
        zh: validation.documents.zh.summary,
        en: validation.documents.en.summary,
      },
    }
    if (version === currentVersion) {
      entry.currentNotes = {
        zh: validation.documents.zh.markdown,
        en: validation.documents.en.markdown,
      }
    }
    return entry
  })

  entries.sort((left, right) => compareReleaseNotesVersions(left.version, right.version))

  return {
    schemaVersion: 1,
    generatedForVersion: currentVersion,
    legacyThrough: config.legacyThrough,
    entries,
  }
}

function main() {
  const argv = process.argv.slice(2)
  const repoRoot = path.resolve(getArgValue(argv, '--repo-root', scriptRoot))
  const currentVersion = getArgValue(argv, '--current-version', readVersion(repoRoot))
  const outputPath = path.resolve(
    getArgValue(
      argv,
      '--output',
      path.join(repoRoot, 'apps', 'core-app', 'resources', 'release-notes', 'catalog.json'),
    ),
  )
  const catalog = buildReleaseNotesCatalog({ repoRoot, currentVersion })

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  process.stdout.write(`Generated release notes catalog: ${outputPath}\n`)
}

function readVersion(repoRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  if (typeof packageJson.version !== 'string' || !packageJson.version) {
    throw new Error('Root package version is missing.')
  }
  return packageJson.version
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (entryPath && import.meta.url === entryPath) {
  main()
}

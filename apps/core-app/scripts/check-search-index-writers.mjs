#!/usr/bin/env node
/**
 * Guards the single-writer contract for the search-index domain.
 *
 * #295 gave `files`, `file_extensions` and `keyword_mappings` exactly one writer: the
 * search-index worker. #331 confirmed that shipped and defaults on. Nothing enforces it.
 *
 * The contract has two legitimate shapes, and the difference is easy to miss by eye:
 *
 *   - `db/utils.ts` builds a drizzle statement and hands it to `runWrite`, which — when the
 *     split is enabled — compiles it to SQL and forwards it through `execWrite` to the worker.
 *     The `db` handle only *builds* the statement here; it never executes it.
 *   - `file-index-persistence-repository.ts` writes directly, which is correct because it runs
 *     inside the worker and *is* the sole writer.
 *
 * A third shape is the bug this catches: a new call site doing `await db.insert(schema.files)`
 * outside those two files. It would write the primary database while reads come from
 * search-index.db — the silent-divergence failure the split exists to prevent.
 *
 * Read-only. `--self-test` proves the detector fires on a synthetic violation, because a
 * scanner that silently matches nothing looks exactly like a clean repository.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const CORE_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(CORE_APP, 'src', 'main')

/** Tables the search-index worker owns. Schema identifiers, as written in drizzle calls. */
const OWNED_TABLES = ['files', 'fileExtensions', 'keywordMappings']

/**
 * Files allowed to contain a mutation against an owned table, and why.
 * Paths are relative to apps/core-app/src/main.
 */
const APPROVED_WRITERS = {
  'db/utils.ts':
    'Builds the statement only; runWrite forwards it to the worker via execWrite when the split is on.',
  'modules/box-tool/search-engine/file-index-persistence-repository.ts':
    'Runs inside the search-index worker and is the sole writer for this domain.',
  'modules/box-tool/search-engine/search-index-service.ts':
    'Dual-mode by construction: search-index-worker.ts holds the directMode instance that ' +
    'performs these writes, while search-core.ts constructs a second one with ' +
    "initializationMode: 'reader'. The mutations here only execute on the worker's instance."
}

const MUTATION = new RegExp(
  String.raw`\.\s*(?:insert|update|delete)\s*\(\s*schema\.(${OWNED_TABLES.join('|')})\s*\)`,
  'g'
)

function listSourceFiles() {
  const output = execFileSync('git', ['ls-files', 'src/main/**/*.ts'], {
    cwd: CORE_APP,
    encoding: 'utf8'
  })
  return output
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => file.replace(/^src\/main\//, ''))
}

export function findViolations(readFile, files, approved = APPROVED_WRITERS) {
  const violations = []
  for (const file of files) {
    if (file in approved) continue
    const text = readFile(file)
    if (!text) continue
    MUTATION.lastIndex = 0
    for (const match of text.matchAll(MUTATION)) {
      const line = text.slice(0, match.index).split('\n').length
      violations.push({ file, line, table: match[1], snippet: match[0].trim() })
    }
  }
  return violations
}

function readFromDisk(file) {
  try {
    return readFileSync(path.join(SRC, file), 'utf8')
  } catch {
    return null
  }
}

function selfTest() {
  const violation = 'await this.db.insert(schema.files).values(row)\n'
  const cases = [
    {
      name: 'a new writer outside the approved set is caught',
      files: ['modules/some/new-writer.ts'],
      read: () => violation,
      expectViolations: 1
    },
    {
      name: 'the same write inside an approved owner is allowed',
      files: ['db/utils.ts'],
      read: () => violation,
      expectViolations: 0
    },
    {
      name: 'a table outside the domain is not policed',
      files: ['modules/some/new-writer.ts'],
      read: () => 'await this.db.insert(schema.clipboardHistory).values(row)\n',
      expectViolations: 0
    }
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = findViolations(testCase.read, testCase.files)
    const ok = found.length === testCase.expectViolations
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok) {
      failures += 1
      console.log(`     expected ${testCase.expectViolations} violation(s), got ${found.length}`)
    }
  }

  const real = findViolations(readFromDisk, listSourceFiles())
  console.log(`${real.length === 0 ? 'ok  ' : 'FAIL'} the real tree is clean`)
  if (real.length > 0) {
    failures += 1
    for (const v of real) console.log(`     ${v.file}:${v.line} ${v.snippet}`)
  }
  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const violations = findViolations(readFromDisk, listSourceFiles())
if (violations.length > 0) {
  console.error('[search-index-writers] direct writes to worker-owned tables:\n')
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} writes ${v.table} via ${v.snippet}`)
  }
  console.error(
    '\nThese tables live in search-index.db and the worker is their only writer. Route the write' +
      '\nthrough SearchIndexWorkerClient, or through db/utils.ts so runWrite forwards it. Writing' +
      '\nthe primary database here diverges silently from where the reads come from.' +
      '\n\nIf a new file genuinely belongs to the worker, add it to APPROVED_WRITERS with the reason.'
  )
  process.exit(1)
}

console.log(
  `[search-index-writers] ${OWNED_TABLES.length} worker-owned tables have no writer outside ` +
    `${Object.keys(APPROVED_WRITERS).length} approved owners`
)

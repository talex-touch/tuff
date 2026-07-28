import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesRoot = path.join(repoRoot, 'scripts', 'docs', 'fixtures')

const HARNESS_CANDIDATES = [
  'scripts/docs/verifier.mjs',
  'scripts/docs/verify-docs.mjs',
  'scripts/docs/index.mjs',
]

const HARNESS_EXPORTS = [
  'scopeRegistry/checkMarkdownAndLinks/checkTasks/checkReleaseNotes/checkPlaceholders',
  'verifyDocumentationFixture',
  'verifyDocsFixture',
  'runDocumentationVerifier',
  'runDocsVerifier',
  'verifyDocumentation',
  'verifyDocs',
]

async function loadVerifierHarness() {
  const attempts = []

  for (const relativePath of HARNESS_CANDIDATES) {
    const absolutePath = path.join(repoRoot, relativePath)
    if (!fs.existsSync(absolutePath)) {
      attempts.push(`${relativePath}: missing`)
      continue
    }

    const module = await import(pathToFileURL(absolutePath).href)
    if (
      typeof module.scopeRegistry === 'function'
      && typeof module.checkMarkdownAndLinks === 'function'
      && typeof module.checkTasks === 'function'
      && typeof module.checkReleaseNotes === 'function'
      && typeof module.checkPlaceholders === 'function'
    ) {
      return {
        source: `${relativePath}#rule-exports`,
        run: ({ fixtureRoot, trackedFiles }) => {
          const scope = module.scopeRegistry(fixtureRoot, trackedFiles)
          const diagnostics = [
            ...module.checkMarkdownAndLinks(fixtureRoot, scope),
            ...module.checkTasks(fixtureRoot, scope),
            ...module.checkReleaseNotes(fixtureRoot),
            ...module.checkPlaceholders(fixtureRoot, scope),
          ].sort((a, b) =>
            a.ruleId.localeCompare(b.ruleId)
            || a.file.localeCompare(b.file)
            || a.line - b.line
            || a.column - b.column
            || a.message.localeCompare(b.message),
          )
          return { exitCode: diagnostics.length ? 1 : 0, diagnostics }
        },
      }
    }

    for (const exportName of HARNESS_EXPORTS) {
      if (typeof module[exportName] === 'function') {
        return { run: module[exportName], source: `${relativePath}#${exportName}` }
      }
    }
    attempts.push(`${relativePath}: no supported fixture verifier export`)
  }

  throw new Error(
    [
      'Canonical documentation verifier fixture harness is unavailable.',
      `Looked for: ${attempts.join('; ')}`,
      `Expected one of these function exports: ${HARNESS_EXPORTS.join(', ')}`,
    ].join(' '),
  )
}

function readFixture(name) {
  const fixtureRoot = path.join(fixturesRoot, name)
  const trackedFiles = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, 'tracked-files.json'), 'utf8'),
  )
  assert.deepEqual(
    trackedFiles,
    [...trackedFiles].sort(),
    `${name} tracked-files.json must stay sorted for deterministic tests`,
  )
  return { fixtureRoot, trackedFiles }
}

async function runFixture(name) {
  const { run } = await loadVerifierHarness()
  const fixture = readFixture(name)

  const result = await run({
    fixtureRoot: fixture.fixtureRoot,
    repoRoot: fixture.fixtureRoot,
    trackedFiles: fixture.trackedFiles,
    diagnosticLimit: 50,
  })

  return normalizeVerifierResult(result)
}

function normalizeVerifierResult(result) {
  if (typeof result === 'number')
    return { exitCode: result, diagnostics: [], stdout: '', stderr: '' }

  const exitCode = Number(
    result?.exitCode
    ?? result?.code
    ?? (result?.ok === true || result?.valid === true ? 0 : 1),
  )

  const diagnostics = Array.isArray(result?.diagnostics)
    ? result.diagnostics
    : Array.isArray(result?.errors)
      ? result.errors
      : []

  return {
    exitCode,
    diagnostics,
    stdout: String(result?.stdout ?? ''),
    stderr: String(result?.stderr ?? ''),
  }
}

function diagnosticRuleIds(result) {
  return result.diagnostics
    .map(diagnostic => diagnostic.ruleId ?? diagnostic.rule ?? diagnostic.code)
    .filter(Boolean)
}

function diagnosticPaths(result) {
  return result.diagnostics
    .map(diagnostic => diagnostic.path ?? diagnostic.file ?? diagnostic.sourcePath)
    .filter(Boolean)
}

function renderedOutput(result) {
  return [
    result.stdout,
    result.stderr,
    ...result.diagnostics.map(diagnostic => JSON.stringify(diagnostic)),
  ].join('\n')
}

describe('canonical documentation verifier fixtures', () => {
  it('accepts the aggregate valid fixture', async () => {
    const result = await runFixture('valid-aggregate')

    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.diagnostics, [])
  })

  it('keeps 2.4.13 release notes legacy-compatible', async () => {
    const result = await runFixture('release-notes-legacy-2.4.13')

    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.diagnostics, [])
  })

  it('fails post-baseline release-note drift with stable rule IDs and paths', async () => {
    const result = await runFixture('release-notes-post-baseline-invalid')

    assert.notEqual(result.exitCode, 0)

    const ruleIds = diagnosticRuleIds(result)
    assert.ok(ruleIds.length > 0, 'expected at least one diagnostic rule ID')
    assert.ok(
      ruleIds.every(ruleId => /^[A-Z][A-Z0-9.-]*$/i.test(ruleId)),
      `expected stable rule IDs, got: ${ruleIds.join(', ')}`,
    )
    assert.ok(
      ruleIds.some(ruleId => /RELEASE|release.*note|note.*release/.test(ruleId)),
      `expected a release-note diagnostic rule ID, got: ${ruleIds.join(', ')}`,
    )

    const paths = diagnosticPaths(result)
    assert.ok(
      paths.includes('notes/update_2.4.14.en.md'),
      `expected the invalid English release-note path in diagnostics, got: ${paths.join(', ')}`,
    )
  })

  it('renders identical diagnostics on repeated fixture runs', async () => {
    const first = await runFixture('release-notes-post-baseline-invalid')
    const second = await runFixture('release-notes-post-baseline-invalid')

    assert.equal(first.exitCode, second.exitCode)
    assert.equal(renderedOutput(first), renderedOutput(second))
  })
})

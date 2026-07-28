import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
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
        run: ({ fixtureRoot, trackedFiles, skipAiDocs = false }) => {
          const scope = module.scopeRegistry(fixtureRoot, trackedFiles)
          const diagnostics = [
            ...module.checkMarkdownAndLinks(fixtureRoot, scope),
            ...module.checkTasks(fixtureRoot, scope),
            ...module.checkReleaseNotes(fixtureRoot, scope),
            ...(typeof module.checkAiDocs === 'function' ? module.checkAiDocs(fixtureRoot, scope, { skipAiDocs }) : []),
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

function readFixtureCase(name) {
  return JSON.parse(
    fs.readFileSync(path.join(fixturesRoot, 'cases', `${name}.json`), 'utf8'),
  )
}

function materializeFixtureCase(name, seen = new Set()) {
  assert.ok(!seen.has(name), `fixture case inheritance cycle at ${name}`)
  seen.add(name)

  const fixtureCase = readFixtureCase(name)
  let fixtureRoot
  let tracked
  let inheritedOptions = {}

  if (fixtureCase.caseBase) {
    const inherited = materializeFixtureCase(fixtureCase.caseBase, seen)
    fixtureRoot = inherited.fixtureRoot
    tracked = new Set(inherited.trackedFiles)
    inheritedOptions = inherited
  }
  else {
    const base = readFixture(fixtureCase.base ?? 'valid-aggregate')
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `docs-fixture-${name}-`))
    fs.cpSync(base.fixtureRoot, fixtureRoot, { recursive: true })
    tracked = new Set(base.trackedFiles)
  }

  for (const file of fixtureCase.trackedRemove ?? []) tracked.delete(file)

  for (const [file, content] of Object.entries(fixtureCase.files ?? {})) {
    const absolutePath = path.join(fixtureRoot, file)
    if (content === null) {
      fs.rmSync(absolutePath, { force: true })
      tracked.delete(file)
      continue
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content)
    tracked.add(file)
  }

  for (const file of fixtureCase.trackedAdd ?? []) tracked.add(file)

  const trackedFiles = [...tracked].sort()
  fs.writeFileSync(
    path.join(fixtureRoot, 'tracked-files.json'),
    `${JSON.stringify(trackedFiles, null, 2)}\n`,
  )

  return {
    fixtureRoot,
    trackedFiles,
    skipAiDocs: fixtureCase.skipAiDocs ?? inheritedOptions.skipAiDocs ?? false,
  }
}

async function runFixture(name) {
  const { run } = await loadVerifierHarness()
  const fixture = readFixture(name)

  const result = await run({
    fixtureRoot: fixture.fixtureRoot,
    repoRoot: fixture.fixtureRoot,
    trackedFiles: fixture.trackedFiles,
    skipAiDocs: fixture.skipAiDocs === true,
    diagnosticLimit: 50,
  })

  return normalizeVerifierResult(result)
}

async function runMaterializedFixture(fixture) {
  const { run } = await loadVerifierHarness()

  const result = await run({
    fixtureRoot: fixture.fixtureRoot,
    repoRoot: fixture.fixtureRoot,
    trackedFiles: fixture.trackedFiles,
    skipAiDocs: fixture.skipAiDocs === true,
    diagnosticLimit: 50,
  })

  return normalizeVerifierResult(result)
}

async function runFixtureCase(name) {
  const fixture = materializeFixtureCase(name)
  try {
    return await runMaterializedFixture(fixture)
  }
  finally {
    fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true })
  }
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

function assertDiagnosticShape(result) {
  assert.equal(typeof result.exitCode, 'number')
  assert.ok(Array.isArray(result.diagnostics))
  for (const diagnostic of result.diagnostics) {
    assert.equal(typeof diagnostic.ruleId, 'string')
    assert.equal(typeof diagnostic.file, 'string')
    assert.equal(typeof diagnostic.line, 'number')
    assert.equal(typeof diagnostic.column, 'number')
    assert.equal(typeof diagnostic.message, 'string')
  }
}

function diagnosticPaths(result) {
  return result.diagnostics
    .map(diagnostic => diagnostic.path ?? diagnostic.file ?? diagnostic.sourcePath)
    .filter(Boolean)
}

function diagnosticMessages(result) {
  return result.diagnostics
    .map(diagnostic => diagnostic.message ?? '')
    .filter(Boolean)
}

function diagnosticSortKey(diagnostic) {
  return [
    diagnostic.ruleId ?? diagnostic.rule ?? diagnostic.code ?? '',
    diagnostic.file ?? diagnostic.path ?? diagnostic.sourcePath ?? '',
    diagnostic.line ?? 0,
    diagnostic.column ?? 0,
    diagnostic.message ?? '',
  ]
}

function snapshotFixtureFiles(name) {
  const { fixtureRoot } = readFixture(name)
  const files = {}
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
        continue
      }
      const relativePath = path.relative(fixtureRoot, absolutePath).split(path.sep).join('/')
      files[relativePath] = fs.readFileSync(absolutePath, 'utf8')
    }
  }
  walk(fixtureRoot)
  return files
}

function renderedOutput(result) {
  return [
    result.stdout,
    result.stderr,
    ...result.diagnostics.map(diagnostic => JSON.stringify(diagnostic)),
  ].join('\n')
}

async function loadVerifierModule() {
  return import(pathToFileURL(path.join(repoRoot, 'scripts/docs/verify-docs.mjs')).href)
}

describe('canonical documentation verifier fixtures', () => {
  it('accepts the aggregate valid fixture', async () => {
    const result = await runFixtureCase('valid-final-contract')

    assertDiagnosticShape(result)
    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.diagnostics, [])
  })

  it('keeps 2.4.13 release notes legacy-compatible', async () => {
    const result = await runFixtureCase('release-notes-legacy-final-contract')

    assertDiagnosticShape(result)
    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.diagnostics, [])
  })

  it('fails post-baseline release-note drift with stable rule IDs and paths', async () => {
    const result = await runFixture('release-notes-post-baseline-invalid')

    assert.notEqual(result.exitCode, 0)
    assertDiagnosticShape(result)

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

  const passingCases = [
    {
      name: 'ai-fixture-opt-out',
      absentRuleIds: ['DOC-AI-CONTRACT'],
      absentMessages: ['historical 13/13 visible AI snapshot'],
    },
    {
      name: 'url-raw-query-fragment-encoded-hash',
      absentRuleIds: ['DOC-LINK-UNTRACKED', 'DOC-LINK-INVALID'],
      absentPaths: ['docs/url-edges.md'],
    },
  ]

  for (const fixtureCase of passingCases) {
    it(`accepts ${fixtureCase.name}`, async () => {
      const result = await runFixtureCase(fixtureCase.name)

      assertDiagnosticShape(result)
      assert.equal(result.exitCode, 0)

      const ruleIds = diagnosticRuleIds(result)
      const paths = diagnosticPaths(result)
      const messages = diagnosticMessages(result).join('\n')
      const problems = []
      for (const ruleId of fixtureCase.absentRuleIds ?? []) {
        if (ruleIds.includes(ruleId))
          problems.push(`unexpected rule ${ruleId}; got ${ruleIds.join(', ')}`)
      }
      for (const absentPath of fixtureCase.absentPaths ?? []) {
        if (paths.includes(absentPath))
          problems.push(`unexpected path ${absentPath}; got ${paths.join(', ')}`)
      }
      for (const absentMessage of fixtureCase.absentMessages ?? []) {
        if (messages.includes(absentMessage))
          problems.push(`unexpected message ${absentMessage}; got ${messages}`)
      }
      assert.deepEqual(problems, [])
    })
  }

  const failingCases = [
    {
      name: 'markdown-link-edges-and-scope-poison',
      ruleIds: ['DOC-LINK-INVALID', 'DOC-LINK-UNTRACKED'],
      paths: ['docs/INDEX.md', 'docs/link-edge.mdc'],
      absentPaths: [
        '.github/poison.md',
        '.trellis/internal/poison.md',
        'AGENTS.md',
        'apps/nexus/examples/poison.md',
        'coverage/poison.md',
        'dist/poison.md',
        'docs/engineering/reports/poison.md',
        'generated/poison.md',
        'node_modules/poison.md',
      ],
    },
    {
      name: 'markdownlint-integrity-nul-byte',
      ruleIds: ['DOC-MARKDOWN-MD900'],
      paths: ['docs/nul-byte.md', 'docs/nul-byte.mdc'],
      absentPaths: [
        '.github/nul-poison.md',
        '.trellis/internal/nul-poison.md',
        'AGENTS.md',
        'coverage/nul-poison.md',
        'dist/nul-poison.md',
        'docs/engineering/reports/nul-poison.md',
        'generated/nul-poison.md',
        'node_modules/nul-poison.md',
      ],
      messages: ['Markdown must not contain NUL bytes'],
    },
    {
      name: 'rooted-artifact-exclusions-preserve-docs-build',
      ruleIds: ['DOC-MARKDOWN-MD900'],
      paths: ['docs/reference/build/nul-byte.md'],
      absentPaths: [
        'build/nul-poison.md',
        'dist/nul-poison.md',
      ],
      messages: ['Markdown must not contain NUL bytes'],
    },
    {
      name: 'trellis-archive-layout-final-identity-completion-graph',
      ruleIds: [
        'DOC-TASK-ARCHIVE-META',
        'DOC-TASK-ARCHIVE-NONCOMPLETED',
        'DOC-TASK-GRAPH',
        'DOC-TASK-IDENTITY',
      ],
      paths: [
        '.trellis/tasks/archive/2026-07/final-child/task.json',
        '.trellis/tasks/archive/2026-07/final-layout/task.json',
        '.trellis/tasks/archive/2026-07/final-parent/task.json',
      ],
      messages: [
        'archived task must be completed',
        'archived task requires non-empty assignee and completedAt',
        'task id must equal path identity final-child',
        'child 07-28-final-child does not point to final-parent',
      ],
    },
    {
      name: 'trellis-malformed-task-roots-types',
      ruleIds: ['DOC-TASK-TYPE'],
      paths: [
        '.trellis/tasks/array-root/task.json',
        '.trellis/tasks/bad-status-parent-types/task.json',
        '.trellis/tasks/null-root/task.json',
        '.trellis/tasks/scalar-root/task.json',
      ],
      messages: [
        'task JSON root must be an object',
        'status must be one of completed, in_progress, planning, review',
        'parent has an invalid type',
      ],
    },
    {
      name: 'prd-empty-sections-excluding-code',
      ruleIds: ['DOC-PRD-EMPTY-SECTION'],
      paths: ['.trellis/tasks/active-doc-task/prd.md'],
      absentMessages: ['Code Fence Empty Section'],
      messages: ['required template section has no substantive content'],
    },
    {
      name: 'trellis-graph-meta-archive-todo',
      ruleIds: [
        'DOC-TASK-ACTIVE-COMPLETED',
        'DOC-TASK-ARCHIVE-META',
        'DOC-TASK-DUPLICATE-ID',
        'DOC-TASK-GRAPH',
        'DOC-TASK-JSON',
        'DOC-TASK-META',
        'DOC-TODO-TASK-REFERENCE',
      ],
      paths: [
        '.trellis/tasks/archive/2026-07/incomplete-task/task.json',
        '.trellis/tasks/active-doc-task/task.json',
        '.trellis/tasks/completed-active/task.json',
        '.trellis/tasks/invalid-json/task.json',
        '.trellis/tasks/parent/task.json',
        'docs/plan-prd/TODO.md',
      ],
    },
    {
      name: 'release-version-mismatch',
      ruleIds: ['DOC-RELEASE-VERSION'],
      paths: ['package.json'],
    },
    {
      name: 'ai-promotion-current-evidence',
      ruleIds: ['DOC-AI-CONTRACT'],
      paths: [
        'docs/plan-prd/03-features/ai-2.5.0-plan-prd.md',
      ],
      absentMessages: ['missing '],
    },
    {
      name: 'prd-placeholders-and-allowlist',
      ruleIds: ['DOC-PRD-PLACEHOLDER'],
      paths: [
        '.trellis/tasks/active-doc-task/prd.md',
        '.trellis/tasks/07-27-documentation-quality-gates/prd.md',
      ],
      messages: ['TBD', 'TODO: fill', '<evidence>', 'required template section has no substantive content'],
    },
  ]

  for (const fixtureCase of failingCases) {
    it(`fails ${fixtureCase.name} with stable rule IDs and paths`, async () => {
      const result = await runFixtureCase(fixtureCase.name)

      assert.notEqual(result.exitCode, 0)
      assertDiagnosticShape(result)

      const ruleIds = diagnosticRuleIds(result)
      const paths = diagnosticPaths(result)
      const messages = diagnosticMessages(result).join('\n')
      const problems = []
      for (const ruleId of fixtureCase.ruleIds) {
        if (!ruleIds.includes(ruleId))
          problems.push(`missing rule ${ruleId}; got ${ruleIds.join(', ')}`)
      }

      for (const expectedPath of fixtureCase.paths) {
        if (!paths.includes(expectedPath))
          problems.push(`missing path ${expectedPath}; got ${paths.join(', ')}`)
      }

      for (const excludedPath of fixtureCase.absentPaths ?? []) {
        if (paths.includes(excludedPath))
          problems.push(`unexpected excluded poison path ${excludedPath}; got ${paths.join(', ')}`)
      }

      for (const expectedMessage of fixtureCase.messages ?? []) {
        if (!messages.includes(expectedMessage))
          problems.push(`missing message ${expectedMessage}; got ${messages}`)
      }

      for (const absentMessage of fixtureCase.absentMessages ?? []) {
        if (messages.includes(absentMessage))
          problems.push(`unexpected message ${absentMessage}; got ${messages}`)
      }

      assert.deepEqual(problems, [])
    })
  }

  it('sorts diagnostics deterministically and renders capped totals', async () => {
    const fixture = materializeFixtureCase('markdown-link-edges-and-scope-poison')
    try {
      const result = await runMaterializedFixture(fixture)
      const keys = result.diagnostics.map(diagnosticSortKey)
      assert.deepEqual(keys, [...keys].sort((a, b) => {
        for (let index = 0; index < a.length; index += 1) {
          const left = a[index]
          const right = b[index]
          if (typeof left === 'number' && typeof right === 'number') {
            if (left !== right)
              return left - right
            continue
          }
          const comparison = String(left).localeCompare(String(right))
          if (comparison !== 0)
            return comparison
        }
        return 0
      }))

      const { renderDiagnostics } = await loadVerifierModule()
      const output = renderDiagnostics(result.diagnostics, 2)
      assert.match(output, /docs:verify failed: shown 2\/\d+; totals /)
      for (const ruleId of new Set(diagnosticRuleIds(result))) {
        const expectedTotal = result.diagnostics.filter(diagnostic => diagnostic.ruleId === ruleId).length
        assert.match(output, new RegExp(`${ruleId}=${expectedTotal}(?:,|\\n)`))
      }
      assert.equal(output.split('\n').filter(Boolean).length, 3)
    }
    finally {
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true })
    }
  })

  it('leaves source fixtures read-only and produces byte-identical repeated output', async () => {
    const before = snapshotFixtureFiles('valid-aggregate')
    const first = await runFixtureCase('valid-final-contract')
    const second = await runFixtureCase('valid-final-contract')
    const after = snapshotFixtureFiles('valid-aggregate')

    assert.deepEqual(after, before)
    assert.equal(first.exitCode, second.exitCode)
    assert.equal(renderedOutput(first), renderedOutput(second))
  })

  it('renders diagnostics with per-rule totals and round-robin caps', async () => {
    const { renderDiagnostics } = await loadVerifierModule()
    const diagnostics = [
      { ruleId: 'DOC-ZETA', file: 'docs/zeta-1.md', line: 1, column: 1, message: 'zeta 1' },
      { ruleId: 'DOC-ALPHA', file: 'docs/alpha-2.md', line: 1, column: 1, message: 'alpha 2' },
      { ruleId: 'DOC-BETA', file: 'docs/beta-1.md', line: 1, column: 1, message: 'beta 1' },
      { ruleId: 'DOC-ALPHA', file: 'docs/alpha-1.md', line: 1, column: 1, message: 'alpha 1' },
      { ruleId: 'DOC-ZETA', file: 'docs/zeta-2.md', line: 1, column: 1, message: 'zeta 2' },
      { ruleId: 'DOC-BETA', file: 'docs/beta-2.md', line: 1, column: 1, message: 'beta 2' },
      { ruleId: 'DOC-ZETA', file: 'docs/zeta-3.md', line: 1, column: 1, message: 'zeta 3' },
    ]

    const output = renderDiagnostics(diagnostics, 5)
    const lines = output.split('\n').filter(Boolean)

    assert.deepEqual(
      lines.slice(0, 5).map(line => line.split(' ', 1)[0]),
      ['DOC-ALPHA', 'DOC-BETA', 'DOC-ZETA', 'DOC-ALPHA', 'DOC-BETA'],
    )
    assert.equal(lines[5], 'docs:verify failed: shown 5/7; totals DOC-ALPHA=2, DOC-BETA=2, DOC-ZETA=3')
  })

  it('exports no production PRD placeholder self-allowlist entries', async () => {
    const { PLACEHOLDER_ALLOWLIST = [] } = await loadVerifierModule()

    assert.deepEqual(
      PLACEHOLDER_ALLOWLIST
        .filter(entry => /^\.trellis\/tasks\/[^/]+\/prd\.md$/.test(entry.path ?? ''))
        .map(entry => entry.path)
        .sort(),
      [],
    )
  })

  it('rejects stale, broad, and unjustified placeholder allowlist shapes', async () => {
    const { PLACEHOLDER_ALLOWLIST = [] } = await loadVerifierModule()
    const fixture = materializeFixtureCase('valid-final-contract')
    try {
      const tracked = new Set(fixture.trackedFiles)
      const invalidAllowlistCases = [
        {
          name: 'stale path',
          invalid: entry => typeof entry.path === 'string' && !tracked.has(entry.path),
        },
        {
          name: 'broad path',
          invalid: entry => typeof entry.path !== 'string' || entry.path.includes('*') || !/^\.trellis\/tasks\/[^/]+\/prd\.md$/.test(entry.path),
        },
        {
          name: 'missing rationale',
          invalid: entry => typeof entry.rationale !== 'string' || entry.rationale.trim() === '',
        },
      ]

      for (const fixtureCase of invalidAllowlistCases) {
        assert.deepEqual(
          PLACEHOLDER_ALLOWLIST.filter(fixtureCase.invalid),
          [],
          `${fixtureCase.name} placeholder allowlist entries must be rejected`,
        )
      }
    }
    finally {
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true })
    }
  })
})

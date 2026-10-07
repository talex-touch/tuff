import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { checkMarkdownAndLinks, renderDiagnostics, repositoryFiles, scopeRegistry, verifyDocs } from './docs/verify-docs.mjs'
import { parseRetiredTaskIndex } from './lib/retired-task-index.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesRoot = path.join(repoRoot, 'scripts', 'docs', 'fixtures')

const REGISTRY = 'docs/engineering/workflow/retired-task-index.json'
const HANDOFF = 'docs/engineering/workflow/handoffs/07-27-documentation-quality-gates/README.md'

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

  // Removing a path from the declared file set leaves the file on disk: the verifier must judge the
  // repository's file set, not whatever happens to be lying in the directory.
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

/** The CLI's own composition, with the fixture's declared list standing in for git. */
function verify({ fixtureRoot, trackedFiles, skipAiDocs = false }) {
  const diagnostics = verifyDocs(fixtureRoot, { files: trackedFiles, skipAiDocs })
  return { exitCode: diagnostics.length ? 1 : 0, diagnostics }
}

function runFixture(name) {
  return verify(readFixture(name))
}

function runFixtureCase(name) {
  const fixture = materializeFixtureCase(name)
  try {
    return verify(fixture)
  }
  finally {
    fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true })
  }
}

function diagnosticRuleIds(result) {
  return result.diagnostics.map(diagnostic => diagnostic.ruleId)
}

function diagnosticPaths(result) {
  return result.diagnostics.map(diagnostic => diagnostic.file)
}

function diagnosticMessages(result) {
  return result.diagnostics.map(diagnostic => diagnostic.message)
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

function diagnosticSortKey(diagnostic) {
  return [diagnostic.ruleId, diagnostic.file, diagnostic.line, diagnostic.column, diagnostic.message]
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
  return result.diagnostics.map(diagnostic => JSON.stringify(diagnostic)).join('\n')
}

function caseProblems(result, fixtureCase) {
  const ruleIds = diagnosticRuleIds(result)
  const paths = diagnosticPaths(result)
  const messages = diagnosticMessages(result).join('\n')
  const problems = []
  for (const ruleId of fixtureCase.ruleIds ?? []) {
    if (!ruleIds.includes(ruleId))
      problems.push(`missing rule ${ruleId}; got ${ruleIds.join(', ')}`)
  }
  for (const ruleId of fixtureCase.absentRuleIds ?? []) {
    if (ruleIds.includes(ruleId))
      problems.push(`unexpected rule ${ruleId}; got ${ruleIds.join(', ')}`)
  }
  for (const expectedPath of fixtureCase.paths ?? []) {
    if (!paths.includes(expectedPath))
      problems.push(`missing path ${expectedPath}; got ${paths.join(', ')}`)
  }
  for (const absentPath of fixtureCase.absentPaths ?? []) {
    if (paths.includes(absentPath))
      problems.push(`unexpected path ${absentPath}; got ${paths.join(', ')}`)
  }
  for (const expectedMessage of fixtureCase.messages ?? []) {
    if (!messages.includes(expectedMessage))
      problems.push(`missing message ${expectedMessage}; got ${messages}`)
  }
  for (const absentMessage of fixtureCase.absentMessages ?? []) {
    if (messages.includes(absentMessage))
      problems.push(`unexpected message ${absentMessage}; got ${messages}`)
  }
  return problems
}

describe('canonical documentation verifier fixtures', () => {
  it('accepts the aggregate valid fixture', () => {
    // The registry's sourcePaths name task files that do not exist in the fixture: provenance is
    // recorded, not required. The handoff holds genuine unresolved planning text as preserved history.
    const result = runFixtureCase('valid-final-contract')

    assertDiagnosticShape(result)
    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.diagnostics, [])
  })

  it('keeps 2.4.13 release notes legacy-compatible', () => {
    const result = runFixtureCase('release-notes-legacy-final-contract')

    assertDiagnosticShape(result)
    assert.equal(result.exitCode, 0)
    assert.deepEqual(result.diagnostics, [])
  })

  it('fails post-baseline release-note drift with stable rule IDs and paths', () => {
    const result = runFixture('release-notes-post-baseline-invalid')

    assert.notEqual(result.exitCode, 0)
    assertDiagnosticShape(result)

    const ruleIds = diagnosticRuleIds(result)
    assert.ok(
      ruleIds.every(ruleId => /^[A-Z][A-Z0-9.-]*$/i.test(ruleId)),
      `expected stable rule IDs, got: ${ruleIds.join(', ')}`,
    )
    assert.ok(
      ruleIds.some(ruleId => ruleId.startsWith('DOC-RELEASE-')),
      `expected a release-note diagnostic rule ID, got: ${ruleIds.join(', ')}`,
    )

    const paths = diagnosticPaths(result)
    assert.ok(
      paths.includes('notes/update_2.4.14.en.md'),
      `expected the invalid English release-note path in diagnostics, got: ${paths.join(', ')}`,
    )
  })

  it('renders identical diagnostics on repeated fixture runs', () => {
    const first = runFixture('release-notes-post-baseline-invalid')
    const second = runFixture('release-notes-post-baseline-invalid')

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
    it(`accepts ${fixtureCase.name}`, () => {
      const result = runFixtureCase(fixtureCase.name)

      assertDiagnosticShape(result)
      assert.equal(result.exitCode, 0, renderedOutput(result))
      assert.deepEqual(caseProblems(result, fixtureCase), [])
    })
  }

  const failingCases = [
    {
      name: 'markdown-link-edges-and-scope-poison',
      ruleIds: ['DOC-LINK-INVALID', 'DOC-LINK-UNTRACKED'],
      // The retired task tree has no exemption any more: a document left there is checked like any
      // other. Agent and platform instruction roots stay out of product-doc parsing.
      paths: ['.trellis/internal/poison.md', 'docs/INDEX.md', 'docs/link-edge.mdc'],
      absentPaths: [
        '.agents/skills/docs-quality/poison.md',
        '.claude/rules/poison.md',
        '.codex/rules/poison.md',
        '.github/poison.md',
        '.omp/rules/poison.md',
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
      name: 'release-version-mismatch',
      ruleIds: ['DOC-RELEASE-VERSION'],
      paths: ['package.json'],
    },
    {
      name: 'ai-promotion-current-evidence',
      ruleIds: ['DOC-AI-CONTRACT'],
      paths: [
        'docs/plan-prd/04-implementation/AI-2.5x-Execution-Plan-2026-06-16.md',
      ],
      messages: ['historical evidence cannot prove current CoreApp 2.4.14 packaged evidence'],
      absentMessages: ['missing '],
    },
    {
      // A handoff is preserved history, but its links are checked like other product documentation.
      name: 'handoff-links-checked',
      ruleIds: ['DOC-LINK-UNTRACKED'],
      paths: [HANDOFF],
    },
    {
      // The registry is still on disk; it is no longer part of the repository's file set.
      name: 'task-index-missing',
      ruleIds: ['DOC-TASK-INDEX-MISSING'],
      paths: [REGISTRY],
    },
    {
      name: 'task-index-json',
      ruleIds: ['DOC-TASK-INDEX-JSON'],
      paths: [REGISTRY],
    },
    {
      name: 'task-index-shape-and-duplicate',
      ruleIds: ['DOC-TASK-INDEX-DUPLICATE', 'DOC-TASK-INDEX-SHAPE'],
      paths: [REGISTRY],
    },
    {
      // The declared handoff is still on disk but outside the file set, so it did not survive.
      name: 'task-index-handoff-missing',
      ruleIds: ['DOC-TASK-INDEX-HANDOFF'],
      paths: [REGISTRY],
    },
  ]

  for (const fixtureCase of failingCases) {
    it(`fails ${fixtureCase.name} with stable rule IDs and paths`, () => {
      const result = runFixtureCase(fixtureCase.name)

      assert.notEqual(result.exitCode, 0)
      assertDiagnosticShape(result)
      assert.deepEqual(caseProblems(result, fixtureCase), [])
    })
  }

  it('sorts diagnostics deterministically and renders capped totals', () => {
    const fixture = materializeFixtureCase('markdown-link-edges-and-scope-poison')
    try {
      const result = verify(fixture)
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

  it('leaves source fixtures read-only and produces byte-identical repeated output', () => {
    const before = snapshotFixtureFiles('valid-aggregate')
    const first = runFixtureCase('valid-final-contract')
    const second = runFixtureCase('valid-final-contract')
    const after = snapshotFixtureFiles('valid-aggregate')

    assert.deepEqual(after, before)
    assert.equal(first.exitCode, second.exitCode)
    assert.equal(renderedOutput(first), renderedOutput(second))
  })

  it('renders diagnostics with per-rule totals and round-robin caps', () => {
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
})

describe('retired task registry', () => {
  const COMMIT = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c'
  const frozen = () => ({
    slug: '07-27-documentation-quality-gates',
    id: 'documentation-quality-gates',
    title: 'Documentation quality gates',
    status: 'in_progress',
    disposition: 'frozen',
    sourcePath: '.trellis/tasks/07-27-documentation-quality-gates/task.json',
    handoff: HANDOFF,
  })
  const historical = () => ({
    slug: '07-20-completed-doc-task',
    id: 'completed-doc-task',
    title: 'Completed documentation task',
    status: 'completed',
    disposition: 'historical',
    sourcePath: '.trellis/tasks/archive/2026-07/07-20-completed-doc-task/task.json',
  })
  /** A valid two-entry registry, edited in place or replaced by `edit`. */
  const registryText = (edit = () => {}) => {
    const value = { schemaVersion: 1, baselineCommit: COMMIT, tasks: [frozen(), historical()] }
    const replaced = edit(value)
    return JSON.stringify(replaced === undefined ? value : replaced)
  }

  it('accepts frozen active tasks, history from either archive root, nested archive duplicates and surviving handoffs', () => {
    const tasks = [
      frozen(),
      historical(),
      // The real archive nests a task inside its own directory: same slug, two sources.
      { ...historical(), slug: '07-10-r9-2-compression-snapshot', id: 'r9-2-compression-snapshot', sourcePath: '.trellis/tasks/archive/2026-07/07-10-r9-2-compression-snapshot/task.json' },
      { ...historical(), slug: '07-10-r9-2-compression-snapshot', id: 'r9-2-compression-snapshot', sourcePath: '.trellis/tasks/archive/2026-07/07-10-r9-2-compression-snapshot/07-10-r9-2-compression-snapshot/task.json' },
      { ...historical(), slug: '07-05-legacy-archive-root', id: 'legacy-archive-root', sourcePath: '.trellis/archive/tasks/07-05-legacy-archive-root/task.json' },
      // Status keeps whatever the old record said; a living report can be the surviving handoff.
      { ...frozen(), slug: '07-13-search-crossplatform-audit', id: 'search-crossplatform-audit', status: 'review', sourcePath: '.trellis/tasks/07-13-search-crossplatform-audit/task.json', handoff: 'docs/engineering/reports/search-crossplatform-audit.md' },
    ]

    assert.deepEqual(
      parseRetiredTaskIndex(JSON.stringify({ schemaVersion: 1, baselineCommit: COMMIT, tasks })),
      { tasks, issues: [] },
    )
  })

  it('fails closed: one invalid entry withholds every entry', () => {
    const result = parseRetiredTaskIndex(registryText((value) => {
      value.tasks[1].title = ''
    }))

    assert.deepEqual(result.tasks, [])
    assert.deepEqual(result.issues.map(issue => [issue.code, issue.pointer]), [['shape', 'tasks[1].title']])
  })

  it('reports text that is not JSON as a json issue and vouches for nothing', () => {
    const result = parseRetiredTaskIndex('{ "schemaVersion": 1, "tasks": [')

    assert.deepEqual(result.tasks, [])
    assert.deepEqual(result.issues.map(issue => issue.code), ['json'])
  })

  it('reports a repeated sourcePath as a duplicate', () => {
    const result = parseRetiredTaskIndex(registryText((value) => {
      value.tasks.push({ ...historical(), id: 'completed-doc-task-copy' })
    }))

    assert.deepEqual(result.tasks, [])
    assert.deepEqual(result.issues.map(issue => [issue.code, issue.pointer]), [['duplicate', 'tasks[2].sourcePath']])
  })

  // Each edit breaks exactly one rule of a valid registry, so exactly one issue may come back.
  const shapeCases = [
    ['a root that is not an object', () => [], ''],
    ['an unknown root field', (value) => {
      value.generatedAt = '2026-10-03'
    }, 'generatedAt'],
    ['a schemaVersion other than the number 1', (value) => {
      value.schemaVersion = '1'
    }, 'schemaVersion'],
    ['an abbreviated baseline commit', (value) => {
      value.baselineCommit = COMMIT.slice(0, 9)
    }, 'baselineCommit'],
    ['an uppercase baseline commit', (value) => {
      value.baselineCommit = COMMIT.toUpperCase()
    }, 'baselineCommit'],
    ['tasks that are not an array', (value) => {
      value.tasks = {}
    }, 'tasks'],
    ['an empty task list', (value) => {
      value.tasks = []
    }, 'tasks'],
    ['an entry that is not an object', (value) => {
      value.tasks[1] = '07-20-completed-doc-task'
    }, 'tasks[1]'],
    ['an unknown entry field', (value) => {
      value.tasks[1].notes = 'carried over'
    }, 'tasks[1].notes'],
    ...['slug', 'id', 'title', 'status', 'disposition', 'sourcePath'].map(key => [`a blank ${key}`, (value) => {
      value.tasks[1][key] = ' '
    }, `tasks[1].${key}`]),
    ['a non-string id', (value) => {
      value.tasks[1].id = 42
    }, 'tasks[1].id'],
    ['a disposition outside frozen and historical', (value) => {
      value.tasks[1].disposition = 'completed'
    }, 'tasks[1].disposition'],
    ['an active task recorded as historical', (value) => {
      value.tasks[0].disposition = 'historical'
    }, 'tasks[0].disposition'],
    ['an archived task recorded as frozen', (value) => {
      value.tasks[1].disposition = 'frozen'
    }, 'tasks[1].disposition'],
    ['a slug that is not the task directory', (value) => {
      value.tasks[1].slug = '07-20-renamed-task'
    }, 'tasks[1].slug'],
    ...[
      ['outside the retired task roots', 'docs/tasks/07-20-completed-doc-task/task.json'],
      ['that is not a task.json', '.trellis/tasks/archive/2026-07/07-20-completed-doc-task/prd.md'],
      ['with a parent segment', '.trellis/tasks/archive/2026-07/../07-20-completed-doc-task/task.json'],
      ['that is absolute', '/.trellis/tasks/archive/2026-07/07-20-completed-doc-task/task.json'],
      ['with backslashes', '.trellis\\tasks\\archive\\2026-07\\07-20-completed-doc-task\\task.json'],
      ['nested below an active task', '.trellis/tasks/07-27-documentation-quality-gates/07-20-completed-doc-task/task.json'],
    ].map(([what, sourcePath]) => [`a sourcePath ${what}`, (value) => {
      value.tasks[1].sourcePath = sourcePath
    }, 'tasks[1].sourcePath']),
    ...[
      ['set to null', null],
      ['left empty', ''],
      ['inside the retired task tree', '.trellis/tasks/07-27-documentation-quality-gates/prd.md'],
      ['in another task\'s handoff directory', 'docs/engineering/workflow/handoffs/07-20-completed-doc-task/README.md'],
      ['at the handoff root itself', 'docs/engineering/workflow/handoffs/README.md'],
      ['with a fragment', `${HANDOFF}#next-action`],
      ['that is not Markdown', 'docs/engineering/workflow/handoffs/07-27-documentation-quality-gates/README.txt'],
      ['that climbs out of its directory', 'docs/engineering/workflow/handoffs/07-27-documentation-quality-gates/../07-20-completed-doc-task/README.md'],
    ].map(([what, handoff]) => [`a handoff ${what}`, (value) => {
      value.tasks[0].handoff = handoff
    }, 'tasks[0].handoff']),
  ]

  for (const [name, edit, pointer] of shapeCases) {
    it(`rejects ${name}`, () => {
      const result = parseRetiredTaskIndex(registryText(edit))

      assert.deepEqual(result.tasks, [])
      assert.deepEqual(result.issues.map(issue => [issue.code, issue.pointer]), [['shape', pointer]])
    })
  }
})

const GIT_LOCATION_VARIABLES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_PREFIX']

/** Run inside a git hook (GIT_DIR, GIT_INDEX_FILE set), every git call here would hit this repository. */
function withoutInheritedGitLocation(run) {
  const saved = Object.fromEntries(GIT_LOCATION_VARIABLES.filter(key => key in process.env).map(key => [key, process.env[key]]))
  for (const key of GIT_LOCATION_VARIABLES) delete process.env[key]
  try {
    return run()
  }
  finally {
    Object.assign(process.env, saved)
  }
}

describe('repository file set', () => {
  it('sees untracked documents, drops unstaged deletions and ignored files, and never writes the index', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-repository-files-'))
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
      fs.writeFileSync(path.join(repo, file), content)
    }
    try {
      withoutInheritedGitLocation(() => {
        git('-c', 'init.defaultBranch=main', 'init', '-q')
        // Keep the user's global hooks, excludes and caches out of a test about this repository.
        fs.mkdirSync(path.join(repo, '.git', 'no-hooks'))
        fs.writeFileSync(path.join(repo, '.git', 'no-global-excludes'), '')
        git('config', 'core.hooksPath', path.join(repo, '.git', 'no-hooks'))
        git('config', 'core.excludesFile', path.join(repo, '.git', 'no-global-excludes'))
        git('config', 'core.untrackedCache', 'false')
        git('config', 'core.fsmonitor', 'false')

        write('.gitignore', 'docs/ignored.md\n')
        write('README.md', '# Repo\n\nSee the [guide](docs/guide.md) and the [retired page](docs/retired.md).\n')
        write('docs/guide.md', '# Guide\n')
        write('docs/retired.md', '# Retired\n')
        git('add', '-A')
        git('-c', 'user.name=docs-verifier-test', '-c', 'user.email=docs-verifier-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'baseline')

        fs.rmSync(path.join(repo, 'docs/retired.md'))
        write('docs/staged.md', '# Staged\n')
        git('add', 'docs/staged.md')
        write('docs/draft.md', '# Draft\n\nLinks to a [missing page](missing.md).\n')
        write('docs/ignored.md', '# Ignored\n\nLinks to a [missing page](gone.md).\n')

        const index = path.join(repo, '.git', 'index')
        const indexBefore = fs.readFileSync(index)

        const files = repositoryFiles(repo)
        const diagnostics = checkMarkdownAndLinks(repo, scopeRegistry(repo, files))

        // Tracked and staged files, plus the untracked draft; not the deletion, not the ignored file.
        assert.deepEqual(files, ['.gitignore', 'README.md', 'docs/draft.md', 'docs/guide.md', 'docs/staged.md'])
        // The draft is checked, the link to the deleted page fails, and the deleted page is never read.
        assert.deepEqual(
          diagnostics.map(diagnostic => `${diagnostic.ruleId} ${diagnostic.file}`).sort(),
          ['DOC-LINK-UNTRACKED README.md', 'DOC-LINK-UNTRACKED docs/draft.md'],
        )
        // Other sessions stage work in a shared checkout; reading the file set must not touch the index.
        assert.deepEqual(fs.readFileSync(index), indexBefore)
      })
    }
    finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })
})

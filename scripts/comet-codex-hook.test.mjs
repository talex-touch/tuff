import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { normalizeCodexEvent, patchTargets } from '../.codex/hooks/comet-hook-router.mjs'

/**
 * The Codex adapter in front of the Comet write guard.
 *
 * Codex reports its file edits as one native `apply_patch` call whose `tool_input.command` is the
 * whole patch, and a hook that exits with anything other than 2 lets the edit through. The vendored
 * Comet router only understands write targets, so the adapter has two jobs, and both fail open if
 * they are wrong: name every file the patch will touch, and turn anything it cannot judge into an
 * exit 2 with a reason on stderr (Codex treats a bare exit 2 without one as a hook error).
 *
 * "Every file the patch will touch" is defined by Codex's parser, not by the patch grammar on
 * paper. The indentation cases below were applied by codex-cli 0.158.0
 * (`codex --codex-run-as-apply-patch <patch>`, the parser behind the apply_patch tool) in a scratch
 * directory on 2026-10-03: Codex trims the line that opens the next file operation after an Add body
 * or a Delete line, so ` *** Add File: x` there is a real header and the file is written.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ADAPTER = '.codex/hooks/comet-hook-router.mjs'
const VENDORED_ROUTER = '.agents/skills/comet/scripts/comet-hook-router.mjs'
const CHANGE = 'codex-hook-fixture'
const CHANGE_DIR = `docs/comet/changes/${CHANGE}`
const STATE = `${CHANGE_DIR}/comet-state.yaml`

function patch(...lines) {
  return ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')
}

/** The keys the vendored router reads write targets from, so either forwarding shape is accepted. */
const ROUTER_TARGET_KEYS = ['file_path', 'filePath', 'path', 'target_file', 'targetFile', 'file_paths', 'filePaths', 'paths', 'files', 'targets']

function forwardedTargets(events) {
  const targets = events.flatMap(event => ROUTER_TARGET_KEYS.flatMap((key) => {
    const value = event?.tool_input?.[key]
    return value === undefined ? [] : [value].flat()
  }))
  return [...new Set(targets)].sort()
}

describe('codex apply_patch target enumeration', () => {
  it('names every added, updated and deleted file and both ends of a move', () => {
    const targets = patchTargets(patch(
      '*** Add File: src/new.ts',
      '+export const added = true',
      '*** Update File: src/old-name.ts',
      '*** Move to: src/new-name.ts',
      '@@',
      '-export const name = \'old\'',
      '+export const name = \'new\'',
      '*** Delete File: src/obsolete.ts',
      '*** Update File: README.md',
      '@@ intro',
      ' context',
      '+added line',
      '*** End of File',
    ))

    assert.deepEqual([...targets].sort(), [
      'README.md',
      'src/new-name.ts',
      'src/new.ts',
      'src/obsolete.ts',
      'src/old-name.ts',
    ])
  })

  it('reads added lines that spell directives as file content', () => {
    // Codex wrote only docs/notes.md for this patch; the victim file survived.
    const targets = patchTargets(patch(
      '*** Add File: docs/notes.md',
      '+*** Delete File: src/victim.ts',
      '+*** Move to: src/elsewhere.ts',
      '+*** Add File: src/smuggled.ts',
      '+*** End Patch',
      '*** Update File: docs/guide.md',
      '@@',
      '-old',
      '+*** Delete File: src/also-content.ts',
    ))

    assert.deepEqual([...targets].sort(), ['docs/guide.md', 'docs/notes.md'])
  })

  it('keeps an indented header inside an update hunk as context, as Codex does', () => {
    // A context line is a space followed by the file's own text. Codex matched it against the file
    // and wrote nothing else, so rejecting this patch would refuse a legitimate edit.
    const targets = patchTargets(patch(
      '*** Update File: docs/patch-format.md',
      '@@',
      ' *** Add File: example.ts',
      '-old',
      '+new',
    ))

    assert.deepEqual(targets, ['docs/patch-format.md'])
  })

  it('reads CRLF patches exactly like LF patches', () => {
    const lf = patch('*** Add File: docs/a.md', '+a', '*** Delete File: src/b.ts')

    assert.deepEqual(patchTargets(lf.replaceAll('\n', '\r\n')), patchTargets(lf))
  })

  const malformed = [
    ['no patch text', undefined],
    ['a non-string command', 42],
    ['an empty command', ''],
    ['a missing begin marker', '*** Add File: src/a.ts\n+a\n*** End Patch'],
    ['a missing end marker', '*** Begin Patch\n*** Add File: src/a.ts\n+a'],
    ['no file operation', patch()],
    ['a blank target', patch('*** Add File:    ', '+a')],
    ['an unknown directive', patch('*** Rename File: src/a.ts')],
    ['content before any file header', patch('+orphan', '*** Add File: src/a.ts', '+a')],
    ['a move after an add', patch('*** Add File: src/a.ts', '+a', '*** Move to: src/b.ts')],
    ['a move after a delete', patch('*** Delete File: src/a.ts', '*** Move to: src/b.ts')],
    ['a second move in one update', patch('*** Update File: src/a.ts', '*** Move to: src/b.ts', '*** Move to: src/c.ts')],
    ['a move with a blank destination', patch('*** Update File: src/a.ts', '*** Move to:    ')],
  ]

  for (const [name, command] of malformed) {
    it(`rejects ${name} instead of returning a partial target list`, () => {
      assert.throws(() => patchTargets(command))
    })
  }

  // Each of these was applied by codex-cli 0.158.0 and touched every file in `codexTouches`.
  const codexAppliedIndentedHeaders = [
    {
      name: 'a space before an Add header that follows an Add body',
      patch: patch('*** Add File: docs/ok.md', '+hello', ' *** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/ok.md', 'src/evil.ts'],
    },
    {
      name: 'two spaces before an Add header',
      patch: patch('*** Add File: docs/ok.md', '+hello', '  *** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/ok.md', 'src/evil.ts'],
    },
    {
      name: 'a no-break space before an Add header',
      patch: patch('*** Add File: docs/ok.md', '+hello', '\u00A0*** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/ok.md', 'src/evil.ts'],
    },
    {
      // Rust trims U+0085; String.prototype.trim does not.
      name: 'a next-line character (U+0085) before an Add header',
      patch: patch('*** Add File: docs/ok.md', '+hello', '\u0085*** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/ok.md', 'src/evil.ts'],
    },
    {
      name: 'an ideographic space before an Add header',
      patch: patch('*** Add File: docs/ok.md', '+hello', '\u3000*** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/ok.md', 'src/evil.ts'],
    },
    {
      name: 'a lone carriage return before an Add header',
      patch: patch('*** Add File: docs/ok.md', '+hello', '\r*** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/ok.md', 'src/evil.ts'],
    },
    {
      name: 'a space before a Delete header that follows an Add body',
      patch: patch('*** Add File: docs/ok.md', '+hello', ' *** Delete File: src/victim.ts'),
      codexTouches: ['docs/ok.md', 'src/victim.ts'],
    },
    {
      name: 'a space before an Update header with a move, after an Add body',
      patch: patch('*** Add File: docs/ok.md', '+hello', ' *** Update File: src/victim.ts', '*** Move to: src/moved.ts', '@@', '-keep', '+kept'),
      codexTouches: ['docs/ok.md', 'src/moved.ts', 'src/victim.ts'],
    },
    {
      name: 'a space before an Add header that follows a Delete line',
      patch: patch('*** Delete File: docs/old.md', ' *** Add File: src/evil.ts', '+payload'),
      codexTouches: ['docs/old.md', 'src/evil.ts'],
    },
    {
      name: 'a tab before the first header',
      patch: patch('\t*** Add File: src/evil.ts', '+payload'),
      codexTouches: ['src/evil.ts'],
    },
  ]

  for (const testCase of codexAppliedIndentedHeaders) {
    it(`never silently drops a file Codex writes: ${testCase.name}`, () => {
      let targets
      try {
        targets = patchTargets(testCase.patch)
      }
      catch {
        // Rejecting the whole patch denies it, which is safe. Returning a list without the file is not.
        return
      }
      assert.deepEqual(
        testCase.codexTouches.filter(file => !targets.includes(file)),
        [],
        `enumerated only: ${targets.join(', ')}`,
      )
    })
  }
})

describe('codex hook event normalization', () => {
  it('resolves relative targets from the event cwd and keeps absolute targets as written', () => {
    const cwd = path.join(os.tmpdir(), 'codex-normalize', 'packages', 'app')
    const absolute = path.join(os.tmpdir(), 'codex-normalize', 'elsewhere', 'absolute.ts')

    const events = normalizeCodexEvent({
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      cwd,
      tool_input: {
        command: patch(
          '*** Add File: src/a.ts',
          '+a',
          `*** Delete File: ${absolute}`,
          '*** Update File: ../shared/b.ts',
          '*** Move to: ../shared/c.ts',
          '@@',
          '-b',
          '+c',
        ),
      },
    })

    assert.deepEqual(forwardedTargets(events), [
      absolute,
      path.join(cwd, 'src', 'a.ts'),
      path.resolve(cwd, '..', 'shared', 'b.ts'),
      path.resolve(cwd, '..', 'shared', 'c.ts'),
    ].sort())
  })
})

const CONFIG_YAML = `schema: comet.project.v1
default_workflow: native
workflows:
  - native
ambient_resume: false
memory:
  learning: false
  retrieval: false
knowledge:
  provider: local
  local:
    include:
      - docs/**/*.md
native:
  artifact_root: docs
  language: en
  clarification_mode: batch
  archive_confirmation: required
  max_verify_failures: 5
`

const SELECTION_JSON = `${JSON.stringify({ schema: 'comet.selection.v2', workflow: 'native', change: CHANGE, branch: null }, null, 2)}\n`

const BRIEF_MD = `# Outcome

Codex patches are judged by the Native write guard as one write action.

# Scope

- Fixture only.

# Non-goals

- Product behaviour.

# Acceptance examples

- A patch that touches Runtime-owned state is denied.
`

// Legacy-compatible Build state: without document_constraints_version the router does not recompute
// the Shape fingerprint, so an implementation-only write is allowed and serves as the positive control.
const BUILD_STATE_YAML = `schema: comet.native.v4
name: ${CHANGE}
language: en
phase: build
status: active
state_version: 1
brief: brief.md
spec_changes: []
workspace:
  isolation: current
  change_branch: null
  target_branch: null
  finish: null
loop:
  stage: building
  goal_cycle: 1
  iteration: 1
  attempt: 0
  retry_epoch: 0
  failed_iteration_count: 0
  no_progress_count: 0
  execution_failure_count: 0
  previous_unresolved_ids: []
  next_action: submit-builder-candidate
acceptance:
  - id: A1
    source: brief.md
    text: A patch that touches Runtime-owned state is denied.
    result: pending
    reason: null
builder_handoff: null
blockers: []
verification: null
history: []
history_overflow:
  dropped_entries: 0
  first_dropped_at: null
  last_dropped_at: null
  outcome_counts:
    pass: 0
    fail: 0
    blocked: 0
    execution-error: 0
    recovery: 0
verification_result: pending
verification_report: null
archived: false
created_at: 2026-10-03T00:00:00.000Z
`

function writeFile(root, relative, content) {
  const absolute = path.join(root, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
}

/**
 * A throwaway Native project holding copies of the real adapter and the vendored router. The adapter
 * locates its project and the router from its own file location, so the copy guards the fixture and
 * never this repository's live change. It is created under the real path of the temp directory (on
 * macOS `/var` is a symlink), so every path the adapter and the router compare is already canonical.
 */
function createNativeProject(tmpRoot, { withRouter = true } = {}) {
  const root = fs.mkdtempSync(path.join(tmpRoot, 'comet-codex-hook-'))
  writeFile(root, ADAPTER, fs.readFileSync(path.join(repoRoot, ADAPTER)))
  if (withRouter)
    writeFile(root, VENDORED_ROUTER, fs.readFileSync(path.join(repoRoot, VENDORED_ROUTER)))
  writeFile(root, '.comet/config.yaml', CONFIG_YAML)
  writeFile(root, '.comet/current-change.json', SELECTION_JSON)
  writeFile(root, `${CHANGE_DIR}/brief.md`, BRIEF_MD)
  writeFile(root, STATE, BUILD_STATE_YAML)
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  return root
}

function preToolUse(cwd, command) {
  return {
    session_id: 'codex-hook-test',
    hook_event_name: 'PreToolUse',
    cwd,
    tool_name: 'apply_patch',
    tool_use_id: 'call-1',
    tool_input: { command },
  }
}

function runHook(projectRoot, event, { env = {} } = {}) {
  const childEnv = { ...process.env }
  // The router reads FILE_PATH instead of stdin; the inherited test environment must not decide.
  delete childEnv.FILE_PATH
  Object.assign(childEnv, env)
  const result = spawnSync(process.execPath, [path.join(projectRoot, ADAPTER)], {
    cwd: typeof event === 'object' && event?.cwd ? event.cwd : projectRoot,
    input: typeof event === 'string' ? event : JSON.stringify(event),
    encoding: 'utf8',
    env: childEnv,
    timeout: 60_000,
  })
  assert.equal(result.error, undefined, String(result.error))
  return result
}

function assertAllowed(result) {
  assert.equal(result.status, 0, `expected allow; stderr: ${result.stderr}`)
  // Codex parses a non-empty stdout as one hook response.
  if (result.stdout.trim())
    assert.doesNotThrow(() => JSON.parse(result.stdout), `stdout is not one JSON document: ${result.stdout}`)
}

function assertDenied(result) {
  assert.equal(result.status, 2, `expected deny (exit 2); stdout: ${result.stdout} stderr: ${result.stderr}`)
  assert.notEqual(result.stderr.trim(), '', 'Codex ignores an exit 2 that carries no reason on stderr')
}

describe('codex hook through the vendored Comet router (Native Build fixture)', () => {
  let tmpRoot
  let project

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'comet-codex-hook-suite-'))
    project = createNativeProject(tmpRoot)
  })

  beforeEach(() => {
    writeFile(project, STATE, BUILD_STATE_YAML)
    fs.rmSync(path.join(project, '.comet', 'runtime'), { recursive: true, force: true })
  })

  afterAll(() => {
    if (tmpRoot)
      fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  const readState = () => fs.readFileSync(path.join(project, STATE), 'utf8')

  it('allows an implementation-only patch while the change is in Build', () => {
    assertAllowed(runHook(project, preToolUse(project, patch(
      '*** Add File: src/feature.ts',
      '+export const feature = 1',
      '*** Update File: src/existing.ts',
      '@@',
      '-export const value = 1',
      '+export const value = 2',
    ))))
  })

  it('denies the whole patch when any target is Runtime-owned, wherever it appears', () => {
    const cases = [
      patch('*** Add File: src/feature.ts', '+export const feature = 1', `*** Update File: ${STATE}`, '@@', '-phase: build', '+phase: verify'),
      patch(`*** Update File: ${STATE}`, '@@', '-phase: build', '+phase: verify', '*** Add File: src/feature.ts', '+export const feature = 1'),
      patch('*** Add File: src/feature.ts', '+export const feature = 1', `*** Delete File: ${STATE}`),
    ]
    for (const command of cases)
      assertDenied(runHook(project, preToolUse(project, command)))

    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('guards the destination and the source of a move', () => {
    const update = ['@@', '-draft', '+final']
    assertAllowed(runHook(project, preToolUse(project, patch('*** Update File: src/draft.ts', ...update))))
    assertDenied(runHook(project, preToolUse(project, patch('*** Update File: src/draft.ts', `*** Move to: ${CHANGE_DIR}/verification.md`, ...update))))
    assertDenied(runHook(project, preToolUse(project, patch(`*** Update File: ${STATE}`, '*** Move to: src/state-copy.yaml', '@@', '-phase: build', '+phase: build'))))

    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('judges a patch as one write action: requirements mixed with implementation are denied without touching workflow state', () => {
    // The router refuses formal requirement edits that share an action with implementation, before
    // it records anything. Judged one target at a time, the brief edit passes on its own: on a
    // document-constrained state the mixed patch then goes through whole, and on this state the brief
    // edit first moves the change back to Shape and only then is the implementation file denied.
    const result = runHook(project, preToolUse(project, patch(
      `*** Update File: ${CHANGE_DIR}/brief.md`,
      '@@',
      '-- Fixture only.',
      '+- Fixture only, widened.',
      '*** Add File: src/feature.ts',
      '+export const feature = 1',
    )))

    assertDenied(result)
    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('resolves relative targets from the session cwd, not from the project root', () => {
    // From src/ the path climbs back into the project and lands on Runtime-owned state; from the
    // project root the same text leaves the project, which the guard treats as neutral.
    assertDenied(runHook(project, preToolUse(path.join(project, 'src'), patch(`*** Add File: ../${STATE}`, '+phase: archive'))))
    assertAllowed(runHook(project, preToolUse(project, patch(`*** Add File: ../${STATE}`, '+phase: archive'))))

    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('keeps absolute targets absolute regardless of the session cwd', () => {
    assertDenied(runHook(project, preToolUse(path.join(project, 'src'), patch(`*** Delete File: ${path.join(project, STATE)}`))))

    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('judges the patch targets even when FILE_PATH is set in the Codex environment', () => {
    // The vendored router takes FILE_PATH in place of stdin; pointing it outside the project must not
    // turn a Runtime-owned write into a neutral one.
    const result = runHook(
      project,
      preToolUse(project, patch(`*** Update File: ${STATE}`, '@@', '-phase: build', '+phase: archive')),
      { env: { FILE_PATH: path.join(tmpRoot, 'outside-file-path-probe.txt') } },
    )

    assertDenied(result)
    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('passes non-patch events through without parsing them as patches', () => {
    assertAllowed(runHook(project, {
      session_id: 'codex-hook-test',
      hook_event_name: 'PreToolUse',
      cwd: project,
      tool_name: 'Bash',
      tool_use_id: 'call-2',
      tool_input: { command: 'git status --short' },
    }))
    assertAllowed(runHook(project, {
      session_id: 'codex-hook-test',
      hook_event_name: 'UserPromptSubmit',
      cwd: project,
      prompt: 'Summarise the open change.',
    }))
  })

  it('fails closed on hook input it cannot read', () => {
    const unreadable = [
      'not json',
      { ...preToolUse(project, ''), tool_input: {} },
      preToolUse(project, ''),
      preToolUse(project, 42),
      preToolUse(project, 'Add File: src/a.ts'),
    ]
    for (const input of unreadable)
      assertDenied(runHook(project, input))

    assert.equal(readState(), BUILD_STATE_YAML)
  })

  it('fails closed when the Comet router cannot run', () => {
    const routerless = createNativeProject(tmpRoot, { withRouter: false })

    assertDenied(runHook(routerless, preToolUse(routerless, patch('*** Add File: src/feature.ts', '+export const feature = 1'))))
  })
})

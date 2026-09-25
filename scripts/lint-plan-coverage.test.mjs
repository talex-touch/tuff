import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

/**
 * The root `lint` entry stopped being the ~800-character inline command and became
 * `node scripts/lint.mjs`, but the plugin coverage guard kept reading the `plugins/{…}` brace
 * list out of the package.json text. `node scripts/lint.mjs` has no braces, so the guard read
 * "no list" and failed every healthy tree (#1961).
 *
 * It now asks the runner for its execution plan — the same argv the real lint runs — and reads
 * the brace glob out of that. These cases pin the ways this can silently regress:
 *
 *   - a tree the plan covers must be accepted (the false alarm that started this);
 *   - a package.json-less plugin the plan never reaches must fail and be named;
 *   - a planned plugin directory that no longer exists must still be reported;
 *   - a root `lint` entry that is no longer the dispatcher must fail closed instead of reading
 *     a plan nobody runs;
 *   - `--print-plan` must report the plan without spawning lint.
 *
 * Everything runs against copies of the real dispatcher, runner and guard inside a throwaway
 * repository, so the plan under test is the real one: no installed dependencies, no pnpm, no
 * network.
 */

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const COPIED_SCRIPTS = ['check.mjs', 'lint.mjs', 'check-plugin-lint-coverage.mjs']

function withFixture(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lint-plan-coverage-'))
  try {
    mkdirSync(path.join(root, 'plugins'), { recursive: true })
    mkdirSync(path.join(root, 'scripts'), { recursive: true })
    for (const name of COPIED_SCRIPTS)
      copyFileSync(path.join(SCRIPTS_DIR, name), path.join(root, 'scripts', name))
    writeManifest(root, 'node scripts/lint.mjs')
    return run(root)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function writeManifest(root, lint) {
  const manifest = {
    name: 'lint-plan-coverage-fixture',
    private: true,
    type: 'module',
    scripts: { lint },
  }
  writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

/** The gate exactly as the failing command invoked it: `node scripts/check.mjs <gate>`. */
function runGate(root) {
  return spawnSync(process.execPath, ['scripts/check.mjs', 'plugin-lint-coverage'], {
    cwd: root,
    encoding: 'utf8',
  })
}

function printPlan(root, env = process.env) {
  return spawnSync(process.execPath, ['scripts/lint.mjs', '--print-plan'], {
    cwd: root,
    encoding: 'utf8',
    env,
  })
}

/**
 * The plugin names the runner actually lints, read the way the guard reads them: from
 * `--print-plan`. Each fixture is built from this list, so a passing tree and the plan agree
 * by construction and the only difference left in a case is the plugin directory under test.
 */
function plannedPluginDirs(root) {
  const result = printPlan(root)
  assert.equal(result.status, 0, `--print-plan should succeed:\n${result.stderr}`)

  const plan = JSON.parse(result.stdout)
  assert.ok(Array.isArray(plan) && plan.length > 0, 'the plan should be a non-empty array of command argument arrays')

  const names = new Set()
  for (const command of plan) {
    assert.ok(
      Array.isArray(command) && command.every(arg => typeof arg === 'string'),
      `every plan entry should be a string argv, got ${JSON.stringify(command)}`,
    )
    for (const arg of command) {
      const match = /plugins\/\{([^}]+)\}/.exec(arg)
      if (match) {
        for (const name of match[1].split(',')) names.add(name.trim())
      }
    }
  }
  assert.ok(names.size > 0, 'the plan should carry the plugins/{…} brace glob the guard reads')
  return [...names]
}

function coverPlannedPlugins(root) {
  for (const name of plannedPluginDirs(root))
    mkdirSync(path.join(root, 'plugins', name))
}

describe('plugin lint coverage against the real lint plan', () => {
  it('accepts a plugin tree the dispatcher entry and the runner plan cover completely', () => {
    withFixture((root) => {
      coverPlannedPlugins(root)
      // A workspace plugin is linted by the `--filter "./plugins/*"` pass, so it needs no brace
      // entry; a guard that only trusted the plan would report this one as a gap.
      const workspace = path.join(root, 'plugins', 'touch-workspace-fixture')
      mkdirSync(workspace)
      writeFileSync(path.join(workspace, 'package.json'), '{}\n')

      const result = runGate(root)

      assert.equal(
        result.status,
        0,
        `a fully covered tree must pass:\n${result.stdout}\n${result.stderr}`,
      )
    })
  })

  it('fails and names a package.json-less plugin the runner never reaches', () => {
    withFixture((root) => {
      coverPlannedPlugins(root)
      const omitted = 'touch-omitted-from-the-plan'
      mkdirSync(path.join(root, 'plugins', omitted))

      const result = runGate(root)

      assert.notEqual(result.status, 0, 'a plugin no pass reaches must fail the gate')
      assert.ok(
        `${result.stdout}${result.stderr}`.includes(omitted),
        `the failure should name plugins/${omitted}:\n${result.stdout}\n${result.stderr}`,
      )
    })
  })

  it('fails when the plan still names a plugin directory that no longer exists', () => {
    withFixture((root) => {
      const [stale, ...rest] = plannedPluginDirs(root)
      for (const name of rest)
        mkdirSync(path.join(root, 'plugins', name))

      const result = runGate(root)

      assert.notEqual(result.status, 0, 'a dead brace entry must fail the gate')
      assert.ok(
        `${result.stdout}${result.stderr}`.includes(stale),
        `the failure should name plugins/${stale}:\n${result.stdout}\n${result.stderr}`,
      )
    })
  })

  it('fails closed when the root lint entry is no longer the dispatcher', () => {
    withFixture((root) => {
      coverPlannedPlugins(root)
      // scripts/lint.mjs still prints a covering plan here; only the manifest entry drifted.
      // Trusting the plan without checking the entry would green-light a lint nobody runs.
      writeManifest(root, 'eslint .')

      const result = runGate(root)

      assert.notEqual(
        result.status,
        0,
        `a drifted root lint entry must fail closed:\n${result.stdout}\n${result.stderr}`,
      )
    })
  })

  it('reports the plan without needing pnpm, so reading it cannot run lint', () => {
    withFixture((root) => {
      const emptyPath = path.join(root, 'empty-path')
      mkdirSync(emptyPath)

      // With no pnpm reachable, a plan that only prints succeeds and a plan that actually
      // linted cannot: the guard's read must be free of the work it is inspecting.
      const result = printPlan(root, { ...process.env, PATH: emptyPath })

      assert.equal(result.status, 0, `--print-plan must not spawn pnpm:\n${result.stderr}`)
      assert.match(
        result.stdout,
        /plugins\/\{[^}]+\}/,
        `the printed plan should carry the plugin brace glob the guard reads:\n${result.stdout}`,
      )
    })
  })
})

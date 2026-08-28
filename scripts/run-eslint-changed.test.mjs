import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import {
  buildRootArgs,
  buildWorkspaceArgs,
  groupByWorkspace,
  parseFileList,
  selectLintableFiles,
} from './run-eslint-changed.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function isIgnoredByGit(relativePath) {
  const result = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--quiet', '--', relativePath],
    { cwd: workspaceRoot, encoding: 'utf8' },
  )

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || result.error?.message || 'git check-ignore failed')
  }

  return result.status === 0
}

// Mirrors collectWorkspaceDirectories()'s contract: longest prefix first.
const WORKSPACES = [
  'packages/tuffex/packages/components',
  'packages/unplugin-export-plugin',
  'packages/tuffex',
  'apps/core-app',
  'apps/nexus',
]

describe('groupByWorkspace', () => {
  it('routes a nested workspace file to the nested package, not its parent', () => {
    const { groups, rootFiles } = groupByWorkspace(
      ['packages/tuffex/packages/components/src/index.ts'],
      WORKSPACES,
    )

    // The nested package has its own eslint config; matching packages/tuffex
    // first would lint it under the parent's rules instead.
    assert.deepEqual([...groups.keys()], ['packages/tuffex/packages/components'])
    assert.deepEqual(groups.get('packages/tuffex/packages/components'), ['src/index.ts'])
    assert.deepEqual(rootFiles, [])
  })

  it('still routes a parent-only file to the parent workspace', () => {
    const { groups } = groupByWorkspace(['packages/tuffex/vitest.config.ts'], WORKSPACES)

    assert.deepEqual([...groups.keys()], ['packages/tuffex'])
    assert.deepEqual(groups.get('packages/tuffex'), ['vitest.config.ts'])
  })

  it('keeps files outside every workspace for the root pass', () => {
    const { groups, rootFiles } = groupByWorkspace(
      ['scripts/run-eslint-changed.mjs', 'workers/index.ts'],
      WORKSPACES,
    )

    assert.equal(groups.size, 0)
    assert.deepEqual(rootFiles, ['scripts/run-eslint-changed.mjs', 'workers/index.ts'])
  })

  it('does not treat a workspace-prefixed sibling directory as that workspace', () => {
    // 'apps/core-app-extra' merely starts with 'apps/core-app'.
    const { groups, rootFiles } = groupByWorkspace(['apps/core-app-extra/src/a.ts'], WORKSPACES)

    assert.equal(groups.size, 0)
    assert.deepEqual(rootFiles, ['apps/core-app-extra/src/a.ts'])
  })

  it('groups several files per workspace', () => {
    const { groups } = groupByWorkspace(
      ['apps/nexus/app/a.vue', 'apps/nexus/app/b.ts', 'apps/core-app/src/c.ts'],
      WORKSPACES,
    )

    assert.deepEqual(groups.get('apps/nexus'), ['app/a.vue', 'app/b.ts'])
    assert.deepEqual(groups.get('apps/core-app'), ['src/c.ts'])
  })
})

describe('file collection', () => {
  it('excludes local DSH plugin-hub staging and install outputs from Git candidates', () => {
    const generatedPaths = [
      '.dsh-plugin-hub-adapter-staging/index.mjs',
      '.dsh-plugin-hub-config-dump.yml',
      '.dsh-plugin-hub-install/site/app.js',
      '.dsh-plugin-hub-root.html',
    ]

    for (const generatedPath of generatedPaths) {
      assert.equal(isIgnoredByGit(generatedPath), true, generatedPath)
    }
  })

  it('keeps ordinary untracked source paths as Git candidates', () => {
    assert.equal(isIgnoredByGit('scripts/brand-new.mjs'), false)
    assert.deepEqual(selectLintableFiles([], ['scripts/brand-new.mjs']), ['scripts/brand-new.mjs'])
  })

  it('keeps an untracked file that the tracked diff never reported', () => {
    // The bug: `git diff HEAD` lists tracked changes only, so a new file that has not been
    // `git add`ed yields an empty list and the gate exits green having linted nothing.
    const tracked = parseFileList('')
    const untracked = parseFileList('scripts/brand-new.mjs\n')

    assert.deepEqual(selectLintableFiles(tracked, untracked), ['scripts/brand-new.mjs'])
  })

  it('does not lint a file twice when both probes report it', () => {
    const files = selectLintableFiles(
      ['apps/nexus/app/a.ts'],
      ['apps/nexus/app/a.ts'],
    )

    assert.deepEqual(files, ['apps/nexus/app/a.ts'])
  })

  it('applies the extension filter to untracked files as well', () => {
    const files = selectLintableFiles([], ['docs/notes.md', 'assets/logo.svg', 'scripts/a.mjs'])

    assert.deepEqual(files, ['scripts/a.mjs'])
  })

  it('drops blank lines and normalises separators', () => {
    assert.deepEqual(parseFileList('a.ts\n\nb.vue\n'), ['a.ts', 'b.vue'])
    assert.deepEqual(parseFileList(''), [])
  })
})

describe('eslint argv', () => {
  it('passes --max-warnings=0 for a workspace, matching the root lint script', () => {
    const args = buildWorkspaceArgs('packages/tuffex', ['src/index.ts'])

    // Without this the PR gate accepted warnings that `pnpm lint` rejects at release.
    assert.ok(args.includes('--max-warnings=0'))
    assert.deepEqual(args, [
      'pnpm',
      '-C',
      'packages/tuffex',
      'exec',
      'eslint',
      '--cache',
      '--max-warnings=0',
      '--no-warn-ignored',
      'src/index.ts',
    ])
  })

  it('passes --max-warnings=0 for the root pass too', () => {
    const args = buildRootArgs(['scripts/a.mjs'])

    assert.ok(args.includes('--max-warnings=0'))
    assert.deepEqual(args, [
      'pnpm',
      'exec',
      'eslint',
      '--cache',
      '--max-warnings=0',
      '--no-warn-ignored',
      'scripts/a.mjs',
    ])
  })

  it('appends every file after the flags', () => {
    const args = buildWorkspaceArgs('apps/nexus', ['a.ts', 'b.vue'])

    assert.deepEqual(args.slice(-2), ['a.ts', 'b.vue'])
  })
})

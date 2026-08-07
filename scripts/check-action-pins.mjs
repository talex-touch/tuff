#!/usr/bin/env node
/**
 * Requires every third-party GitHub Action to be pinned to a full commit SHA.
 *
 * A tag is mutable and a branch doubly so. `dtolnay/rust-toolchain@stable` was a *branch*,
 * used in a workflow that also holds NPM_TOKEN, RELEASE_SIGNING_PRIVATE_KEY and the Apple
 * notarization credentials (#546). If that repo is compromised, moving the ref is enough to
 * run attacker code inside a job holding publishing keys — no release, no review, no diff.
 *
 * `actions/*` is exempt: it is GitHub's own namespace, published from the same platform that
 * runs the workflow, and pinning it buys nothing that trusting the runner does not already
 * concede. Everything else must be a SHA.
 *
 * Read-only. `--self-test` proves the detector fires, because a pin checker that matches
 * nothing looks exactly like a fully pinned repository.
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = path.join(ROOT, '.github', 'workflows')

/** Owners whose actions may stay on a major tag, with the reason. */
const EXEMPT_OWNERS = {
  actions: 'GitHub\'s own namespace, served by the same platform that runs the workflow.',
}

const USES = /^\s*(?:-\s*)?uses:\s*([A-Za-z0-9._-]+)\/([A-Za-z0-9._/-]+)@(\S+)/
const FULL_SHA = /^[0-9a-f]{40}$/

export function findUnpinned(files, readFile, exempt = EXEMPT_OWNERS) {
  const problems = []
  for (const file of files) {
    const text = readFile(file)
    if (!text) continue
    text.split('\n').forEach((line, index) => {
      const match = USES.exec(line)
      if (!match) return
      const [, owner, repo, ref] = match
      if (owner in exempt) return
      // A local composite action (./.github/workflows/x.yml) never matches USES.
      if (FULL_SHA.test(ref)) return
      problems.push({ file, line: index + 1, action: `${owner}/${repo}`, ref })
    })
  }
  return problems
}

function listWorkflows() {
  return readdirSync(WORKFLOWS)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
}

function readWorkflow(file) {
  try {
    return readFileSync(path.join(WORKFLOWS, file), 'utf8')
  }
  catch {
    return null
  }
}

function selfTest() {
  const cases = [
    {
      name: 'a third-party action on a major tag is caught',
      text: '      - uses: pnpm/action-setup@v6\n',
      expect: 1,
    },
    {
      name: 'a third-party action on a branch is caught',
      text: '      - uses: dtolnay/rust-toolchain@stable\n',
      expect: 1,
    },
    {
      name: 'a full SHA is accepted',
      text: '      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10\n',
      expect: 0,
    },
    {
      name: 'a short SHA is not accepted as a pin',
      text: '      - uses: pnpm/action-setup@0977fd9\n',
      expect: 1,
    },
    {
      name: 'the actions/ namespace is exempt',
      text: '      - uses: actions/checkout@v7\n',
      expect: 0,
    },
    {
      name: 'a reusable local workflow is not an action reference',
      text: '    uses: ./.github/workflows/package-ci.yml\n',
      expect: 0,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = findUnpinned(['fixture.yml'], () => testCase.text)
    const ok = found.length === testCase.expect
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok) {
      failures += 1
      console.log(`     expected ${testCase.expect}, got ${found.length}: ${JSON.stringify(found)}`)
    }
  }

  const real = findUnpinned(listWorkflows(), readWorkflow)
  console.log(`${real.length === 0 ? 'ok  ' : 'FAIL'} the real workflows are fully pinned`)
  if (real.length > 0) {
    failures += 1
    for (const p of real) console.log(`     ${p.file}:${p.line} ${p.action}@${p.ref}`)
  }
  return failures
}

function main() {
  if (process.argv.includes('--self-test'))
    process.exit(selfTest() > 0 ? 1 : 0)

  const files = listWorkflows()
  const problems = findUnpinned(files, readWorkflow)
  if (problems.length > 0) {
    console.error('[action-pins] third-party actions on a mutable ref:\n')
    for (const p of problems)
      console.error(`  - ${p.file}:${p.line}  ${p.action}@${p.ref}`)
    console.error(
      '\nPin to a full commit SHA and keep the version in a trailing comment, so Dependabot'
      + '\nstill updates it:\n'
      + '\n    uses: owner/action@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10\n'
      + '\nResolve one with:  gh api /repos/<owner>/<action>/commits/<ref> --jq .sha',
    )
    process.exit(1)
  }

  const exempt = Object.keys(EXEMPT_OWNERS).join(', ')
  console.log(
    `[action-pins] ${files.length} workflows: every third-party action is SHA-pinned `
    + `(${exempt}/* exempt)`,
  )
}

// Guarded so findUnpinned can be imported without running the check — without this, an
// `import` of this module prints a verdict, which is exactly how my own adversarial test
// of it produced a misleading pass.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main()

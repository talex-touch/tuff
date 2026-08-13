#!/usr/bin/env node
/**
 * Says why the packaged Linux app did not start, from what it printed (#213).
 *
 * #213 has been open since 2025-11-14. The reporter answered three times -- "还没兼容吗" -- and never
 * sent the one diagnostic bit the thread was waiting on. Nine months of waiting on a person is a
 * signal about the process, not about them: nothing in this repository has ever started the Linux
 * artifact. `build-and-release.yml` counts `.AppImage` and `.deb` files and asserts the count is
 * non-zero. A file that exists and a file that runs are different claims, and only the first one
 * was ever checked.
 *
 * The build already runs on `ubuntu-24.04` -- pinned in the matrix, the exact platform in the
 * report -- so the reproduction environment was there the whole time. All that was missing was
 * launching the thing.
 *
 * This does the reading half. A launch failure prints many lines and one of them says why; a step
 * that only reports "exit 1" turns a specific, fixable cause into an unspecific one, which is how
 * this issue spent nine months on "please send logs".
 *
 * Ordering matters: a missing shared library and a denied sandbox both end in a non-zero exit, and
 * the sandbox message is the one #213 is about, so it is matched first.
 */
import fs from 'node:fs'
import process from 'node:process'

/**
 * Ubuntu 24.04 sets `kernel.apparmor_restrict_unprivileged_userns=1`, which stops Electron from
 * creating its sandbox. `.deb` installs carry an AppArmor profile -- electron-builder's
 * `FpmTarget` falls back to a built-in `apparmor-profile.tpl` even when `appArmorProfile` is unset,
 * so this repo gets one without configuring it. An AppImage is a file the user runs, not a package
 * that installs anything, so it gets no profile and no exemption.
 *
 * That asymmetry is the whole reason the thread needed to know which artifact was used.
 */
const SANDBOX_PATTERNS = [
  /SUID sandbox helper binary was found, but is not configured correctly/i,
  /setuid_sandbox_host\.cc/i,
  /Failed to move to new namespace/i,
  /clone\(\) returned -1/i,
  /No usable sandbox/i,
  /namespace sandbox/i,
  /apparmor_restrict_unprivileged_userns/i,
]

/** A runner missing an Electron runtime dependency, which is a CI problem and not a product one. */
const MISSING_LIBRARY_PATTERNS = [
  /error while loading shared libraries: (lib[\w.+-]+)/i,
  /cannot open shared object file/i,
]

/** No X server. Also a CI problem: the step is supposed to provide one. */
const NO_DISPLAY_PATTERNS = [
  /Missing X server or \$DISPLAY/i,
  /cannot open display/i,
  /Unable to open X display/i,
]

export function classifyLaunch({ output, exitCode, stayedAlive }) {
  const text = String(output ?? '')

  // Checked before the exit code, not after. A sandbox refusal can appear on a run that was killed
  // by the timeout rather than exiting, and reporting that one as "started" would be the same
  // false pass this whole check exists to remove.
  if (SANDBOX_PATTERNS.some(pattern => pattern.test(text)))
    return { verdict: 'sandbox-denied', product: true }

  if (NO_DISPLAY_PATTERNS.some(pattern => pattern.test(text)))
    return { verdict: 'no-display', product: false }

  for (const pattern of MISSING_LIBRARY_PATTERNS) {
    const match = pattern.exec(text)
    if (match)
      return { verdict: 'missing-library', product: false, detail: match[1] }
  }

  if (stayedAlive)
    return { verdict: 'ok', product: false }

  return { verdict: 'unknown-exit', product: true, detail: `exit ${exitCode}` }
}

const DESCRIPTIONS = {
  'sandbox-denied': 'The app could not create its sandbox. This is #213: Ubuntu 24.04 restricts '
    + 'unprivileged user namespaces, a .deb carries an AppArmor profile and an AppImage cannot.',
  'no-display': 'No X server was available. The smoke step is supposed to provide one, so this is '
    + 'a problem with the step rather than with the build.',
  'missing-library': 'The runner is missing an Electron runtime dependency. A CI environment gap, '
    + 'not a product defect -- add the package rather than changing the app.',
  'unknown-exit': 'The app exited without printing anything this recognises. The captured output '
    + 'is the only evidence; read it rather than assuming a cause.',
  'ok': 'The packaged app started and was still running when the window opened.',
}

function main(argv) {
  const outputPath = argv[0]
  const exitCode = Number(argv[1] ?? 0)
  const stayedAlive = argv[2] === 'alive'

  if (!outputPath || !fs.existsSync(outputPath)) {
    console.error(`classify-linux-launch: no captured output at ${outputPath ?? '<missing>'}.`)
    console.error('Refusing to report a verdict with nothing to read -- an empty log is not a pass.')
    return 1
  }

  const output = fs.readFileSync(outputPath, 'utf8')
  const result = classifyLaunch({ output, exitCode, stayedAlive })

  console.log(`verdict: ${result.verdict}`)
  console.log(DESCRIPTIONS[result.verdict])
  if (result.detail)
    console.log(`detail: ${result.detail}`)

  if (result.verdict === 'ok')
    return 0

  console.error('\n--- captured output ---')
  console.error(output.trim().split('\n').slice(-40).join('\n'))
  return 1
}

function selfTest() {
  const cases = [
    {
      name: 'a clean start is ok',
      actual: classifyLaunch({ output: 'ready', exitCode: 0, stayedAlive: true }).verdict,
      expected: 'ok',
    },
    // The message #213 is about, in the two spellings Electron actually prints.
    {
      name: 'the SUID helper message is the sandbox verdict',
      actual: classifyLaunch({
        output: 'The SUID sandbox helper binary was found, but is not configured correctly',
        exitCode: 1,
        stayedAlive: false,
      }).verdict,
      expected: 'sandbox-denied',
    },
    {
      name: 'the setuid_sandbox_host trace is the sandbox verdict',
      actual: classifyLaunch({
        output: 'FATAL:setuid_sandbox_host.cc(158)',
        exitCode: 133,
        stayedAlive: false,
      }).verdict,
      expected: 'sandbox-denied',
    },
    {
      name: 'the namespace failure is the sandbox verdict',
      actual: classifyLaunch({
        output: 'Failed to move to new namespace: PID namespaces supported',
        exitCode: 1,
        stayedAlive: false,
      }).verdict,
      expected: 'sandbox-denied',
    },
    {
      name: 'the sysctl name itself is the sandbox verdict',
      actual: classifyLaunch({
        output: 'kernel.apparmor_restrict_unprivileged_userns is 1',
        exitCode: 1,
        stayedAlive: false,
      }).verdict,
      expected: 'sandbox-denied',
    },
    // The ordering case. A run killed by the timeout is "alive", and reporting a sandbox refusal
    // as a successful start is the false pass this exists to prevent.
    {
      name: 'a sandbox refusal outranks having stayed alive',
      actual: classifyLaunch({
        output: 'No usable sandbox! Update your kernel',
        exitCode: 0,
        stayedAlive: true,
      }).verdict,
      expected: 'sandbox-denied',
    },
    { name: 'a sandbox failure is a product problem', actual: classifyLaunch({ output: 'No usable sandbox', exitCode: 1, stayedAlive: false }).product, expected: true },
    {
      name: 'a missing library is a CI problem, not a product one',
      actual: classifyLaunch({
        output: 'error while loading shared libraries: libgbm.so.1',
        exitCode: 127,
        stayedAlive: false,
      }).product,
      expected: false,
    },
    {
      name: 'the missing library is named',
      actual: classifyLaunch({
        output: 'error while loading shared libraries: libgbm.so.1: cannot open shared object file',
        exitCode: 127,
        stayedAlive: false,
      }).detail,
      expected: 'libgbm.so.1',
    },
    {
      name: 'a missing display blames the step, not the build',
      actual: classifyLaunch({
        output: 'Missing X server or $DISPLAY',
        exitCode: 1,
        stayedAlive: false,
      }).product,
      expected: false,
    },
    {
      name: 'the sandbox check wins over a missing library on the same run',
      actual: classifyLaunch({
        output: 'error while loading shared libraries: libx.so\nNo usable sandbox!',
        exitCode: 1,
        stayedAlive: false,
      }).verdict,
      expected: 'sandbox-denied',
    },
    {
      name: 'an unrecognised exit says so instead of guessing',
      actual: classifyLaunch({ output: 'segfault', exitCode: 139, stayedAlive: false }).verdict,
      expected: 'unknown-exit',
    },
    { name: 'an unrecognised exit carries the code', actual: classifyLaunch({ output: 'x', exitCode: 139, stayedAlive: false }).detail, expected: 'exit 139' },
    { name: 'an unrecognised exit is treated as a product problem', actual: classifyLaunch({ output: 'x', exitCode: 139, stayedAlive: false }).product, expected: true },
    { name: 'empty output with a live process is still ok', actual: classifyLaunch({ output: '', exitCode: 0, stayedAlive: true }).verdict, expected: 'ok' },
    { name: 'empty output with a dead process is not ok', actual: classifyLaunch({ output: '', exitCode: 1, stayedAlive: false }).verdict, expected: 'unknown-exit' },
    { name: 'null output does not throw', actual: classifyLaunch({ output: null, exitCode: 0, stayedAlive: true }).verdict, expected: 'ok' },
    { name: 'matching is case-insensitive', actual: classifyLaunch({ output: 'NO USABLE SANDBOX', exitCode: 1, stayedAlive: false }).verdict, expected: 'sandbox-denied' },
    { name: 'every verdict has a description', actual: Object.keys(DESCRIPTIONS).length, expected: 5 },
  ]

  let failed = 0
  for (const testCase of cases) {
    if (!Object.is(testCase.actual, testCase.expected)) {
      failed += 1
      console.error(`  x ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`)
    }
  }
  console.log(
    failed === 0
      ? `classify-linux-launch --self-test: ${cases.length} cases passed`
      : `classify-linux-launch --self-test: ${failed} of ${cases.length} cases failed`,
  )
  return failed
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)
else process.exit(main(process.argv.slice(2)))

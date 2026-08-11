#!/usr/bin/env node
/**
 * Stops new transparent windows shipping without a background colour (#806).
 *
 * `touch-window.ts` branches `darwin` -> vibrancy, `win32` -> mica/acrylic, and falls through
 * with no `else`. Linux is a shipped target -- `electron-builder.yml` builds AppImage and deb --
 * so on a desktop without a compositor, or one that handles ARGB visuals differently, a
 * `transparent: true` window with no `backgroundColor` renders black or invisible. There is no
 * fallback to catch it, and nothing in the tree detects a compositor.
 *
 * Six of the eight window option sets are in that shape today. Fixing them is a rendering change
 * on a platform this repo has no runner for, so it needs someone who can look at the result --
 * that is the decision on #806. What needs no decision is that a seventh should not appear while
 * that waits, because each one lands silently: it looks correct on macOS and Windows, which is
 * where it gets reviewed.
 *
 * A ratchet, not a fix. The number below is a debt, and lowering it is the repair. It fails in
 * both directions so a repair moves the floor with it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WINDOW_CONFIG = path.join(REPO_ROOT, 'apps/core-app/src/main/config/default.ts')

/** Window option sets that are transparent with no `backgroundColor`, as of the pin. */
export const KNOWN_TRANSPARENT_WITHOUT_BACKGROUND = 6

/** Every exported `*WindowOption` in the config, with the two fields that matter. */
export function readWindowOptions() {
  const source = readFileSync(WINDOW_CONFIG, 'utf8')
  const blocks = source.split(/(?=^export const \w+WindowOption)/m)

  return blocks
    .map((block) => {
      const name = /^export const (\w+WindowOption)/.exec(block)?.[1]
      if (!name)
        return null

      const transparent = /^\s*transparent:\s*(true|false)/m.exec(block)?.[1]
      return {
        name,
        transparent: transparent === 'true',
        hasBackgroundColor: /^\s*backgroundColor:/m.test(block),
      }
    })
    .filter(Boolean)
}

/** The subset with nothing to fall back to when the compositor does not cooperate. */
export function transparentWithoutBackground(options = readWindowOptions()) {
  return options.filter(option => option.transparent && !option.hasBackgroundColor)
}

function main() {
  const options = readWindowOptions()
  const risky = transparentWithoutBackground(options)

  if (risky.length > KNOWN_TRANSPARENT_WITHOUT_BACKGROUND) {
    process.stderr.write(
      `[check-transparent-window-debt] ${risky.length} window options are transparent with no `
      + `backgroundColor, up from ${KNOWN_TRANSPARENT_WITHOUT_BACKGROUND}: `
      + `${risky.map(option => option.name).join(', ')}\n`,
    )
    process.exit(1)
  }

  if (risky.length < KNOWN_TRANSPARENT_WITHOUT_BACKGROUND) {
    process.stderr.write(
      `[check-transparent-window-debt] only ${risky.length} remain, down from `
      + `${KNOWN_TRANSPARENT_WITHOUT_BACKGROUND}. Lower KNOWN_TRANSPARENT_WITHOUT_BACKGROUND to `
      + `${risky.length} so the floor moves with the repair.\n`,
    )
    process.exit(1)
  }

  process.stdout.write(
    `[check-transparent-window-debt] holds at ${risky.length} of ${options.length} window options\n`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}

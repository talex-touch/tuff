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
 * Six of the eight window option sets are in that shape, and #806 decided they stay that way.
 * Giving them all an opaque backgroundColor was the audit's suggestion and was rejected: most
 * Linux desktops do composite, so a blanket default would flatten the launcher's translucency
 * for all of them to protect the ones that cannot show it. What shipped instead is
 * TUFF_OPAQUE_WINDOWS=1 -- a way out reachable from outside a window you cannot see.
 *
 * So the number below is not debt awaiting repair, and lowering it is not the fix. It is a count
 * of a deliberate default, held so a seventh cannot join it without the same consideration:
 * each one lands silently, because it looks correct on macOS and Windows, which is where it gets
 * reviewed. It fails in both directions so that a window genuinely gaining a backgroundColor
 * moves the floor rather than leaving room for a new one.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WINDOW_CONFIG = path.join(REPO_ROOT, 'apps/core-app/src/main/config/default.ts')

/** Window option sets that are transparent with no `backgroundColor`, by design (#806). */
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
      `[check-transparent-window-debt] only ${risky.length} are transparent without a `
      + `backgroundColor, down from ${KNOWN_TRANSPARENT_WITHOUT_BACKGROUND}. If that was `
      + `intended, lower KNOWN_TRANSPARENT_WITHOUT_BACKGROUND to ${risky.length} so the floor `
      + `moves with it; #806 decided these six stay, so check that the change was deliberate.\n`,
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

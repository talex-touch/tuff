#!/usr/bin/env node
/**
 * Detects a `node_modules/.bin` whose shims point outside this checkout (#1564).
 *
 * pnpm writes each shim's exec target as a path *relative to the shim*, and `sh` resolves
 * `../..` lexically rather than through symlinks. So a `pnpm install` run from a git worktree
 * whose `node_modules` is a symlink to another checkout writes paths computed at the
 * worktree's depth into the `.bin` both checkouts share. They then resolve correctly from
 * whichever depth they were written for, and one directory too shallow from the other.
 *
 * What that looks like in practice is every tool failing at once — `lint-staged`, `eslint`,
 * `prettier` — with a `Cannot find module` naming a path nobody recognises:
 *
 *   Cannot find module '/Users/.../Workspace/talex-touch/node_modules/lint-staged/bin/...'
 *                                       ^^^^^^^^^^^^ one level above the real checkout
 *
 * Nothing in the repository is wrong, which is exactly why it costs so much to work out:
 * a clean clone never reproduces it, and the same commit succeeds from the other checkout.
 *
 * This turns that into one line naming the remedy. It is a *detector*, not a fix — the fix
 * is `pnpm install` from the checkout you are committing in, and not sharing one
 * `node_modules` between checkouts at different depths.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Tools the commit hook cannot run without. */
const REQUIRED = ['lint-staged', 'eslint', 'prettier']

/**
 * The file a shim would hand to node, resolved the way `sh` does it: lexically from the
 * shim's own directory, without following symlinks.
 */
export function shimTarget(shimPath, contents) {
  const match = contents.match(/exec (?:"\$basedir\/node"|node)\s+"\$basedir\/([^"]+)"/)
  if (!match)
    return null
  return path.resolve(path.dirname(shimPath), match[1])
}

/** Every required shim whose target does not exist. */
export function brokenShims(binDir, required = REQUIRED) {
  const broken = []
  for (const name of required) {
    const shimPath = path.join(binDir, name)
    if (!existsSync(shimPath))
      continue

    const target = shimTarget(shimPath, readFileSync(shimPath, 'utf8'))
    if (target && !existsSync(target))
      broken.push({ name, target })
  }
  return broken
}

function main() {
  const binDir = path.join(REPO_ROOT, 'node_modules', '.bin')
  if (!existsSync(binDir)) {
    console.error('[check-bin-shims] node_modules/.bin is missing — run `pnpm install`.')
    process.exit(1)
  }

  const broken = brokenShims(binDir)
  if (!broken.length)
    return

  console.error(
    `[check-bin-shims] ${broken.length} of ${REQUIRED.length} required tools resolve outside this checkout:\n`,
  )
  for (const { name, target } of broken) console.error(`  ${name} -> ${target}`)
  console.error(`
This is a local install, not the repository. The shims carry paths relative to the depth of
whichever checkout last ran \`pnpm install\`, and \`sh\` resolves them lexically — so a shared
node_modules cannot serve two checkouts at different depths.

  Fix:  pnpm install        (from ${REPO_ROOT})
  And:  give each git worktree its own node_modules rather than symlinking another checkout's.

Skipping the hook with HUSKY=0 leaves the next commit to hit the same wall.`)
  process.exit(1)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  main()

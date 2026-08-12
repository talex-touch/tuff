import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Everything `tuff-cli` marks external must be declared as a runtime dependency (#1509).
 *
 * `tsup.config.ts` listed `glob` in `external`, so the bundle kept `import … from 'glob'`, and
 * `package.json` declared it nowhere. The import comes from `@talex-touch/tuff-cli-core`, which is
 * in `noExternal` and therefore inlined — its own correct `glob` declaration does not travel with
 * the code that gets bundled, and it is only a devDependency of `tuff-cli` besides.
 *
 * That resolved for months through hoisting into the workspace root, and stopped the moment
 * something installed without dev packages. The Windows production gate does exactly that — it
 * installs from a pruned temporary lockfile — so on 2026-08-10 every open pull request went red at
 * once, on branches with nothing in common. Anyone installing the published package from npm hits
 * the same thing.
 *
 * The static rule is sufficient here rather than merely convenient: tsup already externalizes every
 * declared dependency, and node builtins are external under `platform: 'node'`. So a bare import can
 * only reach `dist/` through this `external` array, through a declaration, or through a builtin —
 * and this pins the first case to the second.
 *
 * This lives in packages/utils on purpose: `ci / CI - utils` is a blocking check, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const CLI_ROOT = path.resolve(__dirname, '../../tuff-cli')

const config = readFileSync(path.join(CLI_ROOT, 'tsup.config.ts'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** String literals inside a named array in the config source. */
function arrayLiteral(name: string): string[] {
  const start = config.indexOf(`${name} = [`)
  if (start === -1)
    return []
  const body = config.slice(start, config.indexOf(']', start))
  return [...body.matchAll(/'([^']+)'/g)].map(match => match[1])
}

/** `external:` entries, minus the spread of optional engines, which nothing ever imports. */
function externals(): string[] {
  const start = config.indexOf('external: [')
  const body = config.slice(start, config.indexOf(']', start))
  return [...body.matchAll(/'([^']+)'/g)].map(match => match[1])
}

const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
])

describe('tuff-cli externals', () => {
  it('reads the config and manifest it means to check', () => {
    // Positive control. "Nothing undeclared" is also what an unreadable config reports, and the
    // rule below is vacuous against an empty externals list.
    expect(externals().length).toBeGreaterThan(5)
    expect(declared.size).toBeGreaterThan(5)
    expect(arrayLiteral('const vueCompilerOptionalTemplateEngines').length).toBeGreaterThan(20)
  })

  it('are each declared as a runtime dependency', () => {
    const undeclared = externals().filter(name => !declared.has(name))

    expect(undeclared).toEqual([])
  })

  it('declares glob, whose absence broke the Windows gate', () => {
    // Named explicitly so deleting it from `external` cannot satisfy the rule above while the
    // bundled tuff-cli-core still imports it.
    expect(manifest.dependencies).toHaveProperty('glob')
  })

  it('does not lean on a devDependency to supply a bundled import', () => {
    // tuff-cli-core is inlined, so anything it needs at runtime belongs to tuff-cli itself. A
    // pruned install has no devDependencies to hoist from.
    const devOnly = externals().filter(name => name in (manifest.devDependencies ?? {})
      && !declared.has(name))

    expect(devOnly).toEqual([])
  })
})

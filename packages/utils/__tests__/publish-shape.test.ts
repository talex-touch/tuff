import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The published package must be loadable by Node (#566).
 *
 * @talex-touch/utils is public, and its entry was `index.ts` — a raw TypeScript barrel whose
 * re-exports are extensionless directory specifiers. Node 24 strips the types, reparses as ESM and
 * then cannot resolve `./account`, so `import '@talex-touch/utils'` failed outright with
 * ERR_UNSUPPORTED_DIR_IMPORT. Only the in-repo Vite aliases hid it.
 *
 * The fix publishes a bundle. What is worth pinning is not that decision but the three things
 * measured along the way, each of which looks like an improvement and is not:
 *
 * 1. Publishing TypeScript can never work, whatever the specifiers say. Even with `./account/index.ts`
 *    written out in full, Node refuses: ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING. And adding those
 *    extensions in source breaks the core-app typecheck, which has no allowImportingTsExtensions.
 * 2. An `exports` map is the usual advice and would be a serious regression here. Subpath patterns
 *    resolve to exact files: neither Node nor esbuild falls through a fallback array when the first
 *    target is merely missing. Mapping the wildcard to itself breaks every deep import, and a
 *    fallback of star-dot-ts then star-slash-index-dot-ts breaks the directory half — measured
 *    against 144 in-repo subpaths. With no exports map, classic resolution keeps them all working
 *    exactly as before.
 * 3. `main` has to be the ESM output. Pointed at the CJS build, `import` goes through
 *    cjs-module-lexer and yields 2 named exports instead of 610; pointed at `.mjs`, `require()`
 *    still works because Node ≥22.12 can require ESM, and engines already demands ≥24.15.
 */

const ROOT = path.resolve(__dirname, '..')
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  main: string
  files: string[]
  scripts: Record<string, string>
  exports?: unknown
  publishConfig: Record<string, string>
  engines: { node: string }
}

describe('published entry points', () => {
  it('resolves to built JavaScript, not to a source barrel', () => {
    const { publishConfig } = manifest

    expect(publishConfig.main).toBe('./dist/index.mjs')
    expect(publishConfig.module).toBe('./dist/index.mjs')
    expect(publishConfig.types).toBe('./dist/index.d.mts')
    for (const field of ['main', 'module', 'types']) {
      expect(publishConfig[field]).not.toMatch(/\.ts$/)
    }
  })

  it('keeps the in-repo entry on source, so nothing here changes how the app resolves it', () => {
    // Positive control, and the reason publishConfig is used at all: every assertion above would
    // also hold if the package had simply been switched to dist, which would make the app bundle a
    // prebuilt copy alongside the sources it already compiles — two instances of every singleton.
    expect(manifest.main).toBe('index.ts')
    expect(manifest.exports).toBeUndefined()
  })

  it('publishes through pnpm, which is what applies publishConfig', () => {
    // npm only understands registry/tag/access there. Run `npm publish` and the tarball keeps
    // main: "index.ts" — the bug ships again with every field of the fix present in the repo.
    expect(manifest.scripts.publish).toContain('pnpm publish')
    expect(manifest.scripts.publish).not.toMatch(/\bnpm publish\b/)
  })

  it('builds before publishing and ships the result', () => {
    expect(manifest.scripts.prepublishOnly).toBe('pnpm run build')
    expect(manifest.scripts.build).toContain('--out-dir dist')
    expect(manifest.files).toContain('dist')
  })

  it('requires a Node new enough to require() the ESM entry', () => {
    // main is .mjs, so CJS consumers depend on require(esm) — Node 22.12+.
    const minimum = /(\d+)/.exec(manifest.engines.node)?.[1]

    expect(Number(minimum)).toBeGreaterThanOrEqual(23)
  })
})

describe('bare specifiers the ESM bundle emits', () => {
  const source = readFileSync(
    path.join(ROOT, 'core-box/preview/abilities/time-delta-ability.ts'),
    'utf8'
  )

  it('gives dayjs plugin subpaths an explicit extension', () => {
    // Bundlers resolve `dayjs/plugin/duration`; Node ESM does not, and these stay external in the
    // bundle. Without the extension the built entry throws ERR_MODULE_NOT_FOUND on import — which
    // is the same failure #566 reports, just moved one level down.
    expect(source).toContain('dayjs/plugin/duration.js')
    expect(source).toContain('dayjs/plugin/relativeTime.js')
    expect(source).not.toMatch(/["']dayjs\/plugin\/[a-zA-Z]+["']/)
  })

  it('is reading the file it thinks it is', () => {
    // The assertion above is three greps; an empty or renamed file would satisfy the negative one.
    expect(source).toContain('import dayjs from')
  })
})

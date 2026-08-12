import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The BaseModule snippet in CLAUDE.md must be a signature you can actually extend (#627).
 *
 * It used to show an un-parameterised class with no constructor. A subclass written from it does
 * not compile — the implicit `super()` wants 1-3 arguments — and once that is patched blindly the
 * module has no ModuleKey, so ModuleManager has nothing to register the singleton under. The
 * snippet was wrong in the one way that costs a reader the most: it looked complete.
 *
 * Each line the doc declares is checked against the real declaration rather than against a copy of
 * itself, so the two cannot drift apart silently.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..')
const SOURCE = readFileSync(path.join(__dirname, 'abstract-base-module.ts'), 'utf8')
const CLAUDE_MD = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8')

const snippets = [...CLAUDE_MD.matchAll(/```typescript\n([\s\S]*?)```/g)].map((match) => match[1]!)
const baseSnippet = snippets.find((snippet) => snippet.includes('abstract class BaseModule'))
const subclassSnippet = snippets.find((snippet) => snippet.includes('extends BaseModule'))

describe('CLAUDE.md BaseModule snippet', () => {
  it('finds both blocks', () => {
    // Positive control: every assertion below passes vacuously against undefined-turned-empty.
    expect(baseSnippet).toBeDefined()
    expect(subclassSnippet).toBeDefined()
    expect(SOURCE).toContain('abstract class BaseModule')
  })

  it('declares the class exactly as the source does', () => {
    // The generic is not decoration — all five lifecycle contexts are ModuleXContext<E>.
    const declaration =
      'abstract class BaseModule<E = TalexEvents> implements TalexTouch.IModule<E>'

    expect(SOURCE).toContain(`export ${declaration} {`)
    expect(baseSnippet).toContain(declaration)
  })

  it('shows the protected constructor that supplies the module key', () => {
    const constructorSignature =
      'protected constructor(key: ModuleKey, file?: ModuleFileConfig, env?: ModuleEnvFlag)'

    expect(SOURCE).toContain(constructorSignature)
    expect(baseSnippet).toContain(constructorSignature)
  })

  it('parameterises every lifecycle context', () => {
    for (const method of ['onInit', 'onDestroy', 'created', 'start', 'stop']) {
      expect(baseSnippet).toMatch(new RegExp(`${method}\\??\\(ctx: Module\\w+Context<E>\\)`))
    }
    // And does not still show the bare form the reader would copy.
    expect(baseSnippet).not.toMatch(/ctx: Module\w+Context\)/)
  })

  it('warns that init and destroy are not the override points', () => {
    // Both are concrete here and call onInit / onDestroy; overriding them drops filePath assignment.
    expect(SOURCE).toMatch(/\binit\(ctx: ModuleInitContext<E>\)[^\n]*\{/)
    expect(SOURCE).toContain('return this.onInit(ctx)')
    expect(CLAUDE_MD).toContain('override `onInit` / `onDestroy`, never those')
  })
})

describe('CLAUDE.md subclass example', () => {
  it('passes its key to super, as real modules do', () => {
    expect(subclassSnippet).toMatch(/static key: symbol = Symbol\.for\(/)
    expect(subclassSnippet).toMatch(/super\(\w+\.key/)
  })

  it('matches the shape of a module that actually loads', () => {
    // AddonOpenerModule is in foregroundModulesToLoad, so this is a shape known to work rather
    // than one invented for the doc.
    const real = readFileSync(path.join(__dirname, 'addon-opener.ts'), 'utf8')

    expect(real).toMatch(/static key: symbol = Symbol\.for\(/)
    expect(real).toMatch(/super\(AddonOpenerModule\.key/)
  })
})

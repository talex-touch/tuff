import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectPascalCaseIdentifiers } from './helpers/js-text'
import { deriveComponentEntry } from './helpers/nuxt-component-names'
import { fileExists, formatViolations, listFiles, loadSources, nexusRoot, readSource } from './helpers/repo'
import { parseSfc, walkElements } from './helpers/sfc'
import type { ComponentEntry } from './helpers/nuxt-component-names'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 1 — a component that lives in a nested `app/components/` subdirectory
 * cannot be used under its bare file name.
 *
 * The case this was written for: `app/components/admin/AccountTabs.vue`
 * auto-imported as `AdminAccountTabs`, but four admin pages wrote
 * `<AccountTabs />`. Vue could not resolve it, logged a dev-only `Failed to
 * resolve component` warning, and rendered nothing at all — so the subscriptions
 * and doc-comments tab bars silently never existed.
 *
 * Those tab strips have since been deleted outright (the console navigates by
 * rail now), so the rule is exercised against a component drawn from the live
 * registry instead of the frozen fixtures: a guard whose only test subject no
 * longer exists stops proving anything.
 */

const RULE = 'component-auto-import'

/**
 * Paths removed from the auto-import registry by `nuxt.config.ts` — the
 * `components.dirs[].ignore` list plus the `components:extend` hook. Components
 * under these paths are only usable through an explicit import, exactly like a
 * mis-prefixed nested component. `nuxt-config-exclusions-are-current` below
 * fails if this copy drifts from `nuxt.config.ts`.
 */
const CONFIGURED_EXCLUSIONS = [
  '/app/components/content/demos/',
  '/app/components/content/demo-registry.ts',
  '/app/components/content/demo-loader.ts',
  '/app/components/content/demo-lazy.ts',
  '/app/components/content/demo-registry-loader.ts',
  '/app/components/content/TuffCodeBlockRenderer.vue',
  '/app/components/store/',
  '/app/components/tuff/',
  '/app/components/theme/components/',
]

/**
 * Names Vue or a Nuxt module resolves without any `app/components` file. Only
 * consulted when a same-named component file also exists, so this list stays
 * short on purpose.
 */
const FRAMEWORK_PROVIDED = new Set([
  'Component',
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Teleport',
  'Suspense',
  'ClientOnly',
  'DevOnly',
  'ServerPlaceholder',
  'NuxtLink',
  'NuxtPage',
  'NuxtLayout',
  'NuxtLoadingIndicator',
  'NuxtErrorBoundary',
  'NuxtIsland',
  'NuxtImg',
  'NuxtPicture',
  'NuxtRouteAnnouncer',
  'Icon',
  'Head',
  'Title',
  'Meta',
  'Link',
  'Style',
  'Body',
  'Html',
  'NoScript',
  'Base',
])

export interface ComponentRegistry {
  entries: ComponentEntry[]
  byAutoImportName: Map<string, ComponentEntry[]>
  byBaseName: Map<string, ComponentEntry[]>
}

function isExcludedFromAutoImport(relativePath: string): boolean {
  const absoluteish = `/${relativePath}`
  return CONFIGURED_EXCLUSIONS.some(exclusion =>
    exclusion.endsWith('/') ? absoluteish.startsWith(exclusion) : absoluteish === exclusion,
  )
}

export function buildComponentRegistry(componentPaths: string[]): ComponentRegistry {
  const entries = componentPaths.map(path => deriveComponentEntry(path))
  const byAutoImportName = new Map<string, ComponentEntry[]>()
  const byBaseName = new Map<string, ComponentEntry[]>()
  for (const entry of entries) {
    const byName = byAutoImportName.get(entry.autoImportName) ?? []
    byName.push(entry)
    byAutoImportName.set(entry.autoImportName, byName)

    const byBase = byBaseName.get(entry.baseName) ?? []
    byBase.push(entry)
    byBaseName.set(entry.baseName, byBase)
  }
  return { entries, byAutoImportName, byBaseName }
}

function collectTemplateTags(file: SourceFile): Map<string, number> {
  const { templateRoot } = parseSfc(file.content, file.path)
  const tags = new Map<string, number>()
  walkElements(templateRoot, (element) => {
    const { tag } = element
    if (!/^[A-Z][A-Za-z0-9]*$/.test(tag))
      return
    if (!tags.has(tag))
      tags.set(tag, element.loc.start.line)
  })
  return tags
}

function collectLocalBindings(file: SourceFile): Set<string> {
  const { scriptSetup, script } = parseSfc(file.content, file.path)
  const names = new Set<string>()
  for (const block of [scriptSetup, script]) {
    if (!block)
      continue
    for (const name of collectPascalCaseIdentifiers(block.content))
      names.add(name)
  }
  return names
}

export function scanComponentAutoImports(files: SourceFile[], registry: ComponentRegistry): Violation[] {
  const violations: Violation[] = []

  for (const file of files) {
    const tags = collectTemplateTags(file)
    if (tags.size === 0)
      continue
    const bindings = collectLocalBindings(file)

    for (const [tag, line] of tags) {
      if (bindings.has(tag) || FRAMEWORK_PROVIDED.has(tag))
        continue

      const autoImported = registry.byAutoImportName.get(tag)
      if (autoImported?.some(entry => !isExcludedFromAutoImport(entry.path)))
        continue

      const candidates = registry.byBaseName.get(tag) ?? []
      // Nothing on disk answers to this name: a Nuxt module, layer or globally
      // registered library component. Out of scope for this guard.
      if (candidates.length === 0)
        continue

      const nested = candidates.filter(entry => entry.prefixParts.length > 0)
      const excluded = candidates.filter(entry => isExcludedFromAutoImport(entry.path))

      if (nested.length > 0) {
        const entry = nested[0]!
        violations.push({
          file: file.path,
          line,
          rule: RULE,
          message: `<${tag} /> does not resolve. ${entry.path} auto-imports as <${entry.autoImportName} />, `
            + `because Nuxt prefixes nested component directories. Vue renders nothing and only warns in dev. `
            + `Fix: add \`import ${tag} from '~/${entry.path.replace(/^app\//, '')}'\` to <script setup>, `
            + `or use <${entry.autoImportName} />.`,
        })
        continue
      }

      if (excluded.length > 0) {
        const entry = excluded[0]!
        violations.push({
          file: file.path,
          line,
          rule: RULE,
          message: `<${tag} /> does not resolve. ${entry.path} is excluded from auto-import by nuxt.config.ts `
            + `(components.dirs ignore / components:extend), so it must be imported explicitly. `
            + `Fix: add \`import ${tag} from '~/${entry.path.replace(/^app\//, '')}'\` to <script setup>.`,
        })
      }
    }
  }

  return violations
}

const componentPaths = listFiles('app/components', ['.vue'])
const registry = buildComponentRegistry(componentPaths)

describe('guard: nested components are never used under their bare file name', () => {
  it('derives the same auto-import names Nuxt does', () => {
    // Positive control for the derivation itself: `.nuxt/components.d.ts` is
    // written by Nuxt's own scanner. Without this the guard could be built on a
    // wrong naming rule and still report a confident, empty result.
    const generated = join(nexusRoot, '.nuxt/components.d.ts')
    if (!fileExists('.nuxt/components.d.ts')) {
      expect.soft(
        `.nuxt/components.d.ts is missing, so the naming rules in helpers/nuxt-component-names.ts were not `
        + `cross-checked against Nuxt this run. Run \`pnpm -C apps/nexus prepare\` to restore the check.`,
      ).toBe('')
      return
    }

    const declarations = readFileSync(generated, 'utf8')
    const nuxtNames = new Map<string, string>()
    for (const match of declarations.matchAll(/^export const (\w+): typeof import\("\.\.\/(app\/components\/[^"]+)"\)/gm)) {
      if (match[1]!.startsWith('Lazy'))
        continue
      nuxtNames.set(match[2]!, match[1]!)
    }

    expect(nuxtNames.size, 'no component declarations parsed out of .nuxt/components.d.ts').toBeGreaterThan(50)

    const mismatches: string[] = []
    for (const [path, expectedName] of nuxtNames) {
      const derived = deriveComponentEntry(path).autoImportName
      if (derived !== expectedName)
        mismatches.push(`${path}: Nuxt says ${expectedName}, guard derived ${derived}`)
    }
    expect(mismatches.join('\n')).toBe('')
  })

  it('keeps the nuxt.config.ts auto-import exclusions in sync', () => {
    // If someone adds a directory to components:extend, components under it stop
    // auto-importing; the guard must learn about it or it will under-report.
    const config = readSource('nuxt.config.ts').content
    const declared = new Set(
      [...config.matchAll(/'(\/app\/components\/[^']*)'/g)].map(match => match[1]!),
    )
    const known = new Set(CONFIGURED_EXCLUSIONS)
    const missing = [...declared].filter(entry => !known.has(entry))
    const stale = [...known].filter(entry => !declared.has(entry))
    expect(
      [
        ...missing.map(entry => `nuxt.config.ts excludes ${entry} but the guard does not know about it`),
        ...stale.map(entry => `the guard lists ${entry} but nuxt.config.ts no longer excludes it`),
      ].join('\n'),
    ).toBe('')
  })

  it('flags a nested component used under its bare file name', () => {
    // The rule this guard exists for, exercised against a synthetic case rather
    // than the historical `<AccountTabs />` fixtures: those pinned a bug in two
    // pages whose tab strips have since been deleted outright, so the component
    // they named no longer resolves to anything in the live registry and the
    // assertion had nothing left to describe.
    const entry = registry.entries.find(
      value => value.autoImportName !== value.baseName
        && (registry.byBaseName.get(value.baseName) ?? []).length === 1,
    )

    // Positive control: an empty registry, or one where nesting stopped
    // changing the name, would make the scan below trivially clean.
    expect(entry, 'no nested component in the registry to exercise the rule with').toBeTruthy()

    const bare = entry!.baseName
    const violations = scanComponentAutoImports([{
      path: 'app/pages/admin/synthetic.vue',
      content: `<template>\n  <${bare} />\n</template>\n`,
    }], registry)

    expect(violations, `<${bare} /> must not resolve`).toHaveLength(1)
    expect(violations[0]!.message).toContain('does not resolve')
    expect(violations[0]!.message).toContain(entry!.autoImportName)
  })

  it('clears a correctly named usage', () => {
    // Negative control: the auto-import name itself must scan clean, otherwise
    // the assertion above would pass for any input at all.
    const entry = registry.entries.find(value => value.autoImportName !== value.baseName)
    const violations = scanComponentAutoImports([{
      path: 'app/pages/admin/synthetic.vue',
      content: `<template>\n  <${entry!.autoImportName} />\n</template>\n`,
    }], registry)

    expect(formatViolations(violations)).toBe('')
  })

  it('reports no unresolvable nested components in app/', () => {
    const violations = scanComponentAutoImports(loadSources('app', ['.vue']), registry)
    expect(formatViolations(violations)).toBe('')
  })
})

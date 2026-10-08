import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPPORTED_CODE_ID_RE = /\.(?:[cm]?[jt]sx?|vue)(?:$|\?)/

export interface TuffexOnDemandStylePluginOptions {
  enabled?: boolean
  /**
   * Component-to-dependency map, normally read from the package's published
   * `style-deps.json`. Injectable for tests.
   */
  styleDeps?: Record<string, string[]>
  /**
   * Built component root used by consumers that register every component through
   * a generated lazy registry. Styles are injected into each component entry so
   * the registry itself does not eagerly load the whole stylesheet set.
   */
  componentDistRoot?: string
}

function isComponentSubpath(componentName: string) {
  return componentName !== 'base.css'
    && componentName !== 'style.css'
    && componentName !== 'utils'
    && !componentName.endsWith('.css')
}



function createStyleImports(
  componentNames: string[],
  styleDeps: Record<string, string[]>,
  existingStyles: Set<string>,
): string {
  return expandStyleClosure(componentNames, styleDeps)
    .filter(componentName => !existingStyles.has(componentName))
    .map(componentName => `import '@talex-touch/tuffex/${componentName}/style.css';`)
    .join('\n')
}

function componentNameFromDistEntry(id: string, root: string | undefined): string | undefined {
  if (!root)
    return undefined

  const normalizedId = id.split('?')[0]?.replace(/\\/g, '/')
  const normalizedRoot = resolve(root).replace(/\\/g, '/')
  if (!normalizedId?.startsWith(`${normalizedRoot}/`))
    return undefined

  const relativeId = normalizedId.slice(normalizedRoot.length + 1)
  const componentName = /^([a-z0-9-]+)\/index\.js$/.exec(relativeId)?.[1]
  return componentName && isComponentSubpath(componentName) ? componentName : undefined
}


/**
 * Baked in when this file is built for publishing, so the shipped plugin needs
 * to find nothing at runtime and can never disagree with the stylesheets it was
 * released alongside. Left undefined when the plugin runs from source, which is
 * how this repo's own apps load it.
 */
declare const __TUFFEX_STYLE_DEPS__: Record<string, string[]> | undefined

/**
 * The dependency graph the style build publishes next to the stylesheets.
 *
 * Running from source there is nothing baked in, so the file is read from the
 * workspace instead.
 */
function loadStyleDeps(): Record<string, string[]> {
  if (typeof __TUFFEX_STYLE_DEPS__ !== 'undefined' && __TUFFEX_STYLE_DEPS__)
    return __TUFFEX_STYLE_DEPS__

  const candidates: string[] = []

  try {
    const require = createRequire(import.meta.url)
    candidates.push(resolve(dirname(require.resolve('@talex-touch/tuffex/package.json')), 'dist/es/style-deps.json'))
  }
  catch {
    // Not resolvable from here; the paths below still apply.
  }

  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // From source: packages/script/build/ → dist/es/. From dist/vite/ → ../es/.
    candidates.push(resolve(here, '../../../dist/es/style-deps.json'), resolve(here, '../es/style-deps.json'))
  }
  catch {
    // No module URL (a CJS host, for instance); the resolved path above stands.
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf-8'))
    }
    catch {
      continue
    }
  }

  return {}
}

/**
 * Every stylesheet a component needs, dependencies first.
 *
 * Post-order: a component is appended after everything it builds on, so its own
 * rules land later in the cascade and win against them. `seen` both dedupes and
 * breaks cycles.
 */
export function expandStyleClosure(
  componentNames: string[],
  styleDeps: Record<string, string[]>,
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()

  function visit(componentName: string, stack: Set<string>) {
    if (seen.has(componentName) || stack.has(componentName))
      return
    stack.add(componentName)
    for (const dep of styleDeps[componentName] ?? [])
      visit(dep, stack)
    stack.delete(componentName)

    if (seen.has(componentName))
      return
    seen.add(componentName)
    ordered.push(componentName)
  }

  for (const componentName of componentNames)
    visit(componentName, new Set())

  return ordered
}

/**
 * Turns a component import into the stylesheets it needs.
 *
 * Each stylesheet holds only its own component's rules, so a component that
 * leans on tooltip and base-surface needs those imported too. They are emitted
 * as separate `import` statements rather than `@import`s inside the CSS,
 * because a module graph loads one path exactly once — which is what stops the
 * base-surface rules from being inlined into all 26 packages that use them.
 *
 * A consumer that imports `<component>/style.css` by hand instead of running
 * this plugin gets that component's rules alone, and its dependencies' styling
 * will be missing.
 */
export function tuffexOnDemandStylePlugin(options: TuffexOnDemandStylePluginOptions = {}): Plugin {
  let styleDeps: Record<string, string[]> = options.styleDeps ?? {}

  return {
    name: 'tuffex-on-demand-style',
    enforce: 'post',
    buildStart() {
      if (options.enabled === false)
        return
      if (!options.styleDeps)
        styleDeps = loadStyleDeps()
    },
    transform(code, id) {
      if (options.enabled === false)
        return null
      if (!SUPPORTED_CODE_ID_RE.test(id))
        return null

      const distComponentName = componentNameFromDistEntry(id, options.componentDistRoot)
      if (options.componentDistRoot && !distComponentName)
        return null
      if (!options.componentDistRoot && !code.includes('@talex-touch/tuffex/'))
        return null
      const ast = this.parse(code)
      const componentNames = new Set<string>()
      const existingStyles = new Set<string>()
      for (const node of ast.body) {
        if (node.type !== 'ImportDeclaration' || typeof node.source.value !== 'string')
          continue
        const style = /^@talex-touch\/tuffex\/([a-z0-9-]+)\/style\.css$/.exec(node.source.value)?.[1]
        if (style)
          existingStyles.add(style)
        const name = /^@talex-touch\/tuffex\/([a-z0-9-]+)$/.exec(node.source.value)?.[1]
        if (name && isComponentSubpath(name))
          componentNames.add(name)
      }
      if (distComponentName) {
        const styleImports = createStyleImports([distComponentName], styleDeps, existingStyles)
        return styleImports ? { code: `${styleImports}\n${code}`, map: null } : null
      }
      const styleImports = createStyleImports([...componentNames], styleDeps, existingStyles)
      const staticStyles = expandStyleClosure([...componentNames], styleDeps)
      for (const name of staticStyles)
        existingStyles.add(name)
      const dynamicImports: Array<{ start: number, end: number, name: string }> = []
      function visit(value: unknown) {
        if (!value || typeof value !== 'object')
          return
        if (Array.isArray(value)) {
          for (const item of value)
            visit(item)
          return
        }
        const node = value as Record<string, unknown>
        if (node.type === 'ImportExpression') {
          const source = node.source as { value?: unknown }
          const name = typeof source.value === 'string'
            ? /^@talex-touch\/tuffex\/([a-z0-9-]+)$/.exec(source.value)?.[1]
            : undefined
          if (name && isComponentSubpath(name))
            dynamicImports.push({ start: Number(node.start), end: Number(node.end), name })
        }
        for (const key in node)
          visit(node[key])
      }
      visit(ast)
      if (!styleImports && !dynamicImports.length)
        return null
      const pieces: string[] = [styleImports, '\n']
      let cursor = 0
      for (const entry of dynamicImports.sort((a, b) => a.start - b.start)) {
        const styles = expandStyleClosure([entry.name], styleDeps)
          .filter(name => !existingStyles.has(name))
        if (!styles.length)
          continue
        const imports = styles.map(name => `import('@talex-touch/tuffex/${name}/style.css')`)
        pieces.push(code.slice(cursor, entry.start), `Promise.all([${code.slice(entry.start, entry.end)}, ${imports.join(', ')}]).then(([module]) => module)`)
        cursor = entry.end
      }
      pieces.push(code.slice(cursor))
      return { code: pieces.join(''), map: null }
    },
  }
}

export default tuffexOnDemandStylePlugin

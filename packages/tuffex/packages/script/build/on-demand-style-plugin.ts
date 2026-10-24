import type { Plugin, ViteDevServer } from 'vite'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPPORTED_CODE_ID_RE = /\.(?:[cm]?[jt]sx?|vue)(?:$|\?)/
// An installed copy of the package, wherever the package manager put it.
const INSTALLED_DIST_ROOT_RE = /^(.*\/node_modules\/@talex-touch\/tuffex\/dist\/es)\//

export interface TuffexOnDemandStylePluginOptions {
  enabled?: boolean
  /**
   * Component-to-dependency map, normally read from the package's published
   * `style-deps.json`. Injectable for tests.
   */
  styleDeps?: Record<string, string[]>
  /**
   * The siblings each component imports only once it is used, normally read from the package's
   * published `style-lazy-deps.json`. Injectable for tests.
   */
  lazyStyleDeps?: Record<string, string[]>
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
  closure: string[],
  existingStyles: Set<string>,
  specifierFor: (componentName: string) => string = componentName => `@talex-touch/tuffex/${componentName}/style.css`,
): string {
  return closure
    .filter(componentName => !existingStyles.has(componentName))
    .map(componentName => `import '${specifierFor(componentName)}';`)
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

/** The built component root `id` is under: this plugin's own package's, or an installed copy's. */
function distRootOf(id: string, roots: string[]): string | undefined {
  const file = id.split('?')[0]!.replace(/\\/g, '/')
  return roots.find(root => file.startsWith(`${root}/`)) ?? INSTALLED_DIST_ROOT_RE.exec(file)?.[1]
}

/** `to` as an import specifier in a module that lives in `fromDir`. */
function relativeSpecifier(fromDir: string, to: string): string {
  const specifier = relative(fromDir, to).replace(/\\/g, '/')
  return specifier.startsWith('.') ? specifier : `./${specifier}`
}

interface ImportSite {
  start: number
  end: number
  name: string
}

/** Every `import()` whose specifier `nameOf` maps to a component, in source order. */
function componentImportSites(ast: unknown, nameOf: (specifier: string) => string | undefined): ImportSite[] {
  const sites: ImportSite[] = []
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
      const name = typeof source.value === 'string' ? nameOf(source.value) : undefined
      if (name)
        sites.push({ start: Number(node.start), end: Number(node.end), name })
    }
    for (const key in node)
      visit(node[key])
  }
  visit(ast)
  return sites.sort((a, b) => a.start - b.start)
}

/**
 * `code` with each site's `import()` also loading the stylesheets `specifiersOf` gives for its
 * component, and still resolving to the module alone. A site with none to add is left as it was.
 */
function withStyleImports(code: string, sites: ImportSite[], specifiersOf: (name: string) => string[]): string {
  const pieces: string[] = []
  let cursor = 0
  for (const site of sites) {
    const specifiers = specifiersOf(site.name)
    if (!specifiers.length)
      continue
    const imports = specifiers.map(specifier => `import('${specifier}')`)
    pieces.push(code.slice(cursor, site.start), `Promise.all([${code.slice(site.start, site.end)}, ${imports.join(', ')}]).then(([module]) => module)`)
    cursor = site.end
  }
  pieces.push(code.slice(cursor))
  return pieces.join('')
}

/** The candidates that exist, as the real paths module IDs are made of. */
function realRoots(candidates: string[]): string[] {
  const roots = new Set<string>()
  for (const candidate of candidates) {
    try {
      roots.add(realpathSync(candidate).replace(/\\/g, '/'))
    }
    catch {
      // Not built there.
    }
  }
  return [...roots]
}

/**
 * Baked in when this file is built for publishing, so the shipped plugin needs
 * to find nothing at runtime and can never disagree with the stylesheets it was
 * released alongside. Left undefined when the plugin runs from source, which is
 * how this repo's own apps load it.
 */
declare const __TUFFEX_STYLE_DEPS__: Record<string, string[]> | undefined
declare const __TUFFEX_LAZY_STYLE_DEPS__: Record<string, string[]> | undefined

function hasBakedStyleDeps(): boolean {
  return typeof __TUFFEX_STYLE_DEPS__ !== 'undefined' && !!__TUFFEX_STYLE_DEPS__
}

/** Where the built components may be: the package as resolved from here, or beside this file. */
function distEsCandidates(): string[] {
  const candidates: string[] = []

  try {
    const require = createRequire(import.meta.url)
    candidates.push(resolve(dirname(require.resolve('@talex-touch/tuffex/package.json')), 'dist/es'))
  }
  catch {
    // Not resolvable from here; the paths below still apply.
  }

  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // From source: packages/script/build/ → dist/es/. From dist/vite/ → ../es/.
    candidates.push(resolve(here, '../../../dist/es'), resolve(here, '../es'))
  }
  catch {
    // No module URL (a CJS host, for instance); the resolved path above stands.
  }

  return [...new Set(candidates)]
}

/** Where the style build publishes the dependency graph when nothing is baked in. */
function styleDepsCandidates(): string[] {
  return distEsCandidates().flatMap(root => [resolve(root, 'style-deps.json'), resolve(root, 'style-lazy-deps.json')])
}

interface StyleGraph {
  styleDeps: Record<string, string[]>
  lazyStyleDeps: Record<string, string[]>
}

/**
 * The first build whose graph parses, or undefined when none does (not built, or mid-write).
 * Both tables come from the same build; one built before lazy edges existed has none.
 */
function readStyleGraph(): StyleGraph | undefined {
  for (const root of distEsCandidates()) {
    let styleDeps: Record<string, string[]>
    try {
      styleDeps = JSON.parse(readFileSync(resolve(root, 'style-deps.json'), 'utf-8'))
    }
    catch {
      continue
    }
    let lazyStyleDeps: Record<string, string[]> = {}
    try {
      lazyStyleDeps = JSON.parse(readFileSync(resolve(root, 'style-lazy-deps.json'), 'utf-8'))
    }
    catch {
      // Older than lazy edges, or mid-write: nothing is loaded lazily.
    }
    return { styleDeps, lazyStyleDeps }
  }
  return undefined
}

/**
 * The dependency graph the style build publishes next to the stylesheets.
 *
 * Running from source there is nothing baked in, so the files are read from the
 * workspace instead.
 */
function loadStyleGraph(): StyleGraph {
  if (hasBakedStyleDeps()) {
    return {
      styleDeps: __TUFFEX_STYLE_DEPS__!,
      lazyStyleDeps: typeof __TUFFEX_LAZY_STYLE_DEPS__ !== 'undefined' && __TUFFEX_LAZY_STYLE_DEPS__ ? __TUFFEX_LAZY_STYLE_DEPS__ : {},
    }
  }
  return readStyleGraph() ?? { styleDeps: {}, lazyStyleDeps: {} }
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
 * What a dev server injects up front: the closure, then everything its components load on first
 * use. Dependencies there are usually pre-bundled, out of reach of the hand-off a build makes, so
 * a sibling's stylesheets have to be on the page before the sibling is. They follow the closure,
 * as they would follow the page in a build.
 */
function expandEagerClosure(
  componentNames: string[],
  styleDeps: Record<string, string[]>,
  lazyStyleDeps: Record<string, string[]>,
): string[] {
  const ordered = expandStyleClosure(componentNames, styleDeps)
  const seen = new Set(ordered)
  // The list grows as it is read, so what a lazily loaded sibling loads lazily is reached too.
  for (let i = 0; i < ordered.length; i++) {
    for (const name of expandStyleClosure(lazyStyleDeps[ordered[i]!] ?? [], styleDeps)) {
      if (seen.has(name))
        continue
      seen.add(name)
      ordered.push(name)
    }
  }
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
 * A component that loads a sibling only once it is used (TxImageGallery's
 * preview) does so with an `import()` of the sibling's built entry. A build adds
 * the sibling's stylesheets to that import, so they reach the page with it
 * rather than with the component that asked.
 *
 * A consumer that imports `<component>/style.css` by hand instead of running
 * this plugin gets that component's rules alone, and its dependencies' styling
 * will be missing.
 */
export function tuffexOnDemandStylePlugin(options: TuffexOnDemandStylePluginOptions = {}): Plugin {
  let styleDeps: Record<string, string[]> = options.styleDeps ?? {}
  let lazyStyleDeps: Record<string, string[]> = options.lazyStyleDeps ?? {}
  let serving = false
  let distRoots: string[] = []
  // Every file whose transform consulted the graph, with the components it asked for.
  const dependents = new Map<string, string[]>()
  const servers: ViteDevServer[] = []

  /** The stylesheets a module importing these components needs; on a dev server, all at once. */
  function closureOf(componentNames: string[]): string[] {
    return serving
      ? expandEagerClosure(componentNames, styleDeps, lazyStyleDeps)
      : expandStyleClosure(componentNames, styleDeps)
  }

  /**
   * A dev server outlives the dist it reads: a rebuild that changes the graph
   * would otherwise keep injecting the old closure until the server restarts.
   * Only the modules whose closure moved are transformed again.
   */
  function reloadStyleDeps() {
    const next = readStyleGraph()
    if (!next)
      return
    const previous: StyleGraph = { styleDeps, lazyStyleDeps }
    styleDeps = next.styleDeps
    lazyStyleDeps = options.lazyStyleDeps ?? next.lazyStyleDeps
    const current: StyleGraph = { styleDeps, lazyStyleDeps }
    const edgesOf = (graph: StyleGraph, name: string) =>
      JSON.stringify([graph.styleDeps[name] ?? [], graph.lazyStyleDeps[name] ?? []])
    const changed = new Set(
      [previous, current]
        .flatMap(graph => [...Object.keys(graph.styleDeps), ...Object.keys(graph.lazyStyleDeps)])
        .filter(name => edgesOf(previous, name) !== edgesOf(current, name)),
    )
    if (!changed.size)
      return

    // Against everything a component may come to need, which is what a dev server injects.
    const stale = [...dependents.entries()]
      .filter(([, names]) => [previous, current].some(graph =>
        expandEagerClosure(names, graph.styleDeps, graph.lazyStyleDeps).some(name => changed.has(name))))
      .map(([file]) => file)
    for (const file of stale) {
      dependents.delete(file)
      for (const server of servers) {
        for (const mod of server.moduleGraph.getModulesByFile(file) ?? [])
          server.moduleGraph.invalidateModule(mod)
      }
    }
    if (!stale.length)
      return
    servers[0]?.config.logger.info(
      `[tuffex-on-demand-style] the style graph changed for ${changed.size} component(s); reloading ${stale.length} module(s)`,
      { timestamp: true },
    )
    for (const server of servers)
      server.ws.send({ type: 'full-reload' })
  }

  return {
    name: 'tuffex-on-demand-style',
    enforce: 'post',
    configResolved(config) {
      serving = config.command === 'serve'
    },
    buildStart() {
      if (options.enabled === false)
        return
      distRoots = realRoots(distEsCandidates())
      if (!options.styleDeps) {
        const graph = loadStyleGraph()
        styleDeps = graph.styleDeps
        lazyStyleDeps = options.lazyStyleDeps ?? graph.lazyStyleDeps
      }
    },
    configureServer(server) {
      if (options.enabled === false || options.styleDeps || hasBakedStyleDeps())
        return
      servers.push(server)
      const candidates = styleDepsCandidates()
      server.watcher.add(candidates)
      let timer: ReturnType<typeof setTimeout> | undefined
      server.watcher.on('all', (event, file) => {
        if ((event !== 'add' && event !== 'change') || !candidates.includes(resolve(file)))
          return
        // The build writes the file once, but a watcher can report the create and
        // the write separately.
        clearTimeout(timer)
        timer = setTimeout(reloadStyleDeps, 200)
      })
    },
    transform(code, id) {
      if (options.enabled === false)
        return null
      if (!SUPPORTED_CODE_ID_RE.test(id))
        return null

      const distComponentName = componentNameFromDistEntry(id, options.componentDistRoot)
      if (options.componentDistRoot && !distComponentName)
        return null
      const distRoot = options.componentDistRoot ? undefined : distRootOf(id, distRoots)
      if (distRoot) {
        // A built component that loads a sibling on first use gets the sibling's stylesheets with
        // it. Built files reach each other by relative path, and so do these: the package's own
        // name need not resolve from inside it (in this workspace it does not).
        if (!code.includes('import('))
          return null
        const file = id.split('?')[0]!
        const sites = componentImportSites(this.parse(code), specifier => specifier.startsWith('.')
          ? componentNameFromDistEntry(resolve(dirname(file), specifier), distRoot)
          : undefined)
        if (!sites.length)
          return null
        dependents.set(file, sites.map(site => site.name))
        return {
          code: withStyleImports(code, sites, name => expandStyleClosure([name], styleDeps)
            .map(style => relativeSpecifier(dirname(file), `${distRoot}/${style}/style.css`))),
          map: null,
        }
      }
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
        const file = id.split('?')[0]!
        dependents.set(file, [distComponentName])
        const styleImports = createStyleImports(
          expandStyleClosure([distComponentName], styleDeps),
          existingStyles,
          style => relativeSpecifier(dirname(file), `${options.componentDistRoot}/${style}/style.css`),
        )
        return styleImports ? { code: `${styleImports}\n${code}`, map: null } : null
      }
      const closure = closureOf([...componentNames])
      const styleImports = createStyleImports(closure, existingStyles)
      for (const name of closure)
        existingStyles.add(name)
      const dynamicImports = componentImportSites(ast, (specifier) => {
        const name = /^@talex-touch\/tuffex\/([a-z0-9-]+)$/.exec(specifier)?.[1]
        return name && isComponentSubpath(name) ? name : undefined
      })
      if (componentNames.size || dynamicImports.length)
        dependents.set(id.split('?')[0]!, [...componentNames, ...dynamicImports.map(site => site.name)])
      if (!styleImports && !dynamicImports.length)
        return null
      const rewritten = withStyleImports(code, dynamicImports, name => closureOf([name])
        .filter(style => !existingStyles.has(style))
        .map(style => `@talex-touch/tuffex/${style}/style.css`))
      return { code: `${styleImports}\n${rewritten}`, map: null }
    },
  }
}

export default tuffexOnDemandStylePlugin

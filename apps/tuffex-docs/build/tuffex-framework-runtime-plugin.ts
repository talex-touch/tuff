import type { Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

export const VIRTUAL_TUFFEX_WC_RUNTIME_ID = 'virtual:tuffex-wc-runtime'
export const VIRTUAL_TUFFEX_REACT_RUNTIME_ID = 'virtual:tuffex-react-runtime'

const RESOLVED_WC_ID = `\0${VIRTUAL_TUFFEX_WC_RUNTIME_ID}`
const RESOLVED_REACT_ID = `\0${VIRTUAL_TUFFEX_REACT_RUNTIME_ID}`

export interface FrameworkRuntimeProbe {
  wcAvailable: boolean
  wcEntry: string | null
  wcStyleEntry: string | null
  reactAvailable: boolean
  reactEntry: string | null
  reactStyleEntry: string | null
  reactLibEntry: string | null
  reactDomClientEntry: string | null
}

function tryResolve(req: NodeRequire, specifier: string): string | null {
  try {
    return req.resolve(specifier)
  }
  catch {
    return null
  }
}

function resolveWorkspacePackageEntries(pkgDir: string): { entry: string | null, style: string | null } {
  const pkgJsonPath = resolve(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath))
    return { entry: null, style: null }

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
      module?: string
      main?: string
      exports?: Record<string, string | { import?: string, default?: string }>
    }
    const rootExport = pkg.exports?.['.']
    const rootCandidate = typeof rootExport === 'string'
      ? rootExport
      : (rootExport?.import ?? rootExport?.default ?? pkg.module ?? pkg.main)

    const styleExport = pkg.exports?.['./style.css']
    const styleCandidate = typeof styleExport === 'string'
      ? styleExport
      : (styleExport?.import ?? styleExport?.default)

    const entryCandidates = [
      rootCandidate ? resolve(pkgDir, rootCandidate) : null,
      resolve(pkgDir, 'dist/index.mjs'),
      resolve(pkgDir, 'dist/index.js'),
      resolve(pkgDir, 'src/index.ts'),
    ].filter((value): value is string => Boolean(value))

    const styleCandidates = [
      styleCandidate ? resolve(pkgDir, styleCandidate) : null,
      resolve(pkgDir, 'dist/style.css'),
      resolve(pkgDir, 'src/style.css'),
    ].filter((value): value is string => Boolean(value))

    return {
      entry: entryCandidates.find(candidate => existsSync(candidate)) ?? null,
      style: styleCandidates.find(candidate => existsSync(candidate)) ?? null,
    }
  }
  catch {
    return { entry: null, style: null }
  }
}

function tryResolveLinkedPackage(
  req: NodeRequire,
  packageName: string,
): { entry: string | null, style: string | null } {
  const pkgJsonPath = tryResolve(req, `${packageName}/package.json`)
  if (!pkgJsonPath)
    return { entry: null, style: null }

  const resolved = resolveWorkspacePackageEntries(dirname(pkgJsonPath))
  return {
    entry: resolved.entry ? packageName : null,
    style: resolved.style ? `${packageName}/style.css` : null,
  }
}

export function probeFrameworkRuntimes(appRoot: string): FrameworkRuntimeProbe {
  const workspaceRoot = resolve(appRoot, '../..')
  const appReq = createRequire(resolve(appRoot, 'package.json'))

  const wcDir = resolve(workspaceRoot, 'packages/tuffex-wc')
  const wcLinked = tryResolveLinkedPackage(appReq, '@talex-touch/tuffex-wc')
  const wcWorkspace = resolveWorkspacePackageEntries(wcDir)
  const wcEntry = wcLinked.entry
    ?? (tryResolve(appReq, '@talex-touch/tuffex-wc') ? '@talex-touch/tuffex-wc' : wcWorkspace.entry)
  const wcStyleEntry = wcLinked.style
    ?? (tryResolve(appReq, '@talex-touch/tuffex-wc/style.css')
      ? '@talex-touch/tuffex-wc/style.css'
      : wcWorkspace.style)

  const reactDir = resolve(workspaceRoot, 'packages/tuffex-react')
  const reactLinked = tryResolveLinkedPackage(appReq, '@talex-touch/tuffex-react')
  const reactWorkspace = resolveWorkspacePackageEntries(reactDir)
  const reactEntry = reactLinked.entry
    ?? (tryResolve(appReq, '@talex-touch/tuffex-react') ? '@talex-touch/tuffex-react' : reactWorkspace.entry)
  const reactStyleEntry = reactLinked.style
    ?? (tryResolve(appReq, '@talex-touch/tuffex-react/style.css')
      ? '@talex-touch/tuffex-react/style.css'
      : reactWorkspace.style)

  const reactPkgReq = existsSync(resolve(reactDir, 'package.json'))
    ? createRequire(resolve(reactDir, 'package.json'))
    : null

  const reactLibEntry = tryResolve(appReq, 'react')
    ? 'react'
    : (reactPkgReq ? tryResolve(reactPkgReq, 'react') : null)
  const reactDomClientEntry = tryResolve(appReq, 'react-dom/client')
    ? 'react-dom/client'
    : (reactPkgReq ? tryResolve(reactPkgReq, 'react-dom/client') : null)

  return {
    wcAvailable: Boolean(wcEntry),
    wcEntry,
    wcStyleEntry,
    reactAvailable: Boolean(reactEntry && reactLibEntry && reactDomClientEntry),
    reactEntry,
    reactStyleEntry,
    reactLibEntry,
    reactDomClientEntry,
  }
}

export function buildWcRuntimeVirtualModule(
  probe: Pick<FrameworkRuntimeProbe, 'wcAvailable' | 'wcEntry' | 'wcStyleEntry'>,
): string {
  if (!probe.wcAvailable || !probe.wcEntry) {
    return [
      'export const available = false',
      'export const reason = "package-not-linked"',
      'export async function loadTuffexWcRuntime() { return null }',
    ].join('\n')
  }

  const imports = [`import(${JSON.stringify(probe.wcEntry)})`]
  if (probe.wcStyleEntry)
    imports.push(`import(${JSON.stringify(probe.wcStyleEntry)})`)

  return [
    'export const available = true',
    'export const reason = "linked"',
    'let cachedPromise = null',
    'export function loadTuffexWcRuntime() {',
    '  if (!cachedPromise) {',
    `    cachedPromise = Promise.all([${imports.join(', ')}]).then(([wcModule]) => {`,
    '      if (typeof wcModule.registerTuffexElements === "function") {',
    '        wcModule.registerTuffexElements()',
    '      }',
    '      return wcModule',
    '    })',
    '  }',
    '  return cachedPromise',
    '}',
  ].join('\n')
}

export function buildReactRuntimeVirtualModule(
  probe: Pick<FrameworkRuntimeProbe, 'reactAvailable' | 'reactEntry' | 'reactStyleEntry' | 'reactLibEntry' | 'reactDomClientEntry'>,
): string {
  if (!probe.reactAvailable || !probe.reactEntry || !probe.reactLibEntry || !probe.reactDomClientEntry) {
    return [
      'export const available = false',
      'export const reason = "package-not-linked"',
      'export async function loadTuffexReactRuntime() { return null }',
    ].join('\n')
  }

  const imports = [
    `import(${JSON.stringify(probe.reactLibEntry)})`,
    `import(${JSON.stringify(probe.reactDomClientEntry)})`,
    `import(${JSON.stringify(probe.reactEntry)})`,
  ]
  if (probe.reactStyleEntry)
    imports.push(`import(${JSON.stringify(probe.reactStyleEntry)})`)

  return [
    'export const available = true',
    'export const reason = "linked"',
    'let cachedPromise = null',
    'export function loadTuffexReactRuntime() {',
    '  if (!cachedPromise) {',
    `    cachedPromise = Promise.all([${imports.join(', ')}]).then(([reactMod, reactDomClientMod, tuffexReactMod]) => ({`,
    '      React: reactMod.default ?? reactMod,',
    '      createRoot: reactDomClientMod.createRoot ?? reactDomClientMod.default?.createRoot,',
    '      TuffexReact: tuffexReactMod,',
    '    }))',
    '  }',
    '  return cachedPromise',
    '}',
  ].join('\n')
}

export function tuffexFrameworkRuntimePlugin(appRoot: string): Plugin {
  let probe: FrameworkRuntimeProbe | null = null

  const getProbe = () => {
    if (!probe)
      probe = probeFrameworkRuntimes(appRoot)
    return probe
  }

  return {
    name: 'tuffex-framework-runtime',
    resolveId(id) {
      if (id === VIRTUAL_TUFFEX_WC_RUNTIME_ID)
        return RESOLVED_WC_ID
      if (id === VIRTUAL_TUFFEX_REACT_RUNTIME_ID)
        return RESOLVED_REACT_ID
      return null
    },
    load(id) {
      if (id === RESOLVED_WC_ID)
        return buildWcRuntimeVirtualModule(getProbe())
      if (id === RESOLVED_REACT_ID)
        return buildReactRuntimeVirtualModule(getProbe())
      return null
    },
  }
}

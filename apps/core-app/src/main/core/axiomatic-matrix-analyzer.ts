import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export type DomainId = 'DP1' | 'DP2' | 'DP3' | 'DP4' | 'DP5' | 'DP6' | 'DP7' | 'DP8'

export interface DomainSpec {
  id: DomainId
  index: number // 0-based (0..7)
  rank: number // 1-based (1..8)
  label: string
  modules: readonly string[]
}

export const DOMAIN_HIERARCHY: readonly DomainSpec[] = [
  {
    id: 'DP1',
    index: 0,
    rank: 1,
    label: 'Persistence',
    modules: ['database', 'storage', 'file-protocol']
  },
  {
    id: 'DP2',
    index: 1,
    rank: 2,
    label: 'Security',
    modules: ['permission', 'privacy', 'build-verification']
  },
  {
    id: 'DP3',
    index: 2,
    rank: 3,
    label: 'Native',
    modules: [
      'clipboard',
      'clipboard-tagging',
      'native-capabilities',
      'platform',
      'system',
      'screenshot-session',
      'tds-capture',
      'notification',
      'quick-ops',
      'terminal',
      'terminal-cmd',
      'download',
      'drop-manager',
      'app-destination'
    ]
  },
  {
    id: 'DP4',
    index: 3,
    rank: 4,
    label: 'Search',
    modules: ['box-tool', 'calculation']
  },
  {
    id: 'DP5',
    index: 4,
    rank: 5,
    label: 'Plugin',
    modules: ['plugin', 'flow-bus', 'addon-opener', 'addon-opener-handlers', 'extension-loader']
  },
  {
    id: 'DP6',
    index: 5,
    rank: 6,
    label: 'AI',
    modules: [
      'ai',
      'tool-gateway',
      'mcp-host',
      'local-ai-cli',
      'conversation',
      'project',
      'herdr-core',
      'ocr',
      'voice'
    ]
  },
  {
    id: 'DP7',
    index: 6,
    rank: 7,
    label: 'Surface',
    modules: ['division-box', 'omni-panel', 'assistant', 'browser', 'browser-connection', 'tray']
  },
  {
    id: 'DP8',
    index: 7,
    rank: 8,
    label: 'Cloud',
    modules: ['auth', 'sync', 'nexus', 'catalog', 'update', 'system-update']
  }
] as const

export const COMMON_INFRA_MODULES: readonly string[] = [
  'abstract-base-module',
  'base-module-doc',
  'observability',
  'network',
  'analytics',
  'sentry',
  'global-shortcon'
] as const

const MODULE_TO_DOMAIN = new Map<string, DomainSpec>()
for (const domain of DOMAIN_HIERARCHY) {
  for (const mod of domain.modules) {
    if (MODULE_TO_DOMAIN.has(mod)) {
      throw new Error(`Duplicate module mapping for "${mod}"`)
    }
    MODULE_TO_DOMAIN.set(mod, domain)
  }
}

const COMMON_INFRA_SET = new Set<string>(COMMON_INFRA_MODULES)

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs'])
const STRIP_EXTENSION_RE = /\.(?:ts|tsx|mts|js|mjs|cjs)$/

const STANDARD_GLOBAL_PROPERTIES = new Set([
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'queueMicrotask',
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'URL',
  'URLSearchParams',
  'AbortController',
  'AbortSignal',
  'structuredClone',
  'crypto',
  'console',
  'Buffer',
  'process',
  'performance',
  'TextEncoder',
  'TextDecoder',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'Blob',
  'File',
  'EventTarget',
  'CustomEvent',
  'Event',
  'MessageChannel',
  'MessagePort',
  'atob',
  'btoa',
  'WebSocket',
  'Intl',
  'Reflect',
  'Proxy',
  'Symbol',
  'WeakRef',
  'FinalizationRegistry'
])

/**
 * Verified pre-existing runtime dynamic loaders and VM sandbox globals on origin/master.
 * Any NEW non-literal dynamic import, non-literal require, or non-standard globalThis access
 * inside `src/main/modules/` will fail the anti-cheat gate.
 */
const ALLOWED_NON_LITERAL_DYNAMIC_LOADS: ReadonlyMap<string, readonly string[]> = new Map([
  // Loads optional external native package `fsevents` dynamically on macOS
  ['box-tool/file-system-watcher/macos-file-watcher.ts', ['import(moduleName)']],
  // Loads external native/binary dependencies or plugin package manifests
  ['box-tool/addon/files/everything-backend-service.ts', ['this.requireModule', 'requireModule']],
  ['box-tool/addon/files/thumbnail-service.ts', ['require(target)', 'requireFromCwd(target)']],
  ['box-tool/addon/files/workers/file-scan-fd-backend.ts', ['runtimeRequire', 'wrapperRequire']],
  ['build-verification/attestation.ts', ['requireFromCurrentModule']],
  ['clipboard/clipboard-service.ts', ['requireFromModule']],
  ['omni-panel/index.ts', ['requireFromCurrentModule']],
  ['plugin/providers/npm-provider.ts', ['req(candidate)']]
])

const ALLOWED_GLOBALTHIS_FILES = new Set<string>([
  // Isolated VM sandbox bootstrap inside plugin host child runtime
  'plugin/host/plugin-host-child-runtime.ts'
])

export type ImportKind = 'import' | 'export' | 'import=' | 'dynamic-import' | 'require'

export interface RuntimeImportEdge {
  fromFile: string // relative to mainDir, POSIX separators
  fromModule: string
  fromDomain: DomainId
  toModule: string
  toDomain: DomainId
  specifier: string
  resolvedRelativePath: string
  kind: ImportKind
  line: number
}

export interface CheatViolation {
  file: string // relative to mainDir
  line: number
  kind: 'non-literal-dynamic-import' | 'non-literal-require' | 'globalThis-escape-hatch'
  snippet: string
  reason: string
}

export interface SmuggledImportViolation {
  file: string // relative to mainDir
  line: number
  specifier: string
  toModule: string
  toDomain: DomainId
  kind: ImportKind
}

export interface AxiomaticMatrixReport {
  mainDir: string
  modulesDir: string
  scannedFiles: number
  unmappedEntries: string[]
  /** 8x8 count of runtime import edges from row DP_i to col DP_j */
  matrix: number[][]
  allEdges: RuntimeImportEdge[]
  upperTriangularEdges: RuntimeImportEdge[]
  /** Number of non-zero cells A[i,j] > 0 where i < j (out of 28) */
  upperTriangularCells: number
  /** Map from "DPi->DPj" to edges in that upper-triangular cell */
  upperTriangularByCell: Record<string, RuntimeImportEdge[]>
  /** Tarjan Strongly Connected Components across DP1..DP8 */
  sccs: DomainId[][]
  nonTrivialSccs: DomainId[][]
  cheatViolations: CheatViolation[]
  smuggledSharedImports: SmuggledImportViolation[]
}

export interface AnalyzeOptions {
  mainDir?: string
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export function isTestFilePath(relativePosixPath: string): boolean {
  const base = path.posix.basename(relativePosixPath)
  if (relativePosixPath.includes('/__tests__/') || relativePosixPath.startsWith('__tests__/')) {
    return true
  }
  if (base.endsWith('.d.ts') || base.endsWith('.d.mts') || base.endsWith('.d.cts')) {
    return true
  }
  if (/\.(?:test|spec)\.(?:ts|tsx|mts|js|mjs|cjs)$/.test(base)) {
    return true
  }
  return false
}

function isSourceFile(fileName: string): boolean {
  if (fileName.endsWith('.d.ts') || fileName.endsWith('.d.mts') || fileName.endsWith('.d.cts')) {
    return false
  }
  return SOURCE_EXTENSIONS.has(path.extname(fileName))
}

function normalizeModuleKey(entryName: string): string {
  return entryName.replace(STRIP_EXTENSION_RE, '')
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.jsx':
      return ts.ScriptKind.JSX
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TS
  }
}

function collectSourceFilesRecursive(
  rootDir: string,
  currentDir = rootDir,
  out: string[] = []
): string[] {
  if (!existsSync(currentDir)) return out
  const entries = readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const fullPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      collectSourceFilesRecursive(rootDir, fullPath, out)
    } else if (entry.isFile()) {
      const relPosix = toPosix(path.relative(rootDir, fullPath))
      if (isSourceFile(entry.name) && !isTestFilePath(relPosix)) {
        out.push(fullPath)
      }
    }
  }
  return out
}

function getLineNumber(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
}

function isInsideTypeContext(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent
  while (current) {
    if (
      ts.isTypeNode(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current)
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function isCreateRequireCall(node: ts.Expression): boolean {
  if (!ts.isCallExpression(node)) return false
  const expr = node.expression
  if (ts.isIdentifier(expr) && expr.text === 'createRequire') return true
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'createRequire') return true
  return false
}

function extractCreateRequireIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let init: ts.Expression = node.initializer
      while (ts.isParenthesizedExpression(init) || ts.isAsExpression(init)) {
        init = init.expression
      }
      if (isCreateRequireCall(init)) {
        names.add(node.name.text)
      } else if (
        ts.isBinaryExpression(init) &&
        (init.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          init.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        (isCreateRequireCall(init.left) || isCreateRequireCall(init.right))
      ) {
        names.add(node.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

interface ExtractedFileSignals {
  specifiers: Array<{ specifier: string; kind: ImportKind; line: number }>
  cheats: CheatViolation[]
}

function isStringLiteralLike(node: ts.Expression): node is ts.StringLiteralLike {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function isAllowedDynamicLoad(moduleRelPath: string, snippet: string): boolean {
  const allowed = ALLOWED_NON_LITERAL_DYNAMIC_LOADS.get(moduleRelPath)
  if (!allowed) return false
  return allowed.some((token) => snippet.includes(token))
}

export function extractRuntimeSignalsFromSource(
  sourceText: string,
  filePath: string,
  relFromMain: string,
  relFromModules: string | null
): ExtractedFileSignals {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  )
  const createRequireNames = extractCreateRequireIdentifiers(sourceFile)
  const specifiers: Array<{ specifier: string; kind: ImportKind; line: number }> = []
  const cheats: CheatViolation[] = []

  const checkGlobalObjectAccess = (node: ts.Identifier): void => {
    if (relFromModules === null) return
    if (node.text !== 'globalThis' && node.text !== 'global') return
    if (isInsideTypeContext(node)) return
    // Ignore property names like `obj.global` or `{ global: true }` or parameter/binding names
    const parent = node.parent
    if (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isMethodDeclaration(parent) && parent.name === node) ||
      (ts.isPropertyDeclaration(parent) && parent.name === node) ||
      (ts.isParameter(parent) && parent.name === node) ||
      (ts.isVariableDeclaration(parent) && parent.name === node) ||
      (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) ||
      (ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) ||
      (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) ||
      ts.isQualifiedName(parent)
    ) {
      return
    }
    if (ALLOWED_GLOBALTHIS_FILES.has(relFromModules)) return

    // Allow standard JS/Web runtime globals accessed directly as `globalThis.<stdProp>`
    if (
      node.text === 'globalThis' &&
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === node &&
      STANDARD_GLOBAL_PROPERTIES.has(parent.name.text)
    ) {
      // Ensure it is not being overwritten (`globalThis.fetch = ...`)
      const grandParent = parent.parent
      const isAssignmentTarget =
        ts.isBinaryExpression(grandParent) &&
        grandParent.left === parent &&
        grandParent.operatorToken.kind === ts.SyntaxKind.EqualsToken
      if (!isAssignmentTarget) {
        return
      }
    }

    const snippet = parent.getText(sourceFile).slice(0, 120)
    cheats.push({
      file: relFromMain,
      line: getLineNumber(sourceFile, node.getStart(sourceFile)),
      kind: 'globalThis-escape-hatch',
      snippet,
      reason: `Disallowed ${node.text} access inside modules/; use explicit typed port registration instead`
    })
  }

  const visit = (node: ts.Node): void => {
    // 1. Static import declarations
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      let isRuntime = false
      if (!clause) {
        // Side-effect import: `import './foo'`
        isRuntime = true
      } else if (!clause.isTypeOnly) {
        if (clause.name) {
          isRuntime = true
        } else if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            isRuntime = true
          } else if (ts.isNamedImports(clause.namedBindings)) {
            isRuntime = clause.namedBindings.elements.some((el) => !el.isTypeOnly)
          }
        }
      }
      if (isRuntime) {
        specifiers.push({
          specifier: node.moduleSpecifier.text,
          kind: 'import',
          line: getLineNumber(sourceFile, node.getStart(sourceFile))
        })
      }
    }

    // 2. Re-export declarations (`export ... from '...'`)
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!node.isTypeOnly) {
        let isRuntime = false
        if (!node.exportClause) {
          // `export * from '...'`
          isRuntime = true
        } else if (ts.isNamespaceExport(node.exportClause)) {
          // `export * as ns from '...'`
          isRuntime = true
        } else if (ts.isNamedExports(node.exportClause)) {
          isRuntime = node.exportClause.elements.some((el) => !el.isTypeOnly)
        }
        if (isRuntime) {
          specifiers.push({
            specifier: node.moduleSpecifier.text,
            kind: 'export',
            line: getLineNumber(sourceFile, node.getStart(sourceFile))
          })
        }
      }
    }

    // 3. TypeScript `import x = require('...')`
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const expr = node.moduleReference.expression
        const line = getLineNumber(sourceFile, node.getStart(sourceFile))
        if (isStringLiteralLike(expr)) {
          specifiers.push({ specifier: expr.text, kind: 'import=', line })
        } else if (relFromModules !== null) {
          cheats.push({
            file: relFromMain,
            line,
            kind: 'non-literal-require',
            snippet: node.getText(sourceFile).slice(0, 120),
            reason: 'Non-literal import= require() inside modules/'
          })
        }
      }
    }

    // 4. Dynamic `import(...)` and `require(...)` calls
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      const line = getLineNumber(sourceFile, node.getStart(sourceFile))

      if (expr.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0]
        if (arg && isStringLiteralLike(arg)) {
          specifiers.push({ specifier: arg.text, kind: 'dynamic-import', line })
        } else if (relFromModules !== null) {
          const snippet = node.getText(sourceFile).slice(0, 120)
          if (!isAllowedDynamicLoad(relFromModules, snippet)) {
            cheats.push({
              file: relFromMain,
              line,
              kind: 'non-literal-dynamic-import',
              snippet,
              reason: 'Dynamic import() with non-literal specifier is forbidden inside modules/'
            })
          }
        }
      } else {
        const isRequireCall =
          (ts.isIdentifier(expr) &&
            (expr.text === 'require' || createRequireNames.has(expr.text))) ||
          (ts.isPropertyAccessExpression(expr) && expr.name.text === 'require') ||
          isCreateRequireCall(expr)

        if (isRequireCall) {
          const arg = node.arguments[0]
          if (arg && isStringLiteralLike(arg)) {
            specifiers.push({ specifier: arg.text, kind: 'require', line })
          } else if (relFromModules !== null) {
            const snippet = node.getText(sourceFile).slice(0, 120)
            if (!isAllowedDynamicLoad(relFromModules, snippet)) {
              cheats.push({
                file: relFromMain,
                line,
                kind: 'non-literal-require',
                snippet,
                reason: 'require() with non-literal specifier is forbidden inside modules/'
              })
            }
          }
        }
      }
    }

    // 5. globalThis / global escape-hatch detection
    if (ts.isIdentifier(node)) {
      checkGlobalObjectAccess(node)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { specifiers, cheats }
}

function resolveTargetInModules(
  fromFile: string,
  specifier: string,
  mainDir: string,
  modulesDir: string
): { moduleKey: string; resolvedRelativePath: string } | null {
  let resolved: string | null = null
  if (
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier === '.' ||
    specifier === '..'
  ) {
    resolved = path.resolve(path.dirname(fromFile), specifier)
  } else if (specifier.startsWith('@/') && !specifier.startsWith('@/common/')) {
    // tsconfig.node.json maps `@/*` -> `src/main/*` (except `@/common/*` -> `packages/utils/common/*`)
    resolved = path.resolve(mainDir, specifier.slice(2))
  } else {
    return null
  }

  const relToModules = path.relative(modulesDir, resolved)
  if (!relToModules || relToModules.startsWith('..') || path.isAbsolute(relToModules)) {
    return null
  }

  const posixRel = toPosix(relToModules)
  const firstSegment = posixRel.split('/')[0]
  if (!firstSegment) return null

  return {
    moduleKey: normalizeModuleKey(firstSegment),
    resolvedRelativePath: `modules/${posixRel}`
  }
}

export function computeTarjanSCCs(matrix: number[][]): DomainId[][] {
  const n = DOMAIN_HIERARCHY.length
  let nextIndex = 0
  const indices = new Array<number>(n).fill(-1)
  const lowlink = new Array<number>(n).fill(0)
  const onStack = new Array<boolean>(n).fill(false)
  const stack: number[] = []
  const sccs: DomainId[][] = []

  const strongConnect = (v: number): void => {
    indices[v] = nextIndex
    lowlink[v] = nextIndex
    nextIndex += 1
    stack.push(v)
    onStack[v] = true

    for (let w = 0; w < n; w++) {
      if (v === w) continue
      if (matrix[v]![w]! <= 0) continue
      if (indices[w] === -1) {
        strongConnect(w)
        lowlink[v] = Math.min(lowlink[v]!, lowlink[w]!)
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v]!, indices[w]!)
      }
    }

    if (lowlink[v] === indices[v]) {
      const component: DomainId[] = []
      while (true) {
        const w = stack.pop()!
        onStack[w] = false
        component.push(DOMAIN_HIERARCHY[w]!.id)
        if (w === v) break
      }
      component.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
      sccs.push(component)
    }
  }

  for (let v = 0; v < n; v++) {
    if (indices[v] === -1) {
      strongConnect(v)
    }
  }

  return sccs.sort((a, b) => Number(a[0]!.slice(2)) - Number(b[0]!.slice(2)))
}

export function analyzeAxiomaticMatrix(options: AnalyzeOptions = {}): AxiomaticMatrixReport {
  const defaultMainDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const mainDir = path.resolve(options.mainDir ?? defaultMainDir)
  const modulesDir = path.join(mainDir, 'modules')

  if (!existsSync(modulesDir) || !statSync(modulesDir).isDirectory()) {
    throw new Error(`Modules directory not found: ${modulesDir}`)
  }

  // 1. Validate every top-level entry in modules/ is mapped
  const unmappedEntries: string[] = []
  const topEntries = readdirSync(modulesDir, { withFileTypes: true })
  for (const entry of topEntries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isFile()) {
      if (!isSourceFile(entry.name) || isTestFilePath(entry.name)) continue
      const key = normalizeModuleKey(entry.name)
      if (!MODULE_TO_DOMAIN.has(key) && !COMMON_INFRA_SET.has(key)) {
        unmappedEntries.push(entry.name)
      }
    } else if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      if (!MODULE_TO_DOMAIN.has(entry.name) && !COMMON_INFRA_SET.has(entry.name)) {
        unmappedEntries.push(`${entry.name}/`)
      }
    }
  }
  unmappedEntries.sort()

  // 2. Scan all non-test source files inside modules/
  const moduleFiles = collectSourceFilesRecursive(modulesDir).sort()
  const matrix: number[][] = Array.from({ length: DOMAIN_HIERARCHY.length }, () =>
    new Array<number>(DOMAIN_HIERARCHY.length).fill(0)
  )
  const allEdges: RuntimeImportEdge[] = []
  const upperTriangularEdges: RuntimeImportEdge[] = []
  const upperTriangularByCell: Record<string, RuntimeImportEdge[]> = {}
  const cheatViolations: CheatViolation[] = []

  for (const filePath of moduleFiles) {
    const relFromModules = toPosix(path.relative(modulesDir, filePath))
    const relFromMain = toPosix(path.relative(mainDir, filePath))
    const topSegment = relFromModules.split('/')[0]!
    const fromModule = normalizeModuleKey(topSegment)
    const fromDomainSpec = MODULE_TO_DOMAIN.get(fromModule)

    const sourceText = readFileSync(filePath, 'utf8')
    const { specifiers, cheats } = extractRuntimeSignalsFromSource(
      sourceText,
      filePath,
      relFromMain,
      relFromModules
    )
    cheatViolations.push(...cheats)

    if (!fromDomainSpec) {
      // Common infra or unmapped — common infra excluded from 8x8 matrix
      continue
    }

    for (const item of specifiers) {
      const resolved = resolveTargetInModules(filePath, item.specifier, mainDir, modulesDir)
      if (!resolved) continue

      const toDomainSpec = MODULE_TO_DOMAIN.get(resolved.moduleKey)
      if (!toDomainSpec) continue // COMMON infra or external

      const edge: RuntimeImportEdge = {
        fromFile: relFromMain,
        fromModule,
        fromDomain: fromDomainSpec.id,
        toModule: resolved.moduleKey,
        toDomain: toDomainSpec.id,
        specifier: item.specifier,
        resolvedRelativePath: resolved.resolvedRelativePath,
        kind: item.kind,
        line: item.line
      }

      matrix[fromDomainSpec.index]![toDomainSpec.index]! += 1
      allEdges.push(edge)

      if (fromDomainSpec.index < toDomainSpec.index) {
        upperTriangularEdges.push(edge)
        const cellKey = `${fromDomainSpec.id}->${toDomainSpec.id}`
        if (!upperTriangularByCell[cellKey]) {
          upperTriangularByCell[cellKey] = []
        }
        upperTriangularByCell[cellKey]!.push(edge)
      }
    }
  }

  // 3. Anti-smuggling check: `src/main/shared/` and `src/main/db/` must NEVER runtime-import DP1..DP8
  const smuggledSharedImports: SmuggledImportViolation[] = []
  for (const pureDirName of ['shared', 'db']) {
    const pureDir = path.join(mainDir, pureDirName)
    if (!existsSync(pureDir)) continue
    const pureFiles = collectSourceFilesRecursive(pureDir).sort()
    for (const filePath of pureFiles) {
      const relFromMain = toPosix(path.relative(mainDir, filePath))
      const sourceText = readFileSync(filePath, 'utf8')
      const { specifiers } = extractRuntimeSignalsFromSource(
        sourceText,
        filePath,
        relFromMain,
        null
      )
      for (const item of specifiers) {
        const resolved = resolveTargetInModules(filePath, item.specifier, mainDir, modulesDir)
        if (!resolved) continue
        const toDomainSpec = MODULE_TO_DOMAIN.get(resolved.moduleKey)
        if (!toDomainSpec) continue
        smuggledSharedImports.push({
          file: relFromMain,
          line: item.line,
          specifier: item.specifier,
          toModule: resolved.moduleKey,
          toDomain: toDomainSpec.id,
          kind: item.kind
        })
      }
    }
  }

  let upperTriangularCells = 0
  for (let i = 0; i < DOMAIN_HIERARCHY.length; i++) {
    for (let j = i + 1; j < DOMAIN_HIERARCHY.length; j++) {
      if (matrix[i]![j]! > 0) {
        upperTriangularCells += 1
      }
    }
  }

  const sccs = computeTarjanSCCs(matrix)
  const nonTrivialSccs = sccs.filter((c) => c.length > 1)

  return {
    mainDir,
    modulesDir,
    scannedFiles: moduleFiles.length,
    unmappedEntries,
    matrix,
    allEdges,
    upperTriangularEdges,
    upperTriangularCells,
    upperTriangularByCell,
    sccs,
    nonTrivialSccs,
    cheatViolations,
    smuggledSharedImports
  }
}

export function formatAxiomaticMatrixReport(
  report: AxiomaticMatrixReport,
  options: { includeEdgeDetails?: boolean; filterRows?: number[] } = {}
): string {
  const lines: string[] = []
  const pad = (value: string | number, width: number): string => String(value).padStart(width, ' ')

  lines.push('=== MIT Axiomatic Design 8x8 Runtime Dependency Matrix ===')
  lines.push(`Scanned non-test source files in modules/: ${report.scannedFiles}`)
  lines.push(
    `Upper-triangular non-zero cells: ${report.upperTriangularCells} / 28 | Total upper-triangular runtime edges: ${report.upperTriangularEdges.length}`
  )
  lines.push(
    `Strongly Connected Components (SCCs): ${report.sccs.map((c) => `[${c.join(',')}]`).join(' ')} (non-trivial: ${report.nonTrivialSccs.length})`
  )
  lines.push('')

  const header = ['Row \\ Col'.padEnd(18), ...DOMAIN_HIERARCHY.map((d) => pad(d.id, 6))].join(' ')
  lines.push(header)
  lines.push('-'.repeat(header.length))

  for (const row of DOMAIN_HIERARCHY) {
    const label = `${row.id}(${row.label})`.padEnd(18)
    const cells = DOMAIN_HIERARCHY.map((col) => {
      const count = report.matrix[row.index]![col.index]!
      if (row.index === col.index) return pad(`[${count}]`, 6)
      if (row.index < col.index && count > 0) return pad(`*${count}`, 6)
      return pad(count === 0 ? '.' : count, 6)
    })
    lines.push([label, ...cells].join(' '))
  }

  lines.push('')
  lines.push(
    'Legend: [n]=intra-domain, *n=UPPER-TRIANGULAR VIOLATION (i < j), n=valid lower-triangular (i > j), .=0'
  )

  if (report.unmappedEntries.length > 0) {
    lines.push('')
    lines.push(
      `UNMAPPED MODULE ENTRIES (${report.unmappedEntries.length}): ${report.unmappedEntries.join(', ')}`
    )
  }

  if (report.cheatViolations.length > 0) {
    lines.push('')
    lines.push(`ANTI-CHEAT VIOLATIONS (${report.cheatViolations.length}):`)
    for (const v of report.cheatViolations) {
      lines.push(`  - ${v.file}:${v.line} [${v.kind}] ${v.reason} :: ${v.snippet}`)
    }
  }

  if (report.smuggledSharedImports.length > 0) {
    lines.push('')
    lines.push(`SMUGGLED SHARED/DB -> MODULE IMPORTS (${report.smuggledSharedImports.length}):`)
    for (const v of report.smuggledSharedImports) {
      lines.push(
        `  - ${v.file}:${v.line} (${v.kind}) -> ${v.toDomain}/${v.toModule} ('${v.specifier}')`
      )
    }
  }

  if (options.includeEdgeDetails !== false && report.upperTriangularEdges.length > 0) {
    const allowedRows = options.filterRows ? new Set(options.filterRows) : null
    lines.push('')
    lines.push('Upper-Triangular Runtime Import Edges:')
    const sortedCellKeys = Object.keys(report.upperTriangularByCell).sort((a, b) => {
      const [aRow, aCol] = a.split('->').map((s) => Number(s.slice(2)))
      const [bRow, bCol] = b.split('->').map((s) => Number(s.slice(2)))
      return aRow! - bRow! || aCol! - bCol!
    })

    for (const cellKey of sortedCellKeys) {
      const rowNum = Number(cellKey.split('->')[0]!.slice(2))
      if (allowedRows && !allowedRows.has(rowNum)) continue
      const edges = report.upperTriangularByCell[cellKey]!
      lines.push(`  A[${cellKey}] (${edges.length} edges):`)
      for (const edge of edges) {
        lines.push(`    - ${edge.fromFile}:${edge.line} (${edge.kind}) -> ${edge.specifier}`)
      }
    }
  }

  return lines.join('\n')
}

// Standalone CLI execution support: `tsx src/main/core/axiomatic-matrix-analyzer.ts [--main-dir=<path>] [--rows=1,2] [--strict]`
const isDirectCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectCli) {
  const args = process.argv.slice(2)
  let mainDir: string | undefined
  let strict = false
  let filterRows: number[] | undefined

  for (const arg of args) {
    if (arg === '--strict') {
      strict = true
    } else if (arg.startsWith('--main-dir=')) {
      mainDir = arg.slice('--main-dir='.length)
    } else if (arg.startsWith('--rows=')) {
      filterRows = arg
        .slice('--rows='.length)
        .split(',')
        .map((n) => Number.parseInt(n.trim(), 10))
        .filter((n) => Number.isFinite(n))
    }
  }

  const report = analyzeAxiomaticMatrix({ mainDir })
  process.stdout.write(
    `${formatAxiomaticMatrixReport(report, { includeEdgeDetails: true, filterRows })}\n`
  )

  if (strict) {
    const rowEdges = filterRows
      ? report.upperTriangularEdges.filter((e) =>
          filterRows!.includes(Number(e.fromDomain.slice(2)))
        )
      : report.upperTriangularEdges
    const failed =
      report.unmappedEntries.length > 0 ||
      report.cheatViolations.length > 0 ||
      report.smuggledSharedImports.length > 0 ||
      rowEdges.length > 0
    if (failed) {
      process.exitCode = 1
    }
  }
}

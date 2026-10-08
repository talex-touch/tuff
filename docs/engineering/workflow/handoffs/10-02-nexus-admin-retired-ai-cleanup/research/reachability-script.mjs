// Reachability of top-level declarations in a TS module.
// Usage: node reach.mjs <file> <root1,root2,...> [--json]
// Edge rule (deliberately conservative, mirrors the research method): a declaration
// depends on every other top-level name that appears as ANY identifier inside it
// (property names and type references included), so the live set is over-estimated.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(path.resolve('/Users/talexdreamsoul/Workspace/Worktrees/talex-touch-ai-cleanup/apps/nexus/package.json'))
const ts = require('typescript')

const [, , file, rootsArg, ...flags] = process.argv
const roots = rootsArg.split(',').map(s => s.trim()).filter(Boolean)
const text = fs.readFileSync(file, 'utf8')
const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line + 1

/** @type {Map<string, {names:string[], kind:string, start:number, end:number, node:any, exported:boolean}>} */
const decls = []
const importNames = new Map() // local name -> module
for (const stmt of sf.statements) {
  if (ts.isImportDeclaration(stmt)) {
    const mod = stmt.moduleSpecifier.text
    const clause = stmt.importClause
    if (clause) {
      if (clause.name) importNames.set(clause.name.text, mod)
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) importNames.set(clause.namedBindings.name.text, mod)
        else for (const el of clause.namedBindings.elements) importNames.set(el.name.text, mod)
      }
    }
    continue
  }
  const exported = !!(stmt.modifiers && stmt.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
  let names = []
  let kind = ts.SyntaxKind[stmt.kind]
  if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt)) {
    if (stmt.name) names = [stmt.name.text]
  }
  else if (ts.isVariableStatement(stmt)) {
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name)) names.push(d.name.text)
    }
  }
  else {
    names = [`<${kind}@${lineOf(stmt.getStart(sf))}>`]
  }
  decls.push({ names, kind, start: lineOf(stmt.getStart(sf)), fullStart: lineOf(stmt.getFullStart()), end: lineOf(stmt.end), node: stmt, exported })
}

const nameToDecl = new Map()
for (const d of decls) for (const n of d.names) nameToDecl.set(n, d)

function collectIdents(node, out) {
  if (ts.isIdentifier(node)) out.add(node.text)
  ts.forEachChild(node, c => collectIdents(c, out))
}

const deps = new Map()
const importUse = new Map()
for (const d of decls) {
  const ids = new Set()
  collectIdents(d.node, ids)
  const set = new Set()
  const imp = new Set()
  for (const id of ids) {
    if (nameToDecl.has(id) && !d.names.includes(id)) set.add(nameToDecl.get(id))
    if (importNames.has(id)) imp.add(id)
  }
  deps.set(d, set)
  importUse.set(d, imp)
}

const live = new Set()
const queue = []
for (const r of roots) {
  const d = nameToDecl.get(r)
  if (!d) { console.error(`root not found: ${r}`); process.exitCode = 2; continue }
  if (!live.has(d)) { live.add(d); queue.push(d) }
}
// statements without a name (expression statements etc.) are always live
for (const d of decls) if (d.names[0].startsWith('<') && !live.has(d)) { live.add(d); queue.push(d) }
while (queue.length) {
  const d = queue.shift()
  for (const n of deps.get(d)) if (!live.has(n)) { live.add(n); queue.push(n) }
}

const lines = d => d.end - d.start + 1
let liveLines = 0
let deadLines = 0
const dead = []
for (const d of decls) {
  if (live.has(d)) liveLines += lines(d)
  else { deadLines += lines(d); dead.push(d) }
}
const usedImports = new Set()
for (const d of live) for (const i of importUse.get(d)) usedImports.add(i)
const unusedImports = [...importNames.keys()].filter(n => !usedImports.has(n))

console.log(`file: ${file}`)
console.log(`total lines: ${text.split('\n').length - (text.endsWith('\n') ? 1 : 0)}`)
console.log(`top-level declarations: ${decls.length} (live ${live.size}, unreachable ${dead.length})`)
console.log(`live declaration lines: ${liveLines}; unreachable declaration lines: ${deadLines}`)
console.log(`roots: ${roots.join(', ')}`)
console.log(`\nunreachable declarations:`)
for (const d of dead) console.log(`  ${String(d.fullStart).padStart(5)}-${String(d.end).padEnd(5)} (decl starts ${d.start}) ${d.exported ? 'export ' : ''}${d.kind} ${d.names.join(', ')}`)
console.log(`\nimports no longer used by live declarations: ${unusedImports.length ? unusedImports.map(n => `${n} (${importNames.get(n)})`).join(', ') : 'none'}`)
if (flags.includes('--live')) {
  console.log('\nlive declarations:')
  for (const d of decls) if (live.has(d)) console.log(`  ${String(d.start).padStart(5)}-${String(d.end).padEnd(5)} ${d.exported ? 'export ' : ''}${d.kind} ${d.names.join(', ')}`)
}
if (flags.includes('--exports')) {
  console.log('\nexported names:')
  for (const d of decls) if (d.exported) console.log(`  ${d.names.join(', ')} ${live.has(d) ? '' : '(unreachable)'}`)
}

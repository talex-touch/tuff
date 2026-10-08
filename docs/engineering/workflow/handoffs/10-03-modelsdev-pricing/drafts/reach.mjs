import fs from 'node:fs'
import path from 'node:path'
const root = '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app/src/main'
const start = process.argv[2]
const target = process.argv[3]
const seen = new Map()
const exts = ['.ts', '/index.ts', '.js']
function resolve(from, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec)
  for (const e of ['', ...exts]) {
    const p = base + e
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}
function imports(file) {
  const src = fs.readFileSync(file, 'utf8')
  const out = []
  const re = /^\s*(import|export)\s+(?!type\b)([^;]*?)\s+from\s+['"]([^'"]+)['"]/gms
  let m
  while ((m = re.exec(src))) {
    if (/^\s*type\s/.test(m[2])) continue
    out.push(m[3])
  }
  const re2 = /^\s*import\s+['"]([^'"]+)['"]/gm
  while ((m = re2.exec(src))) out.push(m[1])
  return out
}
const queue = [[path.resolve(root, start), null]]
seen.set(path.resolve(root, start), null)
while (queue.length) {
  const [file] = queue.shift()
  for (const spec of imports(file)) {
    const r = resolve(file, spec)
    if (!r || seen.has(r)) continue
    seen.set(r, file)
    queue.push([r])
  }
}
const t = path.resolve(root, target)
if (seen.has(t)) {
  const chain = []
  let cur = t
  while (cur) { chain.push(path.relative(root, cur)); cur = seen.get(cur) }
  console.log('REACHABLE:', chain.reverse().join('\n  -> '))
} else console.log('not reachable; closure size', seen.size)

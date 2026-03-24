import fs from 'node:fs'
import path from 'node:path'

export function parseVersionCore(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim())
  if (!match) {
    return null
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  }
}

export function compareVersionCore(left, right) {
  const l = parseVersionCore(left)
  const r = parseVersionCore(right)
  if (!l || !r) {
    return null
  }
  if (l.major !== r.major) return l.major > r.major ? 1 : -1
  if (l.minor !== r.minor) return l.minor > r.minor ? 1 : -1
  if (l.patch !== r.patch) return l.patch > r.patch ? 1 : -1
  return 0
}

export function getProjectVersion(workspaceRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

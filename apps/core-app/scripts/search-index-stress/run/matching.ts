import path from 'node:path'
import type { SearchTarget } from '../types'
import type { SearchRow } from './driver-types'

/** APFS compares names case- and normalisation-insensitively, so the harness does too. */
export function normalizeName(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

function stripAppSuffix(value: string): string {
  return value.replace(/\.app$/i, '')
}

export interface TargetMatcher {
  matches: (row: SearchRow) => boolean
}

/** `corpusRoots` lists every spelling of the corpus root the app may report (lexical and real). */
export function createMatcher(target: SearchTarget, corpusRoots: readonly string[]): TargetMatcher {
  if (target.kind === 'app') {
    const wanted = normalizeName(stripAppSuffix(target.name))
    return {
      matches: (row) => {
        if (row.kind !== 'app') return false
        if (normalizeName(stripAppSuffix(row.name)) === wanted) return true
        return row.path !== undefined && normalizeName(path.basename(row.path, '.app')) === wanted
      }
    }
  }

  const wantedName = normalizeName(target.name)
  if (target.path === undefined) {
    return { matches: (row) => row.kind !== 'app' && normalizeName(row.name) === wantedName }
  }
  const wantedPaths = new Set(
    corpusRoots.map((root) => normalizeName(path.join(root, target.path as string)))
  )
  return {
    matches: (row) =>
      row.kind !== 'app' && row.path !== undefined && wantedPaths.has(normalizeName(row.path))
  }
}

/** 1-based position of the first matching row, or null. */
export function findRank(rows: readonly SearchRow[], matcher: TargetMatcher): number | null {
  const index = rows.findIndex((row) => matcher.matches(row))
  return index < 0 ? null : index + 1
}

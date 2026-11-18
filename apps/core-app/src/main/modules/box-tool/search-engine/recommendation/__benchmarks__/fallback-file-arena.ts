import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pinyin } from 'pinyin-pro'
import {
  createNativeFileArena,
  type NativeArenaIndexStats,
  type NativeArenaSearchMatchItem,
  type NativeArenaSearchOptions,
  type NativeArenaSearchResult,
  type NativeDeltaEntry,
  type NativeFileArenaHandle,
  type NativeScanFilterOptions
} from '@talex-touch/tuff-native/file-index'

const SNAPSHOT_MAGIC = 'TUFFIDX3'
const SNAPSHOT_VERSION = 1

const SCORE_MATCH = 16
const SCORE_BOUNDARY = 10
const SCORE_CAMEL = 7
const SCORE_CONSECUTIVE = 12
const SCORE_GAP_START = -3
const SCORE_GAP_EXTENSION = -1

interface CharSpan {
  readonly start: number
  readonly end: number
}

interface PinyinEntryProjection {
  readonly hasCjk: boolean
  readonly initVariants: readonly string[]
  readonly fullVariants: readonly string[]
  readonly charSpans: readonly CharSpan[]
}

interface FallbackArenaRecord {
  readonly path: string
  readonly dir: string
  readonly name: string
  readonly nameLower: string
  readonly stemLower: string
  readonly extension: string
  isDir: boolean
  mtimeSec: number
  readonly pinyin: PinyinEntryProjection | null
}

function isAsciiString(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0x7f) return false
  }
  return true
}

function mergeRanges(spans: readonly CharSpan[]): number[][] {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: number[][] = []
  let curStart = sorted[0]!.start
  let curEnd = sorted[0]!.end
  for (let i = 1; i < sorted.length; i += 1) {
    const s = sorted[i]!
    if (s.start <= curEnd) {
      curEnd = Math.max(curEnd, s.end)
    } else {
      out.push([curStart, curEnd])
      curStart = s.start
      curEnd = s.end
    }
  }
  out.push([curStart, curEnd])
  return out
}

function buildFallbackPinyin(name: string): PinyinEntryProjection | null {
  if (!/[\u4E00-\u9FFF]/.test(name)) {
    return null
  }
  let initVariants = ['']
  let fullVariants = ['']
  const charSpans: CharSpan[] = []
  let utf16Pos = 0

  for (const ch of name) {
    const uLen = ch.length
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0x4e00 && cp <= 0x9fff) {
      const raw = pinyin(ch, { toneType: 'none', multiple: true, type: 'array' })
      const syls = [
        ...new Set(
          raw
            .map((s) =>
              s
                .toLowerCase()
                .replace(/ü|u:/g, 'v')
                .replace(/[^a-z]/g, '')
            )
            .filter(Boolean)
        )
      ]
      if (syls.length > 0) {
        const inits = [...new Set(syls.map((s) => s[0]!))]
        const nextInits: string[] = []
        for (const prefix of initVariants) {
          for (const init of inits) {
            if (nextInits.length < 8) {
              nextInits.push(prefix + init)
            }
          }
        }
        initVariants = nextInits

        const nextFulls: string[] = []
        for (const prefix of fullVariants) {
          for (const syl of syls.slice(0, 2)) {
            if (nextFulls.length < 4) {
              nextFulls.push(prefix + syl)
            }
          }
        }
        fullVariants = nextFulls
        charSpans.push({ start: utf16Pos, end: utf16Pos + uLen })
      }
    } else if (/^[a-z0-9]$/i.test(ch)) {
      const lower = ch.toLowerCase()
      initVariants = initVariants.map((p) => p + lower)
      fullVariants = fullVariants.map((p) => p + lower)
      charSpans.push({ start: utf16Pos, end: utf16Pos + uLen })
    }
    utf16Pos += uLen
  }

  if (charSpans.length === 0) return null
  return {
    hasCjk: true,
    initVariants,
    fullVariants,
    charSpans
  }
}

function boundaryBonus(chars: readonly string[], idx: number): number {
  if (idx === 0) return SCORE_BOUNDARY
  const prev = chars[idx - 1]!
  const cur = chars[idx]!
  if (
    prev === '/' ||
    prev === '\\' ||
    prev === ' ' ||
    prev === '_' ||
    prev === '.' ||
    prev === '-'
  ) {
    return SCORE_BOUNDARY
  }
  if (prev >= 'a' && prev <= 'z' && cur >= 'A' && cur <= 'Z') {
    return SCORE_CAMEL
  }
  const prevDigit = prev >= '0' && prev <= '9'
  const curDigit = cur >= '0' && cur <= '9'
  if (!prevDigit && curDigit) {
    return SCORE_CAMEL
  }
  return 0
}

function scoreFzf(
  target: string,
  queryLower: string,
  needRanges: boolean
): { score: number; ranges: number[][] } | null {
  if (!queryLower || !target) return null
  const qChars = Array.from(queryLower)
  const tChars = Array.from(target)
  const qLen = qChars.length
  const tLen = tChars.length
  if (qLen === 0 || tLen === 0 || qLen > tLen || tLen > 256) return null

  const tLower = tChars.map((c) => c.toLowerCase())
  let qiCheck = 0
  for (let ti = 0; ti < tLen && qiCheck < qLen; ti += 1) {
    if (tLower[ti] === qChars[qiCheck]) qiCheck += 1
  }
  if (qiCheck < qLen) return null

  let prev = new Float64Array(tLen).fill(Number.NEGATIVE_INFINITY)
  let curr = new Float64Array(tLen).fill(Number.NEGATIVE_INFINITY)
  const back = needRanges ? new Int32Array(qLen * tLen).fill(-1) : null

  for (let qi = 0; qi < qLen; qi += 1) {
    curr.fill(Number.NEGATIVE_INFINITY)
    let bestGapVal = Number.NEGATIVE_INFINITY
    let bestGapIdx = -1
    const qCh = qChars[qi]!

    for (let ti = 0; ti < tLen; ti += 1) {
      if (qi > 0 && ti >= 2) {
        const prevIdx = ti - 2
        const pv = prev[prevIdx]!
        if (Number.isFinite(pv)) {
          const cand = pv - SCORE_GAP_EXTENSION * prevIdx
          if (cand > bestGapVal) {
            bestGapVal = cand
            bestGapIdx = prevIdx
          }
        }
      }
      if (tLower[ti] !== qCh) continue

      const charScore = SCORE_MATCH + boundaryBonus(tChars, ti)
      if (qi === 0) {
        const leadGap = ti === 0 ? 0 : SCORE_GAP_START + SCORE_GAP_EXTENSION * (ti - 1)
        curr[ti] = charScore + leadGap
        continue
      }

      let best = Number.NEGATIVE_INFINITY
      let from = -1
      if (ti > 0 && Number.isFinite(prev[ti - 1]!)) {
        best = prev[ti - 1]! + SCORE_CONSECUTIVE
        from = ti - 1
      }
      if (Number.isFinite(bestGapVal)) {
        const gapped = bestGapVal + SCORE_GAP_START + SCORE_GAP_EXTENSION * (ti - 2)
        if (gapped > best) {
          best = gapped
          from = bestGapIdx
        }
      }
      if (Number.isFinite(best)) {
        curr[ti] = best + charScore
        if (back) {
          back[qi * tLen + ti] = from
        }
      }
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }

  let best = Number.NEGATIVE_INFINITY
  let endIdx = 0
  for (let ti = 0; ti < tLen; ti += 1) {
    const val = prev[ti]!
    if (!Number.isFinite(val)) continue
    const trailing = SCORE_GAP_EXTENSION * (tLen - ti - 1) * 0.2
    const total = val + trailing
    if (total > best) {
      best = total
      endIdx = ti
    }
  }
  if (!Number.isFinite(best)) return null

  const maxPossible =
    qLen * (SCORE_MATCH + SCORE_BOUNDARY) + Math.max(0, qLen - 1) * SCORE_CONSECUTIVE
  const normalized = Math.min(1, Math.max(0, best / Math.max(1, maxPossible)))
  if (normalized <= 0.15) return null
  if (!needRanges || !back) return { score: normalized, ranges: [] }

  const matchedPos = new Array<number>(qLen)
  let curT = endIdx
  for (let qi = qLen - 1; qi >= 0; qi -= 1) {
    matchedPos[qi] = curT
    if (qi > 0) {
      const p = back[qi * tLen + curT]!
      if (p < 0) return null
      curT = p
    }
  }

  const utf16Starts = new Array<number>(tLen + 1)
  let acc = 0
  for (let i = 0; i < tLen; i += 1) {
    utf16Starts[i] = acc
    acc += tChars[i]!.length
  }
  utf16Starts[tLen] = acc

  const spans: CharSpan[] = matchedPos.map((ci) => ({
    start: utf16Starts[ci]!,
    end: utf16Starts[ci + 1]!
  }))
  return { score: normalized, ranges: mergeRanges(spans) }
}

function isPrefixMatch(targetPath: string, prefix: string): boolean {
  if (targetPath === prefix) return true
  const clean = prefix.replace(/[\\/]+$/, '')
  if (!clean) return targetPath.startsWith('/')
  if (!targetPath.startsWith(clean)) return false
  const next = targetPath[clean.length]
  return next === undefined || next === '/' || next === '\\'
}

function isLinkedWorktreeGitFile(gitPath: string): boolean {
  try {
    const text = fs.readFileSync(gitPath, 'utf8').trim()
    if (!text.startsWith('gitdir:')) return false
    const target = text.slice('gitdir:'.length).trim()
    return target.includes('/worktrees/') || target.includes('\\worktrees\\')
  } catch {
    return false
  }
}

class FallbackFileArena implements NativeFileArenaHandle {
  private readonly recordsByPath = new Map<string, FallbackArenaRecord>()
  private readonly dirs = new Set<string>()
  private fileCount = 0
  private dirCount = 0
  private tombstoneCount = 0
  private lastScanMs = 0

  private clear(): void {
    this.recordsByPath.clear()
    this.dirs.clear()
    this.fileCount = 0
    this.dirCount = 0
    this.tombstoneCount = 0
    this.lastScanMs = 0
  }

  private upsertInternal(dir: string, name: string, isDir: boolean, mtimeSec: number): void {
    if (!name) return
    const fullPath = dir ? path.join(dir, name) : name
    this.dirs.add(dir)
    const existing = this.recordsByPath.get(fullPath)
    if (existing) {
      if (existing.isDir !== isDir) {
        if (existing.isDir) {
          this.dirCount = Math.max(0, this.dirCount - 1)
          this.fileCount += 1
        } else {
          this.fileCount = Math.max(0, this.fileCount - 1)
          this.dirCount += 1
        }
      }
      existing.isDir = isDir
      existing.mtimeSec = mtimeSec
      return
    }

    const nameLower = name.toLowerCase()
    const dotIdx = nameLower.lastIndexOf('.')
    const stemLower = dotIdx > 0 ? nameLower.slice(0, dotIdx) : nameLower
    const extension =
      !isDir && dotIdx >= 0 && dotIdx < nameLower.length - 1 ? nameLower.slice(dotIdx) : ''

    this.recordsByPath.set(fullPath, {
      path: fullPath,
      dir,
      name,
      nameLower,
      stemLower,
      extension,
      isDir,
      mtimeSec,
      pinyin: buildFallbackPinyin(name)
    })
    if (isDir) {
      this.dirCount += 1
    } else {
      this.fileCount += 1
    }
  }

  async indexRoots(
    roots: string[],
    options?: NativeScanFilterOptions
  ): Promise<NativeArenaIndexStats> {
    const t0 = performance.now()
    this.clear()

    const excludeNames = new Set((options?.excludeNames ?? []).map((s) => s.toLowerCase()))
    const contextDependentNames = new Set(
      (options?.contextDependentNames ?? []).map((s) => s.toLowerCase())
    )
    const projectMarkers = new Set((options?.projectMarkers ?? []).map((s) => s.toLowerCase()))
    const excludeDirSuffixes = (options?.excludeDirSuffixes ?? []).map((s) => s.toLowerCase())
    const excludeHidden = options?.excludeHidden ?? false
    const excludePathPrefixes = options?.excludePathPrefixes ?? []
    const allowPathPrefixes = options?.allowPathPrefixes ?? []
    const maxDepth = options?.maxDepth ?? 24
    const includeDirs = options?.includeDirs ?? true
    const skipLinkedWorktrees = options?.skipLinkedWorktrees ?? true

    const isExcludedByPrefix = (candidatePath: string): boolean => {
      if (excludePathPrefixes.length === 0) return false
      if (allowPathPrefixes.some((allow) => isPrefixMatch(candidatePath, allow))) return false
      return excludePathPrefixes.some((ex) => isPrefixMatch(candidatePath, ex))
    }

    const visitedRoots = new Set<string>()
    const stack: Array<{
      dirPath: string
      depth: number
      insideProject: boolean
      isRoot: boolean
    }> = []

    for (const rawRoot of roots) {
      try {
        const st = fs.lstatSync(rawRoot)
        if (!st.isDirectory() || st.isSymbolicLink()) continue
        const real = fs.realpathSync(rawRoot)
        if (visitedRoots.has(real)) continue
        visitedRoots.add(real)
        stack.push({ dirPath: rawRoot, depth: 0, insideProject: false, isRoot: true })
      } catch {
        continue
      }
    }

    while (stack.length > 0) {
      const frame = stack.pop()!
      if (!frame.isRoot && isExcludedByPrefix(frame.dirPath)) continue

      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(frame.dirPath, { withFileTypes: true })
      } catch {
        continue
      }

      let hasProjectMarker = false
      let linkedWorktree = false
      if ((!frame.isRoot && skipLinkedWorktrees) || projectMarkers.size > 0) {
        for (const ent of entries) {
          if (!frame.isRoot && skipLinkedWorktrees && ent.isFile() && ent.name === '.git') {
            if (isLinkedWorktreeGitFile(path.join(frame.dirPath, '.git'))) {
              linkedWorktree = true
              break
            }
          }
          if (!hasProjectMarker && projectMarkers.has(ent.name.toLowerCase())) {
            hasProjectMarker = true
          }
        }
      }
      if (linkedWorktree) continue

      const childInsideProject = frame.isRoot ? false : frame.insideProject || hasProjectMarker

      for (const ent of entries) {
        if (ent.isSymbolicLink()) continue
        const name = ent.name
        if (name === '.' || name === '..') continue
        if (excludeHidden && name.startsWith('.')) continue

        const lowerName = name.toLowerCase()
        const childPath = path.join(frame.dirPath, name)

        if (ent.isDirectory()) {
          if (excludeNames.has(lowerName)) continue
          if (childInsideProject && contextDependentNames.has(lowerName)) continue
          if (excludeDirSuffixes.some((suf) => lowerName.endsWith(suf))) continue
          if (isExcludedByPrefix(childPath)) continue

          let mtimeSec = 0
          try {
            mtimeSec = Math.max(0, Math.floor(fs.lstatSync(childPath).mtimeMs / 1000))
          } catch {}

          if (includeDirs) {
            this.upsertInternal(frame.dirPath, name, true, mtimeSec)
          }
          if (frame.depth < maxDepth) {
            stack.push({
              dirPath: childPath,
              depth: frame.depth + 1,
              insideProject: childInsideProject,
              isRoot: false
            })
          }
        } else if (ent.isFile()) {
          if (excludeNames.has(lowerName)) continue
          let mtimeSec = 0
          try {
            mtimeSec = Math.max(0, Math.floor(fs.lstatSync(childPath).mtimeMs / 1000))
          } catch {}
          this.upsertInternal(frame.dirPath, name, false, mtimeSec)
        }
      }
    }

    this.lastScanMs = performance.now() - t0
    return this.getStats('ts-fallback')
  }

  replaceEntries(entries: NativeDeltaEntry[], scanMs = 0): NativeArenaIndexStats {
    this.clear()
    this.lastScanMs = scanMs
    for (const entry of entries) {
      this.upsertInternal(entry.dir, entry.name, entry.isDir, entry.mtimeSec ?? 0)
    }
    return this.getStats('ts-fallback')
  }

  applyDelta(
    upserts: NativeDeltaEntry[],
    removedPaths: string[],
    removedPrefixes: string[]
  ): NativeArenaIndexStats {
    for (const rawPrefix of removedPrefixes) {
      const clean = rawPrefix.replace(/[\\/]+$/, '')
      for (const [key, rec] of this.recordsByPath.entries()) {
        if (isPrefixMatch(key, clean)) {
          this.recordsByPath.delete(key)
          this.tombstoneCount += 1
          if (rec.isDir) {
            this.dirCount = Math.max(0, this.dirCount - 1)
          } else {
            this.fileCount = Math.max(0, this.fileCount - 1)
          }
        }
      }
    }
    for (const fullPath of removedPaths) {
      const rec = this.recordsByPath.get(fullPath)
      if (rec) {
        this.recordsByPath.delete(fullPath)
        this.tombstoneCount += 1
        if (rec.isDir) {
          this.dirCount = Math.max(0, this.dirCount - 1)
        } else {
          this.fileCount = Math.max(0, this.fileCount - 1)
        }
      }
    }
    for (const entry of upserts) {
      this.upsertInternal(entry.dir, entry.name, entry.isDir, entry.mtimeSec ?? 0)
    }
    return this.getStats('ts-fallback')
  }

  hasPath(fullPath: string): boolean {
    return this.recordsByPath.has(fullPath)
  }

  async search(
    query: string,
    options?: NativeArenaSearchOptions
  ): Promise<NativeArenaSearchResult> {
    const t0 = performance.now()
    const limit = options?.limit ?? 50
    const typeFilter = options?.typeFilter
    const allowedExts = options?.extensions?.length
      ? new Set(
          options.extensions
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean)
            .map((e) => (e.startsWith('.') ? e : `.${e}`))
        )
      : null

    const trimmed = query.trim()
    const totalIndexed = this.fileCount + this.dirCount
    if ((trimmed === '' && !allowedExts && !typeFilter) || limit <= 0 || totalIndexed === 0) {
      return {
        items: [],
        totalIndexed,
        bitmapRejected: 0,
        evaluatedCandidates: 0,
        durationMs: performance.now() - t0
      }
    }

    const matchesFilter = (rec: FallbackArenaRecord): boolean => {
      if (typeFilter === 'folder' && !rec.isDir) return false
      if (typeFilter === 'file' && rec.isDir) return false
      if (allowedExts) {
        if (rec.isDir || !rec.extension || !allowedExts.has(rec.extension)) return false
      }
      return true
    }

    if (trimmed === '') {
      let evaluated = 0
      const candidates: FallbackArenaRecord[] = []
      for (const rec of this.recordsByPath.values()) {
        if (!matchesFilter(rec)) continue
        evaluated += 1
        candidates.push(rec)
      }
      candidates.sort((a, b) => b.mtimeSec - a.mtimeSec || a.name.length - b.name.length)
      const items: NativeArenaSearchMatchItem[] = candidates.slice(0, limit).map((rec) => ({
        path: rec.path,
        name: rec.name,
        extension: rec.extension,
        isDir: rec.isDir,
        mtimeSec: rec.mtimeSec,
        mtimeMs: rec.mtimeSec * 1000,
        score: 0.4,
        matchKind: 'filter',
        matchedRanges: []
      }))
      return {
        items,
        totalIndexed,
        bitmapRejected: 0,
        evaluatedCandidates: evaluated,
        durationMs: performance.now() - t0
      }
    }

    const qLower = trimmed.toLowerCase()
    const isPathQuery = qLower.includes('/') || qLower.includes('\\')
    const qIsAscii = isAsciiString(qLower)

    let evaluated = 0
    const scored: NativeArenaSearchMatchItem[] = []

    for (const rec of this.recordsByPath.values()) {
      if (!matchesFilter(rec)) continue
      evaluated += 1

      let bestScore: number | null = null
      let matchKind = ''
      let matchedRanges: number[][] = []

      if (!isPathQuery) {
        if (rec.nameLower === qLower || rec.stemLower === qLower) {
          bestScore = 1.0
          matchKind = 'exact'
          matchedRanges = [[0, rec.name.length]]
        } else if (rec.nameLower.startsWith(qLower)) {
          bestScore = 0.97
          matchKind = 'prefix'
          matchedRanges = [[0, Math.min(rec.name.length, qLower.length)]]
        } else {
          const subIdx = rec.nameLower.indexOf(qLower)
          if (subIdx >= 0) {
            bestScore = Math.max(0.8, 0.92 - subIdx * 0.0015)
            matchKind = 'substring'
            matchedRanges = [[subIdx, Math.min(rec.name.length, subIdx + qLower.length)]]
          } else if (rec.pinyin && qIsAscii) {
            let pyMatched = false
            for (const variant of rec.pinyin.initVariants) {
              if (variant.startsWith(qLower)) {
                bestScore = 0.9
                matchKind = 'pinyin'
                matchedRanges = mergeRanges(rec.pinyin.charSpans.slice(0, qLower.length))
                pyMatched = true
                break
              }
              const pos = variant.indexOf(qLower)
              if (pos >= 0) {
                bestScore = 0.84
                matchKind = 'pinyin'
                matchedRanges = mergeRanges(rec.pinyin.charSpans.slice(pos, pos + qLower.length))
                pyMatched = true
                break
              }
            }
            if (!pyMatched) {
              for (let vIdx = 0; vIdx < rec.pinyin.fullVariants.length; vIdx += 1) {
                const fullVar = rec.pinyin.fullVariants[vIdx]!
                if (fullVar.startsWith(qLower) && vIdx === 0) {
                  bestScore = 0.9
                  matchKind = 'pinyin'
                  break
                }
                if (fullVar.includes(qLower)) {
                  bestScore = 0.82
                  matchKind = 'pinyin'
                  break
                }
              }
            }
          }

          if (bestScore === null) {
            const fzfHit = scoreFzf(rec.name, qLower, true)
            if (fzfHit) {
              bestScore = fzfHit.score * 0.85
              matchKind = 'fuzzy'
              matchedRanges = fzfHit.ranges
            }
          }
        }
      }

      if (bestScore === null) {
        const pathLower = rec.path.toLowerCase()
        if (isPathQuery || pathLower.includes(qLower)) {
          const pathFzf = scoreFzf(rec.path, qLower, false)
          if (pathFzf) {
            bestScore = pathFzf.score * 0.72
            matchKind = 'path'
          } else if (pathLower.includes(qLower)) {
            bestScore = 0.7
            matchKind = 'path'
          }
        }
      }

      if (bestScore !== null) {
        scored.push({
          path: rec.path,
          name: rec.name,
          extension: rec.extension,
          isDir: rec.isDir,
          mtimeSec: rec.mtimeSec,
          mtimeMs: rec.mtimeSec * 1000,
          score: bestScore,
          matchKind,
          matchedRanges
        })
      }
    }

    scored.sort(
      (a, b) => b.score - a.score || b.mtimeSec - a.mtimeSec || a.name.length - b.name.length
    )

    return {
      items: scored.slice(0, limit),
      totalIndexed,
      bitmapRejected: 0,
      evaluatedCandidates: evaluated,
      durationMs: performance.now() - t0
    }
  }

  saveSnapshot(snapshotPath: string): number {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
    const dirList: string[] = []
    const dirIndexMap = new Map<string, number>()
    for (const rec of this.recordsByPath.values()) {
      if (!dirIndexMap.has(rec.dir)) {
        dirIndexMap.set(rec.dir, dirList.length)
        dirList.push(rec.dir)
      }
    }

    const chunks: Buffer[] = []
    const header = Buffer.alloc(20)
    header.write(SNAPSHOT_MAGIC, 0, 'ascii')
    header.writeUInt32LE(SNAPSHOT_VERSION, 8)
    header.writeUInt32LE(dirList.length, 12)
    header.writeUInt32LE(this.recordsByPath.size, 16)
    chunks.push(header)

    for (const dir of dirList) {
      const dirBuf = Buffer.from(dir, 'utf8')
      const lenBuf = Buffer.alloc(2)
      lenBuf.writeUInt16LE(dirBuf.length, 0)
      chunks.push(lenBuf, dirBuf)
    }

    for (const rec of this.recordsByPath.values()) {
      const dirIdx = dirIndexMap.get(rec.dir) ?? 0
      const nameBuf = Buffer.from(rec.name, 'utf8')
      const meta = Buffer.alloc(11)
      meta.writeUInt32LE(dirIdx, 0)
      meta.writeUInt8(rec.isDir ? 1 : 0, 4)
      meta.writeUInt32LE(rec.mtimeSec >>> 0, 5)
      meta.writeUInt16LE(nameBuf.length, 9)
      chunks.push(meta, nameBuf)
    }

    const full = Buffer.concat(chunks)
    fs.writeFileSync(snapshotPath, full)
    return full.byteLength
  }

  loadSnapshot(snapshotPath: string): NativeArenaIndexStats {
    const raw = fs.readFileSync(snapshotPath)
    if (raw.byteLength < 20 || raw.subarray(0, 8).toString('ascii') !== SNAPSHOT_MAGIC) {
      throw new Error('Invalid or unsupported snapshot header (expected TUFFIDX3)')
    }
    const version = raw.readUInt32LE(8)
    if (version !== SNAPSHOT_VERSION) {
      throw new Error(`Unsupported TUFFIDX3 snapshot version: ${version}`)
    }
    const dirCount = raw.readUInt32LE(12)
    const entryCount = raw.readUInt32LE(16)

    this.clear()
    let offset = 20
    const dirs: string[] = []
    for (let i = 0; i < dirCount; i += 1) {
      const len = raw.readUInt16LE(offset)
      offset += 2
      dirs.push(raw.subarray(offset, offset + len).toString('utf8'))
      offset += len
    }

    for (let i = 0; i < entryCount; i += 1) {
      const dirIdx = raw.readUInt32LE(offset)
      const isDir = raw.readUInt8(offset + 4) === 1
      const mtimeSec = raw.readUInt32LE(offset + 5)
      const nameLen = raw.readUInt16LE(offset + 9)
      offset += 11
      const name = raw.subarray(offset, offset + nameLen).toString('utf8')
      offset += nameLen
      this.upsertInternal(dirs[dirIdx] ?? '', name, isDir, mtimeSec)
    }

    return this.getStats('snapshot')
  }

  getStats(backend = 'ts-fallback'): NativeArenaIndexStats {
    const activeCount = this.fileCount + this.dirCount
    // Compact HotRecord (24B) + average interned UTF-8 slab & bucket slot (~52B) + DirNode (~48B)
    const estimatedArenaBytes = activeCount * 76 + this.dirs.size * 48
    return {
      fileCount: this.fileCount,
      dirCount: this.dirCount,
      activeCount,
      tombstoneCount: this.tombstoneCount,
      arenaBytes: estimatedArenaBytes,
      lastScanMs: this.lastScanMs,
      backend
    }
  }
}

export function createArenaWithFallback(): NativeFileArenaHandle {
  return createNativeFileArena() ?? new FallbackFileArena()
}

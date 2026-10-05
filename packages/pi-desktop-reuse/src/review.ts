// SPDX-License-Identifier: LGPL-3.0-only
//
// Copyright (C) vastsa and PI-Desktop contributors.
// Derived from vastsa/PI-Desktop @ 3b036cc7810e18b3ef7689a2b93385125a8d0a3f,
//   crates/host-core/src/review.rs
//
// Tuff adaptation (LGPL-3.0-only derivative): the pure parts of upstream's
// review evidence are translated from Rust to TypeScript — the snapshot and
// preview bounds (16 MiB / 512 KiB / 4000 lines / 2,000,000 LCS cells /
// 3 context lines), the NUL-or-invalid-UTF-8 binary rule, `str::lines`
// splitting, the LCS edit script (`diff_ops`), hunk construction
// (`make_hunks`), line counts and the post-tool "unchanged since" guard of
// `rollback_change`. Changes from upstream:
// - the LCS table is one flat `Uint32Array` and the edit script keeps line
//   indices instead of cloned strings;
// - an oversized preview, a line/cell budget overrun and binary content are
//   reported as separate `tooLarge` / `truncated` / `binary` flags, and counts
//   that were never computed are omitted instead of reported as zero;
// - filesystem access, snapshot directories and rollback I/O are not carried:
//   Tuff Main (apps/core-app file-review-service) owns capture, persistence,
//   locking and authorized multi-path rollback for write/delete/copy/move.

export const REVIEW_MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024
export const REVIEW_MAX_DIFF_BYTES = 512 * 1024
export const REVIEW_MAX_DIFF_LINES = 4000
export const REVIEW_MAX_DIFF_CELLS = 2_000_000
export const REVIEW_CONTEXT_LINES = 3

export type ReviewDiffLineType = 'context' | 'add' | 'del'

export interface ReviewDiffLine {
  type: ReviewDiffLineType
  text: string
}

export interface ReviewDiffHunk {
  header: string
  lines: ReviewDiffLine[]
}

export interface ReviewDiff {
  binary: boolean
  truncated: boolean
  tooLarge: boolean
  additions?: number
  deletions?: number
  hunks: ReviewDiffHunk[]
}

/**
 * One side of a preview: absent, content read within the preview bound, or a file whose size
 * exceeded the preview bound (`oversize`) so it was deliberately not read.
 */
export type ReviewPreviewSide =
  | { kind: 'absent' }
  | { kind: 'content', bytes: Uint8Array }
  | { kind: 'oversize' }

/** Existence plus full-content hash; `exists: null` is an unknown capture. */
export interface ReviewFileState {
  exists: boolean | null
  hash?: string
}

const OP_EQUAL = 0
const OP_DEL = 1
const OP_ADD = 2

interface DiffOps {
  kinds: Uint8Array
  /** Line index into `before` for equal/del, into `after` for add. */
  lines: Uint32Array
  length: number
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Upstream rule: any NUL byte or invalid UTF-8 makes the content binary. */
export function decodeReviewText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null
  try {
    return utf8.decode(bytes)
  } catch {
    return null
  }
}

/** Rust `str::lines`: split on `\n`, strip one trailing `\r`, no final empty line. */
export function splitReviewLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (line.endsWith('\r')) lines[index] = line.slice(0, -1)
  }
  return lines
}

function diffOps(before: readonly string[], after: readonly string[]): DiffOps | null {
  const rows = before.length + 1
  const columns = after.length + 1
  if (rows * columns > REVIEW_MAX_DIFF_CELLS) return null
  const lcs = new Uint32Array(rows * columns)
  for (let old = before.length - 1; old >= 0; old -= 1) {
    for (let next = after.length - 1; next >= 0; next -= 1) {
      lcs[old * columns + next] = before[old] === after[next]
        ? lcs[(old + 1) * columns + next + 1]! + 1
        : Math.max(lcs[(old + 1) * columns + next]!, lcs[old * columns + next + 1]!)
    }
  }

  const capacity = before.length + after.length
  const kinds = new Uint8Array(capacity)
  const lines = new Uint32Array(capacity)
  let length = 0
  let old = 0
  let next = 0
  while (old < before.length || next < after.length) {
    if (old < before.length && next < after.length && before[old] === after[next]) {
      kinds[length] = OP_EQUAL
      lines[length] = old
      old += 1
      next += 1
    }
    else if (
      next === after.length
      || (old < before.length && lcs[(old + 1) * columns + next]! >= lcs[old * columns + next + 1]!)
    ) {
      kinds[length] = OP_DEL
      lines[length] = old
      old += 1
    }
    else {
      kinds[length] = OP_ADD
      lines[length] = next
      next += 1
    }
    length += 1
  }
  return { kinds, lines, length }
}

function makeHunks(ops: DiffOps, before: readonly string[], after: readonly string[]): ReviewDiffHunk[] {
  const ranges: Array<[start: number, end: number]> = []
  for (let index = 0; index < ops.length; index += 1) {
    if (ops.kinds[index] === OP_EQUAL) continue
    const start = Math.max(0, index - REVIEW_CONTEXT_LINES)
    const end = Math.min(ops.length, index + REVIEW_CONTEXT_LINES + 1)
    const previous = ranges[ranges.length - 1]
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end)
      continue
    }
    ranges.push([start, end])
  }

  const hunks: ReviewDiffHunk[] = []
  let cursor = 0
  let oldBefore = 0
  let newBefore = 0
  for (const [start, end] of ranges) {
    for (; cursor < start; cursor += 1) {
      if (ops.kinds[cursor] !== OP_ADD) oldBefore += 1
      if (ops.kinds[cursor] !== OP_DEL) newBefore += 1
    }
    let oldLength = 0
    let newLength = 0
    const lines: ReviewDiffLine[] = []
    for (let index = start; index < end; index += 1) {
      const kind = ops.kinds[index]
      const line = ops.lines[index]!
      if (kind === OP_EQUAL) {
        oldLength += 1
        newLength += 1
        lines.push({ type: 'context', text: before[line]! })
      }
      else if (kind === OP_DEL) {
        oldLength += 1
        lines.push({ type: 'del', text: before[line]! })
      }
      else {
        newLength += 1
        lines.push({ type: 'add', text: after[line]! })
      }
    }
    hunks.push({
      header: `@@ -${oldBefore + 1},${oldLength} +${newBefore + 1},${newLength} @@`,
      lines,
    })
  }
  return hunks
}

function previewText(side: ReviewPreviewSide): string | null | 'oversize' {
  if (side.kind === 'absent') return ''
  if (side.kind === 'oversize' || side.bytes.byteLength > REVIEW_MAX_DIFF_BYTES) return 'oversize'
  return decodeReviewText(side.bytes)
}

/** Upstream `make_preview`, with distinct oversize/budget/binary outcomes. */
export function buildReviewDiff(before: ReviewPreviewSide, after: ReviewPreviewSide): ReviewDiff {
  const beforeText = previewText(before)
  const afterText = previewText(after)
  if (beforeText === 'oversize' || afterText === 'oversize') {
    return { binary: false, truncated: false, tooLarge: true, hunks: [] }
  }
  if (beforeText === null || afterText === null) {
    return { binary: true, truncated: false, tooLarge: false, hunks: [] }
  }
  const beforeLines = splitReviewLines(beforeText)
  const afterLines = splitReviewLines(afterText)
  if (beforeLines.length > REVIEW_MAX_DIFF_LINES || afterLines.length > REVIEW_MAX_DIFF_LINES) {
    return { binary: false, truncated: true, tooLarge: false, hunks: [] }
  }
  const ops = diffOps(beforeLines, afterLines)
  if (!ops) return { binary: false, truncated: true, tooLarge: false, hunks: [] }
  let additions = 0
  let deletions = 0
  for (let index = 0; index < ops.length; index += 1) {
    if (ops.kinds[index] === OP_ADD) additions += 1
    else if (ops.kinds[index] === OP_DEL) deletions += 1
  }
  return {
    binary: false,
    truncated: false,
    tooLarge: false,
    additions,
    deletions,
    hunks: makeHunks(ops, beforeLines, afterLines),
  }
}

/**
 * Upstream `rollback_change` guard: the current file must still be exactly what the tool left.
 * Unknown existence on either side is never treated as unchanged.
 */
export function isUnchangedSince(expected: ReviewFileState, current: ReviewFileState): boolean {
  if (expected.exists === null || current.exists === null) return false
  if (expected.exists !== current.exists) return false
  if (!expected.exists) return true
  return expected.hash !== undefined && expected.hash === current.hash
}

/** Whether an operation changed a path, judged only on known existence and hashes. */
export function didReviewStateChange(before: ReviewFileState, after: ReviewFileState): boolean | null {
  if (before.exists === null || after.exists === null) return null
  if (before.exists !== after.exists) return true
  if (!before.exists) return false
  if (before.hash === undefined || after.hash === undefined) return null
  return before.hash !== after.hash
}

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildReviewDiff,
  decodeReviewText,
  didReviewStateChange,
  isUnchangedSince,
  REVIEW_MAX_DIFF_BYTES,
  REVIEW_MAX_DIFF_LINES,
  REVIEW_MAX_SNAPSHOT_BYTES,
  splitReviewLines
} from '@talex-touch/pi-desktop-reuse/review'
import type { ReviewPreviewSide, ReviewFileState } from '@talex-touch/pi-desktop-reuse/review'
import {
  captureFileState,
  checkConfinement,
  currentFileState,
  writeFileAtomically
} from './file-review-fs'

let root: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'review-fs-consumer-')))
})
afterEach(async () => {
  vi.restoreAllMocks()
  if (root) await fs.rm(root, { recursive: true, force: true })
})
const content = (text: string): ReviewPreviewSide => ({ kind: 'content', bytes: Buffer.from(text) })

describe('real file-review filesystem capture and restore', () => {
  it.each([
    { name: 'empty file', bytes: Buffer.alloc(0) },
    { name: 'UTF-8 and CRLF', bytes: Buffer.from('中文🙂\r\nsecond\n') },
    { name: 'binary bytes', bytes: Buffer.from([0, 255, 128, 10]) }
  ])('$name captures exact original bytes and a full-content hash', async ({ bytes }) => {
    const file = join(root, 'file.txt')
    expect(await captureFileState(file, true)).toEqual({
      exists: false,
      preview: { kind: 'absent' }
    })
    await fs.writeFile(file, bytes, { mode: 0o640 })
    await fs.chmod(file, 0o640)
    const captured = await captureFileState(file, true)
    expect(captured).toMatchObject({
      exists: true,
      size: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
      content: bytes,
      mode: 0o640,
      preview: { kind: 'content', bytes }
    })
    expect(await currentFileState(file)).toEqual({ exists: true, hash: captured.hash })
    await writeFileAtomically(file, Buffer.from('replacement\n'), 0o600)
    expect(await fs.readFile(file)).toEqual(Buffer.from('replacement\n'))
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
    expect(
      isUnchangedSince({ exists: true, hash: captured.hash }, await currentFileState(file))
    ).toBe(false)
    await fs.unlink(file)
    expect(await currentFileState(file)).toEqual({ exists: false })
  })

  it.each([
    {
      name: 'preview limit + 1',
      size: REVIEW_MAX_DIFF_BYTES + 1,
      keepContent: false,
      snapshot: false
    },
    {
      name: 'exact snapshot limit',
      size: REVIEW_MAX_SNAPSHOT_BYTES,
      keepContent: true,
      snapshot: true
    },
    {
      name: 'snapshot limit + 1',
      size: REVIEW_MAX_SNAPSHOT_BYTES + 1,
      keepContent: true,
      snapshot: false
    }
  ])(
    '$name still hashes the complete file without pretending a preview exists',
    async ({ size, keepContent, snapshot }) => {
      const bytes = Buffer.alloc(size, 97)
      bytes[size - 1] = 98
      const file = join(root, 'bounded.txt')
      await fs.writeFile(file, bytes)
      const captured = await captureFileState(file, keepContent)
      expect(captured).toMatchObject({
        exists: true,
        size,
        hash: createHash('sha256').update(bytes).digest('hex'),
        preview: { kind: 'oversize' }
      })
      if (snapshot) expect(captured.content?.equals(bytes)).toBe(true)
      else expect(captured.content).toBeUndefined()
      if (size > REVIEW_MAX_SNAPSHOT_BYTES) expect(captured.reason).toBe('too_large')
      expect(await currentFileState(file)).toEqual({ exists: true, hash: captured.hash })
    }
  )

  it('a real non-file capture is unknown for rollback, not an empty or unchanged file', async () => {
    const directory = join(root, 'directory')
    await fs.mkdir(directory)
    expect(await captureFileState(directory, true)).toEqual({
      exists: true,
      reason: 'capture_failed'
    })
    expect(await currentFileState(directory)).toEqual({ exists: true })
    expect(
      isUnchangedSince({ exists: true, hash: 'known' }, await currentFileState(directory))
    ).toBe(false)
    expect(await checkConfinement(root, directory)).toBe('not_file')
  })

  it('atomic restore failure removes only its temp file, never the original user file', async () => {
    const target = join(root, 'user.txt')
    await fs.writeFile(target, 'user bytes\n')
    const originalError = Object.assign(new Error('rename denied'), { code: 'EACCES' })
    vi.spyOn(fs, 'rename').mockRejectedValue(originalError)
    await expect(writeFileAtomically(target, Buffer.from('restore bytes\n'), 0o644)).rejects.toBe(
      originalError
    )
    expect(await fs.readFile(target, 'utf8')).toBe('user bytes\n')
    expect(await fs.readdir(root)).toEqual(['user.txt'])
  })
})

describe('review public diff and rollback evidence contracts', () => {
  it.each([
    {
      name: 'creation',
      before: { kind: 'absent' } as ReviewPreviewSide,
      after: content('中文\r\n🙂\r\n'),
      header: '@@ -1,0 +1,2 @@',
      lines: [
        { type: 'add', text: '中文' },
        { type: 'add', text: '🙂' }
      ],
      additions: 2,
      deletions: 0
    },
    {
      name: 'deletion',
      before: content('old\n'),
      after: { kind: 'absent' } as ReviewPreviewSide,
      header: '@@ -1,1 +1,0 @@',
      lines: [{ type: 'del', text: 'old' }],
      additions: 0,
      deletions: 1
    },
    {
      name: 'replacement',
      before: content('same\nold\n'),
      after: content('same\nnew\n'),
      header: '@@ -1,2 +1,2 @@',
      lines: [
        { type: 'context', text: 'same' },
        { type: 'del', text: 'old' },
        { type: 'add', text: 'new' }
      ],
      additions: 1,
      deletions: 1
    }
  ])(
    '$name has truthful counts and downstream-readable hunk coordinates',
    ({ before, after, header, lines, additions, deletions }) => {
      expect(buildReviewDiff(before, after)).toEqual({
        binary: false,
        truncated: false,
        tooLarge: false,
        additions,
        deletions,
        hunks: [{ header, lines }]
      })
    }
  )

  it.each([
    {
      name: 'NUL byte',
      before: { kind: 'content', bytes: Uint8Array.of(97, 0, 98) } as ReviewPreviewSide,
      after: content('text'),
      flags: { binary: true, truncated: false, tooLarge: false }
    },
    {
      name: 'invalid UTF-8',
      before: { kind: 'content', bytes: Uint8Array.of(0xc3, 0x28) } as ReviewPreviewSide,
      after: content('text'),
      flags: { binary: true, truncated: false, tooLarge: false }
    },
    {
      name: 'oversized side',
      before: { kind: 'oversize' } as ReviewPreviewSide,
      after: content('text'),
      flags: { binary: false, truncated: false, tooLarge: true }
    },
    {
      name: 'oversized concrete bytes',
      before: content('a'.repeat(REVIEW_MAX_DIFF_BYTES + 1)),
      after: content('text'),
      flags: { binary: false, truncated: false, tooLarge: true }
    },
    {
      name: 'line budget',
      before: content('line\n'.repeat(REVIEW_MAX_DIFF_LINES + 1)),
      after: content('text'),
      flags: { binary: false, truncated: true, tooLarge: false }
    },
    {
      name: 'LCS cell budget',
      before: content('before\n'.repeat(1500)),
      after: content('after\n'.repeat(1500)),
      flags: { binary: false, truncated: true, tooLarge: false }
    }
  ])(
    '$name omits uncomputed counts instead of inventing zero changes',
    ({ before, after, flags }) => {
      const diff = buildReviewDiff(before, after)
      expect(diff).toEqual({ ...flags, hunks: [] })
      expect(diff).not.toHaveProperty('additions')
      expect(diff).not.toHaveProperty('deletions')
    }
  )

  it('exact byte/line boundaries remain reviewable instead of being mislabeled truncated', () => {
    const bytes = content('a'.repeat(REVIEW_MAX_DIFF_BYTES))
    expect(buildReviewDiff({ kind: 'absent' }, bytes)).toMatchObject({
      additions: 1,
      deletions: 0,
      binary: false,
      truncated: false,
      tooLarge: false
    })
    const lines = content('line\n'.repeat(REVIEW_MAX_DIFF_LINES))
    const diff = buildReviewDiff({ kind: 'absent' }, lines)
    expect(diff).toMatchObject({
      additions: REVIEW_MAX_DIFF_LINES,
      deletions: 0,
      truncated: false,
      tooLarge: false
    })
    expect(diff.hunks[0]!.lines.map((line) => line.text)).toEqual(
      Array(REVIEW_MAX_DIFF_LINES).fill('line')
    )
  })

  it('separated hunks are applicable to the original and reconstruct the exact new lines', () => {
    const before = Array.from({ length: 24 }, (_, index) => `line-${index}`)
    const after = [...before]
    after.splice(2, 1, 'replacement-two', 'inserted-three')
    after.splice(21, 1, 'replacement-twenty')
    const diff = buildReviewDiff(
      content(before.join('\n') + '\n'),
      content(after.join('\n') + '\n')
    )
    expect(diff.additions).toBe(3)
    expect(diff.deletions).toBe(2)
    expect(diff.hunks).toHaveLength(2)
    const reconstructed: string[] = []
    let oldCursor = 0
    for (const hunk of diff.hunks) {
      const coordinates = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(hunk.header)!
      const start = Number(coordinates[1]) - 1
      reconstructed.push(...before.slice(oldCursor, start))
      expect(Number(coordinates[3]) - 1).toBe(reconstructed.length)
      const oldLines = hunk.lines.filter((line) => line.type !== 'add').map((line) => line.text)
      const newLines = hunk.lines.filter((line) => line.type !== 'del').map((line) => line.text)
      expect(oldLines).toEqual(before.slice(start, start + Number(coordinates[2])))
      expect(newLines.length).toBe(Number(coordinates[4]))
      reconstructed.push(...newLines)
      oldCursor = start + oldLines.length
    }
    reconstructed.push(...before.slice(oldCursor))
    expect(reconstructed).toEqual(after)
  })

  it.each([
    {
      name: 'unknown original',
      expected: { exists: null },
      current: { exists: false },
      unchanged: false,
      changed: null
    },
    {
      name: 'unknown current',
      expected: { exists: true, hash: 'a' },
      current: { exists: null },
      unchanged: false,
      changed: null
    },
    {
      name: 'missing hash',
      expected: { exists: true },
      current: { exists: true, hash: 'a' },
      unchanged: false,
      changed: null
    },
    {
      name: 'both absent',
      expected: { exists: false },
      current: { exists: false },
      unchanged: true,
      changed: false
    },
    {
      name: 'created',
      expected: { exists: false },
      current: { exists: true, hash: 'a' },
      unchanged: false,
      changed: true
    },
    {
      name: 'deleted',
      expected: { exists: true, hash: 'a' },
      current: { exists: false },
      unchanged: false,
      changed: true
    },
    {
      name: 'same hash',
      expected: { exists: true, hash: 'a' },
      current: { exists: true, hash: 'a' },
      unchanged: true,
      changed: false
    },
    {
      name: 'user edit',
      expected: { exists: true, hash: 'a' },
      current: { exists: true, hash: 'b' },
      unchanged: false,
      changed: true
    }
  ] satisfies Array<{
    name: string
    expected: ReviewFileState
    current: ReviewFileState
    unchanged: boolean
    changed: boolean | null
  }>)(
    '$name distinguishes conflict, known change and unknown evidence',
    ({ expected, current, unchanged, changed }) => {
      expect(isUnchangedSince(expected, current)).toBe(unchanged)
      expect(didReviewStateChange(expected, current)).toBe(changed)
    }
  )

  it.each([
    { input: '', expected: [] },
    { input: '\n', expected: [''] },
    { input: 'one\r\n\r\ntwo\n', expected: ['one', '', 'two'] },
    { input: '中文🙂\nlast', expected: ['中文🙂', 'last'] }
  ])(
    'line parsing preserves real blank lines and Unicode without a phantom trailing line: $input',
    ({ input, expected }) => {
      const text = decodeReviewText(Buffer.from(input))
      expect(text).toBe(input)
      expect(splitReviewLines(text!)).toEqual(expected)
    }
  )
})

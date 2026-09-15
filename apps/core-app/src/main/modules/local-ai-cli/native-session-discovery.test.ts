/**
 * Regression for filesystem discovery of provider-owned CLI sessions (2026-09-13).
 *
 * Discovery is the one place Tuff reads transcripts it does not own. Three properties must not
 * regress, and each is observable from the returned candidates rather than from internals:
 *
 *  - A provider archive is only adopted when the provider-recorded cwd canonicalizes to the
 *    scanned project. A session from another folder, a symlinked spelling, or a symlink that
 *    escapes the archive must be dropped instead of silently bound to the wrong project.
 *  - The scan is bounded. Files it could not examine (malformed, wrong schema, too large) are
 *    counted as skipped, and hitting a scan budget is reported as `incomplete` instead of
 *    presenting a partial archive as complete.
 *  - Pi is the only provider whose session JSONL exposes entry ids, so its last identified entry
 *    becomes the expected head; other providers report no head rather than a guessed one.
 *
 * All archives are throwaway temp trees; no real user session is read.
 */
import type { NativeSessionDiscoveryRoots } from './native-session-discovery'
import { mkdir, mkdtemp, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanNativeSessionsForProject } from './native-session-discovery'

/** Mirrors the scanner budget; a file one byte past it must be ignored, not parsed. */
const MAX_FILE_BYTES = 64 * 1024 * 1024

let tempDir: string
let projectRoot: string
let roots: NativeSessionDiscoveryRoots

async function pathOf(...segments: string[]): Promise<string> {
  const target = join(tempDir, ...segments)
  await mkdir(dirname(target), { recursive: true })
  return target
}

async function writeJsonl(filePath: string, lines: readonly unknown[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

function piSessionLines(id: string, cwd: string, extra: Record<string, unknown> = {}): unknown[] {
  return [
    { type: 'session', version: 3, id, cwd, timestamp: '2026-01-02T03:04:05.000Z', ...extra },
    { type: 'message', message: { role: 'user', content: `${id} first ask` } }
  ]
}

async function scan(options: { signal?: AbortSignal } = {}) {
  return scanNativeSessionsForProject(projectRoot, { roots, ...options })
}

async function scanWith(
  overrides: Partial<NativeSessionDiscoveryRoots>,
  options: { signal?: AbortSignal } = {}
) {
  return scanNativeSessionsForProject(projectRoot, {
    roots: { ...roots, ...overrides },
    ...options
  })
}

beforeEach(async () => {
  tempDir = await realpath(await mkdtemp(join(tmpdir(), 'native-session-discovery-')))
  const projectPath = join(tempDir, 'project')
  await mkdir(projectPath, { recursive: true })
  projectRoot = await realpath(projectPath)
  const rootsBase = join(tempDir, 'roots')
  roots = {
    pi: join(rootsBase, 'pi'),
    'oh-my-pi': join(rootsBase, 'omp'),
    claude: join(rootsBase, 'claude'),
    codex: join(rootsBase, 'codex')
  }
  await Promise.all(Object.values(roots).map((root) => mkdir(root, { recursive: true })))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('scanNativeSessionsForProject', () => {
  it('adopts one candidate per provider from each native archive shape', async () => {
    await writeJsonl(
      join(roots.pi, 'pi-1.jsonl'),
      piSessionLines('pi-1', projectRoot, { title: 'Pi session' })
    )
    await writeJsonl(
      join(roots['oh-my-pi'], 'omp-1.jsonl'),
      piSessionLines('omp-1', projectRoot, { title: 'Omp session' })
    )
    const claudeId = '11111111-2222-3333-4444-555555555555'
    await writeJsonl(join(roots.claude, `${claudeId}.jsonl`), [
      {
        type: 'user',
        sessionId: claudeId,
        cwd: projectRoot,
        timestamp: '2026-01-02T03:04:05.000Z',
        message: { role: 'user', content: 'Claude first ask' }
      }
    ])
    await writeJsonl(join(roots.codex, 'codex-1.jsonl'), [
      {
        type: 'session_meta',
        payload: { id: 'codex-1', cwd: projectRoot, timestamp: '2026-01-02T03:04:05.000Z' }
      },
      {
        type: 'response_item',
        role: 'user',
        payload: { type: 'message', content: [{ type: 'input_text', text: 'Codex first ask' }] }
      }
    ])

    const result = await scan()
    const byNativeId = new Map(result.candidates.map((item) => [item.nativeSessionId, item]))

    expect([...byNativeId.keys()].sort()).toEqual([claudeId, 'codex-1', 'omp-1', 'pi-1'])
    expect(byNativeId.get('pi-1')).toMatchObject({
      provider: 'pi',
      projectRoot,
      title: 'Pi session'
    })
    expect(byNativeId.get('omp-1')).toMatchObject({
      provider: 'oh-my-pi',
      projectRoot,
      title: 'Omp session'
    })
    expect(byNativeId.get(claudeId)).toMatchObject({
      provider: 'claude',
      projectRoot,
      title: 'Claude first ask'
    })
    expect(byNativeId.get('codex-1')).toMatchObject({
      provider: 'codex',
      projectRoot,
      title: 'Codex first ask'
    })
    expect(result.skipped).toBe(0)
    expect(result.incomplete).toBe(false)
  })

  it('keeps only sessions whose provider-recorded cwd canonicalizes to the scanned project', async () => {
    const foreignPath = await pathOf('foreign')
    await mkdir(foreignPath, { recursive: true })
    const foreignRoot = await realpath(foreignPath)
    await writeJsonl(join(roots.pi, 'foreign.jsonl'), piSessionLines('pi-foreign', foreignRoot))
    await writeJsonl(join(roots.pi, 'no-cwd.jsonl'), piSessionLines('pi-no-cwd', ''))

    const projectAlias = join(tempDir, 'project-alias')
    await symlink(projectRoot, projectAlias)
    await writeJsonl(
      join(roots['oh-my-pi'], 'alias.jsonl'),
      piSessionLines('omp-alias', projectAlias)
    )

    await writeJsonl(join(roots.codex, 'foreign.jsonl'), [
      {
        type: 'session_meta',
        payload: { id: 'codex-foreign', cwd: foreignRoot, timestamp: '2026-01-02T03:04:05.000Z' }
      }
    ])
    await writeJsonl(join(roots.claude, '22222222-2222-3333-4444-555555555555.jsonl'), [
      { type: 'user', sessionId: '22222222-2222-3333-4444-555555555555' }
    ])

    const result = await scan()

    // The symlinked spelling resolves to the same canonical root; the foreign cwd does not.
    expect(result.candidates.map((item) => item.nativeSessionId)).toEqual(['omp-alias'])
    expect(result.candidates[0]?.projectRoot).toBe(projectRoot)
    expect(result.skipped).toBe(4)
  })

  it('never adopts a session reached through a symlinked file or a symlinked archive root', async () => {
    const escaped = await pathOf('outside', 'escaped.jsonl')
    await writeJsonl(escaped, piSessionLines('pi-escaped', projectRoot))
    await symlink(escaped, join(roots.pi, 'escaped.jsonl'))

    const archiveAlias = join(tempDir, 'pi-alias')
    await symlink(roots.pi, archiveAlias)

    const direct = await scan()
    const aliasedArchive = await scanWith({ pi: archiveAlias })

    expect(direct.candidates).toEqual([])
    expect(aliasedArchive.candidates).toEqual([])
  })

  it('rejects malformed, wrong-version, invalid-id, and oversized jsonl files without failing the scan', async () => {
    await writeFile(join(roots.pi, 'broken.jsonl'), 'not json at all\n')
    await writeJsonl(
      join(roots.pi, 'wrong-version.jsonl'),
      piSessionLines('pi-v2', projectRoot, { version: 2 })
    )
    await writeJsonl(join(roots.pi, 'invalid-id.jsonl'), piSessionLines('bad/id', projectRoot))

    const oversized = join(roots.pi, 'oversized.jsonl')
    await writeFile(oversized, '')
    await truncate(oversized, MAX_FILE_BYTES + 1)

    await writeJsonl(join(roots.pi, 'valid.jsonl'), piSessionLines('pi-valid', projectRoot))

    const result = await scan()

    expect(result.candidates.map((item) => item.nativeSessionId)).toEqual(['pi-valid'])
    expect(result.skipped).toBe(4)
  })

  it('folds duplicate provider/root/native-id tuples into one candidate', async () => {
    await writeJsonl(join(roots.pi, 'group-a', 'dup.jsonl'), piSessionLines('pi-dup', projectRoot))
    await writeJsonl(join(roots.pi, 'group-b', 'dup.jsonl'), piSessionLines('pi-dup', projectRoot))

    const result = await scan()

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.nativeSessionId).toBe('pi-dup')
    expect(result.skipped).toBe(1)
  })

  it('bounds the adopted title to the first sanitized line and 120 code points', async () => {
    await writeJsonl(
      join(roots.pi, 'title.jsonl'),
      piSessionLines('pi-title', projectRoot, {
        title: '  Project smoke title  \nPROMPT_BODY_CANARY'
      })
    )
    await writeJsonl(
      join(roots.pi, 'long-title.jsonl'),
      piSessionLines('pi-long-title', projectRoot, { title: '😀'.repeat(130) })
    )

    const result = await scan()
    const titles = new Map(result.candidates.map((item) => [item.nativeSessionId, item.title]))

    expect(titles.get('pi-title')).toBe('Project smoke title')
    expect(titles.get('pi-long-title')).toBe('😀'.repeat(120))
  })

  it('captures the Pi head from the last identified entry and reports no head for other providers', async () => {
    await writeJsonl(join(roots.pi, 'head.jsonl'), [
      ...piSessionLines('pi-head', projectRoot),
      { type: 'message', id: 'entry-2', message: { role: 'assistant', content: 'done' } },
      { type: 'message', id: 'entry-3', message: { role: 'user', content: 'again' } }
    ])
    await writeJsonl(join(roots['oh-my-pi'], 'head.jsonl'), [
      ...piSessionLines('omp-head', projectRoot),
      { type: 'message', id: 'entry-2', message: { role: 'assistant', content: 'done' } }
    ])

    const result = await scan()
    const heads = new Map(
      result.candidates.map((item) => [item.nativeSessionId, item.expectedHeadId])
    )

    expect(heads.get('pi-head')).toBe('entry-3')
    expect(heads.get('omp-head')).toBeNull()
  })

  it('aborts before touching any archive when the signal is already aborted', async () => {
    await writeJsonl(join(roots.pi, 'pi-1.jsonl'), piSessionLines('pi-1', projectRoot))
    const controller = new AbortController()
    controller.abort()

    await expect(scan({ signal: controller.signal })).rejects.toThrow(
      'LOCAL_AI_CLI_DISCOVERY_CANCELLED'
    )
  })

  it('reports a scan that hits its file budget as incomplete instead of presenting a partial archive', async () => {
    const names = Array.from({ length: 501 }, (_, index) => `bulk-${index}.jsonl`)
    await Promise.all(names.map((name) => writeFile(join(roots.codex, name), '{}\n')))

    const result = await scan()

    expect(result.incomplete).toBe(true)
    expect(result.skipped).toBeGreaterThanOrEqual(500)
    expect(result.candidates).toEqual([])
  })

  it('refuses to scan a project root that is missing or reached through a symlink', async () => {
    const alias = join(tempDir, 'project-symlink')
    await symlink(projectRoot, alias)

    await expect(scanNativeSessionsForProject(join(tempDir, 'missing'), { roots })).rejects.toThrow(
      'WORKSPACE_INVALID'
    )
    await expect(scanNativeSessionsForProject(alias, { roots })).rejects.toThrow(
      'WORKSPACE_INVALID'
    )
  })
})

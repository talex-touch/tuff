import type { FsStep, PayloadSpec, SearchCheck } from '../types'
import { PRESENT_DEADLINE_MS, absentCheck, fileTarget } from './checks'
import { isGuaranteedFormat, type Draft, type GenContext } from './context'
import { copySourcePath } from './corpus'
import { COPY_SOURCE_DIR, STAGE_DIR, joinPath } from './placement'

const PARTIAL_SUFFIXES = ['crdownload', 'part', 'download']
const CHUNK_DELAYS_MS = [60, 120, 250]

function deadlineFor(mode: string, size: string): number {
  if (mode.startsWith('burst')) return PRESENT_DEADLINE_MS.burst
  const slow =
    mode.startsWith('chunked') ||
    mode === 'download-rename' ||
    mode === 'rename-after-create' ||
    mode === 'overwrite'
  return slow || size === 'large' || size === 'xlarge'
    ? PRESENT_DEADLINE_MS.slow
    : PRESENT_DEADLINE_MS.created
}

/** Content for the first write of an overwrite: small, so the final write replaces it with different bytes. */
function firstPayload(ctx: GenContext, format: string, size: string): PayloadSpec {
  if (format === 'zero-byte') return { kind: 'fake-image', bytes: 2048, seed: ctx.payloadSeed() }
  return ctx.imagePayload(format, size === 'tiny' ? 'small' : 'tiny')
}

export function buildCreateImage(ctx: GenContext): Draft | null {
  const dims = ctx.picker.pick('create-image')
  if (!dims) return null
  const format = dims.format as string
  const size = dims.size as string
  const mode = dims.writeMode as string
  const parts = ctx.takeParts(dims)
  const placement = ctx.pool.resolve(dims.placement as string, parts.token)
  const steps: FsStep[] = placement.create.map((path) => ({
    op: 'mkdir',
    path: ctx.claimPath(path)
  }))
  const dir = placement.dir
  const path = ctx.reserve(dir, parts.name)
  const payload = ctx.imagePayload(format, size)
  const guaranteed = isGuaranteedFormat(format)
  const deadline = deadlineFor(mode, size)
  const query = dims.query as string
  const present = (): SearchCheck => ctx.present(parts, query, path, guaranteed, deadline)
  let checks: () => SearchCheck[] = () => [present()]
  let survives = true

  if (mode === 'direct') {
    steps.push({ op: 'write', path, payload })
  } else if (mode.startsWith('chunked-')) {
    steps.push({
      op: 'write',
      path,
      payload,
      chunks: Number(mode.slice(8)),
      chunkDelayMs: CHUNK_DELAYS_MS[parts.serial % CHUNK_DELAYS_MS.length]
    })
  } else if (mode === 'atomic-rename') {
    steps.push({ op: 'write-atomic', path, payload })
  } else if (mode === 'download-rename') {
    const partial = ctx.claimPath(
      `${path}.${PARTIAL_SUFFIXES[parts.serial % PARTIAL_SUFFIXES.length]}`
    )
    steps.push(
      { op: 'write', path: partial, payload, chunks: 4, chunkDelayMs: 120 },
      { op: 'move', from: partial, to: path }
    )
  } else if (mode === 'copy-in') {
    const from =
      format === 'zero-byte' ? `${COPY_SOURCE_DIR}/src-zero-byte.png` : copySourcePath(format, size)
    steps.push({ op: 'copy', from, to: path })
  } else if (mode === 'move-in-stage') {
    const staged = ctx.claimPath(joinPath(STAGE_DIR, parts.name))
    steps.push({ op: 'write', path: staged, payload }, { op: 'move', from: staged, to: path })
  } else if (mode.startsWith('burst-')) {
    const siblings = Array.from({ length: Number(mode.slice(6)) - 1 }, (_, index) => {
      const sibling = ctx.variantOf(parts, index + 1)
      return { parts: sibling, path: ctx.reserve(dir, sibling.name) }
    })
    const writes: FsStep[] = [{ op: 'write', path, payload }]
    for (const sibling of siblings)
      writes.push({ op: 'write', path: sibling.path, payload: ctx.imagePayload(format, size) })
    steps.push({ op: 'parallel', steps: writes })
    const last = siblings[siblings.length - 1]
    if (last)
      checks = () => [
        present(),
        ctx.present(last.parts, 'exact-ext', last.path, guaranteed, deadline)
      ]
  } else if (mode === 'overwrite') {
    steps.push(
      { op: 'write', path, payload: firstPayload(ctx, format, size) },
      { op: 'sleep', ms: 150 },
      { op: 'write', path, payload }
    )
  } else if (mode === 'rename-after-create') {
    const early = ctx.variantOf(parts, 1)
    const earlyPath = ctx.reserve(dir, early.name)
    steps.push(
      { op: 'write', path: earlyPath, payload },
      { op: 'sleep', ms: 120 },
      { op: 'move', from: earlyPath, to: path }
    )
    checks = () => [present(), absentCheck(early.name, fileTarget(earlyPath), 'soft')]
  } else if (mode === 'create-then-delete') {
    steps.push({ op: 'write', path, payload }, { op: 'sleep', ms: 250 }, { op: 'delete', path })
    checks = () => [
      absentCheck(ctx.queryPlan(parts, query, guaranteed).query, fileTarget(path), 'soft')
    ]
    survives = false
  } else if (mode === 'touch-empty') {
    steps.push({ op: 'touch', path })
  } else {
    throw new Error(`unknown write mode: ${mode}`)
  }

  return {
    cls: 'create-image',
    dims,
    steps,
    checks,
    ...(survives ? { created: { path, parts, guaranteed } } : {})
  }
}

export function buildSearchCreated(ctx: GenContext, partner: Draft): Draft | null {
  const created = partner.created
  if (!created) throw new Error('search-created needs a create-image that leaves its file in place')
  const fixed = {
    format: partner.dims.format as string,
    nameStyle: partner.dims.nameStyle as string,
    placement: partner.dims.placement as string,
    size: partner.dims.size as string,
    writeMode: partner.dims.writeMode as string
  }
  const dims = ctx.withParts(created.parts, () => ctx.picker.pick('search-created', fixed))
  if (!dims) return null
  return {
    cls: 'search-created',
    dims,
    steps: [],
    partner,
    checks: () => [
      ctx.present(
        created.parts,
        dims.query as string,
        created.path,
        created.guaranteed,
        PRESENT_DEADLINE_MS.later
      )
    ]
  }
}

import type { FsStep, PayloadSpec, SearchCheck } from '../types'
import { PRESENT_DEADLINE_MS, absentCheck, fileTarget } from './checks'
import { isGuaranteedFormat, swapCase, type Draft, type GenContext } from './context'
import { NEW_DIR_ROOT, joinPath } from './placement'

const MOVE_TARGETS = ['root', 'depth-1', 'depth-2', 'dir-spaces', 'dir-cjk', 'crowded']

function replacement(ctx: GenContext, format: string, size: string): PayloadSpec {
  if (format === 'zero-byte') return { kind: 'fake-image', bytes: 2048, seed: ctx.payloadSeed() }
  return ctx.imagePayload(format, size)
}

export function buildChangeImage(ctx: GenContext): Draft | null {
  const dims = ctx.picker.pick('change-image')
  if (!dims) return null
  const format = dims.format as string
  const size = dims.size as string
  const change = dims.change as string
  const query = dims.query as string
  const parts = ctx.takeParts(dims)
  const placement = ctx.pool.resolve(dims.placement as string, parts.token)
  for (const dir of placement.create) ctx.corpus.addDirectory(dir)
  const dir = placement.dir
  const guaranteed = isGuaranteedFormat(format)
  const deadline = PRESENT_DEADLINE_MS.created
  // The .bak name is excluded from the index, so only the restored name counts for prefix tiering.
  const from =
    change === 'restore-from-temporary-name'
      ? ctx.claimPath(joinPath(dir, `${parts.name}.bak`))
      : ctx.reserve(dir, parts.name)
  ctx.corpus.addFile({ path: from, payload: ctx.imagePayload(format, size) }, true)

  const finish = (steps: FsStep[], checks: () => SearchCheck[]): Draft => ({
    cls: 'change-image',
    dims,
    steps,
    checks
  })
  const staleName = (): SearchCheck => absentCheck(parts.name, fileTarget(from), 'soft')

  switch (change) {
    case 'rename': {
      const next = ctx.takeSiblingParts(parts)
      const to = ctx.reserve(dir, next.name)
      return finish([{ op: 'move', from, to }], () => [
        ctx.present(next, query, to, guaranteed, deadline),
        staleName()
      ])
    }
    case 'rename-case': {
      const next = swapCase(parts)
      const to = joinPath(dir, next.name)
      return finish([{ op: 'move', from, to }], () => [
        ctx.present(next, query, to, guaranteed, deadline, true)
      ])
    }
    case 'move':
    case 'move-new-dir': {
      let toDir: string
      const steps: FsStep[] = []
      if (change === 'move') {
        let target = ctx.pool.resolve(ctx.rng.pick(MOVE_TARGETS), parts.token).dir
        for (let index = 0; target === dir && index < MOVE_TARGETS.length; index += 1) {
          target = ctx.pool.resolve(MOVE_TARGETS[index] as string, parts.token).dir
        }
        toDir = target
      } else {
        toDir = ctx.claimPath(`${NEW_DIR_ROOT}/${parts.token}-moved`)
        steps.push({ op: 'mkdir', path: toDir })
      }
      const to = ctx.reserve(toDir, parts.name)
      steps.push({ op: 'move', from, to })
      return finish(steps, () => [ctx.present(parts, query, to, guaranteed, deadline), staleName()])
    }
    case 'overwrite':
      return finish([{ op: 'write', path: from, payload: replacement(ctx, format, size) }], () => [
        ctx.present(parts, query, from, guaranteed, deadline)
      ])
    case 'replace-atomic':
      return finish(
        [{ op: 'write-atomic', path: from, payload: replacement(ctx, format, size) }],
        () => [ctx.present(parts, query, from, guaranteed, deadline)]
      )
    case 'delete':
      return finish([{ op: 'delete', path: from }], () => [
        absentCheck(ctx.queryPlan(parts, query, guaranteed).query, fileTarget(from), 'soft')
      ])
    case 'delete-recreate':
      return finish(
        [
          { op: 'delete', path: from },
          { op: 'write', path: from, payload: replacement(ctx, format, size) }
        ],
        () => [ctx.present(parts, query, from, guaranteed, deadline)]
      )
    case 'touch':
      return finish([{ op: 'touch', path: from }], () => [
        ctx.present(parts, query, from, guaranteed, deadline)
      ])
    case 'rename-to-hidden-name':
    case 'rename-to-temporary-name': {
      const to = ctx.claimPath(
        joinPath(dir, change === 'rename-to-hidden-name' ? `.${parts.name}` : `${parts.name}.bak`)
      )
      return finish([{ op: 'move', from, to }], () => [
        absentCheck(ctx.queryPlan(parts, query, guaranteed).query, fileTarget(to), 'hard'),
        staleName()
      ])
    }
    case 'restore-from-temporary-name': {
      const to = ctx.reserve(dir, parts.name)
      return finish([{ op: 'move', from, to }], () => [
        ctx.present(parts, query, to, guaranteed, deadline)
      ])
    }
    default:
      throw new Error(`unknown change: ${change}`)
  }
}

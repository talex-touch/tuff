import type { FsStep } from '../types'
import { PRESENT_DEADLINE_MS, absentCheck, fileTarget } from './checks'
import { isGuaranteedFormat, type Draft, type GenContext } from './context'
import { IGNORE_CONTAINER, buildIgnore } from './policy'

const ABSENT_START_AFTER_MS = 3_000

function claimStep(ctx: GenContext, step: FsStep): void {
  if (step.op === 'mkdir' || step.op === 'write' || step.op === 'symlink') ctx.claimPath(step.path)
}

/** A visible control file sits beside the excluded one, so the `absent` check cannot pass just because the query finds nothing. */
export function buildIgnoreImage(ctx: GenContext): Draft | null {
  const dims = ctx.picker.pick('ignore-image')
  if (!dims) return null
  const rule = dims.rule as string
  const format = dims.format as string
  const size = dims.size as string
  const query = dims.query as string
  const parts = ctx.takeParts(dims)
  const guaranteed = isGuaranteedFormat(format)
  const build = buildIgnore(rule, {
    token: parts.token,
    name: parts.name,
    serial: parts.serial,
    write: (path) => ({ op: 'write', path, payload: ctx.imagePayload(format, size) }),
    writeMarker: (path, name) => {
      ctx.prefixes.add(name)
      return {
        op: 'write',
        path,
        payload: {
          kind: 'text',
          bytes: 200,
          seed: ctx.payloadSeed(),
          ext: name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'txt'
        }
      }
    }
  })
  for (const step of build.steps) claimStep(ctx, step)
  if (!build.hard) ctx.prefixes.add(parts.name)

  const control = ctx.variantOf(parts, 1)
  const controlPath = ctx.reserve(`${IGNORE_CONTAINER}/${parts.token}`, control.name)
  const steps: FsStep[] = [
    ...build.steps,
    { op: 'write', path: controlPath, payload: ctx.imagePayload(format, size) }
  ]
  return {
    cls: 'ignore-image',
    dims,
    steps,
    checks: () => [
      ctx.present(control, query, controlPath, guaranteed, PRESENT_DEADLINE_MS.created),
      absentCheck(
        ctx.queryPlan(parts, query, guaranteed).query,
        fileTarget(build.absentPath),
        build.hard ? 'hard' : 'soft',
        ABSENT_START_AFTER_MS
      )
    ]
  }
}

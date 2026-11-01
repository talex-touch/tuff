import crypto from 'node:crypto'
import type { FileHandle } from 'node:fs/promises'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { FsStep, PayloadSpec } from '../types'
import type { Clock } from './clock'
import { describeError, RunAbort, throwIfAborted } from './errors'

export const MAX_PAYLOAD_BYTES = 256 * 1024 * 1024
const WRITE_SLICE_BYTES = 4 * 1024 * 1024
const MAX_SLEEP_MS = 10 * 60_000

/** A path tried to leave the corpus root (lexically or through a symlink). */
export class ContainmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContainmentError'
  }
}

/** The step that failed is on the error, so the scenario result can name it. */
export class FsStepError extends Error {
  constructor(
    readonly step: FsStep,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'FsStepError'
  }
}

export function describeStep(step: FsStep): string {
  switch (step.op) {
    case 'mkdir':
    case 'write':
    case 'write-atomic':
    case 'delete':
    case 'touch':
      return `${step.op} ${step.path}`
    case 'copy':
    case 'move':
      return `${step.op} ${step.from} -> ${step.to}`
    case 'symlink':
      return `symlink ${step.path} -> ${step.target}`
    case 'sleep':
      return `sleep ${step.ms}ms`
    case 'parallel':
      return `parallel[${step.steps.length}]`
  }
}

export interface FsExecOptions {
  /** Corpus root; created by the caller. */
  root: string
  materialize: (spec: PayloadSpec) => Buffer
  clock: Clock
}

export interface FsExecutor {
  /** Absolute, real root every path is held to. */
  readonly root: string
  run(steps: readonly FsStep[], signal?: AbortSignal): Promise<void>
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}

const NAME_MAX_BYTES = 255

/**
 * Where an atomic write stages its bytes before the rename: next to the target, as editors do. A
 * name already at the 255-byte limit has no room for the suffix, so it stages under a short hidden
 * name in the same directory (the rename stays on one volume either way).
 */
export function atomicTempPath(target: string): string {
  const suffix = `.${crypto.randomBytes(4).toString('hex')}.tmp`
  const name = path.basename(target)
  if (Buffer.byteLength(name, 'utf8') + Buffer.byteLength(suffix, 'utf8') <= NAME_MAX_BYTES)
    return `${target}${suffix}`
  return path.join(path.dirname(target), suffix)
}

/** Lexical check only: no absolute paths, NUL bytes, `..` segments or empty paths. */
export function normalizeRelative(rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0) throw new ContainmentError('empty path')
  if (rel.includes('\0'))
    throw new ContainmentError(`path contains a NUL byte: ${JSON.stringify(rel)}`)
  if (rel.startsWith('/')) throw new ContainmentError(`absolute path not allowed: ${rel}`)
  const segments = rel.split('/')
  if (segments.includes('..')) throw new ContainmentError(`path escapes the corpus root: ${rel}`)
  const normalized = path.posix.normalize(rel).replace(/\/+$/, '')
  return normalized === '' ? '.' : normalized
}

export async function createFsExecutor(options: FsExecOptions): Promise<FsExecutor> {
  const root = await fsp.realpath(options.root)
  const { clock, materialize } = options

  // The deepest ancestor that exists must resolve inside the root; a dangling link on the way is refused.
  async function realAncestor(start: string): Promise<string> {
    let current = start
    for (;;) {
      try {
        return await fsp.realpath(current)
      } catch (error) {
        const code = errnoCode(error)
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
        const exists = await fsp.lstat(current).then(
          () => true,
          () => false
        )
        if (exists) throw new ContainmentError(`dangling symlink in path: ${current}`)
        const parent = path.dirname(current)
        if (parent === current) throw error
        current = parent
      }
    }
  }

  async function resolve(rel: string, followFinal: boolean): Promise<string> {
    const normalized = normalizeRelative(rel)
    const abs = normalized === '.' ? root : path.join(root, normalized)
    const parentReal = await realAncestor(path.dirname(abs))
    if (!inside(root, parentReal))
      throw new ContainmentError(`${rel} resolves outside the corpus root`)
    if (followFinal) {
      const stat = await fsp.lstat(abs).catch(() => null)
      if (stat?.isSymbolicLink()) {
        const real = await fsp.realpath(abs).catch(() => null)
        if (real === null) throw new ContainmentError(`${rel} is a dangling symlink`)
        if (!inside(root, real))
          throw new ContainmentError(`${rel} is a symlink to ${real}, outside the corpus root`)
      }
    }
    return abs
  }

  function payloadBytes(spec: PayloadSpec): Buffer {
    if (!(spec.bytes >= 0) || spec.bytes > MAX_PAYLOAD_BYTES) {
      throw new RangeError(`payload of ${spec.bytes} bytes is outside 0..${MAX_PAYLOAD_BYTES}`)
    }
    const bytes = materialize(spec)
    if (bytes.length > MAX_PAYLOAD_BYTES)
      throw new RangeError(`payload generator returned ${bytes.length} bytes`)
    return bytes
  }

  async function writeAll(
    file: FileHandle,
    bytes: Buffer,
    pieces: number,
    delayMs: number,
    signal?: AbortSignal
  ) {
    const total = bytes.length
    const chunkCount = Math.max(1, Math.min(pieces, Math.max(1, total)))
    const base = Math.floor(total / chunkCount)
    let offset = 0
    for (let chunk = 0; chunk < chunkCount; chunk += 1) {
      const end = chunk === chunkCount - 1 ? total : offset + base
      while (offset < end) {
        const length = Math.min(WRITE_SLICE_BYTES, end - offset)
        const { bytesWritten } = await file.write(bytes, offset, length)
        offset += bytesWritten
      }
      if (chunk < chunkCount - 1 && delayMs > 0) {
        await clock.sleep(delayMs, signal)
        throwIfAborted(signal)
      }
    }
  }

  async function exec(step: FsStep, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    switch (step.op) {
      case 'mkdir': {
        const abs = await resolve(step.path, false)
        await fsp.mkdir(abs, { recursive: true })
        // Parents created by the recursive call must have landed inside the root too.
        if (!inside(root, await fsp.realpath(abs)))
          throw new ContainmentError(`${step.path} created outside the corpus root`)
        return
      }
      case 'write': {
        const abs = await resolve(step.path, true)
        const bytes = payloadBytes(step.payload)
        const file = await fsp.open(abs, 'w')
        try {
          await writeAll(file, bytes, step.chunks ?? 1, step.chunkDelayMs ?? 0, signal)
        } finally {
          await file.close()
        }
        return
      }
      case 'write-atomic': {
        const abs = await resolve(step.path, false)
        const bytes = payloadBytes(step.payload)
        const temp = atomicTempPath(abs)
        try {
          const file = await fsp.open(temp, 'wx')
          try {
            await writeAll(file, bytes, 1, 0)
          } finally {
            await file.close()
          }
          await fsp.rename(temp, abs)
        } catch (error) {
          await fsp.rm(temp, { force: true }).catch(() => undefined)
          throw error
        }
        return
      }
      case 'copy': {
        const from = await resolve(step.from, false)
        const to = await resolve(step.to, true)
        await fsp.cp(from, to, { recursive: true, dereference: false })
        return
      }
      case 'move': {
        const from = await resolve(step.from, false)
        const to = await resolve(step.to, false)
        await fsp.rename(from, to)
        return
      }
      case 'delete': {
        const abs = await resolve(step.path, false)
        if (abs === root) throw new ContainmentError('refusing to delete the corpus root')
        await fsp.rm(abs, { recursive: step.recursive === true, force: false })
        return
      }
      case 'symlink': {
        const abs = await resolve(step.path, false)
        // `target` is corpus-relative; the link itself is relative so the corpus can be moved.
        const target = path.join(root, normalizeRelative(step.target))
        const parentReal = await fsp.realpath(path.dirname(abs))
        await fsp.symlink(path.relative(parentReal, target) || '.', abs)
        return
      }
      case 'touch': {
        const abs = await resolve(step.path, true)
        const now = new Date()
        try {
          await fsp.utimes(abs, now, now)
        } catch (error) {
          if (errnoCode(error) !== 'ENOENT') throw error
          const file = await fsp.open(abs, 'a')
          await file.close()
        }
        return
      }
      case 'sleep': {
        if (!(step.ms >= 0) || step.ms > MAX_SLEEP_MS)
          throw new RangeError(`sleep of ${step.ms} ms is outside 0..${MAX_SLEEP_MS}`)
        await clock.sleep(step.ms, signal)
        throwIfAborted(signal)
        return
      }
      case 'parallel': {
        const settled = await Promise.allSettled(step.steps.map((child) => run(child, signal)))
        const failed = settled.find(
          (entry): entry is PromiseRejectedResult => entry.status === 'rejected'
        )
        if (failed) throw failed.reason
        return
      }
    }
  }

  async function run(step: FsStep, signal?: AbortSignal): Promise<void> {
    try {
      await exec(step, signal)
    } catch (error) {
      if (error instanceof FsStepError || error instanceof RunAbort) throw error
      throw new FsStepError(step, `${describeStep(step)}: ${describeError(error)}`, {
        cause: error
      })
    }
  }

  return {
    root,
    async run(steps, signal) {
      for (const step of steps) await run(step, signal)
    }
  }
}

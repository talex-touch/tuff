import type {
  FsStep,
  GenerateOptions,
  PayloadKind,
  PayloadSpec,
  ScenarioClass,
  SearchCheck
} from '../types'
import { FILE_TYPE_EXTENSIONS, FORMAT_EXTENSIONS, PIXEL_SIZES, SIZE_BYTES } from './dimensions'
import { buildName, scriptOf, type NameParts } from './names'
import { CorpusBuilder } from './corpus'
import { PlacementPool, joinPath } from './placement'
import { Picker, type Dims } from './picker'
import { createRng, hashSeed, type Rng } from './prng'
import { fileTarget, presentCheck } from './checks'
import { planQuery, queryApplies, type QueryEnv, type QueryPlan } from './queries'
import { PathClaims, PrefixIndex, TokenAllocator, fileSubject } from './registry'

export interface CreatedFile {
  path: string
  parts: NameParts
  /** Bytes a decoder accepts and a non-empty file: only then are discovery checks promised. */
  guaranteed: boolean
}

/** One scenario before ids and run order are assigned. */
export interface Draft {
  cls: ScenarioClass
  dims: Dims
  steps: FsStep[]
  /** Evaluated after every draft exists, so prefix tiers see all names the plan will ever hold. */
  checks: () => SearchCheck[]
  /** A create-image leaves this file in place, so a search-created scenario can look for it. */
  created?: CreatedFile
  partner?: Draft
}

/** Room for the longest suffix a scenario adds to a name (.crdownload, .backup, ...), so long names stay under 255 bytes. */
export const NAME_RESERVE = 12

export function isGuaranteedFormat(format: string): boolean {
  return format !== 'fake-image' && format !== 'zero-byte'
}

const casedLetters = (value: string): boolean => value.toLowerCase() !== value.toUpperCase()

export function swapCase(parts: NameParts): NameParts {
  const stem =
    parts.stem === parts.stem.toLowerCase() ? parts.stem.toUpperCase() : parts.stem.toLowerCase()
  return { ...parts, stem, name: `${stem}.${parts.ext}` }
}

export class GenContext {
  readonly seed: number
  readonly rng: Rng
  readonly tokens: TokenAllocator
  readonly claims = new PathClaims()
  readonly prefixes = new PrefixIndex()
  readonly pool: PlacementPool
  readonly corpus: CorpusBuilder
  readonly picker: Picker
  private readonly payloadBase: number
  private payloads = 0
  private forced: NameParts | undefined

  constructor(readonly options: GenerateOptions) {
    this.seed = options.seed
    this.rng = createRng(hashSeed(this.seed, 'context'))
    this.tokens = new TokenAllocator(this.seed)
    this.pool = new PlacementPool(this.seed)
    this.corpus = new CorpusBuilder(this.claims, this.prefixes)
    this.payloadBase = hashSeed(this.seed, 'payload')
    this.picker = new Picker(createRng(hashSeed(this.seed, 'picker')), {
      allows: (cls, chosen, dim, value) => this.allows(cls, chosen, dim, value)
    })
    for (const dir of this.pool.directories()) this.corpus.addDirectory(dir)
    this.corpus.addCopySources(this.payloadBase)
    this.corpus.addClutter(this.payloadBase + 100_000)
  }

  payloadSeed(): number {
    this.payloads += 1
    return (this.payloadBase + this.payloads) >>> 0
  }

  imagePayload(format: string, size: string): PayloadSpec {
    const kind: PayloadKind = format === 'zero-byte' ? 'fake-image' : (format as PayloadKind)
    const pixels = format === 'zero-byte' ? undefined : PIXEL_SIZES[size]
    return {
      kind,
      bytes: format === 'zero-byte' ? 0 : (SIZE_BYTES[size] as number),
      seed: this.payloadSeed(),
      ...pixels
    }
  }

  queryEnv(guaranteed: boolean): QueryEnv {
    return { guaranteed, prefixHits: (prefix) => this.prefixes.count(prefix) }
  }

  /** The extension for the next name of this family; rotates so jpg/jpeg and every family member appear. */
  extensionOf(chosen: Dims, serial: number): string {
    const list = chosen.fileType
      ? FILE_TYPE_EXTENSIONS[chosen.fileType]
      : FORMAT_EXTENSIONS[chosen.format as string]
    return (list as readonly string[])[
      Math.floor(serial / 3) % (list as readonly string[]).length
    ] as string
  }

  /** The name the next scenario of this style would get; nothing is consumed. */
  peekParts(chosen: Dims): NameParts {
    const style = chosen.nameStyle as string
    const serial = this.tokens.peek(scriptOf(style))
    return this.nameAt(chosen, style, serial)
  }

  /** Consumes the token `peekParts` showed. */
  takeParts(chosen: Dims): NameParts {
    const style = chosen.nameStyle as string
    return this.nameAt(chosen, style, this.tokens.take(scriptOf(style)))
  }

  /** Another name in the same style with a fresh token and the same extension. */
  takeSiblingParts(parts: NameParts): NameParts {
    const serial = this.tokens.take(scriptOf(parts.style))
    return buildName({ style: parts.style, serial, seed: this.seed, ext: parts.baseExt })
  }

  variantOf(parts: NameParts, variant: number): NameParts {
    return buildName({
      style: parts.style,
      serial: parts.serial,
      seed: this.seed,
      ext: parts.baseExt,
      variant
    })
  }

  private nameAt(chosen: Dims, style: string, serial: number): NameParts {
    const edited =
      chosen.rule !== undefined ||
      chosen.change !== undefined ||
      chosen.writeMode === 'download-rename'
    return buildName({
      style,
      serial,
      seed: this.seed,
      ext: this.extensionOf(chosen, serial),
      reserve: edited ? NAME_RESERVE : 0
    })
  }

  /** Reserves a path the plan will write to and makes its name visible to prefix tiering. */
  reserve(dir: string, name: string): string {
    const path = this.claimPath(joinPath(dir, name))
    this.prefixes.add(name)
    return path
  }

  /** Reserves a path whose name is never indexed (directories, staging copies, partial downloads, excluded names). */
  claimPath(path: string): string {
    if (!this.claims.claim(path)) throw new Error(`path collision: ${path}`)
    return path
  }

  /** Runs `pick` with the name already decided (search-created looks for an existing file). */
  withParts<T>(parts: NameParts, pick: () => T): T {
    this.forced = parts
    try {
      return pick()
    } finally {
      this.forced = undefined
    }
  }

  queryPlan(parts: NameParts, id: string, guaranteed: boolean): QueryPlan {
    const plan = planQuery(id, fileSubject(parts), this.queryEnv(guaranteed))
    if (!plan) throw new Error(`query ${id} does not apply to ${parts.name}`)
    return plan
  }

  present(
    parts: NameParts,
    id: string,
    path: string,
    guaranteed: boolean,
    deadlineMs: number,
    soften = false
  ): SearchCheck {
    const plan = this.queryPlan(parts, id, guaranteed)
    return presentCheck(
      soften ? { ...plan, tier: 'soft', topK: Math.max(plan.topK, 20) } : plan,
      fileTarget(path),
      deadlineMs
    )
  }

  private allows(cls: ScenarioClass, chosen: Dims, dim: string, value: string): boolean {
    if (dim !== 'query' && dim !== 'change') return true
    const parts = this.forced ?? this.peekParts(chosen)
    if (dim === 'change') return value !== 'rename-case' || casedLetters(parts.stem)
    const names = [chosen.change === 'rename-case' ? swapCase(parts) : parts]
    if (cls === 'ignore-image') names.push(this.variantOf(parts, 1))
    if (chosen.change === 'rename') {
      const serial = this.tokens.peek(scriptOf(parts.style), 1)
      names.push(buildName({ style: parts.style, serial, seed: this.seed, ext: parts.baseExt }))
    }
    return names.every((name) => queryApplies(value, fileSubject(name)))
  }
}

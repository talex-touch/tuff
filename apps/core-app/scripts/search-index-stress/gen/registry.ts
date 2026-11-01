import type { NameParts } from './names'
import type { QuerySubject } from './queries'
import { tokenFor, type TokenScript } from './tokens'

/** Hands out each token at most once per plan, across scripts. */
export class TokenAllocator {
  private readonly counters = new Map<TokenScript, number>()
  private readonly used = new Set<string>()

  constructor(private readonly seed: number) {}

  /** The serial `take` would return (after `skip` more takes); does not consume anything. */
  peek(script: TokenScript, skip = 0): number {
    let serial = this.counters.get(script) ?? 0
    for (let left = skip; ; left -= 1) {
      while (this.used.has(tokenFor(serial, script, this.seed))) serial += 1
      if (left === 0) return serial
      serial += 1
    }
  }

  take(script: TokenScript): number {
    const serial = this.peek(script)
    this.used.add(tokenFor(serial, script, this.seed))
    this.counters.set(script, serial + 1)
    return serial
  }
}

/** APFS treats names that differ only by case or normalisation form as one name. */
export function foldPath(path: string): string {
  return path.normalize('NFC').toLowerCase().normalize('NFC')
}

export class PathClaims {
  private readonly taken = new Set<string>()

  claim(path: string): boolean {
    const key = foldPath(path)
    if (this.taken.has(key)) return false
    this.taken.add(key)
    return true
  }

  has(path: string): boolean {
    return this.taken.has(foldPath(path))
  }
}

const WORD_SPLIT = /[\s\-_.()[\]]+/

/** Every lowercase name, stem and word of every name the plan will ever put in the corpus. */
export class PrefixIndex {
  private keys: string[] = []
  private sorted = true

  add(name: string): void {
    const lower = name.normalize('NFC').toLowerCase()
    const dot = lower.lastIndexOf('.')
    this.keys.push(lower)
    if (dot > 0) this.keys.push(lower.slice(0, dot))
    for (const word of lower.split(WORD_SPLIT)) if (word.length >= 2) this.keys.push(word)
    this.sorted = false
  }

  count(prefix: string): number {
    if (!this.sorted) {
      this.keys.sort()
      this.sorted = true
    }
    return this.lowerBound(`${prefix}\uffff`) - this.lowerBound(prefix)
  }

  private lowerBound(value: string): number {
    let low = 0
    let high = this.keys.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if ((this.keys[mid] as string) < value) low = mid + 1
      else high = mid
    }
    return low
  }
}

export function fileSubject(parts: NameParts): QuerySubject {
  return {
    kind: 'file',
    name: parts.name,
    stem: parts.stem,
    token: parts.token,
    tokenStart: Math.max(0, parts.tokenStart),
    delimited: parts.delimited,
    style: parts.style,
    pinyin: parts.pinyin
  }
}

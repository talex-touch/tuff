import { describe, expect, it } from 'vitest'
import { swapCase } from './context'
import { ADMITTED_EXTENSIONS, DIMENSIONS, valueIds } from './dimensions'
import { buildName, scriptOf, type NameParts } from './names'
import { directoryNameProblem, fileNameProblem, pathProblem, utf8Length } from './policy'
import {
  HARD_QUERY_IDS,
  MAX_HARD_PREFIX_HITS,
  QUERY_IDS,
  appSubject,
  planQuery,
  queryApplies,
  type QueryEnv
} from './queries'
import { PathClaims, PrefixIndex, TokenAllocator, fileSubject, foldPath } from './registry'
import { SEED } from './test-fixtures'
import { pinyinOfHan, tokenFor, tokenSpace, type TokenScript } from './tokens'

const STYLES = valueIds('nameStyle')
const SCRIPTS: TokenScript[] = ['latin', 'han-s', 'han-t', 'ja', 'ko', 'ar', 'he']
const nameOf = (
  style: string,
  serial: number,
  ext = 'png',
  extra: { variant?: number; reserve?: number } = {}
): NameParts => buildName({ style, serial, seed: SEED, ext, ...extra })

describe('tokens', () => {
  it('are unique per serial in every script and stable for a seed', () => {
    for (const script of SCRIPTS) {
      const seen = new Set<string>()
      for (let serial = 0; serial < 3000; serial += 1) seen.add(tokenFor(serial, script, SEED))
      expect(seen.size, script).toBe(3000)
      expect(tokenFor(17, script, SEED)).toBe(tokenFor(17, script, SEED))
    }
    expect(tokenFor(5, 'latin', 1)).not.toBe(tokenFor(5, 'latin', 2))
  })

  it('latin tokens are three syllable letters plus a digit and spread over leading characters', () => {
    expect(tokenSpace('latin')).toBe(1_000_000)
    const prefixes = new Set<string>()
    for (let serial = 0; serial < 1000; serial += 1) {
      const token = tokenFor(serial, 'latin', SEED)
      expect(token).toMatch(
        /^[bcdfghjklmnprstvwxyz][aeiou][bcdfghjklmnprstvwxyz][aeiou][bcdfghjklmnprstvwxyz][aeiou]\d$/
      )
      prefixes.add(token.slice(0, 3))
    }
    expect(prefixes.size).toBeGreaterThan(400)
  })

  it('refuse a serial outside their space', () => {
    expect(() => tokenFor(-1, 'latin', SEED)).toThrow()
    expect(() => tokenFor(tokenSpace('ar'), 'ar', SEED)).toThrow()
    expect(() => tokenFor(1.5, 'ja', SEED)).toThrow()
  })

  it('pinyin covers the han token alphabet and leaves unknown characters out', () => {
    expect(pinyinOfHan('山水云')).toEqual({ full: 'shanshuiyun', initials: 'ssy' })
    expect(pinyinOfHan('微信')).toEqual({ full: 'weixin', initials: 'wx' })
    expect(pinyinOfHan('行')).toBeNull()
    expect(pinyinOfHan('abc')).toBeNull()
    for (let serial = 0; serial < 200; serial += 1)
      expect(pinyinOfHan(tokenFor(serial, 'han-s', SEED))).not.toBeNull()
  })

  it('TokenAllocator peeks without consuming and never repeats a token', () => {
    const allocator = new TokenAllocator(SEED)
    expect(allocator.peek('latin')).toBe(0)
    expect(allocator.peek('latin')).toBe(0)
    expect(allocator.take('latin')).toBe(0)
    expect(allocator.take('latin')).toBe(1)
    expect(allocator.peek('latin', 2)).toBe(4)
    expect(allocator.take('ja')).toBe(0)
    const seen = new Set<string>()
    for (let index = 0; index < 100; index += 1)
      seen.add(tokenFor(allocator.take('latin'), 'latin', SEED))
    expect(seen.size).toBe(100)
  })
})

describe('names', () => {
  it('every style produces a unique, indexable, path-safe name for every serial', () => {
    for (const style of STYLES) {
      const folded = new Set<string>()
      for (let serial = 0; serial < 300; serial += 1) {
        const parts = nameOf(style, serial, serial % 2 === 0 ? 'png' : 'jpg')
        expect(pathProblem(parts.name), `${style} ${parts.name}`).toBeNull()
        expect(
          fileNameProblem(parts.name, ADMITTED_EXTENSIONS),
          `${style} ${parts.name}`
        ).toBeNull()
        expect(parts.name).toBe(`${parts.stem}.${parts.ext}`)
        expect(parts.ext.toLowerCase()).toBe(serial % 2 === 0 ? 'png' : 'jpg')
        expect(parts.script).toBe(scriptOf(style))
        const written =
          style === 'fullwidth'
            ? parts.token.replace(/[!-~]/g, (char) =>
                String.fromCharCode(char.charCodeAt(0) + 0xfee0)
              )
            : parts.token
        expect(
          parts.stem.slice(parts.tokenStart, parts.tokenStart + written.length).toLowerCase()
        ).toBe(written.toLowerCase())
        folded.add(foldPath(parts.name))
      }
      expect(folded.size, style).toBe(300)
    }
  })

  it('NFC and NFD accent styles differ in bytes and agree after normalisation', () => {
    for (let serial = 0; serial < 20; serial += 1) {
      const composed = nameOf('nfc-accent', serial)
      const decomposed = nameOf('nfd-accent', serial)
      expect(composed.name).toBe(composed.name.normalize('NFC'))
      expect(decomposed.name).toBe(decomposed.name.normalize('NFD'))
      expect(decomposed.name).not.toBe(decomposed.name.normalize('NFC'))
      expect(Buffer.from(composed.name).equals(Buffer.from(decomposed.name))).toBe(false)
      expect(composed.stem.slice(composed.token.length)).toBe(
        decomposed.stem.slice(decomposed.token.length).normalize('NFC')
      )
      expect(utf8Length(decomposed.name)).toBeGreaterThan(utf8Length(composed.name))
    }
    for (const style of STYLES.filter((style) => style !== 'nfd-accent')) {
      expect(nameOf(style, 3).name, style).toBe(nameOf(style, 3).name.normalize('NFC'))
    }
  })

  it('cjk, emoji, spaces and bidirectional styles hold what they promise', () => {
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
    for (const style of [
      'han-simplified',
      'han-traditional',
      'japanese',
      'korean',
      'screenshot-cn',
      'wechat'
    ]) {
      expect(cjk.test(nameOf(style, 4).name), style).toBe(true)
    }
    for (let serial = 0; serial < 16; serial += 1) {
      expect(nameOf('emoji', serial).name).toMatch(/\p{Extended_Pictographic}/u)
      expect(nameOf('spaces', serial).stem.split(' ')).toHaveLength(3)
      expect(nameOf('rtl-arabic', serial).stem).toMatch(/\p{Script=Arabic}/u)
      expect(nameOf('rtl-hebrew', serial).stem).toMatch(/\p{Script=Hebrew}/u)
      expect(nameOf('screenshot-macos-12h', serial).stem).toContain(' ')
    }
    expect(nameOf('screenshot-macos-24h', 0).stem).toMatch(
      /^Screenshot \d{4}-\d{2}-\d{2} at \d{2}\.\d{2}\.\d{2} /
    )
    expect(nameOf('fullwidth', 2).stem).toMatch(/[Ａ-ｚ０-９]/)
  })

  it('255-byte names stay at the limit, and edits that add a prefix or suffix still fit', () => {
    for (let serial = 0; serial < 40; serial += 1) {
      const full = nameOf('long-255', serial, 'jpeg')
      expect(utf8Length(full.name)).toBe(255)
      expect(utf8Length(full.name.normalize('NFD'))).toBeLessThanOrEqual(255)
      const reserved = nameOf('long-255', serial, 'jpeg', { reserve: 12 })
      expect(utf8Length(reserved.name)).toBeLessThanOrEqual(243)
      expect(utf8Length(reserved.name)).toBeGreaterThanOrEqual(240)
      for (const edited of [
        `.${reserved.name}`,
        `~${reserved.name}`,
        `._${reserved.name}`,
        `${reserved.name}.crdownload`,
        `${reserved.name}.backup`,
        `${reserved.name}~`
      ]) {
        expect(utf8Length(edited), edited.slice(-14)).toBeLessThanOrEqual(255)
        expect(pathProblem(`ignored/${edited}`)).toBeNull()
      }
    }
  })

  it('burst variants are distinct names that keep the limit', () => {
    for (const style of STYLES) {
      const names = new Set<string>()
      for (let variant = 0; variant < 16; variant += 1) {
        const parts = nameOf(style, 9, 'webp', { variant })
        expect(pathProblem(parts.name), `${style} v${variant}`).toBeNull()
        names.add(foldPath(parts.name))
      }
      expect(names.size, style).toBe(16)
    }
    const long = nameOf('long-255', 1, 'png', { variant: 15 })
    expect(utf8Length(long.name)).toBeLessThanOrEqual(255)
  })

  it('case-only variants fold to the same name and differ in bytes', () => {
    for (const style of STYLES) {
      const parts = nameOf(style, 6)
      const swapped = swapCase(parts)
      expect(foldPath(swapped.name), style).toBe(foldPath(parts.name))
      if (parts.stem.toLowerCase() !== parts.stem.toUpperCase())
        expect(swapped.name).not.toBe(parts.name)
      expect(pathProblem(swapped.name)).toBeNull()
    }
    expect(nameOf('upper-ext', 1, 'png').ext).toBe('PNG')
    expect(nameOf('iphone-img', 1, 'jpg').ext).toBe('JPG')
    expect(nameOf('mixed-ext', 1, 'png').ext).toBe('PnG')
    expect(nameOf('double-ext', 1, 'png').stem.split('.')).toHaveLength(2)
  })

  it('names that must be indexed are never hidden, temporary or bundle-like', () => {
    for (const style of STYLES) {
      for (let serial = 0; serial < 50; serial += 1) {
        const parts = nameOf(style, serial, 'gif')
        for (const segment of parts.name.split('/'))
          expect(directoryNameProblem(segment)).toBeNull()
      }
    }
  })
})

describe('registry', () => {
  it('foldPath treats case and normalisation forms as one name, as APFS does', () => {
    expect(foldPath('Café.PNG')).toBe(foldPath('café.png'))
    expect(foldPath('a/B')).toBe('a/b')
  })

  it('PathClaims refuses the second claim of a folded path', () => {
    const claims = new PathClaims()
    expect(claims.claim('Dir/File.png')).toBe(true)
    expect(claims.claim('dir/file.PNG')).toBe(false)
    expect(claims.claim('café.png')).toBe(true)
    expect(claims.claim('café.png')).toBe(false)
    expect(claims.has('DIR/FILE.PNG')).toBe(true)
  })

  it('PrefixIndex counts every name, stem and word key that starts with a prefix', () => {
    const index = new PrefixIndex()
    index.add('Harbor Sunset.png')
    index.add('harbor-moon.jpg')
    index.add('Other.gif')
    expect(index.count('harbor')).toBe(6)
    expect(index.count('harbor s')).toBe(2)
    expect(index.count('sun')).toBe(1)
    expect(index.count('zzz')).toBe(0)
    index.add('harborx.png')
    expect(index.count('harbor')).toBe(9)
  })
})

describe('query tiers', () => {
  const env = (guaranteed: boolean, hits = 0): QueryEnv => ({ guaranteed, prefixHits: () => hits })
  const subject = (style: string, serial = 2) => fileSubject(nameOf(style, serial))

  it('the exact name and stem are hard on ordinary styles only when the bytes are guaranteed', () => {
    const parts = nameOf('spaces', 2)
    const exact = planQuery('exact-ext', fileSubject(parts), env(true))
    expect(exact).toEqual({ query: parts.name, tier: 'hard', topK: 5 })
    expect(planQuery('exact-stem', fileSubject(parts), env(true))).toEqual({
      query: parts.stem,
      tier: 'hard',
      topK: 5
    })
    expect(planQuery('exact-ext', fileSubject(parts), env(false))?.tier).toBe('soft')
    for (const style of [
      'emoji',
      'fullwidth',
      'rtl-arabic',
      'rtl-hebrew',
      'nfd-accent',
      'long-255'
    ]) {
      expect(planQuery('exact-ext', subject(style), env(true))?.tier, style).toBe('soft')
    }
  })

  it('a token prefix is hard only inside the token, from 3 characters, with few competing names', () => {
    const parts = nameOf('spaces', 2)
    const prefix = planQuery('prefix-3', fileSubject(parts), env(true, 2))
    expect(prefix?.tier).toBe('hard')
    expect(parts.token.startsWith(prefix?.query ?? '?')).toBe(true)
    expect(prefix?.topK).toBe(10)
    expect(planQuery('prefix-3', fileSubject(parts), env(true, MAX_HARD_PREFIX_HITS))?.topK).toBe(
      MAX_HARD_PREFIX_HITS + 5
    )
    expect(
      planQuery('prefix-3', fileSubject(parts), env(true, MAX_HARD_PREFIX_HITS + 1))?.tier
    ).toBe('soft')
    expect(planQuery('middle-substring', fileSubject(nameOf('long-255', 1)), env(true))?.tier).toBe(
      'soft'
    )
    expect(planQuery('unique-token', fileSubject(parts), env(true))?.query).toBe(parts.token)
    expect(planQuery('prefix-8', fileSubject(parts), env(true))?.tier).not.toBe('hard')
  })

  it('apps are hard only for the exact display name', () => {
    expect(planQuery('exact-stem', appSubject('Safari'), env(true))).toEqual({
      query: 'Safari',
      tier: 'hard',
      topK: 5
    })
    for (const id of QUERY_IDS.filter((id) => id !== 'exact-stem')) {
      const plan = planQuery(id, appSubject('Visual Studio Code'), env(true))
      if (plan) expect(plan.tier, id).toBe('soft')
    }
    expect(planQuery('exact-ext', appSubject('Safari'), env(true))).toBeNull()
    expect(planQuery('acronym', appSubject('Visual Studio Code'), env(true))?.query).toBe('VSC')
  })

  it('hard tiers are rare and always explained, for every style and every transform', () => {
    expect([...HARD_QUERY_IDS].sort()).toEqual([
      'exact-ext',
      'exact-stem',
      'prefix-3',
      'prefix-4',
      'prefix-5',
      'prefix-6',
      'prefix-7',
      'prefix-8',
      'unique-token'
    ])
    let hard = 0
    for (const style of STYLES) {
      for (let serial = 0; serial < 6; serial += 1) {
        const parts = nameOf(style, serial)
        for (const id of QUERY_IDS) {
          const plan = planQuery(id, fileSubject(parts), env(true))
          expect(queryApplies(id, fileSubject(parts)), `${style} ${id}`).toBe(plan !== null)
          if (!plan) continue
          expect(plan.query.trim()).not.toBe('')
          expect(plan.topK).toBeGreaterThanOrEqual(5)
          if (plan.tier === 'hard') {
            hard += 1
            expect(HARD_QUERY_IDS.has(id), `${style} ${id}`).toBe(true)
            expect(planQuery(id, fileSubject(parts), env(false))?.tier).toBe('soft')
          } else expect(plan.topK).toBeGreaterThanOrEqual(20)
        }
      }
    }
    expect(hard).toBeGreaterThan(100)
  })

  it('declares every transform in the dimension table', () => {
    expect(valueIds('query').sort()).toEqual([...QUERY_IDS].sort())
    expect(DIMENSIONS.query.length).toBe(QUERY_IDS.length)
  })
})

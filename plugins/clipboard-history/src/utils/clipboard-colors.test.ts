import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  describeContrast,
  parseColor,
  pickReadableForeground,
  quantizePalette,
  toColorFormats,
  toOklchString,
} from './clipboard-colors'

const WHITE = { r: 255, g: 255, b: 255, a: 1 }
const BLACK = { r: 0, g: 0, b: 0, a: 1 }

describe('color parsing', () => {
  it.each([
    ['#ABCDEE', { r: 171, g: 205, b: 238, a: 1 }],
    ['#abcdee', { r: 171, g: 205, b: 238, a: 1 }],
    ['abcdee', { r: 171, g: 205, b: 238, a: 1 }],
    ['#ABC', { r: 170, g: 187, b: 204, a: 1 }],
    ['rgb(171, 205, 238)', { r: 171, g: 205, b: 238, a: 1 }],
    ['rgba(171,205,238,0.5)', { r: 171, g: 205, b: 238, a: 0.5 }],
  ])('parses %s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected)
  })

  it.each(['#GGG', 'rgb(300, 0, 0)', 'rgb(1, 2)', 'not a color', ''])('rejects %s', input => {
    expect(parseColor(input)).toBeNull()
  })

  it('normalises case and notation to one set of formats', () => {
    const fromHex = toColorFormats(parseColor('#abcdee')!)
    const fromRgb = toColorFormats(parseColor('rgb(171, 205, 238)')!)

    expect(fromHex).toEqual(fromRgb)
    expect(fromHex.hex).toBe('#ABCDEE')
    expect(fromHex.rgb).toBe('rgb(171, 205, 238)')
    expect(fromHex.hsl).toBe('hsl(210, 66%, 80%)')
  })
})

describe('oklch conversion', () => {
  /** 定点校验，防止把矩阵系数抄错。 */
  it('places pure white and black at the ends of the lightness axis', () => {
    expect(toOklchString(WHITE)).toBe('oklch(1.00 0.000 0)')
    expect(toOklchString(BLACK)).toBe('oklch(0.00 0.000 0)')
  })

  it('produces a chromatic hue for a saturated colour', () => {
    const [, lightness, chroma] = toOklchString({ r: 255, g: 0, b: 0, a: 1 }).match(
      /oklch\(([\d.]+) ([\d.]+) (\d+)\)/,
    )!

    expect(Number(lightness)).toBeGreaterThan(0.5)
    expect(Number(chroma)).toBeGreaterThan(0.2)
  })
})

describe('contrast', () => {
  it('matches the WCAG anchors', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  /** #ABCDEE 实测：黑字 12.6987、白字 1.6537，与设计稿的手算值一致。 */
  it('reports both foregrounds for a light blue', () => {
    const verdict = describeContrast(parseColor('#ABCDEE')!)

    expect(verdict.black.ratio).toBeCloseTo(12.7, 1)
    expect(verdict.black.level).toBe('AAA')
    expect(verdict.white.ratio).toBeCloseTo(1.65, 1)
    expect(verdict.white.level).toBe('不达标')
  })

  it('picks the readable foreground', () => {
    expect(pickReadableForeground(parseColor('#ABCDEE')!)).toBe('#111111')
    expect(pickReadableForeground(parseColor('#123456')!)).toBe('#FFFFFF')
  })
})

describe('palette quantisation', () => {
  function pixels(entries: Array<[number, number, number, number, number]>): Uint8ClampedArray {
    const data: number[] = []
    for (const [r, g, b, a, count] of entries) {
      for (let index = 0; index < count; index += 1) {
        data.push(r, g, b, a)
      }
    }
    return new Uint8ClampedArray(data)
  }

  it('orders colours by frequency and caps the result', () => {
    const palette = quantizePalette(
      pixels([
        [10, 10, 10, 255, 5],
        [200, 30, 30, 255, 20],
        [30, 200, 30, 255, 12],
      ]),
      2,
    )

    expect(palette).toEqual(['#C81E1E', '#1EC81E'])
  })

  it('skips near-transparent pixels so thumbnail padding never becomes a theme colour', () => {
    const palette = quantizePalette(
      pixels([
        [255, 255, 255, 0, 100],
        [12, 34, 56, 255, 3],
      ]),
    )

    expect(palette).toEqual(['#0C2238'])
  })

  it('returns nothing for an empty buffer', () => {
    expect(quantizePalette(new Uint8ClampedArray([]))).toEqual([])
  })
})

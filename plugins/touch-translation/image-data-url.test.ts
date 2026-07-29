import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  parseImageDataUrl,
  toImageDataUrl,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'

const runtimeSource = readFileSync(resolve(dirname(__filename), 'index.js'), 'utf8')

const encodedPng = 'iVBORw0KGgoAAAANSUhEUg=='

describe('image data URL helpers', () => {
  it('preserves encoded image bytes through the public API build/parse round trip', () => {
    const dataUrl = toImageDataUrl(encodedPng, 'image/jpeg')

    expect(dataUrl).toBe(`data:image/jpeg;base64,${encodedPng}`)
    expect(parseImageDataUrl(dataUrl)).toEqual({
      mime: 'image/jpeg',
      base64: encodedPng,
    })
  })

  it('canonicalizes image MIME variants and removes presentation whitespace from encoded data', () => {
    expect(parseImageDataUrl(' data:IMAGE/SVG+XML;base64,aGVs\n bG8= ')).toEqual({
      mime: 'image/svg+xml',
      base64: 'aGVsbG8=',
    })
  })

  it.each([
    'data:text/plain;base64,aGVsbG8=',
    'data:image/png;base64,',
    'data:image/png;charset=utf-8;base64,aGVsbG8=',
    'not a data URL',
  ])('rejects malformed and non-image data URL %j', (dataUrl) => {
    expect(parseImageDataUrl(dataUrl)).toBeNull()
  })

  it('replaces an invalid output MIME with the safe image MIME', () => {
    expect(toImageDataUrl(encodedPng, 'application/octet-stream')).toBe(`data:image/png;base64,${encodedPng}`)
  })

  it('keeps image helpers outside the Prelude and routes screenshots through typed OCR', () => {
    expect(runtimeSource).not.toMatch(/\b__test\b/)
    expect(runtimeSource).not.toMatch(/\b(?:parseImageDataUrl|toImageDataUrl)\b/)
    expect(runtimeSource).toContain('plugin.translation.ocr(')
    expect(runtimeSource).toContain('source: { type: \'data-url\', dataUrl: image }')
    expect(runtimeSource).toContain('module.exports = lifecycle')
  })
})

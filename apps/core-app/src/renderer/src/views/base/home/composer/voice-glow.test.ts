import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { gradientStopColors, voiceGlowLobes } from './voice-glow'

/** The token as the page declares it, so the lobes are checked against the colours actually shipped. */
function liveStopsToken(): string {
  const page = readFileSync(path.join(__dirname, '..', 'HomePage.vue'), 'utf8')
  const declaration = page.match(/^\s*--home-live-stops:\s*([^;]+);/m)
  if (!declaration) throw new Error('HomePage.vue no longer declares --home-live-stops')
  return declaration[1]!.trim()
}

describe('gradientStopColors', () => {
  it('takes each stop’s colour and drops its positions', () => {
    expect(gradientStopColors('#0894ff, #c959dd 27%, #ff2e54 52% 60%, #0894ff')).toEqual([
      '#0894ff',
      '#c959dd',
      '#ff2e54',
      '#0894ff'
    ])
  })

  it('keeps a colour function whole, commas and all', () => {
    expect(gradientStopColors('rgb(8, 148, 255) 10%, hsl(290 66% 61%), red 90deg')).toEqual([
      'rgb(8, 148, 255)',
      'hsl(290 66% 61%)',
      'red'
    ])
  })
})

describe('voiceGlowLobes', () => {
  it('reads the seven lobes off the composer’s live rim: violet centre, then the pairs outward', () => {
    const stops = gradientStopColors(liveStopsToken())
    const [blue, violet, red, orange] = stops
    expect(voiceGlowLobes(liveStopsToken())).toEqual([
      violet,
      blue,
      red,
      orange,
      stops[4],
      red,
      violet
    ])
  })

  it('gives no lobes for a list too short to fill them, so the beam keeps its own palette', () => {
    expect(voiceGlowLobes('#0894ff, #c959dd 50%, #ff2e54')).toEqual([])
    expect(voiceGlowLobes('')).toEqual([])
  })
})

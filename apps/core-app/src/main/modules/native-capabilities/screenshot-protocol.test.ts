import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseScreenshotAxisScale,
  parseScreenshotGlobalDipRect,
  parseScreenshotPixelSize,
  parseScreenshotRotation
} from './screenshot-protocol'

interface RawTopologyFixture {
  version: number
  topologies: Array<{
    name: string
    displays: Array<{
      globalFrame: unknown
      modePixelSize: unknown
      rotation: unknown
      expectedOrientedPixelSize: unknown
      expectedScale: unknown
    }>
  }>
}

const fixtureUrl = new URL(
  '../../../../../../packages/tuff-native/fixtures/screenshot-v1/topologies.json',
  import.meta.url
)

function readFixture(): RawTopologyFixture {
  return JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8')) as RawTopologyFixture
}

describe('screenshot topology fixture contract', () => {
  it('normalizes the shared mixed-scale and rotation fixture', () => {
    const fixture = readFixture()
    const rotations = fixture.topologies.flatMap((topology) =>
      topology.displays.map((display) => {
        parseScreenshotGlobalDipRect(display.globalFrame)
        parseScreenshotPixelSize(display.modePixelSize)
        parseScreenshotPixelSize(display.expectedOrientedPixelSize)
        parseScreenshotAxisScale(display.expectedScale)
        return parseScreenshotRotation(display.rotation)
      })
    )

    expect(fixture.version).toBe(1)
    expect(fixture.topologies.map((topology) => topology.name)).toEqual([
      'negative-left-mixed-scale',
      'rotated-above-and-below',
      'non-equal-displays-with-hole'
    ])
    expect(rotations).toEqual(expect.arrayContaining([0, 90, 270]))
  })

  it('rejects invalid coordinate values at the main-process boundary', () => {
    const fixture = readFixture()
    const globalFrame = fixture.topologies[0].displays[0].globalFrame as Record<string, unknown>
    globalFrame.width = 0

    expect(() => parseScreenshotGlobalDipRect(globalFrame)).toThrow('Invalid screenshot geometry')
    expect(() =>
      parseScreenshotGlobalDipRect({ x: Number.NaN, y: 0, width: 1, height: 1 })
    ).toThrow('Invalid screenshot geometry')
    expect(() => parseScreenshotRotation(45)).toThrow('Invalid screenshot geometry')
  })
})

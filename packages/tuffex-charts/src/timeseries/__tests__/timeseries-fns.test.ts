import { describe, expect, it } from 'vitest'
import { BRUSH_MIN_DRAG_PX, brushRange, brushRect } from '../src/brush'
import { splitIncompleteSegments } from '../src/incomplete'
import { clusterTimeseriesMarkers, getApproximateMarkerClusterInterval } from '../src/markers'
import { findNearest, getAllTooltipRowsAtTimestamp, limitTooltipRows } from '../src/tooltip-data'

describe('clusterTimeseriesMarkers', () => {
  it('returns empty for missing or empty input', () => {
    expect(clusterTimeseriesMarkers(undefined, 10)).toEqual([])
    expect(clusterTimeseriesMarkers([], 10)).toEqual([])
  })

  it('chains markers whose gap to the previous member is within the interval', () => {
    const clusters = clusterTimeseriesMarkers(
      [
        { timestamp: 0, label: 'a' },
        { timestamp: 9, label: 'b' },
        { timestamp: 18, label: 'c' }, // 9 from previous member → joins the chain
        { timestamp: 40, label: 'd' },
      ],
      10,
    )
    expect(clusters).toHaveLength(2)
    expect(clusters[0]!.markers.map(m => m.label)).toEqual(['a', 'b', 'c'])
    expect(clusters[0]!.label).toBe('3 changes')
    expect(clusters[1]!.label).toBe('d')
  })

  it('sorts unsorted markers and honours a custom cluster label', () => {
    const clusters = clusterTimeseriesMarkers(
      [
        { timestamp: 50, label: 'later' },
        { timestamp: 0, label: 'first' },
        { timestamp: 4, label: 'second' },
      ],
      5,
      count => `${count} 项变更`,
    )
    expect(clusters).toHaveLength(2)
    expect(clusters[0]!.timestamp).toBe(0)
    expect(clusters[0]!.label).toBe('2 项变更')
  })

  it('approximates the cluster interval as span / tickCount', () => {
    expect(getApproximateMarkerClusterInterval([0, 100], 5)).toBe(20)
    expect(getApproximateMarkerClusterInterval([42], 5)).toBe(0)
    expect(getApproximateMarkerClusterInterval([], 5)).toBe(0)
  })
})

describe('findNearest', () => {
  const data: Array<[number, number]> = [[0, 10], [10, 20], [20, 30]]

  it('returns the value at the closest timestamp', () => {
    expect(findNearest(data, 0)).toBe(10)
    expect(findNearest(data, 9)).toBe(20)
    expect(findNearest(data, 4)).toBe(10)
    expect(findNearest(data, 999)).toBe(30)
    expect(findNearest([], 5)).toBeNull()
  })
})

describe('getAllTooltipRowsAtTimestamp', () => {
  const series = [
    { name: 'a', data: [[0, 1]] as Array<[number, number]>, color: '#a' },
    { name: 'b', data: [[0, 5]] as Array<[number, number]> },
    { name: 'a', data: [[0, 99]] as Array<[number, number]> }, // duplicate name skipped
  ]
  const color = (s: { color?: string }, i: number): string => s.color ?? `slot-${i}`

  it('dedupes names, skips hidden series and sorts by value desc', () => {
    const rows = getAllTooltipRowsAtTimestamp(series, 0, [], color)
    expect(rows.map(r => r.name)).toEqual(['b', 'a'])
    expect(rows[0]!.color).toBe('slot-1')

    const withoutB = getAllTooltipRowsAtTimestamp(series, 0, ['b'], color)
    expect(withoutB.map(r => r.name)).toEqual(['a'])
  })

  it('caps rows and reports the hidden count', () => {
    const rows = [1, 2, 3, 4].map(v => ({ name: `s${v}`, value: v, color: '#x' }))
    expect(limitTooltipRows(rows, 3)).toEqual({ rows: rows.slice(0, 3), hiddenCount: 1 })
    expect(limitTooltipRows(rows, 9).hiddenCount).toBe(0)
  })
})

describe('splitIncompleteSegments', () => {
  const data: Array<[number, number]> = [[0, 1], [10, 2], [20, 3], [30, 4]]

  it('keeps everything solid when no bounds are set', () => {
    expect(splitIncompleteSegments(data, undefined, undefined))
      .toEqual({ complete: data, before: [], after: [] })
  })

  it('splits a dashed head that overlaps the solid segment by one point', () => {
    const result = splitIncompleteSegments(data, 10, undefined)
    expect(result.before).toEqual([[0, 1], [10, 2]])
    expect(result.complete).toEqual([[10, 2], [20, 3], [30, 4]])
  })

  it('splits a dashed tail the same way', () => {
    const result = splitIncompleteSegments(data, undefined, 20)
    expect(result.after).toEqual([[20, 3], [30, 4]])
    expect(result.complete).toEqual([[0, 1], [10, 2], [20, 3]])
  })

  it('handles both bounds at once', () => {
    const result = splitIncompleteSegments(data, 0, 30)
    expect(result.before).toEqual([[0, 1]])
    expect(result.after).toEqual([[30, 4]])
    expect(result.complete).toEqual([[0, 1], [10, 2], [20, 3], [30, 4]])
  })
})

describe('brush math', () => {
  it('clamps the selection rect into the plot', () => {
    expect(brushRect(50, 150, 100, 200)).toEqual({ x: 100, width: 50 })
    expect(brushRect(250, 150, 100, 200)).toEqual({ x: 150, width: 100 })
  })

  it('treats tiny drags as clicks and orders the range', () => {
    const invert = (px: number): number => px * 10
    expect(brushRange(100, 100 + BRUSH_MIN_DRAG_PX - 1, invert)).toBeNull()
    expect(brushRange(120, 100, invert)).toEqual([1000, 1200])
  })
})

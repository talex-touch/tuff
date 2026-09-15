// Ported from Cloudflare kumo (MIT) — packages/kumo/src/components/chart/timeseries-markers.ts.

import type { TimeseriesMarker, TimeseriesMarkerCluster } from './types'

/**
 * Groups markers whose gap to the previous cluster member is at most
 * `interval`, so dense marker runs render as one line instead of a comb.
 * A multi-marker cluster gets `clusterLabel(count)` as its label.
 */
export function clusterTimeseriesMarkers(
  markers: TimeseriesMarker[] | undefined,
  interval: number,
  clusterLabel: (count: number) => string = count => `${count} changes`,
): TimeseriesMarkerCluster[] {
  if (!markers?.length)
    return []

  const sorted = [...markers].sort((a, b) => a.timestamp - b.timestamp)
  const groups: TimeseriesMarker[][] = []

  for (const marker of sorted) {
    const previous = groups.at(-1)
    const lastInPrevious = previous?.at(-1)
    if (previous && lastInPrevious && marker.timestamp - lastInPrevious.timestamp <= interval)
      previous.push(marker)
    else
      groups.push([marker])
  }

  return groups.map((group) => {
    const first = group[0] as TimeseriesMarker
    return {
      timestamp: first.timestamp,
      label: group.length === 1 ? first.label : clusterLabel(group.length),
      color: first.color,
      lineStyle: first.lineStyle,
      markers: group,
    }
  })
}

/**
 * Approximate axis interval below which neighbouring markers cluster:
 * the visible time span divided by the tick count.
 */
export function getApproximateMarkerClusterInterval(
  timestamps: number[],
  tickCount: number,
): number {
  if (timestamps.length < 2)
    return 0
  return (Math.max(...timestamps) - Math.min(...timestamps)) / tickCount
}

import type { GeoProjection } from 'd3-geo'

export interface MapGeoJson {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id?: string | number
    properties?: Record<string, unknown> | null
    geometry: unknown
  }>
}

/** Accessor for a value on a data row: a key of `T`, or a function of the row. */
export type MapAccessor<T, V> = keyof T | ((row: T) => V)

/** Per-datum style value: a constant, or a function of the row. */
export type MapStyle<T, V> = V | ((row: T) => V)

export interface MapBaseProps {
  /** GeoJSON `FeatureCollection` for the land base. */
  geoJson: MapGeoJson
  /** Map center as `[longitude, latitude]`. Defaults to auto-fit. */
  center?: [number, number]
  /** Zoom level — multiplies the auto-fit scale. @default 1.25 */
  zoom?: number
  /** Enable drag-to-pan and scroll-to-zoom. @default false */
  roam?: boolean
  /**
   * Geographic projection: a d3-geo projection (kumo wraps these in a
   * project/unproject pair for echarts; here the d3 instance is used
   * directly). Defaults to a latitude-clamped Mercator; `null` plots raw
   * lng/lat (equirectangular). The instance is fitted in place — pass a
   * stable reference.
   */
  projection?: GeoProjection | null
  /** Show the hover tooltip. @default true */
  showTooltip?: boolean
  /** Format values in the default tooltip. @default value => value.toLocaleString() */
  valueFormat?: (value: number) => string
  /**
   * Container aspect ratio (`width / height`). Defaults to the projected
   * aspect of the displayed window so land fills the frame edge-to-edge.
   */
  aspectRatio?: number | string
  /** Fixed height in pixels. Overrides `aspectRatio` when set. */
  height?: number
  /** Explicit width in pixels (SSR/tests). Defaults to the measured container. */
  width?: number
}

export interface BubbleMapProps<T> extends MapBaseProps {
  /** Raw data rows. Coordinates/value/name are read via the accessors below. */
  data: T[]
  /** Longitude accessor. */
  lng: MapAccessor<T, number>
  /** Latitude accessor. */
  lat: MapAccessor<T, number>
  /** Value accessor — drives bubble size (area-proportional). */
  value: MapAccessor<T, number>
  /** Optional name accessor — used by the default tooltip. */
  name?: MapAccessor<T, string>
  /** Smallest bubble radius in px. @default 6 */
  minRadius?: number
  /** Largest bubble radius in px. @default 26 */
  maxRadius?: number
  /** Explicit bubble radius `(value) => px`, overriding min/max scaling. */
  bubbleSize?: (value: number) => number
  /** Bubble fill — constant or `(row) => color`. Defaults to the chart blue. */
  bubbleColor?: MapStyle<T, string>
  /** Bubble border color — constant or `(row) => color`. @default 'transparent' */
  bubbleBorderColor?: MapStyle<T, string>
  /** Bubble border width — constant or `(row) => px`. @default 0 */
  bubbleBorderWidth?: MapStyle<T, number>
}

export interface ChoroplethMapProps<T> extends MapBaseProps {
  /** Raw data rows. Region key and value are read via the accessors below. */
  data: T[]
  /** Region-key accessor, joined to features by `nameProperty`. */
  name: MapAccessor<T, string>
  /** Value accessor — drives the region's fill color. */
  value: MapAccessor<T, number>
  /**
   * GeoJSON feature property to join on. Real-world data often matches more
   * reliably on an ISO-code property (e.g. `'iso_a2'`). @default 'name'
   */
  nameProperty?: string
  /**
   * Sequential ramp (low → high) as CSS colors. Defaults to the theme's
   * `--tx-chart-map-scale-*` ramp (auto light/dark).
   */
  colorRange?: string[]
  /** Lower bound of the continuous scale. Default: data minimum. */
  min?: number
  /** Upper bound of the continuous scale. Default: data maximum. */
  max?: number
  /** Fill for regions with no matching data row. Defaults to the land fill. */
  noDataColor?: string
  /** Show the gradient color legend. @default false */
  showLegend?: boolean
}

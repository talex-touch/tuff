export type AxisPosition = 'bottom' | 'left'

export interface AxisProps {
  /** Which side of the plot the axis renders on. */
  position: AxisPosition
  /** Suggested tick count for continuous scales; bands always tick every band. */
  ticks?: number
  /** Tick label formatter. Defaults to the scale's own smart formatting. */
  format?: (value: number | Date | string) => string
  /** Axis name, centered along the axis. */
  name?: string
  /** Distance between the plot edge and the axis name. */
  nameGap?: number
  /** Draw the axis domain line. Off by default, matching the kumo look. */
  line?: boolean
}

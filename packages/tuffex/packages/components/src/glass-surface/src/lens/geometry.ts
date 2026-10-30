/** The outline a lens is cut to: a rounded rectangle whose outer `bezel` px refract. All lengths are CSS px. */
export interface LensShape {
  width: number
  height: number
  radius: number
  bezel: number
}

/** Where a point sits against the outline: how far inside it, and which way the nearest edge faces. */
export interface EdgeProbe {
  inside: number
  /** Unit normal pointing out of the shape. */
  nx: number
  ny: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** The corner radius and the bezel cannot outgrow half the short side; CSS clamps `border-radius` the same way. */
export function normalizeLensShape(width: number, height: number, radius: number, bezel: number): LensShape {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const half = Math.min(w, h) / 2
  return { width: w, height: h, radius: clamp(radius, 0, half), bezel: clamp(bezel, 0, half) }
}

/**
 * Signed-distance probe of a rounded rectangle, written into `out` so a per-pixel loop allocates nothing.
 * `x` and `y` are measured from the top left corner. `inside` is negative outside the outline.
 */
export function probeRoundedRect(x: number, y: number, shape: LensShape, out: EdgeProbe): EdgeProbe {
  const px = x - shape.width / 2
  const py = y - shape.height / 2
  const qx = Math.abs(px) - (shape.width / 2 - shape.radius)
  const qy = Math.abs(py) - (shape.height / 2 - shape.radius)
  const sx = px < 0 ? -1 : 1
  const sy = py < 0 ? -1 : 1

  if (qx > 0 && qy > 0) {
    const length = Math.hypot(qx, qy)
    out.inside = shape.radius - length
    out.nx = sx * qx / length
    out.ny = sy * qy / length
  }
  else if (qx > qy) {
    out.inside = shape.radius - qx
    out.nx = sx
    out.ny = 0
  }
  else {
    out.inside = shape.radius - qy
    out.nx = 0
    out.ny = sy
  }
  return out
}

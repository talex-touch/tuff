// Profile model: bud side = sampled half-width profile with a raised-cosine dip (the neck).
const f2 = (n) => Math.round(n * 100) / 100
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t) }
const bump = (t) => (Math.abs(t) >= 1 ? 0 : (1 + Math.cos(Math.PI * t)) / 2)

// Catmull-Rom through points -> cubic segments (uniform), returns C commands (first point assumed current)
function smoothThrough(points) {
  const cmds = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    cmds.push(['C', c1, c2, p2])
  }
  return cmds
}

// One bud on the top edge. Returns { attachedCmds, dropCmds|null } in local (u, v) coords.
export function bud({ c, l, e, m, p, d, pinch, drift = 0, samples = 22 }) {
  // Column from v=0 to T; the neck dip sits in the stretched part.
  const T = e + d
  m = Math.min(m, Math.max(0, e - p), l / 2)
  // Waist sits where the drop's bottom will be once it separates: just below the drop body.
  const vw = p + d * 0.62
  const sigDown = Math.max(4, vw - p)           // cone reaches zero (with zero slope) exactly at the fillet end
  const sigUp = Math.max(4, Math.min(e * 0.45, 18)) // short convex shoulder up into the drop
  const delta = pinch * (l / 2)                 // dip depth (0..l/2)
  const hw = (v) => l / 2 - delta * bump(v < vw ? (v - vw) / sigDown : (v - vw) / sigUp)
  const cx = (v) => c + drift * sstep(vw - sigDown, vw + sigUp, v)
  const vTopSide = T - m
  const left = [], right = []
  const v0 = p, v1 = vTopSide
  for (let i = 0; i <= samples; i++) {
    const v = v0 + ((v1 - v0) * i) / samples
    left.push([cx(v) - hw(v), v])
    right.push([cx(v) + hw(v), v])
  }
  const cmds = []
  // base fillet into left side
  cmds.push(['L', [c - l / 2 - p, 0]])
  cmds.push(['Q', [c - l / 2, 0], left[0]])
  cmds.push(...smoothThrough(left))
  const xl = cx(T) - l / 2, xr = cx(T) + l / 2
  cmds.push(['Q', [xl, T], [xl + m, T]])
  cmds.push(['L', [xr - m, T]])
  cmds.push(['Q', [xr, T], right[right.length - 1]])
  cmds.push(...smoothThrough([...right].reverse()))
  cmds.push(['Q', [c + l / 2, 0], [c + l / 2 + p, 0]])
  return cmds
}

export function bodyWithTopBud(W, H, R, b) {
  const toXY = ([u, v]) => `${f2(u)} ${f2(-v)}`
  let d = `M ${R} 0 `
  if (b) for (const [cmd, ...pts] of bud(b)) d += `${cmd} ${pts.map(toXY).join(' ')} `
  d += `L ${W - R} 0 A ${R} ${R} 0 0 1 ${W} ${R} L ${W} ${H - R} A ${R} ${R} 0 0 1 ${W - R} ${H} L ${R} ${H} A ${R} ${R} 0 0 1 0 ${H - R} L 0 ${R} A ${R} ${R} 0 0 1 ${R} 0 Z`
  return d
}

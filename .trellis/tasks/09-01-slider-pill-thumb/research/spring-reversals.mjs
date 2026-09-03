const DT = 1 / 240
function run(stiffness, damping, mass = 1) {
  let x = 0, v = 0, t = 0, settledAt = -1, max = 0, prevSign = 0
  let revAll = 0, revVisible = 0, revOutsideBand = 0, trough = 1
  const hist = []
  while (t < 10) {
    const a = (-stiffness * (x - 1) - damping * v) / mass
    v += a * DT; x += v * DT; t += DT
    hist.push([t, x, v])
    if (x > max) max = x
    const sign = v > 0 ? 1 : v < 0 ? -1 : 0
    if (sign && prevSign && sign !== prevSign) {
      revAll++
      if (Math.abs(x - 1) >= 0.001) revOutsideBand++
    }
    if (sign) prevSign = sign
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.02) { if (settledAt < 0) settledAt = t; if (t - settledAt >= 0.064) break } else settledAt = -1
  }
  // trough after the first peak
  const peakIdx = hist.findIndex(h => h[1] === max)
  for (let i = peakIdx; i < hist.length; i++) if (hist[i][1] < trough) trough = hist[i][1]
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  return { k: stiffness, c: damping, zeta: +zeta.toFixed(3), settleMs: Math.round((settledAt > 0 ? settledAt : t) * 1000), overshootPct: +((max - 1) * 100).toFixed(2), undershootPct: +((1 - trough) * 100).toFixed(3), revAll, revOutsideBand }
}
const rows = []
for (const [k, c] of [[480,34],[600,30],[700,30],[520,34],[540,34],[560,34],[560,35],[580,34],[580,35],[600,34],[600,36],[640,36],[640,37]]) rows.push(run(k, c))
console.table(rows)

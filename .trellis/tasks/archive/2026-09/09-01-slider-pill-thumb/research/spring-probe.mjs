globalThis.CSS = { supports: () => true }
const { resolveTransition } = await import('/Users/talexdreamsoul/Workspace/Projects/talex-touch/packages/tuffex/packages/components/src/liquid/src/spring.ts')

const DT = 1 / 240
function metrics(stiffness, damping, mass = 1) {
  let x = 0, v = 0, t = 0, settledAt = -1, max = 0, reversals = 0, prevSign = 0
  while (t < 10) {
    const a = (-stiffness * (x - 1) - damping * v) / mass
    v += a * DT
    x += v * DT
    t += DT
    if (x > max) max = x
    const sign = v > 0 ? 1 : v < 0 ? -1 : 0
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) reversals++
    if (sign !== 0) prevSign = sign
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.02) {
      if (settledAt < 0) settledAt = t
      if (t - settledAt >= 0.064) break
    } else settledAt = -1
  }
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  return { stiffness, damping, zeta: +zeta.toFixed(3), settleMs: Math.round((settledAt > 0 ? settledAt : t) * 1000), overshootPct: +((max - 1) * 100).toFixed(2), reversals }
}

const rows = []
for (const [k, c] of [[480,34],[520,34],[540,34],[560,34],[580,34],[600,34],[560,32],[560,36],[600,30],[640,36],[700,38]]) rows.push(metrics(k, c))
console.table(rows)

for (const [k, c] of [[560,34],[540,34],[580,34]]) {
  const r = resolveTransition({ stiffness: k, damping: c })
  const values = r.easing.slice('linear('.length, -1).split(', ').map(Number)
  // reversals in the sampled linear() list itself
  let rev = 0, prev = 0
  for (let i = 1; i < values.length; i++) { const d = values[i] - values[i-1]; const s = d > 0 ? 1 : d < 0 ? -1 : 0; if (s && prev && s !== prev) rev++; if (s) prev = s }
  console.log(`\n== ${k}/${c} == duration ${r.duration}ms, samples ${values.length}, max ${Math.max(...values)}, sampled reversals ${rev}`)
  console.log(r.easing)
}

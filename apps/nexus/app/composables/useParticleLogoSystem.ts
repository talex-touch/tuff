import { createNoise3D } from 'simplex-noise'
import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'

export interface ParticleLogoOptions {
  logoScale?: number
  logoOffsetY?: number
  colors?: {
    outline?: string
    ring?: [string, string]
    core?: [string, string]
    ambient?: [number, number]
  }
}

const TAU = Math.PI * 2

// SoA layout: 14 floats per particle
// [x, y, prevX, prevY, targetX, targetY, vx, vy, life, ttl, size, alpha, hue, phase]
const PPC = 14
const X = 0; const Y = 1; const PX = 2; const PY = 3; const TX = 4; const TY = 5
const VX = 6; const VY = 7; const LIFE = 8; const TTL = 9; const SIZE = 10
const ALPHA = 11; const HUE = 12; const PHASE = 13

// Layer counts — fewer logo, more ambient for a nebula feel
const OUTLINE_N = 30
const RING_N = 40
const CORE_N = 60
const STREAM_N = 80 // flowing laser streams along logo path
const AMBIENT_N = 140
const LOGO_N = OUTLINE_N + RING_N + CORE_N
const TOTAL_N = LOGO_N + STREAM_N + AMBIENT_N

// SVG data from TxTuffLogoStroke (viewBox 0 0 100 100)
const OUTLINE_RECT = { x: 15, y: 15, w: 70, h: 70, rx: 30 }
const RING_CIRCLE = { cx: 50, cy: 50, r: 32 }
const CORE_PATH = 'M30,70 C35,65 45,65 50,70 Q55,75 60,70 L70,60 C75,55 75,45 70,40 L60,30 Q55,25 50,30 Q45,35 40,30 L30,40 C25,45 25,55 30,60 Z'

function sampleRoundedRect(rect: typeof OUTLINE_RECT, count: number): [number, number][] {
  const { x, y, w, h, rx: r } = rect
  const pts: [number, number][] = []
  const straight = (w - 2 * r) * 2 + (h - 2 * r) * 2
  const curved = TAU * r
  const total = straight + curved
  for (let i = 0; i < count; i++) {
    let t = (i / count) * total
    const topLen = w - 2 * r
    if (t < topLen) { pts.push([x + r + t, y]); continue }
    t -= topLen
    const arcLen = (Math.PI / 2) * r
    if (t < arcLen) { const a = t / r; pts.push([x + w - r + Math.sin(a) * r, y + r - Math.cos(a) * r]); continue }
    t -= arcLen
    const rightLen = h - 2 * r
    if (t < rightLen) { pts.push([x + w, y + r + t]); continue }
    t -= rightLen
    if (t < arcLen) { const a = t / r; pts.push([x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]); continue }
    t -= arcLen
    if (t < topLen) { pts.push([x + w - r - t, y + h]); continue }
    t -= topLen
    if (t < arcLen) { const a = t / r; pts.push([x + r - Math.sin(a) * r, y + h - r + Math.cos(a) * r]); continue }
    t -= arcLen
    if (t < rightLen) { pts.push([x, y + h - r - t]); continue }
    t -= rightLen
    if (t < arcLen) { const a = t / r; pts.push([x + r - Math.cos(a) * r, y + r - Math.sin(a) * r]); continue }
    pts.push([x + r, y])
  }
  return pts
}

function sampleCircle(cx: number, cy: number, r: number, count: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function sampleSVGPath(d: string, count: number): [number, number][] {
  if (!hasDocument()) return sampleCircle(50, 50, 20, count)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  svg.appendChild(path)
  document.body.appendChild(svg)
  const len = path.getTotalLength()
  const pts: [number, number][] = []
  for (let i = 0; i < count; i++) {
    const pt = path.getPointAtLength((i / count) * len)
    pts.push([pt.x, pt.y])
  }
  document.body.removeChild(svg)
  return pts
}

// Collect ALL logo path points for stream particles to flow along
function sampleAllLogoPaths(count: number): [number, number][] {
  const pts: [number, number][] = []
  // Sample the core path more densely (most visually interesting)
  const corePts = sampleSVGPath(CORE_PATH, Math.floor(count * 0.5))
  const ringPts = sampleCircle(RING_CIRCLE.cx, RING_CIRCLE.cy, RING_CIRCLE.r, Math.floor(count * 0.3))
  const outlinePts = sampleRoundedRect(OUTLINE_RECT, Math.floor(count * 0.2))
  pts.push(...corePts, ...ringPts, ...outlinePts)
  return pts
}

export function useParticleLogoSystem(
  canvasRef: Ref<HTMLCanvasElement | null>,
  options: ParticleLogoOptions = {},
) {
  const {
    logoScale = 1.6,
    logoOffsetY = -120,
    colors = {},
  } = options
  const {
    ambient = [220, 260] as [number, number],
  } = colors

  const noise3D = createNoise3D()
  const buf = new Float32Array(TOTAL_N * PPC)

  let ctx: CanvasRenderingContext2D | null = null
  let frameId = 0
  let tick = 0
  let W = 0; let H = 0; let dpr = 1
  let mouseX = -9999; let mouseY = -9999
  const formationStrength = ref(0)
  let targetFormation = 1.0
  let brightness = 1.0
  let isVisible = true
  let observer: IntersectionObserver | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let gsapLoaded = false
  let gsapInstance: any = null

  let logoTargets: [number, number][] = []
  let streamPath: [number, number][] = [] // dense path for flowing streams

  function computeTargets() {
    const svgSize = 100
    const scale = logoScale * Math.min(W, H) / (svgSize * dpr * 2.2)
    const cx = W / (2 * dpr)
    const cy = H / (2 * dpr) + logoOffsetY

    const toCanvas = (pt: [number, number]): [number, number] => [
      cx + (pt[0] - svgSize / 2) * scale,
      cy + (pt[1] - svgSize / 2) * scale,
    ]

    const outPts = sampleRoundedRect(OUTLINE_RECT, OUTLINE_N).map(toCanvas)
    const ringPts = sampleCircle(RING_CIRCLE.cx, RING_CIRCLE.cy, RING_CIRCLE.r, RING_N).map(toCanvas)
    const corePts = sampleSVGPath(CORE_PATH, CORE_N).map(toCanvas)

    logoTargets = [...outPts, ...ringPts, ...corePts]

    // Dense stream path (200 sample points along all logo edges)
    streamPath = sampleAllLogoPaths(200).map(toCanvas)
  }

  function initParticle(i: number, scatter: boolean) {
    const o = i * PPC
    const w = W / dpr; const h = H / dpr
    const isLogo = i < LOGO_N
    const isStream = i >= LOGO_N && i < LOGO_N + STREAM_N

    // Position
    if (scatter) {
      const side = Math.random() * 4 | 0
      const px = side === 0 ? Math.random() * w : side === 1 ? w + 30 : side === 2 ? Math.random() * w : -30
      const py = side === 0 ? -30 : side === 1 ? Math.random() * h : side === 2 ? h + 30 : Math.random() * h
      buf[o + X] = px; buf[o + Y] = py
    } else {
      buf[o + X] = Math.random() * w
      buf[o + Y] = Math.random() * h
    }
    buf[o + PX] = buf[o + X]!
    buf[o + PY] = buf[o + Y]!

    // Target
    if (isLogo && logoTargets[i]) {
      // Add jitter so formation is soft/nebulous, not pixel-perfect
      const jitter = 8 + Math.random() * 12
      buf[o + TX] = logoTargets[i]![0] + (Math.random() - 0.5) * jitter
      buf[o + TY] = logoTargets[i]![1] + (Math.random() - 0.5) * jitter
    } else if (isStream && streamPath.length) {
      // Stream particles pick a random spot on the logo path to start flowing from
      const pathPt = streamPath[Math.floor(Math.random() * streamPath.length)]!
      buf[o + TX] = pathPt[0]
      buf[o + TY] = pathPt[1]
    } else {
      buf[o + TX] = Math.random() * w
      buf[o + TY] = Math.random() * h
    }

    buf[o + VX] = (Math.random() - 0.5) * (isStream ? 3 : 1.5)
    buf[o + VY] = (Math.random() - 0.5) * (isStream ? 3 : 1.5)
    buf[o + LIFE] = 0
    buf[o + TTL] = isLogo ? 99999 : isStream ? 80 + Math.random() * 120 : 200 + Math.random() * 300
    buf[o + SIZE] = isLogo ? 1.8 + Math.random() * 1.5 : isStream ? 0.8 + Math.random() * 1.2 : 0.4 + Math.random() * 1.2
    buf[o + ALPHA] = 0
    // Iridescent hue cycling base
    buf[o + HUE] = isStream
      ? 200 + Math.random() * 120 // blue → magenta range for streams
      : isLogo
        ? 220 + Math.random() * 80 // blue → purple for logo
        : ambient[0] + Math.random() * (ambient[1] - ambient[0])
    buf[o + PHASE] = Math.random() * TAU
  }

  function initAll() {
    computeTargets()
    for (let i = 0; i < TOTAL_N; i++) initParticle(i, true)
  }

  function updateAndDraw() {
    if (!ctx || !isVisible) return
    frameId = requestAnimationFrame(updateAndDraw)
    tick++

    const w = W / dpr; const h = H / dpr
    const formation = formationStrength.value
    formationStrength.value += (targetFormation - formationStrength.value) * 0.035

    // ── Background: semi-transparent dark overlay for trail persistence ──
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgba(2, 2, 2, 0.12)`
    ctx.fillRect(0, 0, w, h)

    // ── Mouse radial glow ──
    if (mouseX > 0 && mouseY > 0) {
      const g = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 180)
      g.addColorStop(0, 'rgba(120, 80, 255, 0.07)')
      g.addColorStop(0.4, 'rgba(79, 107, 255, 0.03)')
      g.addColorStop(1, 'rgba(79, 107, 255, 0)')
      ctx.fillStyle = g
      ctx.fillRect(mouseX - 180, mouseY - 180, 360, 360)
    }

    // ── Iridescent time shift ──
    const hueShift = tick * 0.15

    // ── Update & draw all particles ──
    for (let i = 0; i < TOTAL_N; i++) {
      const o = i * PPC
      const isLogo = i < LOGO_N
      const isStream = !isLogo && i < LOGO_N + STREAM_N

      let px = buf[o + X]!; let py = buf[o + Y]!
      buf[o + PX] = px; buf[o + PY] = py
      let vx = buf[o + VX]!; let vy = buf[o + VY]!
      const life = buf[o + LIFE]!
      const ttl = buf[o + TTL]!
      const size = buf[o + SIZE]!
      const baseHue = buf[o + HUE]!
      const phase = buf[o + PHASE]!

      // Alpha envelope
      let alpha = Math.min(life / 30, 1.0)
      if (!isLogo) {
        const rem = ttl - life
        if (rem < 30) alpha *= rem / 30
      }

      // ── Noise field ──
      const nScale = isStream ? 0.004 : 0.003
      const noiseDampen = isLogo ? (1 - formation * 0.5) : 1.0
      const n = noise3D(px * nScale, py * nScale, tick * 0.006 + phase * 0.1)
      const nAngle = n * TAU
      const nForce = isStream ? 0.6 : 0.25
      vx += Math.cos(nAngle) * nForce * noiseDampen
      vy += Math.sin(nAngle) * nForce * noiseDampen

      // ── Logo soft attraction (nebulous, not precise) ──
      if (isLogo && formation > 0.01) {
        const tx = buf[o + TX]!
        const ty = buf[o + TY]!
        // Orbiting drift
        const orbA = tick * 0.004 + phase
        const orbR = 6 + 4 * Math.sin(tick * 0.002 + phase) // breathing orbit
        const ox = tx + Math.cos(orbA) * orbR * (1 - formation * 0.3)
        const oy = ty + Math.sin(orbA) * orbR * (1 - formation * 0.3)
        vx += (ox - px) * 0.015 * formation
        vy += (oy - py) * 0.015 * formation
      }

      // ── Stream particles flow along logo path ──
      if (isStream && formation > 0.2 && streamPath.length > 1) {
        // Find next path point to flow toward
        const pathIdx = Math.floor((life * 0.5 + phase * 30) % streamPath.length)
        const target = streamPath[pathIdx]!
        const nextIdx = (pathIdx + 1) % streamPath.length
        const next = streamPath[nextIdx]!
        // Flow direction along path
        const fdx = next[0] - target[0]
        const fdy = next[1] - target[1]
        const fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1
        // Attract to path + push along it
        vx += (target[0] - px) * 0.008 * formation
        vy += (target[1] - py) * 0.008 * formation
        vx += (fdx / fLen) * 1.2 * formation
        vy += (fdy / fLen) * 1.2 * formation
      }

      // ── Mouse repulsion ──
      const mdx = px - mouseX; const mdy = py - mouseY
      const mDist = Math.sqrt(mdx * mdx + mdy * mdy)
      if (mDist < 180 && mDist > 0.1) {
        const force = (180 - mDist) / 180 * (isLogo ? 2.5 : 4)
        vx += (mdx / mDist) * force
        vy += (mdy / mDist) * force
      }

      // Damping
      vx *= isStream ? 0.88 : 0.93
      vy *= isStream ? 0.88 : 0.93

      px += vx; py += vy
      buf[o + X] = px; buf[o + Y] = py
      buf[o + VX] = vx; buf[o + VY] = vy
      buf[o + LIFE] = life + 1
      buf[o + ALPHA] = alpha

      // Respawn non-logo particles
      if (!isLogo && (life > ttl || px < -50 || px > w + 50 || py < -50 || py > h + 50)) {
        initParticle(i, true)
        continue
      }
      if (alpha <= 0.005) continue

      // ── Iridescent hue: shifts over time for holographic feel ──
      const hue = (baseHue + hueShift + Math.sin(tick * 0.01 + phase) * 30) % 360

      // ── Draw: flowing line from prev → current pos (laser trail) ──
      const prevX = buf[o + PX]!
      const prevY = buf[o + PY]!
      const speed = Math.sqrt(vx * vx + vy * vy)
      const trailLen = Math.min(speed * 3, 18) // longer trail = faster particle

      if (isStream) {
        // Laser streams: bright, thin, long trails
        const streamAlpha = alpha * 0.7 * brightness
        const sat = 85 + 10 * Math.sin(tick * 0.03 + phase)
        const light = 65 + 15 * Math.sin(tick * 0.02 + phase * 2)
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${streamAlpha})`
        ctx.lineWidth = size * 0.8
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(px, py)
        ctx.stroke()
        // Glow dot at head
        if (speed > 0.5) {
          ctx.fillStyle = `hsla(${hue}, 90%, 80%, ${streamAlpha * 0.6})`
          ctx.beginPath()
          ctx.arc(px, py, size * 0.6, 0, TAU)
          ctx.fill()
        }
      } else if (isLogo) {
        // Logo particles: soft glowing dots with subtle trail
        const breathe = 0.7 + 0.3 * Math.sin(tick * 0.015 + phase)
        const sat = 75 + 20 * Math.sin(tick * 0.008 + phase)
        const light = 55 + 20 * Math.sin(tick * 0.012 + phase * 1.5)
        const a = alpha * breathe * brightness
        // Trail line
        if (trailLen > 1) {
          ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${a * 0.3})`
          ctx.lineWidth = size * 0.6
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(px - vx * 2, py - vy * 2)
          ctx.lineTo(px, py)
          ctx.stroke()
        }
        // Core dot
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${a})`
        ctx.beginPath()
        ctx.arc(px, py, size, 0, TAU)
        ctx.fill()
      } else {
        // Ambient: tiny floating specks
        ctx.fillStyle = `hsla(${hue}, 50%, 60%, ${alpha * 0.35})`
        ctx.beginPath()
        ctx.arc(px, py, size, 0, TAU)
        ctx.fill()
      }
    }

    // ── Chromatic glass connections: iridescent lines between close logo particles ──
    if (formation > 0.25) {
      for (let i = 0; i < LOGO_N; i += 2) { // skip every other for perf
        const o = i * PPC
        const x1 = buf[o + X]!; const y1 = buf[o + Y]!; const a1 = buf[o + ALPHA]!
        if (a1 < 0.15) continue
        for (let j = 1; j <= 4; j++) {
          const ni = (i + j) % LOGO_N
          const no = ni * PPC
          const x2 = buf[no + X]!; const y2 = buf[no + Y]!; const a2 = buf[no + ALPHA]!
          const dx = x2 - x1; const dy = y2 - y1
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 50 && a2 > 0.15) {
            const lineA = (1 - dist / 50) * 0.15 * formation * Math.min(a1, a2)
            // Iridescent connection: hue shifts along the line
            const connHue = (220 + hueShift + dist * 2) % 360
            ctx.strokeStyle = `hsla(${connHue}, 80%, 65%, ${lineA})`
            ctx.lineWidth = 0.4
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
          }
        }
      }
    }

    // ── Glass holographic post-processing ──
    // Layer 1: heavy blur glow (every 2 frames for perf)
    if (tick % 2 === 0) {
      ctx.save()
      ctx.filter = 'blur(8px) brightness(160%)'
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.06
      ctx.drawImage(ctx.canvas, 0, 0)
      ctx.restore()
    }

    // Layer 2: soft glow
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.04
    ctx.drawImage(ctx.canvas, 0, 0)
    ctx.restore()

    // Layer 3: chromatic offset (subtle RGB split for glass feel)
    if (tick % 4 === 0 && (!hasNavigator() || (navigator.hardwareConcurrency ?? 4) >= 4)) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.015
      // Slight offset for chromatic aberration
      ctx.drawImage(ctx.canvas, 1.5, 0)
      ctx.drawImage(ctx.canvas, -1.5, 0)
      ctx.restore()
    }
  }

  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const canvas = canvasRef.value
      if (!canvas) return
      if (!hasWindow()) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth * dpr
      H = canvas.clientHeight * dpr
      canvas.width = W
      canvas.height = H
      ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      computeTargets()
      // Soft-update logo targets (with jitter)
      for (let i = 0; i < LOGO_N; i++) {
        const target = logoTargets[i]
        if (target) {
          const jitter = 8 + Math.random() * 12
          buf[i * PPC + TX] = target[0] + (Math.random() - 0.5) * jitter
          buf[i * PPC + TY] = target[1] + (Math.random() - 0.5) * jitter
        }
      }
    }, 150)
  }

  function setMouse(x: number, y: number) { mouseX = x; mouseY = y }
  function setFormationStrength(v: number) { targetFormation = v }

  async function triggerBurst() {
    const cx = (W / dpr) / 2
    const cy = (H / dpr) / 2 + logoOffsetY

    // Burst logo + stream particles outward
    for (let i = 0; i < LOGO_N + STREAM_N; i++) {
      const o = i * PPC
      const dx = buf[o + X]! - cx; const dy = buf[o + Y]! - cy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      buf[o + VX] = buf[o + VX]! + (dx / dist) * 14
      buf[o + VY] = buf[o + VY]! + (dy / dist) * 14
    }

    brightness = 1.5
    setTimeout(() => { brightness = 1.0 }, 250)

    if (!gsapLoaded) {
      try {
        const mod = await import('gsap')
        gsapInstance = mod.default || mod
        gsapLoaded = true
      } catch { /* noop */ }
    }

    const prev = targetFormation
    targetFormation = 0
    if (gsapInstance) {
      gsapInstance.to({}, { duration: 0.6, onComplete: () => { targetFormation = prev } })
    } else {
      setTimeout(() => { targetFormation = prev }, 600)
    }
  }

  async function startAnimation() {
    if (hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      formationStrength.value = 1.0
      targetFormation = 1.0
      return
    }

    try {
      const mod = await import('gsap')
      gsapInstance = mod.default || mod
      gsapLoaded = true
    } catch { /* noop */ }

    targetFormation = 0
    formationStrength.value = 0

    if (gsapInstance) {
      const proxy = { v: 0 }
      gsapInstance.to(proxy, {
        v: 1,
        duration: 2.5,
        delay: 1.2,
        ease: 'power2.inOut',
        onUpdate: () => {
          targetFormation = proxy.v
          formationStrength.value = proxy.v
        },
        onComplete: () => {
          brightness = 1.3
          setTimeout(() => { brightness = 1.0 }, 500)
        },
      })
    } else {
      setTimeout(() => { targetFormation = 1.0 }, 1500)
    }
  }

  onMounted(() => {
    if (!hasWindow()) return
    const canvas = canvasRef.value
    if (!canvas) return

    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = canvas.clientWidth * dpr
    H = canvas.clientHeight * dpr
    canvas.width = W
    canvas.height = H
    ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    initAll()
    updateAndDraw()

    window.addEventListener('resize', handleResize, { passive: true })

    observer = new IntersectionObserver(
      (entries) => {
        const wasVis = isVisible
        isVisible = entries[0]?.isIntersecting ?? true
        if (isVisible && !wasVis) updateAndDraw()
      },
      { threshold: 0.1 },
    )
    observer.observe(canvas)
    startAnimation()
  })

  onBeforeUnmount(() => {
    if (frameId) cancelAnimationFrame(frameId)
    if (hasWindow()) window.removeEventListener('resize', handleResize)
    if (observer) { observer.disconnect(); observer = null }
    if (resizeTimer) clearTimeout(resizeTimer)
    ctx = null
  })

  return { setMouse, triggerBurst, setFormationStrength, formationStrength }
}

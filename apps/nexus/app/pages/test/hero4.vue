<script setup lang="ts">
import { Mesh, Program, Renderer, Triangle, Vec2 } from 'ogl'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'

definePageMeta({
  layout: 'fullscreen',
})

useSeoMeta({
  title: 'Hero4 · Liquid Discs',
  robots: 'noindex',
})

const route = useRoute()
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')
const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

const vertex = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

// Raymarched field of grooved, cone-warped discs fanned along the x axis —
// an homage to the IOTA staking hero. Solid annulus sheets plus detached
// strand rings, lit with a cyan key light and deep blue fills.
const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;

const float SPACING = 0.8;
const float NCELL = 10.0;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }

mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float gCell = 0.0;
float gRR = 0.0;
float gBand = 0.0;
float tRR = 0.0;
float tBand = 0.0;

// Every per-disc parameter is a smooth function of the disc index i, and the
// fan / cone terms are travelling waves in (i, t) — neighbouring discs stay
// correlated so the whole row undulates as one continuous ribbon.
float discDist(vec3 p, float i) {
  vec3 q = p;
  q.x -= i * SPACING;
  float s1 = sin(i * 0.73 + 1.7);
  float s2 = sin(i * 1.19 + 4.2);
  float s3 = sin(i * 0.47 + 0.8);
  q.y -= 0.22 * s2;

  float ang = 0.32 * sin(i * 0.62 - uTime * 0.50)
            + 0.14 * sin(i * 1.31 + uTime * 0.23);
  q.xz = rot(ang) * q.xz;
  q.xy = rot(0.06 * s1) * q.xy;

  float R = 1.5 * (0.9 + 0.25 * s3);
  float r = length(q.yz);
  float theta = atan(q.z, q.y);
  float wamp = min(r / R, 1.2);
  float wave = (0.045 * sin(theta * 2.0 - uTime * 0.60 + i * 1.1)
              + 0.022 * sin(theta * 5.0 + uTime * 0.50 + i * 0.6)) * wamp;
  float rr = r - R + wave;

  float cone = 0.42 * sin(i * 0.9 - uTime * 0.35 + 2.0);
  float xl = q.x + cone * rr * 0.75 + 0.05 * sin(theta * 3.0 - uTime * 0.45 + i) * wamp;

  // solid annulus band (a thin warped cone sheet)
  float c0 = 0.15 * s2;
  float W = 0.45 + 0.20 * s1;
  vec2 q2 = vec2(abs(rr - c0) - W, abs(xl) - 0.026);
  float dBand = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0) - 0.010;

  // detached strand rings outside the band
  float sBase = c0 + W + 0.06;
  float sk = clamp(floor((rr - sBase) / 0.10 + 0.5), 0.0, 3.0);
  float rs = sBase + sk * 0.10;
  float tube = 0.018 + 0.010 * sin(i * 2.3 + sk * 1.9);
  float dStrand = length(vec2(xl, rr - rs)) - tube;

  float d = smin(dBand, dStrand, 0.05);
  tRR = rr;
  tBand = dStrand < dBand ? 1.0 : 0.0;
  return d;
}

float map(vec3 p) {
  vec3 b = abs(p) - vec3(11.2, 3.2, 3.2);
  float dbox = length(max(b, 0.0));
  if (dbox > 0.7) return dbox;

  // Tilted rims reach ~2.5 cells from a disc centre, so blend a 5-cell
  // neighbourhood; smin melts overlapping discs into one liquid surface.
  float ic = floor(p.x / SPACING + 0.5);
  float d = 1e5;
  for (int o = -2; o <= 2; o++) {
    float i = clamp(ic + float(o), -NCELL, NCELL);
    float di = discDist(p, i);
    if (di < d) {
      gCell = i;
      gRR = tRR;
      gBand = tBand;
    }
    d = smin(d, di, 0.10);
  }
  return d;
}

vec3 calcNormal(vec3 p, float eps) {
  vec2 e = vec2(1.0, -1.0) * 0.5773;
  return normalize(
    e.xyy * map(p + e.xyy * eps) +
    e.yyx * map(p + e.yyx * eps) +
    e.yxy * map(p + e.yxy * eps) +
    e.xxx * map(p + e.xxx * eps));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (2.0 * frag - uResolution) / uResolution.y;

  vec3 ro = vec3(
    sin(uTime * 0.09) * 0.55 + uPointer.x * 0.6,
    0.12 + cos(uTime * 0.07) * 0.18 + uPointer.y * 0.35,
    8.4 + 0.35 * sin(uTime * 0.11));
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 2.35 + uv.x * rt + uv.y * up);

  float td = 0.0;
  float d = 0.0;
  float glow = 0.0;
  bool hit = false;
  for (int s = 0; s < 104; s++) {
    vec3 pos = ro + rd * td;
    d = map(pos);
    float ad = abs(d);
    glow += exp(-ad * 9.0) * 0.016;
    if (ad < 0.0012 * td + 0.0006) { hit = true; break; }
    td += d * 0.75;
    if (td > 22.0) break;
  }

  vec3 col = vec3(0.0);
  float bgGrad = exp(-length(uv * vec2(0.6, 1.0)) * 1.4);
  col += vec3(0.004, 0.008, 0.03) * bgGrad;

  if (hit) {
    vec3 pos = ro + rd * td;
    float cell = gCell;
    float rrHit = gRR;
    float band = gBand;
    vec3 n = calcNormal(pos, max(0.0015, 0.0007 * td));
    vec3 v = -rd;

    // brightness: smooth alternation + a luminous pulse travelling along the row
    float base = 0.5 + 0.5 * sin(cell * 0.83 + 2.0);
    float pulse = pow(0.5 + 0.5 * sin(cell * 0.55 - uTime * 0.85 + 1.0), 5.0);
    float tier = clamp(0.10 + 0.32 * base * base + 0.95 * pulse
      + 0.40 * smoothstep(2.0, 7.0, -cell), 0.0, 1.0);

    vec3 deep = vec3(0.006, 0.018, 0.12);
    vec3 bright = vec3(0.45, 0.80, 1.35);
    vec3 albedo = mix(deep, bright, tier);

    // fine radial grooves, slowly drifting outward; contrast fades with
    // distance so the stripes never shimmer harshly in motion
    float distFade = clamp(1.6 - td * 0.12, 0.25, 1.0);
    float stripe = 0.5 + 0.5 * sin(rrHit * 52.0 - uTime * 0.6 + cell);
    albedo *= mix(1.0 - 0.35 * distFade, 1.0 + 0.35 * distFade, stripe * (1.0 - band * 0.5));

    vec3 L1 = normalize(vec3(-0.55, 0.6, 0.5));
    vec3 L2 = normalize(vec3(0.65, -0.3, 0.35));
    vec3 L3 = normalize(vec3(0.1, 0.9, 0.25));
    float dif1 = max(dot(n, L1), 0.0);
    float dif2 = max(dot(n, L2), 0.0);
    float dif3 = max(dot(n, L3), 0.0);

    col += albedo * (0.06
      + 1.6 * dif1 * vec3(0.50, 0.72, 1.15)
      + 0.35 * dif2 * vec3(0.25, 0.15, 0.85)
      + 0.55 * dif3 * vec3(0.40, 0.60, 1.00));

    // subtle self-glow so bright discs read as luminous
    col += albedo * 0.35 * (0.3 + 0.7 * tier);

    vec3 hv = normalize(L1 + v);
    float ndh = max(dot(n, hv), 0.0);
    float spec = pow(ndh, 64.0) * (0.4 + 0.6 * stripe);
    col += spec * vec3(0.45, 0.75, 1.2) * (0.8 + 2.2 * tier);
    col += pow(ndh, 220.0) * vec3(0.9, 1.0, 1.2) * 0.8;

    float fre = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 freCol = mix(vec3(0.10, 0.30, 1.0), vec3(0.35, 0.65, 1.2), 0.5 + 0.5 * n.y);
    col += fre * freCol * (0.7 + 1.1 * tier + 0.5 * band);

    col *= exp(-0.09 * max(td - 6.5, 0.0));
  }

  vec3 glowCol = mix(vec3(0.12, 0.5, 1.1), vec3(0.05, 0.1, 0.7), smoothstep(-1.4, 1.4, uv.x));
  col += glowCol * glow * 0.85;

  float vig = 1.0 - 0.5 * pow(length(uv * vec2(0.55, 0.8)), 2.2);
  col *= max(vig, 0.0);
  col *= 1.0 - 0.4 * smoothstep(0.55, 1.05, uv.y);
  col *= 1.0 - 0.30 * exp(-(uv.x * uv.x * 1.1 + uv.y * uv.y * 2.0));

  // saturate, then tonemap
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.25);
  col = col / (1.0 + col);
  col = pow(col, vec3(0.85));
  col += (hash1(frag.x * 12.34 + frag.y * 45.67) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`

let renderer: Renderer | null = null
let program: Program | null = null
let mesh: Mesh | null = null
let frame: number | null = null
let start = 0
// When set, render a single frozen frame instead of animating
// (prefers-reduced-motion, or a ?t= query for visual regression shots).
let staticT: number | null = null
let resizeObserver: ResizeObserver | null = null

const pointerTarget = { x: 0, y: 0 }
const pointerCurrent = { x: 0, y: 0 }

function onPointerMove(event: PointerEvent) {
  if (!hasWindow())
    return
  pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1
  pointerTarget.y = -((event.clientY / window.innerHeight) * 2 - 1)
}

function cleanup() {
  if (frame) {
    cancelAnimationFrame(frame)
    frame = null
  }

  if (hasWindow()) {
    window.removeEventListener('resize', resize)
    window.removeEventListener('pointermove', onPointerMove)
  }

  resizeObserver?.disconnect()
  resizeObserver = null

  try {
    const loseContext = renderer?.gl?.getExtension?.('WEBGL_lose_context')
    loseContext?.loseContext?.()
  }
  catch {
    // ignore dispose failures in headless / no-gl environments
  }

  renderer = null
  program = null
  mesh = null
}

function renderFrame(time: number) {
  if (!program || !renderer || !mesh)
    return
  program.uniforms.uTime.value = time
  program.uniforms.uPointer.value.set(pointerCurrent.x, pointerCurrent.y)
  renderer.render({ scene: mesh })
}

function resize() {
  if (!renderer || !program)
    return

  // Measure the container, not the canvas: OGL setSize pins the canvas inline
  // style, and utility CSS may not be applied yet on first mount in dev.
  const w = containerRef.value?.clientWidth || window.innerWidth
  const h = containerRef.value?.clientHeight || window.innerHeight

  if (w <= 0 || h <= 0)
    return

  const gl = renderer.gl
  if (w === renderer.width && h === renderer.height && gl.drawingBufferWidth > 0)
    return

  renderer.setSize(w, h)
  program.uniforms.uResolution.value.set(gl.drawingBufferWidth, gl.drawingBufferHeight)

  if (staticT !== null)
    renderFrame(staticT)
}

function loop() {
  if (!program || !renderer || !mesh)
    return

  pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * 0.04
  pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * 0.04
  renderFrame((performance.now() - start) / 1000)
  frame = requestAnimationFrame(loop)
}

onMounted(() => {
  if (!canvasRef.value || !hasWindow())
    return

  // Headless Chrome / locked-down GPUs can fail WebGL init. Fail closed to the
  // plain black background instead of crashing the page.
  try {
    renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio || 1, 1.75),
      canvas: canvasRef.value,
    })

    if (!renderer?.gl) {
      cleanup()
      return
    }

    const gl = renderer.gl
    const geometry = new Triangle(gl)

    program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vec2() },
        uPointer: { value: new Vec2() },
      },
    })

    mesh = new Mesh(gl, { geometry, program })

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const queryT = Number.parseFloat(String(route.query.t ?? ''))
    staticT = Number.isFinite(queryT) ? queryT : (reducedMotion ? 7 : null)

    window.addEventListener('resize', resize)
    if (staticT === null)
      window.addEventListener('pointermove', onPointerMove)
    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(containerRef.value)
    }
    resize()

    if (staticT !== null) {
      renderFrame(staticT)
      return
    }

    start = performance.now()
    loop()
  }
  catch {
    cleanup()
  }
})

onUnmounted(cleanup)
</script>

<template>
  <div ref="containerRef" class="relative h-screen w-full overflow-hidden bg-black">
    <canvas ref="canvasRef" class="absolute inset-0 block" />

    <header class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-8 py-6 md:px-14">
      <div class="flex items-center gap-3">
        <span class="i-carbon-assembly-cluster text-2xl text-white" />
        <span class="text-lg font-700 tracking-wide text-white">TUFF</span>
      </div>
      <nav class="hidden items-center gap-8 text-sm font-500 text-white/85 md:flex">
        <span class="cursor-default transition-colors hover:text-white">Learn</span>
        <span class="cursor-default transition-colors hover:text-white">Products</span>
        <span class="cursor-default transition-colors hover:text-white">Build</span>
        <span class="cursor-default transition-colors hover:text-white">Connect</span>
      </nav>
    </header>

    <div class="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
      <h1 class="text-4xl font-650 tracking-tight text-white md:text-7xl">
        Staking on Tuff
      </h1>
      <p class="mt-5 text-base text-white/65 md:text-2xl">
        Securing and decentralizing the network while earning rewards
      </p>
    </div>
  </div>
</template>

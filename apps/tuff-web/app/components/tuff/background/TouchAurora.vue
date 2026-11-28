<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl'
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'

interface AuroraProps {
  colorStops?: string[]
  amplitude?: number
  blend?: number
  time?: number
  speed?: number
  intensity?: number
  className?: string
  style?: CSSProperties
}

const props = withDefaults(defineProps<AuroraProps>(), {
  colorStops: () => ['#7cff67', '#171D22', '#7cff67'],
  amplitude: 1.0,
  blend: 0.5,
  speed: 1.0,
  intensity: 1.0,
  className: '',
  style: () => ({}),
})

const MAX_DPR = 1.0
const TARGET_FPS = 24
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS
const DEFAULT_COLOR_STOPS = ['#7cff67', '#171D22', '#7cff67']

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
uniform float uIntensity;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \
  int index = 0;                                            \
  for (int i = 0; i < 2; i++) {                               \
     ColorStop currentColor = colors[i];                    \
     bool isInBetween = currentColor.position <= factor;    \
     index = int(mix(float(index), float(i), float(isInBetween))); \
  }                                                         \
  ColorStop currentColor = colors[index];                   \
  ColorStop nextColor = colors[index + 1];                  \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = rampColor;

  float finalAlpha = auroraAlpha * smoothstep(0.0, 0.5, intensity) * uIntensity;

  fragColor = vec4(auroraColor * finalAlpha, finalAlpha);
}
`

let renderer: Renderer | null = null
let program: Program | null = null
let mesh: Mesh | null = null
let animateId: number | null = null
let lastFrameTime = 0
let auroraDisabled = false
let isVisible = false
let isDocumentHidden = false
let reducedMotion = false
let observer: IntersectionObserver | null = null
let motionMediaQuery: MediaQueryList | null = null
let resizeHandler: (() => void) | null = null
let parsedColorStops: [number, number, number][] = []

function parseColorStops(stops: string[] | undefined): [number, number, number][] {
  const source = stops && stops.length >= 3 ? stops.slice(0, 3) : DEFAULT_COLOR_STOPS
  return source.map((hex) => {
    const c = new Color(hex)
    return [c.r, c.g, c.b]
  })
}

function hasAuroraWebglSupport() {
  if (!hasDocument())
    return false

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(gl)
  }
  catch {
    return false
  }
}

function stopLoop() {
  if (animateId !== null) {
    cancelAnimationFrame(animateId)
    animateId = null
  }
}

function renderFrame(t: number) {
  if (!program || !renderer || !mesh)
    return

  const time = reducedMotion ? 8 : (props.time ?? t * 0.01)
  const speed = props.speed ?? 1.0
  program.uniforms.uTime.value = time * speed * 0.1
  program.uniforms.uAmplitude.value = props.amplitude ?? 1.0
  program.uniforms.uBlend.value = props.blend ?? 0.5
  program.uniforms.uIntensity.value = props.intensity ?? 1.0
  renderer.render({ scene: mesh })
}

function loop(t: number) {
  animateId = null
  if (!program || !renderer || !mesh || !isVisible || isDocumentHidden)
    return

  if (reducedMotion) {
    renderFrame(t)
    return
  }

  if (lastFrameTime > 0 && t - lastFrameTime < FRAME_INTERVAL_MS) {
    animateId = requestAnimationFrame(loop)
    return
  }

  lastFrameTime = t
  renderFrame(t)
  animateId = requestAnimationFrame(loop)
}

function startLoop() {
  if (!program || !renderer || !mesh || !isVisible || isDocumentHidden)
    return
  if (reducedMotion) {
    stopLoop()
    renderFrame(performance.now())
    return
  }
  if (animateId !== null)
    return
  lastFrameTime = 0
  animateId = requestAnimationFrame(loop)
}

function onVisibilityChange() {
  isDocumentHidden = document.hidden
  if (isDocumentHidden) {
    stopLoop()
  }
  else {
    startLoop()
  }
}

function onReducedMotionChange(event: MediaQueryListEvent) {
  reducedMotion = event.matches
  if (reducedMotion) {
    stopLoop()
    if (isVisible && !isDocumentHidden)
      renderFrame(performance.now())
  }
  else {
    startLoop()
  }
}

function initAurora() {
  if (auroraDisabled || !hasWindow())
    return

  const container = containerRef.value
  if (!container)
    return

  if (!hasAuroraWebglSupport()) {
    auroraDisabled = true
    return
  }

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)

  try {
    renderer = new Renderer({
      dpr,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'low-power',
    })
  }
  catch {
    auroraDisabled = true
    renderer = null
    return
  }

  const gl = renderer.gl
  try {
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.canvas.style.backgroundColor = 'transparent'
  }
  catch {
    auroraDisabled = true
    cleanup()
    return
  }

  const resize = () => {
    if (!container || !renderer)
      return

    const parentWidth = container.parentElement?.offsetWidth || container.offsetWidth || window.innerWidth
    const parentHeight = container.parentElement?.offsetHeight || container.offsetHeight || window.innerHeight

    const width = Math.max(parentWidth, 300)
    const height = Math.max(parentHeight, 300)

    renderer.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    renderer.setSize(width, height)
    if (program) {
      program.uniforms.uResolution.value = [
        renderer.gl.drawingBufferWidth || width,
        renderer.gl.drawingBufferHeight || height,
      ]
    }
    if (reducedMotion && isVisible && !isDocumentHidden)
      renderFrame(performance.now())
  }

  resizeHandler = resize
  window.addEventListener('resize', resizeHandler, { passive: true })

  try {
    const geometry = new Triangle(gl)
    if (geometry.attributes.uv)
      delete geometry.attributes.uv

    parsedColorStops = parseColorStops(props.colorStops)

    program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: props.amplitude },
        uColorStops: { value: parsedColorStops },
        uResolution: {
          value: [
            Math.max(container.parentElement?.offsetWidth || container.offsetWidth || window.innerWidth, 300),
            Math.max(container.parentElement?.offsetHeight || container.offsetHeight || window.innerHeight, 300),
          ],
        },
        uBlend: { value: props.blend },
        uIntensity: { value: props.intensity },
      },
    })

    mesh = new Mesh(gl, { geometry, program })
    container.appendChild(gl.canvas)
  }
  catch {
    auroraDisabled = true
    cleanup()
    return
  }

  gl.canvas.style.width = '100%'
  gl.canvas.style.height = '100%'
  gl.canvas.style.display = 'block'
  gl.canvas.style.position = 'absolute'
  gl.canvas.style.top = '0'
  gl.canvas.style.left = '0'

  resize()
  startLoop()
}

function cleanup() {
  stopLoop()

  if (observer) {
    observer.disconnect()
    observer = null
  }

  if (motionMediaQuery) {
    motionMediaQuery.removeEventListener('change', onReducedMotionChange)
    motionMediaQuery = null
  }

  if (hasWindow()) {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler)
      resizeHandler = null
    }
  }

  if (renderer) {
    const gl = renderer.gl
    const container = containerRef.value
    if (container && gl.canvas.parentNode === container) {
      container.removeChild(gl.canvas)
    }
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    catch {
      // ignore dispose failures in headless / no-gl environments
    }
  }

  renderer = null
  program = null
  mesh = null
}

onMounted(() => {
  if (!containerRef.value || !hasWindow())
    return

  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = motionMediaQuery.matches
  motionMediaQuery.addEventListener('change', onReducedMotionChange)
  isDocumentHidden = document.hidden
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(entry => entry.isIntersecting)
        isVisible = visible
        if (visible) {
          if (!renderer && !auroraDisabled)
            initAurora()
          else
            startLoop()
        }
        else {
          stopLoop()
        }
      },
      { threshold: 0.01, rootMargin: '80px' },
    )
    observer.observe(containerRef.value)
  }
  else {
    isVisible = true
    initAurora()
  }
})

onUnmounted(() => {
  cleanup()
})

watch(
  () => props.colorStops,
  (stops) => {
    parsedColorStops = parseColorStops(stops)
    if (program) {
      program.uniforms.uColorStops.value = parsedColorStops
      if (reducedMotion && isVisible && !isDocumentHidden)
        renderFrame(performance.now())
    }
  },
  { deep: true },
)

watch(
  () => [props.amplitude, props.blend, props.intensity],
  () => {
    if (!program)
      return
    program.uniforms.uAmplitude.value = props.amplitude ?? 1.0
    program.uniforms.uBlend.value = props.blend ?? 0.5
    program.uniforms.uIntensity.value = props.intensity ?? 1.0
    if (reducedMotion && isVisible && !isDocumentHidden)
      renderFrame(performance.now())
  },
)
</script>

<template>
  <div ref="containerRef" :class="className" :style="style" class="relative" />
</template>

<style scoped>
div {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

:deep(canvas) {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
</style>

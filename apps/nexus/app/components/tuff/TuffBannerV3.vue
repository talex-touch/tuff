<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLandingRevealState } from '~/composables/useLandingRevealState'

const vertSource = `
#ifdef GL_ES
precision mediump float;
#endif
attribute vec3 aPosition;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`

const fragSource = `
#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
varying vec2 vTexCoord;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i), b = hash(i + vec2(1, 0));
  float c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + 1.7;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 r = u_resolution;
  float t = u_time;
  float aspect = r.x / r.y;
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= aspect;

  vec2 m = u_mouse / r;
  m = (m - 0.5) * 2.0;
  m.x *= aspect;
  m.y = -m.y;

  // Center follows mouse very slightly
  vec2 center = m * 0.05;
  vec2 d = p - center;
  float rad = length(d);
  float ang = atan(d.y, d.x);

  // ── Pure black base ──
  vec3 color = vec3(0.0);

  // ── 1. Core glow — tight bright center ──
  float core = exp(-rad * rad * 12.0);
  float halo = exp(-rad * rad * 2.0);
  color += vec3(0.95, 0.92, 0.88) * core * 0.7;
  color += vec3(0.25, 0.28, 0.42) * halo * 0.12;

  // ── 2. Radial rays — noise-shaped, no loop ──
  float rayN = fbm3(vec2(ang * 1.8 + t * 0.03, rad * 1.5 + t * 0.06));
  float rays = pow(
    max(0.5 + 0.5 * sin(ang * 8.0 + rayN * 4.0 + t * 0.04), 0.0),
    16.0
  );
  rays *= exp(-rad * 0.5) * smoothstep(0.02, 0.12, rad);
  color += vec3(0.6, 0.65, 0.82) * rays * 0.22;

  // Secondary thinner rays at different frequency
  float rays2 = pow(
    max(0.5 + 0.5 * sin(ang * 14.0 - rayN * 3.0 - t * 0.03), 0.0),
    24.0
  );
  rays2 *= exp(-rad * 0.7) * smoothstep(0.01, 0.08, rad);
  color += vec3(0.5, 0.52, 0.7) * rays2 * 0.10;

  // ── 3. Pulsing ring ──
  float ringR = 0.5 + 0.06 * sin(t * 0.25);
  float ring = abs(rad - ringR);
  float ringGlow = exp(-ring * ring * 120.0);
  float ringNoise = noise(vec2(ang * 4.0, t * 0.15));
  ringGlow *= 0.7 + 0.3 * ringNoise;
  color += vec3(0.35, 0.38, 0.55) * ringGlow * 0.12;

  // ── 4. Flowing plasma haze — very subtle ──
  vec2 hazeUv = d * 0.8;
  hazeUv += vec2(sin(hazeUv.y * 0.8 + t * 0.08), cos(hazeUv.x * 0.6 + t * 0.06)) * 0.4;
  float haze = fbm3(hazeUv * 1.2 + t * 0.04);
  float hazeMask = smoothstep(1.2, 0.15, rad);
  color += vec3(0.12, 0.14, 0.25) * haze * hazeMask * 0.15;

  // ── 5. Star field ──
  float starScale = 140.0;
  vec2 starGrid = floor(uv * starScale);
  vec2 starF = fract(uv * starScale);
  float starH = hash(starGrid);
  if (starH > 0.992) {
    vec2 starPos = vec2(fract(starH * 91.7), fract(starH * 127.1)) * 0.6 + 0.2;
    float starD = length(starF - starPos);
    float star = smoothstep(0.04, 0.0, starD);
    float twinkle = 0.6 + 0.4 * sin(t * (1.5 + starH * 3.0) + starH * 6.28);
    color += vec3(0.7, 0.72, 0.8) * star * twinkle * 0.35;
  }

  // Second star layer (finer)
  float starScale2 = 240.0;
  vec2 starGrid2 = floor(uv * starScale2);
  vec2 starF2 = fract(uv * starScale2);
  float starH2 = hash(starGrid2 + 50.0);
  if (starH2 > 0.995) {
    vec2 starPos2 = vec2(fract(starH2 * 73.3), fract(starH2 * 143.7)) * 0.5 + 0.25;
    float starD2 = length(starF2 - starPos2);
    float star2 = smoothstep(0.03, 0.0, starD2);
    color += vec3(0.5, 0.52, 0.6) * star2 * 0.2;
  }

  // ── 6. Very subtle warm accent on one side ──
  float warmSide = smoothstep(-0.5, 1.2, p.x / aspect);
  color += vec3(0.06, 0.02, 0.0) * warmSide * halo * 0.08;

  // ── Post ──
  // Grain
  color += (hash(gl_FragCoord.xy + fract(t * 1.3)) - 0.5) * 0.008;

  // Tone map
  color = color * (2.51 * color + 0.03) / (color * (2.43 * color + 0.59) + 0.14);
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationFrameId: number | null = null
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let startTime = Date.now()
let mousePosition = { x: 0, y: 0, targetX: 0, targetY: 0 }

const {
  sequenceStarted,
  maskScale,
  maskOpacity,
  contentVisible,
} = useLandingRevealState()

const bannerLayerClass = computed(() => ({
  'landing-reveal-layer': sequenceStarted.value,
  'landing-reveal-layer--visible': contentVisible.value,
}))

const maskStyle = computed(() => {
  return {
    '--mask-scale': maskScale.value.toFixed(3),
    '--mask-opacity': maskOpacity.value.toFixed(3),
  }
})

function createShader(glContext: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = glContext.createShader(type)
  if (!shader)
    return null

  glContext.shaderSource(shader, source)
  glContext.compileShader(shader)

  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    console.error('Shader compilation error:', glContext.getShaderInfoLog(shader))
    glContext.deleteShader(shader)
    return null
  }

  return shader
}

function createProgram(glContext: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const programInstance = glContext.createProgram()
  if (!programInstance)
    return null

  glContext.attachShader(programInstance, vertexShader)
  glContext.attachShader(programInstance, fragmentShader)
  glContext.linkProgram(programInstance)

  if (!glContext.getProgramParameter(programInstance, glContext.LINK_STATUS)) {
    console.error('Program linking error:', glContext.getProgramInfoLog(programInstance))
    glContext.deleteProgram(programInstance)
    return null
  }

  return programInstance
}

function resizeCanvas() {
  if (!canvasRef.value)
    return
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const ratio = hasWindow() ? (window.devicePixelRatio || 1) : 1

  canvas.width = rect.width * ratio
  canvas.height = rect.height * ratio

  if (!mousePosition.targetX && !mousePosition.targetY) {
    mousePosition = {
      x: canvas.width * 0.5,
      y: canvas.height * 0.5,
      targetX: canvas.width * 0.5,
      targetY: canvas.height * 0.5,
    }
  }

  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
}

function render() {
  if (!gl || !program || !canvasRef.value)
    return

  const canvas = canvasRef.value
  const time = (Date.now() - startTime) / 1000

  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  gl.useProgram(program)

  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  const mouseLocation = gl.getUniformLocation(program, 'u_mouse')
  const projectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix')
  const modelViewMatrixLocation = gl.getUniformLocation(program, 'uModelViewMatrix')

  const follow = 0.08
  mousePosition.x += (mousePosition.targetX - mousePosition.x) * follow
  mousePosition.y += (mousePosition.targetY - mousePosition.y) * follow

  if (resolutionLocation)
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
  if (timeLocation)
    gl.uniform1f(timeLocation, time)
  if (mouseLocation)
    gl.uniform2f(mouseLocation, mousePosition.x, mousePosition.y)

  if (projectionMatrixLocation || modelViewMatrixLocation) {
    const identityMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ])
    if (projectionMatrixLocation)
      gl.uniformMatrix4fv(projectionMatrixLocation, false, identityMatrix)
    if (modelViewMatrixLocation)
      gl.uniformMatrix4fv(modelViewMatrixLocation, false, identityMatrix)
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  animationFrameId = requestAnimationFrame(render)
}

function initWebGL() {
  if (!canvasRef.value)
    return

  const canvas = canvasRef.value
  const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  gl = (context as WebGLRenderingContext | null) ?? null

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser may not support it.')
    return
  }

  resizeCanvas()

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertSource)
  if (!vertexShader)
    return

  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragSource)
  if (!fragmentShader)
    return

  program = createProgram(gl, vertexShader, fragmentShader)
  if (!program)
    return

  const positions = new Float32Array([
    -1.0,
    -1.0,
    0.0,
    1.0,
    -1.0,
    0.0,
    -1.0,
    1.0,
    0.0,
    1.0,
    1.0,
    0.0,
  ])

  const texCoords = new Float32Array([
    0.0,
    0.0,
    1.0,
    0.0,
    0.0,
    1.0,
    1.0,
    1.0,
  ])

  const positionBuffer = gl.createBuffer()
  if (!positionBuffer)
    return
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

  const texCoordBuffer = gl.createBuffer()
  if (!texCoordBuffer)
    return
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'aPosition')
  const texCoordLocation = gl.getAttribLocation(program, 'aTexCoord')

  if (positionLocation === -1 || texCoordLocation === -1)
    return

  gl.useProgram(program)

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
  gl.enableVertexAttribArray(texCoordLocation)
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const ratio = hasWindow() ? (window.devicePixelRatio || 1) : 1
    const localX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const localY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    mousePosition.targetX = localX * ratio
    mousePosition.targetY = (rect.height - localY) * ratio
  }

  const onPointerLeave = () => {
    mousePosition.targetX = canvas.width * 0.5
    mousePosition.targetY = canvas.height * 0.5
  }

  if (hasWindow()) {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerleave', onPointerLeave)
  }

  startTime = Date.now()
  render()

  return () => {
    if (hasWindow()) {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }
}

let disposePointer: (() => void) | null = null

function onWindowResize() {
  resizeCanvas()
}

onMounted(() => {
  disposePointer = initWebGL() ?? null
  if (hasWindow()) {
    window.addEventListener('resize', onWindowResize)
  }
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  disposePointer?.()
  if (hasWindow()) {
    window.removeEventListener('resize', onWindowResize)
  }
})
</script>

<template>
  <div class="tuff-banner">
    <div class="tuff-banner-canvas-wrap">
      <canvas ref="canvasRef" class="tuff-banner-canvas" />
    </div>
    <div
      class="tuff-banner-mask"
      :style="maskStyle"
    />
    <div
      class="tuff-banner-layer"
      :class="bannerLayerClass"
    >
      <div class="tuff-banner-core">
        <slot name="core-box" />
      </div>
      <div class="tuff-banner-center">
        <slot name="center" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tuff-banner {
  position: relative;
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  align-items: stretch;
  justify-content: center;
  background: #000;
}

.tuff-banner-canvas-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: hidden;
}

.tuff-banner-layer {
  position: relative;
  z-index: 5;
  display: flex;
  width: 100%;
  align-items: stretch;
  justify-content: center;
  gap: clamp(2rem, 5vw, 4rem);
  padding: clamp(3rem, 6vw, 6rem) clamp(2rem, 5vw, 5rem);
  flex-wrap: wrap;
}

.tuff-banner-layer.landing-reveal-layer {
  opacity: 0;
  filter: blur(40px);
  transform: translate3d(0, 64px, 0);
  transition:
    opacity 1.2s cubic-bezier(0.22, 0.61, 0.36, 1),
    filter 1.6s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 1.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tuff-banner-layer.landing-reveal-layer--visible {
  opacity: 1;
  filter: blur(0);
  transform: translate3d(0, 0, 0);
}

.tuff-banner-core {
  display: flex;
  flex: 1;
  min-width: min(100%, 320px);
  max-width: 340px;
  align-items: center;
  justify-content: center;
}

.tuff-banner-core:empty {
  display: none;
  flex: 0;
  max-width: 0;
  min-width: 0;
}

.tuff-banner-center {
  position: relative;
  display: flex;
  flex: 1.4;
  min-width: min(100%, 380px);
  align-items: center;
  justify-content: center;
}

.tuff-banner-canvas {
  position: relative;
  display: block;
  width: clamp(1600px, 180vw, 3200px);
  height: clamp(960px, 130vh, 2200px);
  max-width: none;
}

.tuff-banner-mask {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.tuff-banner-mask::after {
  content: '';
  position: absolute;
  inset: -12%;
  background: radial-gradient(circle at center, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.8) 60%, rgba(0, 0, 0, 0.9) 100%);
  mask: radial-gradient(circle at center, transparent 50%, black 60%);
  -webkit-mask: radial-gradient(circle at center, transparent 52%, black 58%);
  opacity: var(--mask-opacity, 0.82);
  transform-origin: center;
  transform: scale(var(--mask-scale, 1));
  transition:
    transform 2.4s cubic-bezier(0.25, 0.74, 0.15, 0.99),
    opacity 2.4s cubic-bezier(0.25, 0.74, 0.15, 0.99);
}

@media (min-width: 1024px) {
  .tuff-banner-layer {
    flex-wrap: nowrap;
  }
}

@media (max-width: 1024px) {
  .tuff-banner-layer {
    padding: clamp(2.5rem, 10vw, 4rem) clamp(1.5rem, 8vw, 3rem);
  }

  .tuff-banner-core {
    max-width: min(100%, 320px);
  }
}

@media (max-width: 640px) {
  .tuff-banner-layer {
    gap: 2rem;
    padding: clamp(2rem, 12vw, 3rem) clamp(1.25rem, 8vw, 2rem);
  }
}
</style>

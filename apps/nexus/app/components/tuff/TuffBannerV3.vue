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

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = rand(i);
  float b = rand(i + vec2(1.0, 0.0));
  float c = rand(i + vec2(0.0, 1.0));
  float d = rand(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

vec2 rotate2D(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

float sdEquilateralTriangle(vec2 p) {
  const float k = 1.7320508;
  p.x = abs(p.x) - 1.0;
  p.y = p.y + 1.0 / k;
  if (p.x + k * p.y > 0.0) {
    p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  }
  p.x -= clamp(p.x, -2.0, 0.0);
  return -length(p) * sign(p.y);
}

vec3 gradientColor(float t) {
  vec3 c0 = vec3(0.08, 0.08, 0.2);
  vec3 c1 = vec3(0.32, 0.2, 0.6);
  vec3 c2 = vec3(1.0, 0.72, 1.0);
  vec3 c3 = vec3(0.22, 0.98, 0.7);
  float scaled = clamp(t, 0.0, 1.0) * 3.0;
  if (scaled < 1.0) return mix(c0, c1, scaled);
  if (scaled < 2.0) return mix(c1, c2, scaled - 1.0);
  return mix(c2, c3, scaled - 2.0);
}

void main() {
  vec2 r = u_resolution;
  float t = u_time;
  vec2 uv0 = gl_FragCoord.xy / r;
  float aspect = r.x / r.y;

  vec2 p = uv0 * 2.0 - 1.0;
  p.x *= aspect;

  vec2 smokeUv = p;
  smokeUv += vec2(
    sin(smokeUv.y * 1.6 + t * 0.18),
    cos(smokeUv.x * 1.2 - t * 0.12)
  ) * 0.35;
  float smokeField = fbm(smokeUv * 1.6 + vec2(0.0, t * 0.04));
  float smokeSoft = smoothstep(0.26, 0.95, smokeField);
  vec3 smokeColor = mix(vec3(0.05, 0.05, 0.14), vec3(0.38, 0.18, 0.52), smokeSoft);
  float smokeVignette = smoothstep(1.2, 0.32, length(p));
  smokeColor *= 0.5 + 0.45 * smokeVignette;

  vec2 swirlP = p * 0.85;
  float radius = length(swirlP) + 0.001;
  float angle = atan(swirlP.y, swirlP.x);
  float twist = angle + t * 0.32 + sin(radius * 2.6 - t * 0.8) * 0.45;
  vec2 swirlUv = vec2(cos(twist), sin(twist)) * radius;
  float spiral = sin((radius * 8.6 - t * 1.7) + sin(angle * 2.4)) * 0.5 + 0.5;
  float swirlCore = exp(-radius * 1.2) * (0.65 + 0.45 * spiral);
  vec3 swirlColor = vec3(0.22, 0.45, 0.9) * swirlCore;
  swirlColor += vec3(0.85, 0.45, 0.95) * pow(spiral, 1.4) * 0.35;
  swirlColor += vec3(0.12, 0.7, 0.55) * fbm(swirlUv * 3.2 + t * 0.14) * 0.1;
  float centerGlow = smoothstep(1.2, 0.0, radius);
  swirlColor += vec3(0.3, 0.4, 0.8) * centerGlow * 0.15;

  float tGrad = clamp(0.5 + 0.55 * (p.x / (aspect * 1.2)), 0.0, 1.0);
  vec3 base = gradientColor(tGrad);

  float smokeMix = 0.5 + 0.2 * smokeSoft;
  vec3 color = mix(base, smokeColor, smokeMix);
  color += swirlColor * 0.7;
  float triScale = 0.72 + 0.08 * sin(t * 0.4);
  float tri = sdEquilateralTriangle(p * triScale);
  float triPulse = 0.14 + 0.08 * sin(t * 0.6);
  float triRing = smoothstep(0.025, 0.0, abs(tri) - triPulse);
  float triFill = smoothstep(0.25, 0.0, -tri);
  float triMask = triRing * 0.8 + triFill * 0.22;
  vec3 triGlow = vec3(0.9, 0.92, 1.0) * triMask;
  color += triGlow * 0.45;
  color = clamp(color * 1.15, 0.0, 1.2);
  color += vec3(0.04, 0.04, 0.05);
  color += (rand(gl_FragCoord.xy + t) - 0.5) * 0.018;

  float vignette = smoothstep(1.35, 0.25, length(p));
  color *= mix(0.85, 1.0, vignette);

  gl_FragColor = vec4(clamp(color, 0.0, 1.2), 1.0);
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

  if (
    !resolutionLocation
    || !timeLocation
    || !mouseLocation
    || !projectionMatrixLocation
    || !modelViewMatrixLocation
  ) {
    return
  }

  const follow = 0.08
  mousePosition.x += (mousePosition.targetX - mousePosition.x) * follow
  mousePosition.y += (mousePosition.targetY - mousePosition.y) * follow

  gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
  gl.uniform1f(timeLocation, time)
  gl.uniform2f(mouseLocation, mousePosition.x, mousePosition.y)

  const identityMatrix = new Float32Array([
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
  ])

  gl.uniformMatrix4fv(projectionMatrixLocation, false, identityMatrix)
  gl.uniformMatrix4fv(modelViewMatrixLocation, false, identityMatrix)

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

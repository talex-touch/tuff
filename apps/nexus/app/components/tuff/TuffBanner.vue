<script setup lang="ts">
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

varying vec2 vTexCoord;

void main() {
    vec2 r = u_resolution;
    float t = u_time;
    vec4 o = vec4(0.001);

    vec2 p = (gl_FragCoord.xy * 2.0 - r) / r.y / 0.7;

    vec2 d = vec2(-1.0, 1.0);
    float common_divisor = 0.1 + 5.0 / dot(5.0 * p - d, 5.0 * p - d);
    mat2 transform_mat = mat2(1.0, 1.0, d.x / common_divisor, d.y / common_divisor);
    vec2 c = p * transform_mat;

    vec2 v = c;

    float angle_base = log(length(v + 0.001)) + t * 0.2;
    vec4 angle_offsets = vec4(0.0, 33.0, 11.0, 0.0);
    mat2 rot_mat = mat2(
        cos(angle_base + angle_offsets.x), sin(angle_base + angle_offsets.y),
        -sin(angle_base + angle_offsets.z), cos(angle_base + angle_offsets.w)
    );
    v *= rot_mat * 5.0;

    for(float i = 1.0; i <= 9.0; i += 1.0) {
        o += sin(v.xyyx) + 1.0;
        v += 0.7 * sin(v.yx * i + t) / i + 0.5;
    }

    float denom1 = 0.1 + 0.1 * pow(length(sin(v / 0.3) * 0.2 + c * vec2(1.0, 2.0)) - 1.0, 2.0);
    float denom2 = 1.0 + 7.0 * exp(0.3 * c.y - dot(c, c));
    float denom3 = 0.03 + abs(length(p) - 0.7);

    vec4 numerator_base = exp(c.x * vec4(0.6, -0.4, -1.0, 0.0));

    vec4 final_term = numerator_base / o;
    final_term /= denom1;
    final_term /= denom2;
    final_term /= denom3;
    final_term *= 0.2;
    o = 1.0 - exp(-final_term);
    gl_FragColor = vec4(o.rgb, 1.0);
}
`

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animationFrameId: number | null = null
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let startTime = Date.now()

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
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

  canvas.width = rect.width * ratio
  canvas.height = rect.height * ratio

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
  const projectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix')
  const modelViewMatrixLocation = gl.getUniformLocation(program, 'uModelViewMatrix')

  if (
    !resolutionLocation
    || !timeLocation
    || !projectionMatrixLocation
    || !modelViewMatrixLocation
  ) {
    return
  }

  gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
  gl.uniform1f(timeLocation, time)

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

  startTime = Date.now()
  render()
}

function onWindowResize() {
  resizeCanvas()
}

onMounted(() => {
  initWebGL()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize)
  }
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  if (typeof window !== 'undefined') {
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
      <TuffLandingWebglBackground />
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
  height: 100%;
  min-height: clamp(520px, 75vh, 760px);
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

@keyframes tuff-banner-smoke-pulse {
  0%,
  100% {
    opacity: 0.34;
    transform: scale(1.03);
  }

  45% {
    opacity: 0.46;
    transform: scale(1.07) translate3d(0, -1%, 0);
  }

  70% {
    opacity: 0.4;
    transform: scale(1.05) translate3d(0, 0.6%, 0);
  }
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

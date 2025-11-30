<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let buffer: WebGLBuffer | null = null
let animationFrame = 0
let startTime = 0
let uResolution: WebGLUniformLocation | null = null
let uTime: WebGLUniformLocation | null = null

function createShader(context: WebGLRenderingContext, type: number, source: string) {
  const shader = context.createShader(type)
  if (!shader)
    return null

  context.shaderSource(shader, source)
  context.compileShader(shader)

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    console.warn(context.getShaderInfoLog(shader) ?? '')
    context.deleteShader(shader)
    return null
  }

  return shader
}

function createProgram(context: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
  const program = context.createProgram()
  if (!program)
    return null

  context.attachShader(program, vertexShader)
  context.attachShader(program, fragmentShader)
  context.linkProgram(program)

  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    console.warn(context.getProgramInfoLog(program) ?? '')
    context.deleteProgram(program)
    return null
  }

  return program
}

function handleResize() {
  if (!canvasRef.value || !gl)
    return

  const canvas = canvasRef.value
  const dpr = window.devicePixelRatio || 1
  const width = Math.floor(canvas.clientWidth * dpr)
  const height = Math.floor(canvas.clientHeight * dpr)

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas)
    return

  gl = canvas.getContext('webgl', { alpha: true, antialias: true })
  if (!gl)
    return

  const vertexSource = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `

  const fragmentSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;

    float noise(vec2 p) {
      return sin(p.x) * sin(p.y);
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

    void main() {
      vec2 st = gl_FragCoord.xy / u_resolution.xy;
      st.x *= u_resolution.x / u_resolution.y;

      vec2 glowCenter = vec2(0.5 + 0.12 * sin(u_time * 0.3), 0.55 + 0.08 * cos(u_time * 0.25));
      float dist = distance(st, glowCenter);
      float halo = 0.22 / (dist + 0.08);

      float layer = fbm(st * 3.0 + u_time * 0.08);
      float layerTwo = fbm((st + 1.2) * 2.0 + u_time * 0.12);

      vec3 base = mix(vec3(0.02, 0.05, 0.15), vec3(0.01, 0.0, 0.1), st.y);
      vec3 accent = vec3(0.35, 0.33, 0.75);
      vec3 burst = vec3(0.6, 0.4, 0.9);

      vec3 color = base
        + accent * layer * 0.35
        + burst * layerTwo * 0.2
        + burst * halo * 0.15;

      float vignette = smoothstep(1.0, 0.2, dist * 1.2);
      color *= vignette;

      float fadeIn = smoothstep(0.0, 2.2, u_time);
      float dissolveNoise = fbm(st * 4.0 - u_time * 0.03) * 0.35;
      float revealSignal = fadeIn + dissolveNoise - 0.35;
      float reveal = smoothstep(0.0, 1.0, revealSignal);

      vec3 finalColor = mix(vec3(0.0), color, reveal);
      float finalAlpha = mix(1.0, 0.65, reveal);

      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  if (!vertexShader || !fragmentShader)
    return

  program = createProgram(gl, vertexShader, fragmentShader)
  if (!program)
    return

  gl.useProgram(program)

  buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,
    -1,
    3,
    -1,
    -1,
    3,
  ]), gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  uResolution = gl.getUniformLocation(program, 'u_resolution')
  uTime = gl.getUniformLocation(program, 'u_time')

  gl.disable(gl.DEPTH_TEST)
  gl.clearColor(0, 0, 0, 0)

  window.addEventListener('resize', handleResize, { passive: true })
  handleResize()
  startTime = performance.now()

  const render = (now: number) => {
    if (!gl || !canvas || !program || !uResolution || !uTime)
      return

    const elapsed = (now - startTime) / 1000
    // Ease canvas opacity from opaque black toward the ambient translucency
    const fadeDuration = 2.2
    const fadeProgress = Math.min(elapsed / fadeDuration, 1)
    const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)
    const targetOpacity = 1 - easedFade * 0.5
    const nextOpacity = `${targetOpacity}`
    if (canvas.style.opacity !== nextOpacity)
      canvas.style.opacity = nextOpacity

    handleResize()
    gl.uniform2f(uResolution, canvas.width, canvas.height)
    gl.uniform1f(uTime, elapsed)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    animationFrame = requestAnimationFrame(render)
  }

  animationFrame = requestAnimationFrame(render)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', handleResize)

  if (gl && buffer)
    gl.deleteBuffer(buffer)
  if (gl && program)
    gl.deleteProgram(program)

  gl = null
  program = null
  buffer = null
  uResolution = null
  uTime = null
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="pointer-events-none absolute inset-0 h-full w-full opacity-50 -z-40"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// 顶点着色器
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

// 片段着色器
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
let startTime: number = Date.now()

// 创建着色器
function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }

  return shader
}

// 创建着色器程序
function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program linking error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }

  return program
}

// 调整画布大小
function resizeCanvas() {
  if (!canvasRef.value) return

  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()

  // 设置画布大小
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio

  // 设置 WebGL 视口
  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
}

// 渲染循环
function render() {
  if (!gl || !program || !canvasRef.value) return

  const canvas = canvasRef.value
  const time = (Date.now() - startTime) / 1000

  // 清除画布
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)

  // 使用着色器程序
  gl.useProgram(program)

  // 设置分辨率 uniform
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height)

  // 设置时间 uniform
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  gl.uniform1f(timeLocation, time)

  // 设置默认的投影和模型视图矩阵
  const projectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix')
  const modelViewMatrixLocation = gl.getUniformLocation(program, 'uModelViewMatrix')

  // 创建单位矩阵
  const identityMatrix = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ])

  gl.uniformMatrix4fv(projectionMatrixLocation, false, identityMatrix)
  gl.uniformMatrix4fv(modelViewMatrixLocation, false, identityMatrix)

  // 绘制一个覆盖整个视口的四边形
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  // 继续动画循环
  animationFrameId = requestAnimationFrame(render)
}

// 初始化 WebGL
function initWebGL() {
  if (!canvasRef.value) return

  const canvas = canvasRef.value
  gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null

  if (!gl) {
    console.error('Unable to initialize WebGL. Your browser may not support it.')
    return
  }

  // 调整画布大小
  resizeCanvas()

  // 创建顶点着色器
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertSource)
  if (!vertexShader) return

  // 创建片段着色器
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragSource)
  if (!fragmentShader) return

  // 创建着色器程序
  program = createProgram(gl, vertexShader, fragmentShader)
  if (!program) return

  // 创建顶点数据（覆盖整个屏幕的四边形）
  const positions = new Float32Array([
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0,
    -1.0,  1.0, 0.0,
     1.0,  1.0, 0.0
  ])

  const texCoords = new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    1.0, 1.0
  ])

  // 创建顶点缓冲区
  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

  const texCoordBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)

  // 设置顶点属性
  gl.useProgram(program)

  // 位置属性
  const positionLocation = gl.getAttribLocation(program, 'aPosition')
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)

  // 纹理坐标属性
  const texCoordLocation = gl.getAttribLocation(program, 'aTexCoord')
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
  gl.enableVertexAttribArray(texCoordLocation)
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

  // 开始渲染循环
  startTime = Date.now()
  render()
}

// 窗口大小变化处理
function onWindowResize() {
  resizeCanvas()
}

onMounted(() => {
  initWebGL()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div class="touch-banner">
    <div class="touch-core-box">
      <slot name="core-box" />
    </div>

    <canvas ref="canvasRef" class="banner-canvas"></canvas>

    <div class="touch-center">
      <slot name="center"/>
    </div>

    <div class="mask-overlay"></div>
  </div>
</template>

<style scoped lang="scss">
.touch-core-box {
  z-index: 10;
  position: absolute;
  display: flex;

  top: 0%;
  left: 50%;

  width: 50%;
  height: 50%;

  gap: 4rem;
  align-items: center;
  flex-direction: column;
  justify-content: center;

  transform: translate(-50%, 0);
}

.touch-center {
  position: absolute;
  display: flex;

  top: 50%;
  left: 50%;

  width: 50%;
  height: 50%;

  gap: 4rem;
  align-items: center;
  flex-direction: column;
  justify-content: center;

  transform: translate(-50%, -50%);
}

.touch-banner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  flex: 1;
}

.banner-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>

<style scoped lang="scss">
.mask-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  
  /* 使用渐变作为背景 */
  background: radial-gradient(
    circle at center,
    rgba(0, 0, 0, 0.1) 0%,
    rgba(0, 0, 0, 0.8) 60%,
    rgba(0, 0, 0, 0.9) 100%
  );
  
  /* 使用 mask 创建圆形镂空效果 */
  mask: radial-gradient(
    circle at center,
    transparent 50%,  /* 中间圆形镂空区域 */
    black 60%       /* 渐变边缘 */
  );
  
  /* 兼容性前缀 */
  -webkit-mask: radial-gradient(
    circle at center,
    transparent 50%,
    black 55%
  );
  
  opacity: 1;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
</style>

<script setup name="SettingHeader" lang="ts">
import { TxTag } from '@talex-touch/tuffex/tag'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEnv } from '~/modules/hooks/env-hooks'

const { t } = useI18n()
const { packageJson, processInfo } = useEnv()

type RGB = [number, number, number]
type LightfallUniformLocations = Record<string, WebGLUniformLocation>

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null
let resizeHandler: (() => void) | null = null
let pointerMoveHandler: ((event: PointerEvent) => void) | null = null
let pointerLeaveHandler: (() => void) | null = null
let webglCleanupHandler: (() => void) | null = null

const appVersion = computed(() => packageJson.value?.version || '')
const versionLabel = computed(() => (appVersion.value ? `v${appVersion.value}` : ''))

const runtimeVersions = computed(() => {
  const info = processInfo.value as { versions?: { chrome?: string; node?: string } } | undefined
  return info?.versions
})
const chromeVersion = computed(() => runtimeVersions.value?.chrome || '')
const nodeVersion = computed(() => runtimeVersions.value?.node || '')
const vueVersion = computed(() => packageJson.value?.devDependencies?.vue || '')
const footerTagStyle = {
  color: 'rgba(248, 250, 252, 0.78)',
  background: 'rgba(15, 23, 42, 0.28)',
  border: 'rgba(226, 232, 240, 0.18)',
  size: 'md' as const
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false
  })
  if (!gl) return

  const vertex = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

  const fragment = `
precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec3  uBgColor;
uniform vec3  uMouseColor;
uniform float uSpeed;
uniform int   uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void mainImage(out vec4 o, vec2 C) {
  vec2 r = iResolution.xy;
  vec2 uv0 = (C + C - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.28318530718 / angRings);

  vec2 c0 = sceneC(C, r);
  vec2 cdx = sceneC(C + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(C + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  C = c0;

  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O = vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0), 0.0);

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mN = (iMouse + iMouse - r) / r.x;
    float md = length(uv0 - mN);
    mGlow = exp(-md * md / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    O.rgb += uMouseColor * mGlow * 0.25;
  }

  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float ic = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 Pp = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h = fract(8663.0 * ic);
    vec3 col = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2 inner = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2 sm = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y) * 0.38, 1.35)) * col * weight;
    C.x += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  colr = clamp(colr * vec3(0.58, 0.86, 1.12), 0.0, 1.0);
  float maxChannel = max(max(colr.r, colr.g), colr.b);
  float alpha = clamp((maxChannel - 0.02) * 1.1, 0.0, uOpacity * 0.52);
  o = vec4(colr, alpha);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`

  let width = 0
  let height = 0
  let dpr = Math.min(window.devicePixelRatio || 1, 2)
  let lastFrameTime = 0
  const mouseTarget: [number, number] = [0, 0]
  const mouseCurrent: [number, number] = [0, 0]

  const hexToRgb = (hex: string): RGB => {
    const color = hex.replace('#', '').padEnd(6, '0')
    return [
      parseInt(color.slice(0, 2), 16) / 255,
      parseInt(color.slice(2, 4), 16) / 255,
      parseInt(color.slice(4, 6), 16) / 255
    ]
  }

  const prepareColors = (colors: string[]) => {
    const palette = colors.slice(0, 8)
    const rgb = Array.from({ length: 8 }, (_, index) =>
      hexToRgb(palette[Math.min(index, palette.length - 1)])
    )
    const average: RGB = [0, 0, 0]
    palette.forEach((color) => {
      const [red, green, blue] = hexToRgb(color)
      average[0] += red
      average[1] += green
      average[2] += blue
    })
    average[0] /= palette.length
    average[1] /= palette.length
    average[2] /= palette.length
    return { average, count: palette.length, rgb }
  }

  const compileShader = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertex)
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragment)
  if (!vertexShader || !fragmentShader) return

  const program = gl.createProgram()
  if (!program) return
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return
  }

  const uniformNames = [
    'iResolution',
    'iMouse',
    'iTime',
    'uColor0',
    'uColor1',
    'uColor2',
    'uColor3',
    'uColor4',
    'uColor5',
    'uColor6',
    'uColor7',
    'uColorCount',
    'uBgColor',
    'uMouseColor',
    'uSpeed',
    'uStreakCount',
    'uStreakWidth',
    'uStreakLength',
    'uGlow',
    'uDensity',
    'uTwinkle',
    'uZoom',
    'uBgGlow',
    'uOpacity',
    'uMouseEnabled',
    'uMouseStrength',
    'uMouseRadius'
  ]
  const uniforms: LightfallUniformLocations = {}
  for (const name of uniformNames) {
    const location = gl.getUniformLocation(program, name)
    if (!location) {
      gl.deleteProgram(program)
      return
    }
    uniforms[name] = location
  }

  const positionBuffer = gl.createBuffer()
  if (!positionBuffer) {
    gl.deleteProgram(program)
    return
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  const positionLocation = gl.getAttribLocation(program, 'position')
  if (positionLocation < 0) {
    gl.deleteBuffer(positionBuffer)
    gl.deleteProgram(program)
    return
  }

  const colorState = prepareColors(['#BAE6FD', '#7DD3FC', '#38BDF8'])
  const backgroundGlowColor = hexToRgb('#0EA5E9')

  gl.useProgram(program)
  colorState.rgb.forEach((color, index) => {
    gl.uniform3f(uniforms[`uColor${index}`], color[0], color[1], color[2])
  })
  gl.uniform1i(uniforms.uColorCount, colorState.count)
  gl.uniform3f(
    uniforms.uBgColor,
    backgroundGlowColor[0],
    backgroundGlowColor[1],
    backgroundGlowColor[2]
  )
  gl.uniform3f(
    uniforms.uMouseColor,
    colorState.average[0],
    colorState.average[1],
    colorState.average[2]
  )
  gl.uniform1f(uniforms.uSpeed, 0.5)
  gl.uniform1i(uniforms.uStreakCount, 2)
  gl.uniform1f(uniforms.uStreakWidth, 1)
  gl.uniform1f(uniforms.uStreakLength, 1)
  gl.uniform1f(uniforms.uGlow, 1)
  gl.uniform1f(uniforms.uDensity, 0.6)
  gl.uniform1f(uniforms.uTwinkle, 1)
  gl.uniform1f(uniforms.uZoom, 3)
  gl.uniform1f(uniforms.uBgGlow, 0)
  gl.uniform1f(uniforms.uOpacity, 0.65)
  gl.uniform1f(uniforms.uMouseEnabled, 1)
  gl.uniform1f(uniforms.uMouseStrength, 0.5)
  gl.uniform1f(uniforms.uMouseRadius, 0.2)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.clearColor(0, 0, 0, 0)

  const moveMouseToCenter = () => {
    mouseTarget[0] = canvas.width * 0.5
    mouseTarget[1] = canvas.height * 0.5
  }

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    width = rect.width
    height = rect.height
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    gl.uniform3f(uniforms.iResolution, canvas.width, canvas.height, 1)
    moveMouseToCenter()
    mouseCurrent[0] = mouseTarget[0]
    mouseCurrent[1] = mouseTarget[1]
  }

  const host = canvas.parentElement
  pointerMoveHandler = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    mouseTarget[0] = (event.clientX - rect.left) * dpr
    mouseTarget[1] = (rect.height - (event.clientY - rect.top)) * dpr
  }
  pointerLeaveHandler = moveMouseToCenter

  resize()
  resizeHandler = resize
  window.addEventListener('resize', resize)
  host?.addEventListener('pointermove', pointerMoveHandler)
  host?.addEventListener('pointerleave', pointerLeaveHandler)

  webglCleanupHandler = () => {
    gl.deleteBuffer(positionBuffer)
    gl.deleteProgram(program)
    webglCleanupHandler = null
  }

  const draw = (frameTime: number) => {
    if (!width || !height) {
      rafId = window.requestAnimationFrame(draw)
      return
    }

    const elapsedSeconds = lastFrameTime
      ? Math.min(0.05, (frameTime - lastFrameTime) / 1000)
      : 0.016
    lastFrameTime = frameTime

    const dampening = 0.15
    const factor = 1 - Math.exp(-elapsedSeconds / dampening)
    mouseCurrent[0] += (mouseTarget[0] - mouseCurrent[0]) * factor
    mouseCurrent[1] += (mouseTarget[1] - mouseCurrent[1]) * factor

    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1f(uniforms.iTime, frameTime * 0.001)
    gl.uniform2f(uniforms.iMouse, mouseCurrent[0], mouseCurrent[1])
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    rafId = window.requestAnimationFrame(draw)
  }

  rafId = window.requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (pointerMoveHandler) {
    canvasRef.value?.parentElement?.removeEventListener('pointermove', pointerMoveHandler)
    pointerMoveHandler = null
  }
  if (pointerLeaveHandler) {
    canvasRef.value?.parentElement?.removeEventListener('pointerleave', pointerLeaveHandler)
    pointerLeaveHandler = null
  }
  if (webglCleanupHandler) {
    webglCleanupHandler()
  }
})
</script>

<template>
  <div
    class="AboutApplication activate"
    :style="{ '--inactive-text': `'${t('settingHeader.inactive')}'` }"
  >
    <canvas ref="canvasRef" class="Header-Canvas" aria-hidden="true" />
    <div class="Header-Content">
      <div class="Header-Intro">
        <div v-if="versionLabel" class="Header-Badge">
          <span class="Header-Status" aria-hidden="true" />
          <span class="Header-BadgeLabel">{{ t('settingHeader.version') }}</span>
          <span class="Header-BadgeValue">{{ versionLabel }}</span>
        </div>

        <div class="Home-Text">
          <h1 class="Header-Title">TUFF</h1>
          <p>{{ t('settingHeader.subTitle') }}</p>
        </div>
      </div>

      <ul v-if="processInfo" class="About-Footer">
        <li>
          <TxTag
            v-bind="footerTagStyle"
            icon="i-carbon-chip"
            :label="`Chromium: ${chromeVersion}`"
          />
        </li>
        <li>
          <TxTag v-bind="footerTagStyle" icon="i-carbon-code" :label="`Node.js: ${nodeVersion}`" />
        </li>
        <li>
          <TxTag v-bind="footerTagStyle" icon="i-carbon-logo-vue" :label="`Vue: ${vueVersion}`" />
        </li>
      </ul>
    </div>

    <div class="About-Image">
      <div class="Home-Logo-Bg" />
      <img src="~/assets/logo.svg" alt="logo" />
    </div>
  </div>
</template>

<style lang="scss">
.AboutApplication {
  .Header-Canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .Header-Content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: min(65%, 640px);
  }

  .Header-Intro {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .Header-Badge {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.38);
    border: 1px solid rgba(226, 232, 240, 0.2);
    backdrop-filter: blur(12px);
  }

  .Header-Status {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #22c55e;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
    animation: status-pulse 2s ease-in-out infinite;
  }

  .Header-BadgeLabel {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  .Header-BadgeValue {
    font-size: 12px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .Home-Text {
    display: flex;
    flex-direction: column;
    gap: 8px;

    p {
      margin: 0;
      color: rgba(248, 250, 252, 0.78);
      font-size: 14px;
      line-height: 1.6;
    }
  }

  .Header-Title {
    margin: 0;
    font-size: clamp(32px, 4vw, 56px);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: linear-gradient(135deg, #ffffff 0%, #dbeafe 45%, #bae6fd 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .About-Footer {
    display: flex;
    gap: 10px;
    padding: 0;
    margin: 0;

    li {
      list-style: none;
    }
  }

  .About-Image {
    position: absolute;
    right: 5%;
    top: 12%;
    height: 76%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;

    .Home-Logo-Bg {
      position: absolute;
      inset: 12%;
      border-radius: 50%;
      background:
        radial-gradient(circle at 30% 30%, rgba(147, 197, 253, 0.48), transparent 60%),
        radial-gradient(circle at 70% 70%, rgba(125, 211, 252, 0.34), transparent 55%);
      filter: blur(8px);
      opacity: 0.72;
    }

    img {
      position: relative;
      height: 100%;
      filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.42));
    }
  }

  &.activate {
    &:before {
      opacity: 0;
    }

    opacity: 0.98;
  }

  &:before {
    content: var(--inactive-text);
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: 0.6;
    font-size: 20px;
    font-weight: 600;
    border-radius: 12px;
    background-color: var(--tx-fill-color-darker);
    z-index: 3;
  }

  & {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 15px;
    width: 100%;
    min-height: 220px;
    padding: 24px 32px;
    border-radius: 18px;
    color: var(--tx-text-color-primary);
    border: 1px solid var(--tx-border-color);
    background: linear-gradient(
      135deg,
      var(--tx-color-primary) 0%,
      var(--tx-color-primary-light-3) 45%,
      var(--tx-color-primary-light-5) 100%
    );
    background-size: 200% 200%;
    animation: header-flow 12s ease infinite;
  }

  :root:not(.dark) & {
    filter: brightness(1.08) saturate(1.04);
  }
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.55;
    transform: scale(1.4);
  }
}

@keyframes header-flow {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}

@media (max-width: 900px) {
  .AboutApplication {
    padding: 20px 24px;
  }

  .AboutApplication .Header-Content {
    width: 100%;
  }

  .AboutApplication .About-Image {
    right: -5%;
    opacity: 0.35;
  }

  .AboutApplication .About-Footer {
    flex-wrap: wrap;
  }
}
</style>

import type { Ref } from 'vue'
import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'

/**
 * The "Lightfall" WebGL backdrop behind the Tuff identity.
 *
 * Extracted from `SettingHeader.vue` so the v2 identity band can carry the same effect without
 * a second copy of the shader. Behaviour is unchanged: capped at 30fps, paused while the route
 * is deactivated or the document is hidden, and fully torn down on unmount.
 */

type RGB = [number, number, number]
type LightfallUniformLocations = Record<string, WebGLUniformLocation>

const FRAME_INTERVAL_MS = 1000 / 30
const lightfallLog = createRendererLogger('LightfallCanvas')

export interface LightfallOptions {
  /**
   * How the streaks are composited.
   * - `glow`: additive light. Needs a surface darker than the streak colours.
   * - `ink`: pigment over normal alpha blending. Needs a light surface.
   * - `auto`: `glow` under the dark theme, `ink` under the light one, switching live when the
   *   theme changes. This is what lets one band stay readable in both.
   */
  mode?: 'glow' | 'ink' | 'auto'
  /** Up to 8 hex colors sampled by the streak palette. */
  colors?: string[]
  /** Hex color of the central background glow. */
  backgroundColor?: string
  speed?: number
  streakCount?: number
  density?: number
  zoom?: number
  backgroundGlow?: number
  opacity?: number
  mouseStrength?: number
  mouseRadius?: number
}

const DEFAULTS = {
  mode: 'glow' as const,
  colors: ['#BAE6FD', '#7DD3FC', '#38BDF8'],
  backgroundColor: '#0EA5E9',
  speed: 0.5,
  streakCount: 2,
  density: 0.6,
  zoom: 3,
  backgroundGlow: 0,
  opacity: 0.65,
  mouseStrength: 0.5,
  mouseRadius: 0.2
} satisfies Required<LightfallOptions>

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
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
uniform float uInk;

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

  if (uInk > 0.5) {
    // Ink: the same streak energy drawn as pigment that darkens a light surface, composited
    // with normal alpha blending. Additive light cannot register on a near-white background,
    // which is what forced the band to be dark in the first place.
    vec3 ink = clamp(colr * vec3(0.34, 0.44, 0.74), 0.0, 1.0);
    // Matched to the glow branch's uOpacity * 0.52 ceiling so one uOpacity value reads about
    // the same in both modes. (No backticks in here: this shader lives in a template literal.)
    float inkAlpha = clamp(maxChannel, 0.0, 1.0) * uOpacity * 0.48;
    o = vec4(ink, inkAlpha);
    return;
  }

  float alpha = clamp((maxChannel - 0.02) * 1.1, 0.0, uOpacity * 0.52);
  o = vec4(colr, alpha);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`

const UNIFORM_NAMES = [
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
  'uMouseRadius',
  'uInk'
]

/**
 * Honours both the OS setting and the app's own low-battery motion mode, which
 * `styles/index.scss` drives via `html[data-low-battery-motion='1']`. CSS alone cannot stop a
 * WebGL render loop, so the check has to happen here.
 */
function prefersReducedMotion(): boolean {
  if (document.documentElement.dataset.lowBatteryMotion === '1') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function hexToRgb(hex: string): RGB {
  const color = hex.replace('#', '').padEnd(6, '0')
  return [
    parseInt(color.slice(0, 2), 16) / 255,
    parseInt(color.slice(2, 4), 16) / 255,
    parseInt(color.slice(4, 6), 16) / 255
  ]
}

function prepareColors(colors: string[]): { average: RGB; count: number; rgb: RGB[] } {
  const palette = colors.slice(0, 8)
  const rgb = Array.from({ length: 8 }, (_, index) =>
    hexToRgb(palette[Math.min(index, palette.length - 1)]!)
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

export function useLightfallCanvas(
  canvasRef: Ref<HTMLCanvasElement | null>,
  options: LightfallOptions = {}
): void {
  const config = { ...DEFAULTS, ...options }

  let routeActive = true
  let rafId: number | null = null
  let frameTimerId: number | null = null
  let resizeObserver: ResizeObserver | null = null
  let themeObserver: MutationObserver | null = null
  let motionQuery: MediaQueryList | null = null
  let motionChangeHandler: (() => void) | null = null
  let resizeHandler: (() => void) | null = null
  let pointerMoveHandler: ((event: PointerEvent) => void) | null = null
  let pointerLeaveHandler: (() => void) | null = null
  let visibilityHandler: (() => void) | null = null
  let startHandler: (() => void) | null = null
  let stopHandler: (() => void) | null = null
  let cleanupHandler: (() => void) | null = null

  onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false
    })
    if (!gl) return

    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let lastFrameTime = 0
    const mouseTarget: [number, number] = [0, 0]
    const mouseCurrent: [number, number] = [0, 0]

    // Every failure path below bails out silently as far as the user is concerned — the canvas
    // just stays blank. Log it, otherwise a broken shader is indistinguishable from a design
    // choice and can ship unnoticed.
    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        lightfallLog.warn('Shader failed to compile', {
          type: type === gl.VERTEX_SHADER ? 'vertex' : 'fragment',
          log: gl.getShaderInfoLog(shader)
        })
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertexShader || !fragmentShader) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      lightfallLog.warn('Program failed to link', { log: gl.getProgramInfoLog(program) })
      gl.deleteProgram(program)
      return
    }

    const uniforms: LightfallUniformLocations = {}
    for (const name of UNIFORM_NAMES) {
      const location = gl.getUniformLocation(program, name)
      if (!location) {
        // GLSL strips uniforms it considers unused, so a missing one usually means the shader
        // stopped referencing it rather than a driver problem.
        lightfallLog.warn('Uniform missing from linked program', { name })
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

    const colorState = prepareColors(config.colors)
    const backgroundGlowColor = hexToRgb(config.backgroundColor)

    gl.useProgram(program)
    colorState.rgb.forEach((color, index) => {
      gl.uniform3f(uniforms[`uColor${index}`]!, color[0], color[1], color[2])
    })
    gl.uniform1i(uniforms.uColorCount!, colorState.count)
    gl.uniform3f(
      uniforms.uBgColor!,
      backgroundGlowColor[0],
      backgroundGlowColor[1],
      backgroundGlowColor[2]
    )
    gl.uniform3f(
      uniforms.uMouseColor!,
      colorState.average[0],
      colorState.average[1],
      colorState.average[2]
    )
    gl.uniform1f(uniforms.uSpeed!, config.speed)
    gl.uniform1i(uniforms.uStreakCount!, config.streakCount)
    gl.uniform1f(uniforms.uStreakWidth!, 1)
    gl.uniform1f(uniforms.uStreakLength!, 1)
    gl.uniform1f(uniforms.uGlow!, 1)
    gl.uniform1f(uniforms.uDensity!, config.density)
    gl.uniform1f(uniforms.uTwinkle!, 1)
    gl.uniform1f(uniforms.uZoom!, config.zoom)
    gl.uniform1f(uniforms.uBgGlow!, config.backgroundGlow)
    gl.uniform1f(uniforms.uOpacity!, config.opacity)
    gl.uniform1f(uniforms.uMouseEnabled!, 1)
    gl.uniform1f(uniforms.uMouseStrength!, config.mouseStrength)
    gl.uniform1f(uniforms.uMouseRadius!, config.mouseRadius)

    gl.enable(gl.BLEND)
    gl.clearColor(0, 0, 0, 0)

    const resolveMode = (): 'glow' | 'ink' => {
      if (config.mode !== 'auto') return config.mode
      return document.documentElement.classList.contains('dark') ? 'glow' : 'ink'
    }

    /**
     * The blend equation and the shader branch have to agree: additive light for `glow`,
     * source-over for `ink`. Setting one without the other washes the effect out entirely.
     */
    const applyMode = (): void => {
      const isInk = resolveMode() === 'ink'
      gl.useProgram(program)
      gl.uniform1f(uniforms.uInk!, isInk ? 1 : 0)
      gl.blendFunc(gl.SRC_ALPHA, isInk ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE)
    }

    applyMode()

    const moveMouseToCenter = (): void => {
      mouseTarget[0] = canvas.width * 0.5
      mouseTarget[1] = canvas.height * 0.5
    }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(program)
      gl.uniform3f(uniforms.iResolution!, canvas.width, canvas.height, 1)
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
    // The canvas also changes size without the window doing so — the settings content column is
    // max-width driven and the sidebar swaps contexts — so watch the element itself too.
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        resize()
        if (!canAnimate()) drawStaticFrame()
      })
      resizeObserver.observe(canvas)
    }
    host?.addEventListener('pointermove', pointerMoveHandler)
    host?.addEventListener('pointerleave', pointerLeaveHandler)

    cleanupHandler = () => {
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      cleanupHandler = null
    }

    const canAnimate = (): boolean => routeActive && !document.hidden && !prefersReducedMotion()

    const renderFrame = (timeSeconds: number): void => {
      if (!width || !height) return
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(uniforms.iTime!, timeSeconds)
      gl.uniform2f(uniforms.iMouse!, mouseCurrent[0], mouseCurrent[1])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    /** Under reduced motion the effect still renders — it just stops moving. */
    const drawStaticFrame = (): void => renderFrame(0)

    const cancelScheduledFrame = (): void => {
      if (frameTimerId !== null) {
        window.clearTimeout(frameTimerId)
        frameTimerId = null
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
      lastFrameTime = 0
    }

    const draw = (frameTime: number): void => {
      rafId = null
      if (!canAnimate()) return

      if (width && height) {
        const elapsedSeconds = lastFrameTime
          ? Math.min(0.05, (frameTime - lastFrameTime) / 1000)
          : 0.016
        lastFrameTime = frameTime

        const dampening = 0.15
        const factor = 1 - Math.exp(-elapsedSeconds / dampening)
        mouseCurrent[0] += (mouseTarget[0] - mouseCurrent[0]) * factor
        mouseCurrent[1] += (mouseTarget[1] - mouseCurrent[1]) * factor

        renderFrame(frameTime * 0.001)
      }

      frameTimerId = window.setTimeout(() => {
        frameTimerId = null
        if (canAnimate() && rafId === null) rafId = window.requestAnimationFrame(draw)
      }, FRAME_INTERVAL_MS)
    }

    startHandler = () => {
      if (!canAnimate()) {
        cancelScheduledFrame()
        drawStaticFrame()
        return
      }
      if (rafId !== null || frameTimerId !== null) return
      lastFrameTime = 0
      rafId = window.requestAnimationFrame(draw)
    }
    stopHandler = cancelScheduledFrame
    visibilityHandler = () => {
      if (document.hidden) cancelScheduledFrame()
      else startHandler?.()
    }
    document.addEventListener('visibilitychange', visibilityHandler)

    motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
    motionChangeHandler = () => startHandler?.()
    motionQuery?.addEventListener('change', motionChangeHandler)

    if (config.mode === 'auto') {
      // The app toggles the theme by putting `dark` on <html>, so watch that class.
      themeObserver = new MutationObserver(() => {
        applyMode()
        if (!canAnimate()) drawStaticFrame()
      })
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      })
    }

    startHandler()
  })

  onActivated(() => {
    routeActive = true
    startHandler?.()
  })

  onDeactivated(() => {
    routeActive = false
    stopHandler?.()
  })

  onBeforeUnmount(() => {
    routeActive = false
    stopHandler?.()
    startHandler = null
    stopHandler = null
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler)
      resizeHandler = null
    }
    resizeObserver?.disconnect()
    resizeObserver = null
    themeObserver?.disconnect()
    themeObserver = null
    if (motionQuery && motionChangeHandler) {
      motionQuery.removeEventListener('change', motionChangeHandler)
    }
    motionQuery = null
    motionChangeHandler = null
    if (pointerMoveHandler) {
      canvasRef.value?.parentElement?.removeEventListener('pointermove', pointerMoveHandler)
      pointerMoveHandler = null
    }
    if (pointerLeaveHandler) {
      canvasRef.value?.parentElement?.removeEventListener('pointerleave', pointerLeaveHandler)
      pointerLeaveHandler = null
    }
    cleanupHandler?.()
  })
}

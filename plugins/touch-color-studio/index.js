const PLUGIN_NAME = 'touch-color-studio'
const FEATURE_ID = 'color-studio'
const SOURCE_ID = 'plugin-features'
const ACTION_GROUP = 'color-studio'
const ICON = { type: 'file', value: 'assets/logo.svg' }

const COMMAND_PREFIXES = [
  'color',
  'colour',
  'hex',
  'rgb',
  'hsl',
  'oklch',
  'contrast',
  'wcag',
  'palette',
  'tailwind',
  'tw',
  '色彩',
  '配色',
  '对比度',
  '调色板',
]

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Official Tailwind CSS v4 palette in OKLCH [L (0..1), C, H (deg)]
const TAILWIND_V4_FAMILIES = {
  slate: [
    [0.984, 0.003, 247.858], [0.968, 0.007, 247.896], [0.929, 0.013, 255.508],
    [0.869, 0.022, 252.894], [0.704, 0.04, 256.788], [0.554, 0.046, 257.417],
    [0.446, 0.043, 257.281], [0.372, 0.044, 257.287], [0.279, 0.041, 260.031],
    [0.208, 0.042, 265.755], [0.129, 0.042, 264.695],
  ],
  gray: [
    [0.985, 0.002, 247.839], [0.967, 0.003, 264.542], [0.928, 0.006, 264.531],
    [0.872, 0.01, 258.338], [0.707, 0.022, 261.325], [0.551, 0.027, 264.364],
    [0.446, 0.03, 256.802], [0.373, 0.034, 259.733], [0.278, 0.033, 256.848],
    [0.21, 0.034, 264.665], [0.13, 0.028, 261.692],
  ],
  zinc: [
    [0.985, 0, 0], [0.967, 0.001, 286.375], [0.92, 0.004, 286.32],
    [0.871, 0.006, 286.286], [0.705, 0.015, 286.067], [0.552, 0.016, 285.938],
    [0.442, 0.017, 285.786], [0.37, 0.013, 285.805], [0.274, 0.006, 286.033],
    [0.21, 0.006, 285.885], [0.141, 0.005, 285.823],
  ],
  neutral: [
    [0.985, 0, 0], [0.97, 0, 0], [0.922, 0, 0],
    [0.87, 0, 0], [0.708, 0, 0], [0.556, 0, 0],
    [0.439, 0, 0], [0.371, 0, 0], [0.269, 0, 0],
    [0.205, 0, 0], [0.145, 0, 0],
  ],
  stone: [
    [0.985, 0.001, 106.423], [0.97, 0.001, 106.424], [0.923, 0.003, 48.717],
    [0.869, 0.005, 56.366], [0.709, 0.01, 56.259], [0.553, 0.013, 58.071],
    [0.444, 0.011, 73.639], [0.374, 0.01, 67.558], [0.268, 0.007, 34.298],
    [0.216, 0.006, 56.043], [0.147, 0.004, 49.25],
  ],
  red: [
    [0.971, 0.013, 17.38], [0.936, 0.032, 17.717], [0.885, 0.062, 18.334],
    [0.808, 0.114, 19.571], [0.704, 0.191, 22.216], [0.637, 0.237, 25.331],
    [0.577, 0.245, 27.325], [0.505, 0.213, 27.518], [0.444, 0.177, 26.899],
    [0.396, 0.141, 25.723], [0.258, 0.092, 26.042],
  ],
  orange: [
    [0.98, 0.016, 73.684], [0.954, 0.038, 75.164], [0.901, 0.076, 70.697],
    [0.837, 0.128, 66.29], [0.75, 0.183, 55.934], [0.705, 0.213, 47.604],
    [0.646, 0.222, 41.116], [0.553, 0.195, 38.402], [0.47, 0.157, 37.304],
    [0.408, 0.123, 38.172], [0.266, 0.079, 36.259],
  ],
  amber: [
    [0.987, 0.022, 95.277], [0.962, 0.059, 95.617], [0.924, 0.12, 95.746],
    [0.879, 0.169, 91.605], [0.828, 0.189, 84.429], [0.769, 0.188, 70.08],
    [0.666, 0.179, 58.318], [0.555, 0.163, 48.998], [0.473, 0.137, 46.201],
    [0.414, 0.112, 45.904], [0.279, 0.077, 45.635],
  ],
  yellow: [
    [0.987, 0.026, 102.212], [0.973, 0.071, 103.193], [0.945, 0.129, 101.54],
    [0.905, 0.182, 98.111], [0.852, 0.199, 91.936], [0.795, 0.184, 86.047],
    [0.681, 0.162, 75.834], [0.554, 0.135, 66.442], [0.476, 0.114, 61.907],
    [0.421, 0.095, 57.708], [0.286, 0.066, 53.813],
  ],
  lime: [
    [0.986, 0.031, 120.757], [0.967, 0.067, 122.328], [0.938, 0.127, 124.321],
    [0.897, 0.196, 126.665], [0.841, 0.238, 128.85], [0.768, 0.233, 130.85],
    [0.648, 0.2, 131.684], [0.532, 0.157, 131.589], [0.453, 0.124, 130.933],
    [0.405, 0.101, 131.063], [0.274, 0.072, 132.109],
  ],
  green: [
    [0.982, 0.018, 155.826], [0.962, 0.044, 156.743], [0.925, 0.084, 155.995],
    [0.871, 0.15, 154.449], [0.792, 0.209, 151.711], [0.723, 0.219, 149.579],
    [0.627, 0.194, 149.214], [0.527, 0.154, 150.069], [0.448, 0.119, 151.328],
    [0.393, 0.095, 152.535], [0.266, 0.065, 152.934],
  ],
  emerald: [
    [0.979, 0.021, 166.113], [0.95, 0.052, 163.051], [0.905, 0.093, 164.15],
    [0.845, 0.143, 164.978], [0.765, 0.177, 163.223], [0.696, 0.17, 162.48],
    [0.596, 0.145, 163.225], [0.508, 0.118, 165.612], [0.432, 0.095, 166.913],
    [0.378, 0.077, 168.94], [0.262, 0.051, 172.552],
  ],
  teal: [
    [0.984, 0.014, 180.72], [0.953, 0.051, 180.801], [0.91, 0.096, 180.426],
    [0.855, 0.138, 181.071], [0.777, 0.152, 181.912], [0.704, 0.14, 182.503],
    [0.6, 0.118, 184.704], [0.511, 0.096, 186.391], [0.437, 0.078, 188.216],
    [0.386, 0.063, 188.416], [0.277, 0.046, 192.524],
  ],
  cyan: [
    [0.984, 0.019, 200.873], [0.956, 0.045, 203.388], [0.917, 0.08, 205.041],
    [0.865, 0.127, 207.078], [0.789, 0.154, 211.53], [0.715, 0.143, 215.221],
    [0.609, 0.126, 221.723], [0.52, 0.105, 223.128], [0.45, 0.085, 224.283],
    [0.398, 0.07, 227.392], [0.302, 0.056, 229.695],
  ],
  sky: [
    [0.977, 0.013, 236.62], [0.951, 0.026, 236.824], [0.901, 0.058, 230.902],
    [0.828, 0.111, 230.318], [0.746, 0.16, 232.661], [0.685, 0.169, 237.323],
    [0.588, 0.158, 241.966], [0.5, 0.134, 242.749], [0.443, 0.11, 240.79],
    [0.391, 0.09, 240.876], [0.293, 0.066, 243.157],
  ],
  blue: [
    [0.97, 0.014, 254.604], [0.932, 0.032, 255.585], [0.882, 0.059, 254.128],
    [0.809, 0.105, 251.813], [0.707, 0.165, 254.624], [0.623, 0.214, 259.815],
    [0.546, 0.245, 262.881], [0.488, 0.243, 264.376], [0.424, 0.199, 265.638],
    [0.379, 0.146, 265.522], [0.282, 0.091, 267.935],
  ],
  indigo: [
    [0.962, 0.018, 272.314], [0.93, 0.034, 272.788], [0.87, 0.065, 274.039],
    [0.785, 0.115, 274.713], [0.673, 0.182, 276.935], [0.585, 0.233, 277.117],
    [0.511, 0.262, 276.966], [0.457, 0.24, 277.023], [0.398, 0.195, 277.366],
    [0.359, 0.144, 278.697], [0.257, 0.09, 281.288],
  ],
  violet: [
    [0.969, 0.016, 293.756], [0.943, 0.029, 294.588], [0.894, 0.057, 293.283],
    [0.811, 0.111, 293.571], [0.702, 0.183, 293.541], [0.606, 0.25, 292.717],
    [0.541, 0.281, 293.009], [0.491, 0.27, 292.581], [0.432, 0.232, 292.759],
    [0.38, 0.189, 293.745], [0.283, 0.141, 291.089],
  ],
  purple: [
    [0.977, 0.014, 308.299], [0.946, 0.033, 307.174], [0.902, 0.063, 306.703],
    [0.827, 0.119, 306.383], [0.714, 0.203, 305.504], [0.627, 0.265, 303.9],
    [0.558, 0.288, 302.321], [0.496, 0.265, 301.924], [0.438, 0.218, 303.724],
    [0.381, 0.176, 304.987], [0.291, 0.149, 302.717],
  ],
  fuchsia: [
    [0.977, 0.017, 320.058], [0.952, 0.037, 318.852], [0.903, 0.076, 319.62],
    [0.833, 0.145, 321.434], [0.74, 0.238, 322.16], [0.667, 0.295, 322.15],
    [0.591, 0.293, 322.896], [0.518, 0.253, 323.949], [0.452, 0.211, 324.591],
    [0.401, 0.17, 325.612], [0.293, 0.136, 325.661],
  ],
  pink: [
    [0.971, 0.014, 343.198], [0.948, 0.028, 342.258], [0.899, 0.061, 343.231],
    [0.823, 0.12, 346.018], [0.718, 0.202, 349.761], [0.656, 0.241, 354.308],
    [0.592, 0.249, 0.584], [0.525, 0.223, 3.958], [0.459, 0.187, 3.815],
    [0.408, 0.153, 2.432], [0.284, 0.109, 3.907],
  ],
  rose: [
    [0.969, 0.015, 12.422], [0.941, 0.03, 12.58], [0.892, 0.058, 10.001],
    [0.81, 0.117, 11.638], [0.712, 0.194, 13.428], [0.645, 0.246, 16.439],
    [0.586, 0.253, 17.585], [0.514, 0.222, 16.935], [0.455, 0.188, 13.697],
    [0.41, 0.159, 10.272], [0.271, 0.105, 12.094],
  ],
}

const CSS_NAMED_COLORS = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  purple: '#800080',
  orange: '#ffa500',
  coral: '#ff7f50',
  tomato: '#ff6347',
  crimson: '#dc143c',
  salmon: '#fa8072',
  gold: '#ffd700',
  khaki: '#f0e68c',
  indigo: '#4b0082',
  violet: '#ee82ee',
  plum: '#dda0dd',
  orchid: '#da70d6',
  rebeccapurple: '#663399',
  cornflowerblue: '#6495ed',
  royalblue: '#4169e1',
  dodgerblue: '#1e90ff',
  deepskyblue: '#00bfff',
  steelblue: '#4682b4',
  midnightblue: '#191970',
  slategray: '#708090',
  darkslategray: '#2f4f4f',
  turquoise: '#40e0d0',
  aquamarine: '#7fffd4',
  mintcream: '#f5fffa',
  seagreen: '#2e8b57',
  forestgreen: '#228b22',
  ivory: '#fffff0',
  linen: '#faf0e6',
  snow: '#fffafa',
  wheat: '#f5deb3',
  chocolate: '#d2691e',
  sienna: '#a0522d',
  hotpink: '#ff69b4',
  deeppink: '#ff1493',
}

let triggerGeneration = 0
let destroyed = false

function getPlugin() {
  return globalThis.plugin
}

function getClipboard() {
  return globalThis.clipboard
}

function getPermission() {
  return globalThis.permission
}

function getLogger() {
  return globalThis.logger
}

function getBuilder() {
  return globalThis.TuffItemBuilder
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? query?.query ?? ''
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatNumber(value, digits = 3) {
  const rounded = round(value, digits)
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function srgbChannelToLinear(channel255) {
  const c = clamp(channel255 / 255, 0, 1)
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgbChannel(linear) {
  const c = clamp(linear, 0, 1)
  const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055
  return Math.round(clamp(srgb, 0, 1) * 255)
}

function rgbToHex(r, g, b, a = 1) {
  const toByte = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase()
  const base = `#${toByte(r)}${toByte(g)}${toByte(b)}`
  if (a < 0.999) {
    return `${base}${toByte(a * 255)}`
  }
  return base
}

function rgbToHsl(r, g, b) {
  const rn = clamp(r / 255, 0, 1)
  const gn = clamp(g / 255, 0, 1)
  const bn = clamp(b / 255, 0, 1)
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (delta > 1e-7) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === rn) {
      h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60
    }
    else if (max === gn) {
      h = ((bn - rn) / delta + 2) * 60
    }
    else {
      h = ((rn - gn) / delta + 4) * 60
    }
  }

  return {
    h: round((h + 360) % 360, 1),
    s: round(s * 100, 1),
    l: round(l * 100, 1),
  }
}

function hslToRgb(h, s, l) {
  const hn = ((h % 360) + 360) % 360
  const sn = clamp(s / 100, 0, 1)
  const ln = clamp(l / 100, 0, 1)
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = ln - c / 2
  let rn = 0
  let gn = 0
  let bn = 0

  if (hn < 60) {
    rn = c; gn = x
  }
  else if (hn < 120) {
    rn = x; gn = c
  }
  else if (hn < 180) {
    gn = c; bn = x
  }
  else if (hn < 240) {
    gn = x; bn = c
  }
  else if (hn < 300) {
    rn = x; bn = c
  }
  else {
    rn = c; bn = x
  }

  return {
    r: Math.round(clamp((rn + m) * 255, 0, 255)),
    g: Math.round(clamp((gn + m) * 255, 0, 255)),
    b: Math.round(clamp((bn + m) * 255, 0, 255)),
  }
}

function rgbToOklab(r, g, b) {
  const lr = srgbChannelToLinear(r)
  const lg = srgbChannelToLinear(g)
  const lb = srgbChannelToLinear(b)

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)

  return {
    L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  }
}

function oklabToOklch(lab) {
  const C = Math.hypot(lab.a, lab.b)
  let H = C < 1e-6 ? 0 : (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  if (H < 0)
    H += 360
  return {
    L: clamp(lab.L, 0, 1),
    C: Math.max(0, C),
    H: ((H % 360) + 360) % 360,
  }
}

function rgbToOklch(r, g, b) {
  return oklabToOklch(rgbToOklab(r, g, b))
}

function oklchToLinearRgbRaw(L, C, H) {
  const rad = (H * Math.PI) / 180
  const a = C * Math.cos(rad)
  const bk = C * Math.sin(rad)

  const lRoot = L + 0.3963377774 * a + 0.2158037573 * bk
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * bk
  const sRoot = L - 0.0894841775 * a - 1.291485548 * bk

  const l = lRoot * lRoot * lRoot
  const m = mRoot * mRoot * mRoot
  const s = sRoot * sRoot * sRoot

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

function isInLinearSrgbGamut(lin) {
  const eps = 1e-6
  return lin.r >= -eps && lin.r <= 1 + eps
    && lin.g >= -eps && lin.g <= 1 + eps
    && lin.b >= -eps && lin.b <= 1 + eps
}

function oklchToRgb(L, C, H) {
  const clampedL = clamp(L, 0, 1)
  const clampedC = Math.max(0, C)
  const normH = ((H % 360) + 360) % 360

  let lin = oklchToLinearRgbRaw(clampedL, clampedC, normH)
  if (!isInLinearSrgbGamut(lin) && clampedC > 0) {
    let low = 0
    let high = clampedC
    for (let i = 0; i < 20; i += 1) {
      const mid = (low + high) / 2
      const probe = oklchToLinearRgbRaw(clampedL, mid, normH)
      if (isInLinearSrgbGamut(probe)) {
        low = mid
      }
      else {
        high = mid
      }
    }
    lin = oklchToLinearRgbRaw(clampedL, low, normH)
  }

  return {
    r: linearToSrgbChannel(lin.r),
    g: linearToSrgbChannel(lin.g),
    b: linearToSrgbChannel(lin.b),
  }
}

function oklabDistance(labA, labB) {
  const dL = labA.L - labB.L
  const da = labA.a - labB.a
  const db = labA.b - labB.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

function relativeLuminance(color) {
  const r = srgbChannelToLinear(color.r)
  const g = srgbChannelToLinear(color.g)
  const b = srgbChannelToLinear(color.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function compositeOver(fg, bg) {
  const alpha = clamp(fg.a ?? 1, 0, 1)
  if (alpha >= 0.999)
    return { r: fg.r, g: fg.g, b: fg.b, a: 1 }
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1,
  }
}

function contrastRatio(fg, bg) {
  const effectiveFg = compositeOver(fg, bg)
  const l1 = relativeLuminance(effectiveFg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function evaluateWcag(ratio) {
  const aaNormal = ratio >= 4.5
  const aaaNormal = ratio >= 7.0
  const aaLarge = ratio >= 3.0
  const aaaLarge = ratio >= 4.5
  const uiComponents = ratio >= 3.0
  const badge = aaaNormal ? 'AAA' : aaNormal ? 'AA' : aaLarge ? 'AA Large' : 'Fail'
  return {
    ratio: round(ratio, 2),
    aaNormal,
    aaaNormal,
    aaLarge,
    aaaLarge,
    uiComponents,
    badge,
  }
}

function suggestAccessibleColor(fg, bg, targetRatio) {
  const fgOklch = rgbToOklch(fg.r, fg.g, fg.b)
  const fgLab = rgbToOklab(fg.r, fg.g, fg.b)
  const candidates = []

  // Search darker direction [0 .. fgOklch.L]
  const darkProbe = oklchToRgb(0, 0, fgOklch.H)
  if (contrastRatio(darkProbe, bg) >= targetRatio) {
    let low = 0
    let high = fgOklch.L
    let best = darkProbe
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2
      const rgb = oklchToRgb(mid, fgOklch.C, fgOklch.H)
      if (contrastRatio(rgb, bg) >= targetRatio) {
        best = rgb
        low = mid
      }
      else {
        high = mid
      }
    }
    candidates.push({
      ...best,
      a: 1,
      ratio: contrastRatio(best, bg),
      delta: oklabDistance(fgLab, rgbToOklab(best.r, best.g, best.b)),
    })
  }

  // Search lighter direction [fgOklch.L .. 1]
  const lightProbe = oklchToRgb(1, 0, fgOklch.H)
  if (contrastRatio(lightProbe, bg) >= targetRatio) {
    let low = fgOklch.L
    let high = 1
    let best = lightProbe
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2
      const rgb = oklchToRgb(mid, fgOklch.C, fgOklch.H)
      if (contrastRatio(rgb, bg) >= targetRatio) {
        best = rgb
        high = mid
      }
      else {
        low = mid
      }
    }
    candidates.push({
      ...best,
      a: 1,
      ratio: contrastRatio(best, bg),
      delta: oklabDistance(fgLab, rgbToOklab(best.r, best.g, best.b)),
    })
  }

  if (!candidates.length)
    return null
  candidates.sort((a, b) => a.delta - b.delta)
  return candidates[0]
}

function buildTailwindCatalog() {
  const tokens = []
  const byName = new Map()

  const special = [
    { name: 'white', family: 'base', shade: 0, oklch: [1, 0, 0] },
    { name: 'black', family: 'base', shade: 1000, oklch: [0, 0, 0] },
  ]
  for (const item of special) {
    const [L, C, H] = item.oklch
    const rgb = oklchToRgb(L, C, H)
    const entry = {
      name: item.name,
      family: item.family,
      shade: item.shade,
      oklch: { L, C, H },
      lab: { L, a: 0, b: 0 },
      rgb,
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    }
    tokens.push(entry)
    byName.set(entry.name, entry)
  }

  for (const [family, shades] of Object.entries(TAILWIND_V4_FAMILIES)) {
    shades.forEach((tuple, idx) => {
      const shade = SHADES[idx]
      const [L, C, H] = tuple
      const rgb = oklchToRgb(L, C, H)
      const rad = (H * Math.PI) / 180
      const entry = {
        name: `${family}-${shade}`,
        family,
        shade,
        oklch: { L, C, H },
        lab: { L, a: C * Math.cos(rad), b: C * Math.sin(rad) },
        rgb,
        hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      }
      tokens.push(entry)
      byName.set(entry.name, entry)
    })
  }

  return { tokens, byName }
}

const TAILWIND_CATALOG = buildTailwindCatalog()

function findNearestTailwindTokens(color, limit = 3) {
  const targetLab = rgbToOklab(color.r, color.g, color.b)
  return TAILWIND_CATALOG.tokens
    .map(token => ({
      token,
      distance: oklabDistance(targetLab, token.lab),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
}

function parseAlpha(raw) {
  if (raw === undefined || raw === null || raw === '')
    return 1
  const text = String(raw).trim()
  if (text.endsWith('%')) {
    const pct = Number.parseFloat(text.slice(0, -1))
    return Number.isFinite(pct) ? clamp(pct / 100, 0, 1) : NaN
  }
  const num = Number.parseFloat(text)
  return Number.isFinite(num) ? clamp(num, 0, 1) : NaN
}

function parseAngle(raw) {
  const text = String(raw).trim().toLowerCase()
  if (text.endsWith('deg'))
    return Number.parseFloat(text.slice(0, -3))
  if (text.endsWith('turn'))
    return Number.parseFloat(text.slice(0, -4)) * 360
  if (text.endsWith('rad'))
    return (Number.parseFloat(text.slice(0, -3)) * 180) / Math.PI
  if (text.endsWith('grad'))
    return Number.parseFloat(text.slice(0, -4)) * 0.9
  return Number.parseFloat(text)
}

function parseHexColor(text) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)
  if (!match)
    return null
  const hex = match[1]
  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(hex[0] + hex[0], 16)
    const g = Number.parseInt(hex[1] + hex[1], 16)
    const b = Number.parseInt(hex[2] + hex[2], 16)
    const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1
    return { r, g, b, a: round(a, 4), source: 'hex' }
  }
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
  return { r, g, b, a: round(a, 4), source: 'hex' }
}

function parseRgbColor(text) {
  const match = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(text)
  if (!match)
    return null
  const body = match[1].trim()
  let rgbPart = body
  let alphaRaw
  if (body.includes('/')) {
    const [left, right] = body.split('/')
    rgbPart = left.trim()
    alphaRaw = right.trim()
  }
  const parts = rgbPart.includes(',')
    ? rgbPart.split(',').map(p => p.trim()).filter(Boolean)
    : rgbPart.split(/\s+/).filter(Boolean)
  if (parts.length === 4 && alphaRaw === undefined) {
    alphaRaw = parts.pop()
  }
  if (parts.length !== 3)
    return null

  const channels = parts.map((part) => {
    if (part.endsWith('%')) {
      const pct = Number.parseFloat(part.slice(0, -1))
      return Number.isFinite(pct) ? clamp(Math.round((pct / 100) * 255), 0, 255) : NaN
    }
    const num = Number.parseFloat(part)
    return Number.isFinite(num) ? clamp(Math.round(num), 0, 255) : NaN
  })
  const a = parseAlpha(alphaRaw)
  if (channels.some(Number.isNaN) || Number.isNaN(a))
    return null
  return { r: channels[0], g: channels[1], b: channels[2], a: round(a, 4), source: 'rgb' }
}

function parseHslColor(text) {
  const match = /^hsla?\(\s*([^)]+)\s*\)$/i.exec(text)
  if (!match)
    return null
  const body = match[1].trim()
  let hslPart = body
  let alphaRaw
  if (body.includes('/')) {
    const [left, right] = body.split('/')
    hslPart = left.trim()
    alphaRaw = right.trim()
  }
  const parts = hslPart.includes(',')
    ? hslPart.split(',').map(p => p.trim()).filter(Boolean)
    : hslPart.split(/\s+/).filter(Boolean)
  if (parts.length === 4 && alphaRaw === undefined) {
    alphaRaw = parts.pop()
  }
  if (parts.length !== 3)
    return null

  const h = parseAngle(parts[0])
  const s = Number.parseFloat(parts[1].replace(/%$/, ''))
  const l = Number.parseFloat(parts[2].replace(/%$/, ''))
  const a = parseAlpha(alphaRaw)
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l) || Number.isNaN(a))
    return null
  const rgb = hslToRgb(h, s, l)
  return { ...rgb, a: round(a, 4), source: 'hsl' }
}

function parseOklchColor(text) {
  const match = /^oklch\(\s*([^)]+)\s*\)$/i.exec(text)
  if (!match)
    return null
  const body = match[1].trim()
  let lchPart = body
  let alphaRaw
  if (body.includes('/')) {
    const [left, right] = body.split('/')
    lchPart = left.trim()
    alphaRaw = right.trim()
  }
  const parts = lchPart.includes(',')
    ? lchPart.split(',').map(p => p.trim()).filter(Boolean)
    : lchPart.split(/\s+/).filter(Boolean)
  if (parts.length !== 3)
    return null

  const rawL = parts[0]
  const L = rawL.endsWith('%') ? Number.parseFloat(rawL.slice(0, -1)) / 100 : Number.parseFloat(rawL)
  const rawC = parts[1]
  const C = rawC.endsWith('%') ? (Number.parseFloat(rawC.slice(0, -1)) / 100) * 0.4 : Number.parseFloat(rawC)
  const H = parseAngle(parts[2])
  const a = parseAlpha(alphaRaw)
  if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(H) || Number.isNaN(a))
    return null

  const rgb = oklchToRgb(L, C, H)
  return {
    ...rgb,
    a: round(a, 4),
    source: 'oklch',
    exactOklch: { L: clamp(L, 0, 1), C: Math.max(0, C), H: ((H % 360) + 360) % 360 },
  }
}

function parseTailwindToken(text) {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/^(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|accent|caret)-/, '')
  let tokenName = cleaned
  let alpha = 1
  if (cleaned.includes('/')) {
    const [namePart, opacityPart] = cleaned.split('/')
    tokenName = namePart
    const opacityNum = Number.parseFloat(opacityPart)
    if (!Number.isFinite(opacityNum) || opacityNum < 0 || opacityNum > 100)
      return null
    alpha = round(opacityNum / 100, 4)
  }

  const entry = TAILWIND_CATALOG.byName.get(tokenName)
  if (!entry)
    return null
  return {
    r: entry.rgb.r,
    g: entry.rgb.g,
    b: entry.rgb.b,
    a: alpha,
    source: 'tailwind',
    tailwindToken: entry,
    exactOklch: entry.oklch,
  }
}

function parseColor(raw) {
  const text = normalizeText(raw)
  if (!text)
    return null

  const fromHex = parseHexColor(text)
  if (fromHex)
    return fromHex

  // Support bare 6-char hex when explicitly hex-like only if prefixed with # or handled by callers
  const fromRgb = parseRgbColor(text)
  if (fromRgb)
    return fromRgb

  const fromHsl = parseHslColor(text)
  if (fromHsl)
    return fromHsl

  const fromOklch = parseOklchColor(text)
  if (fromOklch)
    return fromOklch

  const fromTw = parseTailwindToken(text)
  if (fromTw)
    return fromTw

  const namedHex = CSS_NAMED_COLORS[text.toLowerCase()]
  if (namedHex) {
    const parsed = parseHexColor(namedHex)
    if (parsed)
      return { ...parsed, source: 'named', namedColor: text.toLowerCase() }
  }

  return null
}

function formatColorSpaces(color) {
  const hex = rgbToHex(color.r, color.g, color.b, color.a)
  const hexOpaque = rgbToHex(color.r, color.g, color.b, 1)
  const hasAlpha = (color.a ?? 1) < 0.999
  const rgb = hasAlpha
    ? `rgba(${color.r}, ${color.g}, ${color.b}, ${formatNumber(color.a, 3)})`
    : `rgb(${color.r}, ${color.g}, ${color.b})`
  const rgba = `rgba(${color.r}, ${color.g}, ${color.b}, ${formatNumber(color.a ?? 1, 3)})`
  const hslObj = rgbToHsl(color.r, color.g, color.b)
  const hsl = hasAlpha
    ? `hsla(${formatNumber(hslObj.h, 1)}, ${formatNumber(hslObj.s, 1)}%, ${formatNumber(hslObj.l, 1)}%, ${formatNumber(color.a, 3)})`
    : `hsl(${formatNumber(hslObj.h, 1)}, ${formatNumber(hslObj.s, 1)}%, ${formatNumber(hslObj.l, 1)}%)`
  const oklchObj = color.exactOklch || rgbToOklch(color.r, color.g, color.b)
  const oklch = hasAlpha
    ? `oklch(${formatNumber(oklchObj.L, 4)} ${formatNumber(oklchObj.C, 4)} ${formatNumber(oklchObj.H, 2)} / ${formatNumber(color.a, 3)})`
    : `oklch(${formatNumber(oklchObj.L, 4)} ${formatNumber(oklchObj.C, 4)} ${formatNumber(oklchObj.H, 2)})`

  return {
    hex,
    hexOpaque,
    rgb,
    rgba,
    hsl,
    hslObj,
    oklch,
    oklchObj,
  }
}

function shiftHueColor(color, deltaDeg) {
  const lch = rgbToOklch(color.r, color.g, color.b)
  const nextHue = (lch.H + deltaDeg + 360) % 360
  const rgb = oklchToRgb(lch.L, lch.C, nextHue)
  return { ...rgb, a: 1 }
}

function buildTintShadeRamp(color) {
  const lch = rgbToOklch(color.r, color.g, color.b)
  const stops = [
    { step: 100, L: 0.94, cScale: 0.28 },
    { step: 300, L: 0.81, cScale: 0.65 },
    { step: 500, L: clamp(lch.L, 0.45, 0.72), cScale: 1.0 },
    { step: 700, L: 0.47, cScale: 0.88 },
    { step: 900, L: 0.30, cScale: 0.62 },
  ]
  return stops.map((stop) => {
    const rgb = oklchToRgb(stop.L, lch.C * stop.cScale, lch.H)
    return {
      step: stop.step,
      rgb,
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    }
  })
}

function tokenizeColorArguments(text) {
  const tokens = []
  let current = ''
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') {
      depth += 1
      current += ch
      continue
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      current += ch
      continue
    }
    if (depth === 0 && /\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current)
    tokens.push(current)
  return tokens
}

function stripCommandPrefix(rawQuery) {
  const normalized = normalizeText(rawQuery).replace(/\s+/g, ' ')
  if (!normalized)
    return { mode: 'auto', rest: '' }

  const lower = normalized.toLowerCase()
  for (const prefix of COMMAND_PREFIXES) {
    const candidate = prefix.toLowerCase()
    if (lower === candidate) {
      return { mode: candidate, rest: '' }
    }
    if (lower.startsWith(`${candidate} `) || lower.startsWith(`${candidate}:`)) {
      const offset = prefix.length + (lower.startsWith(`${candidate}:`) ? 1 : 0)
      return { mode: candidate, rest: normalized.slice(offset).trim() }
    }
  }
  return { mode: 'auto', rest: normalized }
}

function parseColorPair(text) {
  const cleaned = normalizeText(text)
    .replace(/\s+(?:vs\.?|on|over|against|with|and|,|\/)\s+/gi, ' ')
    .trim()
  const tokens = tokenizeColorArguments(cleaned)
  if (tokens.length < 2)
    return null
  const first = parseColor(tokens[0])
  const second = parseColor(tokens[1])
  if (!first || !second)
    return null
  return { fg: first, bg: second }
}

function buildInfoItem({ id, featureId, title, subtitle }) {
  const Builder = getBuilder()
  return new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildActionItem({ id, featureId, title, subtitle, actions }) {
  const Builder = getBuilder()
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_GROUP,
    })

  for (const action of actions) {
    builder.createAndAddAction(action.id, 'plugin', action.title, action.payload)
  }
  return builder.build()
}

function buildContrastItems(featureId, fg, bg) {
  const fgFmt = formatColorSpaces(fg)
  const bgFmt = formatColorSpaces(bg)
  const ratio = contrastRatio(fg, bg)
  const wcag = evaluateWcag(ratio)
  const items = []

  const report = [
    `WCAG 2.1 Contrast: ${wcag.ratio}:1 (${wcag.badge})`,
    `Foreground: ${fgFmt.hex} | Background: ${bgFmt.hex}`,
    `Normal Text: AA ${wcag.aaNormal ? 'PASS' : 'FAIL'} (>=4.5) · AAA ${wcag.aaaNormal ? 'PASS' : 'FAIL'} (>=7.0)`,
    `Large Text / UI: AA ${wcag.aaLarge ? 'PASS' : 'FAIL'} (>=3.0) · AAA ${wcag.aaaLarge ? 'PASS' : 'FAIL'} (>=4.5)`,
  ].join('\n')

  items.push(buildActionItem({
    id: `${featureId}-contrast-summary`,
    featureId,
    title: `WCAG ${wcag.ratio}:1 · ${wcag.badge} (${fgFmt.hex} on ${bgFmt.hex})`,
    subtitle: `Normal AA ${wcag.aaNormal ? '✓' : '✗'} · AAA ${wcag.aaaNormal ? '✓' : '✗'} · Large/UI AA ${wcag.aaLarge ? '✓' : '✗'}`,
    actions: [
      { id: 'copy-report', title: '复制对比度报告', payload: { text: report } },
      { id: 'copy-css', title: '复制 CSS 配色', payload: { text: `color: ${fgFmt.hex};\nbackground-color: ${bgFmt.hex};` } },
    ],
  }))

  if (!wcag.aaNormal) {
    const aaFix = suggestAccessibleColor(fg, bg, 4.5)
    if (aaFix) {
      const fixHex = rgbToHex(aaFix.r, aaFix.g, aaFix.b)
      const fixFmt = formatColorSpaces(aaFix)
      items.push(buildActionItem({
        id: `${featureId}-contrast-suggest-aa`,
        featureId,
        title: `无障碍建议 (AA 4.5+): ${fixHex} (${round(aaFix.ratio, 2)}:1)`,
        subtitle: `保留同色相微调明度 · ${fixFmt.oklch}`,
        actions: [
          { id: 'copy', title: '复制 HEX', payload: { text: fixHex } },
          { id: 'copy-oklch', title: '复制 OKLCH', payload: { text: fixFmt.oklch } },
          { id: 'copy-css', title: '复制 CSS', payload: { text: `color: ${fixHex};\nbackground-color: ${bgFmt.hex};` } },
        ],
      }))
    }
  }

  if (!wcag.aaaNormal) {
    const aaaFix = suggestAccessibleColor(fg, bg, 7.0)
    if (aaaFix) {
      const fixHex = rgbToHex(aaaFix.r, aaaFix.g, aaaFix.b)
      const fixFmt = formatColorSpaces(aaaFix)
      items.push(buildActionItem({
        id: `${featureId}-contrast-suggest-aaa`,
        featureId,
        title: `无障碍建议 (AAA 7.0+): ${fixHex} (${round(aaaFix.ratio, 2)}:1)`,
        subtitle: `高对比度同色相建议 · ${fixFmt.oklch}`,
        actions: [
          { id: 'copy', title: '复制 HEX', payload: { text: fixHex } },
          { id: 'copy-oklch', title: '复制 OKLCH', payload: { text: fixFmt.oklch } },
        ],
      }))
    }
  }

  // Always offer best white / dark ink comparison on background
  const white = { r: 255, g: 255, b: 255, a: 1 }
  const slate950 = { r: 2, g: 6, b: 23, a: 1 }
  const whiteRatio = round(contrastRatio(white, bg), 2)
  const darkRatio = round(contrastRatio(slate950, bg), 2)
  const bestInk = whiteRatio >= darkRatio ? '#FFFFFF' : '#020617'
  items.push(buildActionItem({
    id: `${featureId}-contrast-best-ink`,
    featureId,
    title: `背景 ${bgFmt.hex} 推荐文字色: ${bestInk}`,
    subtitle: `白字 #FFFFFF (${whiteRatio}:1) · 深墨 #020617 (${darkRatio}:1)`,
    actions: [
      { id: 'copy', title: '复制推荐文字色', payload: { text: bestInk } },
      { id: 'copy-css', title: '复制 CSS 规则', payload: { text: `color: ${bestInk};\nbackground-color: ${bgFmt.hex};` } },
    ],
  }))

  return items
}

function buildTailwindFamilyItems(featureId, familyName) {
  const family = familyName.toLowerCase()
  const shades = TAILWIND_V4_FAMILIES[family]
  if (!shades)
    return []

  const entries = SHADES.map((shade) => TAILWIND_CATALOG.byName.get(`${family}-${shade}`)).filter(Boolean)
  const cssVars = entries.map(entry => `  --color-${entry.name}: ${entry.hex};`).join('\n')
  const items = [
    buildActionItem({
      id: `${featureId}-tw-family-vars`,
      featureId,
      title: `Tailwind v4 ${family} 全阶梯 (50–950)`,
      subtitle: `${entries[0].hex} → ${entries[5].hex} → ${entries[entries.length - 1].hex} · 复制 CSS 变量`,
      actions: [
        { id: 'copy-css', title: '复制 CSS 变量块', payload: { text: `:root {\n${cssVars}\n}` } },
        { id: 'copy-hex-list', title: '复制 HEX 列表', payload: { text: entries.map(e => `${e.name}: ${e.hex}`).join('\n') } },
      ],
    }),
  ]

  for (const entry of entries) {
    const oklchStr = `oklch(${formatNumber(entry.oklch.L, 4)} ${formatNumber(entry.oklch.C, 4)} ${formatNumber(entry.oklch.H, 3)})`
    items.push(buildActionItem({
      id: `${featureId}-tw-${entry.name}`,
      featureId,
      title: `${entry.name}  ${entry.hex}`,
      subtitle: `${oklchStr} · rgb(${entry.rgb.r}, ${entry.rgb.g}, ${entry.rgb.b})`,
      actions: [
        { id: 'copy', title: '复制 HEX', payload: { text: entry.hex } },
        { id: 'copy-token', title: '复制 Token 名', payload: { text: entry.name } },
        { id: 'copy-oklch', title: '复制 OKLCH', payload: { text: oklchStr } },
      ],
    }))
  }
  return items
}

function buildSingleColorItems(featureId, color) {
  const fmt = formatColorSpaces(color)
  const nearest = findNearestTailwindTokens(color, 3)
  const bestTw = nearest[0]
  const white = { r: 255, g: 255, b: 255, a: 1 }
  const black = { r: 0, g: 0, b: 0, a: 1 }
  const onWhite = evaluateWcag(contrastRatio(color, white))
  const onBlack = evaluateWcag(contrastRatio(color, black))
  const bestInk = onWhite.ratio >= onBlack.ratio ? '#FFFFFF' : '#000000'
  const bestInkRatio = Math.max(onWhite.ratio, onBlack.ratio)

  const comp = shiftHueColor(color, 180)
  const tri1 = shiftHueColor(color, 120)
  const tri2 = shiftHueColor(color, 240)
  const ana1 = shiftHueColor(color, -30)
  const ana2 = shiftHueColor(color, 30)
  const compHex = rgbToHex(comp.r, comp.g, comp.b)
  const triHexes = [fmt.hexOpaque, rgbToHex(tri1.r, tri1.g, tri1.b), rgbToHex(tri2.r, tri2.g, tri2.b)]
  const anaHexes = [rgbToHex(ana1.r, ana1.g, ana1.b), fmt.hexOpaque, rgbToHex(ana2.r, ana2.g, ana2.b)]
  const ramp = buildTintShadeRamp(color)
  const rampCss = `:root {\n${ramp.map(s => `  --color-${s.step}: ${s.hex};`).join('\n')}\n}`

  const gradientSmooth = `linear-gradient(135deg, ${anaHexes[0]} 0%, ${fmt.hexOpaque} 50%, ${anaHexes[2]} 100%)`
  const gradientDuo = `linear-gradient(135deg, ${fmt.hexOpaque} 0%, ${compHex} 100%)`

  const items = [
    buildActionItem({
      id: `${featureId}-hex`,
      featureId,
      title: `HEX  ${fmt.hex}`,
      subtitle: color.tailwindToken
        ? `Tailwind v4 ${color.tailwindToken.name} · 点击复制 HEX`
        : `RGB(${color.r}, ${color.g}, ${color.b}) · 最佳文字对比 ${bestInk} (${bestInkRatio}:1)`,
      actions: [
        { id: 'copy', title: '复制 HEX', payload: { text: fmt.hex } },
        { id: 'copy-css', title: '复制 CSS 变量', payload: { text: `--color-brand: ${fmt.hex};` } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-rgb`,
      featureId,
      title: `RGB  ${fmt.rgb}`,
      subtitle: `RGBA: ${fmt.rgba}`,
      actions: [
        { id: 'copy', title: '复制 RGB', payload: { text: fmt.rgb } },
        { id: 'copy-rgba', title: '复制 RGBA', payload: { text: fmt.rgba } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-hsl`,
      featureId,
      title: `HSL  ${fmt.hsl}`,
      subtitle: `色相 ${fmt.hslObj.h}° · 饱和度 ${fmt.hslObj.s}% · 亮度 ${fmt.hslObj.l}%`,
      actions: [
        { id: 'copy', title: '复制 HSL', payload: { text: fmt.hsl } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-oklch`,
      featureId,
      title: `OKLCH  ${fmt.oklch}`,
      subtitle: `感知均匀色彩空间 · L=${formatNumber(fmt.oklchObj.L, 3)} C=${formatNumber(fmt.oklchObj.C, 3)} H=${formatNumber(fmt.oklchObj.H, 1)}°`,
      actions: [
        { id: 'copy', title: '复制 OKLCH', payload: { text: fmt.oklch } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-wcag-quick`,
      featureId,
      title: `WCAG 2.1 对比度 · 白底 ${onWhite.ratio}:1 (${onWhite.badge}) · 黑底 ${onBlack.ratio}:1 (${onBlack.badge})`,
      subtitle: `推荐搭配文字色 ${bestInk} (${bestInkRatio}:1) · 输入 "contrast ${fmt.hexOpaque} #fff" 查看详细建议`,
      actions: [
        { id: 'copy', title: '复制推荐文字色', payload: { text: bestInk } },
        {
          id: 'copy-report',
          title: '复制对比度摘要',
          payload: {
            text: `${fmt.hexOpaque} on #FFFFFF = ${onWhite.ratio}:1 (${onWhite.badge}) | on #000000 = ${onBlack.ratio}:1 (${onBlack.badge})`,
          },
        },
      ],
    }),
  ]

  if (bestTw) {
    const altSummary = nearest.slice(1).map(n => `${n.token.name} (${n.token.hex})`).join(' · ')
    items.push(buildActionItem({
      id: `${featureId}-tailwind-match`,
      featureId,
      title: `Tailwind v4 最近色: ${bestTw.token.name} (${bestTw.token.hex})`,
      subtitle: `OKLab ΔE=${formatNumber(bestTw.distance, 4)} · 备选: ${altSummary}`,
      actions: [
        { id: 'copy-token', title: '复制 Token 名', payload: { text: bestTw.token.name } },
        { id: 'copy-class', title: '复制 bg- 类名', payload: { text: `bg-${bestTw.token.name}` } },
        { id: 'copy-hex', title: '复制 Token HEX', payload: { text: bestTw.token.hex } },
      ],
    }))
  }

  items.push(
    buildActionItem({
      id: `${featureId}-harmony-comp`,
      featureId,
      title: `互补色 (Complementary): ${compHex}`,
      subtitle: `色相 +180° · 搭配主色 ${fmt.hexOpaque}`,
      actions: [
        { id: 'copy', title: '复制互补色 HEX', payload: { text: compHex } },
        { id: 'copy-gradient', title: '复制双色渐变', payload: { text: gradientDuo } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-harmony-triadic`,
      featureId,
      title: `三元色板 (Triadic): ${triHexes.join(' · ')}`,
      subtitle: '色相间隔 120° 均衡配色',
      actions: [
        { id: 'copy', title: '复制三元色板', payload: { text: triHexes.join(', ') } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-harmony-analogous`,
      featureId,
      title: `邻近色板 (Analogous): ${anaHexes.join(' · ')}`,
      subtitle: '色相 -30° / 0° / +30° 自然过渡',
      actions: [
        { id: 'copy', title: '复制邻近色板', payload: { text: anaHexes.join(', ') } },
        { id: 'copy-gradient', title: '复制渐变 CSS', payload: { text: gradientSmooth } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-tint-shade`,
      featureId,
      title: `明暗阶梯 (100–900): ${ramp.map(s => s.hex).join(' · ')}`,
      subtitle: 'OKLCH 同色相明度阶梯 · 点击复制 CSS 变量块',
      actions: [
        { id: 'copy-css', title: '复制 CSS 变量块', payload: { text: rampCss } },
        { id: 'copy-hex', title: '复制 HEX 列表', payload: { text: ramp.map(s => `${s.step}: ${s.hex}`).join('\n') } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-gradient-css`,
      featureId,
      title: 'CSS 渐变 (Analogous 3-Stop)',
      subtitle: gradientSmooth,
      actions: [
        { id: 'copy', title: '复制 CSS 渐变', payload: { text: `background: ${gradientSmooth};` } },
        { id: 'copy-duotone', title: '复制互补双色渐变', payload: { text: `background: ${gradientDuo};` } },
      ],
    }),
  )

  return items
}

function buildStarterItems(featureId) {
  const presets = [
    { label: 'Tailwind v4 Blue 500', hex: '#2B7FFF', note: '现代品牌主蓝 · blue-500' },
    { label: 'Emerald 500', hex: '#00BC7D', note: '成功与正向状态 · emerald-500' },
    { label: 'Rose 500', hex: '#FF2056', note: '高辨识警示红 · rose-500' },
    { label: 'Slate 950', hex: '#020618', note: '深色模式表面基底 · slate-950' },
  ]
  return [
    buildInfoItem({
      id: `${featureId}-guide`,
      featureId,
      title: '输入颜色、Tailwind Token 或对比度组合',
      subtitle: '示例: #3b82f6 · oklch(0.623 0.214 259.8) · blue-500 · contrast #111 #fff · tailwind indigo',
    }),
    ...presets.map((preset, idx) => {
      const parsed = parseColor(preset.hex)
      const fmt = formatColorSpaces(parsed)
      return buildActionItem({
        id: `${featureId}-starter-${idx}`,
        featureId,
        title: `${preset.label}  ${preset.hex}`,
        subtitle: `${preset.note} · ${fmt.oklch}`,
        actions: [
          { id: 'copy', title: '复制 HEX', payload: { text: preset.hex } },
          { id: 'copy-oklch', title: '复制 OKLCH', payload: { text: fmt.oklch } },
        ],
      })
    }),
  ]
}

function buildResultItems(featureId, query) {
  const { mode, rest } = stripCommandPrefix(getQueryText(query))

  if (!rest) {
    if (mode === 'tailwind' || mode === 'tw') {
      return buildTailwindFamilyItems(featureId, 'blue')
    }
    return buildStarterItems(featureId)
  }

  // Explicit Tailwind family browse: "tailwind blue" / "tw emerald" / "indigo"
  const familyKey = rest.toLowerCase()
  if ((mode === 'tailwind' || mode === 'tw' || mode === 'palette' || mode === '调色板') && TAILWIND_V4_FAMILIES[familyKey]) {
    return buildTailwindFamilyItems(featureId, familyKey)
  }

  // Contrast pair mode (explicit or implicit two colors)
  const pair = parseColorPair(rest)
  if (pair) {
    return buildContrastItems(featureId, pair.fg, pair.bg)
  }

  // Bare 6-digit hex convenience when user typed "hex 3b82f6" or "color 3b82f6"
  const hexCandidate = /^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(rest)
    ? `#${rest}`
    : rest
  const single = parseColor(hexCandidate)
  if (single) {
    return buildSingleColorItems(featureId, single)
  }

  // Bare Tailwind family name without prefix (e.g. "emerald", "slate")
  if (TAILWIND_V4_FAMILIES[familyKey]) {
    return buildTailwindFamilyItems(featureId, familyKey)
  }

  return [
    buildInfoItem({
      id: `${featureId}-unparsed`,
      featureId,
      title: '未能识别颜色格式',
      subtitle: '支持 #RRGGBB、rgb(...)、hsl(...)、oklch(...)、blue-500、contrast #111 #fff',
    }),
  ]
}

function blocked(reason, message, status = 'blocked') {
  return {
    externalAction: true,
    success: false,
    status,
    reason,
    message,
  }
}

async function checkPermission(permissionId) {
  const perm = getPermission()
  if (typeof perm?.check !== 'function') {
    return { granted: false, reason: 'permission-sdk-unavailable' }
  }
  try {
    const granted = await perm.check(permissionId)
    if (granted === true) {
      return { granted: true, reason: '' }
    }
    return { granted: false, reason: 'permission-denied' }
  }
  catch (error) {
    const code = error?.code
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return { granted: false, reason: 'permission-denied' }
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return { granted: false, reason: 'permission-unavailable' }
    }
    return { granted: false, reason: 'permission-check-failed' }
  }
}

async function writeClipboardText(text) {
  const perm = await checkPermission('clipboard.write')
  if (!perm.granted) {
    const message = perm.reason === 'permission-sdk-unavailable'
      ? '权限 SDK 不可用，已阻止写入剪贴板'
      : perm.reason === 'permission-unavailable'
        ? '权限系统不可用'
        : perm.reason === 'permission-check-failed'
          ? '权限校验失败，已阻止写入剪贴板'
          : '缺少 clipboard.write 权限'
    return blocked(perm.reason, message)
  }

  const clip = getClipboard()
  if (typeof clip?.writeText !== 'function') {
    return blocked('clipboard-unavailable', '当前环境不支持写入剪贴板')
  }

  try {
    await clip.writeText(text)
    return {
      externalAction: true,
      success: true,
      status: 'completed',
      message: '已复制到剪贴板',
    }
  }
  catch (error) {
    getLogger()?.error?.('[touch-color-studio] clipboard write failed')
    const code = error?.code
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return blocked('permission-denied', '缺少 clipboard.write 权限')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return blocked('permission-unavailable', '权限系统不可用')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE') {
      return blocked('capability-unavailable', '剪贴板能力不可用')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED') {
      return blocked('cancelled', '复制操作已取消', 'cancelled')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT') {
      return blocked('timeout', '复制操作超时', 'failed')
    }
    return blocked('clipboard-write-failed', '复制失败', 'failed')
  }
}

async function publishItems(items, generation) {
  const feature = getPlugin()?.feature
  if (!feature || destroyed || generation !== triggerGeneration) {
    return false
  }
  await feature.clearItems()
  if (destroyed || generation !== triggerGeneration) {
    return false
  }
  await feature.pushItems(items)
  return !destroyed && generation === triggerGeneration
}

const pluginLifecycle = {
  async onInit() {
    destroyed = false
  },

  async onFeatureTriggered(featureId = FEATURE_ID, query = '') {
    destroyed = false
    const generation = ++triggerGeneration
    try {
      const items = buildResultItems(featureId, query)
      return await publishItems(items, generation)
    }
    catch {
      getLogger()?.error?.('[touch-color-studio] feature execution failed')
      try {
        return await publishItems([
          buildInfoItem({
            id: `${featureId}-error`,
            featureId,
            title: '色彩工坊运行失败',
            subtitle: '请检查输入格式后重试',
          }),
        ], generation)
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (item?.meta?.defaultAction !== ACTION_GROUP) {
      return undefined
    }
    const actions = Array.isArray(item.actions) ? item.actions : []
    const requestedId = normalizeText(context?.actionId) || actions[0]?.id
    const selected = actions.find(action => action?.id === requestedId)
    if (!selected) {
      return blocked('invalid-action', '无效操作')
    }

    const payloadText = typeof selected.payload === 'string'
      ? selected.payload
      : selected.payload?.text
    if (typeof payloadText !== 'string' || !payloadText) {
      return blocked('invalid-action', '缺少可复制内容')
    }

    return writeClipboardText(payloadText)
  },

  async onDestroy() {
    destroyed = true
    triggerGeneration += 1
  },
}

module.exports = pluginLifecycle

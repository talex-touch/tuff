import { hasDocument, hasWindow } from '../env'

export type ThemeTransitionVariant
  = | 'circle-blur'
    | 'circle'
    | 'circle-blur-top-left'
    | 'polygon'
    | 'polygon-gradient'
    | 'wipe'
    | 'fade'
    | 'gif'

export interface ThemeTransitionOrigin {
  clientX: number
  clientY: number
}

export interface ThemeTransitionOptions {
  /**
   * Animation variant preset.
   * @default 'circle-blur'
   */
  variant?: ThemeTransitionVariant
  /**
   * Pointer event or coordinates [x, y] to originate the transition from.
   * Defaults to viewport center if omitted.
   */
  origin?: [number, number] | ThemeTransitionOrigin | MouseEvent | null
  /**
   * Custom animation duration in milliseconds.
   * Defaults to variant-specific duration (e.g. 450ms for circle-blur).
   */
  duration?: number
  /**
   * Custom CSS animation timing function.
   * Defaults to cubic-bezier(0.16, 1, 0.3, 1) (expo-out).
   */
  easing?: string
  /**
   * Blur amount in pixels for blur-based variants.
   * @default 3.5
   */
  blurAmount?: number
  /**
   * Custom mask URL for 'gif' variant.
   */
  maskUrl?: string
  /**
   * Whether to reverse the reveal direction.
   * @default false
   */
  reverse?: boolean
}

export const THEME_VIEW_TRANSITION_STYLE_ID = 'tuff-theme-view-transition'

const DEFAULT_EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'

function resolveOrigin(
  origin?: [number, number] | ThemeTransitionOrigin | MouseEvent | null,
): [number, number] {
  if (Array.isArray(origin) && origin.length >= 2)
    return [origin[0], origin[1]]

  if (origin && typeof origin === 'object' && 'clientX' in origin && 'clientY' in origin)
    return [origin.clientX, origin.clientY]

  if (hasWindow())
    return [window.innerWidth / 2, window.innerHeight / 2]

  return [0, 0]
}

export function buildCircleBlurCss(
  x: number,
  y: number,
  duration = 450,
  easing = DEFAULT_EXPO_OUT,
  blurAmount = 3.5,
  reverse = false,
): string {
  const innerW = hasWindow() ? window.innerWidth : 1920
  const innerH = hasWindow() ? window.innerHeight : 1080
  const endRadius = Math.hypot(Math.max(x, innerW - x), Math.max(y, innerH - y))
  const diameter = Math.ceil((endRadius / 0.45) * 1.05)

  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><filter id="tuff-circle-blur"><feGaussianBlur stdDeviation="${blurAmount}"/></filter></defs><circle cx="50" cy="50" r="45" fill="white" filter="url(%23tuff-circle-blur)"/></svg>`
  const maskUrl = `url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`

  const fromSize = reverse ? `${diameter}px ${diameter}px` : '0px 0px'
  const toSize = reverse ? '0px 0px' : `${diameter}px ${diameter}px`
  const fromPos = reverse ? `${x - diameter / 2}px ${y - diameter / 2}px` : `${x}px ${y}px`
  const toPos = reverse ? `${x}px ${y}px` : `${x - diameter / 2}px ${y - diameter / 2}px`

  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      -webkit-mask-image: ${maskUrl} !important;
      mask-image: ${maskUrl} !important;
      -webkit-mask-repeat: no-repeat !important;
      mask-repeat: no-repeat !important;
      animation: tuff-vt-circle-blur ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-circle-blur {
      0% {
        -webkit-mask-size: ${fromSize};
        mask-size: ${fromSize};
        -webkit-mask-position: ${fromPos};
        mask-position: ${fromPos};
      }
      100% {
        -webkit-mask-size: ${toSize};
        mask-size: ${toSize};
        -webkit-mask-position: ${toPos};
        mask-position: ${toPos};
      }
    }
  `
}

export function buildCircleCss(
  x: number,
  y: number,
  duration = 350,
  easing = DEFAULT_EXPO_OUT,
  reverse = false,
): string {
  const innerW = hasWindow() ? window.innerWidth : 1920
  const innerH = hasWindow() ? window.innerHeight : 1080
  const endRadius = Math.hypot(Math.max(x, innerW - x), Math.max(y, innerH - y))
  const fromClip = reverse ? `circle(${endRadius}px at ${x}px ${y}px)` : `circle(0px at ${x}px ${y}px)`
  const toClip = reverse ? `circle(0px at ${x}px ${y}px)` : `circle(${endRadius}px at ${x}px ${y}px)`

  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      animation: tuff-vt-circle ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-circle {
      0% {
        clip-path: ${fromClip};
      }
      100% {
        clip-path: ${toClip};
      }
    }
  `
}

export function buildCircleBlurTopLeftCss(
  duration = 600,
  easing = DEFAULT_EXPO_OUT,
  blurAmount = 2,
  reverse = false,
): string {
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="tuff-tl-blur"><feGaussianBlur stdDeviation="${blurAmount}"/></filter></defs><circle cx="0" cy="0" r="18" fill="white" filter="url(%23tuff-tl-blur)"/></svg>`
  const maskUrl = `url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`

  const fromSize = reverse ? '350vmax' : '0'
  const toSize = reverse ? '0' : '350vmax'

  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      -webkit-mask-image: ${maskUrl} !important;
      mask-image: ${maskUrl} !important;
      -webkit-mask-position: top left !important;
      mask-position: top left !important;
      -webkit-mask-repeat: no-repeat !important;
      mask-repeat: no-repeat !important;
      animation: tuff-vt-circle-blur-tl ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-circle-blur-tl {
      0% {
        -webkit-mask-size: ${fromSize};
        mask-size: ${fromSize};
      }
      100% {
        -webkit-mask-size: ${toSize};
        mask-size: ${toSize};
      }
    }
  `
}

export function buildPolygonCss(
  duration = 600,
  easing = DEFAULT_EXPO_OUT,
  reverse = false,
): string {
  const fromPoly = reverse
    ? 'polygon(50% -71%, -50% 71%, 50% 171%, 171% 50%)'
    : 'polygon(50% -71%, -50% 71%, -50% 71%, 50% -71%)'
  const toPoly = reverse
    ? 'polygon(50% -71%, -50% 71%, -50% 71%, 50% -71%)'
    : 'polygon(50% -71%, -50% 71%, 50% 171%, 171% 50%)'

  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      animation: tuff-vt-polygon ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-polygon {
      0% {
        clip-path: ${fromPoly};
      }
      100% {
        clip-path: ${toPoly};
      }
    }
  `
}

export function buildPolygonGradientCss(
  duration = 800,
  easing = DEFAULT_EXPO_OUT,
  reverse = false,
): string {
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="tuff-poly-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="white"/><stop offset="85%" stop-color="white"/><stop offset="100%" stop-color="white" stop-opacity="0"/></linearGradient></defs><polygon points="0,0 100,0 0,100" fill="url(%23tuff-poly-grad)"/></svg>`
  const maskUrl = `url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`

  const fromSize = reverse ? '300vmax' : '0'
  const toSize = reverse ? '0' : '300vmax'

  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      -webkit-mask-image: ${maskUrl} !important;
      mask-image: ${maskUrl} !important;
      -webkit-mask-position: top left !important;
      mask-position: top left !important;
      -webkit-mask-repeat: no-repeat !important;
      mask-repeat: no-repeat !important;
      animation: tuff-vt-polygon-grad ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-polygon-grad {
      0% {
        -webkit-mask-size: ${fromSize};
        mask-size: ${fromSize};
      }
      100% {
        -webkit-mask-size: ${toSize};
        mask-size: ${toSize};
      }
    }
  `
}

export function buildWipeCss(
  duration = 400,
  easing = DEFAULT_EXPO_OUT,
  reverse = false,
): string {
  const fromInset = reverse ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)'
  const toInset = reverse ? 'inset(0 100% 0 0)' : 'inset(0 0 0 0)'

  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      animation: tuff-vt-wipe ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-wipe {
      0% {
        clip-path: ${fromInset};
      }
      100% {
        clip-path: ${toInset};
      }
    }
  `
}

export function buildFadeCss(
  duration = 250,
  easing = 'ease',
): string {
  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: tuff-vt-fade-out ${duration}ms ${easing} both !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      animation: tuff-vt-fade-in ${duration}ms ${easing} both !important;
      z-index: 2 !important;
    }
    @keyframes tuff-vt-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes tuff-vt-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `
}

export function buildGifCss(
  maskUrl: string,
  duration = 1500,
  easing = 'cubic-bezier(0.16, 1, 0.3, 1)',
): string {
  return `
    ::view-transition-old(root),
    .dark::view-transition-old(root) {
      animation: none !important;
      z-index: 1 !important;
    }
    ::view-transition-new(root),
    .dark::view-transition-new(root) {
      z-index: 9999 !important;
      -webkit-mask-image: url('${maskUrl}') !important;
      mask-image: url('${maskUrl}') !important;
      -webkit-mask-position: center !important;
      mask-position: center !important;
      -webkit-mask-repeat: no-repeat !important;
      mask-repeat: no-repeat !important;
      animation: tuff-vt-gif ${duration}ms ${easing} both !important;
    }
    @keyframes tuff-vt-gif {
      0% {
        -webkit-mask-size: 0;
        mask-size: 0;
      }
      15% {
        -webkit-mask-size: 50vmax;
        mask-size: 50vmax;
      }
      85% {
        -webkit-mask-size: 50vmax;
        mask-size: 50vmax;
      }
      100% {
        -webkit-mask-size: 2500vmax;
        mask-size: 2500vmax;
      }
    }
  `
}

export function resolveTransitionCss(options: ThemeTransitionOptions = {}): string {
  const variant = options.variant ?? 'circle-blur'
  const [x, y] = resolveOrigin(options.origin)
  const duration = options.duration
  const easing = options.easing ?? DEFAULT_EXPO_OUT
  const blurAmount = options.blurAmount ?? 3.5
  const reverse = Boolean(options.reverse)

  switch (variant) {
    case 'circle':
      return buildCircleCss(x, y, duration ?? 350, easing, reverse)
    case 'circle-blur-top-left':
      return buildCircleBlurTopLeftCss(duration ?? 600, easing, blurAmount, reverse)
    case 'polygon':
      return buildPolygonCss(duration ?? 600, easing, reverse)
    case 'polygon-gradient':
      return buildPolygonGradientCss(duration ?? 800, easing, reverse)
    case 'wipe':
      return buildWipeCss(duration ?? 400, easing, reverse)
    case 'fade':
      return buildFadeCss(duration ?? 250, easing)
    case 'gif':
      return buildGifCss(
        options.maskUrl ?? 'https://media.tenor.com/cyORI7kwShQAAAAi/shigure-ui-dance.gif',
        duration ?? 1500,
        easing,
      )
    case 'circle-blur':
    default:
      return buildCircleBlurCss(x, y, duration ?? 450, easing, blurAmount, reverse)
  }
}

export function applyThemeTransition(
  updateTheme: () => void | Promise<void>,
  options: ThemeTransitionOptions = {},
): Promise<void> | void {
  if (!hasWindow() || !hasDocument())
    return updateTheme()

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const doc = document as Document & {
    startViewTransition?: (callback: () => void | Promise<void>) => {
      ready: Promise<void>
      finished: Promise<void>
    }
  }

  if (prefersReducedMotion || typeof doc.startViewTransition !== 'function')
    return updateTheme()

  const css = resolveTransitionCss(options)

  const cleanup = () => {
    const existing = document.getElementById(THEME_VIEW_TRANSITION_STYLE_ID)
    if (existing?.parentNode)
      existing.remove()
  }

  cleanup()

  const style = document.createElement('style')
  style.id = THEME_VIEW_TRANSITION_STYLE_ID
  style.textContent = css
  document.head.appendChild(style)

  try {
    const transition = doc.startViewTransition(updateTheme)
    transition.finished.finally(cleanup)
    return transition.finished
  }
  catch {
    cleanup()
    return updateTheme()
  }
}

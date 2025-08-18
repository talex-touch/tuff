/**
 * Interface for renderer initialization information
 * @interface IInitializationInfo
 */
export interface IInitializationInfo {
  /** Timestamp when the renderer process was initialized */
  initTimestamp: number
  /** ISO string of initialization time */
  initTime: string
  /** User agent string */
  userAgent: string
  /** Current URL of the renderer */
  currentUrl: string
  /** Operating system platform */
  platform: NodeJS.Platform
  /** Screen resolution information */
  screenResolution: {
    width: number
    height: number
    pixelRatio: number
  }
  /** Window size information */
  windowSize: {
    innerWidth: number
    innerHeight: number
    outerWidth: number
    outerHeight: number
  }
  /** Performance timing information */
  performance: {
    navigationStart: number
    loadEventEnd?: number
    domContentLoadedEventEnd?: number
  }
  /** Browser/renderer capabilities */
  capabilities: {
    webgl: boolean
    webgl2: boolean
    webAudio: boolean
    serviceWorker: boolean
  }
}

declare global {
  export interface Window {
    /** Global initialization information cache */
    $initInfo: IInitializationInfo
  }
}

/**
 * Checks WebGL support
 * @returns True if WebGL is supported
 */
function checkWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

/**
 * Checks WebGL2 support
 * @returns True if WebGL2 is supported
 */
function checkWebGL2Support(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!canvas.getContext('webgl2')
  } catch {
    return false
  }
}

/**
 * Checks Web Audio API support
 * @returns True if Web Audio API is supported
 */
function checkWebAudioSupport(): boolean {
  return 'AudioContext' in window || 'webkitAudioContext' in window
}

/**
 * Checks Service Worker support
 * @returns True if Service Worker is supported
 */
function checkServiceWorkerSupport(): boolean {
  return 'serviceWorker' in navigator
}

/**
 * Initializes renderer process with system and performance information
 * @returns Initialization information object
 */
export function useInitialize(): IInitializationInfo {
  if (window.$initInfo) {
    return window.$initInfo
  }

  const now = Date.now()
  const initInfo: IInitializationInfo = {
    initTimestamp: now,
    initTime: new Date(now).toISOString(),
    userAgent: navigator.userAgent,
    currentUrl: window.location.href,
    platform: process.platform,
    screenResolution: {
      width: screen.width,
      height: screen.height,
      pixelRatio: window.devicePixelRatio || 1
    },
    windowSize: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight
    },
    performance: {
      navigationStart: performance.timeOrigin || now,
      loadEventEnd: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.loadEventEnd || undefined,
      domContentLoadedEventEnd: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.domContentLoadedEventEnd || undefined
    },
    capabilities: {
      webgl: checkWebGLSupport(),
      webgl2: checkWebGL2Support(),
      webAudio: checkWebAudioSupport(),
      serviceWorker: checkServiceWorkerSupport()
    }
  }

  return window.$initInfo = initInfo
}

/**
 * Gets the initialization timestamp
 * @returns Timestamp when the renderer was initialized
 */
export function getInitTimestamp(): number {
  return useInitialize().initTimestamp
}

/**
 * Gets the initialization time as ISO string
 * @returns ISO string of initialization time
 */
export function getInitTime(): string {
  return useInitialize().initTime
}

/**
 * Gets the time elapsed since initialization in milliseconds
 * @returns Time elapsed since initialization
 */
export function getTimeElapsed(): number {
  return Date.now() - getInitTimestamp()
}

/**
 * Gets screen resolution information
 * @returns Screen resolution object
 */
export function getScreenInfo() {
  return useInitialize().screenResolution
}

/**
 * Gets window size information
 * @returns Window size object
 */
export function getWindowInfo() {
  return useInitialize().windowSize
}

/**
 * Gets renderer capabilities
 * @returns Capabilities object
 */
export function getCapabilities() {
  return useInitialize().capabilities
}

/**
 * Refreshes performance timing information
 * @returns Updated initialization info
 */
export function refreshPerformanceInfo(): IInitializationInfo {
  if (window.$initInfo) {
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    window.$initInfo.performance = {
      navigationStart: performance.timeOrigin || window.$initInfo.performance.navigationStart,
      loadEventEnd: navigationEntry?.loadEventEnd || undefined,
      domContentLoadedEventEnd: navigationEntry?.domContentLoadedEventEnd || undefined
    }
  }
  return window.$initInfo
}

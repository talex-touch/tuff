/**
 * Renderer Process Performance Monitoring
 *
 * Collects detailed performance metrics in the renderer process
 */

/**
 * Renderer performance metrics
 */
export interface RendererPerformanceMetrics {
  /** Performance timing origin */
  timeOrigin: number
  /** Navigation start time */
  navigationStart: number
  /** DOM content loaded event end */
  domContentLoadedEventEnd?: number
  /** Load event end */
  loadEventEnd?: number
  /** DOM interactive time */
  domInteractive?: number
  /** First paint time */
  firstPaint?: number
  /** First contentful paint time */
  firstContentfulPaint?: number
}

/**
 * Get current renderer performance metrics
 */
export function getRendererPerformanceMetrics(): RendererPerformanceMetrics {
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  const paintEntries = performance.getEntriesByType('paint')

  const firstPaint = paintEntries.find(e => e.name === 'first-paint')
  const firstContentfulPaint = paintEntries.find(e => e.name === 'first-contentful-paint')

  return {
    timeOrigin: performance.timeOrigin,
    navigationStart: performance.timeOrigin,
    domContentLoadedEventEnd: navEntry?.domContentLoadedEventEnd,
    loadEventEnd: navEntry?.loadEventEnd,
    domInteractive: navEntry?.domInteractive,
    firstPaint: firstPaint?.startTime,
    firstContentfulPaint: firstContentfulPaint?.startTime
  }
}

/**
 * Wait for page load and collect metrics
 */
export function collectPerformanceMetricsOnLoad(): Promise<RendererPerformanceMetrics> {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      // Page already loaded
      setTimeout(() => {
        resolve(getRendererPerformanceMetrics())
      }, 0)
    } else {
      // Wait for load event
      window.addEventListener('load', () => {
        setTimeout(() => {
          resolve(getRendererPerformanceMetrics())
        }, 0)
      }, { once: true })
    }
  })
}

/**
 * Get performance summary for display
 */
export function getPerformanceSummary(): {
  domReady: number
  pageLoad: number
  firstPaint: number | undefined
  firstContentfulPaint: number | undefined
} {
  const metrics = getRendererPerformanceMetrics()

  return {
    domReady: metrics.domContentLoadedEventEnd || 0,
    pageLoad: metrics.loadEventEnd || 0,
    firstPaint: metrics.firstPaint,
    firstContentfulPaint: metrics.firstContentfulPaint
  }
}


export const IPC_WARN_MS = 200
export const IPC_ERROR_MS = 1_000
export const MAIN_WARN_MS = 200
export const MAIN_ERROR_MS = 1_000

const UI_DEFAULT_WARN_MS = 250
const UI_DEFAULT_ERROR_MS = 1_500

export function resolveUiThreshold(kind: string): { warn: number; error: number } {
  switch (kind) {
    case 'ui.component.load':
      return { warn: 150, error: 1_000 }
    case 'ui.route.navigate':
      return { warn: 200, error: 1_000 }
    case 'ui.route.transition':
      return { warn: 300, error: 1_200 }
    case 'ui.route.render':
      return { warn: 350, error: 1_500 }
    case 'ui.details.fetch':
      return { warn: 500, error: 2_000 }
    case 'ui.details.render':
      return { warn: 200, error: 1_200 }
    case 'ui.details.total':
      return { warn: 700, error: 2_000 }
    default:
      return { warn: UI_DEFAULT_WARN_MS, error: UI_DEFAULT_ERROR_MS }
  }
}

export const LOOP_LAG_WARN_MS = 200
export const LOOP_LAG_ERROR_MS = 2_000
/** Lags above this threshold are almost certainly caused by system sleep/suspend, not real event loop blocking. */
export const SYSTEM_SLEEP_THRESHOLD_MS = 30_000

export const SEVERE_LAG_BURST_THRESHOLD_MS = 2_000
export const SEVERE_LAG_BURST_WINDOW_MS = 30_000
export const SEVERE_LAG_BURST_TRIGGER_COUNT = 2
export const SEVERE_LAG_BURST_COOLDOWN_MS = 120_000

export const SUMMARY_INTERVAL_MS = 60_000
export const MAX_INCIDENTS = 80

export const IPC_LOG_THROTTLE_MS = 5_000
export const RENDERER_LOG_THROTTLE_MS = 5_000
export const LOOP_LOG_THROTTLE_MS = 3_000
export const LOOP_SLEEP_SKIP_LOG_THROTTLE_MS = 60_000
export const LOOP_DIAGNOSTIC_WARN_THROTTLE_MS = 120_000
export const LOOP_DIAGNOSTIC_ERROR_THROTTLE_MS = 30_000

export const PERF_SUMMARY_LOG_SLOW_MS = 2_000
export const PERF_SUMMARY_TOP_SLOW_MIN_MS = 500
export const PERF_SUMMARY_LOG_TOP_LIMIT = 3

export type RendererPerfReportKind =
  | 'channel.sendSync.slow'
  | 'channel.send.slow'
  | 'channel.send.timeout'
  | 'channel.send.errorReply'
  | 'ui.route.navigate'
  | 'ui.route.render'
  | 'ui.route.transition'
  | 'ui.details.fetch'
  | 'ui.details.render'
  | 'ui.details.total'
  | 'ui.component.load'

export type RendererPerfReport = {
  kind: RendererPerfReportKind
  eventName: string
  durationMs: number
  at: number
  payloadPreview?: string
  stack?: string
  meta?: Record<string, unknown>
}

export const PERF_REPORT_CHANNEL = 'touch:perf-report'

export function reportPerfToMain(report: RendererPerfReport): void {
  try {
    window.electron.ipcRenderer.send(PERF_REPORT_CHANNEL, report)
  }
  catch {
    // ignore perf reporting failures
  }
}

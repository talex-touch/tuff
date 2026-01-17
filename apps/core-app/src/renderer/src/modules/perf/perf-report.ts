import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'

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

export function reportPerfToMain(report: RendererPerfReport): void {
  try {
    const transport = useTuffTransport()
    void transport.send(AppEvents.analytics.perfReport, report as any).catch(() => {})
  }
  catch {
    // ignore perf reporting failures
  }
}

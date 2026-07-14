import type { AppPreviewChannel } from '@talex-touch/utils'

/** Metadata emitted for updater telemetry events. */
export interface UpdateTelemetryMeta {
  channel?: AppPreviewChannel
  source?: string
  tag?: string | null
  taskId?: string | null
  itemKind?: 'manual' | 'auto'
}
